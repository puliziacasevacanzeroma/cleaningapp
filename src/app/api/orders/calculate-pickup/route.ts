import { NextRequest, NextResponse } from "next/server";
import { calculatePickupItems } from "~/lib/services/linenOrderService";
import { getApiUser } from "~/lib/api-auth";


export const dynamic = 'force-dynamic';

/**
 * GET /api/orders/calculate-pickup?propertyId=xxx
 * 
 * Calcola gli articoli da ritirare per una proprietà.
 * Usata dal frontend quando crea ordini direttamente.
 */
export async function GET(req: NextRequest) {
  try {
  // ── Auth ──────────────────────────────────────────────
  const _user = await getApiUser();
  if (!_user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  // ─────────────────────────────────────────────────────

    const propertyId = req.nextUrl.searchParams.get("propertyId");
    
    if (!propertyId) {
      return NextResponse.json({ error: "propertyId richiesto" }, { status: 400 });
    }
    
    const result = await calculatePickupItems(propertyId);
    
    return NextResponse.json({
      success: true,
      ...result
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
