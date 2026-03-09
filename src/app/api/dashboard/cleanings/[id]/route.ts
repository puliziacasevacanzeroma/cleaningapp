import { NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getItemName } from "~/lib/itemNames";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, CleaningUpdateSchema } from "~/lib/validation/schemas";

export const dynamic = 'force-dynamic';

// GET - Ottieni singola pulizia
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { id } = await params;
    const docSnap = await adminDb.collection("cleanings").doc(id).get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }

    const cleaning = { id: docSnap.id, ...(docSnap.data() as Record<string, any>) };
    // @ts-expect-error TODO-FIX: TS2339 Property 'propertyId' does not exist on type '{ id: string; }'.
    const propertySnap = await adminDb.collection("properties").doc(cleaning.propertyId as string).get();
    const property = propertySnap.exists ? propertySnap.data() : null;

    return NextResponse.json({
      id: cleaning.id,
      // @ts-expect-error TODO-FIX: TS2339 Property 'scheduledDate' does not exist on type '{ id: string; }'.
      date: (cleaning.scheduledDate as any)?.toDate?.() || new Date(),
      // @ts-expect-error TODO-FIX: TS2339 Property 'scheduledTime' does not exist on type '{ id: string; }'.
      scheduledTime: cleaning.scheduledTime || "10:00",
      // @ts-expect-error TODO-FIX: TS2339 Property 'status' does not exist on type '{ id: string; }'.
      status: cleaning.status || "pending",
      // @ts-expect-error TODO-FIX: TS2339 Property 'guestsCount' does not exist on type '{ id: string; }'.
      guestsCount: cleaning.guestsCount || 2,
      // @ts-expect-error TODO-FIX: TS2339 Property 'notes' does not exist on type '{ id: string; }'.
      notes: cleaning.notes || "",
      // @ts-expect-error TODO-FIX: TS2339 Property 'bookingSource' does not exist on type '{ id: string; }'.
      bookingSource: cleaning.bookingSource || null,
      // @ts-expect-error TODO-FIX: TS2339 Property 'bookingId' does not exist on type '{ id: string; }'.
      bookingId: cleaning.bookingId || null,
      property: {
        // @ts-expect-error TODO-FIX: TS2339 Property 'propertyId' does not exist on type '{ id: string; }'.
        id: cleaning.propertyId || "",
        // @ts-expect-error TODO-FIX: TS2339 Property 'propertyName' does not exist on type '{ id: string; }'.
        name: cleaning.propertyName || property?.name || "Proprietà",
        address: property?.address || "",
      },
      // @ts-expect-error TODO-FIX: TS2339 Property 'operatorId' does not exist on type '{ id: string; }'.
      operator: cleaning.operatorId ? {
        // @ts-expect-error TODO-FIX: TS2339 Property 'operatorId' does not exist on type '{ id: string; }'.
        id: cleaning.operatorId,
        // @ts-expect-error TODO-FIX: TS2339 Property 'operatorName' does not exist on type '{ id: string; }'.
        name: cleaning.operatorName || "Operatore",
      } : null,
    });
  } catch (error) {
    console.error("Errore GET cleaning:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// PATCH - Modifica pulizia (con gestione esclusione se cambia data)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { id } = await params;
    const body = await validateBody(request, CleaningUpdateSchema);
    if (body instanceof Response) return body;
    const { scheduledDate, scheduledTime, guestsCount, status, notes, operatorId, operatorName, operators, linenConfigModified, removeCustomLinenConfig } = body;

    // Carica pulizia esistente
    const docSnap = await adminDb.collection("cleanings").doc(id).get();
    if (!docSnap.exists) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }

    const existingCleaning = docSnap.data()!;
    const existingDate = existingCleaning.scheduledDate?.toDate?.();

    const updateData: Record<string, unknown> = {};
    let dateChanged = false;

    // Se cambia la data, crea esclusione per la data originale
    if (scheduledDate !== undefined) {
      const newDate = new Date(scheduledDate);
      
      if (existingDate) {
        const existingDateStr = existingDate.toISOString().split('T')[0];
        const newDateStr = newDate.toISOString().split('T')[0];
        
        if (existingDateStr !== newDateStr) {
          dateChanged = true;
          
          // 🔐 Crea esclusione per la data ORIGINALE (così non viene ricreata)
          if (existingCleaning.bookingSource) {
            await adminDb.collection("syncExclusions").add({
              propertyId: existingCleaning.propertyId,
              originalDate: existingCleaning.scheduledDate,
              bookingSource: existingCleaning.bookingSource,
              reason: "MOVED",
              newDate: Timestamp.fromDate(newDate),
              cleaningId: id,
              createdAt: Timestamp.now(),
              createdBy: user.id || user.email,
            });
          }
        }
      }
      
      updateData.scheduledDate = Timestamp.fromDate(newDate);
    }

    if (scheduledTime !== undefined) updateData.scheduledTime = scheduledTime;
    if (guestsCount !== undefined) updateData.guestsCount = guestsCount;
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;
    if (operatorId !== undefined) updateData.operatorId = operatorId;
    if (operatorName !== undefined) updateData.operatorName = operatorName;
    if (operators !== undefined) updateData.operators = operators;
    
    // 🔧 Gestione biancheria personalizzata
    if (linenConfigModified !== undefined) {
      updateData.linenConfigModified = linenConfigModified;
    }
    
    // Se richiesto esplicitamente, rimuovi customLinenConfig
    if (removeCustomLinenConfig === true) {
      updateData.customLinenConfig = FieldValue.delete();
    }

    // Marca come modificata manualmente
    if (dateChanged) {
      updateData.manuallyModified = true;
      updateData.modifiedAt = Timestamp.now();
      updateData.modifiedBy = user.id || user.email;
    }

    updateData.updatedAt = Timestamp.now();

    await adminDb.collection("cleanings").doc(id).update(updateData);

    // ─── 🔧 FIX: AGGIORNA ORDINE BIANCHERIA QUANDO PASSA A STANDARD ───
    const wasCustom = existingCleaning.linenConfigModified === true;
    const isBecomingStandard = removeCustomLinenConfig === true || linenConfigModified === false;
    const guestsChanged = guestsCount !== undefined && guestsCount !== existingCleaning.guestsCount;
    
    if ((wasCustom && isBecomingStandard) || (guestsChanged && !wasCustom)) {
      try {
        const targetGuestsCount = guestsCount ?? existingCleaning.guestsCount;
        
        // Cerca ordini PENDING collegati
        const ordersSnap = await adminDb.collection("orders").where("cleaningId", "==", id).get();
        
        if (!ordersSnap.empty) {
          // Carica proprietà per serviceConfigs
          const propertyDoc = await adminDb.collection("properties").doc(existingCleaning.propertyId).get();
          const propData = propertyDoc.data() as Record<string, any>;
          
          if (propData?.serviceConfigs) {
            const newConfig = propData.serviceConfigs[targetGuestsCount] || 
                             propData.serviceConfigs[String(targetGuestsCount)];
            
            if (newConfig) {
              // Calcola nuovi items
              const newItems: { id: string; name: string; quantity: number }[] = [];
              
              // BIANCHERIA LETTO
              if (newConfig.bl) {
                const hasAll = newConfig.bl['all'] && 
                              typeof newConfig.bl['all'] === 'object' && 
                              Object.keys(newConfig.bl['all']).length > 0;
                
                if (hasAll) {
                  Object.entries(newConfig.bl['all']).forEach(([itemId, qty]) => {
                    if (typeof qty === 'number' && qty > 0) {
                      newItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
                    }
                  });
                } else {
                  Object.entries(newConfig.bl).forEach(([bedId, items]) => {
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
              
              // BIANCHERIA BAGNO
              if (newConfig.ba) {
                Object.entries(newConfig.ba).forEach(([itemId, qty]) => {
                  if (typeof qty === 'number' && qty > 0) {
                    newItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
                  }
                });
              }
              
              // KIT CORTESIA
              if (newConfig.ki) {
                Object.entries(newConfig.ki).forEach(([itemId, qty]) => {
                  if (typeof qty === 'number' && qty > 0) {
                    newItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
                  }
                });
              }
              
              // Aggiorna ordini PENDING
              for (const orderDoc of ordersSnap.docs) {
                const orderData = orderDoc.data() as Record<string, any>;
                if (orderData.status === "PENDING") {
                  await adminDb.collection("orders").doc(orderDoc.id).update({
                    items: newItems,
                    updatedAt: Timestamp.now(),
                    guestsCountUpdated: targetGuestsCount,
                    configSource: `serviceConfigs[${targetGuestsCount}]`,
                  });
                }
              }
            }
          }
        }
      } catch (orderError) {
        console.error("Errore aggiornamento ordine:", orderError);
      }
    }

    return NextResponse.json({
      success: true,
      dateChanged,
      message: dateChanged 
        ? "Pulizia spostata. La data originale non verrà ricreata dalla sync." 
        : "Pulizia aggiornata",
    });
  } catch (error) {
    console.error("Errore PATCH cleaning:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// DELETE - Elimina pulizia (con esclusione dalla sync)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { id } = await params;
    
    // Carica pulizia prima di eliminarla
    const docSnap = await adminDb.collection("cleanings").doc(id).get();
    if (!docSnap.exists) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }

    const cleaning = docSnap.data()!;

    // 🔐 Se la pulizia era collegata a una prenotazione iCal, crea esclusione
    if (cleaning.bookingSource && cleaning.scheduledDate) {
      await adminDb.collection("syncExclusions").add({
        propertyId: cleaning.propertyId,
        originalDate: cleaning.scheduledDate,
        bookingSource: cleaning.bookingSource,
        bookingId: cleaning.bookingId || null,
        reason: "DELETED",
        createdAt: Timestamp.now(),
        createdBy: user.id || user.email,
      });
    }

    // Elimina la pulizia
    await adminDb.collection("cleanings").doc(id).delete();

    return NextResponse.json({ 
      success: true,
      excluded: !!cleaning.bookingSource,
      message: cleaning.bookingSource 
        ? "Pulizia eliminata. Non verrà ricreata dalla sincronizzazione." 
        : "Pulizia eliminata.",
    });
  } catch (error) {
    console.error("Errore DELETE cleaning:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
