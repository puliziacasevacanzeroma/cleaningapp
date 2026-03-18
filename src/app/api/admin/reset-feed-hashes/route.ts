/**
 * POST /api/admin/reset-feed-hashes
 * 
 * Resetta gli hash dei feed iCal per forzare il cron a riprocessare tutti i feed.
 * Query params:
 *   ?propertyId=xxx — solo una proprietà
 *   ?all=true — tutte le proprietà
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const propertyId = req.nextUrl.searchParams.get("propertyId");
    const all = req.nextUrl.searchParams.get("all") === "true";

    if (!propertyId && !all) {
      return NextResponse.json({ error: "Specifica ?propertyId=xxx o ?all=true" }, { status: 400 });
    }

    let count = 0;

    if (propertyId) {
      await adminDb.collection("properties").doc(propertyId).update({ feedHashes: {} });
      count = 1;
    } else {
      const snap = await adminDb.collection("properties").where("status", "in", ["ACTIVE", "PENDING_SIGNATURE"]).get();
      const batch = adminDb.batch();
      snap.docs.forEach(doc => {
        batch.update(doc.ref, { feedHashes: {} });
      });
      await batch.commit();
      count = snap.docs.length;
    }

    return NextResponse.json({ 
      success: true, 
      message: `Hash resettati per ${count} proprietà. Il prossimo cron riprocesserà tutti i feed.` 
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
