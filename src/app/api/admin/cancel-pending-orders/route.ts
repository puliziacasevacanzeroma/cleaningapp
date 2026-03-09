import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { hardDelete } = body;
    const now = Timestamp.now();

    const ordersSnapshot = await adminDb.collection("orders").get();
    const ordersToCancel = hardDelete
      ? ordersSnapshot.docs
      : ordersSnapshot.docs.filter(doc => {
          const status = (doc.data() as Record<string, any>).status;
          return status !== "COMPLETED" && status !== "CANCELLED" && status !== "DELIVERED";
        });

    let cancelledCount = 0;
    for (const orderDoc of ordersToCancel) {
      try {
        if (hardDelete) {
          await orderDoc.ref.delete();
        } else {
          await orderDoc.ref.update({ status: "CANCELLED", cancelledAt: now, cancelledBy: user.id, cancelReason: "Cancellazione massiva admin", updatedAt: now });
        }
        cancelledCount++;
      } catch (err) { console.error(`❌ Errore ordine ${orderDoc.id}:`, err); }
    }

    return NextResponse.json({ success: true, cancelled: cancelledCount, total: ordersToCancel.length, message: `${cancelledCount} ordini ${hardDelete ? 'eliminati' : 'cancellati'}` });
  } catch (error) {
    console.error("Errore cancellazione ordini:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const user = await getApiUser();
    if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const ordersSnapshot = await adminDb.collection("orders").get();
    const byStatus: Record<string, number> = {};
    const orders = ordersSnapshot.docs.map(doc => {
      const data = doc.data() as Record<string, any>;
      byStatus[data.status] = (byStatus[data.status] || 0) + 1;
      return { id: doc.id, propertyName: data.propertyName, status: data.status, createdAt: data.createdAt?.toDate?.()?.toISOString() };
    });

    return NextResponse.json({ totalOrders: orders.length, byStatus, orders });
  } catch (error) {
    console.error("Errore:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
