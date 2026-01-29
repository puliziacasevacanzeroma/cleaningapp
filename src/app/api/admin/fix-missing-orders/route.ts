import { NextResponse } from "next/server";
import { collection, getDocs, doc, addDoc, query, where, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

/**
 * 🔧 API FIX: Crea ordini biancheria mancanti
 * 
 * Per ogni pulizia di una proprietà che NON usa biancheria propria,
 * verifica se esiste un ordine collegato. Se non esiste, lo crea.
 * 
 * Parametri:
 * - daysBack: quanti giorni indietro controllare (default: 7)
 * - dryRun: se true, mostra solo cosa farebbe senza modificare (default: false)
 */

// Funzione per calcolare la biancheria di fallback
function calculateFallbackLinen(guestsCount: number, bedrooms: number, bathrooms: number): { id: string; name: string; quantity: number }[] {
  const items: { id: string; name: string; quantity: number }[] = [];
  
  const matrimonialiNeeded = Math.min(bedrooms, Math.ceil(guestsCount / 2));
  const postiMatrimoniali = matrimonialiNeeded * 2;
  const singolariNeeded = Math.max(0, guestsCount - postiMatrimoniali);
  
  // Calcolo lenzuola
  let totalLenzMatr = matrimonialiNeeded * 3; // 3 lenzuola per matrimoniale
  let totalLenzSing = singolariNeeded * 3; // 3 lenzuola per singolo
  let totalFedere = (matrimonialiNeeded * 2) + (singolariNeeded * 1); // 2 federe matr, 1 sing
  
  if (totalLenzMatr > 0) {
    items.push({ id: 'lenzuola_matrimoniale', name: 'Lenzuola Matrimoniale', quantity: totalLenzMatr });
  }
  if (totalLenzSing > 0) {
    items.push({ id: 'lenzuola_singolo', name: 'Lenzuola Singolo', quantity: totalLenzSing });
  }
  if (totalFedere > 0) {
    items.push({ id: 'federa', name: 'Federa', quantity: totalFedere });
  }
  
  // Biancheria bagno
  items.push({ id: 'telo_doccia', name: 'Telo Doccia', quantity: guestsCount });
  items.push({ id: 'asciugamano_viso', name: 'Asciugamano Viso', quantity: guestsCount });
  items.push({ id: 'asciugamano_ospite', name: 'Asciugamano Ospite/Bidet', quantity: guestsCount });
  
  if (bathrooms > 0) {
    items.push({ id: 'tappetino_bagno', name: 'Tappetino Bagno', quantity: bathrooms });
  }
  
  return items;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const daysBack = parseInt(searchParams.get('daysBack') || '7');
  const dryRun = searchParams.get('dryRun') === 'true';
  
  return handleFix(daysBack, dryRun);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const daysBack = body.daysBack || 7;
  const dryRun = body.dryRun || false;
  
  return handleFix(daysBack, dryRun);
}

async function handleFix(daysBack: number, dryRun: boolean) {
  try {
    console.log("\n" + "=".repeat(60));
    console.log(`🔧 FIX: Ordini biancheria mancanti (ultimi ${daysBack} giorni)`);
    console.log(`   Mode: ${dryRun ? 'DRY RUN (simulazione)' : 'ESECUZIONE REALE'}`);
    console.log("=".repeat(60) + "\n");

    // Calcola range date
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - daysBack);
    startDate.setHours(0, 0, 0, 0);

    // 1. Carica tutte le proprietà
    const propertiesSnap = await getDocs(
      query(collection(db, "properties"), where("status", "==", "ACTIVE"))
    );
    const propertiesMap = new Map<string, any>();
    const propertiesWithOwnLinen = new Set<string>();
    
    propertiesSnap.docs.forEach(doc => {
      const data = { id: doc.id, ...doc.data() };
      propertiesMap.set(doc.id, data);
      if (data.usesOwnLinen) {
        propertiesWithOwnLinen.add(doc.id);
      }
    });
    
    console.log(`📋 Proprietà attive: ${propertiesMap.size}`);
    console.log(`🏠 Proprietà con biancheria propria: ${propertiesWithOwnLinen.size}`);

    // 2. Carica pulizie nel range
    const cleaningsSnap = await getDocs(collection(db, "cleanings"));
    const cleaningsInRange: any[] = [];
    
    cleaningsSnap.docs.forEach(doc => {
      const data = { id: doc.id, ...doc.data() };
      const scheduledDate = data.scheduledDate?.toDate?.();
      
      if (scheduledDate && scheduledDate >= startDate && scheduledDate <= today) {
        // Escludi proprietà con biancheria propria
        if (!propertiesWithOwnLinen.has(data.propertyId)) {
          cleaningsInRange.push(data);
        }
      }
    });
    
    console.log(`🧹 Pulizie nel range (escluse biancheria propria): ${cleaningsInRange.length}`);

    // 3. Carica tutti gli ordini
    const ordersSnap = await getDocs(collection(db, "orders"));
    const ordersByCleaningId = new Map<string, any>();
    const ordersByPropertyDate = new Map<string, any>();
    
    ordersSnap.docs.forEach(doc => {
      const data = { id: doc.id, ...doc.data() };
      
      if (data.cleaningId) {
        ordersByCleaningId.set(data.cleaningId, data);
      }
      
      const scheduledDate = data.scheduledDate?.toDate?.();
      if (scheduledDate && data.propertyId) {
        const dateStr = scheduledDate.toISOString().split("T")[0];
        const key = `${data.propertyId}-${dateStr}`;
        ordersByPropertyDate.set(key, data);
      }
    });
    
    console.log(`📦 Ordini totali: ${ordersSnap.size}`);

    // 4. Trova pulizie senza ordini
    const cleaningsMissingOrders: any[] = [];
    
    for (const cleaning of cleaningsInRange) {
      const property = propertiesMap.get(cleaning.propertyId);
      if (!property) continue;
      
      const scheduledDate = cleaning.scheduledDate?.toDate?.();
      if (!scheduledDate) continue;
      
      const dateStr = scheduledDate.toISOString().split("T")[0];
      const key = `${cleaning.propertyId}-${dateStr}`;
      
      // Verifica se esiste ordine collegato
      const hasLinkedOrder = ordersByCleaningId.has(cleaning.id);
      const hasOrderSameDay = ordersByPropertyDate.has(key);
      
      if (!hasLinkedOrder && !hasOrderSameDay) {
        cleaningsMissingOrders.push({
          ...cleaning,
          property,
          scheduledDateStr: dateStr,
        });
      }
    }
    
    console.log(`⚠️ Pulizie senza ordini: ${cleaningsMissingOrders.length}`);

    // 5. Crea ordini mancanti
    let created = 0;
    let errors = 0;
    const createdDetails: any[] = [];
    const errorDetails: any[] = [];

    for (const item of cleaningsMissingOrders) {
      try {
        const property = item.property;
        const guestsCount = item.guestsCount || property.maxGuests || 2;
        const bedrooms = property.bedrooms || 1;
        const bathrooms = property.bathrooms || 1;
        
        // Calcola biancheria
        let linenItems: { id: string; name: string; quantity: number }[] = [];
        
        // Prova prima con serviceConfigs
        if (property.serviceConfigs && property.serviceConfigs[guestsCount]) {
          const config = property.serviceConfigs[guestsCount];
          
          if (config.bl) {
            Object.entries(config.bl).forEach(([bedId, items]: [string, any]) => {
              if (typeof items === 'object') {
                Object.entries(items).forEach(([itemId, qty]: [string, any]) => {
                  if (typeof qty === 'number' && qty > 0) {
                    const existing = linenItems.find(i => i.id === itemId);
                    if (existing) {
                      existing.quantity += qty;
                    } else {
                      linenItems.push({ id: itemId, name: itemId, quantity: qty });
                    }
                  }
                });
              }
            });
          }
          
          if (config.ba) {
            Object.entries(config.ba).forEach(([itemId, qty]: [string, any]) => {
              if (typeof qty === 'number' && qty > 0) {
                linenItems.push({ id: itemId, name: itemId, quantity: qty });
              }
            });
          }
          
          if (config.ki) {
            Object.entries(config.ki).forEach(([itemId, qty]: [string, any]) => {
              if (typeof qty === 'number' && qty > 0) {
                linenItems.push({ id: itemId, name: itemId, quantity: qty });
              }
            });
          }
        }
        
        // Fallback
        if (linenItems.length === 0) {
          linenItems = calculateFallbackLinen(guestsCount, bedrooms, bathrooms);
        }
        
        if (linenItems.length === 0) {
          console.log(`⏭️ Skip ${property.name}: nessun articolo biancheria calcolato`);
          continue;
        }

        const orderData = {
          cleaningId: item.id,
          propertyId: property.id,
          propertyName: property.name,
          propertyAddress: property.address || '',
          propertyCity: property.city || '',
          propertyPostalCode: property.postalCode || '',
          propertyFloor: property.floor || '',
          propertyApartment: property.apartment || '',
          propertyIntercom: property.intercom || '',
          propertyDoorCode: property.doorCode || '',
          propertyKeysLocation: property.keysLocation || '',
          propertyAccessNotes: property.accessNotes || '',
          status: 'PENDING',
          type: 'LINEN',
          scheduledDate: item.scheduledDate,
          scheduledTime: item.scheduledTime || property.checkOutTime || '10:00',
          urgency: 'normal',
          items: linenItems,
          includePickup: true,
          pickupItems: [],
          pickupFromOrders: [],
          pickupCompleted: false,
          notes: 'Creato automaticamente da fix ordini mancanti',
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        };

        if (dryRun) {
          createdDetails.push({
            cleaningId: item.id,
            propertyName: property.name,
            date: item.scheduledDateStr,
            itemsCount: linenItems.length,
            status: 'DRY RUN - non creato',
          });
          created++;
        } else {
          const orderRef = await addDoc(collection(db, 'orders'), orderData);
          
          createdDetails.push({
            orderId: orderRef.id,
            cleaningId: item.id,
            propertyName: property.name,
            date: item.scheduledDateStr,
            itemsCount: linenItems.length,
          });
          created++;
          
          console.log(`✅ Ordine creato: ${property.name} (${item.scheduledDateStr}) - ${linenItems.length} articoli`);
        }
        
      } catch (e: any) {
        console.error(`❌ Errore creazione ordine per pulizia ${item.id}:`, e);
        errorDetails.push({
          cleaningId: item.id,
          propertyName: item.property?.name || 'N/A',
          error: e.message,
        });
        errors++;
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log(`✅ FIX COMPLETATO${dryRun ? ' (DRY RUN)' : ''}: ${created} ordini ${dryRun ? 'da creare' : 'creati'}, ${errors} errori`);
    console.log("=".repeat(60) + "\n");

    return NextResponse.json({
      success: true,
      dryRun,
      summary: {
        daysBack,
        cleaningsAnalyzed: cleaningsInRange.length,
        missingOrders: cleaningsMissingOrders.length,
        created,
        errors,
      },
      createdDetails: createdDetails.slice(0, 100),
      errorDetails,
    });

  } catch (error: any) {
    console.error("❌ Errore fix ordini mancanti:", error);
    return NextResponse.json({
      success: false,
      error: error.message || "Errore sconosciuto",
    }, { status: 500 });
  }
}
