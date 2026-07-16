import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";

/**
 * AUDIT BLOCCHI BOOKING FUSI — v1 (READ-ONLY, non scrive mai)
 *
 * Il feed iCal di Booking fonde le prenotazioni contigue in un unico blocco
 * CLOSED: i turnover interni NON sono ricostruibili dal feed. Questo endpoint
 * elenca i blocchi sospetti da verificare A MANO sull'app Booking.
 *
 * Restituisce:
 *  1. suspiciousBlocks: prenotazioni source=booking future/in corso con
 *     durata >= minNights (default 7), ordinate per urgenza (check-out più
 *     vicino prima), con le pulizie esistenti nel range per capire cosa manca.
 *  2. exposure: classifica proprietà per rischio — quelle con SOLO il link
 *     Booking diretto (nessun channel manager) sono le più esposte: a loro
 *     conviene proporre il collegamento a un CM (feed per-prenotazione).
 *
 * Uso: /api/debug/audit-merged-booking-blocks-v1?cronSecret=XXX
 *      [&minNights=7] [&propertyName=...]
 */

const d2s = (d: Date) => d.toISOString().split("T")[0];
const NIGHT_MS = 86400000;

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("cronSecret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const minNights = Math.max(2, parseInt(req.nextUrl.searchParams.get("minNights") || "7", 10) || 7);
  const propertyNameFilter = (req.nextUrl.searchParams.get("propertyName") || "").toLowerCase();

  try {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const [propsSnap, bookingsSnap] = await Promise.all([
      adminDb.collection("properties").get(),
      adminDb.collection("bookings").where("source", "==", "booking").get(),
    ]);

    const props = new Map<string, any>();
    propsSnap.docs.forEach((d) => props.set(d.id, { id: d.id, ...(d.data() as any) }));

    const sourcesOf = (p: any): string[] => {
      const map: Record<string, string> = {
        airbnb: p?.icalAirbnb || "", booking: p?.icalBooking || "",
        oktorate: p?.icalOktorate || "", inreception: p?.icalInreception || "",
        krossbooking: p?.icalKrossbooking || "",
      };
      return Object.keys(map).filter((k) => String(map[k]).trim() !== "");
    };

    // ---- 1. Blocchi sospetti (futuri o in corso, >= minNights) ----
    const suspicious: any[] = [];
    for (const doc of bookingsSnap.docs) {
      const x = doc.data() as any;
      if (x.isManual === true || x.status === "CANCELLED") continue;
      const ci = x.checkIn?.toDate?.();
      const co = x.checkOut?.toDate?.();
      if (!ci || !co || !x.propertyId) continue;
      if (co < todayStart) continue; // solo futuri o in corso
      const nights = Math.round((co.getTime() - ci.getTime()) / NIGHT_MS);
      if (nights < minNights) continue;
      const p = props.get(x.propertyId);
      if (propertyNameFilter && !String(p?.name || x.propertyName || "").toLowerCase().includes(propertyNameFilter)) continue;

      // Pulizie esistenti nel range del blocco (per capire quali date sono coperte)
      const cleaningsSnap = await adminDb.collection("cleanings")
        .where("propertyId", "==", x.propertyId)
        .where("scheduledDate", ">=", x.checkIn)
        .where("scheduledDate", "<=", x.checkOut)
        .get();
      const cleaningsInRange = cleaningsSnap.docs.map((c) => {
        const cd = c.data() as any;
        return { id: c.id, date: cd.scheduledDate?.toDate ? d2s(cd.scheduledDate.toDate()) : null, status: cd.status };
      }).sort((a, b) => String(a.date).localeCompare(String(b.date)));

      suspicious.push({
        propertyId: x.propertyId,
        propertyName: p?.name || x.propertyName || x.propertyId,
        bookingId: doc.id,
        range: `${d2s(ci)} → ${d2s(co)}`,
        nights,
        inProgress: ci < todayStart,
        propertySources: p ? sourcesOf(p) : [],
        bookingOnly: p ? (sourcesOf(p).length === 1 && sourcesOf(p)[0] === "booking") : null,
        mergedCheckpoints: Array.isArray(x.mergedCheckpoints) ? x.mergedCheckpoints.map((m: any) => m.boundary) : [],
        cleaningsInRange,
        todo: "Confronta con l'app Booking: se nel range ci sono più prenotazioni, aggiungi a mano le pulizie dei turnover mancanti.",
      });
    }
    suspicious.sort((a, b) => a.range.localeCompare(b.range));

    // ---- 2. Esposizione: proprietà con link Booking diretto ----
    const exposure: any[] = [];
    for (const p of props.values()) {
      const srcs = sourcesOf(p);
      if (!srcs.includes("booking")) continue;
      if (propertyNameFilter && !String(p.name || "").toLowerCase().includes(propertyNameFilter)) continue;
      exposure.push({
        propertyId: p.id,
        propertyName: p.name,
        sources: srcs,
        bookingOnly: srcs.length === 1,
        risk: srcs.length === 1
          ? "ALTO — solo feed Booking: blocchi fusi invisibili, candidata a channel manager"
          : "MEDIO — feed multipli: i turnover possono essere coperti dagli altri source",
      });
    }
    exposure.sort((a, b) => Number(b.bookingOnly) - Number(a.bookingOnly) || String(a.propertyName).localeCompare(String(b.propertyName)));

    return NextResponse.json({
      mode: "READ-ONLY",
      minNights,
      suspiciousBlocksCount: suspicious.length,
      bookingOnlyPropertiesCount: exposure.filter((e) => e.bookingOnly).length,
      suspiciousBlocks: suspicious,
      exposure,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
