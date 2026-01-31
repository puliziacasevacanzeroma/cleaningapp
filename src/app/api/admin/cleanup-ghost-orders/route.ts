/**
 * 🧹 PULIZIA ORDINI FANTASMA (a 0€ o senza items)
 * 
 * Questo script:
 * 1. Trova tutti gli ordini "fantasma" - quelli a prezzo 0 o senza items validi
 * 2. Analizza perché sono a 0 (nessun item, items senza prezzo, etc.)
 * 3. Permette di eliminarli in sicurezza
 * 
 * ENDPOINT: 
 * - GET /api/admin/cleanup-ghost-orders?secret=cleaningapp-cron-2024 (analisi)
 * - GET /api/admin/cleanup-ghost-orders?secret=cleaningapp-cron-2024&execute=true (elimina)
 * - GET /api/admin/cleanup-ghost-orders?secret=cleaningapp-cron-2024&ownerId=xxx (filtra per proprietario)
 * - GET /api/admin/cleanup-ghost-orders?secret=cleaningapp-cron-2024&propertyId=xxx (filtra per proprietà)
 */

import { NextRequest, NextResponse } from "next/server";
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET || 'cleaningapp-cron-2024';

interface GhostOrderAnalysis {
  orderId: string;
  propertyId: string;
  propertyName: string;
  status: string;
  scheduledDate: string | null;
  createdAt: string | null;
  itemsCount: number;
  totalCalculated: number;
  reason: string;
  items: { id: string; name?: string; quantity: number; price?: number }[];
}

export async function GET(req: NextRequest) {
  const urlSecret = req.nextUrl.searchParams.get('secret');
  const execute = req.nextUrl.searchParams.get('execute') === 'true';
  const ownerIdFilter = req.nextUrl.searchParams.get('ownerId');
  const propertyIdFilter = req.nextUrl.searchParams.get('propertyId');
  
  if (urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const stats = {
    totalOrders: 0,
    ghostOrders: 0,
    ordersToDelete: 0,
    ordersDeleted: 0,
    errors: 0,
    byReason: {} as Record<string, number>,
    byStatus: {} as Record<string, number>,
    byProperty: {} as Record<string, { name: string; count: number }>,
  };
  
  const ghostOrders: GhostOrderAnalysis[] = [];
  
  try {
    console.log(`\n🔍 ANALISI ORDINI FANTASMA - ${execute ? 'ESECUZIONE' : 'DRY RUN'}`);
    console.log('='.repeat(60));
    
    // 1. Carica tutti gli ordini
    const ordersSnap = await getDocs(collection(db, 'orders'));
    const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    // 2. Carica inventario per verificare prezzi
    const inventorySnap = await getDocs(collection(db, 'inventory'));
    const inventoryById = new Map(
      inventorySnap.docs.map(d => [d.id, { id: d.id, ...d.data() }])
    );
    
    // 3. Carica proprietà per filtrare per owner
    const propertiesSnap = await getDocs(collection(db, 'properties'));
    const propertiesById = new Map(
      propertiesSnap.docs.map(d => [d.id, { id: d.id, ...d.data() } as any])
    );
    
    // Filtra ordini se richiesto
    let filteredOrders = orders;
    
    if (ownerIdFilter) {
      const ownerPropertyIds = new Set(
        Array.from(propertiesById.values())
          .filter(p => p.ownerId === ownerIdFilter)
          .map(p => p.id)
      );
      filteredOrders = orders.filter((o: any) => ownerPropertyIds.has(o.propertyId));
      console.log(`📌 Filtrato per ownerId: ${ownerIdFilter} (${filteredOrders.length} ordini)`);
    }
    
    if (propertyIdFilter) {
      filteredOrders = filteredOrders.filter((o: any) => o.propertyId === propertyIdFilter);
      console.log(`📌 Filtrato per propertyId: ${propertyIdFilter} (${filteredOrders.length} ordini)`);
    }
    
    stats.totalOrders = filteredOrders.length;
    console.log(`📦 Ordini da analizzare: ${stats.totalOrders}`);
    
    // 4. Analizza ogni ordine
    for (const order of filteredOrders) {
      const o = order as any;
      const property = propertiesById.get(o.propertyId);
      
      let totalCalculated = 0;
      const itemsAnalysis: { id: string; name?: string; quantity: number; price?: number }[] = [];
      
      // Calcola totale dagli items
      if (o.items && Array.isArray(o.items) && o.items.length > 0) {
        for (const item of o.items) {
          const invItem = inventoryById.get(item.id) as any;
          const price = item.priceOverride ?? item.price ?? invItem?.sellPrice ?? 0;
          const quantity = item.quantity || 1;
          totalCalculated += price * quantity;
          
          itemsAnalysis.push({
            id: item.id,
            name: invItem?.name || item.name,
            quantity,
            price,
          });
        }
      }
      
      // Determina se è un ordine fantasma
      let reason: string | null = null;
      
      if (!o.items || !Array.isArray(o.items) || o.items.length === 0) {
        reason = 'NO_ITEMS';
      } else if (totalCalculated === 0) {
        // Ha items ma tutti a prezzo 0
        const itemsWithoutPrice = itemsAnalysis.filter(i => !i.price || i.price === 0);
        if (itemsWithoutPrice.length === itemsAnalysis.length) {
          reason = 'ALL_ITEMS_ZERO_PRICE';
        } else {
          reason = 'CALCULATED_ZERO';
        }
      }
      
      // Se ha un totalPriceOverride positivo, non è fantasma
      if (reason && o.totalPriceOverride && o.totalPriceOverride > 0) {
        reason = null; // Non è fantasma perché ha override positivo
      }
      
      if (reason) {
        stats.ghostOrders++;
        stats.byReason[reason] = (stats.byReason[reason] || 0) + 1;
        stats.byStatus[o.status || 'UNKNOWN'] = (stats.byStatus[o.status || 'UNKNOWN'] || 0) + 1;
        
        const propName = o.propertyName || property?.name || 'Sconosciuta';
        if (!stats.byProperty[o.propertyId]) {
          stats.byProperty[o.propertyId] = { name: propName, count: 0 };
        }
        stats.byProperty[o.propertyId].count++;
        
        const analysis: GhostOrderAnalysis = {
          orderId: o.id,
          propertyId: o.propertyId,
          propertyName: propName,
          status: o.status || 'UNKNOWN',
          scheduledDate: o.scheduledDate?.toDate?.()?.toISOString() || null,
          createdAt: o.createdAt?.toDate?.()?.toISOString() || null,
          itemsCount: itemsAnalysis.length,
          totalCalculated,
          reason,
          items: itemsAnalysis,
        };
        
        ghostOrders.push(analysis);
      }
    }
    
    stats.ordersToDelete = stats.ghostOrders;
    console.log(`👻 Ordini fantasma trovati: ${stats.ghostOrders}`);
    
    // 5. Elimina se execute=true
    if (execute && ghostOrders.length > 0) {
      console.log('\n🚀 Eliminazione in corso...');
      
      for (const ghost of ghostOrders) {
        try {
          await deleteDoc(doc(db, 'orders', ghost.orderId));
          stats.ordersDeleted++;
          
          if (stats.ordersDeleted % 10 === 0) {
            console.log(`   Eliminati ${stats.ordersDeleted}/${stats.ordersToDelete}...`);
          }
        } catch (err) {
          console.error(`   ❌ Errore eliminazione ${ghost.orderId}:`, err);
          stats.errors++;
        }
      }
      
      console.log(`\n✅ Eliminati ${stats.ordersDeleted} ordini fantasma`);
    }
    
    // Riepilogo
    console.log('\n' + '='.repeat(60));
    console.log('📊 RIEPILOGO ORDINI FANTASMA');
    console.log('='.repeat(60));
    console.log(`Ordini totali analizzati: ${stats.totalOrders}`);
    console.log(`Ordini fantasma: ${stats.ghostOrders}`);
    console.log(`\n📋 Per motivo:`);
    Object.entries(stats.byReason).forEach(([reason, count]) => {
      const reasonLabel = {
        'NO_ITEMS': 'Nessun articolo',
        'ALL_ITEMS_ZERO_PRICE': 'Tutti gli articoli a prezzo 0',
        'CALCULATED_ZERO': 'Totale calcolato 0',
      }[reason] || reason;
      console.log(`   ${reasonLabel}: ${count}`);
    });
    console.log(`\n📊 Per status:`);
    Object.entries(stats.byStatus).forEach(([status, count]) => {
      console.log(`   ${status}: ${count}`);
    });
    console.log(`\n🏠 Per proprietà:`);
    Object.entries(stats.byProperty)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .forEach(([id, data]) => {
        console.log(`   ${data.name}: ${data.count}`);
      });
    
    return NextResponse.json({
      success: true,
      dryRun: !execute,
      stats,
      message: execute
        ? `Eliminati ${stats.ordersDeleted} ordini fantasma. Errori: ${stats.errors}`
        : `Trovati ${stats.ghostOrders} ordini fantasma. Aggiungi &execute=true per eliminarli.`,
      // Lista completa ordini fantasma (per debug)
      ghostOrders: ghostOrders.slice(0, 100), // Limita a 100 per non sovraccaricare
      totalGhostOrders: ghostOrders.length,
    });
    
  } catch (error: any) {
    console.error('❌ Errore:', error);
    return NextResponse.json({ success: false, error: error.message, stats }, { status: 500 });
  }
}

// POST per eliminare ordini specifici
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { secret, orderIds } = body;
    
    if (secret !== CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json({ error: 'orderIds array required' }, { status: 400 });
    }
    
    let deleted = 0;
    let errors = 0;
    
    for (const orderId of orderIds) {
      try {
        await deleteDoc(doc(db, 'orders', orderId));
        deleted++;
      } catch (err) {
        console.error(`Errore eliminazione ${orderId}:`, err);
        errors++;
      }
    }
    
    return NextResponse.json({
      success: true,
      deleted,
      errors,
      message: `Eliminati ${deleted} ordini. Errori: ${errors}`,
    });
    
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
