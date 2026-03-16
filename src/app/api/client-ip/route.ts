/**
 * GET /api/client-ip
 * Ritorna l'IP reale del client (usato da accept-contract per la controprova)
 */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const cfIp = request.headers.get("cf-connecting-ip");

  const ip =
    cfIp ||
    (forwarded ? forwarded.split(",")[0]?.trim() : null) ||
    realIp ||
    "unknown";

  return NextResponse.json({ ip });
}
