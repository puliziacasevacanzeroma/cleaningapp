/**
 * API: Analisi DETTAGLIATA pulizie per data specifica
 * GET /api/debug/analyze-date?date=2026-02-08
 * 
 * Mostra TUTTO su ogni pulizia di quella data
 */

import { NextRequest, NextResponse } from "next/server";
import { collection, getDocs, query, where, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const dateStr = searchParams.get("date") || "2026-02-08";
  
  try {
    console.log(`🔍 Analisi pulizie per data: ${dateStr}`);
    
    // Parse data
    const targetDate = new Date(dateStr);
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);
    
    // ==================== CARICA TUTTI I DATI ====================
    const [propertiesSnap, cleaningsSnap, bookingsSnap, ordersSnap] = await Promise.all([
      getDocs(collection(db, "properties")),
      getDocs(query(
        collection(db, "cleanings"),
        where("scheduledDate", ">=", Timestamp.fromDate(targetDate)),
        where("scheduledDate", "<", Timestamp.fromDate(nextDay))
      )),
      getDocs(collection(db, "bookings")),
      getDocs(collection(db, "orders")),
    ]);
    
    const properties = propertiesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const cleanings = cleaningsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const bookings = bookingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    console.log(`📋 Pulizie trovate per ${dateStr}: ${cleanings.length}`);
    
    // ==================== ANALISI DETTAGLIATA ====================
    const cleaningsAnalysis = cleanings.map(cleaning => {
      // Trova proprietà
      const property = properties.find(p => p.id === cleaning.propertyId);
      
      // Trova prenotazione collegata
      const booking = bookings.find(b => b.id === cleaning.bookingId);
      
      // Trova ordine collegato
      const order = orders.find(o => o.cleaningId === cleaning.id);
      
      // Trova TUTTE le prenotazioni della stessa proprietà con checkout in questa data
      const relatedBookings = bookings.filter(b => {
        if (b.propertyId !== cleaning.propertyId) return false;
        const checkout = b.checkOut?.toDate?.();
        if (!checkout) return false;
        const checkoutStr = checkout.toISOString().split('T')[0];
        return checkoutStr === dateStr;
      });
      
      return {
        // === INFO PULIZIA ===
        cleaningId: cleaning.id,
        cleaningCreatedAt: cleaning.createdAt?.toDate?.()?.toISOString(),
        cleaningUpdatedAt: cleaning.updatedAt?.toDate?.()?.toISOString(),
        scheduledDate: cleaning.scheduledDate?.toDate?.()?.toISOString(),
        scheduledTime: cleaning.scheduledTime,
        status: cleaning.status,
        guestsCount: cleaning.guestsCount,
        guestName: cleaning.guestName,
        price: cleaning.price,
        
        // === INFO PROPRIETÀ ===
        propertyId: cleaning.propertyId,
        propertyNameInCleaning: cleaning.propertyName,
        propertyNameInDB: property?.name,
        propertyMatch: cleaning.propertyName === property?.name,
        propertyCleaningPrice: property?.cleaningPrice,
        
        // === FONTE PRENOTAZIONE ===
        bookingSource: cleaning.bookingSource,
        bookingId: cleaning.bookingId,
        
        // === PRENOTAZIONE COLLEGATA ===
        linkedBooking: booking ? {
          id: booking.id,
          source: booking.source,
          icalUid: booking.icalUid,
          guestName: booking.guestName,
          checkIn: booking.checkIn?.toDate?.()?.toISOString().split('T')[0],
          checkOut: booking.checkOut?.toDate?.()?.toISOString().split('T')[0],
          createdAt: booking.createdAt?.toDate?.()?.toISOString(),
        } : null,
        
        // === TUTTE LE PRENOTAZIONI CON CHECKOUT OGGI ===
        allBookingsWithCheckoutToday: relatedBookings.map(b => ({
          id: b.id,
          source: b.source,
          icalUid: b.icalUid,
          guestName: b.guestName,
          checkIn: b.checkIn?.toDate?.()?.toISOString().split('T')[0],
          checkOut: b.checkOut?.toDate?.()?.toISOString().split('T')[0],
        })),
        
        // === ORDINE BIANCHERIA ===
        hasOrder: !!order,
        order: order ? {
          id: order.id,
          status: order.status,
          createdAt: order.createdAt?.toDate?.()?.toISOString(),
        } : null,
      };
    });
    
    // ==================== RAGGRUPPA PER PROPRIETÀ ====================
    const byProperty: Record<string, any[]> = {};
    cleaningsAnalysis.forEach(c => {
      const propName = c.propertyNameInDB || c.propertyNameInCleaning || 'UNKNOWN';
      if (!byProperty[propName]) byProperty[propName] = [];
      byProperty[propName].push(c);
    });
    
    // ==================== TROVA DUPLICATI ====================
    const duplicates: any[] = [];
    for (const [propName, propCleanings] of Object.entries(byProperty)) {
      if (propCleanings.length > 1) {
        duplicates.push({
          propertyName: propName,
          count: propCleanings.length,
          cleanings: propCleanings,
          possibleCause: analyzeDuplicateCause(propCleanings),
        });
      }
    }
    
    // ==================== FILTRA SOLO COZY E GLOSSY ====================
    const cozyGlossyCleanings = cleaningsAnalysis.filter(c => {
      const name = (c.propertyNameInDB || c.propertyNameInCleaning || '').toLowerCase();
      return name.includes('cozy') || name.includes('glossy');
    });
    
    return NextResponse.json({
      date: dateStr,
      totalCleanings: cleanings.length,
      totalDuplicateProperties: duplicates.length,
      
      // Focus su Cozy e Glossy
      cozyGlossyAnalysis: {
        count: cozyGlossyCleanings.length,
        cleanings: cozyGlossyCleanings,
      },
      
      // Tutti i duplicati
      duplicates,
      
      // Tutte le pulizie raggruppate per proprietà
      byProperty,
      
      // Lista raw
      allCleanings: cleaningsAnalysis,
    });
    
  } catch (error) {
    console.error("❌ Errore analisi:", error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Errore" 
    }, { status: 500 });
  }
}

// Analizza la possibile causa dei duplicati
function analyzeDuplicateCause(cleanings: any[]): string {
  const causes: string[] = [];
  
  // Stesso bookingId?
  const bookingIds = cleanings.map(c => c.bookingId).filter(Boolean);
  const uniqueBookingIds = new Set(bookingIds);
  if (uniqueBookingIds.size < bookingIds.length) {
    causes.push("⚠️ Stesso bookingId per più pulizie");
  }
  
  // Stesso bookingSource?
  const sources = cleanings.map(c => c.bookingSource).filter(Boolean);
  const uniqueSources = new Set(sources);
  if (uniqueSources.size === 1) {
    causes.push(`📥 Tutte dalla stessa fonte: ${sources[0]}`);
  } else if (uniqueSources.size > 1) {
    causes.push(`📥 Fonti diverse: ${Array.from(uniqueSources).join(', ')}`);
  }
  
  // Creati nello stesso momento?
  const createdAts = cleanings.map(c => c.cleaningCreatedAt).filter(Boolean);
  if (createdAts.length > 1) {
    const times = createdAts.map(t => new Date(t).getTime());
    const diff = Math.abs(times[0] - times[1]) / 1000; // secondi
    if (diff < 60) {
      causes.push(`⏱️ Creati a ${diff.toFixed(0)} secondi di distanza (possibile race condition)`);
    } else if (diff < 3600) {
      causes.push(`⏱️ Creati a ${(diff/60).toFixed(0)} minuti di distanza`);
    } else {
      causes.push(`⏱️ Creati a ${(diff/3600).toFixed(1)} ore di distanza`);
    }
  }
  
  // Prenotazioni multiple?
  const allBookings = cleanings.flatMap(c => c.allBookingsWithCheckoutToday || []);
  if (allBookings.length > 1) {
    causes.push(`📋 ${allBookings.length} prenotazioni con checkout oggi per questa proprietà`);
  }
  
  // Property name mismatch?
  const mismatches = cleanings.filter(c => !c.propertyMatch);
  if (mismatches.length > 0) {
    causes.push(`❌ Nome proprietà non corrisponde in ${mismatches.length} pulizie`);
  }
  
  return causes.length > 0 ? causes.join(' | ') : "❓ Causa non identificata";
}
