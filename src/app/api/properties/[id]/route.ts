import { NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getPropertyById, updateProperty, deletePropertyWithCascade } from "~/lib/firebase/firestore-data-admin";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, GenericBodySchema } from "~/lib/validation/schemas";

export const dynamic = 'force-dynamic';

// GET - Ottieni singola proprietà
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getApiUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const property = await getPropertyById(id);

    if (!property) {
      return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    }

    return NextResponse.json({
      ...property,
      createdAt: property.createdAt?.toDate?.() || new Date(),
      updatedAt: property.updatedAt?.toDate?.() || new Date(),
    });
  } catch (error) {
    console.error("Errore GET property:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// PATCH - Modifica proprietà
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getApiUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await validateBody(request, GenericBodySchema);
    if (body instanceof Response) return body;

    // Verifica che la proprietà esista
    const property = await getPropertyById(id);
    if (!property) {
      return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    }

    // Verifica permessi (admin o proprietario) - case insensitive
    const isAdmin = currentUser.role?.toUpperCase() === "ADMIN";
    const isOwner = property.ownerId === currentUser.id;
    
    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    // 🔥 FIX: Detecta cambiamenti ai link iCal e resetta feedHashes
    const icalFields = ['icalAirbnb', 'icalBooking', 'icalOktorate', 'icalInreception', 'icalKrossbooking'];
    const icalSourceMap: Record<string, string> = {
      'icalAirbnb': 'airbnb',
      'icalBooking': 'booking',
      'icalOktorate': 'oktorate',
      'icalInreception': 'inreception',
      'icalKrossbooking': 'krossbooking',
    };
    
    const changedSources: string[] = [];
    for (const field of icalFields) {
      if (field in body) {
        const oldValue = (property as any)[field] || '';
        const newValue = body[field] || '';
        if (oldValue !== newValue) {
          changedSources.push(icalSourceMap[field]);
        }
      }
    }
    
    // Se ci sono cambiamenti ai link iCal, resetta i feedHashes per quelle fonti
    if (changedSources.length > 0) {
      const currentHashes = (property as any).feedHashes || {};
      const newHashes = { ...currentHashes };
      
      for (const source of changedSources) {
        delete newHashes[source];
      }
      
      body.feedHashes = newHashes;
    }

    // Salva le modifiche sulla proprietà
    await updateProperty(id, body);

    // ========================================================
    // 🚿 Se updateScendibagno richiesto, aggiorna nelle serviceConfigs
    // ========================================================
    if (body.updateScendibagno === true && body.bathrooms && body.bathrooms !== property.bathrooms) {
      const newBathrooms = Number(body.bathrooms);
      const propDoc = await adminDb.collection("properties").doc(id).get();
      const cfgs = propDoc.data()?.serviceConfigs;
      if (cfgs && typeof cfgs === 'object') {
        const updatedCfgs = { ...cfgs };
        let scendibagnoUpdated = false;
        for (const guestKey of Object.keys(updatedCfgs)) {
          const cfg = updatedCfgs[guestKey];
          if (cfg?.ba) {
            const newBa = { ...cfg.ba };
            for (const itemId of Object.keys(newBa)) {
              const keyL = itemId.toLowerCase();
              if (keyL.includes('scendi') || keyL.includes('tappetino') || keyL.includes('bathmat')) {
                newBa[itemId] = newBathrooms;
                scendibagnoUpdated = true;
              }
            }
            updatedCfgs[guestKey] = { ...cfg, ba: newBa };
          }
        }
        if (scendibagnoUpdated) {
          await adminDb.collection("properties").doc(id).update( { serviceConfigs: updatedCfgs, updatedAt: Timestamp.now() });
          
          // Aggiorna ordini biancheria PENDING con la nuova config
          try {
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
            fetch(`${baseUrl}/api/properties/${id}/update-pending-orders`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            }).catch(e => console.warn('⚠️ update-pending-orders after scendibagno error:', e));
          } catch (e) { /* ignore */ }
        }
      }
    }

    let cleaningsUpdated = 0;
    let ordersUpdated = 0;
    let nameUpdated = 0;
    const cascadeDeleted = { cleanings: 0, orders: 0, bookings: 0 };

    // ========================================================
    // 🔥 NUOVO: Se il NOME è cambiato, propaga a pulizie e ordini futuri
    // ========================================================
    if (body.name && body.name !== property.name) {
      const newName = body.name;
      const newAddress = body.address || (property as any).address || '';
      
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      
      // Aggiorna propertyName in TUTTE le pulizie future
      const cleaningsSnap = await adminDb.collection("cleanings").where("propertyId", "==", id).get();
      
      const nameUpdates: Promise<void>[] = [];
      cleaningsSnap.docs.forEach(docSnap => {
        const data = docSnap.data() as Record<string, any>;
        const scheduledDate = data.scheduledDate?.toDate?.();
        const isFuture = scheduledDate && scheduledDate >= now;
        const isNotDone = !["COMPLETED", "CANCELLED"].includes(data.status?.toUpperCase());
        
        if (isFuture && isNotDone) {
          const updateData: any = { 
            propertyName: newName,
            updatedAt: Timestamp.now()
          };
          if (newAddress) {
            updateData.propertyAddress = newAddress;
          }
          nameUpdates.push(
            // @ts-expect-error TODO-FIX: TS2345 Argument of type 'Promise<WriteResult>' is not assignable to parameter of type '...
            adminDb.collection("cleanings").doc(docSnap.id).update(updateData)
          );
        }
      });
      
      // Aggiorna propertyName in TUTTI gli ordini futuri
      const ordersSnap = await adminDb.collection("orders").where("propertyId", "==", id).get();
      
      ordersSnap.docs.forEach(docSnap => {
        const data = docSnap.data() as Record<string, any>;
        const scheduledDate = data.scheduledDate?.toDate?.();
        const isFuture = scheduledDate && scheduledDate >= now;
        const isNotDone = !["COMPLETED", "DELIVERED", "CANCELLED"].includes(data.status?.toUpperCase());
        
        if (isFuture && isNotDone) {
          const updateData: any = { 
            propertyName: newName,
            updatedAt: Timestamp.now()
          };
          if (newAddress) {
            updateData.propertyAddress = newAddress;
          }
          nameUpdates.push(
            // @ts-expect-error TODO-FIX: TS2345 Argument of type 'Promise<WriteResult>' is not assignable to parameter of type '...
            adminDb.collection("orders").doc(docSnap.id).update(updateData)
          );
        }
      });
      
      // Aggiorna propertyName in prenotazioni future
      try {
        const bookingsSnap = await adminDb.collection("bookings").where("propertyId", "==", id).get();
        bookingsSnap.docs.forEach(docSnap => {
          const data = docSnap.data() as Record<string, any>;
          const checkIn = data.checkIn?.toDate?.();
          const isFuture = checkIn && checkIn >= now;
          if (isFuture) {
            nameUpdates.push(
              // @ts-expect-error TODO-FIX: TS2345 Argument of type 'Promise<WriteResult>' is not assignable to parameter of type '...
              adminDb.collection("bookings").doc(docSnap.id).update({ 
                propertyName: newName,
                updatedAt: Timestamp.now()
              })
            );
          }
        });
      } catch (e) {
        console.warn("⚠️ Errore aggiornamento nome prenotazioni:", e);
      }
      
      if (nameUpdates.length > 0) {
        await Promise.all(nameUpdates);
        nameUpdated = nameUpdates.length;
      }
    }

    // ========================================================
    // 🔥 NUOVO: Se lo STATUS diventa INACTIVE o DELETED → elimina TUTTI i dati futuri
    // ========================================================
    if (body.status && (body.status === 'INACTIVE' || body.status === 'DELETED') && property.status === 'ACTIVE') {
      
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      
      // Cancella pulizie future (non completate, non in corso)
      const cleaningsSnap = await adminDb.collection("cleanings").where("propertyId", "==", id).get();
      
      const cleaningIdsToDelete: string[] = [];
      for (const docSnap of cleaningsSnap.docs) {
        const data = docSnap.data() as Record<string, any>;
        const scheduledDate = data.scheduledDate?.toDate?.();
        const isFuture = scheduledDate && scheduledDate >= now;
        const status = data.status?.toUpperCase();
        const canDelete = status !== "COMPLETED" && status !== "IN_PROGRESS";
        
        if (isFuture && canDelete) {
          cleaningIdsToDelete.push(docSnap.id);
          await adminDb.collection("cleanings").doc(docSnap.id).delete();
          cascadeDeleted.cleanings++;
        }
      }
      
      // Cancella ordini futuri per propertyId
      const ordersSnap = await adminDb.collection("orders").where("propertyId", "==", id).get();
      
      for (const docSnap of ordersSnap.docs) {
        const data = docSnap.data() as Record<string, any>;
        const scheduledDate = data.scheduledDate?.toDate?.();
        const isFuture = scheduledDate && scheduledDate >= now;
        const status = data.status?.toUpperCase();
        const canDelete = status !== "COMPLETED" && status !== "DELIVERED";
        
        if (isFuture && canDelete) {
          await adminDb.collection("orders").doc(docSnap.id).delete();
          cascadeDeleted.orders++;
        }
      }
      
      // Cancella anche ordini collegati alle pulizie eliminate (per cleaningId)
      if (cleaningIdsToDelete.length > 0) {
        for (let i = 0; i < cleaningIdsToDelete.length; i += 30) {
          const chunk = cleaningIdsToDelete.slice(i, i + 30);
          try {
            const linkedOrders = await adminDb.collection("orders").where("cleaningId", "in", chunk).get();
            for (const docSnap of linkedOrders.docs) {
              const data = docSnap.data() as Record<string, any>;
              const status = data.status?.toUpperCase();
              if (status !== "COMPLETED" && status !== "DELIVERED") {
                try {
                  await adminDb.collection("orders").doc(docSnap.id).delete();
                  cascadeDeleted.orders++;
                } catch (e) { /* già eliminato */ }
              }
            }
          } catch (e) {
            console.warn("⚠️ Errore eliminazione ordini linked:", e);
          }
        }
      }
      
      // Cancella prenotazioni future
      try {
        const bookingsSnap = await adminDb.collection("bookings").where("propertyId", "==", id).get();
        for (const docSnap of bookingsSnap.docs) {
          const data = docSnap.data() as Record<string, any>;
          const checkIn = data.checkIn?.toDate?.();
          const isFuture = checkIn && checkIn >= now;
          if (isFuture) {
            await adminDb.collection("bookings").doc(docSnap.id).delete();
            cascadeDeleted.bookings++;
          }
        }
      } catch (e) {
        console.warn("⚠️ Errore cancellazione prenotazioni:", e);
      }
      
      // Cancella anche da linen_orders (legacy)
      try {
        const linenOrdersSnap = await adminDb.collection("linen_orders").where("propertyId", "==", id).get();
        for (const docSnap of linenOrdersSnap.docs) {
          const data = docSnap.data() as Record<string, any>;
          const scheduledDate = data.scheduledDate?.toDate?.();
          const isFuture = scheduledDate && scheduledDate >= now;
          if (isFuture && data.status !== "COMPLETED") {
            await adminDb.collection("linen_orders").doc(docSnap.id).delete();
            cascadeDeleted.orders++;
          }
        }
      } catch (e) {
      }
      
    }

    // ========================================================
    // Se il checkOutTime è cambiato, aggiorna pulizie future
    // ========================================================
    // @ts-expect-error TODO-FIX: TS2339 Property 'checkOutTime' does not exist on type 'Property'.
    if (body.checkOutTime && body.checkOutTime !== property.checkOutTime) {
      const newCheckout = body.checkOutTime;
      
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      
      const cleaningsSnap = await adminDb.collection("cleanings").where("propertyId", "==", id).get();
      
      const batch: Promise<void>[] = [];
      cleaningsSnap.docs.forEach(docSnap => {
        const data = docSnap.data() as Record<string, any>;
        const scheduledDate = data.scheduledDate?.toDate?.();
        const isFuture = scheduledDate && scheduledDate >= now;
        const isScheduled = ["SCHEDULED", "ASSIGNED", "PENDING_APPROVAL"].includes(data.status);
        const isNotManual = !data.timeManuallySet;
        
        if (isFuture && isScheduled && isNotManual) {
          batch.push(
            // @ts-expect-error TODO-FIX: TS2345 Argument of type 'Promise<WriteResult>' is not assignable to parameter of type '...
            adminDb.collection("cleanings").doc(docSnap.id).update({ 
              scheduledTime: newCheckout,
              updatedAt: Timestamp.now()
            })
          );
          cleaningsUpdated++;
        }
      });
      
      // Aggiorna anche ordini biancheria futuri (collection orders)
      const ordersSnapTime = await adminDb.collection("orders").where("propertyId", "==", id).get();
      
      ordersSnapTime.docs.forEach(docSnap => {
        const data = docSnap.data() as Record<string, any>;
        const scheduledDate = data.scheduledDate?.toDate?.();
        const isFuture = scheduledDate && scheduledDate >= now;
        const isPending = data.status === "PENDING";
        const isNotManual = !data.timeManuallySet;
        
        if (isFuture && isPending && isNotManual) {
          batch.push(
            // @ts-expect-error TODO-FIX: TS2345 Argument of type 'Promise<WriteResult>' is not assignable to parameter of type '...
            adminDb.collection("orders").doc(docSnap.id).update({ 
              scheduledTime: newCheckout,
              updatedAt: Timestamp.now()
            })
          );
          ordersUpdated++;
        }
      });
      
      // Aggiorna anche linen_orders legacy
      try {
        const linenOrdersSnap = await adminDb.collection("linen_orders").where("propertyId", "==", id).get();
        
        linenOrdersSnap.docs.forEach(docSnap => {
          const data = docSnap.data() as Record<string, any>;
          const scheduledDate = data.scheduledDate?.toDate?.();
          const isFuture = scheduledDate && scheduledDate >= now;
          const isPending = data.status === "PENDING";
          const isNotManual = !data.timeManuallySet;
          
          if (isFuture && isPending && isNotManual) {
            batch.push(
              // @ts-expect-error TODO-FIX: TS2345 Argument of type 'Promise<WriteResult>' is not assignable to parameter of type '...
              adminDb.collection("linen_orders").doc(docSnap.id).update({ 
                scheduledTime: newCheckout,
                updatedAt: Timestamp.now()
              })
            );
          }
        });
      } catch (e) {
        console.warn("⚠️ linen_orders checkout update ignorato");
      }
      
      if (batch.length > 0) {
        await Promise.all(batch);
      }
    }

    // ========================================================
    // 🔄 Se maxGuests è cambiato, aggiorna pulizie future non confermate
    // ========================================================
    let guestsUpdated = 0;
    
    const bodyMaxGuests = body.maxGuests !== undefined ? Number(body.maxGuests) : null;
    const propMaxGuests = property.maxGuests !== undefined ? Number(property.maxGuests) : null;
    
    
    if (bodyMaxGuests !== null && bodyMaxGuests !== propMaxGuests) {
      const newMax = bodyMaxGuests;
      const oldMax = propMaxGuests || 1;
      
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      
      const futureCleaningsSnap = await adminDb.collection("cleanings").where("propertyId", "==", id).get();
      
      
      for (const cleaningDoc of futureCleaningsSnap.docs) {
        const cData = cleaningDoc.data() as Record<string, any>;
        const scheduledDate = cData.scheduledDate?.toDate?.();
        if (!scheduledDate || scheduledDate < now) {
          continue;
        }
        if (!["SCHEDULED", "ASSIGNED", "PENDING_APPROVAL"].includes(cData.status)) {
          continue;
        }
        
        // Skip solo se ospiti confermati manualmente da proprietario/prenotazione reale
        if (cData.guestsConfirmed === true && cData.guestsAppliedBySystem !== true) {
          continue;
        }
        
        const currentGuests = cData.guestsCount || 0;
        
        // Aggiorna se: 
        // - ospiti a 0 (non impostati)
        // - ospiti == vecchio max (erano al default precedente)
        // - ospiti impostati dal sistema (guestsAppliedBySystem)
        // - ospiti > nuovo max (superano la nuova capienza, devo ridurli)
        // - ospiti != nuovo max e non confermati (catch-all per sicurezza)
        const shouldUpdate = currentGuests === 0 
          || currentGuests === oldMax 
          || cData.guestsAppliedBySystem === true 
          || currentGuests > newMax
          || currentGuests !== newMax;
        
        
        if (shouldUpdate) {
          await adminDb.collection("cleanings").doc(cleaningDoc.id).update( {
            guestsCount: newMax,
            guestsAppliedBySystem: true,
            updatedAt: Timestamp.now(),
          });
          guestsUpdated++;
        }
      }
      
      if (guestsUpdated > 0) {
        
        // Aggiorna anche ordini biancheria via update-pending-orders
        try {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
          fetch(`${baseUrl}/api/properties/${id}/update-pending-orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          }).catch(e => console.warn('⚠️ update-pending-orders fire-and-forget error:', e));
        } catch (e) { /* ignore */ }
      }
    }

    // ========================================================
    // 🧺 Se usesOwnLinen è cambiato, gestisci ordini biancheria futuri
    // ========================================================
    let linenOrdersCancelled = 0;
    let linenOrdersCreated = 0;
    
    // Mappa ID -> nomi leggibili (stessa di update-pending-orders)
    const ITEM_NAMES: Record<string, string> = {
      'doubleSheets': 'Lenzuola Matrimoniali',
      'singleSheets': 'Lenzuola Singole',
      'pillowcases': 'Federe',
      'towel_bath': 'Telo Doccia',
      'towel_face': 'Asciugamano Viso',
      'towel_bidet': 'Asciugamano Bidet',
      'bathmat': 'Tappetino Scendibagno',
    };
    
    if ('usesOwnLinen' in body && body.usesOwnLinen !== property.usesOwnLinen) {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      
      if (body.usesOwnLinen === true) {
        // ══════════════════════════════════════════
        // DISATTIVAZIONE: cancella tutti gli ordini futuri non ancora consegnati
        // ══════════════════════════════════════════
        
        // 1. Trova TUTTI gli ordini per questa proprietà (filtro status client-side)
        const ordersSnap = await adminDb.collection("orders").where("propertyId", "==", id).get();
        
        // Stati cancellabili (non ancora in consegna o completati)
        const cancellableStatuses = ["PENDING", "ASSIGNED"];
        
        for (const orderDoc of ordersSnap.docs) {
          const data = orderDoc.data() as Record<string, any>;
          const scheduledDate = data.scheduledDate?.toDate?.();
          const isFuture = scheduledDate && scheduledDate >= now;
          const isCancellable = cancellableStatuses.includes(data.status);
          const isLinenOrder = data.type === 'LINEN';
          
          if (isFuture && isCancellable && isLinenOrder) {
            const cleaningId = data.cleaningId;
            
            // Cancella l'ordine
            await adminDb.collection("orders").doc(orderDoc.id).delete();
            linenOrdersCancelled++;
            
            // Rimuovi il riferimento dalla pulizia collegata
            if (cleaningId) {
              try {
                const cleaningSnap = await adminDb.collection("cleanings").doc(cleaningId).get();
                if (cleaningSnap.exists) {
                  await adminDb.collection("cleanings").doc(cleaningId).update( {
                    laundryOrderId: null,
                    requiresLaundry: false,
                    hasLinenOrder: false,
                    updatedAt: Timestamp.now(),
                  });
                }
              } catch (e) {
                console.warn(`⚠️ Pulizia ${cleaningId} non aggiornata:`, e);
              }
            }
          }
        }
        
        // 2. Cancella anche da linen_orders (legacy collection)
        try {
          const legacySnap = await adminDb.collection("linen_orders").where("propertyId", "==", id).where("status", "==", "PENDING").get();
          for (const orderDoc of legacySnap.docs) {
            const data = orderDoc.data() as Record<string, any>;
            const scheduledDate = data.scheduledDate?.toDate?.();
            if (scheduledDate && scheduledDate >= now) {
              await adminDb.collection("linen_orders").doc(orderDoc.id).delete();
              linenOrdersCancelled++;
            }
          }
        } catch (e) { /* legacy collection might not exist */ }
        
        
      } else {
        // ══════════════════════════════════════════
        // RIATTIVAZIONE: crea ordini per pulizie future che non ne hanno
        // ══════════════════════════════════════════
        
        // Rileggi proprietà aggiornata (con serviceConfigs)
        const propertyData = (await getPropertyById(id)) as any;
        const serviceConfigs = propertyData?.serviceConfigs || {};
        
        if (Object.keys(serviceConfigs).length === 0) {
        } else {
          // Trova pulizie future attive senza ordine
          const cleaningsSnap = await adminDb.collection("cleanings").where("propertyId", "==", id).get();
          
          for (const cleaningDoc of cleaningsSnap.docs) {
            const cData = cleaningDoc.data() as Record<string, any>;
            const scheduledDate = cData.scheduledDate?.toDate?.();
            const isFuture = scheduledDate && scheduledDate >= now;
            const isActive = ["SCHEDULED", "ASSIGNED", "PENDING_APPROVAL"].includes(cData.status);
            
            if (!isFuture || !isActive) continue;
            
            // Double-check: verifica che non esista già un ordine per questa pulizia
            // (potrebbe esistere nel DB anche se laundryOrderId è null sulla pulizia)
            let hasExistingOrder = !!cData.laundryOrderId;
            if (!hasExistingOrder) {
              try {
                const existingSnap = await adminDb.collection("orders").where("cleaningId", "==", cleaningDoc.id).where("status", "==", "PENDING").get();
                hasExistingOrder = !existingSnap.empty;
                if (hasExistingOrder) {
                  // Fix: aggiorna riferimento mancante sulla pulizia
                  await adminDb.collection("cleanings").doc(cleaningDoc.id).update( {
                    laundryOrderId: existingSnap.docs[0].id,
                    requiresLaundry: true,
                    hasLinenOrder: true,
                    updatedAt: Timestamp.now(),
                  });
                }
              } catch (e) { /* ignore */ }
            }
            
            if (hasExistingOrder) continue;
            
            const guestsCount = cData.guestsCount || 2;
            const config = serviceConfigs[guestsCount] || serviceConfigs[String(guestsCount)];
            
            if (!config) {
              continue;
            }
            
            // Calcola items dalla config
            const newItems: { id: string; name: string; quantity: number }[] = [];
            
            // Biancheria Letto (bl)
            if (config.bl) {
              if (config.bl['all']) {
                Object.entries(config.bl['all']).forEach(([itemId, qty]) => {
                  if (typeof qty === 'number' && qty > 0) {
                    newItems.push({ id: itemId, name: ITEM_NAMES[itemId] || itemId, quantity: qty });
                  }
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
            
            // Biancheria Bagno (ba)
            if (config.ba) {
              Object.entries(config.ba).forEach(([itemId, qty]) => {
                if (typeof qty === 'number' && qty > 0) {
                  newItems.push({ id: itemId, name: ITEM_NAMES[itemId] || itemId, quantity: qty });
                }
              });
            }
            
            // Kit Cortesia (ki)
            if (config.ki) {
              Object.entries(config.ki).forEach(([itemId, qty]) => {
                if (typeof qty === 'number' && qty > 0) {
                  newItems.push({ id: itemId, name: ITEM_NAMES[itemId] || itemId, quantity: qty });
                }
              });
            }
            
            if (newItems.length === 0) {
              continue;
            }
            
            const orderData = {
              cleaningId: cleaningDoc.id,
              propertyId: id,
              propertyName: propertyData.name || '',
              propertyAddress: propertyData.address || '',
              propertyCity: propertyData.city || '',
              propertyPostalCode: propertyData.postalCode || '',
              propertyFloor: propertyData.floor || '',
              propertyApartment: propertyData.apartment || '',
              propertyIntercom: propertyData.intercom || '',
              propertyDoorCode: propertyData.doorCode || '',
              propertyKeysLocation: propertyData.keysLocation || '',
              propertyAccessNotes: propertyData.accessNotes || '',
              ownerId: propertyData.ownerId || '',
              ownerName: propertyData.ownerName || '',
              items: newItems,
              guestsCount,
              status: 'PENDING',
              type: 'LINEN',
              scheduledDate: cData.scheduledDate,
              scheduledTime: cData.scheduledTime || propertyData.checkOutTime || '10:00',
              source: 'linen_reactivation',
              createdAt: Timestamp.now(),
              updatedAt: Timestamp.now(),
            };
            
            const orderRef = await adminDb.collection("orders").add( orderData);
            
            await adminDb.collection("cleanings").doc(cleaningDoc.id).update( {
              laundryOrderId: orderRef.id,
              requiresLaundry: true,
              hasLinenOrder: true,
              updatedAt: Timestamp.now(),
            });
            
            linenOrdersCreated++;
          }
        }
        
      }
    }

    return NextResponse.json({ 
      success: true,
      feedHashesReset: changedSources.length > 0 ? changedSources : undefined,
      cleaningsUpdated,
      nameUpdated,
      guestsUpdated: guestsUpdated > 0 ? guestsUpdated : undefined,
      cascadeDeleted: cascadeDeleted.cleanings + cascadeDeleted.orders + cascadeDeleted.bookings > 0 ? cascadeDeleted : undefined,
      linenOrdersCancelled: linenOrdersCancelled > 0 ? linenOrdersCancelled : undefined,
      linenOrdersCreated: linenOrdersCreated > 0 ? linenOrdersCreated : undefined,
    });
  } catch (error) {
    console.error("Errore PATCH property:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// DELETE - Elimina proprietà CON CASCATA (pulizie, ordini, prenotazioni)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getApiUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const { id } = await params;

    // Verifica che la proprietà esista
    const property = await getPropertyById(id);
    if (!property) {
      return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    }

    // Verifica permessi (admin o proprietario) - case insensitive
    const isAdmin = currentUser.role?.toUpperCase() === "ADMIN";
    const isOwner = property.ownerId === currentUser.id;
    
    
    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    // 🔥 USA ELIMINAZIONE A CASCATA
    const result = await deletePropertyWithCascade(id);


    return NextResponse.json({ 
      success: true,
      deleted: {
        property: property.name,
        cleanings: result.deletedCleanings,
        orders: result.deletedOrders,
        bookings: result.deletedBookings,
        notifications: result.deletedNotifications
      }
    });
  } catch (error) {
    console.error("Errore DELETE property:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
