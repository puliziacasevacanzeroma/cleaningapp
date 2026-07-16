import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * CLEANUP BLOCCHI-CHIUSURA BOOKING — v1
 *
 * PROBLEMA: il feed iCal di Booking esporta come "CLOSED - Not available" anche
 * i periodi in cui il calendario è semplicemente CHIUSO alla vendita (stagione
 * chiusa, calendario non aperto, orizzonte Booking ~gen 2028). Il gestionale li
 * trattava come prenotazioni → prenotazioni finte da centinaia di notti con
 * pulizie e ordini spazzatura a fine blocco (es. pulizia al 17/01/2028).
 * Dal fix v5 questi blocchi (> soglia notti) vengono ignorati dal sync; questo
 * endpoint ripulisce quelli GIÀ in DB.
 *
 * COSA FA (solo blocchi FUTURI, mai in corso o passati):
 *  - bookings source='booking' con durata > minNights (default 30) e check-in futuro
 *  - per ciascuno: elimina il booking, elimina le pulizie collegate NON protette
 *    (status non COMPLETED/IN_PROGRESS, non isManual), annulla gli ordini
 *    collegati non ancora in consegna/consegnati.
 *
 * NON TOCCA: manuali, CANCELLED, blocchi in corso (check-in passato), pulizie
 * COMPLETED/IN_PROGRESS/manuali, ordini IN_TRANSIT/DELIVERED/COMPLETED.
 *
 * Uso: /api/debug/cleanup-closure-blocks-v1?cronSecret=XXX          (DRY-RUN)
 *      /api/debug/cleanup-closure-blocks-v1?cronSecret=XXX&apply=1  (SCRIVE)
 *      [&minNights=30] [&propertyName=...]
 */

const d2s = (d: Date) => d.toISOString().split("T")[0];
const NIGHT_MS = 86400000;

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("cronSecret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const apply = req.nextUrl.searchParams.get("apply") === "1";
  const minNights = Math.max(15, parseInt(req.nextUrl.searchParams.get("minNights") || "30", 10) || 30);
  const propertyNameFilter = (req.nextUrl.searchParams.get("propertyName") || "").toLowerCase();

  try {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const snap = await adminDb.collection("bookings").where("source", "==", "booking").get();
    const targets: any[] = [];
    snap.docs.forEach((doc) => {
      const x = doc.data() as any;
      if (x.isManual === true || x.status === "CANCELLED") return;
      const ci = x.checkIn?.toDate?.();
      const co = x.checkOut?.toDate?.();
      if (!ci || !co || !x.propertyId) return;
      if (ci < todayStart) return; // in corso o passato: non toccare mai
      const nights = Math.round((co.getTime() - ci.getTime()) / NIGHT_MS);
      if (nights <= minNights) return;
      if (propertyNameFilter && !String(x.propertyName || "").toLowerCase().includes(propertyNameFilter)) return;
      targets.push({ id: doc.id, propertyId: x.propertyId, propertyName: x.propertyName, ci, co, nights });
    });

    targets.sort((a, b) => b.nights - a.nights);

    const report: any[] = [];
    let bookingsDeleted = 0, cleaningsDeleted = 0, ordersCancelled = 0;

    for (const t of targets) {
      const entry: any = {
        propertyName: t.propertyName || t.propertyId,
        bookingId: t.id,
        range: `${d2s(t.ci)} → ${d2s(t.co)}`,
        nights: t.nights,
        cleaningsDeleted: [] as any[],
        ordersCancelled: [] as string[],
      };

      // Pulizie collegate: per bookingId, oppure per data checkout stesso source
      const [byBookingIdSnap, byDateSnap] = await Promise.all([
        adminDb.collection("cleanings").where("bookingId", "==", t.id).get(),
        (async () => {
          const ds = new Date(t.co); ds.setUTCHours(0, 0, 0, 0);
          const de = new Date(t.co); de.setUTCHours(23, 59, 59, 999);
          return adminDb.collection("cleanings")
            .where("propertyId", "==", t.propertyId)
            .where("scheduledDate", ">=", Timestamp.fromDate(ds))
            .where("scheduledDate", "<=", Timestamp.fromDate(de))
            .get();
        })(),
      ]);
      const cleaningDocs = new Map<string, any>();
      byBookingIdSnap.docs.forEach((d) => cleaningDocs.set(d.id, d.data()));
      byDateSnap.docs.forEach((d) => {
        const cd = d.data() as any;
        // per data: solo se stesso source booking e non collegata ad altro booking
        if (cd.bookingSource === "booking" && (!cd.bookingId || cd.bookingId === t.id)) cleaningDocs.set(d.id, cd);
      });

      for (const [cId, cData] of cleaningDocs.entries()) {
        if (cData.status === "COMPLETED" || cData.status === "IN_PROGRESS") continue;
        if (cData.isManual === true) continue;
        entry.cleaningsDeleted.push({ id: cId, date: cData.scheduledDate?.toDate ? d2s(cData.scheduledDate.toDate()) : null, status: cData.status });

        // Ordini collegati alla pulizia
        const linkedOrders = await adminDb.collection("orders").where("cleaningId", "==", cId).get();
        for (const oDoc of linkedOrders.docs) {
          const oData = oDoc.data() as any;
          if (["IN_TRANSIT", "DELIVERED", "COMPLETED", "CANCELLED"].includes(oData.status)) continue;
          entry.ordersCancelled.push(oDoc.id);
          if (apply) {
            await adminDb.collection("orders").doc(oDoc.id).update({
              status: "CANCELLED",
              cancelReason: "Blocco-chiusura Booking rimosso (cleanup-closure-blocks-v1)",
              cancelledAt: Timestamp.now(), updatedAt: Timestamp.now(),
            });
          }
          ordersCancelled++;
        }
        if (cData.laundryOrderId && !entry.ordersCancelled.includes(cData.laundryOrderId)) {
          try {
            const oRef = await adminDb.collection("orders").doc(cData.laundryOrderId).get();
            const oData = oRef.exists ? (oRef.data() as any) : null;
            if (oData && !["IN_TRANSIT", "DELIVERED", "COMPLETED", "CANCELLED"].includes(oData.status)) {
              entry.ordersCancelled.push(cData.laundryOrderId);
              if (apply) {
                await adminDb.collection("orders").doc(cData.laundryOrderId).update({
                  status: "CANCELLED",
                  cancelReason: "Blocco-chiusura Booking rimosso (cleanup-closure-blocks-v1)",
                  cancelledAt: Timestamp.now(), updatedAt: Timestamp.now(),
                });
              }
              ordersCancelled++;
            }
          } catch {}
        }

        if (apply) await adminDb.collection("cleanings").doc(cId).delete();
        cleaningsDeleted++;
      }

      if (apply) await adminDb.collection("bookings").doc(t.id).delete();
      bookingsDeleted++;
      report.push(entry);
    }

    return NextResponse.json({
      mode: apply ? "APPLY (scritture eseguite)" : "DRY-RUN (nessuna scrittura)",
      minNights,
      bookingsDeleted,
      cleaningsDeleted,
      ordersCancelled,
      report,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
