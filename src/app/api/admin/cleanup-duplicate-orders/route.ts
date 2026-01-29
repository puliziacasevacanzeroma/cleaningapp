/**
 * 🧹 PULIZIA ORDINI DUPLICATI
 * 
 * Questo script:
 * 1. Trova tutti gli ordini duplicati (stesso propertyId + stessa data)
 * 2. Mantiene solo il primo ordine (quello più vecchio o con status migliore)
 * 3. Elimina i duplicati
 * 
 * ENDPOINT: GET /api/admin/cleanup-duplicate-orders?secret=cleaningapp-cron-2024 (dry run)
 * ENDPOINT: GET /api/admin/cleanup-duplicate-orders?secret=cleaningapp-cron-2024&execute=true (esegue)
 */

import { NextRequest, NextResponse } from "next/server";
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET || 'cleaningapp-cron-2024';

// Ordine di priorità per status (manteniamo quelli con status "migliore")
const STATUS_PRIORITY: Record<string, number> = {
  'DELIVERED': 1,    // Più importante - già consegnato
  'IN_TRANSIT': 2,
  'ASSIGNED': 3,
  'PICKING': 4,
  'PENDING': 5,      // Meno importante
};

export async function GET(req: NextRequest) {
  const urlSecret = req.nextUrl.searchParams.get('secret');
  const execute = req.nextUrl.searchParams.get('execute') === 'true';
  
  if (urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const stats = {
    totalOrders: 0,
    uniqueCombinations: 0,
    duplicatesFound: 0,
    ordersToDelete: 0,
    ordersDeleted: 0,
    errors: 0,
    deletionDetails: [] as any[],
  };
  
  try {
    console.log(`\n🧹 PULIZIA ORDINI DUPLICATI - ${execute ? 'ESECUZIONE' : 'DRY RUN'}`);
    console.log('='.repeat(60));
    
    // 1. Carica tutti gli ordini
    const ordersSnap = await getDocs(collection(db, 'orders'));
    const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    stats.totalOrders = orders.length;
    
    console.log(`📦 Ordini totali: ${stats.totalOrders}`);
    
    // 2. Raggruppa per propertyId + data
    const ordersByKey = new Map<string, any[]>();
    
    for (const order of orders) {
      const o = order as any;
      const scheduledDate = o.scheduledDate?.toDate?.();
      
      if (!scheduledDate || !o.propertyId) continue;
      
      const dateStr = scheduledDate.toISOString().split('T')[0];
      const key = `${o.propertyId}_${dateStr}`;
      
      if (!ordersByKey.has(key)) {
        ordersByKey.set(key, []);
      }
      ordersByKey.get(key)!.push(o);
    }
    
    stats.uniqueCombinations = ordersByKey.size;
    console.log(`🔑 Combinazioni uniche (propertyId + data): ${stats.uniqueCombinations}`);
    
    // 3. Trova duplicati e decidi quali eliminare
    const ordersToDelete: string[] = [];
    
    for (const [key, ordersList] of ordersByKey.entries()) {
      if (ordersList.length <= 1) continue;
      
      stats.duplicatesFound += ordersList.length - 1;
      
      // Ordina per:
      // 1. Status (priorità più alta = mantieni)
      // 2. Se ha riderId (assegnato = mantieni)
      // 3. Data creazione (più vecchio = mantieni)
      ordersList.sort((a, b) => {
        // Status priority
        const statusA = STATUS_PRIORITY[a.status] || 99;
        const statusB = STATUS_PRIORITY[b.status] || 99;
        if (statusA !== statusB) return statusA - statusB;
        
        // Ha rider?
        if (a.riderId && !b.riderId) return -1;
        if (!a.riderId && b.riderId) return 1;
        
        // Data creazione
        const dateA = a.createdAt?.toDate?.()?.getTime() || 0;
        const dateB = b.createdAt?.toDate?.()?.getTime() || 0;
        return dateA - dateB;
      });
      
      // Il primo è quello da mantenere, gli altri da eliminare
      const toKeep = ordersList[0];
      const toDelete = ordersList.slice(1);
      
      for (const order of toDelete) {
        ordersToDelete.push(order.id);
        stats.deletionDetails.push({
          key,
          deletedId: order.id,
          deletedStatus: order.status,
          deletedCreatedAt: order.createdAt?.toDate?.()?.toISOString(),
          keptId: toKeep.id,
          keptStatus: toKeep.status,
          propertyName: order.propertyName || toKeep.propertyName,
        });
      }
    }
    
    stats.ordersToDelete = ordersToDelete.length;
    console.log(`🗑️ Ordini da eliminare: ${stats.ordersToDelete}`);
    
    // 4. Elimina i duplicati (se execute=true)
    if (execute && ordersToDelete.length > 0) {
      console.log('\n🚀 Eliminazione in corso...');
      
      for (const orderId of ordersToDelete) {
        try {
          await deleteDoc(doc(db, 'orders', orderId));
          stats.ordersDeleted++;
          
          if (stats.ordersDeleted % 50 === 0) {
            console.log(`   Eliminati ${stats.ordersDeleted}/${stats.ordersToDelete}...`);
          }
        } catch (err) {
          console.error(`   ❌ Errore eliminazione ${orderId}:`, err);
          stats.errors++;
        }
      }
      
      console.log(`\n✅ Eliminati ${stats.ordersDeleted} ordini duplicati`);
    }
    
    // Riepilogo
    console.log('\n' + '='.repeat(60));
    console.log('📊 RIEPILOGO');
    console.log('='.repeat(60));
    console.log(`Ordini totali: ${stats.totalOrders}`);
    console.log(`Duplicati trovati: ${stats.duplicatesFound}`);
    console.log(`Ordini ${execute ? 'eliminati' : 'da eliminare'}: ${execute ? stats.ordersDeleted : stats.ordersToDelete}`);
    console.log(`Ordini rimanenti: ${stats.totalOrders - (execute ? stats.ordersDeleted : stats.ordersToDelete)}`);
    if (stats.errors > 0) console.log(`Errori: ${stats.errors}`);
    
    return NextResponse.json({
      success: true,
      dryRun: !execute,
      stats,
      message: execute
        ? `Eliminati ${stats.ordersDeleted} ordini duplicati. Rimanenti: ${stats.totalOrders - stats.ordersDeleted}`
        : `Trovati ${stats.duplicatesFound} duplicati. Aggiungi &execute=true per eliminarli.`,
      // Mostra solo primi 20 dettagli per non sovraccaricare la risposta
      sampleDeletions: stats.deletionDetails.slice(0, 20),
    });
    
  } catch (error: any) {
    console.error('❌ Errore:', error);
    return NextResponse.json({ success: false, error: error.message, stats }, { status: 500 });
  }
}
