/**
 * API: Fix Automatico Problemi Sistema
 * POST /api/debug/fix-issues
 * 
 * Corregge automaticamente:
 * - Pulizie senza prezzo (prende prezzo dalla proprietà)
 * - Ordini orfani (elimina)
 * - Prenotazioni orfane (elimina)
 * - Pulizie orfane (elimina)
 */

import { NextRequest, NextResponse } from "next/server";
import { collection, getDocs, doc, updateDoc, deleteDoc, query, where, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

interface FixResult {
  action: string;
  success: boolean;
  count: number;
  details?: any[];
  error?: string;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const results: FixResult[] = [];
  
  try {
    console.log("🔧 Fix Issues Avviato...");
    
    // Parametri opzionali per controllare cosa fixare
    const body = await request.json().catch(() => ({}));
    const {
      fixCleaningPrices = true,
      fixOrphanOrders = true,
      fixOrphanBookings = true,
      fixOrphanCleanings = true,
      dryRun = false, // Se true, non fa modifiche ma mostra cosa farebbe
    } = body;
    
    // ==================== CARICA DATI ====================
    const [propertiesSnap, cleaningsSnap, bookingsSnap, ordersSnap] = await Promise.all([
      getDocs(collection(db, "properties")),
      getDocs(collection(db, "cleanings")),
      getDocs(collection(db, "bookings")),
      getDocs(collection(db, "orders")),
    ]);
    
    const properties = propertiesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const cleanings = cleaningsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const bookings = bookingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    const propertyIds = new Set(properties.map(p => p.id));
    const propertyPrices: Record<string, number> = {};
    properties.forEach(p => {
      if (p.cleaningPrice && p.cleaningPrice > 0) {
        propertyPrices[p.id] = p.cleaningPrice;
      }
    });
    
    console.log(`📊 Caricati: ${properties.length} proprietà, ${cleanings.length} pulizie`);
    
    // ==================== FIX 1: Pulizie senza prezzo ====================
    if (fixCleaningPrices) {
      const cleaningsWithoutPrice = cleanings.filter(c => 
        (!c.price || c.price === 0) && propertyPrices[c.propertyId]
      );
      
      const fixed: any[] = [];
      const skipped: any[] = [];
      
      for (const cleaning of cleaningsWithoutPrice) {
        const price = propertyPrices[cleaning.propertyId];
        
        if (price) {
          if (!dryRun) {
            await updateDoc(doc(db, "cleanings", cleaning.id), {
              price,
              updatedAt: Timestamp.now(),
            });
          }
          fixed.push({
            id: cleaning.id,
            propertyName: cleaning.propertyName,
            date: cleaning.scheduledDate?.toDate?.()?.toISOString().split('T')[0],
            newPrice: price,
          });
        } else {
          skipped.push({
            id: cleaning.id,
            propertyId: cleaning.propertyId,
            reason: "Proprietà senza cleaningPrice",
          });
        }
      }
      
      results.push({
        action: "Fix pulizie senza prezzo",
        success: true,
        count: fixed.length,
        details: fixed.slice(0, 20),
      });
      
      if (skipped.length > 0) {
        results.push({
          action: "Pulizie saltate (proprietà senza prezzo)",
          success: true,
          count: skipped.length,
          details: skipped,
        });
      }
      
      console.log(`✅ Pulizie fixate: ${fixed.length}, saltate: ${skipped.length}`);
    }
    
    // ==================== FIX 2: Ordini orfani ====================
    if (fixOrphanOrders) {
      const orphanOrders = orders.filter(o => !propertyIds.has(o.propertyId));
      
      if (!dryRun) {
        for (const order of orphanOrders) {
          await deleteDoc(doc(db, "orders", order.id));
        }
      }
      
      results.push({
        action: "Elimina ordini orfani",
        success: true,
        count: orphanOrders.length,
        details: orphanOrders.map(o => ({ id: o.id, propertyId: o.propertyId })),
      });
      
      console.log(`✅ Ordini orfani eliminati: ${orphanOrders.length}`);
    }
    
    // ==================== FIX 3: Prenotazioni orfane ====================
    if (fixOrphanBookings) {
      const orphanBookings = bookings.filter(b => !propertyIds.has(b.propertyId));
      
      if (!dryRun) {
        for (const booking of orphanBookings) {
          await deleteDoc(doc(db, "bookings", booking.id));
        }
      }
      
      results.push({
        action: "Elimina prenotazioni orfane",
        success: true,
        count: orphanBookings.length,
        details: orphanBookings.slice(0, 10).map(b => ({ id: b.id, propertyId: b.propertyId })),
      });
      
      console.log(`✅ Prenotazioni orfane eliminate: ${orphanBookings.length}`);
    }
    
    // ==================== FIX 4: Pulizie orfane ====================
    if (fixOrphanCleanings) {
      const orphanCleanings = cleanings.filter(c => !propertyIds.has(c.propertyId));
      
      if (!dryRun) {
        for (const cleaning of orphanCleanings) {
          await deleteDoc(doc(db, "cleanings", cleaning.id));
        }
      }
      
      results.push({
        action: "Elimina pulizie orfane",
        success: true,
        count: orphanCleanings.length,
        details: orphanCleanings.slice(0, 10).map(c => ({ 
          id: c.id, 
          propertyId: c.propertyId,
          propertyName: c.propertyName,
        })),
      });
      
      console.log(`✅ Pulizie orfane eliminate: ${orphanCleanings.length}`);
    }
    
    // ==================== RIEPILOGO ====================
    const totalFixed = results.reduce((sum, r) => sum + (r.success ? r.count : 0), 0);
    const elapsedMs = Date.now() - startTime;
    
    return NextResponse.json({
      success: true,
      dryRun,
      message: dryRun 
        ? `[DRY RUN] Trovati ${totalFixed} problemi da fixare`
        : `Fixati ${totalFixed} problemi`,
      executionTime: `${elapsedMs}ms`,
      results,
    });
    
  } catch (error) {
    console.error("❌ Fix Issues Error:", error);
    return NextResponse.json({ 
      success: false,
      error: error instanceof Error ? error.message : "Errore sconosciuto",
      results,
    }, { status: 500 });
  }
}

// GET per vedere cosa verrebbe fixato (dry run)
export async function GET(request: NextRequest) {
  // Simula un POST con dryRun=true
  const fakeRequest = new NextRequest(request.url, {
    method: 'POST',
    body: JSON.stringify({ dryRun: true }),
  });
  
  return POST(fakeRequest);
}
