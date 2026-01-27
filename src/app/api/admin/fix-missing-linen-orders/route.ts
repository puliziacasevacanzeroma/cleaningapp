/**
 * 🔧 SCRIPT FIX - Crea ordini biancheria mancanti per pulizie esistenti
 * 
 * LOGICA CORRETTA basata su linenCalculator.ts:
 * 
 * BIANCHERIA LETTO (per ogni letto):
 * - Matrimoniale: 3 lenzuola matrimoniali + 2 federe
 * - Singolo: 3 lenzuola singole + 1 federa
 * - Divano Letto: 3 lenzuola matrimoniali + 2 federe
 * - Castello: 6 lenzuola singole + 2 federe
 * 
 * BIANCHERIA BAGNO (per ospite):
 * - Telo corpo/doccia: 1 per ospite
 * - Telo viso: 1 per ospite
 * - Telo bidet: 1 per ospite
 * - Scendi bagno: 1 per bagno
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

// ==================== LOGICA BIANCHERIA (da linenCalculator.ts) ====================

interface LinenRequirement {
  lenzuoloMatrimoniale: number;
  lenzuoloSingolo: number;
  federa: number;
}

/**
 * Calcola biancheria per tipo di letto
 * REGOLE UFFICIALI:
 * - Matrimoniale: 3 lenzuola matrimoniali + 2 federe
 * - Singolo: 3 lenzuola singole + 1 federa
 * - Divano Letto: 3 lenzuola matrimoniali + 2 federe
 * - Castello: 6 lenzuola singole + 2 federe
 */
function getLinenForBedType(bedType: string): LinenRequirement {
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
      // Default: tratta come singolo
      return { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 3, federa: 1 };
  }
}

/**
 * FALLBACK per proprietà senza letti configurati
 * Stima i letti in base a ospiti e camere, poi applica le regole corrette
 */
function calculateFallbackLinen(guestsCount: number, bedrooms: number, bathrooms: number): { id: string; name: string; quantity: number }[] {
  const items: { id: string; name: string; quantity: number }[] = [];
  
  // STIMA LETTI: assumiamo configurazione tipica
  // - 1 matrimoniale per camera (2 posti)
  // - singoli extra se ospiti > camere*2
  
  const matrimonialiNeeded = Math.min(bedrooms, Math.ceil(guestsCount / 2));
  const postiMatrimoniali = matrimonialiNeeded * 2;
  const singolariNeeded = Math.max(0, guestsCount - postiMatrimoniali);
  
  // Calcola biancheria per ogni letto stimato
  let totalLenzMatr = 0;
  let totalLenzSing = 0;
  let totalFedere = 0;
  
  // Per ogni letto matrimoniale: 3 lenzuola matr + 2 federe
  for (let i = 0; i < matrimonialiNeeded; i++) {
    const req = getLinenForBedType('matr');
    totalLenzMatr += req.lenzuoloMatrimoniale;
    totalFedere += req.federa;
  }
  
  // Per ogni letto singolo: 3 lenzuola sing + 1 federa
  for (let i = 0; i < singolariNeeded; i++) {
    const req = getLinenForBedType('sing');
    totalLenzSing += req.lenzuoloSingolo;
    totalFedere += req.federa;
  }
  
  // Aggiungi biancheria letto
  if (totalLenzMatr > 0) {
    items.push({ id: 'lenzuola_matrimoniale', name: 'Lenzuola Matrimoniale', quantity: totalLenzMatr });
  }
  if (totalLenzSing > 0) {
    items.push({ id: 'lenzuola_singolo', name: 'Lenzuola Singolo', quantity: totalLenzSing });
  }
  if (totalFedere > 0) {
    items.push({ id: 'federa', name: 'Federa', quantity: totalFedere });
  }
  
  // BIANCHERIA BAGNO (per ospite)
  items.push({ id: 'telo_doccia', name: 'Telo Doccia', quantity: guestsCount });
  items.push({ id: 'asciugamano_viso', name: 'Asciugamano Viso', quantity: guestsCount });
  items.push({ id: 'asciugamano_ospite', name: 'Asciugamano Ospite/Bidet', quantity: guestsCount });
  
  // Scendi bagno: 1 per bagno
  if (bathrooms > 0) {
    items.push({ id: 'tappetino_bagno', name: 'Tappetino Bagno', quantity: bathrooms });
  }
  
  return items;
}

// ==================== MAIN ====================

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
    
    ordersSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      if (data.cleaningId) {
        ordersByCleaningId.set(data.cleaningId, { id: docSnap.id, ...data });
      }
      if (data.propertyId && data.scheduledDate) {
        const dateStr = data.scheduledDate.toDate().toISOString().split('T')[0];
        const key = `${data.propertyId}_${dateStr}`;
        ordersByPropertyAndDate.set(key, { id: docSnap.id, ...data });
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
      
      // Controlla se ha già un ordine
      const existingOrderById = ordersByCleaningId.get(cleaning.id);
      const existingOrderByDate = ordersByPropertyAndDate.get(`${cleaning.propertyId}_${dateStr}`);
      
      if (existingOrderById || existingOrderByDate) {
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
        console.log(`  ❌ Proprietà non trovata: ${cleaning.propertyId}`);
        stats.errors++;
        continue;
      }
      
      // Controlla usesOwnLinen
      if (property.usesOwnLinen === true) {
        stats.skippedUsesOwnLinen++;
        continue;
      }
      
      // Prepara items biancheria
      const guestsCount = cleaning.guestsCount || property.maxGuests || 2;
      let linenItems: { id: string; name: string; quantity: number }[] = [];
      let usedMethod = '';
      
      // CASO 1: Ha serviceConfigs configurati → usa quelli
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
          
          usedMethod = 'serviceConfigs';
        }
      }
      
      // CASO 2: Logica fallback CORRETTA basata su linenCalculator.ts
      if (linenItems.length === 0) {
        const bedrooms = property.bedrooms || 1;
        const bathrooms = property.bathrooms || 1;
        
        linenItems = calculateFallbackLinen(guestsCount, bedrooms, bathrooms);
        usedMethod = `fallback (${guestsCount} ospiti, ${bedrooms} camere, ${bathrooms} bagni)`;
      }
      
      // Crea ordine
      if (linenItems.length > 0) {
        if (dryRun) {
          stats.ordersCreated++;
          stats.details.push({
            cleaningId: cleaning.id,
            propertyName: property.name,
            date: dateStr,
            action: 'WOULD_CREATE',
            method: usedMethod,
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
              notes: `Creato da fix-missing-linen-orders (${usedMethod})`,
              createdAt: Timestamp.now(),
              updatedAt: Timestamp.now(),
            });
            
            console.log(`  ✅ CREATO ordine ${orderRef.id} per ${property.name}`);
            stats.ordersCreated++;
            stats.details.push({
              cleaningId: cleaning.id,
              propertyName: property.name,
              date: dateStr,
              action: 'CREATED',
              orderId: orderRef.id,
              method: usedMethod,
              items: linenItems
            });
          } catch (err) {
            console.log(`  ❌ Errore creazione ordine:`, err);
            stats.errors++;
          }
        }
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
