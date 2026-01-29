import { NextRequest, NextResponse } from "next/server";
import { doc, getDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const orderId = request.nextUrl.searchParams.get("id") || "GUA66PHbagnFvqu411nK";
  
  const orderDoc = await getDoc(doc(db, "orders", orderId));
  const order = orderDoc.data();
  
  return NextResponse.json({
    orderId,
    items: order?.items || [],
    propertyName: order?.propertyName,
  });
}
