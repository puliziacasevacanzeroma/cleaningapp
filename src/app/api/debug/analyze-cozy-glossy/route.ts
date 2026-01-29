/**
 * API: Analisi APPROFONDITA Cozy e Glossy
 * GET /api/debug/analyze-cozy-glossy
 * 
 * Cerca TUTTI i problemi possibili:
 * - Pulizie duplicate
 * - Pulizie senza biancheria/ordini
 * - Prenotazioni duplicate
 * - Conflitti tra proprietà
 */

import { NextRequest, NextResponse } from "next/server";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    console.log("🔍 Analisi approfondita Cozy e Glossy...");
    
    // ==================== TROVA LE PROPRIETÀ ====================
    const propertiesSnap = await getDocs(collection(db, "properties"));
    const allProperties = propertiesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    // Trova Cozy e Glossy
    const cozyGlossyProps = allProperties.filter(p => 
      p.name?.toLowerCase().includes('cozy') || 
      p.name?.toLowerCase().includes('glossy')
    );
    
    // Trova TUTTE le proprietà che potrebbero avere nomi simili o conflitti
    const suspiciousProps = allProperties.filter(p => {
      const name = (p.name || '').toLowerCase();
      return name.includes('cozy') || 
             name.includes('glossy') || 
             name.includes('cozy and glossy') ||
             name.includes('cozy & glossy');
    });
    
    console.log(`📦 Trovate ${cozyGlossyProps.length} proprietà Cozy/Glossy`);
    console.log(`📦 Proprietà sospette: ${suspiciousProps.length}`);
    
    // ==================== CARICA TUTTI I DATI ====================
    const [cleaningsSnap, bookingsSnap, ordersSnap] = await Promise.all([
      getDocs(collection(db, "cleanings")),
      getDocs(collection(db, "bookings")),
      getDocs(collection(db, "orders")),
    ]);
    
    const allCleanings = cleaningsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const allBookings = bookingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const allOrders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    // ==================== ANALISI PER OGNI PROPRIETÀ ====================
    const propertyAnalysis: any[] = [];
    const cozyGlossyIds = cozyGlossyProps.map(p => p.id);
    
    for (const prop of cozyGlossyProps) {
      const propCleanings = allCleanings.filter(c => c.propertyId === prop.id);
      const propBookings = allBookings.filter(b => b.propertyId === prop.id);
      const propOrders = allOrders.filter(o => o.propertyId === prop.id);
      
      // Raggruppa pulizie per data
      const cleaningsByDate: Record<string, any[]> = {};
      propCleanings.forEach(c => {
        const date = c.scheduledDate?.toDate?.();
        if (date) {
          const dateKey = date.toISOString().split('T')[0];
          if (!cleaningsByDate[dateKey]) cleaningsByDate[dateKey] = [];
          cleaningsByDate[dateKey].push({
            id: c.id,
            propertyName: c.propertyName,
            status: c.status,
            price: c.price,
            guestsCount: c.guestsCount,
            guestName: c.guestName,
            bookingSource: c.bookingSource,
            bookingId: c.bookingId,
            createdAt: c.createdAt?.toDate?.()?.toISOString(),
          });
        }
      });
      
      // Trova date con pulizie duplicate
      const duplicateDates: any[] = [];
      for (const [date, cleanings] of Object.entries(cleaningsByDate)) {
        if (cleanings.length > 1) {
          duplicateDates.push({ date, count: cleanings.length, cleanings });
        }
      }
      
      // Raggruppa prenotazioni per checkout
      const bookingsByCheckout: Record<string, any[]> = {};
      propBookings.forEach(b => {
        const checkout = b.checkOut?.toDate?.();
        if (checkout) {
          const dateKey = checkout.toISOString().split('T')[0];
          if (!bookingsByCheckout[dateKey]) bookingsByCheckout[dateKey] = [];
          bookingsByCheckout[dateKey].push({
            id: b.id,
            source: b.source,
            icalUid: b.icalUid,
            guestName: b.guestName,
            checkIn: b.checkIn?.toDate?.()?.toISOString().split('T')[0],
            checkOut: b.checkOut?.toDate?.()?.toISOString().split('T')[0],
          });
        }
      });
      
      // Trova checkout duplicati
      const duplicateCheckouts: any[] = [];
      for (const [date, bookings] of Object.entries(bookingsByCheckout)) {
        if (bookings.length > 1) {
          duplicateCheckouts.push({ date, count: bookings.length, bookings });
        }
      }
      
      // Pulizie senza ordini (biancheria)
      const cleaningsWithoutOrders: any[] = [];
      for (const cleaning of propCleanings) {
        const hasOrder = propOrders.some(o => o.cleaningId === cleaning.id);
        if (!hasOrder && cleaning.status !== 'CANCELLED') {
          cleaningsWithoutOrders.push({
            id: cleaning.id,
            date: cleaning.scheduledDate?.toDate?.()?.toISOString().split('T')[0],
            status: cleaning.status,
            guestsCount: cleaning.guestsCount,
            propertyName: cleaning.propertyName,
          });
        }
      }
      
      propertyAnalysis.push({
        property: {
          id: prop.id,
          name: prop.name,
          cleaningPrice: prop.cleaningPrice,
          maxGuests: prop.maxGuests,
          icalAirbnb: prop.icalAirbnb ? "✅ Configurato" : "❌ Mancante",
          icalBooking: prop.icalBooking ? "✅ Configurato" : "❌ Mancante",
          icalOktorate: prop.icalOktorate ? "✅ Configurato" : "❌ Mancante",
        },
        stats: {
          totalCleanings: propCleanings.length,
          totalBookings: propBookings.length,
          totalOrders: propOrders.length,
          duplicateCleaningDates: duplicateDates.length,
          duplicateCheckoutDates: duplicateCheckouts.length,
          cleaningsWithoutOrders: cleaningsWithoutOrders.length,
        },
        issues: {
          duplicateCleanings: duplicateDates,
          duplicateCheckouts: duplicateCheckouts,
          cleaningsWithoutOrders: cleaningsWithoutOrders.slice(0, 20), // Prime 20
        },
      });
    }
    
    // ==================== ANALISI CROSS-PROPERTY ====================
    // Cerca se ci sono pulizie con propertyName diverso dal propertyId
    const mismatchedCleanings: any[] = [];
    const cozyGlossyCleanings = allCleanings.filter(c => cozyGlossyIds.includes(c.propertyId));
    
    for (const cleaning of cozyGlossyCleanings) {
      const prop = cozyGlossyProps.find(p => p.id === cleaning.propertyId);
      if (prop && cleaning.propertyName && cleaning.propertyName !== prop.name) {
        mismatchedCleanings.push({
          cleaningId: cleaning.id,
          propertyId: cleaning.propertyId,
          expectedName: prop.name,
          actualName: cleaning.propertyName,
          date: cleaning.scheduledDate?.toDate?.()?.toISOString().split('T')[0],
        });
      }
    }
    
    // ==================== CERCA PULIZIE "COZY AND GLOSSY" ====================
    // Potrebbero esserci pulizie con nome combinato
    const combinedNameCleanings = allCleanings.filter(c => {
      const name = (c.propertyName || '').toLowerCase();
      return name.includes('cozy and glossy') || 
             name.includes('cozy & glossy') ||
             name.includes('cozy+glossy');
    });
    
    // ==================== ANALISI DATE COMUNI ====================
    // Trova date in cui ENTRAMBE Cozy E Glossy hanno pulizie
    const cozyProp = cozyGlossyProps.find(p => p.name?.toLowerCase() === 'cozy');
    const glossyProp = cozyGlossyProps.find(p => p.name?.toLowerCase() === 'glossy');
    
    let commonDates: any[] = [];
    if (cozyProp && glossyProp) {
      const cozyCleanings = allCleanings.filter(c => c.propertyId === cozyProp.id);
      const glossyCleanings = allCleanings.filter(c => c.propertyId === glossyProp.id);
      
      const cozyDates = new Set(cozyCleanings.map(c => 
        c.scheduledDate?.toDate?.()?.toISOString().split('T')[0]
      ).filter(Boolean));
      
      const glossyDates = new Set(glossyCleanings.map(c => 
        c.scheduledDate?.toDate?.()?.toISOString().split('T')[0]
      ).filter(Boolean));
      
      // Date comuni
      for (const date of cozyDates) {
        if (glossyDates.has(date)) {
          const cozyC = cozyCleanings.find(c => 
            c.scheduledDate?.toDate?.()?.toISOString().split('T')[0] === date
          );
          const glossyC = glossyCleanings.find(c => 
            c.scheduledDate?.toDate?.()?.toISOString().split('T')[0] === date
          );
          commonDates.push({
            date,
            cozy: {
              id: cozyC?.id,
              status: cozyC?.status,
              guestName: cozyC?.guestName,
            },
            glossy: {
              id: glossyC?.id,
              status: glossyC?.status,
              guestName: glossyC?.guestName,
            },
          });
        }
      }
    }
    
    // ==================== RIEPILOGO ====================
    const totalDuplicates = propertyAnalysis.reduce((sum, p) => 
      sum + p.stats.duplicateCleaningDates, 0
    );
    const totalWithoutOrders = propertyAnalysis.reduce((sum, p) => 
      sum + p.stats.cleaningsWithoutOrders, 0
    );
    
    return NextResponse.json({
      summary: {
        propertiesFound: cozyGlossyProps.length,
        propertyNames: cozyGlossyProps.map(p => p.name),
        totalDuplicateCleanings: totalDuplicates,
        totalCleaningsWithoutOrders: totalWithoutOrders,
        mismatchedPropertyNames: mismatchedCleanings.length,
        combinedNameCleanings: combinedNameCleanings.length,
        commonCleaningDates: commonDates.length,
      },
      crossPropertyIssues: {
        mismatchedCleanings: mismatchedCleanings.slice(0, 20),
        combinedNameCleanings: combinedNameCleanings.slice(0, 10).map(c => ({
          id: c.id,
          propertyName: c.propertyName,
          propertyId: c.propertyId,
          date: c.scheduledDate?.toDate?.()?.toISOString().split('T')[0],
        })),
        commonDates: commonDates.slice(0, 20),
      },
      propertyAnalysis,
      allSuspiciousProperties: suspiciousProps.map(p => ({
        id: p.id,
        name: p.name,
        status: p.status,
      })),
    });
    
  } catch (error) {
    console.error("❌ Errore analisi:", error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Errore" 
    }, { status: 500 });
  }
}
