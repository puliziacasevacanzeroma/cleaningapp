import { NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { createNotification } from "~/lib/firebase/notifications-admin";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, OrderUrgencySchema } from "~/lib/validation/schemas";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const _user = await getApiUser();
    if (!_user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    if (_user.role?.toUpperCase() !== "ADMIN") return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

    const { id } = await params;
    const body = await validateBody(request, OrderUrgencySchema);
    if (body instanceof Response) return body;
    const { urgency, userRole } = body;

    if (userRole !== "ADMIN") {
      return NextResponse.json({ error: "Solo gli admin possono modificare l'urgenza" }, { status: 403 });
    }

    if (urgency !== "normal" && urgency !== "urgent") {
      return NextResponse.json({ error: "Urgenza non valida. Usa 'normal' o 'urgent'" }, { status: 400 });
    }

    const orderRef = adminDb.collection("orders").doc(id);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
    }

    const orderData = orderSnap.data() as Record<string, any>;
    const previousUrgency = orderData.urgency || "normal";

    if (previousUrgency === urgency) {
      return NextResponse.json({ success: true, message: "Urgenza già impostata", order: { id, urgency } });
    }

    await orderRef.update({ urgency, updatedAt: Timestamp.now() });

    if (urgency === "urgent") {
      await notifyAllRiders(orderData, id);
    }

    return NextResponse.json({
      success: true,
      message: urgency === "urgent" ? "Ordine marcato come URGENTE. Notifica inviata ai rider." : "Urgenza rimossa dall'ordine.",
      order: { id, urgency }
    });

  } catch (error) {
    console.error("Errore modifica urgenza:", error);
    return NextResponse.json({ error: "Errore nella modifica dell'urgenza" }, { status: 500 });
  }
}

async function notifyAllRiders(orderData: any, orderId: string) {
  try {
    const usersRef = adminDb.collection("users");
    const ridersQuery = usersRef.where("role", "==", "RIDER");
    const ridersSnap = await ridersQuery.get();

    const propertyName = orderData.propertyName || "Proprietà";
    const propertyAddress = orderData.propertyAddress || "";

    for (const riderDoc of ridersSnap.docs) {
      try {
        await createNotification({
          title: "ORDINE URGENTE",
          message: `Nuova consegna urgente: ${propertyName}${propertyAddress ? ` - ${propertyAddress}` : ""}`,
          type: "WARNING",
          recipientRole: "RIDER",
          recipientId: riderDoc.id,
          senderId: "system",
          senderName: "Sistema",
          relatedEntityId: orderId,
          relatedEntityType: "ORDER",
          relatedEntityName: propertyName,
          link: `/rider?order=${orderId}`,
        });
      } catch (e) {
        console.error(`Errore notifica rider ${riderDoc.id}:`, e);
      }
    }
  } catch (error) {
    console.error("Errore invio notifiche rider:", error);
  }
}