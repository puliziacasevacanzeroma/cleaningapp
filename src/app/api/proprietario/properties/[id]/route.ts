import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { deletePropertyWithCascade, getPropertyById } from "~/lib/firebase/firestore-data-admin";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, GenericBodySchema } from "~/lib/validation/schemas";

export const dynamic = 'force-dynamic';

// Mappa ID -> nomi leggibili per items biancheria
const ITEM_NAMES: Record<string, string> = {
  'doubleSheets': 'Lenzuola Matrimoniali',
  'singleSheets': 'Lenzuola Singole',
  'pillowcases': 'Federe',
  'towel_bath': 'Telo Doccia',
  'towel_face': 'Asciugamano Viso',
  'towel_bidet': 'Asciugamano Bidet',
  'bathmat': 'Tappetino Scendibagno',
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    
    const { id } = await params;
    const docSnap = await adminDb.collection("properties").doc(id).get();
    
    if (!docSnap.exists) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
    
    // Verifica che il proprietario sia il proprietario di questa proprietà
    const propertyData = docSnap.data() as Record<string, any>;
    if (propertyData.ownerId !== user.id && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }
    
    return NextResponse.json({ id: docSnap.id, ...propertyData });
  } catch (error) {
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    
    const { id } = await params;
    
    // Verifica proprietà
    const docSnap = await adminDb.collection("properties").doc(id).get();
    if (!docSnap.exists) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
    
    const propertyData = docSnap.data() as Record<string, any>;
    if (propertyData.ownerId !== user.id && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }
    
    const data = await validateBody(req, GenericBodySchema);
    if (data instanceof Response) return data;
    
    // 🛡️ PROTEZIONE CRITICA: Non sovrascrivere i link iCal con stringhe vuote
    const protectedFields = ['icalAirbnb', 'icalBooking', 'icalOktorate', 'icalInreception', 'icalKrossbooking'];
    const filteredData = { ...data };
    for (const field of protectedFields) {
      if (field in filteredData && filteredData[field] === '') {
        delete filteredData[field];
      }
    }
    
    await adminDb.collection("properties").doc(id).update({ ...filteredData, updatedAt: new Date() });
    
    // ════════════════════════════════════════════════════════════
    // 🧺 CASCADE: Se usesOwnLinen è cambiato, gestisci ordini biancheria
    // ════════════════════════════════════════════════════════════
    let linenOrdersCancelled = 0;
    let linenOrdersCreated = 0;
    
    if ('usesOwnLinen' in filteredData && filteredData.usesOwnLinen !== propertyData.usesOwnLinen) {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      
      if (filteredData.usesOwnLinen === true) {
        // DISATTIVAZIONE: cancella ordini PENDING/ASSIGNED futuri di tipo LINEN
        if (process.env.NODE_ENV !== "production") console.log(`🧺 [Proprietario] Biancheria DISATTIVATA per "${propertyData.name}" → cancello ordini futuri`);
        
        const ordersSnap = await adminDb.collection("orders").where("propertyId", "==", id).get();
        
        const cancellableStatuses = ["PENDING", "ASSIGNED"];
        
        for (const orderDoc of ordersSnap.docs) {
          const oData = orderDoc.data() as Record<string, any>;
          const scheduledDate = oData.scheduledDate?.toDate?.();
          const isFuture = scheduledDate && scheduledDate >= now;
          const isCancellable = cancellableStatuses.includes(oData.status);
          const isLinenOrder = oData.type === 'LINEN';
          
          if (isFuture && isCancellable && isLinenOrder) {
            const cleaningId = oData.cleaningId;
            // @ts-expect-error TODO-FIX: TS2339 Property 'delete' does not exist on type '"orders"'.
            await adminDb.collection("orders".delete().doc(orderDoc.id));
            linenOrdersCancelled++;
            
            if (cleaningId) {
              try {
                const cSnap = await adminDb.collection("cleanings").doc(cleaningId).get();
                if (cSnap.exists) {
                  await adminDb.collection("cleanings").doc(cleaningId).update({
                    laundryOrderId: null, requiresLaundry: false, hasLinenOrder: false, updatedAt: Timestamp.now(),
                  });
                }
              } catch (e) { /* ignore */ }
            }
          }
        }
        
        // Legacy linen_orders
        try {
          const legacySnap = await adminDb.collection("linen_orders").where("propertyId", "==", id).where("status", "==", "PENDING").get();
          for (const orderDoc of legacySnap.docs) {
            const oData = orderDoc.data() as Record<string, any>;
            const scheduledDate = oData.scheduledDate?.toDate?.();
            if (scheduledDate && scheduledDate >= now) {
              // @ts-expect-error TODO-FIX: TS2339 Property 'delete' does not exist on type '"linen_orders"'.
              await adminDb.collection("linen_orders".delete().doc(orderDoc.id));
              linenOrdersCancelled++;
            }
          }
        } catch (e) { /* legacy */ }
        
      } else {
        // RIATTIVAZIONE: crea ordini per pulizie future senza ordine
        if (process.env.NODE_ENV !== "production") console.log(`🧺 [Proprietario] Biancheria RIATTIVATA per "${propertyData.name}" → creo ordini mancanti`);
        
        const freshProperty = (await getPropertyById(id)) as any;
        const serviceConfigs = freshProperty?.serviceConfigs || {};
        
        if (Object.keys(serviceConfigs).length > 0) {
          const cleaningsSnap = await adminDb.collection("cleanings").where("propertyId", "==", id).get();
          
          for (const cleaningDoc of cleaningsSnap.docs) {
            const cData = cleaningDoc.data() as Record<string, any>;
            const scheduledDate = cData.scheduledDate?.toDate?.();
            if (!scheduledDate || scheduledDate < now) continue;
            if (!["SCHEDULED", "ASSIGNED", "PENDING_APPROVAL"].includes(cData.status)) continue;
            
            // Double-check: ordine già esistente?
            let hasOrder = !!cData.laundryOrderId;
            if (!hasOrder) {
              try {
                const existSnap = await adminDb.collection("orders").where("cleaningId", "==", cleaningDoc.id).where("status", "==", "PENDING").get();
                if (!existSnap.empty) {
                  await adminDb.collection("cleanings").doc(cleaningDoc.id).update({
                    laundryOrderId: existSnap.docs[0].id, requiresLaundry: true, hasLinenOrder: true, updatedAt: Timestamp.now(),
                  });
                  hasOrder = true;
                }
              } catch (e) { /* ignore */ }
            }
            if (hasOrder) continue;
            
            const guestsCount = cData.guestsCount || 2;
            const config = serviceConfigs[guestsCount] || serviceConfigs[String(guestsCount)];
            if (!config) continue;
            
            const newItems: { id: string; name: string; quantity: number }[] = [];
            
            if (config.bl) {
              if (config.bl['all']) {
                Object.entries(config.bl['all']).forEach(([itemId, qty]) => {
                  if (typeof qty === 'number' && qty > 0) newItems.push({ id: itemId, name: ITEM_NAMES[itemId] || itemId, quantity: qty });
                });
              } else {
                Object.entries(config.bl).forEach(([bedId, items]) => {
                  if (typeof items === 'object' && items !== null) {
                    Object.entries(items as Record<string, number>).forEach(([itemId, qty]) => {
                      if (typeof qty === 'number' && qty > 0) {
                        const existing = newItems.find(i => i.id === itemId);
                        if (existing) existing.quantity += qty;
                        else newItems.push({ id: itemId, name: ITEM_NAMES[itemId] || itemId, quantity: qty });
                      }
                    });
                  }
                });
              }
            }
            if (config.ba) {
              Object.entries(config.ba).forEach(([itemId, qty]) => {
                if (typeof qty === 'number' && qty > 0) newItems.push({ id: itemId, name: ITEM_NAMES[itemId] || itemId, quantity: qty });
              });
            }
            if (config.ki) {
              Object.entries(config.ki).forEach(([itemId, qty]) => {
                if (typeof qty === 'number' && qty > 0) newItems.push({ id: itemId, name: ITEM_NAMES[itemId] || itemId, quantity: qty });
              });
            }
            
            if (newItems.length === 0) continue;
            
            const orderRef = await adminDb.collection('orders').add({
              cleaningId: cleaningDoc.id,
              propertyId: id,
              propertyName: freshProperty.name || '',
              propertyAddress: freshProperty.address || '',
              propertyCity: freshProperty.city || '',
              propertyPostalCode: freshProperty.postalCode || '',
              propertyFloor: freshProperty.floor || '',
              propertyApartment: freshProperty.apartment || '',
              propertyIntercom: freshProperty.intercom || '',
              propertyDoorCode: freshProperty.doorCode || '',
              propertyKeysLocation: freshProperty.keysLocation || '',
              propertyAccessNotes: freshProperty.accessNotes || '',
              ownerId: freshProperty.ownerId || '',
              ownerName: freshProperty.ownerName || '',
              items: newItems,
              guestsCount,
              status: 'PENDING',
              type: 'LINEN',
              scheduledDate: cData.scheduledDate,
              scheduledTime: cData.scheduledTime || freshProperty.checkOutTime || '10:00',
              source: 'linen_reactivation',
              createdAt: Timestamp.now(),
              updatedAt: Timestamp.now(),
            });
            
            await adminDb.collection("cleanings").doc(cleaningDoc.id).update({
              laundryOrderId: orderRef.id, requiresLaundry: true, hasLinenOrder: true, updatedAt: Timestamp.now(),
            });
            linenOrdersCreated++;
          }
        }
      }
    }
    
    return NextResponse.json({ 
      success: true,
      linenOrdersCancelled: linenOrdersCancelled > 0 ? linenOrdersCancelled : undefined,
      linenOrdersCreated: linenOrdersCreated > 0 ? linenOrdersCreated : undefined,
    });
  } catch (error) {
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// 🔥 DELETE con CASCATA - elimina anche pulizie, ordini, prenotazioni
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    
    const { id } = await params;
    
    // Verifica proprietà
    const docSnap = await adminDb.collection("properties").doc(id).get();
    if (!docSnap.exists) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
    
    const propertyData = docSnap.data() as Record<string, any>;
    if (propertyData.ownerId !== user.id && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }
    
    // 🔥 USA ELIMINAZIONE A CASCATA
    const result = await deletePropertyWithCascade(id);
    
    return NextResponse.json({ 
      success: true,
      deleted: {
        property: propertyData.name,
        cleanings: result.deletedCleanings,
        orders: result.deletedOrders,
        bookings: result.deletedBookings,
        notifications: result.deletedNotifications
      }
    });
  } catch (error) {
    console.error("Errore DELETE property proprietario:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
