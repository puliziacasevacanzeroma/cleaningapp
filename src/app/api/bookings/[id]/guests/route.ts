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
    
    // Aggiorna anche la pulizia associata se esiste
    const cleaningsQuery = adminDb.collection("cleanings").where("bookingId", "==", id);
    const cleaningsSnap = await cleaningsQuery.get();
    
    let ordersRecalculated = 0;
    
    for (const cleaningDoc of cleaningsSnap.docs) {
      const cleaningData = cleaningDoc.data() as any;
      
      // 1. Aggiorna guestsCount sulla pulizia
      await adminDb.collection("cleanings").doc(cleaningDoc.id).update({
        guestsCount: guestsCount,
        updatedAt: new Date()
      });
      
      // 2. 🔧 FIX (Bug CASALE 2.0): ricalcola l'ordine biancheria collegato
      //    Pattern preso da update-linen-order/route.ts + bookings/[id]/route.ts:304-340
      //    Guard clauses: skip se custom config, no ordine, status sbagliato, no config
      try {
        // Skip se pulizia ha custom linen config (l'utente l'ha personalizzata manualmente)
        if (cleaningData.linenConfigModified === true) {
          if (process.env.NODE_ENV !== "production") console.log(`[guests] Pulizia ${cleaningDoc.id} ha customLinenConfig attiva → skip ricalcolo ordine`);
          continue;
        }
        
        // Skip se non c'è ordine biancheria collegato
        if (!cleaningData.laundryOrderId) continue;
        
        const orderRef = adminDb.collection("orders").doc(cleaningData.laundryOrderId);
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) continue;
        
        const orderData = orderSnap.data() as any;
        // Filtro status: solo ordini ancora ricalcolabili (PENDING o ASSIGNED)
        if (!["PENDING", "ASSIGNED"].includes(orderData.status)) {
          if (process.env.NODE_ENV !== "production") console.log(`[guests] Ordine ${cleaningData.laundryOrderId} in status ${orderData.status} → skip ricalcolo`);
          continue;
        }
        
        // Carica la property per leggere serviceConfigs
        const propertyRef = adminDb.collection("properties").doc(cleaningData.propertyId);
        const propertySnap = await propertyRef.get();
        if (!propertySnap.exists) continue;
        const property = propertySnap.data() as any;
        if (!property.serviceConfigs) continue;
        
        // Cerca config per il nuovo numero ospiti
        const config = property.serviceConfigs[guestsCount] || property.serviceConfigs[String(guestsCount)];
        if (!config) {
          console.warn(`[guests] Ordine ${cleaningData.laundryOrderId}: nessuna serviceConfigs per ${guestsCount} ospiti → skip ricalcolo`);
          continue;
        }
        
        // Calcola newItems (stessa logica di update-linen-order/route.ts:102-148)
        const newItems: { id: string; name: string; quantity: number }[] = [];
        
        if (config.bl) {
          if (config.bl['all']) {
            Object.entries(config.bl['all']).forEach(([itemId, qty]: [string, any]) => {
              if (typeof qty === 'number' && qty > 0) {
                newItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
              }
            });
          } else {
            Object.entries(config.bl).forEach(([bedId, items]: [string, any]) => {
              if (bedId !== 'all' && typeof items === 'object' && items !== null) {
                Object.entries(items).forEach(([itemId, qty]: [string, any]) => {
                  if (typeof qty === 'number' && qty > 0) {
                    const existing = newItems.find(i => i.id === itemId);
                    if (existing) existing.quantity += qty;
                    else newItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
                  }
                });
              }
            });
          }
        }
        
        if (config.ba) {
          Object.entries(config.ba).forEach(([itemId, qty]: [string, any]) => {
            if (typeof qty === 'number' && qty > 0) {
              newItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
            }
          });
        }
        
        if (config.ki) {
          Object.entries(config.ki).forEach(([itemId, qty]: [string, any]) => {
            if (typeof qty === 'number' && qty > 0) {
              newItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
            }
          });
        }
        
        // Aggiorna l'ordine
        await orderRef.update({
          items: newItems,
          guestsCount: guestsCount,
          configSource: `serviceConfigs[${guestsCount}]`,
          itemsUpdatedFromConfig: true,
          updatedAt: new Date(),
        });
        ordersRecalculated++;
        if (process.env.NODE_ENV !== "production") console.log(`[guests] ✅ Ordine ${cleaningData.laundryOrderId} ricalcolato per ${guestsCount} ospiti (${newItems.length} items)`);
      } catch (orderErr: any) {
        // Errore non blocca la response: pulizia è già stata aggiornata,
        // l'ordine può essere ricalcolato manualmente da admin se necessario
        console.error(`[guests] Errore ricalcolo ordine per cleaning ${cleaningDoc.id}:`, orderErr?.message || orderErr);
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      guestsCount,
      cleaningsUpdated: cleaningsSnap.size,
      ordersRecalculated,
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