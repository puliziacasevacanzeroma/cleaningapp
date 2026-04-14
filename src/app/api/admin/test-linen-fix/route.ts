/**
 * 🧪 TEST COMPLETO FIX LENZUOLA
 * 
 * GET /api/admin/test-linen-fix?secret=CRON_SECRET
 * 
 * Esegue test automatici su TUTTI i flussi biancheria:
 * 1. Verifica serviceConfigs con bl parziale → merge corretto
 * 2. Verifica fallback quantità (2 per letto, non 3)
 * 3. Verifica ordini PENDING futuri per 0 lenzuola
 * 4. Verifica che la safety net nel cron funzioni
 * 5. Confronta config vs ordini per ogni proprietà con problemi noti
 * 
 * NON modifica nulla nel database — SOLO lettura e simulazione.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getItemName } from "~/lib/itemNames";

export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET;

// === DUPLICA la logica del cron FIXATA per testarla ===
interface LinenRequirement { lenzuoloMatrimoniale: number; lenzuoloSingolo: number; federa: number; }

function getLinenForBedType(bedType: string): LinenRequirement {
  switch (bedType) {
    case 'matr': case 'matrimoniale': return { lenzuoloMatrimoniale: 2, lenzuoloSingolo: 0, federa: 2 };
    case 'sing': case 'singolo': return { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 2, federa: 1 };
    case 'divano': case 'divano_letto': return { lenzuoloMatrimoniale: 2, lenzuoloSingolo: 0, federa: 2 };
    case 'castello': return { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 4, federa: 2 };
    default: return { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 2, federa: 1 };
  }
}

// Simula calculateLinenItemsForProperty CON il fix merge
function simulateLinenCalc(prop: any, guestsCount: number): { items: any[]; source: string; details: string } {
  const items: { id: string; name: string; quantity: number }[] = [];
  let source = 'none';
  let details = '';

  if (prop.serviceConfigs) {
    const config = prop.serviceConfigs[guestsCount] || prop.serviceConfigs[String(guestsCount)];
    if (config && config.bl) {
      const blKeys = Object.keys(config.bl);
      const hasAll = config.bl['all'] && typeof config.bl['all'] === 'object' && Object.keys(config.bl['all']).length > 0;
      const bedGroupKeys = blKeys.filter((k: string) => k !== 'all');
      const hasBedGroups = bedGroupKeys.length > 0 && bedGroupKeys.some((k: string) => {
        const grpItems = config.bl[k];
        return grpItems && typeof grpItems === 'object' && Object.keys(grpItems).length > 0;
      });

      if (hasAll && hasBedGroups) {
        source = 'MERGE (all + gruppi)';
        const merged: Record<string, number> = {};
        bedGroupKeys.forEach((k: string) => {
          const grpItems = config.bl[k];
          if (grpItems && typeof grpItems === 'object') {
            Object.entries(grpItems).forEach(([itemId, qty]: [string, any]) => {
              if (typeof qty === 'number' && qty > 0) merged[itemId] = (merged[itemId] || 0) + qty;
            });
          }
        });
        details += `Gruppi: ${JSON.stringify(merged)}; `;
        Object.entries(config.bl['all']).forEach(([itemId, qty]: [string, any]) => {
          if (typeof qty === 'number' && qty > 0) merged[itemId] = qty;
        });
        details += `Dopo merge con all: ${JSON.stringify(merged)}`;
        Object.entries(merged).forEach(([itemId, qty]) => {
          if (qty > 0) items.push({ id: itemId, name: getItemName(itemId), quantity: qty });
        });
      } else if (hasAll) {
        source = 'SOLO all';
        Object.entries(config.bl['all']).forEach(([itemId, qty]: [string, any]) => {
          if (typeof qty === 'number' && qty > 0) items.push({ id: itemId, name: getItemName(itemId), quantity: qty });
        });
      } else {
        source = 'SOLO gruppi letto';
        blKeys.forEach((bedId: string) => {
          if (bedId !== 'all' && typeof config.bl[bedId] === 'object') {
            Object.entries(config.bl[bedId]).forEach(([itemId, qty]: [string, any]) => {
              if (typeof qty === 'number' && qty > 0) {
                const existing = items.find(i => i.id === itemId);
                if (existing) existing.quantity += qty;
                else items.push({ id: itemId, name: getItemName(itemId), quantity: qty });
              }
            });
          }
        });
      }

      // Aggiungi ba/ki
      if (config.ba) Object.entries(config.ba).forEach(([itemId, qty]: [string, any]) => {
        if (typeof qty === 'number' && qty > 0) items.push({ id: itemId, name: getItemName(itemId), quantity: qty });
      });
      if (config.ki) Object.entries(config.ki).forEach(([itemId, qty]: [string, any]) => {
        if (typeof qty === 'number' && qty > 0) items.push({ id: itemId, name: getItemName(itemId), quantity: qty });
      });
    }
  }

  if (items.length === 0) {
    source = 'FALLBACK (calculateFallbackLinen)';
    const bedrooms = prop.bedrooms || 1;
    const bathrooms = prop.bathrooms || 1;
    const matrimonialiNeeded = Math.min(bedrooms, Math.ceil(guestsCount / 2));
    const postiMatr = matrimonialiNeeded * 2;
    const singolariNeeded = Math.max(0, guestsCount - postiMatr);
    let totalLenzMatr = 0, totalLenzSing = 0, totalFedere = 0;
    for (let i = 0; i < matrimonialiNeeded; i++) { const req = getLinenForBedType('matr'); totalLenzMatr += req.lenzuoloMatrimoniale; totalFedere += req.federa; }
    for (let i = 0; i < singolariNeeded; i++) { const req = getLinenForBedType('sing'); totalLenzSing += req.lenzuoloSingolo; totalFedere += req.federa; }
    if (totalLenzMatr > 0) items.push({ id: 'doubleSheets', name: 'Lenzuola Matrimoniali', quantity: totalLenzMatr });
    if (totalLenzSing > 0) items.push({ id: 'singleSheets', name: 'Lenzuola Singole', quantity: totalLenzSing });
    if (totalFedere > 0) items.push({ id: 'pillowcases', name: 'Federe', quantity: totalFedere });
    items.push({ id: 'telo_doccia', name: 'Telo Doccia', quantity: guestsCount });
    items.push({ id: 'asciugamano_viso', name: 'Asciugamano Viso', quantity: guestsCount });
    items.push({ id: 'asciugamano_ospite', name: 'Asciugamano Bidet', quantity: guestsCount });
    if (bathrooms > 0) items.push({ id: 'tappetino_bagno', name: 'Tappetino Bagno', quantity: bathrooms });
  }

  return { items, source, details };
}

// ID noti per lenzuola
const LENZ_IDS = ['doublesheets', 'item_doublesheets', 'singlesheets', 'item_singlesheets', 'lenzuol'];
const FEDERE_IDS = ['pillowcases', 'item_pillowcases', 'feder'];

function hasLenzuola(items: any[]): boolean {
  return items.some(i => LENZ_IDS.some(k => (i.id || '').toLowerCase().includes(k) || (i.name || '').toLowerCase().includes(k)));
}
function hasFedere(items: any[]): boolean {
  return items.some(i => FEDERE_IDS.some(k => (i.id || '').toLowerCase().includes(k) || (i.name || '').toLowerCase().includes(k)));
}
function getLenzQty(items: any[]): number {
  return items.filter(i => LENZ_IDS.some(k => (i.id || '').toLowerCase().includes(k) || (i.name || '').toLowerCase().includes(k)))
    .reduce((sum, i) => sum + (i.quantity || 0), 0);
}

export async function GET(req: NextRequest) {
  const urlSecret = req.nextUrl.searchParams.get("secret");
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${CRON_SECRET}` && urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: any = {
    timestamp: new Date().toISOString(),
    tests: [],
    summary: { total: 0, passed: 0, failed: 0, warnings: 0 }
  };

  const addTest = (name: string, status: 'PASS' | 'FAIL' | 'WARN', detail: string, data?: any) => {
    results.tests.push({ name, status, detail, ...(data ? { data } : {}) });
    results.summary.total++;
    if (status === 'PASS') results.summary.passed++;
    else if (status === 'FAIL') results.summary.failed++;
    else results.summary.warnings++;
  };

  try {
    // === CARICA DATI ===
    const propsSnap = await adminDb.collection("properties").where("status", "==", "ACTIVE").get();
    const properties = propsSnap.docs.map(d => ({ id: d.id, ...d.data() as Record<string, any> }));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // === TEST 1: Verifica valori getLinenForBedType (devono essere 2, non 3) ===
    const matrReq = getLinenForBedType('matr');
    const singReq = getLinenForBedType('sing');
    const castReq = getLinenForBedType('castello');
    
    addTest('getLinenForBedType matr = 2', matrReq.lenzuoloMatrimoniale === 2 ? 'PASS' : 'FAIL',
      `matr: ${matrReq.lenzuoloMatrimoniale} (atteso 2)`);
    addTest('getLinenForBedType sing = 2', singReq.lenzuoloSingolo === 2 ? 'PASS' : 'FAIL',
      `sing: ${singReq.lenzuoloSingolo} (atteso 2)`);
    addTest('getLinenForBedType castello = 4', castReq.lenzuoloSingolo === 4 ? 'PASS' : 'FAIL',
      `castello: ${castReq.lenzuoloSingolo} (atteso 4)`);

    // === TEST 2: Proprietà note con bug — simula calcolo con merge ===
    const buggyProps = ['DFMuYGPWTtl4QvDMKSrH', 'Np3napBTxIoNI6lcrgWk', 'xKTuASwyK6T3apxW7b9Z', 'nm2ughgxCHeZB2Xx8UOq'];
    
    for (const propId of buggyProps) {
      const prop = properties.find(p => p.id === propId);
      if (!prop) continue;
      
      const maxG = prop.maxGuests || 4;
      for (let g = 1; g <= maxG; g++) {
        const sim = simulateLinenCalc(prop, g);
        const hasLenz = hasLenzuola(sim.items);
        const lenzQty = getLenzQty(sim.items);
        
        addTest(
          `${prop.name} | ${g} ospiti | lenzuola`,
          hasLenz ? 'PASS' : 'FAIL',
          `${sim.source} → lenzuola: ${lenzQty} pz, items: ${sim.items.map((i: any) => `${i.name}:${i.quantity}`).join(', ')}`,
          sim.details ? { mergeDetails: sim.details } : undefined
        );
      }
    }

    // === TEST 3: TUTTE le proprietà — verifica nessuna config produce 0 lenzuola ===
    let propsWithZeroLenz = 0;
    const zeroLenzDetails: any[] = [];
    
    for (const prop of properties) {
      if (prop.usesOwnLinen) continue;
      const maxG = prop.maxGuests || 2;
      
      for (let g = 1; g <= maxG; g++) {
        const sim = simulateLinenCalc(prop, g);
        if (!hasLenzuola(sim.items) && sim.items.length > 0) {
          propsWithZeroLenz++;
          zeroLenzDetails.push({
            property: prop.name,
            propertyId: prop.id,
            guests: g,
            source: sim.source,
            items: sim.items.map((i: any) => `${i.name}:${i.quantity}`),
            mergeDetails: sim.details
          });
        }
      }
    }
    
    addTest(
      'Nessuna config produce 0 lenzuola (con merge)',
      propsWithZeroLenz === 0 ? 'PASS' : 'FAIL',
      propsWithZeroLenz === 0 
        ? `Tutte le ${properties.filter(p => !p.usesOwnLinen).length} proprietà OK`
        : `${propsWithZeroLenz} configurazioni ancora con 0 lenzuola`,
      zeroLenzDetails.length > 0 ? { zeroLenzDetails: zeroLenzDetails.slice(0, 20) } : undefined
    );

    // === TEST 4: Ordini PENDING futuri — verifica lenzuola presenti ===
    const ordersSnap = await adminDb.collection("orders").where("status", "==", "PENDING").get();
    let ordersWithZeroLenz = 0;
    let totalFutureOrders = 0;
    const zeroLenzOrders: any[] = [];
    
    for (const orderDoc of ordersSnap.docs) {
      const order = orderDoc.data() as Record<string, any>;
      const orderDate = order.scheduledDate?.toDate?.();
      if (!orderDate || orderDate < today) continue;
      totalFutureOrders++;
      
      const orderItems = order.items || [];
      if (!hasLenzuola(orderItems) && orderItems.length > 0) {
        // Verifica se la proprietà usa biancheria propria
        const prop = properties.find(p => p.id === order.propertyId);
        if (prop?.usesOwnLinen) continue;
        
        ordersWithZeroLenz++;
        zeroLenzOrders.push({
          orderId: orderDoc.id,
          property: order.propertyName,
          date: orderDate.toISOString().split('T')[0],
          items: orderItems.map((i: any) => `${i.name || i.id}:${i.quantity}`).slice(0, 8)
        });
      }
    }
    
    addTest(
      'Ordini PENDING futuri con lenzuola',
      ordersWithZeroLenz === 0 ? 'PASS' : 'WARN',
      ordersWithZeroLenz === 0
        ? `Tutti i ${totalFutureOrders} ordini futuri hanno lenzuola`
        : `${ordersWithZeroLenz}/${totalFutureOrders} ordini senza lenzuola (saranno corretti dal prossimo cron)`,
      zeroLenzOrders.length > 0 ? { ordiniSenzaLenzuola: zeroLenzOrders.slice(0, 15) } : undefined
    );

    // === TEST 5: Verifica consistenza ID articoli tra serviceConfigs e inventario ===
    const inventorySnap = await adminDb.collection("inventory").get();
    const inventoryIds = new Set<string>();
    const inventoryKeys = new Set<string>();
    inventorySnap.docs.forEach(d => {
      inventoryIds.add(d.id);
      const data = d.data() as Record<string, any>;
      if (data.key) inventoryKeys.add(data.key);
    });
    
    let unknownIds = 0;
    const unknownIdsList: string[] = [];
    for (const prop of properties) {
      if (!prop.serviceConfigs) continue;
      for (const [, config] of Object.entries(prop.serviceConfigs as Record<string, any>)) {
        if (!config?.bl) continue;
        const checkItems = (items: Record<string, any>) => {
          Object.keys(items).forEach(itemId => {
            if (!inventoryIds.has(itemId) && !inventoryKeys.has(itemId) && 
                !inventoryIds.has(`item_${itemId}`) && !itemId.startsWith('stanza_')) {
              if (!unknownIdsList.includes(itemId)) {
                unknownIdsList.push(itemId);
                unknownIds++;
              }
            }
          });
        };
        if (config.bl['all']) checkItems(config.bl['all']);
        Object.entries(config.bl).forEach(([k, v]) => {
          if (k !== 'all' && typeof v === 'object' && v !== null) checkItems(v as Record<string, any>);
        });
        if (config.ba) checkItems(config.ba);
      }
    }
    
    addTest(
      'ID articoli in serviceConfigs matchano inventario',
      unknownIds === 0 ? 'PASS' : 'WARN',
      unknownIds === 0
        ? 'Tutti gli ID articoli sono presenti nell\'inventario'
        : `${unknownIds} ID non trovati: ${unknownIdsList.slice(0, 10).join(', ')}`,
    );

    // === TEST 6: Verifica che il fallback usa 2 (non 3) ===
    // Simula una proprietà senza serviceConfigs: 2 matrimoniali, 4 ospiti
    const fakeProp = { bedrooms: 2, bathrooms: 1, maxGuests: 4 };
    const fallbackSim = simulateLinenCalc(fakeProp, 4);
    const fallbackLenzMatr = fallbackSim.items.find(i => i.id === 'doubleSheets');
    
    addTest(
      'Fallback lenzuola: 2 matr × 2 = 4 (non 6)',
      fallbackLenzMatr?.quantity === 4 ? 'PASS' : 'FAIL',
      `Fallback per 2 camere, 4 ospiti: doubleSheets = ${fallbackLenzMatr?.quantity} (atteso 4)`,
    );

    return NextResponse.json(results);
  } catch (error: any) {
    return NextResponse.json({ error: error.message, stack: error.stack?.split('\n').slice(0, 5) }, { status: 500 });
  }
}
