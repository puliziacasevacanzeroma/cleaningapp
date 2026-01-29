import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { doc, getDoc, updateDoc, deleteDoc, addDoc, collection, Timestamp, query, where, getDocs } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { createNotification } from "~/lib/firebase/notifications";

export const dynamic = 'force-dynamic';

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) return JSON.parse(decodeURIComponent(userCookie.value));
    return null;
  } catch { return null; }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getFirebaseUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    
    const { id } = await params;
    const body = await req.json();
    const { reason, deleteCompletely } = body;
    
    if (!reason || reason.trim().length < 3) {
      return NextResponse.json({ error: "Inserisci un motivo per la cancellazione" }, { status: 400 });
    }
    
    const cleaningRef = doc(db, "cleanings", id);
    const cleaningSnap = await getDoc(cleaningRef);
    if (!cleaningSnap.exists()) return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    
    const cleaning = cleaningSnap.data();
    const isAdmin = user.role === "ADMIN";
    let isOwner = false;
    
    // VERIFICA OWNERSHIP SEMPLIFICATA - controlla via proprietà
    if (user.role === "PROPRIETARIO" && cleaning.propertyId) {
      const propertyRef = doc(db, "properties", cleaning.propertyId);
      const propertySnap = await getDoc(propertyRef);
      if (propertySnap.exists()) {
        const property = propertySnap.data();
        isOwner = property.ownerId === user.id || 
                  (property.ownerEmail && property.ownerEmail.toLowerCase() === user.email?.toLowerCase());
      }
    }
    
    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: "Non hai i permessi per cancellare questa pulizia" }, { status: 403 });
    }
    
    if (cleaning.status === "COMPLETED" || cleaning.status === "completed") {
      return NextResponse.json({ error: "Non puoi cancellare una pulizia già completata" }, { status: 400 });
    }
    
    if (!isAdmin && (cleaning.status === "IN_PROGRESS" || cleaning.status === "in_progress")) {
      return NextResponse.json({ error: "Non puoi cancellare una pulizia in corso" }, { status: 400 });
    }
    
    const now = Timestamp.now();
    
    if (cleaning.bookingSource || cleaning.externalUid) {
      await addDoc(collection(db, "cancelledCleanings"), {
        propertyId: cleaning.propertyId, originalDate: cleaning.scheduledDate,
        externalUid: cleaning.externalUid || null, bookingSource: cleaning.bookingSource || null,
        reason, cleaningId: id, cancelledBy: user.id, cancelledByName: user.name || user.email, cancelledAt: now,
      });
      await addDoc(collection(db, "syncExclusions"), {
        propertyId: cleaning.propertyId, originalDate: cleaning.scheduledDate,
        bookingSource: cleaning.bookingSource || "manual", reason: "CANCELLED",
        cancelReason: reason, createdAt: now, createdBy: user.id,
      });
    }
    
    let laundryOrdersCancelled = 0;
    
    // 🔧 Cerca TUTTI gli ordini collegati a questa pulizia tramite cleaningId
    try {
      const ordersQuery = query(
        collection(db, "orders"),
        where("cleaningId", "==", id)
      );
      const ordersSnapshot = await getDocs(ordersQuery);
      
      console.log(`🔍 Trovati ${ordersSnapshot.docs.length} ordini collegati alla pulizia ${id} (per cleaningId)`);
      
      for (const orderDoc of ordersSnapshot.docs) {
        const order = orderDoc.data();
        // Non cancellare ordini già in transito, consegnati o completati
        if (order.status !== "IN_TRANSIT" && order.status !== "DELIVERED" && order.status !== "COMPLETED" && order.status !== "CANCELLED") {
          await updateDoc(doc(db, "orders", orderDoc.id), {
            status: "CANCELLED",
            cancelledAt: now,
            cancelledBy: user.id,
            cancelReason: `Pulizia cancellata: ${reason}`,
            updatedAt: now
          });
          laundryOrdersCancelled++;
          console.log(`✅ Ordine ${orderDoc.id} cancellato (cleaningId match)`);
        } else {
          console.log(`⚠️ Ordine ${orderDoc.id} non cancellato (status: ${order.status})`);
        }
      }
    } catch (orderError) {
      console.error("Errore cancellazione ordini per cleaningId:", orderError);
    }
    
    // 🔧 FIX: Cerca anche per propertyId + data (per ordini senza cleaningId)
    if (cleaning.propertyId && cleaning.scheduledDate) {
      try {
        const ordersQuery2 = query(
          collection(db, "orders"),
          where("propertyId", "==", cleaning.propertyId)
        );
        const ordersSnapshot2 = await getDocs(ordersQuery2);
        
        // Converti la data della pulizia per confronto
        const cleaningDateStr = cleaning.scheduledDate?.toDate?.()?.toISOString?.()?.split('T')[0] 
          || (typeof cleaning.scheduledDate === 'string' ? cleaning.scheduledDate.split('T')[0] : null);
        
        console.log(`🔍 Cercando ordini per propertyId ${cleaning.propertyId} e data ${cleaningDateStr}`);
        
        for (const orderDoc of ordersSnapshot2.docs) {
          const order = orderDoc.data();
          // Converti la data dell'ordine
          const orderDateStr = order.scheduledDate?.toDate?.()?.toISOString?.()?.split('T')[0]
            || (typeof order.scheduledDate === 'string' ? order.scheduledDate.split('T')[0] : null);
          
          // Se le date corrispondono e l'ordine non è già stato processato
          if (orderDateStr === cleaningDateStr && 
              order.status !== "IN_TRANSIT" && order.status !== "DELIVERED" && 
              order.status !== "COMPLETED" && order.status !== "CANCELLED") {
            await updateDoc(doc(db, "orders", orderDoc.id), {
              status: "CANCELLED",
              cancelledAt: now,
              cancelledBy: user.id,
              cancelReason: `Pulizia cancellata: ${reason}`,
              updatedAt: now
            });
            laundryOrdersCancelled++;
            console.log(`✅ Ordine ${orderDoc.id} cancellato (propertyId+data match)`);
          }
        }
      } catch (orderError2) {
        console.error("Errore cancellazione ordini per propertyId+data:", orderError2);
      }
    }
    
    // Cerca anche per laundryOrderId (retrocompatibilità)
    if (cleaning.laundryOrderId) {
      try {
        const orderRef = doc(db, "orders", cleaning.laundryOrderId);
        const orderSnap = await getDoc(orderRef);
        if (orderSnap.exists()) {
          const order = orderSnap.data();
          if (order.status !== "IN_TRANSIT" && order.status !== "DELIVERED" && order.status !== "COMPLETED" && order.status !== "CANCELLED") {
            await updateDoc(orderRef, { status: "CANCELLED", cancelledAt: now, cancelledBy: user.id, cancelReason: `Pulizia cancellata: ${reason}`, updatedAt: now });
            laundryOrdersCancelled++;
          }
        }
      } catch {}
    }
    
    const operators = cleaning.operators || [];
    if (cleaning.operatorId) operators.push({ id: cleaning.operatorId, name: cleaning.operatorName });
    for (const operator of operators) {
      if (operator.id && operator.id !== user.id) {
        try {
          await createNotification({
            title: "❌ Pulizia cancellata",
            message: `La pulizia di "${cleaning.propertyName}" è stata cancellata. Motivo: ${reason}`,
            type: "WARNING", recipientRole: "OPERATORE_PULIZIE", recipientId: operator.id,
            senderId: user.id, senderName: user.name || user.email,
            relatedEntityId: id, relatedEntityType: "CLEANING", relatedEntityName: cleaning.propertyName,
          });
        } catch {}
      }
    }
    
    if (!isAdmin) {
      try {
        await createNotification({
          title: "❌ Pulizia cancellata dal proprietario",
          message: `${user.name || user.email} ha cancellato la pulizia di "${cleaning.propertyName}". Motivo: ${reason}`,
          type: "WARNING", recipientRole: "ADMIN", senderId: user.id, senderName: user.name || user.email,
          relatedEntityId: id, relatedEntityType: "CLEANING", relatedEntityName: cleaning.propertyName,
        });
      } catch {}
    }
    
    if (deleteCompletely && isAdmin) {
      await deleteDoc(cleaningRef);
    } else {
      await updateDoc(cleaningRef, { status: "CANCELLED", cancelledAt: now, cancelledBy: user.id, cancelledByName: user.name || user.email, cancellationReason: reason, updatedAt: now });
    }
    
    return NextResponse.json({ success: true, deleted: deleteCompletely && isAdmin, laundryOrdersCancelled, message: deleteCompletely && isAdmin ? "Pulizia eliminata" : "Pulizia cancellata" });
  } catch (error) {
    console.error("Errore cancellazione pulizia:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
