import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const _user = await getApiUser();
    if (!_user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    const propertyId = new URL(req.url).searchParams.get("propertyId");
    if (!propertyId) return NextResponse.json({ error: "propertyId richiesto" }, { status: 400 });

    const snapshot = await adminDb.collection("productRequests").where("propertyId", "==", propertyId).where("status", "==", "pending").get();
    const requests = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>), createdAt: (doc.data() as Record<string, any>).createdAt?.toDate?.()?.toISOString() || null }));

    const aggregatedItems: Record<string, { itemId: string; name: string; quantity: number; requestIds: string[] }> = {};
    requests.forEach(request => {
      ((request as any).items || []).forEach((item: any) => {
        const key = item.itemId || item.name;
        if (aggregatedItems[key]) { aggregatedItems[key].quantity += item.quantity; aggregatedItems[key].requestIds.push(request.id); }
        else aggregatedItems[key] = { itemId: item.itemId, name: item.name, quantity: item.quantity, requestIds: [request.id] };
      });
    });

    return NextResponse.json({ requests, aggregatedItems: Object.values(aggregatedItems), totalRequests: requests.length });
  } catch (error) { return NextResponse.json({ error: "Errore server" }, { status: 500 }); }
}
