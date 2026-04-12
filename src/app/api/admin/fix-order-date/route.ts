import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/fix-order-date?orderId=XXX&newDate=YYYY-MM-DD
 * 
 * Sposta la scheduledDate di un ordine biancheria.
 * Solo admin.
 */
export async function GET(request: NextRequest) {
  const user = await getApiUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo admin" }, { status: 403 });
  }

  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId");
  const newDate = url.searchParams.get("newDate");

  if (!orderId || !newDate) {
    return NextResponse.json({ error: "Parametri ?orderId= e ?newDate=YYYY-MM-DD richiesti" }, { status: 400 });
  }

  // Verifica ordine esiste
  const orderRef = adminDb.collection("orders").doc(orderId);
  const orderSnap = await orderRef.get();

  if (!orderSnap.exists) {
    return NextResponse.json({ error: "Ordine non trovato", orderId }, { status: 404 });
  }

  const orderData = orderSnap.data() as Record<string, any>;
  const oldDate = orderData.scheduledDate?.toDate?.()?.toISOString().split('T')[0] || "unknown";

  // Crea nuova data a mezzogiorno
  const [y, m, d] = newDate.split('-').map(Number);
  const newTimestamp = Timestamp.fromDate(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)));

  await orderRef.update({
    scheduledDate: newTimestamp,
    updatedAt: Timestamp.now(),
  });

  return NextResponse.json({
    success: true,
    orderId,
    propertyName: orderData.propertyName || "",
    oldDate,
    newDate,
    status: orderData.status,
  });
}
