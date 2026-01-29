/**
 * API: Fix Ordini Orfani (dopo eliminazione pulizie duplicate)
 * GET /api/debug/fix-orphan-orders - Dry run
 * POST /api/debug/fix-orphan-orders - Esegue eliminazione
 * 
 * Trova ed elimina ordini il cui cleaningId non esiste più
 */

import { NextRequest, NextResponse } from "next/server";
import { collection, getDocs, doc, deleteDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return analyzeAndFix(false);
}

export async function POST(request: NextRequest) {
  return analyzeAndFix(true);
}

async function analyzeAndFix(executeDelete: boolean) {
  try {
    console.log(`🔍 Analisi ordini orfani (executeDelete: ${executeDelete})...`);
    
    // Carica tutti gli ordini e pulizie
    const [ordersSnap, cleaningsSnap] = await Promise.all([
      getDocs(collection(db, "orders")),
      getDocs(collection(db, "cleanings")),
    ]);
    
    const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const cleanings = cleaningsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    // Set di tutti i cleaningId esistenti
    const existingCleaningIds = new Set(cleanings.map(c => c.id));
    
    console.log(`📋 Totale ordini: ${orders.length}`);
    console.log(`📋 Totale pulizie: ${cleanings.length}`);
    
    // Trova ordini orfani (cleaningId non esiste)
    const orphanOrders = orders.filter(order => {
      if (!order.cleaningId) return false; // Ordini senza cleaningId non sono orfani
      return !existingCleaningIds.has(order.cleaningId);
    });
    
    console.log(`🔴 Ordini orfani trovati: ${orphanOrders.length}`);
    
    // Esegui eliminazione se richiesto
    let deleted = 0;
    
    if (executeDelete && orphanOrders.length > 0) {
      for (const order of orphanOrders) {
        await deleteDoc(doc(db, "orders", order.id));
        deleted++;
        console.log(`🗑️ Eliminato ordine: ${order.id} (cleaningId: ${order.cleaningId})`);
      }
    }
    
    return NextResponse.json({
      success: true,
      dryRun: !executeDelete,
      summary: {
        totalOrders: orders.length,
        totalCleanings: cleanings.length,
        orphanOrdersFound: orphanOrders.length,
        deleted: executeDelete ? deleted : 0,
      },
      orphanOrders: orphanOrders.slice(0, 50).map(o => ({
        id: o.id,
        cleaningId: o.cleaningId,
        propertyName: o.propertyName,
        deliveryDate: o.deliveryDate?.toDate?.()?.toISOString().split('T')[0],
        status: o.status,
        createdAt: o.createdAt?.toDate?.()?.toISOString(),
      })),
      message: executeDelete 
        ? `✅ Eliminati ${deleted} ordini orfani`
        : `🔍 Trovati ${orphanOrders.length} ordini orfani. Usa POST per eliminare.`,
    });
    
  } catch (error) {
    console.error("❌ Errore:", error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Errore" 
    }, { status: 500 });
  }
}
