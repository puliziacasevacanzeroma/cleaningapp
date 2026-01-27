/**
 * 🔧 SCRIPT FIX - Crea ordini biancheria mancanti per pulizie esistenti
 * 
 * Questo script:
 * 1. Trova tutte le pulizie FUTURE (da oggi in poi) senza ordine biancheria
 * 2. Per ogni pulizia, controlla la proprietà:
 *    - Se usesOwnLinen = true → skip
 *    - Se usesOwnLinen = false → crea ordine biancheria
 * 3. Usa serviceConfigs se esistono, altrimenti logica fallback
 * 
 * ENDPOINT: GET /api/admin/fix-missing-linen-orders?secret=cleaningapp-cron-2024
 * ENDPOINT: GET /api/admin/fix-missing-linen-orders?secret=cleaningapp-cron-2024&dryRun=true (solo preview)
 */

import { NextRequest, NextResponse } from "next/server";
import { collection, getDocs, addDoc, query, where, Timestamp, doc, getDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minuti max

const ADMIN_SECRET = process.env.CRON_SECRET || 'cleaningapp-cron-2024';

export async function GET(req: NextRequest) {
  const urlSecret = req.nextUrl.searchParams.get('secret');
  const dryRun = req.nextUrl.searchParams.get('dryRun') === 'true';
  
  if (urlSecret !== ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🔧 FIX MISSING LINEN ORDERS - ${dryRun ? 'DRY RUN' : 'ESECUZIONE REALE'}`);
  console.log(`${"=".repeat(60)}\n`);
  
  const stats = {
    totalCleanings: 0,
    cleaningsWithoutOrder: 0,
    skippedUsesOwnLinen: 0,
    skippedAlreadyHasOrder: 0,
    ordersCreated: 0,
    errors: 0,
    details: [] as any[]
  };
  
  try {
    // 1. Prendi tutte le pulizie da oggi in poi
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const cleaningsQuery = query(
      collection(db, 'cleanings'),
      where('scheduledDate', '>=', Timestamp.fromDate(today))
    );
    
    const cleaningsSnap = await getDocs(cleaningsQuery);
    stats.totalCleanings = cleaningsSnap.size;
    
    console.log(`📋 Trovate ${stats.totalCleanings} pulizie future\n`);
    
    // 2. Prendi tutti gli ordini esistenti per fare match veloce
    const ordersSnap = await getDocs(collection(db, 'orders'));
    const ordersByCleaningId = new Map<string, any>();
    const ordersByPropertyAndDate = new Map<string, any>();
    
    ordersSnap.docs.forEach(doc => {
      const data = doc.data();
      if (data.cleaningId) {
        ordersByCleaningId.set(data.cleaningId, { id: doc.id, ...data });
      }
      // Anche match per propertyId + data (per ordini senza cleaningId)
      if (data.propertyId && data.scheduledDate) {
        const dateStr = data.scheduledDate.toDate().toISOString().split('T')[0];
        const key = `${data.propertyId}_${dateStr}`;
        ordersByPropertyAndDate.set(key, { id: doc.id, ...data });
      }
    });
    
    console.log(`📦 Trovati ${ordersSnap.size} ordini esistenti\n`);
    
    // 3. Cache proprietà per evitare query ripetute
    const propertiesCache = new Map<string, any>();
    
    // 4. Processa ogni pulizia
    for (const cleaningDoc of cleaningsSnap.docs) {
      const cleaning = { id: cleaningDoc.id, ...cleaningDoc.data() } as any;
      const cleaningDate = cleaning.scheduledDate?.toDate();
      const dateStr = cleaningDate?.toISOString().split('T')[0] || '';
      
      console.log(`\n--- Pulizia: ${cleaning.propertyName || cleaning.propertyId} (${dateStr}) ---`);
      
      // Controlla se ha già un ordine
      const existingOrderById = ordersByCleaningId.get(cleaning.id);
      const existingOrderByDate = ordersByPropertyAndDate.get(`${cleaning.propertyId}_${dateStr}`);
      
      if (existingOrderById || existingOrderByDate) {
        console.log(`  ✅ Ha già un ordine biancheria`);
        stats.skippedAlreadyHasOrder++;
        continue;
      }
      
      stats.cleaningsWithoutOrder++;
      
      // Carica proprietà (con cache)
      let property = propertiesCache.get(cleaning.propertyId);
      if (!property) {
        const propDoc = await getDoc(doc(db, 'properties', cleaning.propertyId));
        if (propDoc.exists()) {
          property = { id: propDoc.id, ...propDoc.data() };
          propertiesCache.set(cleaning.propertyId, property);
        }
      }
      
      if (!property) {
        console.log(`  ❌ Proprietà non trovata!`);
        stats.errors++;
        continue;
      }
      
      // Controlla usesOwnLinen
      if (property.usesOwnLinen === true) {
        console.log(`  ⏭️ Skip: proprietà usa biancheria propria`);
        stats.skippedUsesOwnLinen++;
        stats.details.push({
          cleaningId: cleaning.id,
          propertyName: property.name,
          date: dateStr,
          action: 'SKIPPED',
          reason: 'usesOwnLinen = true'
        });
        continue;
      }
      
      // Prepara items biancheria
      const guestsCount = cleaning.guestsCount || property.maxGuests || 2;
      const linenItems: { id: string; name: string; quantity: number }[] = [];
      
      // CASO 1: Ha serviceConfigs
      if (property.serviceConfigs) {
        const config = property.serviceConfigs[guestsCount];
        
        if (config) {
          // Biancheria letto
          if (config.bl) {
            Object.entries(config.bl).forEach(([bedId, items]: [string, any]) => {
              if (typeof items === 'object') {
                Object.entries(items).forEach(([itemId, qty]: [string, any]) => {
                  if (typeof qty === 'number' && qty > 0) {
                    const existing = linenItems.find(i => i.id === itemId);
                    if (existing) {
                      existing.quantity += qty;
                    } else {
                      linenItems.push({ id: itemId, name: itemId, quantity: qty });
                    }
                  }
                });
              }
            });
          }
          
          // Biancheria bagno
          if (config.ba) {
            Object.entries(config.ba).forEach(([itemId, qty]: [string, any]) => {
              if (typeof qty === 'number' && qty > 0) {
                linenItems.push({ id: itemId, name: itemId, quantity: qty });
              }
            });
          }
          
          // Kit cortesia
          if (config.ki) {
            Object.entries(config.ki).forEach(([itemId, qty]: [string, any]) => {
              if (typeof qty === 'number' && qty > 0) {
                linenItems.push({ id: itemId, name: itemId, quantity: qty });
              }
            });
          }
          
          console.log(`  📋 Usando serviceConfigs (${linenItems.length} items)`);
        }
      }
      
      // CASO 2: Logica fallback per proprietà migrate
      if (linenItems.length === 0) {
        const bedrooms = property.bedrooms || 1;
        const bathrooms = property.bathrooms || 1;
        
        // Letti
        const matrimoniali = Math.min(bedrooms, Math.ceil(guestsCount / 2));
        const singoli = Math.max(0, guestsCount - (matrimoniali * 2));
        
        if (matrimoniali > 0) {
          linenItems.push({ 
            id: 'lenzuola_matrimoniale', 
            name: 'Set Lenzuola Matrimoniale', 
            quantity: matrimoniali 
          });
        }
        if (singoli > 0) {
          linenItems.push({ 
            id: 'lenzuola_singolo', 
            name: 'Set Lenzuola Singolo', 
            quantity: singoli 
          });
        }
        
        // Asciugamani
        linenItems.push({ 
          id: 'asciugamano_grande', 
          name: 'Asciugamano Grande', 
          quantity: guestsCount 
        });
        linenItems.push({ 
          id: 'asciugamano_piccolo', 
          name: 'Asciugamano Piccolo', 
          quantity: guestsCount 
        });
        
        // Tappetini
        if (bathrooms > 0) {
          linenItems.push({ 
            id: 'tappetino_bagno', 
            name: 'Tappetino Bagno', 
            quantity: bathrooms 
          });
        }
        
        console.log(`  📋 Usando FALLBACK (${guestsCount} ospiti, ${bedrooms} camere, ${bathrooms} bagni)`);
      }
      
      // Crea ordine
      if (linenItems.length > 0) {
        if (dryRun) {
          console.log(`  🔍 DRY RUN - Creerebbe ordine con ${linenItems.length} items:`);
          linenItems.forEach(item => console.log(`     - ${item.name}: ${item.quantity}`));
          stats.ordersCreated++;
          stats.details.push({
            cleaningId: cleaning.id,
            propertyName: property.name,
            date: dateStr,
            action: 'WOULD_CREATE',
            items: linenItems
          });
        } else {
          try {
            const orderRef = await addDoc(collection(db, 'orders'), {
              cleaningId: cleaning.id,
              propertyId: property.id,
              propertyName: property.name,
              propertyAddress: property.address || '',
              propertyCity: property.city || '',
              propertyPostalCode: property.postalCode || '',
              propertyFloor: property.floor || '',
              propertyApartment: property.apartment || '',
              propertyIntercom: property.intercom || '',
              propertyDoorCode: property.doorCode || '',
              propertyKeysLocation: property.keysLocation || '',
              propertyAccessNotes: property.accessNotes || '',
              status: 'PENDING',
              type: 'LINEN',
              scheduledDate: cleaning.scheduledDate,
              scheduledTime: cleaning.scheduledTime || property.checkOutTime || '10:00',
              urgency: 'normal',
              items: linenItems,
              includePickup: true,
              pickupItems: [],
              pickupFromOrders: [],
              pickupCompleted: false,
              notes: 'Creato da script fix-missing-linen-orders',
              createdAt: Timestamp.now(),
              updatedAt: Timestamp.now(),
            });
            
            console.log(`  ✅ CREATO ordine ${orderRef.id} con ${linenItems.length} items`);
            stats.ordersCreated++;
            stats.details.push({
              cleaningId: cleaning.id,
              propertyName: property.name,
              date: dateStr,
              action: 'CREATED',
              orderId: orderRef.id,
              items: linenItems
            });
          } catch (err) {
            console.log(`  ❌ Errore creazione ordine:`, err);
            stats.errors++;
          }
        }
      } else {
        console.log(`  ⚠️ Nessun item biancheria da aggiungere`);
      }
    }
    
    // Riepilogo
    console.log(`\n${"=".repeat(60)}`);
    console.log(`📊 RIEPILOGO ${dryRun ? '(DRY RUN)' : ''}`);
    console.log(`${"=".repeat(60)}`);
    console.log(`Pulizie totali future: ${stats.totalCleanings}`);
    console.log(`Pulizie senza ordine: ${stats.cleaningsWithoutOrder}`);
    console.log(`Skip (già ha ordine): ${stats.skippedAlreadyHasOrder}`);
    console.log(`Skip (biancheria propria): ${stats.skippedUsesOwnLinen}`);
    console.log(`Ordini ${dryRun ? 'da creare' : 'creati'}: ${stats.ordersCreated}`);
    console.log(`Errori: ${stats.errors}`);
    console.log(`${"=".repeat(60)}\n`);
    
    return NextResponse.json({
      success: true,
      dryRun,
      stats,
      message: dryRun 
        ? `DRY RUN completato. ${stats.ordersCreated} ordini verrebbero creati.`
        : `Fix completato. ${stats.ordersCreated} ordini creati.`
    });
    
  } catch (error: any) {
    console.error('❌ Errore script:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message,
      stats 
    }, { status: 500 });
  }
}
