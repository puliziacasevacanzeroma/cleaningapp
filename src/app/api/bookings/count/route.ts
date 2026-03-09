/**
 * API per contare prenotazioni per proprietà e fonte
 * GET /api/bookings/count?propertyId=xxx&source=booking
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
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

    // Query prenotazioni
    const q = adminDb.collection("bookings")
      .where("propertyId", "==", propertyId);

    const snapshot = await q.get();
    
    // Filtra per source se specificato
    let bookings = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) }));
    
    if (source) {
      bookings = bookings.filter((b: any) => b.source === source);
    }

    // Conta solo prenotazioni future
    const now = new Date();
    const futureBookings = bookings.filter((b: any) => {
      const checkOut = b.checkOut?.toDate?.();
      return checkOut && checkOut > now;
    });

    return NextResponse.json({ 
      count: futureBookings.length,
      total: bookings.length,
      source: source || 'all'
    });

  } catch (error: any) {
    console.error("Errore conteggio prenotazioni:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
