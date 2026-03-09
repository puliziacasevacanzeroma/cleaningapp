import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { calculateCleaningPrice } from "~/lib/pricing/calculateCleaningPrice";
import type { ServiceType } from "~/types/serviceType";
import type { Holiday } from "~/types/holiday";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, CleaningCreateSchema } from "~/lib/validation/schemas";

// ── Tipi locali ──────────────────────────────────────────────────────────────
type CleaningRecord = {
  id: string;
  propertyId: string;
  scheduledDate: { toDate?: () => Date } | string | Date;
  status?: string;
  [key: string]: unknown;
};

export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════
// HELPER: Ottieni utente da cookie
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// HELPER: Ottieni proprietà di un proprietario
// ═══════════════════════════════════════════════════════════════

async function getOwnerPropertyIds(ownerId: string): Promise<string[]> {
  const snapshot = await adminDb.collection("properties").where("ownerId", "==", ownerId).get();
  return snapshot.docs.map(doc => doc.id);
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Carica dati aggiuntivi
// ═══════════════════════════════════════════════════════════════

async function loadHolidays(): Promise<Holiday[]> {
  const snapshot = await adminDb.collection("holidays").where("isActive", "==", true).get();
  return snapshot.docs.map(doc => {
    const data = doc.data() as Record<string, any>;
    return {
      id: doc.id,
      ...data,
      date: data.date || null,
    } as Holiday;
  });
}

async function loadProperties(): Promise<Map<string, any>> {
  const snapshot = await adminDb.collection("properties").get();
  const map = new Map();
  snapshot.docs.forEach(doc => {
    map.set(doc.id, { id: doc.id, ...(doc.data() as Record<string, any>) });
  });
  return map;
}

// ═══════════════════════════════════════════════════════════════
// GET - Lista pulizie con filtri, permessi e paginazione
// ═══════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser();
    
    if (!user) {
      if (process.env.NODE_ENV !== "production") console.log("❌ Cleanings API: Utente non autenticato");
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

    // ─── COSTRUISCI QUERY BASE (Admin SDK - chained) ───
    let allowedPropertyIds: string[] | null = null;
    
    if (user.role === "PROPRIETARIO") {
      allowedPropertyIds = await getOwnerPropertyIds(user.id);
      if (allowedPropertyIds.length === 0) {
        return NextResponse.json({ cleanings: [], total: 0, hasMore: false, message: "Nessuna proprietà associata" });
      }
      if (propertyId && !allowedPropertyIds.includes(propertyId)) {
        return NextResponse.json({ error: "Proprietà non autorizzata" }, { status: 403 });
      }
    }

    // Build chained query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cleaningsQuery: any = adminDb.collection("cleanings");

    if (status) cleaningsQuery = cleaningsQuery.where("status", "==", status.toUpperCase());
    if (propertyId) cleaningsQuery = cleaningsQuery.where("propertyId", "==", propertyId);
    if (operatorId) cleaningsQuery = cleaningsQuery.where("operatorId", "==", operatorId);
    if (user.role === "PROPRIETARIO" && !propertyId && allowedPropertyIds && allowedPropertyIds.length <= 10) {
      cleaningsQuery = cleaningsQuery.where("propertyId", "in", allowedPropertyIds);
    }
    if (user.role === "OPERATORE_PULIZIE") {
      cleaningsQuery = cleaningsQuery.where("operatorId", "==", user.id);
    }

    cleaningsQuery = cleaningsQuery.orderBy("scheduledDate", "desc").limit(pageSize + 1);

    if (lastDocId) {
      const lastDocSnap = await adminDb.collection("cleanings").doc(lastDocId).get();
      if (lastDocSnap.exists) {
        cleaningsQuery = cleaningsQuery.startAfter(lastDocSnap);
      }
    }

    const snapshot = await cleaningsQuery.get();
    
    // @ts-expect-error TODO-FIX: TS7006 Parameter 'doc' implicitly has an 'any' type.
    let cleanings = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) }));
    
    // ─── FILTRI POST-QUERY (per date range) ───
    // Firestore non supporta range su campi diversi, quindi filtriamo qui
    
    if (date) {
      const filterDate = new Date(date);
      filterDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(filterDate);
      nextDay.setDate(nextDay.getDate() + 1);
      
      cleanings = cleanings.filter((c: CleaningRecord) => {
        // @ts-expect-error TODO-FIX: TS2339 Property 'toDate' does not exist on type 'string | Date | { toDate?: (() => Date...
        const cleaningDate = c.scheduledDate?.toDate?.() || new Date(c.scheduledDate);
        return cleaningDate >= filterDate && cleaningDate < nextDay;
      });
    }
    
    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      
      cleanings = cleanings.filter((c: CleaningRecord) => {
        // @ts-expect-error TODO-FIX: TS2339 Property 'toDate' does not exist on type 'string | Date | { toDate?: (() => Date...
        const cleaningDate = c.scheduledDate?.toDate?.() || new Date(c.scheduledDate);
        return cleaningDate >= fromDate;
      });
    }
    
    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      
      cleanings = cleanings.filter((c: CleaningRecord) => {
        // @ts-expect-error TODO-FIX: TS2339 Property 'toDate' does not exist on type 'string | Date | { toDate?: (() => Date...
        const cleaningDate = c.scheduledDate?.toDate?.() || new Date(c.scheduledDate);
        return cleaningDate <= toDate;
      });
    }
    
    // Filtra ulteriormente per proprietario (per proprietà oltre le 10)
    if (user.role === "PROPRIETARIO" && allowedPropertyIds && allowedPropertyIds.length > 10) {
      cleanings = cleanings.filter((c: CleaningRecord) => allowedPropertyIds!.includes(c.propertyId));
    }
    
    // ─── VERIFICA PAGINAZIONE ───
    const hasMore = cleanings.length > pageSize;
    if (hasMore) {
      cleanings = cleanings.slice(0, pageSize);
    }
    
    // ─── CARICA PROPRIETÀ PER ARRICCHIRE DATI ───
    const propertiesMap = await loadProperties();
    
    // ─── TRASFORMA RISPOSTA ───
    const transformedCleanings = cleanings.map((cleaning: CleaningRecord) => {
      const property = propertiesMap.get(cleaning.propertyId);
      
      return {
        id: cleaning.id,
        // @ts-expect-error TODO-FIX: TS2339 Property 'toDate' does not exist on type 'string | Date | { toDate?: (() => Date...
        date: cleaning.scheduledDate?.toDate?.() || new Date(),
        // @ts-expect-error TODO-FIX: TS2339 Property 'toDate' does not exist on type 'string | Date | { toDate?: (() => Date...
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
        // @ts-expect-error TODO-FIX: TS2339 Property 'toDate' does not exist on type '{}'.
        startedAt: cleaning.startedAt?.toDate?.() || null,
        // @ts-expect-error TODO-FIX: TS2339 Property 'toDate' does not exist on type '{}'.
        completedAt: cleaning.completedAt?.toDate?.() || null,
        duration: cleaning.duration || null,
        
        // Note
        notes: cleaning.notes || "",
        adminNotes: cleaning.adminNotes || "",
        operatorNotes: cleaning.operatorNotes || "",
        
        // Tracking
        // @ts-expect-error TODO-FIX: TS2339 Property 'toDate' does not exist on type '{}'.
        createdAt: cleaning.createdAt?.toDate?.() || null,
        // @ts-expect-error TODO-FIX: TS2339 Property 'toDate' does not exist on type '{}'.
        updatedAt: cleaning.updatedAt?.toDate?.() || null,
      };
    });

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
    const user = await getApiUser();
    
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const body = await validateBody(request, CleaningCreateSchema);
    if (body instanceof Response) return body;
    const { 
      propertyId, 
      scheduledDate, 
      scheduledTime,
      // @ts-expect-error TODO-FIX: TS2339 Property 'serviceTypeId' does not exist on type '{ scheduledTime: string; guests...
      serviceTypeId,
      type,
      // @ts-expect-error TODO-FIX: TS2339 Property 'priority' does not exist on type '{ scheduledTime: string; guestsCount...
      priority,
      guestsCount,
      bookingId,
      // @ts-expect-error TODO-FIX: TS2339 Property 'adminNotes' does not exist on type '{ scheduledTime: string; guestsCou...
      adminNotes,
      // @ts-expect-error TODO-FIX: TS2339 Property 'ownerNotes' does not exist on type '{ scheduledTime: string; guestsCou...
      ownerNotes,
      // @ts-expect-error TODO-FIX: TS2339 Property 'requiresLaundry' does not exist on type '{ scheduledTime: string; gues...
      requiresLaundry,
      // @ts-expect-error TODO-FIX: TS2339 Property 'manualPrice' does not exist on type '{ scheduledTime: string; guestsCo...
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
    const propertyDoc = await adminDb.collection("properties").doc(propertyId).get();
    
    if (!propertyDoc.exists) {
      return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    }
    
    const property = propertyDoc.data();
    
    // ─── VERIFICA PERMESSI ───
    // @ts-expect-error TODO-FIX: TS18048 'property' is possibly 'undefined'.
    if (user.role === "PROPRIETARIO" && property.ownerId !== user.id) {
      return NextResponse.json({ error: "Non autorizzato per questa proprietà" }, { status: 403 });
    }

    // ─── CARICA TIPO SERVIZIO ───
    let serviceType: ServiceType | null = null;
    
    if (serviceTypeId) {
      const serviceTypeDoc = await adminDb.collection("serviceTypes").doc(serviceTypeId).get();
      if (serviceTypeDoc.exists) {
        serviceType = { id: serviceTypeDoc.id, ...(serviceTypeDoc.data() as Record<string, any>) } as ServiceType;
      }
    }
    
    // Se non specificato, usa STANDARD
    if (!serviceType) {
      const serviceTypesSnapshot = await adminDb.collection("serviceTypes").get();
      if (!serviceTypesSnapshot.empty) {
        const stDoc = serviceTypesSnapshot.docs[0];
        serviceType = { id: stDoc.id, ...(stDoc.data() as Record<string, any>) } as ServiceType;
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
    // @ts-expect-error TODO-FIX: TS18048 'property' is possibly 'undefined'.
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
          // @ts-expect-error TODO-FIX: TS18048 'property' is possibly 'undefined'.
          bedrooms: property.bedrooms || 1,
          // @ts-expect-error TODO-FIX: TS18048 'property' is possibly 'undefined'.
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
      // @ts-expect-error TODO-FIX: TS18048 'property' is possibly 'undefined'.
      propertyName: property.name || "",
      // @ts-expect-error TODO-FIX: TS18048 'property' is possibly 'undefined'.
      propertyAddress: property.address || "",
      // @ts-expect-error TODO-FIX: TS18048 'property' is possibly 'undefined'.
      propertyCity: property.city || "",
      // @ts-expect-error TODO-FIX: TS18048 'property' is possibly 'undefined'.
      propertyPostalCode: property.postalCode || "",
      // COORDINATE per calcolo distanze assegnazioni
      // @ts-expect-error TODO-FIX: TS18048 'property' is possibly 'undefined'.
      propertyCoordinates: property.coordinates || null,
      // @ts-expect-error TODO-FIX: TS18048 'property' is possibly 'undefined'.
      ownerId: property.ownerId || "",
      // @ts-expect-error TODO-FIX: TS18048 'property' is possibly 'undefined'.
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
      guestsConfirmed: guestsCount ? true : false, // Se ospiti specificati = confermati
      // @ts-expect-error TODO-FIX: TS18048 'property' is possibly 'undefined'.
      maxGuests: property.maxGuests || null, // 🔧 Salva maxGuests dalla proprietà
      
      // Booking
      bookingId: bookingId || null,
      
      // Note
      adminNotes: adminNotes || "",
      ownerNotes: ownerNotes || "",
      
      // Biancheria
      // @ts-expect-error TODO-FIX: TS18048 'property' is possibly 'undefined'.
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

    const docRef = await adminDb.collection("cleanings").add(cleaningData);

    return NextResponse.json({ 
      success: true,
      id: docRef.id,
      basePrice,
      holidayFee,
      holidayName,
      finalPrice,
      // @ts-expect-error TODO-FIX: TS18048 'property' is possibly 'undefined'.
      message: `Pulizia creata per ${property.name}`,
    });
  } catch (error) {
    console.error("❌ Errore POST cleaning:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}
