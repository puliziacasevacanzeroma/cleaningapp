import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, DeletionActionSchema } from "~/lib/validation/schemas";

interface RouteParams { params: Promise<{ id: string }>; }

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getApiUser();
    const { id } = await params;
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const reqDoc = await adminDb.collection("deletionRequests").doc(id).get();
    if (!reqDoc.exists) return NextResponse.json({ error: "Richiesta non trovata" }, { status: 404 });
    const data = reqDoc.data()!;
    const isAdmin = user.role?.toUpperCase() === "ADMIN";
    if (!isAdmin && data.ownerId !== user.id) return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });

    let property = null;
    if (data.propertyId) { const p = await adminDb.collection("properties").doc(data.propertyId).get(); if (p.exists) property = { id: p.id, ...(p.data() as Record<string, any>) }; }
    let owner = null;
    if (data.ownerId) { const o = await adminDb.collection("users").doc(data.ownerId).get(); if (o.exists) owner = { id: o.id, ...(o.data() as Record<string, any>) }; }

    return NextResponse.json({ success: true, request: { id: reqDoc.id, ...data, createdAt: data.createdAt?.toDate?.() || null, updatedAt: data.updatedAt?.toDate?.() || null, reviewedAt: data.reviewedAt?.toDate?.() || null, property, owner } });
  } catch (error) { return NextResponse.json({ error: "Errore interno" }, { status: 500 }); }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getApiUser();
    const { id } = await params;
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    if (user.role?.toUpperCase() !== "ADMIN") return NextResponse.json({ error: "Solo admin" }, { status: 403 });

    const _body = await validateBody(request, DeletionActionSchema);
    if (_body instanceof Response) return _body;
    const { status, adminNote } = _body;
    if (!status || !["approved", "rejected"].includes(status)) return NextResponse.json({ error: "Status deve essere 'approved' o 'rejected'" }, { status: 400 });

    const reqDoc = await adminDb.collection("deletionRequests").doc(id).get();
    if (!reqDoc.exists) return NextResponse.json({ error: "Richiesta non trovata" }, { status: 404 });
    const requestData = reqDoc.data()!;
    if (requestData.status !== "pending") return NextResponse.json({ error: "Richiesta già processata" }, { status: 400 });

    await reqDoc.ref.update({ status, adminNote: adminNote || null, reviewedBy: user.id, reviewedByName: user.name, reviewedAt: Timestamp.now(), updatedAt: Timestamp.now() });

    if (status === "approved") {
      const propDoc = await adminDb.collection("properties").doc(requestData.propertyId).get();
      if (propDoc.exists) {
        await propDoc.ref.update({ status: "DELETED", deletedAt: Timestamp.now(), deletedBy: user.id, deletionReason: requestData.reason, deactivationRequested: false, isActive: false, updatedAt: Timestamp.now() });
        const bookingsSnap = await adminDb.collection("bookings").where("propertyId", "==", requestData.propertyId).where("status", "==", "confirmed").get();
        for (const b of bookingsSnap.docs) {
          const checkIn = (b.data() as Record<string, any>).checkIn?.toDate?.() || new Date((b.data() as Record<string, any>).checkIn);
          if (checkIn > new Date()) await b.ref.update({ status: "cancelled", cancelledAt: Timestamp.now(), cancelReason: "Proprietà cancellata", updatedAt: Timestamp.now() });
        }
        const cleaningsSnap = await adminDb.collection("cleanings").where("propertyId", "==", requestData.propertyId).where("status", "in", ["PENDING", "SCHEDULED", "IN_PROGRESS"]).get();
        for (const c of cleaningsSnap.docs) await c.ref.update({ status: "CANCELLED", cancelledAt: Timestamp.now(), cancelReason: "Proprietà cancellata", updatedAt: Timestamp.now() });
      }
      await adminDb.collection("notifications").add({ title: "Richiesta Cancellazione Approvata", message: `La richiesta per "${requestData.propertyName}" è stata approvata.${adminNote ? ` Nota: ${adminNote}` : ""}`, type: "SUCCESS", recipientRole: "PROPRIETARIO", recipientId: requestData.ownerId, senderId: user.id, senderName: user.name, status: "UNREAD", link: `/proprietario/proprieta`, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
    } else {
      await adminDb.collection("properties").doc(requestData.propertyId).update({ status: "ACTIVE", deactivationRequested: false, deactivationReason: null, deactivationRequestedAt: null, updatedAt: Timestamp.now() });
      await adminDb.collection("notifications").add({ title: "Richiesta Cancellazione Rifiutata", message: `La richiesta per "${requestData.propertyName}" è stata rifiutata.${adminNote ? ` Motivo: ${adminNote}` : ""}`, type: "WARNING", recipientRole: "PROPRIETARIO", recipientId: requestData.ownerId, senderId: user.id, senderName: user.name, status: "UNREAD", link: `/proprietario/proprieta`, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
    }

    return NextResponse.json({ success: true, message: status === "approved" ? "Proprietà cancellata" : "Proprietà ripristinata", status });
  } catch (error) { return NextResponse.json({ error: "Errore interno" }, { status: 500 }); }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getApiUser();
    const { id } = await params;
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const reqDoc = await adminDb.collection("deletionRequests").doc(id).get();
    if (!reqDoc.exists) return NextResponse.json({ error: "Richiesta non trovata" }, { status: 404 });
    const requestData = reqDoc.data()!;
    const isAdmin = user.role?.toUpperCase() === "ADMIN";
    if (requestData.ownerId !== user.id && !isAdmin) return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    if (requestData.status !== "pending") return NextResponse.json({ error: "Solo richieste pending possono essere annullate" }, { status: 400 });

    await adminDb.collection("properties").doc(requestData.propertyId).update({ status: "ACTIVE", deactivationRequested: false, deactivationReason: null, deactivationRequestedAt: null, updatedAt: Timestamp.now() });
    await reqDoc.ref.delete();

    return NextResponse.json({ success: true, message: "Richiesta annullata" });
  } catch (error) { return NextResponse.json({ error: "Errore interno" }, { status: 500 }); }
}
