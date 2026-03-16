/**
 * POST /api/admin/fix-property-owner-direct
 * Corregge l'ownerId di una proprietà con ID e email espliciti
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

    const { propertyId, ownerEmail } = await request.json();
    if (!propertyId || !ownerEmail) {
      return NextResponse.json({ error: "propertyId e ownerEmail richiesti" }, { status: 400 });
    }

    // Trova utente per email
    const usersSnap = await adminDb.collection("users")
      .where("email", "==", ownerEmail.toLowerCase().trim())
      .limit(1)
      .get();

    if (usersSnap.empty) {
      return NextResponse.json({ error: `Nessun utente trovato con email: ${ownerEmail}` }, { status: 404 });
    }

    const ownerDoc = usersSnap.docs[0];
    const ownerData = ownerDoc.data() as Record<string, any>;
    const ownerId = ownerDoc.id;

    // Aggiorna proprietà
    const propRef = adminDb.collection("properties").doc(propertyId);
    const propSnap = await propRef.get();
    if (!propSnap.exists) {
      return NextResponse.json({ error: `Proprietà ${propertyId} non trovata` }, { status: 404 });
    }

    const propData = propSnap.data() as Record<string, any>;

    await propRef.update({
      ownerId,
      ownerName: [ownerData.name, ownerData.surname].filter(Boolean).join(" ") || ownerData.email,
      ownerEmail: ownerData.email,
      updatedAt: Timestamp.now(),
    });

    // Invia notifica al proprietario
    await adminDb.collection("notifications").add({
      title: "Proprietà assegnata 🏠",
      message: `La proprietà "${propData.name}" è stata associata al tuo account. ${propData.status === "PENDING_SIGNATURE" ? "Firma l'Allegato D nella sezione Proprietà per attivarla." : ""}`,
      type: "SUCCESS",
      recipientRole: "PROPRIETARIO",
      recipientId: ownerId,
      senderId: "admin",
      senderName: "Amministrazione",
      relatedEntityId: propertyId,
      relatedEntityType: "PROPERTY",
      relatedEntityName: propData.name,
      actionRequired: propData.status === "PENDING_SIGNATURE",
      link: "/proprietario/proprieta",
      status: "UNREAD",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    return NextResponse.json({
      success: true,
      message: `Proprietà "${propData.name}" assegnata a ${ownerData.email} (ID: ${ownerId})`,
      ownerId,
      ownerEmail: ownerData.email,
    });

  } catch (error: any) {
    console.error("Errore fix-property-owner-direct:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
