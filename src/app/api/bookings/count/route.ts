/**
 * API per contare prenotazioni per proprietà e fonte
 * GET /api/bookings/count?propertyId=xxx&source=booking
 */

import { NextRequest, NextResponse } from "next/server";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('propertyId');
    const source = searchParams.get('source');

    if (!propertyId) {
      return NextResponse.json({ error: "propertyId richiesto" }, { status: 400 });
    }

    // Query prenotazioni
    let q = query(
      collection(db, "bookings"),
      where("propertyId", "==", propertyId)
    );

    const snapshot = await getDocs(q);
    
    // Filtra per source se specificato
    let bookings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
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
