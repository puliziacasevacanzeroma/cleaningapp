/**
 * API Debug: Analizza proprietà per duplicati pulizie
 * GET /api/debug/analyze-property?name=cozy
 */

import { NextRequest, NextResponse } from "next/server";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const nameSearch = searchParams.get("name") || "cozy";
  
  try {
    // 1. Trova proprietà con nome simile
    const propertiesSnap = await getDocs(collection(db, "properties"));
    const matchingProperties: any[] = [];
    
    propertiesSnap.docs.forEach(doc => {
      const data = doc.data();
      if (data.name?.toLowerCase().includes(nameSearch.toLowerCase())) {
        matchingProperties.push({
          id: doc.id,
          name: data.name,
          cleaningPrice: data.cleaningPrice,
          icalLinks: {
            icalAirbnb: data.icalAirbnb || null,
            icalBooking: data.icalBooking || null,
            icalOktorate: data.icalOktorate || null,
            icalKrossbooking: data.icalKrossbooking || null,
            icalInreception: data.icalInreception || null,
            icalUrl: data.icalUrl || null,
          },
          totalIcalLinks: [
            data.icalAirbnb, data.icalBooking, data.icalOktorate,
            data.icalKrossbooking, data.icalInreception, data.icalUrl
          ].filter(Boolean).length,
        });
      }
    });
    
    if (matchingProperties.length === 0) {
      return NextResponse.json({ 
        error: `Nessuna proprietà trovata con nome contenente "${nameSearch}"` 
      });
    }
    
    // 2. Per ogni proprietà, analizza pulizie e prenotazioni
    const results = [];
    
    for (const prop of matchingProperties) {
      // Carica pulizie
      const cleaningsSnap = await getDocs(
        query(collection(db, "cleanings"), where("propertyId", "==", prop.id))
      );
      
      // Carica prenotazioni
      const bookingsSnap = await getDocs(
        query(collection(db, "bookings"), where("propertyId", "==", prop.id))
      );
      
      // Raggruppa pulizie per data
      const cleaningsByDate: Record<string, any[]> = {};
      cleaningsSnap.docs.forEach(doc => {
        const data = doc.data();
        const date = data.scheduledDate?.toDate?.();
        if (date) {
          const dateKey = date.toISOString().split('T')[0];
          if (!cleaningsByDate[dateKey]) cleaningsByDate[dateKey] = [];
          cleaningsByDate[dateKey].push({
            id: doc.id,
            status: data.status,
            bookingSource: data.bookingSource || "N/A",
            bookingId: data.bookingId || "N/A",
            price: data.price,
            guestsCount: data.guestsCount,
            guestName: data.guestName,
            createdAt: data.createdAt?.toDate?.()?.toISOString(),
          });
        }
      });
      
      // Trova duplicati (stessa data, più pulizie)
      const duplicates: any[] = [];
      Object.entries(cleaningsByDate).forEach(([date, cleanings]) => {
        if (cleanings.length > 1) {
          duplicates.push({
            date,
            count: cleanings.length,
            cleanings,
          });
        }
      });
      
      // Pulizie senza prezzo
      const cleaningsWithoutPrice = cleaningsSnap.docs
        .filter(doc => {
          const data = doc.data();
          return !data.price || data.price === 0;
        })
        .map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            date: data.scheduledDate?.toDate?.()?.toISOString().split('T')[0],
            status: data.status,
            bookingSource: data.bookingSource,
            price: data.price,
          };
        });
      
      // Raggruppa prenotazioni per data checkout
      const bookingsByCheckout: Record<string, any[]> = {};
      bookingsSnap.docs.forEach(doc => {
        const data = doc.data();
        const checkout = data.checkOut?.toDate?.();
        if (checkout) {
          const dateKey = checkout.toISOString().split('T')[0];
          if (!bookingsByCheckout[dateKey]) bookingsByCheckout[dateKey] = [];
          bookingsByCheckout[dateKey].push({
            id: doc.id,
            source: data.source || "N/A",
            icalUid: data.icalUid,
            guestName: data.guestName,
          });
        }
      });
      
      // Trova checkout duplicati
      const checkoutDuplicates: any[] = [];
      Object.entries(bookingsByCheckout).forEach(([date, bookings]) => {
        if (bookings.length > 1) {
          checkoutDuplicates.push({
            date,
            count: bookings.length,
            bookings,
          });
        }
      });
      
      results.push({
        property: prop,
        stats: {
          totalCleanings: cleaningsSnap.docs.length,
          totalBookings: bookingsSnap.docs.length,
          cleaningsWithoutPrice: cleaningsWithoutPrice.length,
          duplicateCleaningDates: duplicates.length,
          duplicateCheckoutDates: checkoutDuplicates.length,
        },
        issues: {
          cleaningsWithoutPrice,
          duplicateCleanings: duplicates,
          duplicateCheckouts: checkoutDuplicates,
        },
        diagnosis: {
          hasMultipleIcalLinks: prop.totalIcalLinks > 1,
          possibleCause: prop.totalIcalLinks > 1 
            ? "La proprietà ha più link iCal - potrebbero creare duplicati se le prenotazioni appaiono in entrambi i feed"
            : "Singolo link iCal - verificare se il channel manager duplica le prenotazioni",
          priceMissing: !prop.cleaningPrice 
            ? "⚠️ cleaningPrice non impostato sulla proprietà!"
            : null,
        },
      });
    }
    
    return NextResponse.json({
      search: nameSearch,
      foundProperties: matchingProperties.length,
      results,
    });
    
  } catch (error) {
    console.error("Errore analisi:", error);
    return NextResponse.json({ error: "Errore analisi" }, { status: 500 });
  }
}
