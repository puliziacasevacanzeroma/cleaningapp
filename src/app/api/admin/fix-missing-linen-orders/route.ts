/**
 * 🔧 FIX MISSING LINEN ORDERS
 * 
 * Trova tutte le pulizie future che non hanno un ordine biancheria associato
 * e crea gli ordini mancanti.
 * 
 * Endpoint: 
 *   GET /api/admin/fix-missing-linen-orders?secret=cleaningapp-cron-2024&dry=true  (preview)
 *   GET /api/admin/fix-missing-linen-orders?secret=cleaningapp-cron-2024           (execute)
 */

import { NextRequest, NextResponse } from "next/server";
import { collection, getDocs, addDoc, query, where, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET || 'cleaningapp-cron-2024';

// ==================== LOGICA BIANCHERIA ====================

function getLinenForBedType(bedType: string) {
  switch (bedType) {
    case 'matr':
    case 'matrimoniale':
      return { lenzuoloMatrimoniale: 3, lenzuoloSingolo: 0, federa: 2 };
    case 'sing':
    case 'singolo':
      return { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 3, federa: 1 };
    case 'divano':
    case 'divano_letto':
      return { lenzuoloMatrimoniale: 3, lenzuoloSingolo: 0, federa: 2 };
    case 'castello':
      return { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 6, federa: 2 };
    default:
      return { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 3, federa: 1 };
  }
}

function calculateFallbackLinen(guestsCount: number, bedrooms: number, bathrooms: number) {
  const items: { id: string; name: string; quantity: number }[] = [];
  
  const matrimonialiNeeded = Math.min(bedrooms, Math.ceil(guestsCount / 2));
  const postiMatrimoniali = matrimonialiNeeded * 2;
  const singolariNeeded = Math.max(0, guestsCount - postiMatrimoniali);
  
  let totalLenzMatr = 0;
  let totalLenzSing = 0;
  let totalFedere = 0;
  
  for (let i = 0; i < matrimonialiNeeded; i++) {
    const req = getLinenForBedType('matr');
    totalLenzMatr += req.lenzuoloMatrimoniale;
    totalFedere += req.federa;
  }
  
  for (let i = 0; i < singolariNeeded; i++) {
    const req = getLinenForBedType('sing');
    totalLenzSing += req.lenzuoloSingolo;
    totalFedere += req.federa;
  }
  
  if (totalLenzMatr > 0) items.push({ id: 'lenzuola_matrimoniale', name: 'Lenzuola Matrimoniale', quantity: totalLenzMatr });
  if (totalLenzSing > 0) items.push({ id: 'lenzuola_singolo', name: 'Lenzuola Singolo', quantity: totalLenzSing });
  if (totalFedere > 0) items.push({ id: 'federa', name: 'Federa', quantity: totalFedere });
  
  items.push({ id: 'telo_doccia', name: 'Telo Doccia', quantity: guestsCount });
  items.push({ id: 'asciugamano_viso', name: 'Asciugamano Viso', quantity: guestsCount });
  items.push({ id: 'asciugamano_ospite', name: 'Asciugamano Ospite/Bidet', quantity: guestsCount });
  
  if (bathrooms > 0) items.push({ id: 'tappetino_bagno', name: 'Tappetino Bagno', quantity: bathrooms });
  
  return items;
}

function calculateLinenItemsForProperty(prop: any, guestsCount: number) {
  let linenItems: { id: string; name: string; quantity: number }[] = [];
  
  if (prop.serviceConfigs) {
    const config = prop.serviceConfigs[guestsCount];
    
    if (config) {
      if (config.bl) {
        Object.entries(config.bl).forEach(([bedId, items]: [string, any]) => {
          if (typeof items === 'object') {
            Object.entries(items).forEach(([itemId, qty]: [string, any]) => {
              if (typeof qty === 'number' && qty > 0) {
                const existing = linenItems.find(i => i.id === itemId);
                if (existing) existing.quantity += qty;
                else linenItems.push({ id: itemId, name: itemId, quantity: qty });
              }
            });
          }
        });
      }
      
      if (config.ba) {
        Object.entries(config.ba).forEach(([itemId, qty]: [string, any]) => {
          if (typeof qty === 'number' && qty > 0) {
            linenItems.push({ id: itemId, name: itemId, quantity: qty });
          }
        });
      }
      
      if (config.ki) {
        Object.entries(config.ki).forEach(([itemId, qty]: [string, any]) => {
          if (typeof qty === 'number' && qty > 0) {
            linenItems.push({ id: itemId, name: itemId, quantity: qty });
          }
        });
      }
    }
  }
  
  if (linenItems.length === 0) {
    linenItems = calculateFallbackLinen(guestsCount, prop.bedrooms || 1, prop.bathrooms || 1);
  }
  
  return linenItems;
}

function getDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ==================== MAIN ====================

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const urlSecret = req.nextUrl.searchParams.get('secret');
  const dryRun = req.nextUrl.searchParams.get('dry') === 'true';
  
  if (authHeader !== `Bearer ${CRON_SECRET}` && urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('🔧 FIX MISSING LINEN ORDERS - ' + new Date().toISOString());
  console.log(`   Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will create orders)'}`);
  console.log('='.repeat(80));
  
  const stats = {
    cleaningsChecked: 0,
    cleaningsWithoutOrder: 0,
    ordersCreated: 0,
    skippedOwnLinen: 0,
    skippedNoItems: 0,
    skippedCompleted: 0,
    skippedCancelled: 0,
    errors: 0,
    details: [] as any[]
  };
  
  try {
    // 1. Carica tutte le proprietà attive
    const propsSnap = await getDocs(query(collection(db, 'properties'), where('status', '==', 'ACTIVE')));
    const propertiesMap = new Map<string, any>();
    propsSnap.docs.forEach(d => propertiesMap.set(d.id, { id: d.id, ...d.data() }));
    
    console.log(`📋 Proprietà attive: ${propertiesMap.size}`);
    
    // 2. Carica tutti gli ordini esistenti
    const ordersSnap = await getDocs(collection(db, 'orders'));
    const ordersByCleaningId = new Map<string, any>();
    const ordersByPropertyAndDate = new Map<string, any>();
    
    ordersSnap.docs.forEach(d => {
      const data = d.data();
      if (data.cleaningId) {
        ordersByCleaningId.set(data.cleaningId, { id: d.id, ...data });
      }
      if (data.propertyId && data.scheduledDate) {
        const date = data.scheduledDate?.toDate?.();
        if (date) {
          const key = `${data.propertyId}_${getDateKey(date)}`;
          ordersByPropertyAndDate.set(key, { id: d.id, ...data });
        }
      }
    });
    
    console.log(`📦 Ordini esistenti: ${ordersSnap.size} (by cleaningId: ${ordersByCleaningId.size}, by prop+date: ${ordersByPropertyAndDate.size})`);
    
    // 3. Trova pulizie future senza ordini
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const cleaningsSnap = await getDocs(collection(db, 'cleanings'));
    console.log(`🧹 Pulizie totali: ${cleaningsSnap.size}`);
    
    for (const cleaningDoc of cleaningsSnap.docs) {
      const cleaning = { id: cleaningDoc.id, ...cleaningDoc.data() } as any;
      const cleaningDate = cleaning.scheduledDate?.toDate?.();
      
      if (!cleaningDate) continue;
      
      // Salta pulizie passate
      if (cleaningDate < today) continue;
      
      stats.cleaningsChecked++;
      
      // Salta pulizie completate o cancellate
      if (cleaning.status === 'COMPLETED') {
        stats.skippedCompleted++;
        continue;
      }
      if (cleaning.status === 'CANCELLED') {
        stats.skippedCancelled++;
        continue;
      }
      
      // Controlla se esiste già un ordine
      const existingByCleaningId = ordersByCleaningId.get(cleaning.id);
      const dateKey = getDateKey(cleaningDate);
      const propDateKey = `${cleaning.propertyId}_${dateKey}`;
      const existingByPropDate = ordersByPropertyAndDate.get(propDateKey);
      
      if (existingByCleaningId || existingByPropDate) {
        // Ordine già esiste
        continue;
      }
      
      // Ordine mancante trovato!
      stats.cleaningsWithoutOrder++;
      
      const prop = propertiesMap.get(cleaning.propertyId);
      if (!prop) {
        console.log(`   ⚠️ Proprietà non trovata: ${cleaning.propertyId}`);
        stats.errors++;
        continue;
      }
      
      // Controlla se usa biancheria propria
      if (prop.usesOwnLinen) {
        stats.skippedOwnLinen++;
        stats.details.push({
          cleaningId: cleaning.id,
          propertyName: prop.name,
          date: dateKey,
          reason: 'usesOwnLinen'
        });
        continue;
      }
      
      // Calcola items biancheria
      const guestsCount = cleaning.guestsCount || prop.maxGuests || 2;
      const linenItems = calculateLinenItemsForProperty(prop, guestsCount);
      
      if (linenItems.length === 0) {
        stats.skippedNoItems++;
        stats.details.push({
          cleaningId: cleaning.id,
          propertyName: prop.name,
          date: dateKey,
          reason: 'noItems'
        });
        continue;
      }
      
      console.log(`\n   🔧 Missing order found:`);
      console.log(`      Property: ${prop.name}`);
      console.log(`      Date: ${dateKey}`);
      console.log(`      Guests: ${guestsCount}`);
      console.log(`      Items: ${linenItems.length}`);
      
      if (!dryRun) {
        try {
          const orderRef = await addDoc(collection(db, 'orders'), {
            cleaningId: cleaning.id,
            propertyId: prop.id,
            propertyName: prop.name,
            propertyAddress: prop.address || '',
            propertyCity: prop.city || '',
            propertyPostalCode: prop.postalCode || '',
            propertyFloor: prop.floor || '',
            propertyApartment: prop.apartment || '',
            propertyIntercom: prop.intercom || '',
            propertyDoorCode: prop.doorCode || '',
            propertyKeysLocation: prop.keysLocation || '',
            propertyAccessNotes: prop.accessNotes || '',
            status: 'PENDING',
            type: 'LINEN',
            scheduledDate: cleaning.scheduledDate,
            scheduledTime: cleaning.scheduledTime || prop.checkOutTime || '10:00',
            urgency: 'normal',
            items: linenItems,
            includePickup: true,
            pickupItems: [],
            pickupFromOrders: [],
            pickupCompleted: false,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
            _fixedBy: 'fix-missing-linen-orders',
            _fixedAt: new Date().toISOString(),
          });
          
          stats.ordersCreated++;
          stats.details.push({
            cleaningId: cleaning.id,
            propertyName: prop.name,
            date: dateKey,
            orderId: orderRef.id,
            status: 'created'
          });
          
          console.log(`      ✅ Order created: ${orderRef.id}`);
        } catch (err: any) {
          stats.errors++;
          console.error(`      ❌ Error creating order:`, err.message);
          stats.details.push({
            cleaningId: cleaning.id,
            propertyName: prop.name,
            date: dateKey,
            error: err.message
          });
        }
      } else {
        stats.details.push({
          cleaningId: cleaning.id,
          propertyName: prop.name,
          date: dateKey,
          guestsCount,
          itemsCount: linenItems.length,
          status: 'would_create'
        });
        console.log(`      🔍 DRY RUN - would create order`);
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ FIX COMPLETED');
    console.log(`   Cleanings checked (future): ${stats.cleaningsChecked}`);
    console.log(`   Cleanings without order: ${stats.cleaningsWithoutOrder}`);
    console.log(`   Skipped (own linen): ${stats.skippedOwnLinen}`);
    console.log(`   Skipped (no items): ${stats.skippedNoItems}`);
    console.log(`   Skipped (completed): ${stats.skippedCompleted}`);
    console.log(`   Skipped (cancelled): ${stats.skippedCancelled}`);
    console.log(`   Orders created: ${stats.ordersCreated}`);
    console.log(`   Errors: ${stats.errors}`);
    console.log('='.repeat(80) + '\n');
    
    return NextResponse.json({
      success: true,
      dryRun,
      stats,
      message: dryRun 
        ? `DRY RUN: Found ${stats.cleaningsWithoutOrder} cleanings without orders. Run without ?dry=true to create them.`
        : `Created ${stats.ordersCreated} missing orders.`
    });
    
  } catch (error: any) {
    console.error('❌ Error:', error);
    return NextResponse.json({ success: false, error: error.message, stats }, { status: 500 });
  }
}
