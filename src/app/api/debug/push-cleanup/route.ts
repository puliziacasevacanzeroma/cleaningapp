import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  if (req.nextUrl.searchParams.get("secret") !== process.env.CRON_SECRET) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  try {
    const snapshot = await adminDb.collection("userDevices").get();
    const results = { total: snapshot.size, deleted: 0, kept: 0, details: [] as string[] };

    for (const docSnapshot of snapshot.docs) {
      const data = docSnapshot.data() as Record<string, any>;
      const docId = docSnapshot.id;
      if (docId === "_init" || !data.token || data.token === "undefined" || data.userId?.startsWith("mobile-debug") || data.userId === "mobile-debug-user" || data.userId === "mobile-debug") {
        await docSnapshot.ref.delete(); results.deleted++; results.details.push(`DELETED: ${docId}`); continue;
      }
      if (!data.isActive) {
        const updatedAt = data.updatedAt?.toDate?.() || new Date(0);
        if ((Date.now() - updatedAt.getTime()) / 86400000 > 7) {
          await docSnapshot.ref.delete(); results.deleted++; results.details.push(`DELETED: ${docId} (inattivo > 7gg)`); continue;
        }
      }
      results.kept++; results.details.push(`KEPT: ${docId} (userId: ${data.userId}, active: ${data.isActive})`);
    }
    return NextResponse.json(results);
  } catch (error: any) { return NextResponse.json({ error: error.message }, { status: 500 }); }
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("secret") !== process.env.CRON_SECRET) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const snapshot = await adminDb.collection("userDevices").get();
  const devices = snapshot.docs.map(d => ({ id: d.id, userId: (d.data() as Record<string, any>).userId, isActive: (d.data() as Record<string, any>).isActive, deviceType: (d.data() as Record<string, any>).deviceType, token: ((d.data() as Record<string, any>).token || "").substring(0, 15) + "...", updatedAt: (d.data() as Record<string, any>).updatedAt?.toDate?.()?.toISOString() || null }));
  return NextResponse.json({ total: devices.length, active: devices.filter(d => d.isActive).length, devices });
}
