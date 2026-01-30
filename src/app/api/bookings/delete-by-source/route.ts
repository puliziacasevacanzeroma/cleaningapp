/**
 * API per eliminare prenotazioni per proprietà e fonte
 * POST /api/bookings/delete-by-source
 * Body: { propertyId: string, source: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { collection, query, where, getDocs, deleteDoc, doc, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { propertyId, source } = body;

    if (!propertyId || !source) {
      return NextResponse.json({ error: "propertyId e source richiesti" }, { status: 400 });
    }

    console.log(`🗑️ Eliminazione prenotazioni: propertyId=${propertyId}, source=${source}`);

    // Query prenotazioni per questa proprietà e fonte
    const bookingsQuery = query(
      collection(db, "bookings"),
      where("propertyId", "==", propertyId)
    );

    const snapshot = await getDocs(bookingsQuery);
    
    // Filtra per source
    const bookingsToDelete = snapshot.docs.filter(doc => {
      const data = doc.data();
      return data.source === source;
    });

    console.log(`   📋 Trovate ${bookingsToDelete.length} prenotazioni da ${source}`);

    // Elimina ogni prenotazione
    let deleted = 0;
    let deletedCleanings = 0;
    
    for (const bookingDoc of bookingsToDelete) {
      const bookingData = bookingDoc.data();
      const bookingId = bookingDoc.id;
      
      // Elimina anche pulizie correlate (per data checkout)
      const checkOut = bookingData.checkOut?.toDate?.();
      if (checkOut) {
        const cleaningsQuery = query(
          collection(db, "cleanings"),
          where("propertyId", "==", propertyId)
        );
        const cleaningsSnap = await getDocs(cleaningsQuery);
        
        for (const cleaningDoc of cleaningsSnap.docs) {
          const cleaningData = cleaningDoc.data();
          const cleaningDate = cleaningData.scheduledDate?.toDate?.();
          
          // Se la pulizia è nello stesso giorno del checkout e non è completata
          if (cleaningDate && 
              cleaningDate.toDateString() === checkOut.toDateString() &&
              cleaningData.bookingSource === source &&
              !['COMPLETED', 'IN_PROGRESS'].includes(cleaningData.status)) {
            await deleteDoc(doc(db, "cleanings", cleaningDoc.id));
            deletedCleanings++;
            console.log(`   🧹 Eliminata pulizia ${cleaningDoc.id}`);
          }
        }
      }
      
      // Elimina la prenotazione
      await deleteDoc(doc(db, "bookings", bookingId));
      deleted++;
      console.log(`   ✅ Eliminata prenotazione ${bookingId} (${bookingData.guestName || 'N/A'})`);
    }

    console.log(`✅ Eliminazione completata: ${deleted} prenotazioni, ${deletedCleanings} pulizie`);

    return NextResponse.json({ 
      success: true,
      deleted,
      deletedCleanings,
      source
    });

  } catch (error: any) {
    console.error("❌ Errore eliminazione prenotazioni:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
