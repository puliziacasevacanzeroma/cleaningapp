import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { createNotification } from "~/lib/firebase/notifications-admin";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, MoveCleaningSchema } from "~/lib/validation/schemas";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    
    const { id } = await params;
    const body = await validateBody(req, MoveCleaningSchema);
    if (body instanceof Response) return body;
    const { newDate, newTime, reason } = body;
    
    // Carica la pulizia
    const cleaningRef = adminDb.collection("cleanings").doc(id);
    const cleaningSnap = await cleaningRef.get();
    
    if (!cleaningSnap.exists) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }
    
    const cleaning = cleaningSnap.data();
    
    // ─── VERIFICA PERMESSI ───
    const isAdmin = user.role === "ADMIN";
    // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
    const isOwner = cleaning.ownerId === user.id;
    
    if (!isAdmin && !isOwner) {
      return NextResponse.json({ 
        error: "Non hai i permessi per spostare questa pulizia" 
      }, { status: 403 });
    }
    
    // ─── VERIFICA STATO ───
    // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
    if (cleaning.status === "COMPLETED" || cleaning.status === "completed" ||
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        cleaning.status === "CANCELLED" || cleaning.status === "cancelled") {
      return NextResponse.json({ 
        error: "Non puoi spostare una pulizia completata o cancellata" 
      }, { status: 400 });
    }
    
    // 🔥 Pulizia IN_PROGRESS: richiede conferma esplicita
    // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
    const wasInProgress = cleaning.status === "IN_PROGRESS" || cleaning.status === "in_progress";
    // @ts-expect-error TODO-FIX: TS2339 Property 'confirmInProgress' does not exist on type '{ newDate: string; reason?:...
    if (wasInProgress && !body.confirmInProgress) {
      return NextResponse.json({ 
        error: "Questa pulizia è in corso!",
        requiresConfirmation: true,
        message: "L'operatore ha già iniziato questa pulizia. Vuoi spostarla comunque? L'operatore verrà avvisato e dovrà ricominciare.",
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        operatorName: cleaning.operatorName || cleaning.operators?.[0]?.name || "Operatore"
      }, { status: 409 }); // 409 Conflict
    }
    
    const now = Timestamp.now();
    // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
    const originalDate = cleaning.scheduledDate;
    
    // Converti nuova data a Timestamp (a mezzogiorno per evitare problemi timezone)
    const newDateObj = new Date(newDate);
    newDateObj.setHours(12, 0, 0, 0);
    const newScheduledDate = Timestamp.fromDate(newDateObj);
    
    // Verifica che la nuova data sia diversa
    const originalDateStr = originalDate?.toDate?.()?.toISOString().split('T')[0];
    const newDateStr = newDateObj.toISOString().split('T')[0];
    
    if (originalDateStr === newDateStr) {
      // Solo cambio orario
      // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
      if (newTime && newTime !== cleaning.scheduledTime) {
        await cleaningRef.update({
          scheduledTime: newTime,
          timeManuallySet: true,
          updatedAt: now,
        });
        
        return NextResponse.json({ 
          success: true,
          message: "Orario aggiornato"
        });
      }
      
      return NextResponse.json({ 
        error: "La nuova data è uguale a quella attuale" 
      }, { status: 400 });
    }
    
    // ─── CREA ESCLUSIONE PER DATA ORIGINALE (evita re-sync iCal) ───
    // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
    if (cleaning.bookingSource || cleaning.externalUid) {
      await adminDb.collection("syncExclusions").add({
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        propertyId: cleaning.propertyId,
        originalDate: originalDate,
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        bookingSource: cleaning.bookingSource || "manual",
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        bookingId: cleaning.bookingId || null,
        reason: "MOVED",
        newDate: newScheduledDate,
        cleaningId: id,
        createdAt: now,
        createdBy: user.id,
      });
      
      // Crea anche record di pulizia cancellata per la data originale
      await adminDb.collection("cancelledCleanings").add({
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        propertyId: cleaning.propertyId,
        originalDate: originalDate,
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        externalUid: cleaning.externalUid || null,
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        bookingSource: cleaning.bookingSource || null,
        reason: `Spostata a ${newDateStr}${reason ? `: ${reason}` : ""}`,
        cleaningId: id,
        cancelledBy: user.id,
        cancelledAt: now,
        movedTo: newScheduledDate,
      });
    }
    
    // ─── AGGIORNA PULIZIA ───
    // Preserva originalScheduledDate originale (checkout booking) se già presente
    const existingOriginalScheduledDate = (cleaning as any).originalScheduledDate;

    const updateData: Record<string, unknown> = {
      scheduledDate: newScheduledDate,
      originalDate: originalDate,
      movedAt: now,
      movedBy: user.id,
      movedByName: user.name || user.email,
      moveReason: reason || null,
      manuallyModified: true,
      lockedFromSync: true,
      // Se già spostata prima, mantieni la data originale del checkout
      // altrimenti usa la data attuale come originalScheduledDate
      originalScheduledDate: existingOriginalScheduledDate || originalDate,
      updatedAt: now,
    };
    
    // 🔥 Se era IN_PROGRESS, resetta lo status E i dati di progresso
    if (wasInProgress) {
      // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
      const hasOperator = cleaning.operatorId || (cleaning.operators && cleaning.operators.length > 0);
      updateData.status = hasOperator ? "ASSIGNED" : "SCHEDULED";
      updateData.startedAt = null; // Rimuovi timestamp inizio
      updateData.wasInProgressBeforeMove = true; // Flag per tracking
      // Resetta dati di progresso - l'operatore dovrà ricominciare sulla nuova data
      updateData.photos = [];
      updateData.completedChecklist = [];
      updateData.operatorNotes = "";
      updateData.ratingScores = null;
      updateData.ratingNotes = "";
      updateData.wizardStep = null;
      updateData.photosCount = 0;
      updateData.photoIds = [];
    }
    
    if (newTime) {
      updateData.scheduledTime = newTime;
      updateData.timeManuallySet = true; // Flag: admin ha cambiato l'orario, non sovrascrivere con checkout
    }
    
    await cleaningRef.update(updateData);
    
    // ─── NOTIFICA OPERATORE SE ASSEGNATO ───
    // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
    const operators = cleaning.operators || [];
    // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
    if (cleaning.operatorId) {
      // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
      operators.push({ id: cleaning.operatorId, name: cleaning.operatorName });
    }
    
    const originalDateFormatted = originalDate?.toDate?.()?.toLocaleDateString("it-IT", {
      weekday: "short",
      day: "numeric",
      month: "short"
    }) || "";
    
    const newDateFormatted = newDateObj.toLocaleDateString("it-IT", {
      weekday: "short",
      day: "numeric",
      month: "short"
    });
    
    for (const operator of operators) {
      if (operator.id && operator.id !== user.id) {
        try {
          // Messaggio diverso se era in corso
          const title = wasInProgress ? "⚠️ Pulizia in corso spostata" : "📅 Pulizia spostata";
          const message = wasInProgress 
            // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
            ? `ATTENZIONE: La pulizia di "${cleaning.propertyName}" che stavi eseguendo è stata spostata a ${newDateFormatted}. Il lavoro è stato interrotto.${reason ? ` Motivo: ${reason}` : ""}`
            // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
            : `La pulizia di "${cleaning.propertyName}" è stata spostata da ${originalDateFormatted} a ${newDateFormatted}${reason ? `. Motivo: ${reason}` : ""}`;
          
          await createNotification({
            title,
            message,
            type: wasInProgress ? "WARNING" : "INFO",
            recipientRole: "OPERATORE_PULIZIE",
            recipientId: operator.id,
            senderId: user.id,
            senderName: user.name || user.email,
            relatedEntityId: id,
            relatedEntityType: "CLEANING",
            // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
            relatedEntityName: cleaning.propertyName,
            link: `/operatore`,
          });
        } catch (notifError) {
          console.error("Errore notifica operatore:", notifError);
        }
      }
    }
    
    // ─── NOTIFICA ADMIN (se spostata da proprietario) ───
    if (!isAdmin) {
      try {
        await createNotification({
          title: "📅 Pulizia spostata dal proprietario",
          // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
          message: `${user.name || user.email} ha spostato la pulizia di "${cleaning.propertyName}" da ${originalDateFormatted} a ${newDateFormatted}`,
          type: "INFO",
          recipientRole: "ADMIN",
          senderId: user.id,
          senderName: user.name || user.email,
          relatedEntityId: id,
          relatedEntityType: "CLEANING",
          // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
          relatedEntityName: cleaning.propertyName,
          link: `/dashboard/calendario/pulizie`,
        });
      } catch (notifError) {
        console.error("Errore notifica admin:", notifError);
      }
    }
    
    // ─── AGGIORNA ORDINI BIANCHERIA COLLEGATI ───
    let ordersUpdated = 0;
    
    // Metodo 1: Cerca per laundryOrderId (retrocompatibilità)
    // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
    if (cleaning.laundryOrderId) {
      try {
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        const orderRef = adminDb.collection("orders").doc(cleaning.laundryOrderId);
        const orderSnap = await orderRef.get();
        
        if (orderSnap.exists) {
          const order = orderSnap.data();
          
          // Aggiorna data solo se non già in transito/completato
          // @ts-expect-error TODO-FIX: TS18048 'order' is possibly 'undefined'.
          if (order.status === "PENDING" || order.status === "ASSIGNED") {
            await orderRef.update({
              scheduledDate: newScheduledDate,
              updatedAt: now,
            });
            ordersUpdated++;
            // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
            if (process.env.NODE_ENV !== "production") console.log(`📦 Ordine ${cleaning.laundryOrderId} aggiornato (via laundryOrderId)`);
          }
        }
      } catch (orderError) {
        console.error("Errore aggiornamento ordine (laundryOrderId):", orderError);
      }
    }
    
    // Metodo 2: Cerca per cleaningId (ordini collegati direttamente)
    try {
      const ordersQuery = adminDb.collection("orders").where("cleaningId", "==", id);
      const ordersSnap = await ordersQuery.get();
      
      for (const orderDoc of ordersSnap.docs) {
        const order = orderDoc.data();
        
        // Salta se già aggiornato con laundryOrderId
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        if (orderDoc.id === cleaning.laundryOrderId) continue;
        
        // Aggiorna data solo se non già in transito/completato
        if (order.status === "PENDING" || order.status === "ASSIGNED") {
          await adminDb.collection("orders").doc(orderDoc.id).update({
            scheduledDate: newScheduledDate,
            updatedAt: now,
          });
          ordersUpdated++;
          if (process.env.NODE_ENV !== "production") console.log(`📦 Ordine ${orderDoc.id} aggiornato (via cleaningId)`);
        }
      }
    } catch (orderError) {
      console.error("Errore aggiornamento ordini (cleaningId):", orderError);
    }
    
    // Metodo 3: Cerca per propertyId + data originale (per ordini senza cleaningId)
    try {
      // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
      const ordersQuery = adminDb.collection("orders").where("propertyId", "==", cleaning.propertyId).where("scheduledDate", "==", originalDate);
      const ordersSnap = await ordersQuery.get();
      
      for (const orderDoc of ordersSnap.docs) {
        const order = orderDoc.data();
        
        // Salta se già aggiornato
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        if (orderDoc.id === cleaning.laundryOrderId) continue;
        if (order.cleaningId === id) continue; // Già gestito sopra
        
        // Aggiorna data solo se non già in transito/completato
        if (order.status === "PENDING" || order.status === "ASSIGNED") {
          await adminDb.collection("orders").doc(orderDoc.id).update({
            scheduledDate: newScheduledDate,
            cleaningId: id, // Collega anche per il futuro
            updatedAt: now,
          });
          ordersUpdated++;
          if (process.env.NODE_ENV !== "production") console.log(`📦 Ordine ${orderDoc.id} aggiornato (via propertyId+data)`);
        }
      }
    } catch (orderError) {
      console.error("Errore aggiornamento ordini (propertyId+data):", orderError);
    }
    
    return NextResponse.json({ 
      success: true,
      originalDate: originalDateStr,
      newDate: newDateStr,
      // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
      newTime: newTime || cleaning.scheduledTime,
      message: `Pulizia spostata da ${originalDateFormatted} a ${newDateFormatted}`
    });
  } catch (error) {
    console.error("Errore spostamento pulizia:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
