import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, DeletionRequestSchema } from "~/lib/validation/schemas";

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const _body = await validateBody(request, DeletionRequestSchema);
    if (_body instanceof Response) return _body;
    const { propertyId, reason } = _body;
    if (!propertyId || !reason) return NextResponse.json({ error: "PropertyId e reason sono obbligatori" }, { status: 400 });

    const propertyDoc = await adminDb.collection("properties").doc(propertyId).get();
    if (!propertyDoc.exists) return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });

    const propertyData = propertyDoc.data()!;
    const isOwner = propertyData.ownerId === user.id || propertyData.userId === user.id;
    const isAdmin = user.role?.toUpperCase() === "ADMIN";
    if (!isOwner && !isAdmin) return NextResponse.json({ error: "Non autorizzato per questa proprietà" }, { status: 403 });

    const existingSnap = await adminDb.collection("deletionRequests").where("propertyId", "==", propertyId).where("status", "==", "pending").get();
    if (!existingSnap.empty) return NextResponse.json({ error: "Esiste già una richiesta pending per questa proprietà" }, { status: 400 });

    let ownerData = { name: user.name, email: user.email };
    if (propertyData.ownerId && propertyData.ownerId !== user.id) {
      const ownerDoc = await adminDb.collection("users").doc(propertyData.ownerId).get();
      if (ownerDoc.exists) { const o = ownerDoc.data()!; ownerData = { name: o.name || "N/D", email: o.email || "N/D" }; }
    }

    const docRef = await adminDb.collection("deletionRequests").add({ propertyId, propertyName: propertyData.name || "Proprietà senza nome", ownerId: propertyData.ownerId || user.id, ownerName: ownerData.name, ownerEmail: ownerData.email, reason, status: "pending", createdAt: Timestamp.now(), updatedAt: Timestamp.now() });

    await adminDb.collection("properties").doc(propertyId).update({ status: "PENDING_DELETION", deactivationRequested: true, deactivationReason: reason, deactivationRequestedAt: Timestamp.now(), updatedAt: Timestamp.now() });

    await adminDb.collection("notifications").add({ title: "Richiesta Cancellazione Proprietà", message: `${ownerData.name} ha richiesto la cancellazione di "${propertyData.name}". Motivo: ${reason}`, type: "DELETION_REQUEST", recipientRole: "ADMIN", recipientId: null, senderId: user.id, senderName: user.name, status: "UNREAD", actionRequired: true, link: "/dashboard/proprieta/pending", metadata: { propertyId, deletionRequestId: docRef.id }, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });

    return NextResponse.json({ success: true, id: docRef.id, message: "Richiesta inviata con successo" });
  } catch (error) {
    console.error("Errore creazione richiesta cancellazione:", error);
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const isAdmin = user.role?.toUpperCase() === "ADMIN";
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "pending";
    const propertyId = searchParams.get("propertyId");

    let query: FirebaseFirestore.Query;
    if (isAdmin) {
      query = status === "all"
        ? adminDb.collection("deletionRequests").orderBy("createdAt", "desc")
        : adminDb.collection("deletionRequests").where("status", "==", status).orderBy("createdAt", "desc");
    } else {
      query = propertyId
        ? adminDb.collection("deletionRequests").where("ownerId", "==", user.id).where("propertyId", "==", propertyId)
        : adminDb.collection("deletionRequests").where("ownerId", "==", user.id).orderBy("createdAt", "desc");
    }

    const snapshot = await query.get();
    const requests = await Promise.all(snapshot.docs.map(async (docSnap) => {
      const data = docSnap.data() as Record<string, any>;
      let property = null;
      if (data.propertyId) {
        const propDoc = await adminDb.collection("properties").doc(data.propertyId).get();
        if (propDoc.exists) { const p = propDoc.data()!; property = { id: propDoc.id, name: p.name, address: p.address, status: p.status }; }
      }
      let owner = null;
      if (isAdmin && data.ownerId) {
        const ownerDoc = await adminDb.collection("users").doc(data.ownerId).get();
        if (ownerDoc.exists) { const o = ownerDoc.data()!; owner = { id: ownerDoc.id, name: o.name, email: o.email, phone: o.phone }; }
      }
      return { id: docSnap.id, ...data, createdAt: data.createdAt?.toDate?.() || null, updatedAt: data.updatedAt?.toDate?.() || null, reviewedAt: data.reviewedAt?.toDate?.() || null, property, owner };
    }));

    return NextResponse.json({ success: true, requests, total: requests.length });
  } catch (error) {
    console.error("Errore recupero richieste:", error);
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 });
  }
}
