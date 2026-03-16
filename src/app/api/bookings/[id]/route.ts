/**
 * 📅 API BOOKING [id] - Gestione Singola Prenotazione
 * 
 * GET: Dettagli prenotazione
 * PATCH: Modifica prenotazione
 * DELETE: Elimina prenotazione (con opzione di eliminare anche pulizia)
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getItemName } from "~/lib/itemNames";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, GenericBodySchema } from "~/lib/validation/schemas";

export const dynamic = 'force-dynamic';

// ==================== AUTH ====================

// ==================== CALCOLO BIANCHERIA ====================

function calculateFallbackLinen(guestsCount: number, bedrooms: number, bathrooms: number) {
  const items: { id: string; name: string; quantity: number }[] = [];
  
  // Lenzuola: 1 set per camera (assumiamo matrimoniale)
  items.push({ id: "lenzuolo_matrimoniale", name: getItemName("lenzuolo_matrimoniale"), quantity: bedrooms });
  items.push({ id: "copripiumino_matrimoniale", name: getItemName("copripiumino_matrimoniale"), quantity: bedrooms });
  items.push({ id: "federa_cuscino", name: getItemName("federa_cuscino"), quantity: bedrooms * 2 });
  
  // Asciugamani: 2 per ospite
  items.push({ id: "asciugamano_viso", name: getItemName("asciugamano_viso"), quantity: guestsCount });
  items.push({ id: "asciugamano_doccia", name: getItemName("asciugamano_doccia"), quantity: guestsCount });
  
  // Tappetino bagno: 1 per bagno
  items.push({ id: "tappetino_bagno", name: getItemName("tappetino_bagno"), quantity: bathrooms });
  
  return items;
}

function calculateLinenItemsForProperty(prop: any, guestsCount: number): { id: string; name: string; quantity: number }[] {
  let linenItems: { id: string; name: string; quantity: number }[] = [];
  
  if (prop.serviceConfigs) {
    const config = prop.serviceConfigs[guestsCount] || prop.serviceConfigs[String(guestsCount)];
    
    if (config) {
      if (config.bl) {
        const hasAll = config.bl['all'] && typeof config.bl['all'] === 'object' && Object.keys(config.bl['all']).length > 0;
        
        if (hasAll) {
          Object.entries(config.bl['all']).forEach(([itemId, qty]: [string, any]) => {
            if (typeof qty === 'number' && qty > 0) {
              linenItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
            }
          });
        } else {
          Object.entries(config.bl).forEach(([bedId, items]: [string, any]) => {
            if (bedId !== 'all' && typeof items === 'object') {
              Object.entries(items).forEach(([itemId, qty]: [string, any]) => {
                if (typeof qty === 'number' && qty > 0) {
                  const existing = linenItems.find(i => i.id === itemId);
                  if (existing) {
                    existing.quantity += qty;
                  } else {
                    linenItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
                  }
                }
              });
            }
          });
        }
      }
      
      if (config.ba) {
        Object.entries(config.ba).forEach(([itemId, qty]: [string, any]) => {
          if (typeof qty === 'number' && qty > 0) {
            linenItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
          }
        });
      }
      
      if (config.ki) {
        Object.entries(config.ki).forEach(([itemId, qty]: [string, any]) => {
          if (typeof qty === 'number' && qty > 0) {
            linenItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
          }
        });
      }
    }
  }
  
  if (linenItems.length === 0) {
    const bedrooms = prop.bedrooms || 1;
    const bathrooms = prop.bathrooms || 1;
    linenItems = calculateFallbackLinen(guestsCount, bedrooms, bathrooms);
  }
  
  return linenItems;
}

// ==================== GET: Dettagli Prenotazione ====================

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { id } = await params;

    const bookingRef = adminDb.collection('bookings').doc(id);
    const bookingSnap = await bookingRef.get();

    if (!bookingSnap.exists) {
      return NextResponse.json({ error: "Prenotazione non trovata" }, { status: 404 });
    }

    const booking = { id: bookingSnap.id, ...(bookingSnap.data() as Record<string, any>) };

    // Verifica permessi
    // @ts-expect-error TODO-FIX: TS2339 Property 'uid' does not exist on type 'ApiUser'.
    const userId = user.uid || user.id;
    if (user.role !== 'ADMIN') {
      const propertyRef = adminDb.collection('properties').doc((booking as any).propertyId);
      const propertySnap = await propertyRef.get();
      
      if (!propertySnap.exists || (propertySnap.data() as Record<string, any>).ownerId !== userId) {
        return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
      }
    }

    // Carica pulizia collegata se esiste
    let linkedCleaning = null;
    const cleaningsSnap = await adminDb.collection('cleanings').where('bookingId', '==', id).get();
    
    if (!cleaningsSnap.empty) {
      const cleaningDoc = cleaningsSnap.docs[0];
      linkedCleaning = { id: cleaningDoc.id, ...(cleaningDoc.data() as Record<string, any>) };
    }

    return NextResponse.json({ 
      booking,
      linkedCleaning
    });

  } catch (error: any) {
    console.error("Errore GET booking:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ==================== PATCH: Modifica Prenotazione ====================

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { id } = await params;
    const body = await validateBody(req, GenericBodySchema);
    if (body instanceof Response) return body;

    const bookingRef = adminDb.collection('bookings').doc(id);
    const bookingSnap = await bookingRef.get();

    if (!bookingSnap.exists) {
      return NextResponse.json({ error: "Prenotazione non trovata" }, { status: 404 });
    }

    const existingBooking = bookingSnap.data();

    // Verifica permessi
    // @ts-expect-error TODO-FIX: TS2339 Property 'uid' does not exist on type 'ApiUser'.
    const userId = user.uid || user.id;
    if (user.role !== 'ADMIN') {
      // @ts-expect-error TODO-FIX: TS18048 'existingBooking' is possibly 'undefined'.
      const propertyRef = adminDb.collection('properties').doc(existingBooking.propertyId);
      const propertySnap = await propertyRef.get();
      
      if (!propertySnap.exists || (propertySnap.data() as Record<string, any>).ownerId !== userId) {
        return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
      }
    }

    // Prepara dati aggiornamento
    const updateData: Record<string, any> = {
      updatedAt: Timestamp.now()
    };

    // Campi modificabili
    if (body.guestName !== undefined) updateData.guestName = body.guestName;
    if (body.guestEmail !== undefined) updateData.guestEmail = body.guestEmail;
    if (body.guestPhone !== undefined) updateData.guestPhone = body.guestPhone;
    if (body.guests !== undefined) {
      updateData.guests = body.guests;
      updateData.guestsCount = body.guests;
    }
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.source !== undefined) updateData.source = body.source;

    // Se cambiano le date, valida e aggiorna
    if (body.checkIn || body.checkOut) {
      // @ts-expect-error TODO-FIX: TS2769 No overload matches this call.
      const newCheckIn = body.checkIn ? new Date(body.checkIn) : existingBooking.checkIn?.toDate?.();
      // @ts-expect-error TODO-FIX: TS2769 No overload matches this call.
      const newCheckOut = body.checkOut ? new Date(body.checkOut) : existingBooking.checkOut?.toDate?.();

      if (newCheckOut <= newCheckIn) {
        return NextResponse.json({ error: "checkOut deve essere successivo a checkIn" }, { status: 400 });
      }

      // Verifica overlap (escludendo la prenotazione corrente)
      // @ts-expect-error TODO-FIX: TS18048 'existingBooking' is possibly 'undefined'.
      const existingBookingsSnap = await adminDb.collection('bookings').where('propertyId', '==', existingBooking.propertyId).get();

      // Normalizza date a mezzanotte per confronto
      const normalizeDate = (d: Date) => {
        const normalized = new Date(d);
        normalized.setHours(0, 0, 0, 0);
        return normalized;
      };

      const newCheckInNorm = normalizeDate(newCheckIn);
      const newCheckOutNorm = normalizeDate(newCheckOut);

      for (const bookingDoc of existingBookingsSnap.docs) {
        // Salta la prenotazione corrente
        if (bookingDoc.id === id) continue;
        
        const b = bookingDoc.data() as Record<string, any>;
        const existingCheckIn = b.checkIn?.toDate?.() || new Date(b.checkIn);
        const existingCheckOut = b.checkOut?.toDate?.() || new Date(b.checkOut);

        // Normalizza anche le date esistenti
        const existingCheckInNorm = normalizeDate(existingCheckIn);
        const existingCheckOutNorm = normalizeDate(existingCheckOut);

        // Overlap: il nuovo periodo si sovrappone se inizia PRIMA che l'altro finisca
        // E finisce DOPO che l'altro inizia
        // Ma permettiamo checkout/checkin lo stesso giorno (checkout mattina, checkin pomeriggio)
        const hasOverlap = newCheckInNorm < existingCheckOutNorm && newCheckOutNorm > existingCheckInNorm;
        
        if (hasOverlap) {
          return NextResponse.json({ 
            error: `Sovrapposizione con "${b.guestName || 'altra prenotazione'}" (${existingCheckIn.toLocaleDateString('it-IT')} - ${existingCheckOut.toLocaleDateString('it-IT')})`,
            overlappingBookingId: bookingDoc.id
          }, { status: 409 });
        }
      }

      if (body.checkIn) {
        // @ts-expect-error TODO-FIX: TS2769 No overload matches this call.
        const checkInWithTime = new Date(body.checkIn);
        checkInWithTime.setHours(14, 0, 0, 0);
        updateData.checkIn = Timestamp.fromDate(checkInWithTime);
      }

      if (body.checkOut) {
        // @ts-expect-error TODO-FIX: TS2769 No overload matches this call.
        const checkOutWithTime = new Date(body.checkOut);
        checkOutWithTime.setHours(10, 0, 0, 0);
        updateData.checkOut = Timestamp.fromDate(checkOutWithTime);

        // Se cambia checkout, aggiorna anche la pulizia collegata
        const cleaningsSnap = await adminDb.collection('cleanings').where('bookingId', '==', id).get();

        for (const cleaningDoc of cleaningsSnap.docs) {
          const cleaningData = cleaningDoc.data() as Record<string, any>;
          await adminDb.collection('cleanings').doc(cleaningDoc.id).update({
            scheduledDate: updateData.checkOut,
            updatedAt: Timestamp.now()
          });
          
          // 🔧 FIX: Aggiorna anche la data dell'ordine biancheria collegato
          if (cleaningData.laundryOrderId) {
            try {
              await adminDb.collection('orders').doc(cleaningData.laundryOrderId).update({
                scheduledDate: updateData.checkOut,
                updatedAt: Timestamp.now(),
              });
            } catch (err) { /* ordine potrebbe non esistere */ }
          }
        }
      }
    }

    // Se cambia source, aggiorna anche la pulizia collegata
    if (body.source !== undefined) {
      const cleaningsSnap = await adminDb.collection('cleanings').where('bookingId', '==', id).get();

      for (const cleaningDoc of cleaningsSnap.docs) {
        await adminDb.collection('cleanings').doc(cleaningDoc.id).update({
          bookingSource: body.source,
          updatedAt: Timestamp.now()
        });
      }
    }

    // Se cambiano gli ospiti, aggiorna cleaning e ricalcola ordine biancheria
    if (body.guests !== undefined) {
      const cleaningsSnap = await adminDb.collection('cleanings').where('bookingId', '==', id).get();

      for (const cleaningDoc of cleaningsSnap.docs) {
        const cleaningData = cleaningDoc.data();
        
        // Aggiorna guests sulla cleaning
        await adminDb.collection('cleanings').doc(cleaningDoc.id).update({
          guestsCount: body.guests,
          updatedAt: Timestamp.now()
        });

        // Se c'è un ordine biancheria collegato, ricalcola
        if (cleaningData.laundryOrderId) {
          const orderRef = adminDb.collection('orders').doc(cleaningData.laundryOrderId);
          const orderSnap = await orderRef.get();
          
          if (orderSnap.exists) {
            // Carica la property per calcolare la biancheria
            const propertyRef = adminDb.collection('properties').doc(cleaningData.propertyId);
            const propertySnap = await propertyRef.get();
            
            if (propertySnap.exists) {
              const property = propertySnap.data();
              // Ricalcola biancheria per il nuovo numero di ospiti
              // @ts-expect-error TODO-FIX: TS2345 Argument of type '{} | null' is not assignable to parameter of type 'number'.
              const newLinenItems = calculateLinenItemsForProperty(property, body.guests);
              await orderRef.update({
                items: newLinenItems,
                guestsCount: body.guests,
                updatedAt: Timestamp.now()
              });
            }
          }
        }
      }
    }

    await bookingRef.update(updateData);

    return NextResponse.json({ 
      success: true, 
      message: "Prenotazione aggiornata" 
    });

  } catch (error: any) {
    console.error("Errore PATCH booking:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ==================== DELETE: Elimina Prenotazione ====================

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const deleteCleaning = searchParams.get('deleteCleaning') === 'true';
    const deleteOrder = searchParams.get('deleteOrder') === 'true';

    const bookingRef = adminDb.collection('bookings').doc(id);
    const bookingSnap = await bookingRef.get();

    if (!bookingSnap.exists) {
      return NextResponse.json({ error: "Prenotazione non trovata" }, { status: 404 });
    }

    const booking = bookingSnap.data();

    // Verifica permessi
    // @ts-expect-error TODO-FIX: TS2339 Property 'uid' does not exist on type 'ApiUser'.
    const userId = user.uid || user.id;
    if (user.role !== 'ADMIN') {
      // @ts-expect-error TODO-FIX: TS18048 'booking' is possibly 'undefined'.
      const propertyRef = adminDb.collection('properties').doc(booking.propertyId);
      const propertySnap = await propertyRef.get();
      
      if (!propertySnap.exists || (propertySnap.data() as Record<string, any>).ownerId !== userId) {
        return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
      }
    }

    let cleaningDeleted = false;
    let orderDeleted = false;

    // Elimina pulizia collegata (se richiesto)
    if (deleteCleaning) {
      const cleaningsSnap = await adminDb.collection('cleanings').where('bookingId', '==', id).get();

      for (const cleaningDoc of cleaningsSnap.docs) {
        const cleaningData = cleaningDoc.data() as Record<string, any>;
        const scheduledDate = cleaningData.scheduledDate?.toDate?.();

        // Elimina anche l'ordine biancheria collegato (se richiesto)
        if (deleteOrder) {
          const ordersSnap = await adminDb.collection('orders').where('cleaningId', '==', cleaningDoc.id).get();

          for (const orderDoc of ordersSnap.docs) {
            await adminDb.collection('orders').doc(orderDoc.id).delete();
            orderDeleted = true;
          }
        }

        // 🔒 Crea syncExclusion per impedire che il sync ricrei la pulizia
        // @ts-expect-error TODO-FIX: TS18048 'booking' is possibly 'undefined'.
        if (scheduledDate && booking.source && booking.source !== 'manual' && booking.source !== 'direct' && booking.source !== 'phone') {
          await adminDb.collection('syncExclusions').add({
            // @ts-expect-error TODO-FIX: TS18048 'booking' is possibly 'undefined'.
            propertyId: booking.propertyId,
            originalDate: Timestamp.fromDate(scheduledDate),
            // @ts-expect-error TODO-FIX: TS18048 'booking' is possibly 'undefined'.
            bookingSource: booking.source || '',
            reason: 'DELETED_BY_USER',
            deletedBy: userId,
            bookingId: id,
            // @ts-expect-error TODO-FIX: TS18048 'booking' is possibly 'undefined'.
            guestName: booking.guestName || '',
            createdAt: Timestamp.now(),
          });
          // @ts-expect-error TODO-FIX: TS18048 'booking' is possibly 'undefined'.
          if (process.env.NODE_ENV !== "production") console.log(`🔒 syncExclusion creata per ${booking.propertyId} data ${scheduledDate.toISOString().split('T')[0]}`);

          // Salva anche in cancelledCleanings per storico
          await adminDb.collection('cancelledCleanings').add({
            // @ts-expect-error TODO-FIX: TS18048 'booking' is possibly 'undefined'.
            propertyId: booking.propertyId,
            // @ts-expect-error TODO-FIX: TS18048 'booking' is possibly 'undefined'.
            propertyName: booking.propertyName || cleaningData.propertyName || '',
            originalDate: Timestamp.fromDate(scheduledDate),
            // @ts-expect-error TODO-FIX: TS18048 'booking' is possibly 'undefined'.
            bookingSource: booking.source || '',
            // @ts-expect-error TODO-FIX: TS18048 'booking' is possibly 'undefined'.
            guestName: booking.guestName || '',
            reason: 'Prenotazione eliminata dall\'utente',
            cancelledAt: Timestamp.now(),
            cancelledBy: userId,
          });
        }

        await adminDb.collection('cleanings').doc(cleaningDoc.id).delete();
        cleaningDeleted = true;
      }
    }

    // Elimina prenotazione
    await bookingRef.delete();

    return NextResponse.json({ 
      success: true, 
      message: "Prenotazione eliminata",
      cleaningDeleted,
      orderDeleted
    });

  } catch (error: any) {
    console.error("Errore DELETE booking:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
