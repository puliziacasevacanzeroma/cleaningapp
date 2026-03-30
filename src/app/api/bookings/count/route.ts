/**
 * API per contare prenotazioni E pulizie per proprietà e fonte
 * GET /api/bookings/count?propertyId=xxx&source=booking
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────
    const _user = await getApiUser();
    if (!_user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    // ─────────────────────────────────────────────────────

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('propertyId');
    const source = searchParams.get('source');

    if (!propertyId) {
      return NextResponse.json({ error: "propertyId richiesto" }, { status: 400 });
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Query prenotazioni
    const bookingsSnap = await adminDb.collection("bookings")
      .where("propertyId", "==", propertyId)
      .get();

    let bookings = bookingsSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) }));

    if (source) {
      bookings = bookings.filter((b: any) => b.source === source);
    }

    // Conta solo prenotazioni future
    const futureBookings = bookings.filter((b: any) => {
      const checkOut = b.checkOut?.toDate?.();
      return checkOut && checkOut > now;
    });

    // 🔥 Conta anche pulizie future con questo bookingSource
    // (usa query su propertyId + filtro in-memory per evitare indice composito)
    let cleaningsCount = 0;
    if (source) {
      const cleaningsSnap = await adminDb.collection("cleanings")
        .where("propertyId", "==", propertyId)
        .get();

      cleaningsCount = cleaningsSnap.docs.filter((doc) => {
        const data = doc.data() as Record<string, any>;
        if (data.bookingSource !== source) return false;
        if (["COMPLETED", "IN_PROGRESS"].includes(data.status)) return false;
        if (data.isManual === true) return false;
        const scheduledDate = data.scheduledDate?.toDate?.();
        return scheduledDate && scheduledDate >= now;
      }).length;
    }

    return NextResponse.json({ 
      count: futureBookings.length,
      cleaningsCount,
      total: bookings.length,
      source: source || 'all'
    });

  } catch (error: any) {
    console.error("Errore conteggio prenotazioni:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
