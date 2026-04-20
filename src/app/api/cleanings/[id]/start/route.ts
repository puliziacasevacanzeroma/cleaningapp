import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { createNotification } from "~/lib/firebase/notifications-admin";
import { getApiUser } from "~/lib/api-auth";
import { resend, FROM_EMAIL, APP_URL } from "~/lib/email/config";
import { cleaningStartedEmail } from "~/lib/email/templates";
import { getItemName } from "~/lib/itemNames";
import { checkActiveShift } from "~/lib/shifts/checkActiveShift";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    
    const { id } = await params;
    
    // Carica la pulizia
    const cleaningRef = adminDb.collection("cleanings").doc(id);
    const cleaningSnap = await cleaningRef.get();
    
    if (!cleaningSnap.exists) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }
    
    const cleaning = cleaningSnap.data();
    
    // ─── VERIFICA STATO ───
    const validStatuses = ["SCHEDULED", "ASSIGNED", "assigned", "pending"];
    // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
    if (!validStatuses.includes(cleaning.status)) {
      return NextResponse.json({ 
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        error: `Impossibile iniziare: stato attuale "${cleaning.status}"` 
      }, { status: 400 });
    }
    
    // ─── VERIFICA OPERATORE ───
    // L'operatore può iniziare solo se è assegnato a questa pulizia
    const isAdmin = user.role?.toUpperCase() === "ADMIN";
    const isAssignedOperator = 
      // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
      cleaning.operatorId === user.id ||
      // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
      (cleaning.operators || []).some((op: { id: string }) => op.id === user.id);
    
    if (!isAdmin && !isAssignedOperator) {
      return NextResponse.json({ 
        error: "Non sei assegnato a questa pulizia" 
      }, { status: 403 });
    }
    
    // ─── VERIFICA TURNO ATTIVO (solo per non-admin) ───
    // Regola business: operatore/rider DEVE avere timbrato l'inizio turno
    // per poter iniziare un lavoro. Admin esentato.
    if (!isAdmin) {
      const { onShift } = await checkActiveShift(user.id);
      if (!onShift) {
        return NextResponse.json({
          error: "Devi timbrare l'inizio turno prima di iniziare una pulizia",
          code: "SHIFT_REQUIRED",
        }, { status: 403 });
      }
    }
    
    // ─── AGGIORNA PULIZIA ───
    const now = Timestamp.now();
    
    const updateData: any = { 
      status: "IN_PROGRESS",
      startedAt: now,
      startedBy: user.id,
      updatedAt: now,
    };
    
    // 🔥 FIX: Resetta dati di progresso se presenti
    // 
    // ANALISI: /start viene chiamata SOLO se status è SCHEDULED/ASSIGNED (riga 29).
    // L'unico modo per avere photos/completedChecklist con status SCHEDULED/ASSIGNED è:
    //   - La pulizia era IN_PROGRESS, poi è stata spostata (move route resetta status 
    //     a SCHEDULED/ASSIGNED ma NON resetta photos/completedChecklist)
    //   - La pulizia era IN_PROGRESS e un admin ha resettato manualmente lo status
    //
    // In entrambi i casi, i vecchi dati di progresso vanno resettati perché:
    //   - Nel caso move: è stata spostata a una nuova data, l'operatore deve ricominciare
    //   - Nel caso riassegnazione: il nuovo operatore non deve vedere dati del precedente
    //   - Nel caso stesso operatore dopo move: deve comunque ricominciare (nuova data)
    //
    // SICUREZZA: Se è il primo avvio (mai iniziata), questi campi sono undefined/vuoti
    // quindi il reset non ha effetto negativo.
    //
    const hasOldProgress = 
      // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
      (cleaning.photos && cleaning.photos.length > 0) || 
      // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
      (cleaning.completedChecklist && cleaning.completedChecklist.length > 0) ||
      // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
      cleaning.startedBy; // Se è stata avviata prima (startedBy è settato solo da /start)
    
    if (hasOldProgress) {
      updateData.photos = [];
      updateData.completedChecklist = [];
      updateData.operatorNotes = "";
      updateData.ratingScores = null;
      updateData.ratingNotes = "";
      updateData.wizardStep = "checklist";
      updateData.photosCount = 0;
      updateData.photoIds = [];
    }
    
    await cleaningRef.update(updateData);
    
    // ─── NOTIFICA ADMIN ───
    try {
      // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
      const dateStr = cleaning.scheduledDate?.toDate?.()?.toLocaleDateString("it-IT", {
        weekday: "short",
        day: "numeric",
        month: "short"
      }) || "oggi";
      
      await createNotification({
        title: "🧹 Pulizia iniziata",
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        message: `${user.name || user.email} ha iniziato la pulizia di "${cleaning.propertyName}" (${dateStr})`,
        type: "CLEANING_STARTED",
        recipientRole: "ADMIN",
        senderId: user.id,
        senderName: user.name || user.email,
        relatedEntityId: id,
        relatedEntityType: "CLEANING",
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        relatedEntityName: cleaning.propertyName,
        link: `/dashboard?openCleaning=${id}`,
      });
    } catch (notifError) {
      console.error("Errore notifica admin:", notifError);
    }
    
    // ─── NOTIFICA PROPRIETARIO ───
    // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
    let ownerId = cleaning.ownerId;
    // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
    if (!ownerId && cleaning.propertyId) {
      try {
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        const propDoc = await adminDb.collection("properties").doc(cleaning.propertyId).get();
        if (propDoc.exists) {
          ownerId = (propDoc.data() as Record<string, any>).ownerId;
        }
      } catch (e) {
        console.error("Errore caricamento proprietà per ownerId:", e);
      }
    }
    
    if (ownerId) {
      try {
        await createNotification({
          title: "🧹 Pulizia in corso",
          // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
          message: `La pulizia di "${cleaning.propertyName}" è iniziata`,
          type: "CLEANING_STARTED",
          recipientRole: "PROPRIETARIO",
          recipientId: ownerId,
          senderId: "system",
          senderName: "Sistema",
          relatedEntityId: id,
          relatedEntityType: "CLEANING",
          // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
          relatedEntityName: cleaning.propertyName,
          link: `/proprietario/pulizie?id=${id}`,
        });
        
        // 📧 Email al proprietario
        if (resend) {
          try {
            // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
            const dateStr = cleaning.scheduledDate?.toDate?.()?.toLocaleDateString("it-IT", {
              weekday: "long", day: "numeric", month: "long", year: "numeric"
            }) || "oggi";
            const ownerDoc = await adminDb.collection("users").doc(ownerId).get();
            const ownerEmail = ownerDoc.exists ? (ownerDoc.data() as Record<string, any>).email : null;
            const ownerName = ownerDoc.exists ? (ownerDoc.data() as Record<string, any>).name : "Proprietario";
            if (ownerEmail) {
              await resend.emails.send({
                from: FROM_EMAIL,
                to: ownerEmail,
                // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
                subject: `🧹 Pulizia iniziata - ${cleaning.propertyName}`,
                html: cleaningStartedEmail({
                  ownerName,
                  // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
                  propertyName: cleaning.propertyName,
                  dateStr,
                  operatorName: user.name || "Operatore",
                  cleaningId: id,
                }),
              });
            }
          } catch (emailError) {
            console.error("Errore invio email proprietario (start):", emailError);
          }
        }
      } catch (notifError) {
        console.error("Errore notifica proprietario:", notifError);
      }
    }
    
    // ─── NOTIFICA RIDER (pulizia iniziata = consegna imminente) ───
    try {
      // Cerca l'ordine biancheria collegato a questa pulizia
      const ordersRef = adminDb.collection("orders");
      const ordersQuery = ordersRef.where("cleaningId", "==", id);
      const ordersSnap = await ordersQuery.get();
      
      
      if (!ordersSnap.empty) {
        // C'è un ordine biancheria collegato - notifica i rider
        const usersRef = adminDb.collection("users");
        const ridersQuery = usersRef.where("role", "==", "RIDER");
        const ridersSnap = await ridersQuery.get();
        
        
        let notifSent = 0;
        for (const riderDoc of ridersSnap.docs) {
          try {
            await createNotification({
              title: "🧹 Pulizia iniziata",
              // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
              message: `Pulizia di "${cleaning.propertyName}" in corso - preparati per la consegna`,
              type: "CLEANING_STARTED",
              recipientRole: "RIDER",
              recipientId: riderDoc.id,
              senderId: user.id,
              senderName: user.name || user.email || "Sistema",
              relatedEntityId: id,
              relatedEntityType: "CLEANING",
              // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
              relatedEntityName: cleaning.propertyName,
              link: `/rider`,
            });
            notifSent++;
          } catch (e) {
            console.error(`Errore notifica rider ${riderDoc.id}:`, e);
          }
        }
      } else {
      }
    } catch (riderNotifError) {
      console.error("Errore notifica rider:", riderNotifError);
    }
    
    // ─── AUTO-GENERA ORDINE BIANCHERIA (se configurato) ───
    let laundryOrderId = null;
    
    // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
    if (cleaning.propertyId) {
      try {
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        const propertyRef = adminDb.collection("properties").doc(cleaning.propertyId);
        const propertySnap = await propertyRef.get();

        if (propertySnap.exists) {
          const property = propertySnap.data() as Record<string, any>;

          // ═══════════════════════════════════════════════════════════
          // STEP A — Raccogli richieste prodotti pending per questa proprietà
          // Questo è INDIPENDENTE da autoGenerateLaundry / usesOwnLinen:
          // i prodotti vanno sempre consegnati, qualunque sia la config biancheria.
          // ═══════════════════════════════════════════════════════════
          const cleaningProductItems: Array<{ itemId: string; id: string; name: string; quantity: number; type: string; categoryId: string }> = [];
          const productRequestIds: string[] = [];

          try {
            // Cerca richieste ancora da evadere per questa proprietà.
            // Nota: la route POST /product-requests le evade subito (status "fulfilled"),
            // quindi qui arriviamo solo in caso di fallback (POST aveva fallito).
            const pendingRequestsSnap = await adminDb
              .collection("productRequests")
              // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
              .where("propertyId", "==", cleaning.propertyId)
              .where("status", "==", "pending")
              .get();

            // Aggrega quantità per prodotto (deduplication)
            const agg: Record<string, { itemId: string; name: string; quantity: number }> = {};
            pendingRequestsSnap.docs.forEach(reqDoc => {
              productRequestIds.push(reqDoc.id);
              const reqData = reqDoc.data() as Record<string, any>;
              (reqData.items ?? []).forEach((item: any) => {
                const key: string = item.itemId || item.id || item.name;
                if (agg[key]) {
                  agg[key].quantity += (item.quantity ?? 1);
                } else {
                  agg[key] = { itemId: key, name: item.name ?? key, quantity: item.quantity ?? 1 };
                }
              });
            });

            Object.values(agg).forEach(item => {
              cleaningProductItems.push({
                id:         item.itemId,   // ← campo "id" per compatibilità rider UI
                itemId:     item.itemId,
                name:       item.name,
                quantity:   item.quantity,
                type:       "cleaning_product",
                categoryId: "prodotti_pulizia",
              });
            });
          } catch (productError) {
            console.error("Errore lettura richieste prodotti:", productError);
          }

          // ═══════════════════════════════════════════════════════════
          // STEP B — Biancheria (solo se autoGenerateLaundry e non usa biancheria propria)
          // ═══════════════════════════════════════════════════════════
          const usesLaundryService = property.autoGenerateLaundry === true && property.usesOwnLinen !== true;
          const linenConfig: Array<{ itemId: string; itemName: string; quantity: number }> = (property.linenConfig as Array<{ itemId: string; itemName: string; quantity: number }>) ?? [];

          const linenItems: Array<{ id: string; itemId: string; name: string; quantity: number; type: string; categoryId: string }> = [];
          if (usesLaundryService) {
            linenConfig.forEach(item => {
              const resolvedName =
                getItemName(item.itemId) !== item.itemId ? getItemName(item.itemId) :
                getItemName(item.itemName) !== item.itemName ? getItemName(item.itemName) :
                item.itemName;
              linenItems.push({
                id:         item.itemId,   // ← campo "id" per compatibilità rider UI
                itemId:     item.itemId,
                name:       resolvedName,
                quantity:   item.quantity,
                type:       "linen",
                categoryId: "biancheria_letto",
              });
            });
          }

          // ═══════════════════════════════════════════════════════════
          // STEP C — Crea / aggiorna ordine
          // ═══════════════════════════════════════════════════════════
          const hasLinenItems    = linenItems.length > 0;
          const hasProductItems  = cleaningProductItems.length > 0;

          if (hasLinenItems || hasProductItems) {
            // Cerca ordine esistente per questa pulizia
            // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
            const existingOrderId: string | undefined = cleaning.laundryOrderId;
            let existingOrderDocId: string | null = null;

            if (!existingOrderId) {
              const existingOrdersSnap = await adminDb
                .collection("orders")
                .where("cleaningId", "==", id)
                .get();
              // ⚠️ ESCLUDE ordini CANCELLED: se l'admin ha cancellato l'ordine,
              // questa pulizia deve generare un nuovo ordine, non riusare il vecchio.
              const activeOrders = existingOrdersSnap.docs.filter(d => {
                const status = ((d.data() as any).status || "").toUpperCase();
                return status !== "CANCELLED";
              });
              if (activeOrders.length > 0) {
                existingOrderDocId = activeOrders[0].id;
                await cleaningRef.update({ laundryOrderId: existingOrderDocId, requiresLaundry: true });
                laundryOrderId = existingOrderDocId;
              }
            } else {
              // Se è passato laundryOrderId ma quell'ordine è CANCELLED, ignora e crea nuovo
              const existingOrderDoc = await adminDb.collection("orders").doc(existingOrderId).get();
              if (existingOrderDoc.exists) {
                const existingData = existingOrderDoc.data() as Record<string, any>;
                const status = (existingData.status || "").toUpperCase();
                if (status === "CANCELLED") {
                  // L'ordine è cancellato — non usarlo. Reset laundryOrderId sul cleaning.
                  await cleaningRef.update({ laundryOrderId: null });
                  existingOrderDocId = null;
                  laundryOrderId = null;
                } else {
                  existingOrderDocId = existingOrderId;
                  laundryOrderId = existingOrderId;
                }
              } else {
                // laundryOrderId punta a un doc inesistente — reset e crea nuovo
                await cleaningRef.update({ laundryOrderId: null });
                existingOrderDocId = null;
                laundryOrderId = null;
              }
            }

            if (existingOrderDocId && hasProductItems) {
              // ── Ordine già esiste: aggiungi prodotti se non già presenti ──
              const existingOrderDoc = await adminDb.collection("orders").doc(existingOrderDocId).get();
              if (existingOrderDoc.exists) {
                const existingData = existingOrderDoc.data() as Record<string, any>;
                const existingItems: any[] = existingData.items ?? [];
                // Rimuovi eventuali prodotti già aggiunti da richieste precedenti
                const filteredItems = existingItems.filter((i: any) => i.type !== "cleaning_product");
                const mergedItems = [...filteredItems, ...cleaningProductItems];

                await adminDb.collection("orders").doc(existingOrderDocId).update({
                  items:           mergedItems,
                  cleaningProducts: cleaningProductItems,
                  productRequestIds: productRequestIds,
                  hasCleaningProducts: true,
                  updatedAt: now,
                });
              }
            } else if (!existingOrderDocId) {
              // ── Nessun ordine esistente: crea nuovo ──
              const orderType =
                hasLinenItems && hasProductItems ? "MIXED" :
                hasProductItems ? "PRODUCTS" : "LINEN";

              const allItems = [...linenItems, ...cleaningProductItems];

              const orderRef = await adminDb.collection("orders").add({
                // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
                propertyId:      cleaning.propertyId,
                // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
                propertyName:    cleaning.propertyName,
                // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
                propertyAddress: cleaning.propertyAddress ?? property.address,
                cleaningId:      id,
                type:            orderType,
                status:          "PENDING",
                // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
                scheduledDate:   cleaning.scheduledDate,
                items:           allItems,          // array combinato con id su ogni item
                linenItems:      linenItems,
                cleaningProducts: cleaningProductItems,
                productRequestIds: productRequestIds,
                hasCleaningProducts: hasProductItems,
                autoGenerated:   true,
                createdAt:       now,
                updatedAt:       now,
              });

              laundryOrderId = orderRef.id;
              await cleaningRef.update({ laundryOrderId: laundryOrderId, requiresLaundry: true });
            }

            // ── Segna richieste prodotti come evase ──
            if (hasProductItems && laundryOrderId) {
              for (const requestId of productRequestIds) {
                await adminDb.collection("productRequests").doc(requestId).update({
                  status:              "fulfilled",
                  fulfilledAt:         now,
                  fulfilledInOrderId:  laundryOrderId,
                  fulfilledInCleaningId: id,
                  updatedAt:           now,
                });
              }
              // Elimina ordini orfani isProductsOnly del vecchio flusso
              try {
                const orphanPropertyId = (cleaning as Record<string, any>)?.propertyId as string ?? "";
                const orphansSnap = await adminDb.collection("orders")
                  .where("propertyId", "==", orphanPropertyId)
                  .where("isProductsOnly", "==", true)
                  .where("status", "in", ["PENDING", "pending"])
                  .get();
                for (const orphanDoc of orphansSnap.docs) {
                  if (orphanDoc.id !== laundryOrderId) {
                    await adminDb.collection("orders").doc(orphanDoc.id).delete();
                  }
                }
              } catch { /* non critico */ }
            }

            // ── Notifica admin ──
            const notifTitle = hasLinenItems && hasProductItems
              ? "📦🧴 Nuovo ordine misto"
              : hasProductItems ? "🧴 Nuovo ordine prodotti" : "📦 Nuovo ordine biancheria";
            const cleaningName = (cleaning as Record<string, any>)?.propertyName as string ?? "Proprietà";
            const notifMsg = hasProductItems
              ? `Ordine per "${cleaningName}" (${hasLinenItems ? "biancheria + " : ""}${cleaningProductItems.length} prodotti pulizia)`
              : `Ordine biancheria per "${cleaningName}"`;

            await createNotification({
              title:            notifTitle,
              message:          notifMsg,
              type:             "LAUNDRY_NEW",
              recipientRole:    "ADMIN",
              senderId:         "system",
              senderName:       "Sistema",
              relatedEntityId:  laundryOrderId ?? "",
              relatedEntityType: "CLEANING",
              // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
              relatedEntityName: cleaning.propertyName,
              link:             `/dashboard/ordini/${laundryOrderId}`,
            });

            // ── Notifica riders ──
            try {
              const ridersSnap = await adminDb.collection("users").where("role", "==", "RIDER").get();
              for (const riderDoc of ridersSnap.docs) {
                await createNotification({
                  title: "🧹 Pulizia iniziata - Consegna richiesta",
                  // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
                  message: `Pulizia di "${cleaning.propertyName}" in corso`,
                  type: "CLEANING_STARTED",
                  recipientRole: "RIDER",
                  recipientId: riderDoc.id,
                  senderId: user.id,
                  senderName: user.name || user.email || "Sistema",
                  relatedEntityId: laundryOrderId ?? "",
                  relatedEntityType: "CLEANING",
                  // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
                  relatedEntityName: cleaning.propertyName,
                  link: `/rider`,
                }).catch(() => { /* non critico */ });
              }
            } catch { /* non critico */ }
          }
        }
      } catch (laundryError) {
        console.error("Errore auto-generazione biancheria:", laundryError);
      }
    }
    
    return NextResponse.json({ 
      success: true,
      startedAt: now.toDate().toISOString(),
      laundryOrderId,
      message: laundryOrderId 
        ? "Pulizia iniziata e ordine biancheria creato" 
        : "Pulizia iniziata"
    });
  } catch (error) {
    console.error("Errore inizio pulizia:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
