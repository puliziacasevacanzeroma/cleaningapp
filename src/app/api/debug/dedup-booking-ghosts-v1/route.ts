import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * DEDUP FANTASMI BOOKING — v1
 *
 * PROBLEMA: i blocchi CLOSED del feed iCal di Booking cambiano UID (hash del
 * contenuto) e DTSTART ogni volta che il feed clippa i giorni passati o fonde
 * prenotazioni contigue. Prima del fix al matcher (match per sovrapposizione),
 * ogni mutazione creava una NUOVA prenotazione in DB; le vecchie, con check-in
 * ormai nel passato, erano protette dalla cancellazione (STEP 3) e si
 * accumulavano come "fantasmi" sovrapposti sul calendario.
 *
 * COSA FA: per ogni proprietà, raggruppa le prenotazioni source='booking' in
 * CLUSTER di sovrapposizione STRETTA (contiguità checkout=checkin esclusa).
 * Nei cluster con 2+ prenotazioni:
 *   - KEEPER = check-in più vecchio; a parità, checkout più lontano.
 *   - Il keeper viene esteso all'UNIONE del cluster (min checkIn, max checkOut)
 *     → "la prenotazione com'era all'inizio" + realtà attuale.
 *   - I fantasmi vengono ELIMINATI; le pulizie che puntavano a un fantasma
 *     (bookingId) vengono ri-puntate al keeper. Le pulizie NON vengono
 *     spostate né cancellate: solo il campo bookingId.
 *
 * NON TOCCA: altri source, prenotazioni manuali/direct/phone, CANCELLED,
 * cluster singoli (nessuna sovrapposizione).
 *
 * Uso: /api/debug/dedup-booking-ghosts-v1?cronSecret=XXX          (DRY-RUN)
 *      /api/debug/dedup-booking-ghosts-v1?cronSecret=XXX&apply=1  (SCRIVE)
 *      [&propertyName=queenavona]  filtro substring case-insensitive
 */

type B = {
  id: string;
  propertyId: string;
  propertyName?: string;
  guestName?: string;
  source?: string;
  status?: string;
  isManual?: boolean;
  icalUid?: string;
  checkIn: Date;
  checkOut: Date;
};

const d2s = (d: Date) => d.toISOString().split("T")[0];

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("cronSecret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const apply = req.nextUrl.searchParams.get("apply") === "1";
  const propertyNameFilter = (req.nextUrl.searchParams.get("propertyName") || "").toLowerCase();

  try {
    const snap = await adminDb.collection("bookings").where("source", "==", "booking").get();
    const all: B[] = [];
    snap.docs.forEach((doc) => {
      const x = doc.data() as any;
      if (x.isManual === true) return;
      if (x.status === "CANCELLED") return;
      const ci = x.checkIn?.toDate?.();
      const co = x.checkOut?.toDate?.();
      if (!ci || !co || !x.propertyId) return;
      if (propertyNameFilter && !String(x.propertyName || "").toLowerCase().includes(propertyNameFilter)) return;
      all.push({
        id: doc.id, propertyId: x.propertyId, propertyName: x.propertyName,
        guestName: x.guestName, source: x.source, status: x.status,
        isManual: x.isManual, icalUid: x.icalUid, checkIn: ci, checkOut: co,
      });
    });

    // Raggruppa per proprietà
    const byProp = new Map<string, B[]>();
    all.forEach((b) => {
      if (!byProp.has(b.propertyId)) byProp.set(b.propertyId, []);
      byProp.get(b.propertyId)!.push(b);
    });

    const report: any[] = [];
    let totalClusters = 0, totalGhosts = 0, totalCleaningsRepointed = 0;

    for (const [propId, list] of byProp.entries()) {
      if (list.length < 2) continue;
      list.sort((a, b) => a.checkIn.getTime() - b.checkIn.getTime());

      // Cluster per sovrapposizione STRETTA transitiva (sweep line)
      const clusters: B[][] = [];
      let current: B[] = [list[0]];
      let currentMaxEnd = list[0].checkOut.getTime();
      for (let i = 1; i < list.length; i++) {
        const b = list[i];
        if (b.checkIn.getTime() < currentMaxEnd) {
          current.push(b);
          currentMaxEnd = Math.max(currentMaxEnd, b.checkOut.getTime());
        } else {
          if (current.length >= 2) clusters.push(current);
          current = [b];
          currentMaxEnd = b.checkOut.getTime();
        }
      }
      if (current.length >= 2) clusters.push(current);
      if (clusters.length === 0) continue;

      const propReport: any = { propertyId: propId, propertyName: list[0].propertyName || propId, clusters: [] };

      for (const cluster of clusters) {
        totalClusters++;
        // Keeper: check-in più vecchio; a parità, checkout più lontano
        const keeper = [...cluster].sort((a, b) =>
          a.checkIn.getTime() - b.checkIn.getTime() || b.checkOut.getTime() - a.checkOut.getTime()
        )[0];
        const ghosts = cluster.filter((b) => b.id !== keeper.id);
        totalGhosts += ghosts.length;

        const unionStart = new Date(Math.min(...cluster.map((b) => b.checkIn.getTime())));
        const unionEnd = new Date(Math.max(...cluster.map((b) => b.checkOut.getTime())));
        const keeperNeedsExtend =
          keeper.checkIn.getTime() !== unionStart.getTime() || keeper.checkOut.getTime() !== unionEnd.getTime();

        const clusterReport: any = {
          keeper: { id: keeper.id, guestName: keeper.guestName, range: `${d2s(keeper.checkIn)} → ${d2s(keeper.checkOut)}` },
          unionRange: `${d2s(unionStart)} → ${d2s(unionEnd)}`,
          keeperExtended: keeperNeedsExtend,
          ghostsDeleted: ghosts.map((g) => ({ id: g.id, range: `${d2s(g.checkIn)} → ${d2s(g.checkOut)}` })),
          cleaningsRepointed: [] as string[],
        };

        if (apply) {
          // 1. Estendi il keeper all'unione (se serve)
          if (keeperNeedsExtend) {
            const now = new Date();
            await adminDb.collection("bookings").doc(keeper.id).update({
              checkIn: Timestamp.fromDate(unionStart),
              checkOut: Timestamp.fromDate(unionEnd),
              historicBooking: unionStart < now || unionEnd < now,
              updatedAt: Timestamp.now(),
            });
          }
          // 2. Ri-punta le pulizie dei fantasmi al keeper, poi elimina i fantasmi
          for (const g of ghosts) {
            const cleaningsSnap = await adminDb.collection("cleanings").where("bookingId", "==", g.id).get();
            for (const cDoc of cleaningsSnap.docs) {
              await adminDb.collection("cleanings").doc(cDoc.id).update({
                bookingId: keeper.id,
                updatedAt: Timestamp.now(),
              });
              clusterReport.cleaningsRepointed.push(cDoc.id);
              totalCleaningsRepointed++;
            }
            await adminDb.collection("bookings").doc(g.id).delete();
          }
        } else {
          // Dry-run: conta comunque le pulizie che verrebbero ri-puntate
          for (const g of ghosts) {
            const cleaningsSnap = await adminDb.collection("cleanings").where("bookingId", "==", g.id).get();
            cleaningsSnap.docs.forEach((cDoc) => {
              clusterReport.cleaningsRepointed.push(cDoc.id);
              totalCleaningsRepointed++;
            });
          }
        }

        propReport.clusters.push(clusterReport);
      }

      report.push(propReport);
    }

    report.sort((a, b) => b.clusters.length - a.clusters.length);

    return NextResponse.json({
      mode: apply ? "APPLY (scritture eseguite)" : "DRY-RUN (nessuna scrittura)",
      bookingsScanned: all.length,
      propertiesWithGhosts: report.length,
      totalClusters,
      totalGhostsToDelete: totalGhosts,
      totalCleaningsRepointed,
      report,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
