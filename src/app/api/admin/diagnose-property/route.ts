import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/diagnose-property?name=cupola
 * 
 * Mostra TUTTO di una proprietà: prenotazioni, pulizie, ordini, duplicati, problemi.
 * Cerca per nome (partial match case-insensitive).
 */

export async function GET(request: NextRequest) {
  const user = await getApiUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo admin" }, { status: 403 });
  }

  const url = new URL(request.url);
  const name = url.searchParams.get("name")?.toLowerCase();
  if (!name) return NextResponse.json({ error: "Parametro ?name= richiesto" }, { status: 400 });

  // 1. Trova la proprietà
  const propsSnap = await adminDb.collection("properties").get();
  const matchedProps = propsSnap.docs
    .filter(d => (d.data().name || "").toLowerCase().includes(name))
    .map(d => ({ id: d.id, ...d.data() as Record<string, any> }));

  if (matchedProps.length === 0) {
    return NextResponse.json({ error: `Nessuna proprietà trovata con nome "${name}"` }, { status: 404 });
  }

  const results = [];

  for (const prop of matchedProps) {
    // 2. Carica tutte le prenotazioni
    const bookingsSnap = await adminDb.collection("bookings")
      .where("propertyId", "==", prop.id)
      .get();
    const bookings = bookingsSnap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        guestName: data.guestName || "?",
        source: data.source || "?",
        icalUid: data.icalUid || null,
        checkIn: data.checkIn?.toDate?.()?.toISOString()?.split("T")[0] || null,
        checkOut: data.checkOut?.toDate?.()?.toISOString()?.split("T")[0] || null,
        status: data.status || "?",
        isManual: data.isManual || false,
      };
    });

    // 3. Carica tutte le pulizie
    const cleaningsSnap = await adminDb.collection("cleanings")
      .where("propertyId", "==", prop.id)
      .get();
    const cleanings = cleaningsSnap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        scheduledDate: data.scheduledDate?.toDate?.()?.toISOString()?.split("T")[0] || null,
        status: data.status || "?",
        guestName: data.guestName || "?",
        bookingId: data.bookingId || null,
        bookingSource: data.bookingSource || null,
        laundryOrderId: data.laundryOrderId || null,
        operatorName: data.operatorName || null,
      };
    });

    // 4. Carica ordini
    const ordersSnap = await adminDb.collection("orders")
      .where("propertyId", "==", prop.id)
      .get();
    const orders = ordersSnap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        cleaningId: data.cleaningId || null,
        status: data.status || "?",
        scheduledDate: data.scheduledDate?.toDate?.()?.toISOString()?.split("T")[0] || null,
        itemsCount: (data.items || []).length,
      };
    });

    // 5. Carica syncExclusions
    const exclSnap = await adminDb.collection("syncExclusions")
      .where("propertyId", "==", prop.id)
      .get();
    const exclusions = exclSnap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        originalDate: data.originalDate?.toDate?.()?.toISOString()?.split("T")[0] || null,
        reason: data.reason || "?",
        createdBy: data.createdBy || data.deletedBy || "?",
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
      };
    });

    // 6. Analisi problemi
    const problems = [];

    // Duplicati prenotazioni: stesso checkout + stesso source
    const bookingsByCoSource = new Map<string, any[]>();
    for (const b of bookings) {
      if (b.status === "CANCELLED") continue;
      const key = `${b.checkOut}_${b.source}`;
      if (!bookingsByCoSource.has(key)) bookingsByCoSource.set(key, []);
      bookingsByCoSource.get(key)!.push(b);
    }
    for (const [key, group] of bookingsByCoSource) {
      if (group.length > 1) {
        problems.push({
          type: "DUPLICATE_BOOKINGS",
          detail: `${group.length} prenotazioni con checkout=${key.split("_")[0]} source=${key.split("_")[1]}`,
          bookingIds: group.map(b => b.id),
          icalUids: group.map(b => b.icalUid),
        });
      }
    }

    // Prenotazioni senza pulizia
    for (const b of bookings) {
      if (b.status === "CANCELLED") continue;
      const co = b.checkOut;
      if (!co) continue;
      const hasCleaning = cleanings.some(c => 
        c.bookingId === b.id || 
        (c.scheduledDate === co && c.status !== "CANCELLED")
      );
      if (!hasCleaning) {
        const hasExclusion = exclusions.some(e => e.originalDate === co);
        problems.push({
          type: "BOOKING_NO_CLEANING",
          detail: `Prenotazione ${b.id} (${b.guestName}, checkout ${co}) senza pulizia${hasExclusion ? " (syncExclusion presente)" : ""}`,
          bookingId: b.id,
        });
      }
    }

    // Prenotazioni fantasma: nel DB ma non nel feed iCal (se il feed è disponibile)
    // Non possiamo controllare qui senza il feed, ma segnaliamo prenotazioni con date sovrapposte
    const activeBookings = bookings.filter(b => b.status !== "CANCELLED").sort((a, b) => (a.checkIn || "").localeCompare(b.checkIn || ""));
    for (let i = 0; i < activeBookings.length; i++) {
      for (let j = i + 1; j < activeBookings.length; j++) {
        const a = activeBookings[i];
        const b2 = activeBookings[j];
        if (a.checkIn && a.checkOut && b2.checkIn && b2.checkOut) {
          // Overlap: a.checkIn < b.checkOut && b.checkIn < a.checkOut
          if (a.checkIn < b2.checkOut && b2.checkIn < a.checkOut) {
            problems.push({
              type: "OVERLAPPING_BOOKINGS",
              detail: `Prenotazioni sovrapposte: ${a.guestName} (${a.checkIn}→${a.checkOut}) e ${b2.guestName} (${b2.checkIn}→${b2.checkOut})`,
              bookingIds: [a.id, b2.id],
              icalUids: [a.icalUid, b2.icalUid],
            });
          }
        }
      }
    }

    // iCal links
    const icalLinks = {
      airbnb: prop.icalAirbnb || null,
      booking: prop.icalBooking || null,
      oktorate: prop.icalOktorate || null,
      inreception: prop.icalInreception || null,
      krossbooking: prop.icalKrossbooking || null,
    };
    const activeSources = Object.entries(icalLinks).filter(([, v]) => v && v.trim()).map(([k]) => k);

    results.push({
      property: {
        id: prop.id,
        name: prop.name,
        address: prop.address || "",
        icalLinks,
        activeSources,
        usesOwnLinen: prop.usesOwnLinen || false,
      },
      counts: {
        bookings: bookings.length,
        activeBookings: bookings.filter(b => b.status !== "CANCELLED").length,
        cleanings: cleanings.length,
        activeClearnings: cleanings.filter(c => c.status !== "CANCELLED").length,
        orders: orders.length,
        syncExclusions: exclusions.length,
      },
      problems,
      bookings: bookings.sort((a, b) => (a.checkIn || "").localeCompare(b.checkIn || "")),
      cleanings: cleanings.sort((a, b) => (a.scheduledDate || "").localeCompare(b.scheduledDate || "")),
      orders: orders.sort((a, b) => (a.scheduledDate || "").localeCompare(b.scheduledDate || "")),
      syncExclusions: exclusions,
    });
  }

  return NextResponse.json({
    totalProperties: results.length,
    results,
  });
}
