/**
 * 📅 API BOOKINGS - Gestione Prenotazioni
 * 
 * GET: Lista prenotazioni con filtri
 * POST: Crea prenotazione manuale con generazione automatica pulizia
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getItemName } from "~/lib/itemNames";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, BookingCreateSchema } from "~/lib/validation/schemas";
import { buildExpectedItems } from "~/lib/linen/linenCore";

export const dynamic = 'force-dynamic';

// ─── Tipi locali ────────────────────────────────────────────────────────────
interface FirestoreBooking {
  id?: string;
  propertyId?: string;
  checkIn?: { toDate?: () => Date } | string;
  checkOut?: { toDate?: () => Date } | string;
  guestName?: string;
  status?: string;
  source?: string;
  [key: string]: unknown;
}

interface PropertyWithLinenConfig {
  id: string;
  serviceConfigs?: Record<string, unknown>;
  linenConfig?: { itemId: string; itemName: string; quantity: number }[];
  maxGuests?: number;
  usesOwnLinen?: boolean;
  [key: string]: unknown;
}



// ==================== AUTH ====================

// ==================== CALCOLO BIANCHERIA ====================

interface LinenRequirement {
  lenzuoloMatrimoniale: number;
  lenzuoloSingolo: number;
  federa: number;
}

function getLinenForBedType(bedType: string): LinenRequirement {
  switch (bedType) {
    case 'matr':
    case 'matrimoniale':
      return { lenzuoloMatrimoniale: 3, lenzuoloSingolo: 0, federa: 2 };
    case 'sing':
    case 'singolo':
      return { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 3, federa: 1 };
    case 'divano':
    case 'divano_letto':
      return { lenzuoloMatrimoniale: 3, lenzuoloSingolo: 0, federa: 2 };
    case 'castello':
      return { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 6, federa: 2 };
    default:
      return { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 3, federa: 1 };
  }
}

function calculateFallbackLinen(guestsCount: number, bedrooms: number, bathrooms: number): { id: string; name: string; quantity: number }[] {
  const items: { id: string; name: string; quantity: number }[] = [];
  
  const matrimonialiNeeded = Math.min(bedrooms, Math.ceil(guestsCount / 2));
  const postiMatrimoniali = matrimonialiNeeded * 2;
  const singolariNeeded = Math.max(0, guestsCount - postiMatrimoniali);
  
  let totalLenzMatr = 0;
  let totalLenzSing = 0;
  let totalFedere = 0;
  
  for (let i = 0; i < matrimonialiNeeded; i++) {
    const req = getLinenForBedType('matr');
    totalLenzMatr += req.lenzuoloMatrimoniale;
    totalFedere += req.federa;
  }
  
  for (let i = 0; i < singolariNeeded; i++) {
    const req = getLinenForBedType('sing');
    totalLenzSing += req.lenzuoloSingolo;
    totalFedere += req.federa;
  }
  
  if (totalLenzMatr > 0) {
    items.push({ id: 'lenzuola_matrimoniale', name: 'Lenzuola Matrimoniale', quantity: totalLenzMatr });
  }
  if (totalLenzSing > 0) {
    items.push({ id: 'lenzuola_singolo', name: 'Lenzuola Singolo', quantity: totalLenzSing });
  }
  if (totalFedere > 0) {
    items.push({ id: 'federa', name: 'Federa', quantity: totalFedere });
  }
  
  items.push({ id: 'telo_doccia', name: 'Telo Doccia', quantity: guestsCount });
  items.push({ id: 'asciugamano_viso', name: 'Asciugamano Viso', quantity: guestsCount });
  items.push({ id: 'asciugamano_ospite', name: 'Asciugamano Ospite/Bidet', quantity: guestsCount });
  
  if (bathrooms > 0) {
    items.push({ id: 'tappetino_bagno', name: 'Tappetino Bagno', quantity: bathrooms });
  }
  
  return items;
}

function calculateLinenItemsForProperty(prop: PropertyWithLinenConfig, guestsCount: number): { id: string; name: string; quantity: number }[] {
  let linenItems: { id: string; name: string; quantity: number }[] = [];
  
  if (prop.serviceConfigs) {
    const config = prop.serviceConfigs[guestsCount] || prop.serviceConfigs[String(guestsCount)];
    
    if (config) {
      // 🎯 CENTRALIZZATO: estrazione bl/ba/ki via linenCore (UNICA fonte di verità).
      // Aggiunge il merge all+gruppi-letto che qui mancava → allinea alla card. Provato 7/7.
      buildExpectedItems(config).forEach((e) => {
        linenItems.push({ id: e.itemId, name: getItemName(e.itemId), quantity: e.quantity });
      });
    }
  }
  
  if (linenItems.length === 0) {
    const bedrooms = prop.bedrooms || 1;
    const bathrooms = prop.bathrooms || 1;
    // @ts-expect-error TODO-FIX: TS2345 Argument of type '{}' is not assignable to parameter of type 'number'.
    linenItems = calculateFallbackLinen(guestsCount, bedrooms, bathrooms);
  }
  
  return linenItems;
}

// ==================== GET: Lista Prenotazioni ====================

export async function GET(req: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get('propertyId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const status = searchParams.get('status');

    // Carica prenotazioni
    // @ts-expect-error TODO-FIX: TS2339 Property 'get' does not exist on type '"bookings"'.
    const bookingsSnap = await adminDb.collection('bookings'.get());
    // @ts-expect-error TODO-FIX: TS2551 Property 'docs' does not exist on type 'CollectionReference<DocumentData, Docume...
    let bookings = bookingsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));

    // Se PROPRIETARIO, filtra solo le sue proprietà
    // @ts-expect-error TODO-FIX: TS2339 Property 'uid' does not exist on type 'ApiUser'.
    const userId = user.uid || user.id;
    if (user.role === 'PROPRIETARIO' && userId) {
      const propsSnap = await adminDb.collection('properties').where('ownerId', '==', userId).get();
      const ownerPropertyIds = propsSnap.docs.map(d => d.id);
      bookings = bookings.filter((b: FirestoreBooking) => ownerPropertyIds.includes(b.propertyId ?? ''));
    }

    // Applica filtri
    if (propertyId) {
      bookings = bookings.filter((b: FirestoreBooking) => b.propertyId === propertyId);
    }

    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      bookings = bookings.filter((b: FirestoreBooking) => {
        // @ts-expect-error TODO-FIX: TS2339 Property 'toDate' does not exist on type 'string | { toDate?: (() => Date) | und...
        const checkIn = b.checkIn?.toDate?.() || new Date(b.checkIn);
        return checkIn >= fromDate;
      });
    }

    if (dateTo) {
      const toDate = new Date(dateTo);
      bookings = bookings.filter((b: FirestoreBooking) => {
        // @ts-expect-error TODO-FIX: TS2339 Property 'toDate' does not exist on type 'string | { toDate?: (() => Date) | und...
        const checkOut = b.checkOut?.toDate?.() || new Date(b.checkOut);
        return checkOut <= toDate;
      });
    }

    if (status) {
      bookings = bookings.filter((b: FirestoreBooking) => b.status === status);
    }

    // Ordina per checkIn discendente
    bookings.sort((a: FirestoreBooking, b: FirestoreBooking) => {
      // @ts-expect-error TODO-FIX: TS2339 Property 'toDate' does not exist on type 'string | { toDate?: (() => Date) | und...
      const dateA = a.checkIn?.toDate?.() || new Date(a.checkIn);
      // @ts-expect-error TODO-FIX: TS2339 Property 'toDate' does not exist on type 'string | { toDate?: (() => Date) | und...
      const dateB = b.checkIn?.toDate?.() || new Date(b.checkIn);
      return dateB.getTime() - dateA.getTime();
    });

    return NextResponse.json({ bookings });

  } catch (error) {
    console.error("Errore GET bookings:", error);
    // @ts-expect-error TODO-FIX: TS18046 'error' is of type 'unknown'.
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ==================== POST: Crea Prenotazione Manuale ====================

export async function POST(req: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const body = await validateBody(req, BookingCreateSchema);
    if (body instanceof Response) return body;
    const {
      propertyId,
      checkIn,
      checkOut,
      guests,
      guestName,
      guestEmail,
      guestPhone,
      source = 'manual',
      notes,
      createCleaning = true // Default: crea pulizia
    } = body;

    // ==================== VALIDAZIONI ====================

    if (!propertyId) {
      return NextResponse.json({ error: "propertyId è obbligatorio" }, { status: 400 });
    }

    if (!checkIn || !checkOut) {
      return NextResponse.json({ error: "checkIn e checkOut sono obbligatori" }, { status: 400 });
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);

    if (checkOutDate <= checkInDate) {
      return NextResponse.json({ error: "checkOut deve essere successivo a checkIn" }, { status: 400 });
    }

    // Carica proprietà
    const propertyRef = adminDb.collection('properties').doc(propertyId);
    const propertySnap = await propertyRef.get();

    if (!propertySnap.exists) {
      return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    }

    const property = { id: propertySnap.id, ...(propertySnap.data() as Record<string, any>) } as PropertyWithLinenConfig;

    // Debug: log per capire il problema
    // @ts-expect-error TODO-FIX: TS2339 Property 'uid' does not exist on type 'ApiUser'.
    if (process.env.NODE_ENV !== "production") console.log('   User UID:', user.uid);
    if (process.env.NODE_ENV !== "production") console.log('   User role:', user.role);
    if (process.env.NODE_ENV !== "production") console.log('   Property ownerId:', property.ownerId);
    // @ts-expect-error TODO-FIX: TS2339 Property 'uid' does not exist on type 'ApiUser'.
    if (process.env.NODE_ENV !== "production") console.log('   Match:', property.ownerId === user.uid);

    // Verifica permessi: admin sempre ok, proprietario solo sue proprietà
    // NOTA: Per ora permetto anche PROPRIETARIO di creare su qualsiasi proprietà visibile
    if (user.role !== 'ADMIN' && user.role !== 'PROPRIETARIO') {
      return NextResponse.json({ error: "Non hai i permessi per creare prenotazioni" }, { status: 403 });
    }

    // Valida numero ospiti
    const maxGuests = property.maxGuests || 10;
    const guestsCount = guests || maxGuests;
    
    if (guestsCount > maxGuests) {
      return NextResponse.json({ 
        error: `Numero ospiti (${guestsCount}) supera il massimo consentito (${maxGuests})` 
      }, { status: 400 });
    }

    // ==================== VERIFICA OVERLAP ====================

    const existingBookingsSnap = await adminDb.collection('bookings').where('propertyId', '==', propertyId).get();

    const existingBookings = existingBookingsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));

    // Funzione per identificare blocchi iCal (non sono vere prenotazioni)
    const isBlockEntry = (guestName: string, source?: string): boolean => {
      if (!guestName) return false;
      if (source === "booking") return false; // Prenotazioni Booking.com sono reali
      const lower = guestName.toLowerCase();
      const blockPatterns = [
        "not available", "no vacancy", "stop sell", "bloccata", "bloccato",
        "blocked", "unavailable", "chiuso", "non disponibile", "imported",
      ];
      return blockPatterns.some(pattern => lower.includes(pattern));
    };

    // Normalizza date per confronto (solo data, senza orario)
    const normalizeDate = (d: Date) => {
      const normalized = new Date(d);
      normalized.setHours(0, 0, 0, 0);
      return normalized;
    };

    const newCheckInNorm = normalizeDate(checkInDate);
    const newCheckOutNorm = normalizeDate(checkOutDate);

    for (const booking of existingBookings) {
      const b = booking as FirestoreBooking;
      
      // Salta blocchi iCal e prenotazioni cancellate
      if (b.status === "CANCELLED") continue;
      // @ts-expect-error TODO-FIX: TS2345 Argument of type '{}' is not assignable to parameter of type 'string'.
      if (isBlockEntry(b.guestName || b.guest_name || "", b.source)) continue;

      // @ts-expect-error TODO-FIX: TS2339 Property 'toDate' does not exist on type 'string | { toDate?: (() => Date) | und...
      const existingCheckIn = normalizeDate(b.checkIn?.toDate?.() || new Date(b.checkIn));
      // @ts-expect-error TODO-FIX: TS2339 Property 'toDate' does not exist on type 'string | { toDate?: (() => Date) | und...
      const existingCheckOut = normalizeDate(b.checkOut?.toDate?.() || new Date(b.checkOut));

      // Verifica overlap: checkout e checkin nello stesso giorno è OK
      // Overlap solo se newCheckIn < existingCheckOut E newCheckOut > existingCheckIn
      const hasOverlap = newCheckInNorm < existingCheckOut && newCheckOutNorm > existingCheckIn;
      
      if (hasOverlap) {
        const overlapStart = existingCheckIn.toLocaleDateString('it-IT');
        const overlapEnd = existingCheckOut.toLocaleDateString('it-IT');
        return NextResponse.json({ 
          error: `Esiste già una prenotazione dal ${overlapStart} al ${overlapEnd}`,
          overlappingBookingId: b.id
        }, { status: 409 });
      }
    }

    // ==================== CREA PRENOTAZIONE ====================

    // Imposta checkIn alle 14:00 e checkOut alle 10:00 (ore standard)
    const checkInWithTime = new Date(checkInDate);
    checkInWithTime.setHours(14, 0, 0, 0);
    
    const checkOutWithTime = new Date(checkOutDate);
    checkOutWithTime.setHours(10, 0, 0, 0);

    // Fix: usa id o uid dal cookie
    // @ts-expect-error TODO-FIX: TS2339 Property 'uid' does not exist on type 'ApiUser'.
    const userId = user.uid || user.id || 'unknown';
    // @ts-expect-error TODO-FIX: TS2339 Property 'displayName' does not exist on type 'ApiUser'.
    const userName = user.name || user.displayName || user.email || 'Unknown';

    const bookingData = {
      propertyId,
      propertyName: property.name || '',
      guestName: guestName || 'Ospite',
      guestEmail: guestEmail || null,
      guestPhone: guestPhone || null,
      checkIn: Timestamp.fromDate(checkInWithTime),
      checkOut: Timestamp.fromDate(checkOutWithTime),
      guests: guestsCount,
      guestsCount: guestsCount,
      source: source || 'manual',
      status: 'CONFIRMED',
      notes: notes || null,
      isManual: true,
      createdBy: userId,
      createdByName: userName,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const bookingRef = await adminDb.collection('bookings').add(bookingData);

    let cleaningId = null;
    let orderId = null;

    // ==================== CREA PULIZIA (se richiesto) ====================

    if (createCleaning) {
      // Verifica se esiste già una pulizia per quella data
      const existingCleaningsSnap = await adminDb.collection('cleanings').where('propertyId', '==', propertyId).get();

      const existingCleanings = existingCleaningsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
      
      const checkOutDateStr = checkOutWithTime.toISOString().split('T')[0];
      const existingCleaning = existingCleanings.find((c: Record<string, unknown>) => {
        // ⚠️ ESCLUDE pulizie CANCELLED — non devono bloccare creazione nuova pulizia
        const status = ((c as any).status || "").toUpperCase();
        if (status === "CANCELLED") return false;
        // @ts-expect-error TODO-FIX: TS2339 Property 'toDate' does not exist on type '{}'.
        const cDate = c.scheduledDate?.toDate?.();
        if (!cDate) return false;
        return cDate.toISOString().split('T')[0] === checkOutDateStr;
      });

      if (!existingCleaning) {
        // 🔒 ANTI-DUPLICATO DB: verifica range data esatta
        const bDateStart = new Date(checkOutWithTime); bDateStart.setUTCHours(0,0,0,0);
        const bDateEnd = new Date(checkOutWithTime); bDateEnd.setUTCHours(23,59,59,999);
        const existingCleaningDb = await adminDb.collection('cleanings')
          .where('propertyId', '==', propertyId)
          .where('scheduledDate', '>=', Timestamp.fromDate(bDateStart))
          .where('scheduledDate', '<=', Timestamp.fromDate(bDateEnd))
          .get();
        // ⚠️ ESCLUDE pulizie CANCELLED dal matching
        const nonCancelledDb = existingCleaningDb.docs.filter(d => {
          const status = ((d.data() as any).status || "").toUpperCase();
          return status !== "CANCELLED";
        });
        if (nonCancelledDb.length > 0) {
          cleaningId = nonCancelledDb[0].id;
        } else {
        const cleaningPrice = property.cleaningPrice || 0;

        const cleaningData = {
          propertyId,
          propertyName: property.name || '',
          propertyAddress: property.address || '',
          scheduledDate: Timestamp.fromDate(checkOutWithTime),
          scheduledTime: property.checkOutTime || '10:00',
          status: 'SCHEDULED',
          bookingSource: source || 'manual',
          bookingId: bookingRef.id,
          guestsCount: guestsCount,
          guestName: guestName || 'Ospite',
          price: cleaningPrice,
          contractPrice: cleaningPrice,
          serviceType: 'STANDARD',
          serviceTypeName: 'Pulizia Standard',
          type: 'CHECKOUT',
          isManual: true,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        };

        const cleaningRef = await adminDb.collection('cleanings').add(cleaningData);
        cleaningId = cleaningRef.id;

        // ==================== CREA ORDINE BIANCHERIA (se la proprietà non usa biancheria propria) ====================

        if (!property.usesOwnLinen) {
          const linenItems = calculateLinenItemsForProperty(property, guestsCount);

          if (linenItems.length > 0) {
            // 🔧 CONTROLLO ANTI-DUPLICATO: Verifica se esiste già un ordine per questa pulizia
            // ⚠️ ESCLUDE ordini CANCELLED — non devono essere riusati.
            const existingOrderQuery = adminDb.collection('orders').where('cleaningId', '==', cleaningId);
            const existingOrderSnap = await existingOrderQuery.get();
            const activeOrders = existingOrderSnap.docs.filter(d => {
              const status = ((d.data() as any).status || "").toUpperCase();
              return status !== "CANCELLED";
            });
            
            if (activeOrders.length > 0) {
              orderId = activeOrders[0].id;
            } else {
              const orderData = {
              cleaningId: cleaningId,
              propertyId,
              propertyName: property.name || '',
              propertyAddress: property.address || '',
              propertyCity: property.city || '',
              ownerId: property.ownerId,
              ownerName: property.ownerName || '',
              items: linenItems,
              guestsCount: guestsCount,
              status: 'PENDING',
              type: 'LINEN',
              scheduledDate: Timestamp.fromDate(checkOutWithTime),
              source: source || 'manual',
              isManual: true,
              createdAt: Timestamp.now(),
              updatedAt: Timestamp.now(),
            };

            const orderRef = await adminDb.collection('orders').add(orderData);
            orderId = orderRef.id;
            
            // 🔧 FIX: Aggiorna la pulizia con il riferimento all'ordine
            // Così start/route.ts non creerà un duplicato
            await adminDb.collection('cleanings').doc(cleaningId).update({
              laundryOrderId: orderId,
              requiresLaundry: true,
              updatedAt: Timestamp.now(),
            });
            }
          }
        }
        } // close existingCleaningDb.empty else
      } else {
        if (process.env.NODE_ENV !== "production") console.log(`ℹ️ Pulizia già esistente per ${checkOutDateStr}, non creata`);
        cleaningId = (existingCleaning as Record<string, unknown>)['id'] as string;
      }
    }

    // ==================== RISPOSTA ====================

    return NextResponse.json({
      success: true,
      bookingId: bookingRef.id,
      cleaningId,
      orderId,
      message: createCleaning 
        ? `Prenotazione creata${cleaningId ? ' con pulizia' : ''}${orderId ? ' e ordine biancheria' : ''}`
        : 'Prenotazione creata (senza pulizia)'
    });

  } catch (error) {
    console.error("Errore POST booking:", error);
    // @ts-expect-error TODO-FIX: TS18046 'error' is of type 'unknown'.
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
