import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { createNotification } from "~/lib/firebase/notifications-admin";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, CancelCleaningSchema } from "~/lib/validation/schemas";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    
    const { id } = await params;
    const body = await validateBody(req, CancelCleaningSchema);
    if (body instanceof Response) return body;
    const { reason } = body;
    
    const cleaningRef = adminDb.collection("cleanings").doc(id);
    const cleaningSnap = await cleaningRef.get();
    if (!cleaningSnap.exists) return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    
    const cleaning = cleaningSnap.data() as Record<string, any>;
    const isAdmin = user.role === "ADMIN";
    let isOwner = false;
    
    // VERIFICA OWNERSHIP
    if (user.role === "PROPRIETARIO" && cleaning.propertyId) {
      const propertyRef = adminDb.collection("properties").doc(cleaning.propertyId);
      const propertySnap = await propertyRef.get();
      if (propertySnap.exists) {
        const property = propertySnap.data() as Record<string, any>;
        isOwner = property.ownerId === user.id || 
                  (property.ownerEmail && property.ownerEmail.toLowerCase() === user.email?.toLowerCase());
      }
    }
    
    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: "Non hai i permessi per cancellare questa pulizia" }, { status: 403 });
    }
    
    // Non si possono cancellare pulizie completate
    if (cleaning.status === "COMPLETED" || cleaning.status === "completed") {
      return NextResponse.json({ error: "Non puoi cancellare una pulizia già completata" }, { status: 400 });
    }
    
    // Non si possono cancellare pulizie in corso (per proprietari)
    if (!isAdmin && (cleaning.status === "IN_PROGRESS" || cleaning.status === "in_progress")) {
      return NextResponse.json({ error: "Non puoi cancellare una pulizia in corso" }, { status: 400 });
    }
    
    // NUOVA REGOLA: Proprietario può cancellare solo fino alle 20:00 del giorno prima
    if (!isAdmin && isOwner) {
      const cleaningDate = cleaning.scheduledDate?.toDate?.();
      if (cleaningDate) {
        // Calcola le 20:00 del giorno prima della pulizia
        const deadline = new Date(cleaningDate);
        deadline.setDate(deadline.getDate() - 1); // Giorno prima
        deadline.setHours(20, 0, 0, 0); // Ore 20:00
        
        const now = new Date();
        
        if (now > deadline) {
          const cleaningDateStr = cleaningDate.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
          return NextResponse.json({ 
            error: "Non puoi più cancellare questa pulizia. Il termine era ieri alle 20:00.",
            details: "La pulizia di " + cleaningDateStr + " poteva essere cancellata entro le 20:00 del giorno precedente."
          }, { status: 400 });
        }
      }
    }
    
    const now = Timestamp.now();
    
    // Salva in cancelledCleanings per evitare che il sync iCal la ricrei
    if (cleaning.bookingSource || cleaning.externalUid) {
      await adminDb.collection("cancelledCleanings").add({
        propertyId: cleaning.propertyId,
        propertyName: cleaning.propertyName,
        originalDate: cleaning.scheduledDate,
        externalUid: cleaning.externalUid || null,
        bookingSource: cleaning.bookingSource || null,
        reason,
        cleaningId: id,
        cancelledBy: user.id,
        cancelledByName: user.name || user.email,
        cancelledAt: now,
      });
      
      // Aggiungi anche a syncExclusions
      await adminDb.collection("syncExclusions").add({
        propertyId: cleaning.propertyId,
        originalDate: cleaning.scheduledDate,
        bookingSource: cleaning.bookingSource || "manual",
        reason: "DELETED_BY_USER",
        cancelReason: reason,
        createdAt: now,
        createdBy: user.id,
      });
    }
    
    let laundryOrdersCancelled = 0;
    
    // Cancella ordini biancheria collegati
    try {
      const ordersQuery = adminDb.collection("orders").where("cleaningId", "==", id);
      const ordersSnapshot = await ordersQuery.get();
      
      for (const orderDoc of ordersSnapshot.docs) {
        const order = orderDoc.data();
        // Non cancellare ordini già in transito, consegnati o completati
        if (order.status !== "IN_TRANSIT" && order.status !== "DELIVERED" && order.status !== "COMPLETED" && order.status !== "CANCELLED") {
          await adminDb.collection("orders").doc(orderDoc.id).update({
            status: "CANCELLED",
            cancelledAt: now,
            cancelledBy: user.id,
            cancelReason: "Pulizia eliminata: " + reason,
            updatedAt: now
          });
          laundryOrdersCancelled++;
        }
      }
    } catch (err) {
      console.error("Errore cancellazione ordini:", err);
    }
    
    // Cerca anche per laundryOrderId (retrocompatibilità)
    if (cleaning.laundryOrderId) {
      try {
        const orderRef = adminDb.collection("orders").doc(cleaning.laundryOrderId);
        const orderSnap = await orderRef.get();
        if (orderSnap.exists) {
          const order = orderSnap.data() as Record<string, any>;
          if (order.status !== "IN_TRANSIT" && order.status !== "DELIVERED" && order.status !== "COMPLETED" && order.status !== "CANCELLED") {
            await orderRef.update({
              status: "CANCELLED",
              cancelledAt: now,
              cancelledBy: user.id,
              cancelReason: "Pulizia eliminata: " + reason,
              updatedAt: now
            });
            laundryOrdersCancelled++;
          }
        }
      } catch {}
    }
    
    // Notifica operatori assegnati
    const operators = cleaning.operators || [];
    if (cleaning.operatorId) operators.push({ id: cleaning.operatorId, name: cleaning.operatorName });
    for (const operator of operators) {
      if (operator.id && operator.id !== user.id) {
        try {
          await createNotification({
            title: "❌ Pulizia eliminata",
            message: "La pulizia di \"" + cleaning.propertyName + "\" è stata eliminata. Motivo: " + reason,
            type: "WARNING",
            recipientRole: "OPERATORE_PULIZIE",
            recipientId: operator.id,
            senderId: user.id,
            senderName: user.name || user.email,
            relatedEntityId: id,
            relatedEntityType: "CLEANING",
            relatedEntityName: cleaning.propertyName,
            link: `/operatore`,
          });
        } catch {}
      }
    }
    
    // Notifica admin se cancellata da proprietario
    if (!isAdmin) {
      try {
        await createNotification({
          title: "❌ Pulizia eliminata dal proprietario",
          message: (user.name || user.email) + " ha eliminato la pulizia di \"" + cleaning.propertyName + "\". Motivo: " + reason,
          type: "WARNING",
          recipientRole: "ADMIN",
          senderId: user.id,
          senderName: user.name || user.email,
          relatedEntityId: id,
          relatedEntityType: "CLEANING",
          relatedEntityName: cleaning.propertyName,
          link: `/dashboard/calendario/pulizie`,
        });
      } catch {}
    }
    
    // ELIMINA la pulizia (non marcare come CANCELLED)
    await cleaningRef.delete();
    
    return NextResponse.json({ 
      success: true, 
      deleted: true,
      laundryOrdersCancelled, 
      message: "Pulizia eliminata con successo" 
    });
    
  } catch (error) {
    console.error("Errore cancellazione pulizia:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
