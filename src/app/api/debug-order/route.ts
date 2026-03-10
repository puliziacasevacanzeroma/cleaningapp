import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const orderId = url.searchParams.get("id");
    
    if (!orderId) {
      // List recent orders
      const snap = await adminDb.collection("orders").orderBy("createdAt", "desc").limit(5).get();
      const orders = snap.docs.map(d => ({
        id: d.id,
        propertyName: d.data().propertyName,
        status: d.data().status,
        bedMaking: d.data().bedMaking,
        bedMakingCount: d.data().bedMakingCount,
        bedMakingFee: d.data().bedMakingFee,
        deliveryFee: d.data().deliveryFee,
        createdAt: d.data().createdAt?.toDate?.()?.toISOString(),
      }));
      return NextResponse.json({ orders });
    }

    const doc = await adminDb.collection("orders").doc(orderId).get();
    if (!doc.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
    
    const data = doc.data();
    return NextResponse.json({
      id: doc.id,
      allFields: Object.keys(data || {}),
      bedMaking: data?.bedMaking,
      bedMakingCount: data?.bedMakingCount,
      bedMakingFee: data?.bedMakingFee,
      deliveryFee: data?.deliveryFee,
      deliveryFeeEnabled: data?.deliveryFeeEnabled,
      items: data?.items?.length,
      status: data?.status,
      propertyName: data?.propertyName,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
