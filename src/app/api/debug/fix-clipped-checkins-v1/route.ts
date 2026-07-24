/**
 * 🔧 DEBUG — fix-clipped-checkins-v1
 *
 * Ripara i 2 booking il cui check-in è stato "mangiato" dal taglio quotidiano
 * del feed Booking (bug clip-guard con mezzanotte UTC, corretto in
 * src/lib/icalSync/checkInClipGuard.ts). Valori ripristinati con EVIDENZE dai
 * backup Firestore del 14-24/07/2026:
 *
 * - Poerio 2B (SINISTRA), booking JxtmatuZKTeURFyB0JR5:
 *   check-in reale 2026-07-22 (presente identico nei backup 14, 21 e 22/07).
 * - Campo De Fiori Home, booking wTo7qy7rJMj5wxd34Qli:
 *   valore più antico documentato 2026-07-21 (backup 21/07; creato il 16/07,
 *   possibile inizio anche precedente ma non provabile dai backup disponibili).
 *
 * Uso (gated da cronSecret):
 *   GET /api/debug/fix-clipped-checkins-v1?cronSecret=...           → DRY-RUN
 *   GET /api/debug/fix-clipped-checkins-v1?cronSecret=...&apply=1   → APPLICA
 *
 * Cosa scrive (solo con apply=1): checkIn ripristinato + originalCheckIn +
 * feedStart (valore attuale corrotto, per traccia) + clipGuardAt + repairNote.
 * NON tocca checkOut, NON crea/modifica pulizie, NON tocca altri booking.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET;

const REPAIRS = [
  {
    bookingId: "JxtmatuZKTeURFyB0JR5",
    propertyLabel: "Poerio 2B (SINISTRA)",
    restoreCheckInISO: "2026-07-22T12:00:00.000Z",
    evidence: "backup 14/07, 21/07, 22/07 (identico in tutti e tre)",
  },
  {
    bookingId: "wTo7qy7rJMj5wxd34Qli",
    propertyLabel: "Campo De Fiori Home",
    restoreCheckInISO: "2026-07-21T12:00:00.000Z",
    evidence: "backup 21/07 (valore più antico documentato; creato 16/07)",
  },
];

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("cronSecret");
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const apply = req.nextUrl.searchParams.get("apply") === "1";

  const results: any[] = [];

  for (const r of REPAIRS) {
    const ref = adminDb.collection("bookings").doc(r.bookingId);
    const snap = await ref.get();
    if (!snap.exists) {
      results.push({ bookingId: r.bookingId, property: r.propertyLabel, status: "NOT_FOUND" });
      continue;
    }
    const data = snap.data()!;
    const currentCI: Date | null = data.checkIn?.toDate?.() ?? null;
    const currentCO: Date | null = data.checkOut?.toDate?.() ?? null;
    const target = new Date(r.restoreCheckInISO);

    const entry: any = {
      bookingId: r.bookingId,
      property: r.propertyLabel,
      guestName: data.guestName ?? null,
      source: data.source ?? null,
      current: { checkIn: currentCI?.toISOString() ?? null, checkOut: currentCO?.toISOString() ?? null },
      restoreTo: target.toISOString(),
      evidence: r.evidence,
    };

    // Sanity check: si ripristina solo se il check-in attuale è DOPO il target
    // (cioè risulta ancora corrotto) e il checkout non è cambiato rispetto al
    // pattern atteso (deve restare invariato da questa riparazione).
    if (!currentCI) {
      entry.status = "SKIP_NO_CHECKIN";
    } else if (currentCI.getTime() <= target.getTime()) {
      entry.status = "SKIP_ALREADY_OK";
    } else {
      entry.status = apply ? "REPAIRED" : "WOULD_REPAIR";
      if (apply) {
        await ref.update({
          checkIn: Timestamp.fromDate(target),
          originalCheckIn: Timestamp.fromDate(target),
          feedStart: data.checkIn, // valore corrotto attuale, tenuto come traccia
          clipGuardAt: Timestamp.now(),
          repairNote: `fix-clipped-checkins-v1: ripristino da backup (${r.evidence})`,
          updatedAt: Timestamp.now(),
        });
        const after = await ref.get();
        entry.after = {
          checkIn: after.data()?.checkIn?.toDate?.()?.toISOString() ?? null,
          checkOut: after.data()?.checkOut?.toDate?.()?.toISOString() ?? null,
        };
        entry.checkOutUnchanged = entry.after.checkOut === entry.current.checkOut;
      }
    }
    results.push(entry);
  }

  return NextResponse.json({
    mode: apply ? "APPLY" : "DRY_RUN",
    note: "Nessuna pulizia viene creata/modificata da questo endpoint. Il prossimo sync manterrà i valori ripristinati grazie al clip-guard v2 (verificare che sia deployato PRIMA di applicare).",
    results,
  });
}
