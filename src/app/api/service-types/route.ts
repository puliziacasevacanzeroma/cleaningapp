import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { 
  collection, 
  getDocs, 
  addDoc, 
  Timestamp 
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { DEFAULT_SERVICE_TYPES } from "~/types/serviceType";

export const dynamic = 'force-dynamic';

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) return JSON.parse(decodeURIComponent(userCookie.value));
    return null;
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════
// GET - Lista tipi servizio
// ═══════════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  try {
    const user = await getFirebaseUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    
    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get("activeOnly") === "true";
    const forManual = searchParams.get("forManual") === "true";
    const forAuto = searchParams.get("forAuto") === "true";
    
    const snapshot = await getDocs(collection(db, "serviceTypes"));
    
    let serviceTypes = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Filtri
    if (activeOnly) {
      serviceTypes = serviceTypes.filter((st: any) => st.isActive);
    }
    if (forManual) {
      serviceTypes = serviceTypes.filter((st: any) => st.availableForManual);
    }
    if (forAuto) {
      serviceTypes = serviceTypes.filter((st: any) => st.availableForAuto);
    }
    
    // Ordina per sortOrder
    serviceTypes.sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0));
    
    return NextResponse.json({ serviceTypes });
  } catch (error) {
    console.error("Errore GET service-types:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════
// POST - Crea tipo servizio (solo admin)
// ═══════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  try {
    const user = await getFirebaseUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Solo admin può creare tipi servizio" }, { status: 403 });
    }
    
    const body = await req.json();
    const {
      name,
      description,
      code,
      basePrice,
      pricePerRoom,
      pricePerBathroom,
      pricePerGuest,
      minPrice,
      maxPrice,
      estimatedDuration,
      durationPerRoom,
      durationPerBathroom,
      minPhotosRequired,
      requiresRating,
      sortOrder,
      icon,
      color,
      availableForManual,
      availableForAuto,
    } = body;
    
    // Validazione
    if (!name || !code || basePrice === undefined || !estimatedDuration) {
      return NextResponse.json({ 
        error: "Nome, codice, prezzo base e durata stimata sono obbligatori" 
      }, { status: 400 });
    }
    
    // Verifica codice unico
    const existingSnapshot = await getDocs(collection(db, "serviceTypes"));
    const existingCodes = existingSnapshot.docs.map(doc => doc.data().code);
    
    if (existingCodes.includes(code.toUpperCase())) {
      return NextResponse.json({ 
        error: `Il codice "${code}" esiste già` 
      }, { status: 400 });
    }
    
    const now = Timestamp.now();
    
    const docRef = await addDoc(collection(db, "serviceTypes"), {
      name,
      description: description || "",
      code: code.toUpperCase(),
      basePrice: parseFloat(basePrice),
      pricePerRoom: pricePerRoom ? parseFloat(pricePerRoom) : null,
      pricePerBathroom: pricePerBathroom ? parseFloat(pricePerBathroom) : null,
      pricePerGuest: pricePerGuest ? parseFloat(pricePerGuest) : null,
      minPrice: minPrice ? parseFloat(minPrice) : null,
      maxPrice: maxPrice ? parseFloat(maxPrice) : null,
      estimatedDuration: parseInt(estimatedDuration),
      durationPerRoom: durationPerRoom ? parseInt(durationPerRoom) : null,
      durationPerBathroom: durationPerBathroom ? parseInt(durationPerBathroom) : null,
      minPhotosRequired: minPhotosRequired ?? 10,
      requiresRating: requiresRating ?? true,
      sortOrder: sortOrder ?? 99,
      icon: icon || "🧹",
      color: color || "#3B82F6",
      availableForManual: availableForManual ?? true,
      availableForAuto: availableForAuto ?? false,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: user.id,
    });
    
    console.log(`✅ Tipo servizio creato: ${docRef.id} (${name})`);
    
    return NextResponse.json({ 
      success: true,
      id: docRef.id,
      message: `Tipo servizio "${name}" creato`
    });
  } catch (error) {
    console.error("Errore POST service-types:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════
// SEED - Popola con tipi predefiniti (chiamare una volta)
// ═══════════════════════════════════════════════════════════════

export async function PUT(req: NextRequest) {
  try {
    const user = await getFirebaseUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    
    // Verifica se già popolato
    const existingSnapshot = await getDocs(collection(db, "serviceTypes"));
    if (existingSnapshot.docs.length > 0) {
      return NextResponse.json({ 
        error: "Tipi servizio già presenti. Usa DELETE per resettare.",
        existing: existingSnapshot.docs.length
      }, { status: 400 });
    }
    
    const now = Timestamp.now();
    const created: string[] = [];
    
    for (const serviceType of DEFAULT_SERVICE_TYPES) {
      const docRef = await addDoc(collection(db, "serviceTypes"), {
        ...serviceType,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        createdBy: user.id,
      });
      
      created.push(serviceType.name);
    }
    
    console.log(`✅ Seed completato: ${created.length} tipi servizio creati`);
    
    return NextResponse.json({ 
      success: true,
      created: created.length,
      serviceTypes: created,
      message: `${created.length} tipi servizio predefiniti creati`
    });
  } catch (error) {
    console.error("Errore PUT service-types (seed):", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
