import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { 
  doc, 
  getDoc, 
  updateDoc, 
  addDoc, 
  collection, 
  Timestamp 
} from "firebase/firestore";
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
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    
    const { id } = await params;
    const body = await req.json();
    const { newDate, newTime, reason } = body;
    
    if (!newDate) {
      return NextResponse.json({ error: "Nuova data richiesta" }, { status: 400 });
    }
    
    // Carica la pulizia
    const cleaningRef = doc(db, "cleanings", id);
    const cleaningSnap = await getDoc(cleaningRef);
    
    if (!cleaningSnap.exists()) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }
    
    const cleaning = cleaningSnap.data();
    
    // ─── VERIFICA PERMESSI ───
    const isAdmin = user.role === "ADMIN";
    const isOwner = cleaning.ownerId === user.id;
    
    if (!isAdmin && !isOwner) {
      return NextResponse.json({ 
        error: "Non hai i permessi per spostare questa pulizia" 
      }, { status: 403 });
    }
    
    // ─── VERIFICA STATO ───
    if (cleaning.status === "COMPLETED" || cleaning.status === "completed" ||
        cleaning.status === "CANCELLED" || cleaning.status === "cancelled") {
      return NextResponse.json({ 
        error: "Non puoi spostare una pulizia completata o cancellata" 
      }, { status: 400 });
    }
    
    if (cleaning.status === "IN_PROGRESS" || cleaning.status === "in_progress") {
      return NextResponse.json({ 
        error: "Non puoi spostare una pulizia in corso" 
      }, { status: 400 });
    }
    
    const now = Timestamp.now();
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
      if (newTime && newTime !== cleaning.scheduledTime) {
        await updateDoc(cleaningRef, {
          scheduledTime: newTime,
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
    if (cleaning.bookingSource || cleaning.externalUid) {
      await addDoc(collection(db, "syncExclusions"), {
        propertyId: cleaning.propertyId,
        originalDate: originalDate,
        bookingSource: cleaning.bookingSource || "manual",
        bookingId: cleaning.bookingId || null,
        reason: "MOVED",
        newDate: newScheduledDate,
        cleaningId: id,
        createdAt: now,
        createdBy: user.id,
      });
      
      // Crea anche record di pulizia cancellata per la data originale
      await addDoc(collection(db, "cancelledCleanings"), {
        propertyId: cleaning.propertyId,
        originalDate: originalDate,
        externalUid: cleaning.externalUid || null,
        bookingSource: cleaning.bookingSource || null,
        reason: `Spostata a ${newDateStr}${reason ? `: ${reason}` : ""}`,
        cleaningId: id,
        cancelledBy: user.id,
        cancelledAt: now,
        movedTo: newScheduledDate,
      });
      
      console.log(`🔐 Esclusione sync creata per data originale ${originalDateStr}`);
    }
    
    // ─── AGGIORNA PULIZIA ───
    const updateData: Record<string, unknown> = {
      scheduledDate: newScheduledDate,
      originalDate: originalDate, // Salva data originale
      movedAt: now,
      movedBy: user.id,
      movedByName: user.name || user.email,
      moveReason: reason || null,
      manuallyModified: true,
      updatedAt: now,
    };
    
    if (newTime) {
      updateData.scheduledTime = newTime;
    }
    
    await updateDoc(cleaningRef, updateData);
    
    // ─── NOTIFICA OPERATORE SE ASSEGNATO ───
    const operators = cleaning.operators || [];
    if (cleaning.operatorId) {
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
          await createNotification({
            title: "📅 Pulizia spostata",
            message: `La pulizia di "${cleaning.propertyName}" è stata spostata da ${originalDateFormatted} a ${newDateFormatted}${reason ? `. Motivo: ${reason}` : ""}`,
            type: "INFO",
            recipientRole: "OPERATORE_PULIZIE",
            recipientId: operator.id,
            senderId: user.id,
            senderName: user.name || user.email,
            relatedEntityId: id,
            relatedEntityType: "CLEANING",
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
          message: `${user.name || user.email} ha spostato la pulizia di "${cleaning.propertyName}" da ${originalDateFormatted} a ${newDateFormatted}`,
          type: "INFO",
          recipientRole: "ADMIN",
          senderId: user.id,
          senderName: user.name || user.email,
          relatedEntityId: id,
          relatedEntityType: "CLEANING",
          relatedEntityName: cleaning.propertyName,
          link: `/dashboard/calendario/pulizie`,
        });
      } catch (notifError) {
        console.error("Errore notifica admin:", notifError);
      }
    }
    
    // ─── AGGIORNA ORDINE BIANCHERIA SE PRESENTE ───
    if (cleaning.laundryOrderId) {
      try {
        const orderRef = doc(db, "orders", cleaning.laundryOrderId);
        const orderSnap = await getDoc(orderRef);
        
        if (orderSnap.exists()) {
          const order = orderSnap.data();
          
          // Aggiorna data solo se non già in transito
          if (order.status === "PENDING" || order.status === "ASSIGNED") {
            await updateDoc(orderRef, {
              scheduledDate: newScheduledDate,
              updatedAt: now,
            });
            
            console.log(`📦 Data ordine biancheria aggiornata`);
          }
        }
      } catch (orderError) {
        console.error("Errore aggiornamento ordine:", orderError);
      }
    }
    
    return NextResponse.json({ 
      success: true,
      originalDate: originalDateStr,
      newDate: newDateStr,
      newTime: newTime || cleaning.scheduledTime,
      message: `Pulizia spostata da ${originalDateFormatted} a ${newDateFormatted}`
    });
  } catch (error) {
    console.error("Errore spostamento pulizia:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
