import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { createNotification } from "~/lib/firebase/notifications-admin";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, DeliverOrderSchema } from "~/lib/validation/schemas";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    
    const { id } = await params;
    const body = await validateBody(req, DeliverOrderSchema);
    if (body instanceof Response) return body;
    const { 
      withPickup = false,
      pickupStatus = [],
      pickupNote = "",
      pickupFromOrders = [],
      deliveryPhoto = null // Base64 o URL foto
    } = body;
    
    // Carica l'ordine
    const orderRef = adminDb.collection("orders").doc(id);
    const orderSnap = await orderRef.get();
    
    if (!orderSnap.exists) {
      return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
    }
    
    const order = orderSnap.data();
    
    // Verifica che sia il rider assegnato
    // @ts-expect-error TODO-FIX: TS18048 'order' is possibly 'undefined'.
    if (order.riderId !== user.id && user.role !== "ADMIN") {
      return NextResponse.json({ 
        error: "Non sei autorizzato a completare questo ordine" 
      }, { status: 403 });
    }
    
    const now = Timestamp.now();
    
    // Prepara dati aggiornamento
    const updateData: any = {
      status: "DELIVERED",
      deliveredAt: now,
      deliveredBy: user.id,
      deliveredByName: user.name || user.email,
      pickupCompleted: false, // La biancheria appena consegnata dovrà essere ritirata
      updatedAt: now,
    };
    
    // Se c'è foto consegna
    if (deliveryPhoto) {
      updateData.deliveryPhoto = deliveryPhoto;
    }
    
    // Se c'era ritiro
    if (withPickup) {
      updateData.pickupStatus = pickupStatus;
      updateData.pickupNote = pickupNote;
      updateData.pickupDoneAt = now;
      
      const hasIssues = pickupStatus.some((s: any) => s.status !== 'ok');
      if (hasIssues) {
        updateData.pickupHasIssues = true;
      }
    }
    
    // Aggiorna ordine
    await orderRef.update(updateData);
    
    // Segna ordini precedenti come ritirati
    if (pickupFromOrders && pickupFromOrders.length > 0) {
      for (const prevOrderId of pickupFromOrders) {
        try {
          await adminDb.collection("orders").doc(prevOrderId).update({
            pickupCompleted: true,
            pickupCompletedAt: now,
            pickupCompletedInOrderId: id,
          });
        } catch (e) {
          console.error(`Errore aggiornamento ordine ${prevOrderId}:`, e);
        }
      }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // 🔔 NOTIFICA OPERATORE
    // ═══════════════════════════════════════════════════════════════
    // @ts-expect-error TODO-FIX: TS18048 'order' is possibly 'undefined'.
    if (order.cleaningId) {
      try {
        // @ts-expect-error TODO-FIX: TS18048 'order' is possibly 'undefined'.
        const cleaningRef = adminDb.collection("cleanings").doc(order.cleaningId);
        const cleaningSnap = await cleaningRef.get();
        
        if (cleaningSnap.exists) {
          const cleaning = cleaningSnap.data();
          
          // Notifica operatore assegnato
          const operatorIds = new Set<string>();
          // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
          if (cleaning.operatorId) operatorIds.add(cleaning.operatorId);
          // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
          if (cleaning.operators) {
            // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
            cleaning.operators.forEach((op: any) => {
              if (op.id) operatorIds.add(op.id);
            });
          }
          
          for (const opId of operatorIds) {
            try {
              await createNotification({
                title: "📦 Biancheria consegnata",
                // @ts-expect-error TODO-FIX: TS18048 'order' is possibly 'undefined'.
                message: `La biancheria per "${order.propertyName}" è arrivata`,
                type: "LINEN_DELIVERED",
                recipientRole: "OPERATORE_PULIZIE",
                recipientId: opId,
                senderId: user.id,
                senderName: user.name || "Rider",
                relatedEntityId: id,
                relatedEntityType: "ORDER",
                // @ts-expect-error TODO-FIX: TS18048 'order' is possibly 'undefined'.
                relatedEntityName: order.propertyName,
                link: `/operatore`,
              });
            } catch (e) {
              console.error(`Errore notifica operatore ${opId}:`, e);
            }
          }
        }
      } catch (e) {
        console.error("Errore caricamento pulizia:", e);
      }
    }
    
    // Notifica admin
    try {
      await createNotification({
        title: "📦 Ordine consegnato",
        // @ts-expect-error TODO-FIX: TS18048 'order' is possibly 'undefined'.
        message: `${user.name || "Rider"} ha consegnato l'ordine per "${order.propertyName}"`,
        type: "ORDER_DELIVERED",
        recipientRole: "ADMIN",
        senderId: user.id,
        senderName: user.name || "Rider",
        relatedEntityId: id,
        relatedEntityType: "ORDER",
        // @ts-expect-error TODO-FIX: TS18048 'order' is possibly 'undefined'.
        relatedEntityName: order.propertyName,
        link: `/dashboard/ordini`,
      });
    } catch (e) {
      console.error("Errore notifica admin:", e);
    }
    
    return NextResponse.json({ 
      success: true,
      deliveredAt: now.toDate().toISOString(),
      notifiedOperators: true,
    });
    
  } catch (error) {
    console.error("Errore completamento consegna:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
