import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { 
  collection, 
  getDocs, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  startAfter,
  getDoc,
  doc,
  Timestamp,
  QueryConstraint
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { calculateCleaningPrice } from "~/lib/pricing/calculateCleaningPrice";
import { ServiceType } from "~/types/serviceType";
import { Holiday } from "~/types/holiday";

export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════
// HELPER: Ottieni utente da cookie
// ═══════════════════════════════════════════════════════════════

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) {
      return JSON.parse(decodeURIComponent(userCookie.value));
    }
    return null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Ottieni proprietà di un proprietario
// ═══════════════════════════════════════════════════════════════

async function getOwnerPropertyIds(ownerId: string): Promise<string[]> {
  const propertiesQuery = query(
    collection(db, "properties"),
    where("ownerId", "==", ownerId)
  );
  const snapshot = await getDocs(propertiesQuery);
  return snapshot.docs.map(doc => doc.id);
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Carica dati aggiuntivi
// ═══════════════════════════════════════════════════════════════

async function loadHolidays(): Promise<Holiday[]> {
  const holidaysQuery = query(
    collection(db, "holidays"),
    where("isActive", "==", true)
  );
  const snapshot = await getDocs(holidaysQuery);
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      date: data.date || null,
    } as Holiday;
  });
}

async function loadProperties(): Promise<Map<string, any>> {
  const snapshot = await getDocs(collection(db, "properties"));
  const map = new Map();
  snapshot.docs.forEach(doc => {
    map.set(doc.id, { id: doc.id, ...doc.data() });
  });
  return map;
}

// ═══════════════════════════════════════════════════════════════
// GET - Lista pulizie con filtri, permessi e paginazione
// ═══════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const user = await getFirebaseUser();
    
    if (!user) {
      console.log("❌ Cleanings API: Utente non autenticato");
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    
    // Parametri filtri
    const propertyId = searchParams.get("propertyId");
    const operatorId = searchParams.get("operatorId");
    const status = searchParams.get("status");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const date = searchParams.get("date"); // Data singola (retrocompatibilità)
    
    // Paginazione
    const pageSize = parseInt(searchParams.get("pageSize") || "50");
    const lastDocId = searchParams.get("lastDocId");
    
    console.log("🔍 Cleanings API - Filtri:", { 
      propertyId, operatorId, status, dateFrom, dateTo, date, 
      userRole: user.role, userId: user.id 
    });

    // ─── COSTRUISCI QUERY BASE ───
    const constraints: QueryConstraint[] = [];
    
    // Filtro status
    if (status) {
      constraints.push(where("status", "==", status.toUpperCase()));
    }
    
    // Filtro propertyId
    if (propertyId) {
      constraints.push(where("propertyId", "==", propertyId));
    }
    
    // Filtro operatorId
    if (operatorId) {
      constraints.push(where("operatorId", "==", operatorId));
    }
    
    // ─── FILTRI PER RUOLO ───
    let allowedPropertyIds: string[] | null = null;
    
    if (user.role === "PROPRIETARIO") {
      // Proprietario vede solo pulizie delle sue proprietà
      allowedPropertyIds = await getOwnerPropertyIds(user.id);
      
      if (allowedPropertyIds.length === 0) {
        return NextResponse.json({ 
          cleanings: [], 
          total: 0,
          hasMore: false,
          message: "Nessuna proprietà associata" 
        });
      }
      
      // Se non è già specificato un propertyId, filtra per tutte le sue proprietà
      if (!propertyId) {
        // Firestore limita "in" a 10 elementi, gestiamo post-query se > 10
        if (allowedPropertyIds.length <= 10) {
          constraints.push(where("propertyId", "in", allowedPropertyIds));
        }
      } else if (!allowedPropertyIds.includes(propertyId)) {
        return NextResponse.json({ error: "Proprietà non autorizzata" }, { status: 403 });
      }
    } else if (user.role === "OPERATORE_PULIZIE") {
      // Operatore vede solo pulizie assegnate a lui
      constraints.push(where("operatorId", "==", user.id));
    }
    // ADMIN vede tutto - nessun filtro aggiuntivo
    
    // Ordina per scheduledDate
    constraints.push(orderBy("scheduledDate", "desc"));
    
    // Paginazione
    constraints.push(limit(pageSize + 1)); // +1 per verificare se ci sono altre pagine
    
    // Cursor per paginazione
    if (lastDocId) {
      const lastDocSnap = await getDoc(doc(db, "cleanings", lastDocId));
      if (lastDocSnap.exists()) {
        constraints.push(startAfter(lastDocSnap));
      }
    }
    
    // Esegui query
    const cleaningsQuery = query(collection(db, "cleanings"), ...constraints);
    const snapshot = await getDocs(cleaningsQuery);
    
    let cleanings = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // ─── FILTRI POST-QUERY (per date range) ───
    // Firestore non supporta range su campi diversi, quindi filtriamo qui
    
    if (date) {
      const filterDate = new Date(date);
      filterDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(filterDate);
      nextDay.setDate(nextDay.getDate() + 1);
      
      cleanings = cleanings.filter((c: any) => {
        const cleaningDate = c.scheduledDate?.toDate?.() || new Date(c.scheduledDate);
        return cleaningDate >= filterDate && cleaningDate < nextDay;
      });
    }
    
    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      
      cleanings = cleanings.filter((c: any) => {
        const cleaningDate = c.scheduledDate?.toDate?.() || new Date(c.scheduledDate);
        return cleaningDate >= fromDate;
      });
    }
    
    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      
      cleanings = cleanings.filter((c: any) => {
        const cleaningDate = c.scheduledDate?.toDate?.() || new Date(c.scheduledDate);
        return cleaningDate <= toDate;
      });
    }
    
    // Filtra ulteriormente per proprietario (per proprietà oltre le 10)
    if (user.role === "PROPRIETARIO" && allowedPropertyIds && allowedPropertyIds.length > 10) {
      cleanings = cleanings.filter((c: any) => allowedPropertyIds!.includes(c.propertyId));
    }
    
    // ─── VERIFICA PAGINAZIONE ───
    const hasMore = cleanings.length > pageSize;
    if (hasMore) {
      cleanings = cleanings.slice(0, pageSize);
    }
    
    // ─── CARICA PROPRIETÀ PER ARRICCHIRE DATI ───
    const propertiesMap = await loadProperties();
    
    // ─── TRASFORMA RISPOSTA ───
    const transformedCleanings = cleanings.map((cleaning: any) => {
      const property = propertiesMap.get(cleaning.propertyId);
      
      return {
        id: cleaning.id,
        date: cleaning.scheduledDate?.toDate?.() || new Date(),
        scheduledDate: cleaning.scheduledDate?.toDate?.() || new Date(),
        scheduledTime: cleaning.scheduledTime || "10:00",
        status: cleaning.status || "pending",
        guestsCount: cleaning.guestsCount || 2,
        type: cleaning.type || "checkout",
        priority: cleaning.priority || "normal",
        
        // Prezzi
        basePrice: cleaning.basePrice || cleaning.price || 0,
        holidayFee: cleaning.holidayFee || 0,
        finalPrice: cleaning.finalPrice || cleaning.price || 0,
        
        // Proprietà
        propertyId: cleaning.propertyId || "",
        property: {
          id: cleaning.propertyId || "",
          name: cleaning.propertyName || property?.name || "Proprietà",
          address: property?.address || cleaning.propertyAddress || "",
          city: property?.city || "",
        },
        
        // Operatore
        operatorId: cleaning.operatorId || null,
        operator: cleaning.operatorId ? {
          id: cleaning.operatorId,
          name: cleaning.operatorName || "Operatore",
        } : null,
        operators: cleaning.operators || [],
        
        // Booking
        bookingId: cleaning.bookingId || null,
        bookingSource: cleaning.bookingSource || null,
        booking: {
          guestName: cleaning.guestName || "",
          guestsCount: cleaning.guestsCount || 2,
        },
        
        // Dati esecuzione
        startedAt: cleaning.startedAt?.toDate?.() || null,
        completedAt: cleaning.completedAt?.toDate?.() || null,
        duration: cleaning.duration || null,
        
        // Note
        notes: cleaning.notes || "",
        adminNotes: cleaning.adminNotes || "",
        operatorNotes: cleaning.operatorNotes || "",
        
        // Tracking
        createdAt: cleaning.createdAt?.toDate?.() || null,
        updatedAt: cleaning.updatedAt?.toDate?.() || null,
      };
    });

    console.log(`📦 Cleanings API: ${transformedCleanings.length} risultati`);

    return NextResponse.json({ 
      cleanings: transformedCleanings,
      total: transformedCleanings.length,
      hasMore,
      lastDocId: cleanings.length > 0 ? cleanings[cleanings.length - 1].id : null,
    });
  } catch (error) {
    console.error("❌ Errore GET cleanings:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════
// POST - Crea nuova pulizia con calcolo prezzo automatico
// ═══════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const user = await getFirebaseUser();
    
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const body = await request.json();
    const { 
      propertyId, 
      scheduledDate, 
      scheduledTime,
      serviceTypeId,
      type,
      priority,
      guestsCount,
      bookingId,
      adminNotes,
      ownerNotes,
      requiresLaundry,
      manualPrice, // Per SGROSSO
    } = body;

    // ─── VALIDAZIONE ───
    if (!propertyId) {
      return NextResponse.json({ error: "propertyId è obbligatorio" }, { status: 400 });
    }
    
    if (!scheduledDate) {
      return NextResponse.json({ error: "scheduledDate è obbligatoria" }, { status: 400 });
    }

    // ─── CARICA PROPRIETÀ ───
    const propertyDoc = await getDoc(doc(db, "properties", propertyId));
    
    if (!propertyDoc.exists()) {
      return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    }
    
    const property = propertyDoc.data();
    
    // ─── VERIFICA PERMESSI ───
    if (user.role === "PROPRIETARIO" && property.ownerId !== user.id) {
      return NextResponse.json({ error: "Non autorizzato per questa proprietà" }, { status: 403 });
    }

    // ─── CARICA TIPO SERVIZIO ───
    let serviceType: ServiceType | null = null;
    
    if (serviceTypeId) {
      const serviceTypeDoc = await getDoc(doc(db, "serviceTypes", serviceTypeId));
      if (serviceTypeDoc.exists()) {
        serviceType = { id: serviceTypeDoc.id, ...serviceTypeDoc.data() } as ServiceType;
      }
    }
    
    // Se non specificato, usa STANDARD
    if (!serviceType) {
      const serviceTypesSnapshot = await getDocs(
        query(collection(db, "serviceTypes"), where("code", "==", "STANDARD"))
      );
      if (!serviceTypesSnapshot.empty) {
        const stDoc = serviceTypesSnapshot.docs[0];
        serviceType = { id: stDoc.id, ...stDoc.data() } as ServiceType;
      }
    }

    // ─── CALCOLA PREZZO ───
    const cleaningDate = new Date(scheduledDate);
    cleaningDate.setHours(12, 0, 0, 0); // Mezzogiorno per evitare problemi timezone
    
    let basePrice = 0;
    let holidayFee = 0;
    let finalPrice = 0;
    let holidayName: string | undefined;
    
    // Prezzo base dal contratto della proprietà
    const contractPrice = property.contractPrice || property.cleaningPrice || 50;
    
    if (serviceType?.requiresManualPrice && manualPrice !== undefined) {
      // SGROSSO: prezzo manuale
      basePrice = parseFloat(manualPrice);
      finalPrice = basePrice;
    } else if (serviceType) {
      // Carica festività per calcolo
      const holidays = await loadHolidays();
      
      // Crea un ServiceType con prezzo base dal contratto
      const serviceTypeWithPrice = {
        ...serviceType,
        basePrice: contractPrice + (serviceType.baseSurcharge || 0),
      };
      
      const priceResult = calculateCleaningPrice({
        serviceType: serviceTypeWithPrice,
        date: cleaningDate,
        property: {
          bedrooms: property.bedrooms || 1,
          bathrooms: property.bathrooms || 1,
        },
        guestsCount: guestsCount || 2,
        holidays,
        createdAt: new Date(),
      });
      
      basePrice = priceResult.basePrice;
      holidayFee = priceResult.holidaySurcharge;
      holidayName = priceResult.holidayName;
      finalPrice = priceResult.total;
    } else {
      // Fallback: usa prezzo contratto
      basePrice = contractPrice;
      finalPrice = contractPrice;
    }

    // ─── CREA PULIZIA ───
    const now = Timestamp.now();
    
    const cleaningData: Record<string, unknown> = {
      // Riferimenti
      propertyId,
      propertyName: property.name || "",
      propertyAddress: property.address || "",
      propertyCity: property.city || "",
      ownerId: property.ownerId || "",
      ownerName: property.ownerName || "",
      
      // Pianificazione
      scheduledDate: Timestamp.fromDate(cleaningDate),
      scheduledTime: scheduledTime || "10:00",
      estimatedDuration: serviceType?.estimatedDuration || 90,
      
      // Tipo e status
      type: type || "checkout",
      status: "SCHEDULED",
      priority: priority || "normal",
      serviceTypeId: serviceType?.id || null,
      serviceTypeName: serviceType?.name || "Standard",
      serviceTypeCode: serviceType?.code || "STANDARD",
      
      // Prezzo
      basePrice,
      holidayFee,
      holidayName: holidayName || null,
      extraChargesTotal: 0,
      finalPrice,
      
      // Ospiti
      guestsCount: guestsCount || 2,
      
      // Booking
      bookingId: bookingId || null,
      
      // Note
      adminNotes: adminNotes || "",
      ownerNotes: ownerNotes || "",
      
      // Biancheria
      requiresLaundry: requiresLaundry ?? property.autoGenerateLaundry ?? false,
      
      // Checklist e foto
      checklistCompleted: false,
      photosCount: 0,
      photoIds: [],
      issuesCount: 0,
      issueIds: [],
      extraChargeIds: [],
      
      // Tracking
      createdAt: now,
      createdBy: user.id,
      updatedAt: now,
      sourceCalendar: "manual",
    };

    const docRef = await addDoc(collection(db, "cleanings"), cleaningData);

    console.log(`✅ Pulizia creata: ${docRef.id} per ${property.name}`);

    return NextResponse.json({ 
      success: true,
      id: docRef.id,
      basePrice,
      holidayFee,
      holidayName,
      finalPrice,
      message: `Pulizia creata per ${property.name}`,
    });
  } catch (error) {
    console.error("❌ Errore POST cleaning:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}
