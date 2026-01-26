import { NextResponse } from "next/server";
import { doc, getDoc, updateDoc, Timestamp, collection, getDocs, query, where } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { createNotification } from "~/lib/firebase/notifications";

/**
 * PATCH /api/orders/[id]/urgency
 * 
 * Modifica l'urgenza di un ordine (solo ADMIN)
 * Se l'ordine diventa urgente, invia notifica a tutti i rider
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { urgency, userId, userRole } = body;

    // Verifica che sia admin
    if (userRole !== "ADMIN") {
      return NextResponse.json(
        { error: "Solo gli admin possono modificare l'urgenza" },
        { status: 403 }
      );
    }

    // Verifica urgency valido
    if (urgency !== "normal" && urgency !== "urgent") {
      return NextResponse.json(
        { error: "Urgenza non valida. Usa 'normal' o 'urgent'" },
        { status: 400 }
      );
    }

    // Carica l'ordine
    const orderRef = doc(db, "orders", id);
    const orderSnap = await getDoc(orderRef);

    if (!orderSnap.exists()) {
      return NextResponse.json(
        { error: "Ordine non trovato" },
        { status: 404 }
      );
    }

    const orderData = orderSnap.data();
    const previousUrgency = orderData.urgency || "normal";

    // Se l'urgenza non cambia, non fare nulla
    if (previousUrgency === urgency) {
      return NextResponse.json({
        success: true,
        message: "Urgenza già impostata",
        order: { id, urgency }
      });
    }

    // Aggiorna l'ordine
    await updateDoc(orderRef, {
      urgency,
      updatedAt: Timestamp.now(),
    });

    console.log(`🚨 Ordine ${id}: urgenza cambiata da ${previousUrgency} a ${urgency}`);

    // Se diventa URGENTE, notifica tutti i rider
    if (urgency === "urgent") {
      await notifyAllRiders(orderData, id);
    }

    return NextResponse.json({
      success: true,
      message: urgency === "urgent" 
        ? "Ordine marcato come URGENTE. Notifica inviata ai rider."
        : "Urgenza rimossa dall'ordine.",
      order: { id, urgency }
    });

  } catch (error) {
    console.error("❌ Errore modifica urgenza:", error);
    return NextResponse.json(
      { error: "Errore nella modifica dell'urgenza" },
      { status: 500 }
    );
  }
}

/**
 * Invia notifica a tutti i rider attivi
 */
async function notifyAllRiders(orderData: any, orderId: string) {
  try {
    // Trova tutti gli utenti con ruolo RIDER
    const usersRef = collection(db, "users");
    const ridersQuery = query(usersRef, where("role", "==", "RIDER"));
    const ridersSnap = await getDocs(ridersQuery);

    const propertyName = orderData.propertyName || "Proprietà";
    const propertyAddress = orderData.propertyAddress || "";

    let notificationsSent = 0;

    for (const riderDoc of ridersSnap.docs) {
      const riderId = riderDoc.id;
      
      try {
        await createNotification({
          userId: riderId,
          type: "urgent_order",
          title: "🚨 ORDINE URGENTE",
          message: `Nuova consegna urgente: ${propertyName}${propertyAddress ? ` - ${propertyAddress}` : ""}`,
          data: {
            orderId,
            propertyId: orderData.propertyId,
            propertyName,
            propertyAddress,
          },
          read: false,
        });
        notificationsSent++;
      } catch (e) {
        console.error(`Errore notifica rider ${riderId}:`, e);
      }
    }

    console.log(`🔔 Notifiche urgenti inviate a ${notificationsSent} rider`);

  } catch (error) {
    console.error("❌ Errore invio notifiche rider:", error);
  }
}
