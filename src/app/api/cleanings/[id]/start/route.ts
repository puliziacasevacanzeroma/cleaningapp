import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { doc, getDoc, updateDoc, addDoc, collection, Timestamp } from "firebase/firestore";
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
    
    // Carica la pulizia
    const cleaningRef = doc(db, "cleanings", id);
    const cleaningSnap = await getDoc(cleaningRef);
    
    if (!cleaningSnap.exists()) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }
    
    const cleaning = cleaningSnap.data();
    
    // ─── VERIFICA STATO ───
    const validStatuses = ["SCHEDULED", "ASSIGNED", "assigned", "pending"];
    if (!validStatuses.includes(cleaning.status)) {
      return NextResponse.json({ 
        error: `Impossibile iniziare: stato attuale "${cleaning.status}"` 
      }, { status: 400 });
    }
    
    // ─── VERIFICA OPERATORE ───
    // L'operatore può iniziare solo se è assegnato a questa pulizia
    const isAdmin = user.role === "ADMIN";
    const isAssignedOperator = 
      cleaning.operatorId === user.id ||
      (cleaning.operators || []).some((op: { id: string }) => op.id === user.id);
    
    if (!isAdmin && !isAssignedOperator) {
      return NextResponse.json({ 
        error: "Non sei assegnato a questa pulizia" 
      }, { status: 403 });
    }
    
    // ─── AGGIORNA PULIZIA ───
    const now = Timestamp.now();
    await updateDoc(cleaningRef, { 
      status: "IN_PROGRESS",
      startedAt: now,
      startedBy: user.id,
      updatedAt: now
    });
    
    // ─── NOTIFICA ADMIN ───
    try {
      const dateStr = cleaning.scheduledDate?.toDate?.()?.toLocaleDateString("it-IT", {
        weekday: "short",
        day: "numeric",
        month: "short"
      }) || "oggi";
      
      await createNotification({
        title: "🧹 Pulizia iniziata",
        message: `${user.name || user.email} ha iniziato la pulizia di "${cleaning.propertyName}" (${dateStr})`,
        type: "CLEANING_STARTED",
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
    
    // ─── NOTIFICA PROPRIETARIO ───
    if (cleaning.ownerId) {
      try {
        await createNotification({
          title: "🧹 Pulizia in corso",
          message: `La pulizia di "${cleaning.propertyName}" è iniziata`,
          type: "CLEANING_STARTED",
          recipientRole: "PROPRIETARIO",
          recipientId: cleaning.ownerId,
          senderId: "system",
          senderName: "Sistema",
          relatedEntityId: id,
          relatedEntityType: "CLEANING",
          relatedEntityName: cleaning.propertyName,
          link: `/proprietario/pulizie`,
        });
      } catch (notifError) {
        console.error("Errore notifica proprietario:", notifError);
      }
    }
    
    // ─── AUTO-GENERA ORDINE BIANCHERIA (se configurato) ───
    let laundryOrderId = null;
    
    if (cleaning.propertyId) {
      try {
        const propertyRef = doc(db, "properties", cleaning.propertyId);
        const propertySnap = await getDoc(propertyRef);
        
        if (propertySnap.exists()) {
          const property = propertySnap.data();
          
          // Controlla se la proprietà ha auto-generazione biancheria attiva
          // e non usa biancheria propria
          if (property.autoGenerateLaundry && !property.usesOwnLinen) {
            // Verifica che non esista già un ordine per questa pulizia
            const existingOrderId = cleaning.laundryOrderId;
            
            if (!existingOrderId) {
              // Crea ordine biancheria automatico
              const linenConfig = property.linenConfig || [];
              
              if (linenConfig.length > 0) {
                const orderRef = await addDoc(collection(db, "orders"), {
                  propertyId: cleaning.propertyId,
                  propertyName: cleaning.propertyName,
                  propertyAddress: cleaning.propertyAddress || property.address,
                  cleaningId: id,
                  type: "LINEN",
                  status: "PENDING",
                  scheduledDate: cleaning.scheduledDate,
                  items: linenConfig.map((item: { itemId: string; itemName: string; quantity: number }) => ({
                    itemId: item.itemId,
                    name: item.itemName,
                    quantity: item.quantity,
                  })),
                  autoGenerated: true,
                  createdAt: now,
                  updatedAt: now,
                });
                
                laundryOrderId = orderRef.id;
                
                // Aggiorna pulizia con riferimento ordine
                await updateDoc(cleaningRef, {
                  laundryOrderId: laundryOrderId,
                  requiresLaundry: true,
                });
                
                console.log(`📦 Ordine biancheria auto-generato: ${laundryOrderId}`);
                
                // Notifica admin del nuovo ordine
                await createNotification({
                  title: "📦 Nuovo ordine biancheria",
                  message: `Ordine automatico per "${cleaning.propertyName}"`,
                  type: "LAUNDRY_NEW",
                  recipientRole: "ADMIN",
                  senderId: "system",
                  senderName: "Sistema",
                  relatedEntityId: laundryOrderId,
                  relatedEntityType: "CLEANING",
                  relatedEntityName: cleaning.propertyName,
                  link: `/dashboard/ordini/${laundryOrderId}`,
                });
              }
            }
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
