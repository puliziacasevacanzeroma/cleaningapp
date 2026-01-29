/**
 * 🔍 DEBUG - Analizza ordini nel database
 * 
 * Questo endpoint analizza tutti gli ordini per capire:
 * - Quanti sono in totale
 * - Come sono distribuiti per data
 * - Se ci sono duplicati
 * - Se ci sono ordini con dati strani
 */

import { NextRequest, NextResponse } from "next/server";
import { collection, getDocs } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET || 'cleaningapp-cron-2024';

export async function GET(req: NextRequest) {
  const urlSecret = req.nextUrl.searchParams.get('secret');
  
  if (urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    // Carica tutti gli ordini
    const ordersSnap = await getDocs(collection(db, 'orders'));
    const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    // Carica tutte le pulizie per confronto
    const cleaningsSnap = await getDocs(collection(db, 'cleanings'));
    const cleanings = cleaningsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    // Analisi ordini
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const stats = {
      totalOrders: orders.length,
      totalCleanings: cleanings.length,
      
      // Per stato
      byStatus: {} as Record<string, number>,
      
      // Per tipo
      byType: {} as Record<string, number>,
      
      // Per data
      ordersToday: 0,
      ordersFuture: 0,
      ordersPast: 0,
      ordersNoDate: 0,
      
      // Distribuzione per mese
      byMonth: {} as Record<string, number>,
      
      // Duplicati (stesso propertyId + stessa data)
      potentialDuplicates: 0,
      duplicateDetails: [] as any[],
      
      // Ordini senza cleaningId
      ordersWithoutCleaningId: 0,
      
      // Ordini senza items
      ordersWithoutItems: 0,
      
      // Ordini con items vuoti
      ordersWithEmptyItems: 0,
      
      // Esempi di ordini strani
      strangeOrders: [] as any[],
    };
    
    // Mappa per trovare duplicati
    const ordersByPropertyDate = new Map<string, any[]>();
    
    for (const order of orders) {
      const o = order as any;
      
      // Per stato
      const status = o.status || 'UNKNOWN';
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
      
      // Per tipo
      const type = o.type || 'UNKNOWN';
      stats.byType[type] = (stats.byType[type] || 0) + 1;
      
      // Per data
      const scheduledDate = o.scheduledDate?.toDate?.();
      if (!scheduledDate) {
        stats.ordersNoDate++;
        if (stats.strangeOrders.length < 5) {
          stats.strangeOrders.push({
            id: o.id,
            reason: 'No scheduledDate',
            propertyName: o.propertyName,
            createdAt: o.createdAt?.toDate?.()?.toISOString(),
          });
        }
      } else {
        const orderDate = new Date(scheduledDate);
        orderDate.setHours(0, 0, 0, 0);
        
        if (orderDate.getTime() === today.getTime()) {
          stats.ordersToday++;
        } else if (orderDate > today) {
          stats.ordersFuture++;
        } else {
          stats.ordersPast++;
        }
        
        // Per mese
        const monthKey = `${scheduledDate.getFullYear()}-${String(scheduledDate.getMonth() + 1).padStart(2, '0')}`;
        stats.byMonth[monthKey] = (stats.byMonth[monthKey] || 0) + 1;
        
        // Check duplicati
        const dateStr = scheduledDate.toISOString().split('T')[0];
        const key = `${o.propertyId}_${dateStr}`;
        if (!ordersByPropertyDate.has(key)) {
          ordersByPropertyDate.set(key, []);
        }
        ordersByPropertyDate.get(key)!.push({
          id: o.id,
          propertyName: o.propertyName,
          status: o.status,
          createdAt: o.createdAt?.toDate?.()?.toISOString(),
        });
      }
      
      // Senza cleaningId
      if (!o.cleaningId) {
        stats.ordersWithoutCleaningId++;
      }
      
      // Senza items o items vuoti
      if (!o.items) {
        stats.ordersWithoutItems++;
      } else if (o.items.length === 0) {
        stats.ordersWithEmptyItems++;
      }
    }
    
    // Conta duplicati
    for (const [key, ordersList] of ordersByPropertyDate.entries()) {
      if (ordersList.length > 1) {
        stats.potentialDuplicates += ordersList.length - 1;
        if (stats.duplicateDetails.length < 10) {
          stats.duplicateDetails.push({
            key,
            count: ordersList.length,
            orders: ordersList,
          });
        }
      }
    }
    
    // Ordina byMonth
    const sortedByMonth = Object.entries(stats.byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {});
    stats.byMonth = sortedByMonth;
    
    return NextResponse.json({
      success: true,
      analysis: stats,
      summary: {
        message: `Trovati ${stats.totalOrders} ordini totali`,
        cleaningsComparison: `Ci sono ${stats.totalCleanings} pulizie vs ${stats.totalOrders} ordini`,
        ratio: (stats.totalOrders / stats.totalCleanings).toFixed(2),
        duplicatesWarning: stats.potentialDuplicates > 0 
          ? `⚠️ ${stats.potentialDuplicates} possibili duplicati trovati!`
          : '✅ Nessun duplicato evidente',
      }
    });
    
  } catch (error: any) {
    console.error('❌ Errore:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
