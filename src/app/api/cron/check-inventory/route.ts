/**
 * GET /api/cron/check-inventory?secret=XXXX
 * Mostra tutti gli item dell'inventario con il loro categoryId
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("secret") !== process.env.CRON_SECRET) 
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const snap = await adminDb.collection("inventory").get();
  const items = snap.docs.map(d => {
    const data = d.data();
    return {
      docId: d.id,
      key: data.key || null,
      name: data.name || '(no name)',
      categoryId: data.categoryId || '(none)',
      sellPrice: data.sellPrice || 0,
    };
  });

  // Raggruppa per categoryId
  const byCategory: Record<string, typeof items> = {};
  items.forEach(i => {
    const cat = i.categoryId;
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(i);
  });

  return NextResponse.json({ totalItems: items.length, byCategory });
}
