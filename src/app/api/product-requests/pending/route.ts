import { NextRequest, NextResponse } from "next/server";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════
// GET - Richieste prodotti pending per una proprietà
// Usato quando si crea una nuova pulizia per accorpare i prodotti
// ═══════════════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get("propertyId");

    if (!propertyId) {
      return NextResponse.json({ error: "propertyId richiesto" }, { status: 400 });
    }

    const snapshot = await getDocs(
      query(
        collection(db, "productRequests"),
        where("propertyId", "==", propertyId),
        where("status", "==", "pending")
      )
    );

    const requests = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null,
    }));

    // Aggrega tutti gli items da tutte le richieste pending
    const aggregatedItems: Record<string, { itemId: string; name: string; quantity: number; requestIds: string[] }> = {};
    
    requests.forEach(request => {
      const items = (request as any).items || [];
      items.forEach((item: any) => {
        const key = item.itemId || item.name;
        if (aggregatedItems[key]) {
          aggregatedItems[key].quantity += item.quantity;
          aggregatedItems[key].requestIds.push(request.id);
        } else {
          aggregatedItems[key] = {
            itemId: item.itemId,
            name: item.name,
            quantity: item.quantity,
            requestIds: [request.id],
          };
        }
      });
    });

    return NextResponse.json({ 
      requests,
      aggregatedItems: Object.values(aggregatedItems),
      totalRequests: requests.length,
    });
  } catch (error) {
    console.error("Errore GET pending requests:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
