import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/diagnose-bookings
 * 
 * Diagnostica prenotazioni vs pulizie.
 * Per ogni prenotazione con checkout negli ultimi N giorni:
 * - Ha una pulizia associata?
 * - Se sì, che status ha?
 * - Se no, perché manca? (cancellata? mai creata? link iCal rimosso?)
 * 
 * Cerca anche pulizie CANCELLED per capire se sono state cancellate e perché.
 * 
 * Query params:
 *   ?days=3          (default 3 — quanti giorni indietro)
 *   ?propertyId=X    (opzionale — filtra per proprietà)
 *   ?propertyName=X  (opzionale — cerca per nome proprietà, case-insensitive partial match)
 */

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Solo admin" }, { status: 403 });
    }

    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get("days") || "3");
    const filterPropertyId = url.searchParams.get("propertyId");
    const filterPropertyName = url.searchParams.get("propertyName")?.toLowerCase();

    const since = new Date();
    since.setDate(since.getDate() - days);
    const until = new Date();
    until.setDate(until.getDate() + 1); // include oggi

    // ── Carica prenotazioni con checkout nel range ──
    let bookingsQuery = adminDb.collection("bookings")
      .where("checkOut", ">=", Timestamp.fromDate(since))
      .where("checkOut", "<=", Timestamp.fromDate(until));

    const bookingsSnap = await bookingsQuery.get();
    let bookings = bookingsSnap.docs.map(d => ({ id: d.id, ...d.data() as Record<string, any> }));

    // Filtra per proprietà se richiesto
    if (filterPropertyId) {
      bookings = bookings.filter(b => b.propertyId === filterPropertyId);
    }
    if (filterPropertyName) {
      bookings = bookings.filter(b => 
        (b.propertyName || "").toLowerCase().includes(filterPropertyName) ||
        (b.guestName || "").toLowerCase().includes(filterPropertyName)
      );
    }

    // ── Carica pulizie nel range (tutte, anche CANCELLED) ──
    const cleaningsSince = new Date(since);
    cleaningsSince.setDate(cleaningsSince.getDate() - 1);
    const cleaningsSnap = await adminDb.collection("cleanings")
      .where("scheduledDate", ">=", Timestamp.fromDate(cleaningsSince))
      .where("scheduledDate", "<=", Timestamp.fromDate(until))
      .get();
    const allCleanings = cleaningsSnap.docs.map(d => ({ id: d.id, ...d.data() as Record<string, any> }));

    // Anche pulizie cancellate recenti (per trovare quelle eliminate)
    let cancelledCleanings: any[] = [];
    try {
      const cancelledSnap = await adminDb.collection("cleanings")
        .where("status", "==", "CANCELLED")
        .where("scheduledDate", ">=", Timestamp.fromDate(cleaningsSince))
        .where("scheduledDate", "<=", Timestamp.fromDate(until))
        .get();
      cancelledCleanings = cancelledSnap.docs.map(d => ({ id: d.id, ...d.data() as Record<string, any> }));
    } catch {
      // Potrebbe servire un indice composito
    }

    // ── Carica proprietà per info ──
    const propertyIds = new Set<string>();
    bookings.forEach(b => { if (b.propertyId) propertyIds.add(b.propertyId); });
    allCleanings.forEach(c => { if (c.propertyId) propertyIds.add(c.propertyId); });

    const propertiesMap = new Map<string, any>();
    for (const pid of propertyIds) {
      try {
        const doc = await adminDb.collection("properties").doc(pid).get();
        if (doc.exists) propertiesMap.set(pid, doc.data());
      } catch { /* ignore */ }
    }

    // ── Analisi per ogni prenotazione ──
    const results: any[] = [];
    let missingCleanings = 0;
    let cancelledFound = 0;
    let okCount = 0;

    for (const booking of bookings) {
      const checkOut = booking.checkOut?.toDate?.() || null;
      const checkIn = booking.checkIn?.toDate?.() || null;
      const propertyData = propertiesMap.get(booking.propertyId);

      const result: any = {
        bookingId: booking.id,
        propertyId: booking.propertyId,
        propertyName: booking.propertyName || propertyData?.name || "?",
        guestName: booking.guestName || "?",
        source: booking.source || "?",
        icalUid: booking.icalUid || null,
        checkIn: checkIn?.toISOString()?.split("T")[0] || null,
        checkOut: checkOut?.toISOString()?.split("T")[0] || null,
        bookingStatus: booking.status || "?",
        guests: booking.guests || booking.guestsCount || "?",
        // Risultati analisi
        cleaningFound: false,
        cleaningId: null,
        cleaningStatus: null,
        cleaningScheduledDate: null,
        problem: null,
        details: [],
      };

      if (booking.status === "CANCELLED") {
        result.problem = "BOOKING_CANCELLED";
        result.details.push("La prenotazione stessa è stata cancellata");
        if (booking.cancelReason) result.details.push(`Motivo: ${booking.cancelReason}`);
        if (booking.cancelledAt) result.details.push(`Cancellata il: ${booking.cancelledAt?.toDate?.()?.toISOString() || "?"}`);
      }

      // Cerca pulizia associata
      // Metodo 1: bookingId match
      let cleaning = allCleanings.find(c => c.bookingId === booking.id);

      // Metodo 2: propertyId + stessa data checkout
      if (!cleaning && checkOut) {
        const coDate = checkOut.toISOString().split("T")[0];
        cleaning = allCleanings.find(c => {
          if (c.propertyId !== booking.propertyId) return false;
          const cDate = c.scheduledDate?.toDate?.();
          if (!cDate) return false;
          return cDate.toISOString().split("T")[0] === coDate;
        });
      }

      // Metodo 3: cerca nelle cancellate
      if (!cleaning) {
        cleaning = cancelledCleanings.find(c => c.bookingId === booking.id);
        if (!cleaning && checkOut) {
          const coDate = checkOut.toISOString().split("T")[0];
          cleaning = cancelledCleanings.find(c => {
            if (c.propertyId !== booking.propertyId) return false;
            const cDate = c.scheduledDate?.toDate?.();
            if (!cDate) return false;
            return cDate.toISOString().split("T")[0] === coDate;
          });
        }
      }

      if (cleaning) {
        result.cleaningFound = true;
        result.cleaningId = cleaning.id;
        result.cleaningStatus = cleaning.status;
        const cDate = cleaning.scheduledDate?.toDate?.();
        result.cleaningScheduledDate = cDate?.toISOString()?.split("T")[0] || null;

        if (cleaning.status === "CANCELLED") {
          result.problem = "CLEANING_CANCELLED";
          result.details.push(`Pulizia ${cleaning.id} è stata CANCELLATA`);
          if (cleaning.cancelReason) result.details.push(`Motivo: ${cleaning.cancelReason}`);
          if (cleaning.cancelledAt) result.details.push(`Cancellata il: ${cleaning.cancelledAt?.toDate?.()?.toISOString() || "?"}`);
          cancelledFound++;
        } else if (cleaning.status === "COMPLETED") {
          result.problem = null; // tutto ok
          okCount++;
        } else {
          result.problem = null;
          result.details.push(`Status pulizia: ${cleaning.status}`);
          if (cleaning.operatorName) result.details.push(`Operatore: ${cleaning.operatorName}`);
          okCount++;
        }
      } else {
        if (booking.status !== "CANCELLED") {
          result.problem = "NO_CLEANING";
          result.details.push("NESSUNA pulizia trovata per questo checkout!");

          // Cerca indizi
          const prop = propertiesMap.get(booking.propertyId);
          if (prop) {
            const icalLinks = [prop.airbnbIcalLink, prop.bookingIcalLink, prop.oktorate_ical_link, prop.vrboIcalLink].filter(Boolean);
            if (icalLinks.length === 0) {
              result.details.push("⚠️ Nessun link iCal sulla proprietà — sync non attivo");
            }
            if (prop.syncEnabled === false) {
              result.details.push("⚠️ Sync disabilitato sulla proprietà");
            }
            if (prop.status === "INACTIVE" || prop.status === "PENDING") {
              result.details.push(`⚠️ Proprietà in stato: ${prop.status}`);
            }
          } else {
            result.details.push("⚠️ Proprietà non trovata in DB");
          }
          missingCleanings++;
        } else {
          result.problem = "BOOKING_CANCELLED_NO_CLEANING";
          result.details.push("Prenotazione cancellata, nessuna pulizia (corretto)");
          okCount++;
        }
      }

      results.push(result);
    }

    // Ordina: problemi prima
    results.sort((a, b) => {
      const order: Record<string, number> = { NO_CLEANING: 0, CLEANING_CANCELLED: 1, BOOKING_CANCELLED: 2 };
      const aO = order[a.problem] ?? 10;
      const bO = order[b.problem] ?? 10;
      return aO - bO;
    });

    return NextResponse.json({
      summary: {
        totalBookings: results.length,
        ok: okCount,
        missingCleanings,
        cancelledCleanings: cancelledFound,
        daysChecked: days,
        dateRange: `${since.toISOString().split("T")[0]} → ${until.toISOString().split("T")[0]}`,
      },
      results,
    });
  } catch (error) {
    console.error("Errore diagnose-bookings:", error);
    return NextResponse.json({ error: "Errore: " + (error instanceof Error ? error.message : "sconosciuto") }, { status: 500 });
  }
}
