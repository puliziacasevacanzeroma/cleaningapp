import { NextResponse } from "next/server";
import { 
  collection, 
  getDocs, 
  doc, 
  deleteDoc, 
  updateDoc, 
  addDoc, 
  query, 
  where, 
  Timestamp 
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";

/**
 * 🔧 API FIX-ALL: Risolve tutti i problemi del database
 * 
 * 1. Elimina pulizie orfane (propertyId non esiste)
 * 2. Rimuove duplicati (tiene la più recente)
 * 3. Pulisce ordini orfani (rimuove cleaningId invalido)
 * 4. Crea ordini mancanti (per pulizie senza ordine)
 * 
 * Parametri:
 * - dryRun: se true, mostra solo cosa farebbe senza modificare (default: true per sicurezza)
 */

// Funzione per calcolare biancheria fallback
function calculateFallbackLinen(guestsCount: number, bedrooms: number, bathrooms: number): { id: string; name: string; quantity: number }[] {
  const items: { id: string; name: string; quantity: number }[] = [];
  
  const matrimonialiNeeded = Math.min(bedrooms, Math.ceil(guestsCount / 2));
  const postiMatrimoniali = matrimonialiNeeded * 2;
  const singolariNeeded = Math.max(0, guestsCount - postiMatrimoniali);
  
  let totalLenzMatr = matrimonialiNeeded * 3;
  let totalLenzSing = singolariNeeded * 3;
  let totalFedere = (matrimonialiNeeded * 2) + (singolariNeeded * 1);
  
  if (totalLenzMatr > 0) {
    items.push({ id: 'lenzuola_matrimoniale', name: 'Lenzuola Matrimoniale', quantity: totalLenzMatr });
  }
  if (totalLenzSing > 0) {
    items.push({ id: 'lenzuola_singolo', name: 'Lenzuola Singolo', quantity: totalLenzSing });
  }
  if (totalFedere > 0) {
    items.push({ id: 'federa', name: 'Federa', quantity: totalFedere });
  }
  
  items.push({ id: 'telo_doccia', name: 'Telo Doccia', quantity: guestsCount });
  items.push({ id: 'asciugamano_viso', name: 'Asciugamano Viso', quantity: guestsCount });
  items.push({ id: 'asciugamano_ospite', name: 'Asciugamano Ospite/Bidet', quantity: guestsCount });
  
  if (bathrooms > 0) {
    items.push({ id: 'tappetino_bagno', name: 'Tappetino Bagno', quantity: bathrooms });
  }
  
  return items;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get('dryRun') !== 'false'; // Default TRUE per sicurezza
  
  return handleFixAll(dryRun);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const dryRun = body.dryRun !== false; // Default TRUE per sicurezza
  
  return handleFixAll(dryRun);
}

async function handleFixAll(dryRun: boolean) {
  const startTime = Date.now();
  
  console.log("\n" + "=".repeat(80));
  console.log(`🔧 FIX-ALL: Risoluzione completa problemi database`);
  console.log(`   Mode: ${dryRun ? '🔍 DRY RUN (simulazione)' : '⚡ ESECUZIONE REALE'}`);
  console.log("=".repeat(80) + "\n");

  const results = {
    dryRun,
    orphanCleanings: { found: 0, deleted: 0, ids: [] as string[] },
    duplicateCleanings: { found: 0, deleted: 0, details: [] as any[] },
    orphanOrders: { found: 0, fixed: 0, ids: [] as string[] },
    missingOrders: { found: 0, created: 0, details: [] as any[] },
    errors: [] as string[],
  };

  try {
    // ═══════════════════════════════════════════════════════════
    // STEP 0: Carica tutti i dati
    // ═══════════════════════════════════════════════════════════
    console.log("📥 Caricamento dati...");
    
    const [propertiesSnap, cleaningsSnap, ordersSnap] = await Promise.all([
      getDocs(collection(db, "properties")),
      getDocs(collection(db, "cleanings")),
      getDocs(collection(db, "orders")),
    ]);

    // Mappa proprietà
    const propertiesMap = new Map<string, any>();
    const activePropertyIds = new Set<string>();
    const propertiesWithOwnLinen = new Set<string>();
    
    propertiesSnap.docs.forEach(d => {
      const data = { id: d.id, ...d.data() };
      propertiesMap.set(d.id, data);
      if (data.status === "ACTIVE") {
        activePropertyIds.add(d.id);
      }
      if (data.usesOwnLinen) {
        propertiesWithOwnLinen.add(d.id);
      }
    });

    // Array pulizie
    const allCleanings = cleaningsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const cleaningIds = new Set(allCleanings.map(c => c.id));

    // Array ordini
    const allOrders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    console.log(`   📋 Proprietà: ${propertiesMap.size} (${activePropertyIds.size} attive)`);
    console.log(`   🧹 Pulizie: ${allCleanings.length}`);
    console.log(`   📦 Ordini: ${allOrders.length}`);

    // ═══════════════════════════════════════════════════════════
    // STEP 1: Elimina pulizie orfane
    // ═══════════════════════════════════════════════════════════
    console.log("\n" + "─".repeat(60));
    console.log("🗑️  STEP 1: Pulizie orfane (propertyId non esiste)");
    console.log("─".repeat(60));

    const orphanCleanings = allCleanings.filter(c => {
      if (!c.propertyId) return true;
      return !propertiesMap.has(c.propertyId);
    });

    results.orphanCleanings.found = orphanCleanings.length;
    results.orphanCleanings.ids = orphanCleanings.map(c => c.id);

    console.log(`   Trovate: ${orphanCleanings.length} pulizie orfane`);

    for (const cleaning of orphanCleanings) {
      try {
        if (!dryRun) {
          await deleteDoc(doc(db, "cleanings", cleaning.id));
        }
        results.orphanCleanings.deleted++;
        console.log(`   ${dryRun ? '🔍' : '✅'} ${cleaning.propertyName || 'N/A'} (${cleaning.id})`);
      } catch (e: any) {
        results.errors.push(`Errore eliminazione pulizia orfana ${cleaning.id}: ${e.message}`);
      }
    }

    // Aggiorna set pulizie valide (escluse orfane)
    const validCleaningIds = new Set(
      allCleanings
        .filter(c => c.propertyId && propertiesMap.has(c.propertyId))
        .map(c => c.id)
    );

    // ═══════════════════════════════════════════════════════════
    // STEP 2: Rimuovi duplicati (tieni la più recente)
    // ═══════════════════════════════════════════════════════════
    console.log("\n" + "─".repeat(60));
    console.log("🔄 STEP 2: Pulizie duplicate (stessa proprietà/data)");
    console.log("─".repeat(60));

    // Raggruppa pulizie per proprietà-data
    const cleaningsByPropertyDate = new Map<string, any[]>();
    
    allCleanings.forEach(c => {
      // Salta le orfane già eliminate
      if (!c.propertyId || !propertiesMap.has(c.propertyId)) return;
      
      const scheduledDate = c.scheduledDate?.toDate?.();
      if (!scheduledDate) return;
      
      const dateStr = scheduledDate.toISOString().split("T")[0];
      const key = `${c.propertyId}|${dateStr}`;
      
      if (!cleaningsByPropertyDate.has(key)) {
        cleaningsByPropertyDate.set(key, []);
      }
      cleaningsByPropertyDate.get(key)!.push(c);
    });

    // Trova duplicati
    let totalDuplicatesFound = 0;
    let totalDuplicatesDeleted = 0;

    for (const [key, cleanings] of cleaningsByPropertyDate) {
      if (cleanings.length <= 1) continue;

      const [propertyId, dateStr] = key.split("|");
      const property = propertiesMap.get(propertyId);
      
      // Ordina per createdAt DESC (più recente prima)
      cleanings.sort((a, b) => {
        const timeA = a.createdAt?.toDate?.()?.getTime() || 0;
        const timeB = b.createdAt?.toDate?.()?.getTime() || 0;
        return timeB - timeA;
      });

      // Tieni la prima (più recente), elimina le altre
      const toKeep = cleanings[0];
      const toDelete = cleanings.slice(1);

      totalDuplicatesFound += toDelete.length;

      results.duplicateCleanings.details.push({
        propertyName: property?.name || propertyId,
        date: dateStr,
        kept: toKeep.id,
        deleted: toDelete.map(c => c.id),
      });

      console.log(`   📍 ${property?.name || propertyId} (${dateStr}): ${cleanings.length} pulizie`);
      console.log(`      ✅ Tengo: ${toKeep.id} (creata: ${toKeep.createdAt?.toDate?.()?.toLocaleString() || 'N/A'})`);

      for (const cleaning of toDelete) {
        try {
          if (!dryRun) {
            await deleteDoc(doc(db, "cleanings", cleaning.id));
            // Rimuovi dalla lista valide
            validCleaningIds.delete(cleaning.id);
          }
          totalDuplicatesDeleted++;
          console.log(`      ${dryRun ? '🔍' : '🗑️'} Elimino: ${cleaning.id}`);
        } catch (e: any) {
          results.errors.push(`Errore eliminazione duplicato ${cleaning.id}: ${e.message}`);
        }
      }
    }

    results.duplicateCleanings.found = totalDuplicatesFound;
    results.duplicateCleanings.deleted = totalDuplicatesDeleted;

    console.log(`   Totale duplicati: ${totalDuplicatesFound} (eliminati: ${totalDuplicatesDeleted})`);

    // ═══════════════════════════════════════════════════════════
    // STEP 3: Pulisci ordini orfani
    // ═══════════════════════════════════════════════════════════
    console.log("\n" + "─".repeat(60));
    console.log("👻 STEP 3: Ordini orfani (cleaningId non valido)");
    console.log("─".repeat(60));

    const orphanOrders = allOrders.filter(o => {
      if (!o.cleaningId) return false; // Non ha cleaningId, ok
      return !validCleaningIds.has(o.cleaningId); // cleaningId non esiste
    });

    results.orphanOrders.found = orphanOrders.length;
    results.orphanOrders.ids = orphanOrders.map(o => o.id);

    console.log(`   Trovati: ${orphanOrders.length} ordini con cleaningId non valido`);

    for (const order of orphanOrders) {
      try {
        if (!dryRun) {
          // Rimuovi solo cleaningId, l'ordine resta valido
          await updateDoc(doc(db, "orders", order.id), {
            cleaningId: null,
            updatedAt: Timestamp.now(),
            notes: (order.notes || '') + '\n[cleaningId rimosso - pulizia non esistente]',
          });
        }
        results.orphanOrders.fixed++;
        console.log(`   ${dryRun ? '🔍' : '✅'} ${order.propertyName || 'N/A'} (${order.id}) - cleaningId: ${order.cleaningId}`);
      } catch (e: any) {
        results.errors.push(`Errore fix ordine orfano ${order.id}: ${e.message}`);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // STEP 4: Crea ordini mancanti
    // ═══════════════════════════════════════════════════════════
    console.log("\n" + "─".repeat(60));
    console.log("📦 STEP 4: Ordini mancanti (pulizie senza ordine)");
    console.log("─".repeat(60));

    // Mappa ordini per cleaningId e per proprietà-data
    const ordersByCleaningId = new Map<string, any>();
    const ordersByPropertyDate = new Map<string, any>();
    
    allOrders.forEach(o => {
      if (o.cleaningId) {
        ordersByCleaningId.set(o.cleaningId, o);
      }
      const scheduledDate = o.scheduledDate?.toDate?.();
      if (scheduledDate && o.propertyId) {
        const dateStr = scheduledDate.toISOString().split("T")[0];
        ordersByPropertyDate.set(`${o.propertyId}|${dateStr}`, o);
      }
    });

    // Trova pulizie senza ordini (ultimi 30 giorni + futuro)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const cleaningsNeedingOrders = allCleanings.filter(c => {
      // Deve essere una pulizia valida
      if (!c.propertyId || !propertiesMap.has(c.propertyId)) return false;
      if (!validCleaningIds.has(c.id)) return false;
      
      // La proprietà non deve usare biancheria propria
      if (propertiesWithOwnLinen.has(c.propertyId)) return false;
      
      // Deve essere negli ultimi 30 giorni o futuro
      const scheduledDate = c.scheduledDate?.toDate?.();
      if (!scheduledDate || scheduledDate < thirtyDaysAgo) return false;
      
      // Non deve avere già un ordine
      if (ordersByCleaningId.has(c.id)) return false;
      
      const dateStr = scheduledDate.toISOString().split("T")[0];
      if (ordersByPropertyDate.has(`${c.propertyId}|${dateStr}`)) return false;
      
      return true;
    });

    results.missingOrders.found = cleaningsNeedingOrders.length;

    console.log(`   Trovate: ${cleaningsNeedingOrders.length} pulizie senza ordine`);

    for (const cleaning of cleaningsNeedingOrders) {
      try {
        const property = propertiesMap.get(cleaning.propertyId);
        if (!property) continue;
        
        const guestsCount = cleaning.guestsCount || property.maxGuests || 2;
        const bedrooms = property.bedrooms || 1;
        const bathrooms = property.bathrooms || 1;
        
        // Calcola biancheria
        let linenItems: { id: string; name: string; quantity: number }[] = [];
        
        if (property.serviceConfigs && property.serviceConfigs[guestsCount]) {
          const config = property.serviceConfigs[guestsCount];
          
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
        }
        
        if (linenItems.length === 0) {
          linenItems = calculateFallbackLinen(guestsCount, bedrooms, bathrooms);
        }
        
        if (linenItems.length === 0) continue;

        const scheduledDate = cleaning.scheduledDate?.toDate?.();
        const dateStr = scheduledDate?.toISOString().split("T")[0] || 'N/A';

        if (!dryRun) {
          await addDoc(collection(db, 'orders'), {
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
            notes: 'Creato automaticamente da fix-all',
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          });
        }

        results.missingOrders.created++;
        results.missingOrders.details.push({
          cleaningId: cleaning.id,
          propertyName: property.name,
          date: dateStr,
          itemsCount: linenItems.length,
        });

        console.log(`   ${dryRun ? '🔍' : '✅'} ${property.name} (${dateStr}) - ${linenItems.length} articoli`);

      } catch (e: any) {
        results.errors.push(`Errore creazione ordine per ${cleaning.id}: ${e.message}`);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // RIEPILOGO FINALE
    // ═══════════════════════════════════════════════════════════
    const duration = Date.now() - startTime;

    console.log("\n" + "=".repeat(80));
    console.log(`✅ FIX-ALL COMPLETATO ${dryRun ? '(DRY RUN)' : ''}`);
    console.log("=".repeat(80));
    console.log(`   ⏱️  Durata: ${(duration / 1000).toFixed(1)}s`);
    console.log(`   🗑️  Pulizie orfane eliminate: ${results.orphanCleanings.deleted}/${results.orphanCleanings.found}`);
    console.log(`   🔄 Duplicati eliminati: ${results.duplicateCleanings.deleted}/${results.duplicateCleanings.found}`);
    console.log(`   👻 Ordini orfani fixati: ${results.orphanOrders.fixed}/${results.orphanOrders.found}`);
    console.log(`   📦 Ordini creati: ${results.missingOrders.created}/${results.missingOrders.found}`);
    console.log(`   ❌ Errori: ${results.errors.length}`);
    console.log("=".repeat(80) + "\n");

    return NextResponse.json({
      success: true,
      dryRun,
      duration: `${(duration / 1000).toFixed(1)}s`,
      summary: {
        orphanCleanings: `${results.orphanCleanings.deleted}/${results.orphanCleanings.found}`,
        duplicateCleanings: `${results.duplicateCleanings.deleted}/${results.duplicateCleanings.found}`,
        orphanOrders: `${results.orphanOrders.fixed}/${results.orphanOrders.found}`,
        missingOrders: `${results.missingOrders.created}/${results.missingOrders.found}`,
        errors: results.errors.length,
      },
      details: results,
    });

  } catch (error: any) {
    console.error("❌ Errore FIX-ALL:", error);
    return NextResponse.json({
      success: false,
      error: error.message || "Errore sconosciuto",
      details: results,
    }, { status: 500 });
  }
}
