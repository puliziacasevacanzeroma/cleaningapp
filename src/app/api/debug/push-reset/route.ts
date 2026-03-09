import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  if (req.nextUrl.searchParams.get("secret") !== process.env.CRON_SECRET) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  try {
    const snapshot = await adminDb.collection("userDevices").get();
    let deleted = 0;
    for (const d of snapshot.docs) { await d.ref.delete(); deleted++; }
    return NextResponse.json({ success: true, deleted, message: "Tutti i token eliminati." });
  } catch (error: any) { return NextResponse.json({ error: error.message }, { status: 500 }); }
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("secret") !== process.env.CRON_SECRET) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const snapshot = await adminDb.collection("userDevices").get();
  return NextResponse.json({ total: snapshot.size, devices: snapshot.docs.map(d => ({ id: d.id, userId: (d.data() as Record<string, any>).userId, isActive: (d.data() as Record<string, any>).isActive, deviceType: (d.data() as Record<string, any>).deviceType, token: ((d.data() as Record<string, any>).token || "").substring(0, 20) + "..." })) });
}
