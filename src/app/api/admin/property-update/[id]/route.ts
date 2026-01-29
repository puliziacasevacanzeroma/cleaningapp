import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { doc, getDoc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) return JSON.parse(decodeURIComponent(userCookie.value));
    return null;
  } catch { return null; }
}

// PUT - Admin aggiorna maxGuests con auto-generazione config
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getFirebaseUser();
    if (!user || user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { maxGuests, beds, bedConfiguration } = body;

    // Recupera proprietà
    const propertyRef = doc(db, "properties", id);
    const propertySnap = await getDoc(propertyRef);
    
    if (!propertySnap.exists()) {
      return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    }

    const propertyData = propertySnap.data();
    const updateData: any = { updatedAt: Timestamp.now() };
    const changes: string[] = [];

    // Gestione modifica maxGuests
    if (maxGuests !== undefined && maxGuests !== propertyData.maxGuests) {
      const newMaxGuests = parseInt(maxGuests);
      const oldMaxGuests = propertyData.maxGuests || 1;
      
      updateData.maxGuests = newMaxGuests;
      changes.push(`maxGuests: ${oldMaxGuests} → ${newMaxGuests}`);

      // Auto-genera config mancanti se aumentato
      if (newMaxGuests > oldMaxGuests && propertyData.serviceConfigs) {
        const existingConfigs = { ...propertyData.serviceConfigs };
        
        // Trova la config base (quella con più ospiti esistente)
        let baseConfig = null;
        for (let i = oldMaxGuests; i >= 1; i--) {
          if (existingConfigs[String(i)]) {
            baseConfig = existingConfigs[String(i)];
            break;
          }
        }

        if (baseConfig) {
          // Genera config per i nuovi ospiti
          for (let guests = oldMaxGuests + 1; guests <= newMaxGuests; guests++) {
            if (!existingConfigs[String(guests)]) {
              // Copia dalla config base e aggiorna quantità bagno
              const newConfig = JSON.parse(JSON.stringify(baseConfig));
              
              // Aggiorna quantità asciugamani in base al numero di ospiti
              if (newConfig.items) {
                newConfig.items = newConfig.items.map((item: any) => {
                  // Per articoli bagno, moltiplica per numero ospiti
                  if (item.categoryId === 'biancheria_bagno') {
                    const baseQty = item.quantity / (guests - 1) || 1;
                    return { ...item, quantity: Math.ceil(baseQty * guests) };
                  }
                  return item;
                });
              }
              
              existingConfigs[String(guests)] = newConfig;
              console.log(`🔧 Auto-generata config per ${guests} ospiti`);
            }
          }
          updateData.serviceConfigs = existingConfigs;
          changes.push(`Auto-generate config per ${oldMaxGuests + 1}-${newMaxGuests} ospiti`);
        }
      }

      // Se diminuito, rimuovi config in eccesso (opzionale - per ora le manteniamo)
      // Nota: non eliminiamo le config esistenti per sicurezza
    }

    // Gestione modifica letti
    if (beds !== undefined) {
      updateData.beds = beds;
      changes.push(`Aggiornati ${beds.length} letti`);

      // Ricalcola capacità totale
      const totalCapacity = beds.reduce((sum: number, bed: any) => {
        return sum + (bed.cap || bed.capacity || 1);
      }, 0);
      
      changes.push(`Capacità totale: ${totalCapacity} posti`);
    }

    // Gestione modifica bedConfiguration
    if (bedConfiguration !== undefined) {
      updateData.bedConfiguration = bedConfiguration;
      changes.push(`Aggiornata configurazione stanze`);
    }

    await updateDoc(propertyRef, updateData);

    return NextResponse.json({ 
      success: true, 
      message: "Proprietà aggiornata",
      changes
    });
  } catch (error: any) {
    console.error("Errore PUT admin property update:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET - Verifica impatto modifica maxGuests
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getFirebaseUser();
    if (!user || user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const newMaxGuests = parseInt(searchParams.get("newMaxGuests") || "0");

    // Recupera proprietà
    const propertyRef = doc(db, "properties", id);
    const propertySnap = await getDoc(propertyRef);
    
    if (!propertySnap.exists()) {
      return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    }

    const propertyData = propertySnap.data();
    const currentMaxGuests = propertyData.maxGuests || 1;

    // Calcola capacità letti
    let bedCapacity = 0;
    if (propertyData.beds) {
      bedCapacity = propertyData.beds.reduce((sum: number, bed: any) => {
        return sum + (bed.cap || bed.capacity || 1);
      }, 0);
    }

    // Verifica config esistenti
    const existingConfigGuests = propertyData.serviceConfigs 
      ? Object.keys(propertyData.serviceConfigs).map(Number).sort((a, b) => a - b)
      : [];

    const impact = {
      currentMaxGuests,
      newMaxGuests,
      bedCapacity,
      existingConfigGuests,
      warnings: [] as string[],
      willGenerate: [] as number[],
      willRemove: [] as number[],
    };

    if (newMaxGuests > 0) {
      // Warning se capacità letti insufficiente
      if (newMaxGuests > bedCapacity) {
        impact.warnings.push(`Attenzione: la capacità dei letti (${bedCapacity}) è inferiore al nuovo numero di ospiti (${newMaxGuests})`);
      }

      // Config da generare
      for (let i = currentMaxGuests + 1; i <= newMaxGuests; i++) {
        if (!existingConfigGuests.includes(i)) {
          impact.willGenerate.push(i);
        }
      }

      // Config che rimarranno inutilizzate (non le eliminiamo)
      for (const g of existingConfigGuests) {
        if (g > newMaxGuests) {
          impact.willRemove.push(g);
        }
      }

      if (impact.willRemove.length > 0) {
        impact.warnings.push(`Le configurazioni per ${impact.willRemove.join(", ")} ospiti non verranno eliminate ma non saranno più utilizzate`);
      }
    }

    return NextResponse.json(impact);
  } catch (error: any) {
    console.error("Errore GET impact check:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
