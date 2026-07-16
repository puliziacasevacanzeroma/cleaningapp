import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";

/**
 * AUDIT PULIZIE DUPLICATE — v1 (READ-ONLY, non scrive mai)
 *
 * Elenca i casi di 2+ pulizie sulla stessa proprietà nello stesso giorno
 * (es. Domus Enea grande 06/10/2026 trovata con 2 pulizie SCHEDULED).
 * Di default guarda solo le FUTURE non cancellate; con &includePast=1 anche
 * il passato (utile per audit storico, ma lì non si tocca niente).
 *
 * Per ogni gruppo riporta id, status, bookingId, source, guestName, isManual,
 * lockedFromSync e laundryOrderId, così decidi TU quale tenere e quale
 * cancellare a mano dal gestionale.
 *
 * Uso: /api/debug/audit-duplicate-cleanings-v1?cronSecret=XXX
 *      [&includePast=1] [&propertyName=...]
 */

const d2s = (d: Date) => d.toISOString().split("T")[0];

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("cronSecret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const includePast = req.nextUrl.searchParams.get("includePast") === "1";
  const propertyNameFilter = (req.nextUrl.searchParams.get("propertyName") || "").toLowerCase();

  try {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const snap = includePast
      ? await adminDb.collection("cleanings").get()
      : await adminDb.collection("cleanings").where("scheduledDate", ">=", todayStart).get();

    // Raggruppa per proprietà+giorno
    const groups = new Map<string, any[]>();
    snap.docs.forEach((doc) => {
      const x = doc.data() as any;
      if (x.status === "CANCELLED") return;
      const d = x.scheduledDate?.toDate?.();
      if (!d || !x.propertyId) return;
      if (propertyNameFilter && !String(x.propertyName || "").toLowerCase().includes(propertyNameFilter)) return;
      const key = `${x.propertyId}_${d2s(d)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({
        id: doc.id,
        propertyId: x.propertyId,
        propertyName: x.propertyName,
        date: d2s(d),
        status: x.status,
        type: x.type || null,
        bookingId: x.bookingId || null,
        bookingSource: x.bookingSource || null,
        guestName: x.guestName || null,
        isManual: x.isManual === true,
        lockedFromSync: x.lockedFromSync === true,
        turnoverRecovered: x.turnoverRecovered === true,
        laundryOrderId: x.laundryOrderId || null,
        assignedTo: x.assignedTo || null,
      });
    });

    const duplicates: any[] = [];
    for (const [, list] of groups.entries()) {
      if (list.length < 2) continue;
      duplicates.push({
        propertyName: list[0].propertyName || list[0].propertyId,
        date: list[0].date,
        count: list.length,
        cleanings: list,
        hint: "Tienine UNA (di norma quella con laundryOrderId o assegnata) e cancella le altre dal gestionale.",
      });
    }
    duplicates.sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      mode: "READ-ONLY",
      scope: includePast ? "TUTTE" : "solo future",
      cleaningsScanned: snap.size,
      duplicateGroups: duplicates.length,
      duplicates,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
