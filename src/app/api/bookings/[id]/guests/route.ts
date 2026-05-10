import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, BookingGuestsSchema } from "~/lib/validation/schemas";
import { getItemName } from "~/lib/itemNames";

export const dynamic = 'force-dynamic';

// Controlla se la modifica ospiti è ancora permessa (entro le 20:00 del giorno PRIMA del checkout)
function canModifyGuests(checkoutDate: Date): { allowed: boolean; reason?: string } {
  const now = new Date();
  
  // Calcola le 20:00 del giorno PRIMA del checkout
  // Esempio: checkout 3 Feb → blocco alle 20:00 del 2 Feb
  const deadlineDate = new Date(checkoutDate);
  deadlineDate.setDate(deadlineDate.getDate() - 1); // Giorno prima
  deadlineDate.setHours(20, 0, 0, 0); // Alle 20:00
  
  // Se siamo già oltre le 20:00 del giorno prima, blocca
  if (now >= deadlineDate) {
    return { 
      allowed: false, 
      reason: "Il termine per modificare il numero ospiti è scaduto (ore 20:00 del giorno prima della pulizia)" 
    };
  }
  
  return { allowed: true };
}

/**
 * 🔧 RICALCOLA gli items dell'ordine biancheria PENDING collegato a una cleaning
 *
 * Replica la stessa logica di /api/cleanings/[id]/update-linen-order ma server-side
 * (senza fetch HTTP) per evitare problemi di auth interna.
 *
 * Skip rules (sicurezza):
 *  - Se la cleaning ha linenConfigModified === true E ha customLinenConfig, usa la config
 *    personalizzata (così non viene mai persa accidentalmente).
 *  - Se l'ordine NON è PENDING (es. ASSIGNED/IN_TRANSIT/DELIVERED/COMPLETED), NON si tocca.
 *  - Se non esiste serviceConfigs nella proprietà o config per quel numero ospiti, skip.
 *  - Tutti gli errori sono catturati e NON propagati per non bloccare l'update guests.
 *
 * @returns conteggio ordini effettivamente aggiornati
 */
async function recalculateLinenOrderForCleaning(cleaningId: string): Promise<number> {
  try {
    // 1. Carica la pulizia
    const cleaningDoc = await adminDb.collection("cleanings").doc(cleaningId).get();
    if (!cleaningDoc.exists) return 0;

    const cleaningData = cleaningDoc.data() as Record<string, any>;
    const propertyId = cleaningData.propertyId;
    const guestsCount = cleaningData.guestsCount || 2;
    const hasCustomConfig = cleaningData.linenConfigModified === true && !!cleaningData.customLinenConfig;

    // 2. Trova ordine PENDING di questa pulizia (solo PENDING per sicurezza:
    //    se è già ASSIGNED al rider o consegnato, NON tocchiamo)
    const ordersSnap = await adminDb.collection("orders")
      .where("cleaningId", "==", cleaningId)
      .where("status", "==", "PENDING")
      .get();

    if (ordersSnap.empty) return 0;

    // 3. Determina la fonte degli items
    let config: any = null;
    let configSource = "";

    if (hasCustomConfig) {
      config = cleaningData.customLinenConfig;
      configSource = "customLinenConfig";
    } else {
      const propertyDoc = await adminDb.collection("properties").doc(propertyId).get();
      if (!propertyDoc.exists) return 0;

      const propertyData = propertyDoc.data() as Record<string, any>;
      const serviceConfigs = propertyData.serviceConfigs;
      if (!serviceConfigs) return 0;

      config = serviceConfigs[guestsCount] || serviceConfigs[String(guestsCount)];
      configSource = `serviceConfigs[${guestsCount}]`;

      if (!config) return 0;
    }

    // 4. Calcola i nuovi items (stessa logica di update-linen-order/route.ts)
    const newItems: { id: string; name: string; quantity: number }[] = [];

    // Biancheria Letto (bl) - logica MERGE: usa bl['all'] come base + integra mancanti dai gruppi letto
    // ⚠️ Logica IDENTICA a:
    //   - /api/dashboard/cleanings/[id] PATCH (admin mobile)
    //   - EditCleaningModal.tsx save handler
    //   - /api/admin/update-all-pending-orders POST
    // Questa è la logica "principale" del sistema. Garantisce coerenza con l'admin.
    if (config.bl) {
      const hasAll = config.bl['all']
        && typeof config.bl['all'] === 'object'
        && Object.keys(config.bl['all']).length > 0;

      if (hasAll) {
        // MERGE: usa 'all' come base, integra articoli mancanti dai gruppi letto
        const mergedBl: Record<string, number> = {};
        // Prima: somma da gruppi letto (b1, b2, ...)
        Object.entries(config.bl).forEach(([key, val]) => {
          if (key !== 'all' && typeof val === 'object' && val !== null) {
            Object.entries(val as Record<string, number>).forEach(([itemId, qty]) => {
              if (typeof qty === 'number' && qty > 0) {
                mergedBl[itemId] = (mergedBl[itemId] || 0) + qty;
              }
            });
          }
        });
        // Poi: sovrascrivi con bl['all'] (è la fonte di verità per quegli articoli)
        Object.entries(config.bl['all']).forEach(([itemId, qty]) => {
          if (typeof qty === 'number' && qty > 0) {
            mergedBl[itemId] = qty as number;
          }
        });
        // Costruisci items
        Object.entries(mergedBl).forEach(([itemId, qty]) => {
          if (qty > 0) {
            newItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
          }
        });
      } else {
        // Solo gruppi letto: somma da tutti
        Object.entries(config.bl).forEach(([bedId, items]) => {
          if (bedId !== 'all' && typeof items === 'object' && items !== null) {
            Object.entries(items as Record<string, number>).forEach(([itemId, qty]) => {
              if (typeof qty === 'number' && qty > 0) {
                const existing = newItems.find(i => i.id === itemId);
                if (existing) {
                  existing.quantity += qty;
                } else {
                  newItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
                }
              }
            });
          }
        });
      }
    }

    // Biancheria Bagno (ba)
    if (config.ba) {
      Object.entries(config.ba).forEach(([itemId, qty]) => {
        if (typeof qty === 'number' && qty > 0) {
          newItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
        }
      });
    }

    // Kit Cortesia (ki)
    if (config.ki) {
      Object.entries(config.ki).forEach(([itemId, qty]) => {
        if (typeof qty === 'number' && qty > 0) {
          newItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
        }
      });
    }

    // 5. Aggiorna ordine. Confronta per evitare update inutili.
    let updated = 0;
    for (const orderDoc of ordersSnap.docs) {
      const orderData = orderDoc.data() as Record<string, any>;

      // Conserva eventuali items NON-biancheria (es. cleaning_product) presenti nell'ordine
      // così se l'operatore aveva aggiunto prodotti pulizia, questi NON vengono persi
      const existingItems = (orderData.items || []) as any[];
      const preservedItems = existingItems.filter((it: any) =>
        it && (it.type === 'cleaning_product' || it.categoryId === 'prodotti_pulizia')
      );

      const finalItems = [...newItems, ...preservedItems];

      // Confronta items vecchi/nuovi
      const oldSorted = JSON.stringify(existingItems
        .map((i: any) => ({ id: i.id, q: i.quantity }))
        .sort((a: any, b: any) => String(a.id).localeCompare(String(b.id))));
      const newSorted = JSON.stringify(finalItems
        .map((i: any) => ({ id: i.id, q: i.quantity }))
        .sort((a: any, b: any) => String(a.id).localeCompare(String(b.id))));

      // Aggiorna SEMPRE guestsCount sull'ordine (anche se items invariati, così resta coerente)
      const updateData: Record<string, any> = {
        guestsCount,
        updatedAt: Timestamp.now(),
      };
      if (oldSorted !== newSorted) {
        updateData.items = finalItems;
        updateData.itemsUpdatedFromConfig = true;
        updateData.configSource = configSource;
        updateData.itemsRecalculatedAt = Timestamp.now();
      }
      await orderDoc.ref.update(updateData);
      updated++;
    }

    return updated;
  } catch (error) {
    // Logghiamo ma NON propaghiamo: l'update guests non deve fallire per problemi sull'ordine
    console.error(`[guests PATCH] Errore ricalcolo ordine biancheria per cleaning ${cleaningId}:`, error);
    return 0;
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    
    const { id } = await params;
    const _body = await validateBody(req, BookingGuestsSchema);
    if (_body instanceof Response) return _body;
    const { adults, children, infants } = _body;
    
    await adminDb.collection("bookings").doc(id).update({ 
      adults: adults || 0,
      children: children || 0,
      infants: infants || 0,
      updatedAt: new Date()
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Errore aggiornamento ospiti:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// PATCH - Usato da GuestCountForm del proprietario con blocco temporale
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    
    const { id } = await params;
    const _body2 = await validateBody(req, BookingGuestsSchema);
    if (_body2 instanceof Response) return _body2;
    const { guestsCount } = _body2;
    
    if (!guestsCount || guestsCount < 1) {
      return NextResponse.json({ error: "Numero ospiti non valido" }, { status: 400 });
    }
    
    // Carica la prenotazione per verificare la data checkout
    const bookingRef = adminDb.collection("bookings").doc(id);
    const bookingSnap = await bookingRef.get();
    
    if (!bookingSnap.exists) {
      return NextResponse.json({ error: "Prenotazione non trovata" }, { status: 404 });
    }
    
    const bookingData = bookingSnap.data();
    
    // Verifica se l'utente può modificare (è proprietario della proprietà)
    if (user.role !== "ADMIN") {
      // @ts-expect-error TODO-FIX: TS18048 'bookingData' is possibly 'undefined'.
      const propertyRef = adminDb.collection("properties").doc(bookingData.propertyId);
      const propertySnap = await propertyRef.get();
      // @ts-expect-error TODO-FIX: TS2339 Property 'uid' does not exist on type 'ApiUser'.
      if (!propertySnap.exists || (propertySnap.data() as Record<string, any>).ownerId !== user.uid) {
        return NextResponse.json({ error: "Non autorizzato a modificare questa prenotazione" }, { status: 403 });
      }
    }
    
    // Calcola la data di checkout
    let checkoutDate: Date;
    // @ts-expect-error TODO-FIX: TS18048 'bookingData' is possibly 'undefined'.
    if (bookingData.checkOut) {
      // @ts-expect-error TODO-FIX: TS18048 'bookingData' is possibly 'undefined'.
      checkoutDate = bookingData.checkOut.toDate ? bookingData.checkOut.toDate() : new Date(bookingData.checkOut);
    // @ts-expect-error TODO-FIX: TS18048 'bookingData' is possibly 'undefined'.
    } else if (bookingData.endDate) {
      // @ts-expect-error TODO-FIX: TS18048 'bookingData' is possibly 'undefined'.
      checkoutDate = bookingData.endDate.toDate ? bookingData.endDate.toDate() : new Date(bookingData.endDate);
    } else {
      return NextResponse.json({ error: "Data checkout non trovata" }, { status: 400 });
    }
    
    // Verifica blocco temporale (solo per non-admin)
    if (user.role !== "ADMIN") {
      const canModify = canModifyGuests(checkoutDate);
      if (!canModify.allowed) {
        return NextResponse.json({ error: canModify.reason }, { status: 403 });
      }
    }
    
    // Aggiorna la prenotazione
    await bookingRef.update({ 
      guests: guestsCount,
      guestsCount: guestsCount,
      guestsConfirmed: true,
      guestsConfirmedAt: new Date(),
      updatedAt: new Date()
    });
    
    // Aggiorna anche le pulizie associate
    const cleaningsQuery = adminDb.collection("cleanings").where("bookingId", "==", id);
    const cleaningsSnap = await cleaningsQuery.get();
    
    const updatedCleaningIds: string[] = [];
    for (const cleaningDoc of cleaningsSnap.docs) {
      // 🔒 Skip pulizie già completate (consegna fatta, non si tocca)
      const cleaningData = cleaningDoc.data() as Record<string, any>;
      const cleaningStatus = String(cleaningData.status || '').toUpperCase();
      if (cleaningStatus === 'COMPLETED' || cleaningStatus === 'CANCELLED') {
        continue;
      }

      await adminDb.collection("cleanings").doc(cleaningDoc.id).update({
        guestsCount: guestsCount,
        updatedAt: new Date()
      });
      updatedCleaningIds.push(cleaningDoc.id);
    }
    
    // 🔧 FIX CRITICO: dopo aver aggiornato le cleanings, ricalcola gli ordini biancheria
    // PENDING associati. Senza questo step, la card biancheria mostrava sempre la quantità
    // calcolata al momento della creazione dell'ordine, non quella aggiornata.
    //
    // Note:
    // - Si aggiornano SOLO ordini PENDING (rispetta operatore/rider già al lavoro).
    // - Se la cleaning ha linenConfigModified=true, viene rispettata la customLinenConfig
    //   (non si perde la personalizzazione).
    // - Errori sul ricalcolo NON bloccano la risposta: il guestsCount è già stato salvato.
    let ordersUpdated = 0;
    for (const cleaningId of updatedCleaningIds) {
      ordersUpdated += await recalculateLinenOrderForCleaning(cleaningId);
    }
    
    return NextResponse.json({ 
      success: true, 
      guestsCount,
      cleaningsUpdated: updatedCleaningIds.length,
      ordersUpdated,
    });
  } catch (error) {
    console.error("Errore aggiornamento ospiti:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// GET - Verifica se la modifica è ancora permessa
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    
    const { id } = await params;
    
    const bookingRef = adminDb.collection("bookings").doc(id);
    const bookingSnap = await bookingRef.get();
    
    if (!bookingSnap.exists) {
      return NextResponse.json({ error: "Prenotazione non trovata" }, { status: 404 });
    }
    
    const bookingData = bookingSnap.data();
    
    // Calcola la data di checkout
    let checkoutDate: Date;
    // @ts-expect-error TODO-FIX: TS18048 'bookingData' is possibly 'undefined'.
    if (bookingData.checkOut) {
      // @ts-expect-error TODO-FIX: TS18048 'bookingData' is possibly 'undefined'.
      checkoutDate = bookingData.checkOut.toDate ? bookingData.checkOut.toDate() : new Date(bookingData.checkOut);
    // @ts-expect-error TODO-FIX: TS18048 'bookingData' is possibly 'undefined'.
    } else if (bookingData.endDate) {
      // @ts-expect-error TODO-FIX: TS18048 'bookingData' is possibly 'undefined'.
      checkoutDate = bookingData.endDate.toDate ? bookingData.endDate.toDate() : new Date(bookingData.endDate);
    } else {
      return NextResponse.json({ canModify: false, reason: "Data checkout non trovata" });
    }
    
    // Admin può sempre modificare
    if (user.role === "ADMIN") {
      return NextResponse.json({ canModify: true });
    }
    
    const canModify = canModifyGuests(checkoutDate);
    return NextResponse.json({ 
      canModify: canModify.allowed, 
      reason: canModify.reason,
      checkoutDate: checkoutDate.toISOString()
    });
  } catch (error) {
    console.error("Errore verifica modifica ospiti:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
