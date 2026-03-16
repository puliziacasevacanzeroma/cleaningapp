/**
 * POST /api/admin/fix-property-owners-manual
 * Fix manuale di una singola proprietà con ownerId sbagliato
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user || user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const body = await request.json();
    const { propertyId, ownerId, ownerName, ownerEmail, sendNotification, propertyName, cleaningPrice } = body;

    if (!propertyId || !ownerId) {
      return NextResponse.json({ error: "propertyId e ownerId obbligatori" }, { status: 400 });
    }

    // Aggiorna ownerId sulla proprietà
    await adminDb.collection("properties").doc(propertyId).update({
      ownerId,
      ownerName: ownerName || "",
      ownerEmail: ownerEmail || "",
      updatedAt: Timestamp.now(),
    });

    let notificationSent = false;

    // Invia notifica se richiesto (proprietà PENDING_SIGNATURE)
    if (sendNotification && ownerId) {
      try {
        await adminDb.collection("notifications").add({
          title: "Proprietà Approvata! 🎉",
          message: `La tua proprietà "${propertyName}" è stata approvata con prezzo pulizia di €${cleaningPrice || 0}. Vai nella sezione Proprietà e firma l'Allegato D per attivarla.`,
          type: "SUCCESS",
          recipientRole: "PROPRIETARIO",
          recipientId: ownerId,
          senderId: "system",
          senderName: "Sistema",
          relatedEntityId: propertyId,
          relatedEntityType: "PROPERTY",
          relatedEntityName: propertyName,
          link: "/proprietario/proprieta",
          status: "UNREAD",
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
        notificationSent = true;
      } catch (notifErr) {
        console.warn("Notifica non inviata:", notifErr);
      }
    }

    return NextResponse.json({
      success: true,
      propertyId,
      ownerId,
      notificationSent,
      message: `Proprietà aggiornata${notificationSent ? " + notifica inviata" : ""}`,
    });

  } catch (error: any) {
    console.error("Errore fix manuale:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
