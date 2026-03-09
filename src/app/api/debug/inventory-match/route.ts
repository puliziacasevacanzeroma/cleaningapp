import { NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export async function GET() {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  try {
    const inventorySnap = await adminDb.collection("inventory").get();
    const inventory = inventorySnap.docs.map(doc => ({ docId: doc.id, ...(doc.data() as Record<string, any>) }));

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const ordersSnap = await adminDb.collection("orders")
      .where("scheduledDate", ">=", Timestamp.fromDate(today))
      .where("scheduledDate", "<", Timestamp.fromDate(tomorrow))
      .get();
    const orders = ordersSnap.docs.map(doc => ({ id: doc.id, propertyName: (doc.data() as Record<string, any>).propertyName, items: (doc.data() as Record<string, any>).items || [] }));

    const matchResults = orders.map(order => ({
      orderId: order.id, propertyName: order.propertyName,
      items: (order.items as any[]).map((item: any) => ({
        itemId: item.id, itemName: item.name, quantity: item.quantity,
        matchById: inventory.find((i: any) => i.docId === item.id) || null,
        matchByKey: inventory.find((i: any) => i.key === item.id) || null,
        matchByName: inventory.find((i: any) => i.name === item.name) || null,
      }))
    }));

    return NextResponse.json({ inventoryCount: inventory.length, inventorySummary: inventory.map((i: any) => ({ docId: i.docId, key: i.key, name: i.name, sellPrice: i.sellPrice, category: i.categoryId || i.category })), ordersCount: orders.length, matchResults });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
