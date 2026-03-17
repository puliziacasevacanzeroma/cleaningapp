/**
 * POST /api/admin/lock-cleaning
 * Setta lockedFromSync=true su una pulizia specifica
 * Body: { cleaningId, originalDate: "2026-03-19" }
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user || user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { cleaningId, originalDate } = await request.json();
    if (!cleaningId || !originalDate) {
      return NextResponse.json({ error: "cleaningId e originalDate richiesti" }, { status: 400 });
    }

    const cleaningRef = adminDb.collection("cleanings").doc(cleaningId);
    const snap = await cleaningRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }

    const origDate = new Date(originalDate);
    origDate.setHours(12, 0, 0, 0);

    await cleaningRef.update({
      lockedFromSync: true,
      manuallyMoved: true,
      originalScheduledDate: Timestamp.fromDate(origDate),
      updatedAt: Timestamp.now(),
    });

    const data = snap.data() as any;
    return NextResponse.json({
      success: true,
      message: `Pulizia "${data.propertyName}" del ${data.scheduledDate?.toDate?.()?.toLocaleDateString("it-IT")} bloccata dal sync`,
      cleaningId,
      originalDate,
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
