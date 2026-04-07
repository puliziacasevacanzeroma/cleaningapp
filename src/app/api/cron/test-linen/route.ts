/**
 * GET /api/test/linen-safety?secret=XXXX
 * 
 * Test COMPLETO del sistema biancheria contro dati REALI di Firestore.
 * Verifica che nessuna proprietà possa generare ordini senza lenzuola.
 * 
 * NON modifica nulla — solo lettura.
 * Rimuovere dopo la verifica.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getItemName } from "~/lib/itemNames";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET;

// ═══════════════════════════════════════════════════════════════
// REPLICA ESATTA delle funzioni dal cron sync-ical (con safety net)
// ═══════════════════════════════════════════════════════════════

interface LinenRequirement { lenzuoloMatrimoniale: number; lenzuoloSingolo: number; federa: number; }

function getLinenForBedType(bedType: string): LinenRequirement {
  switch (bedType) {
    case 'matr': case 'matrimoniale': return { lenzuoloMatrimoniale: 3, lenzuoloSingolo: 0, federa: 2 };
    case 'sing': case 'singolo': return { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 3, federa: 1 };
    case 'divano': case 'divano_letto': return { lenzuoloMatrimoniale: 3, lenzuoloSingolo: 0, federa: 2 };
    case 'castello': return { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 6, federa: 2 };
    default: return { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 3, federa: 1 };
  }
}

function calculateFallbackLinen(guestsCount: number, bedrooms: number, bathrooms: number) {
  const items: { id: string; name: string; quantity: number }[] = [];
  const matrimonialiNeeded = Math.min(bedrooms, Math.ceil(guestsCount / 2));
  const postiMatrimoniali = matrimonialiNeeded * 2;
  const singolariNeeded = Math.max(0, guestsCount - postiMatrimoniali);
  let totalLenzMatr = 0, totalLenzSing = 0, totalFedere = 0;
  for (let i = 0; i < matrimonialiNeeded; i++) { const r = getLinenForBedType('matr'); totalLenzMatr += r.lenzuoloMatrimoniale; totalFedere += r.federa; }
  for (let i = 0; i < singolariNeeded; i++) { const r = getLinenForBedType('sing'); totalLenzSing += r.lenzuoloSingolo; totalFedere += r.federa; }
  if (totalLenzMatr > 0) items.push({ id: 'doubleSheets', name: 'Lenzuola Matrimoniali', quantity: totalLenzMatr });
  if (totalLenzSing > 0) items.push({ id: 'singleSheets', name: 'Lenzuola Singole', quantity: totalLenzSing });
  if (totalFedere > 0) items.push({ id: 'pillowcases', name: 'Federe', quantity: totalFedere });
  items.push({ id: 'telo_doccia', name: 'Telo Doccia', quantity: guestsCount });
  items.push({ id: 'asciugamano_viso', name: 'Asciugamano Viso', quantity: guestsCount });
  items.push({ id: 'asciugamano_ospite', name: 'Asciugamano Ospite/Bidet', quantity: guestsCount });
  if (bathrooms > 0) items.push({ id: 'tappetino_bagno', name: 'Tappetino Bagno', quantity: bathrooms });
  return items;
}

const LENZUOLA_MATR_IDS = ['doubleSheets', 'item_doubleSheets', 'lenzuola_matrimoniale'];
const LENZUOLA_SING_IDS = ['singleSheets', 'item_singleSheets', 'lenzuola_singolo'];
const FEDERE_IDS = ['pillowcases', 'item_pillowcases', 'federa'];

function hasItemByIds(items: { id: string }[], knownIds: string[]): boolean {
  return items.some(i => knownIds.includes(i.id) || knownIds.some(k => i.id.toLowerCase().includes(k.toLowerCase())));
}

function calculateLinenItemsForProperty(prop: any, guestsCount: number) {
  let linenItems: { id: string; name: string; quantity: number }[] = [];
  if (prop.serviceConfigs) {
    const config = prop.serviceConfigs[guestsCount] || prop.serviceConfigs[String(guestsCount)];
    if (config) {
      if (config.bl) {
        const hasAll = config.bl['all'] && typeof config.bl['all'] === 'object' && Object.keys(config.bl['all']).length > 0;
        if (hasAll) {
          Object.entries(config.bl['all']).forEach(([itemId, qty]: [string, any]) => { if (typeof qty === 'number' && qty > 0) linenItems.push({ id: itemId, name: getItemName(itemId), quantity: qty }); });
        } else {
          Object.entries(config.bl).forEach(([bedId, items]: [string, any]) => {
            if (bedId !== 'all' && typeof items === 'object') {
              Object.entries(items).forEach(([itemId, qty]: [string, any]) => {
                if (typeof qty === 'number' && qty > 0) {
                  const existing = linenItems.find(i => i.id === itemId);
                  if (existing) existing.quantity += qty;
                  else linenItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
                }
              });
            }
          });
        }
      }
      if (config.ba) Object.entries(config.ba).forEach(([itemId, qty]: [string, any]) => { if (typeof qty === 'number' && qty > 0) linenItems.push({ id: itemId, name: getItemName(itemId), quantity: qty }); });
      if (config.ki) Object.entries(config.ki).forEach(([itemId, qty]: [string, any]) => { if (typeof qty === 'number' && qty > 0) linenItems.push({ id: itemId, name: getItemName(itemId), quantity: qty }); });

      // SAFETY NET
      const hasFedere = hasItemByIds(linenItems, FEDERE_IDS);
      const hasLenzMatr = hasItemByIds(linenItems, LENZUOLA_MATR_IDS);
      const hasLenzSing = hasItemByIds(linenItems, LENZUOLA_SING_IDS);
      const hasAnyBlItem = hasFedere || hasLenzMatr || hasLenzSing;
      const hasAnyBaKiItem = linenItems.length > 0 && !hasAnyBlItem;
      if ((hasFedere && !hasLenzMatr && !hasLenzSing) || (hasAnyBaKiItem && !hasAnyBlItem)) {
        const fallbackLinen = calculateFallbackLinen(guestsCount, prop.bedrooms || 1, prop.bathrooms || 1);
        for (const fb of fallbackLinen) {
          const isBlItem = fb.id === 'doubleSheets' || fb.id === 'singleSheets' || fb.id === 'pillowcases';
          const alreadyHas = linenItems.some(i => i.id === fb.id);
          if (isBlItem && !alreadyHas) linenItems.push(fb);
        }
      }
    }
  }
  if (linenItems.length === 0) linenItems = calculateFallbackLinen(guestsCount, prop.bedrooms || 1, prop.bathrooms || 1);
  return linenItems;
}

// ═══════════════════════════════════════════════════════════════
// TEST RUNNER
// ═══════════════════════════════════════════════════════════════

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  severity: "critical" | "warning" | "info";
}

export async function GET(req: NextRequest) {
  const urlSecret = req.nextUrl.searchParams.get("secret");
  if (urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: TestResult[] = [];
  const startTime = Date.now();

  try {
    // ═══════════════════════════════════════════════════════
    // SEZIONE 1: INVENTARIO
    // ═══════════════════════════════════════════════════════
    const invSnap = await adminDb.collection("inventory").get();
    const inventoryItems = invSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

    // Test 1.1: Inventario non vuoto
    results.push({
      name: "1.1 Inventario caricato",
      passed: inventoryItems.length > 0,
      details: `${inventoryItems.length} articoli trovati`,
      severity: "critical",
    });

    // Test 1.2: Lenzuola matrimoniali esistono nell'inventario
    const lenzMatrInv = inventoryItems.find(i => i.id === 'item_doubleSheets' || i.key === 'doubleSheets');
    results.push({
      name: "1.2 Lenzuola Matrimoniali in inventario",
      passed: !!lenzMatrInv,
      details: lenzMatrInv ? `id=${lenzMatrInv.id}, key=${lenzMatrInv.key}, name=${lenzMatrInv.name}, sellPrice=${lenzMatrInv.sellPrice}` : "NON TROVATE!",
      severity: "critical",
    });

    // Test 1.3: Lenzuola singole esistono
    const lenzSingInv = inventoryItems.find(i => i.id === 'item_singleSheets' || i.key === 'singleSheets');
    results.push({
      name: "1.3 Lenzuola Singole in inventario",
      passed: !!lenzSingInv,
      details: lenzSingInv ? `id=${lenzSingInv.id}, key=${lenzSingInv.key}, name=${lenzSingInv.name}` : "NON TROVATE!",
      severity: "critical",
    });

    // Test 1.4: Federe esistono
    const federeInv = inventoryItems.find(i => i.id === 'item_pillowcases' || i.key === 'pillowcases');
    results.push({
      name: "1.4 Federe in inventario",
      passed: !!federeInv,
      details: federeInv ? `id=${federeInv.id}, key=${federeInv.key}, name=${federeInv.name}` : "NON TROVATE!",
      severity: "critical",
    });

    // Test 1.5: getItemName riconosce gli ID canonici
    const nameTests = [
      { id: 'doubleSheets', expected: 'Lenzuola Matrimoniali' },
      { id: 'singleSheets', expected: 'Lenzuola Singole' },
      { id: 'pillowcases', expected: 'Federe' },
    ];
    for (const nt of nameTests) {
      const name = getItemName(nt.id);
      results.push({
        name: `1.5 getItemName('${nt.id}')`,
        passed: name === nt.expected,
        details: `Atteso: "${nt.expected}", Ottenuto: "${name}"`,
        severity: "critical",
      });
    }

    // ═══════════════════════════════════════════════════════
    // SEZIONE 2: PROPRIETÀ CON serviceConfigs
    // ═══════════════════════════════════════════════════════
    const propsSnap = await adminDb.collection("properties").where("status", "==", "ACTIVE").get();
    const properties = propsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

    results.push({
      name: "2.0 Proprietà attive caricate",
      passed: properties.length > 0,
      details: `${properties.length} proprietà attive`,
      severity: "info",
    });

    const propsWithConfig = properties.filter(p => p.serviceConfigs && Object.keys(p.serviceConfigs).length > 0);
    const propsWithoutConfig = properties.filter(p => !p.serviceConfigs || Object.keys(p.serviceConfigs).length === 0);

    results.push({
      name: "2.1 Proprietà con serviceConfigs",
      passed: true,
      details: `${propsWithConfig.length} con config, ${propsWithoutConfig.length} senza config (useranno fallback)`,
      severity: "info",
    });

    // ═══════════════════════════════════════════════════════
    // SEZIONE 3: TEST OGNI PROPRIETÀ + OGNI GUEST COUNT
    // ═══════════════════════════════════════════════════════
    let totalScenarios = 0;
    let scenariosWithLenzuola = 0;
    let scenariosSafetyNetTriggered = 0;
    let scenariosFallbackUsed = 0;
    const problematicProps: string[] = [];
    const safetyNetProps: string[] = [];

    for (const prop of properties) {
      if (prop.usesOwnLinen) continue; // Skip proprietà con biancheria propria
      
      const maxG = prop.maxGuests || 6;
      for (let g = 1; g <= maxG; g++) {
        totalScenarios++;

        // Simula SENZA safety net (come era PRIMA del fix)
        let itemsOld: { id: string; name: string; quantity: number }[] = [];
        if (prop.serviceConfigs) {
          const config = prop.serviceConfigs[g] || prop.serviceConfigs[String(g)];
          if (config) {
            if (config.bl) {
              const hasAll = config.bl['all'] && typeof config.bl['all'] === 'object' && Object.keys(config.bl['all']).length > 0;
              if (hasAll) {
                Object.entries(config.bl['all']).forEach(([itemId, qty]: [string, any]) => { if (typeof qty === 'number' && qty > 0) itemsOld.push({ id: itemId, name: getItemName(itemId), quantity: qty }); });
              }
            }
            if (config.ba) Object.entries(config.ba).forEach(([itemId, qty]: [string, any]) => { if (typeof qty === 'number' && qty > 0) itemsOld.push({ id: itemId, name: getItemName(itemId), quantity: qty }); });
            if (config.ki) Object.entries(config.ki).forEach(([itemId, qty]: [string, any]) => { if (typeof qty === 'number' && qty > 0) itemsOld.push({ id: itemId, name: getItemName(itemId), quantity: qty }); });
          }
        }
        if (itemsOld.length === 0) itemsOld = calculateFallbackLinen(g, prop.bedrooms || 1, prop.bathrooms || 1);
        
        const oldHasLenz = hasItemByIds(itemsOld, [...LENZUOLA_MATR_IDS, ...LENZUOLA_SING_IDS]);

        // Simula CON safety net (DOPO il fix)
        const itemsNew = calculateLinenItemsForProperty(prop, g);
        const newHasLenz = hasItemByIds(itemsNew, [...LENZUOLA_MATR_IDS, ...LENZUOLA_SING_IDS]);

        if (newHasLenz) scenariosWithLenzuola++;
        if (!oldHasLenz && newHasLenz) {
          scenariosSafetyNetTriggered++;
          if (!safetyNetProps.includes(prop.name)) safetyNetProps.push(prop.name);
        }
        if (!prop.serviceConfigs || !prop.serviceConfigs[g] && !prop.serviceConfigs[String(g)]) {
          scenariosFallbackUsed++;
        }

        // Se ANCHE con safety net non ha lenzuola → PROBLEMA CRITICO
        if (!newHasLenz) {
          problematicProps.push(`${prop.name} (${g} ospiti)`);
        }
      }
    }

    results.push({
      name: "3.0 Scenari totali testati",
      passed: true,
      details: `${totalScenarios} scenari (proprietà × numeri ospiti)`,
      severity: "info",
    });

    results.push({
      name: "3.1 Scenari CON lenzuola (dopo fix)",
      passed: scenariosWithLenzuola === totalScenarios,
      details: `${scenariosWithLenzuola}/${totalScenarios} hanno lenzuola${scenariosWithLenzuola < totalScenarios ? ` — MANCANO ${totalScenarios - scenariosWithLenzuola}!` : ''}`,
      severity: scenariosWithLenzuola === totalScenarios ? "info" : "critical",
    });

    results.push({
      name: "3.2 Safety net attivato (config corrotte riparate)",
      passed: true,
      details: scenariosSafetyNetTriggered > 0
        ? `⚠️ ${scenariosSafetyNetTriggered} scenari avevano lenzuola MANCANTI — ora corretti! Proprietà: ${safetyNetProps.join(', ')}`
        : `Nessuna config corrotta trovata — tutte le proprietà sono OK`,
      severity: scenariosSafetyNetTriggered > 0 ? "warning" : "info",
    });

    results.push({
      name: "3.3 Scenari con fallback (no serviceConfig)",
      passed: true,
      details: `${scenariosFallbackUsed} scenari usano fallback (proprietà senza config per quel numero ospiti)`,
      severity: "info",
    });

    if (problematicProps.length > 0) {
      results.push({
        name: "3.4 ❌ PROPRIETÀ PROBLEMATICHE (anche dopo fix)",
        passed: false,
        details: problematicProps.join('; '),
        severity: "critical",
      });
    }

    // ═══════════════════════════════════════════════════════
    // SEZIONE 4: VERIFICA serviceConfig STRUTTURA
    // ═══════════════════════════════════════════════════════
    let configsWithEmptyBl = 0;
    let configsWithFedereNoLenz = 0;
    let configsWithOnlyBaKi = 0;
    const emptyBlProps: string[] = [];
    const federeNoLenzProps: string[] = [];

    for (const prop of propsWithConfig) {
      if (prop.usesOwnLinen) continue;
      const sc = prop.serviceConfigs;
      for (const [gKey, cfg] of Object.entries(sc) as [string, any][]) {
        if (!cfg.bl) continue;
        const blAll = cfg.bl['all'];
        if (blAll && typeof blAll === 'object') {
          const entries = Object.entries(blAll).filter(([, v]) => typeof v === 'number' && (v as number) > 0);
          if (entries.length === 0) {
            configsWithEmptyBl++;
            if (!emptyBlProps.includes(prop.name)) emptyBlProps.push(prop.name);
          } else {
            const hasLenz = entries.some(([k]) => LENZUOLA_MATR_IDS.some(id => k.toLowerCase().includes(id.toLowerCase())) || LENZUOLA_SING_IDS.some(id => k.toLowerCase().includes(id.toLowerCase())));
            const hasFed = entries.some(([k]) => FEDERE_IDS.some(id => k.toLowerCase().includes(id.toLowerCase())));
            if (hasFed && !hasLenz) {
              configsWithFedereNoLenz++;
              if (!federeNoLenzProps.includes(prop.name)) federeNoLenzProps.push(prop.name);
            }
          }
        }
        // Check ba/ki without bl
        const hasBlItems = blAll && Object.values(blAll).some(v => typeof v === 'number' && (v as number) > 0);
        const hasBa = cfg.ba && Object.values(cfg.ba).some((v: any) => typeof v === 'number' && v > 0);
        const hasKi = cfg.ki && Object.values(cfg.ki).some((v: any) => typeof v === 'number' && v > 0);
        if (!hasBlItems && (hasBa || hasKi)) {
          configsWithOnlyBaKi++;
        }
      }
    }

    results.push({
      name: "4.1 Config con bl['all'] vuoto",
      passed: configsWithEmptyBl === 0,
      details: configsWithEmptyBl > 0
        ? `⚠️ ${configsWithEmptyBl} config hanno bl vuoto — proprietà: ${emptyBlProps.join(', ')}. Il safety net le copre al runtime.`
        : "Nessuna config con bl vuoto",
      severity: configsWithEmptyBl > 0 ? "warning" : "info",
    });

    results.push({
      name: "4.2 Config con federe MA senza lenzuola (il BUG originale)",
      passed: configsWithFedereNoLenz === 0,
      details: configsWithFedereNoLenz > 0
        ? `⚠️ ${configsWithFedereNoLenz} config con federe senza lenzuola — proprietà: ${federeNoLenzProps.join(', ')}. Il safety net le copre.`
        : "Nessuna config con questo problema",
      severity: configsWithFedereNoLenz > 0 ? "warning" : "info",
    });

    results.push({
      name: "4.3 Config con solo ba/ki senza bl",
      passed: configsWithOnlyBaKi === 0,
      details: configsWithOnlyBaKi > 0
        ? `⚠️ ${configsWithOnlyBaKi} config hanno solo bagno/kit senza biancheria letto. Il safety net le copre.`
        : "Nessuna config con questo problema",
      severity: configsWithOnlyBaKi > 0 ? "warning" : "info",
    });

    // ═══════════════════════════════════════════════════════
    // SEZIONE 5: ORDINI PENDING/READY — verifica che non ci siano ordini senza lenzuola
    // ═══════════════════════════════════════════════════════
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const ordersSnap = await adminDb.collection("orders")
      .where("status", "in", ["PENDING", "READY"])
      .get();
    
    const pendingOrders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
    let ordersWithoutLenz = 0;
    const ordersWithoutLenzDetails: string[] = [];

    for (const order of pendingOrders) {
      if (!order.items || order.items.length === 0) continue;
      // Controlla se l'ordine ha items da biancheria letto (federe, teli, etc)
      const hasFedereOrBath = order.items.some((i: any) => {
        const id = (i.id || '').toLowerCase();
        const name = (i.name || '').toLowerCase();
        return id.includes('pillow') || id.includes('feder') || id.includes('towel') || 
               name.includes('feder') || name.includes('asciugaman') || name.includes('telo');
      });

      if (!hasFedereOrBath) continue; // Ordine solo kit cortesia, skip

      const hasLenz = order.items.some((i: any) => {
        const id = (i.id || '').toLowerCase();
        const name = (i.name || '').toLowerCase();
        return id.includes('double') || id.includes('single') || id.includes('lenzuol') ||
               name.includes('lenzuol');
      });

      if (!hasLenz) {
        ordersWithoutLenz++;
        const propName = order.propertyName || order.propertyId || '?';
        const dateStr = order.scheduledDate?.toDate ? order.scheduledDate.toDate().toLocaleDateString('it-IT') : '?';
        ordersWithoutLenzDetails.push(`${propName} (${dateStr}, ordine: ${order.id.slice(0, 8)})`);
      }
    }

    results.push({
      name: "5.1 Ordini PENDING/READY senza lenzuola",
      passed: ordersWithoutLenz === 0,
      details: ordersWithoutLenz > 0
        ? `❌ ${ordersWithoutLenz} ordini in attesa SENZA lenzuola: ${ordersWithoutLenzDetails.join('; ')}`
        : `Tutti i ${pendingOrders.length} ordini pending/ready hanno lenzuola (o sono solo kit cortesia)`,
      severity: ordersWithoutLenz > 0 ? "critical" : "info",
    });

    // ═══════════════════════════════════════════════════════
    // SEZIONE 6: SIMULAZIONE SPECIFICA PAOLA'S APARTMENT
    // ═══════════════════════════════════════════════════════
    const paola = properties.find(p => p.name?.toLowerCase().includes('paola'));
    if (paola) {
      const maxG = paola.maxGuests || 6;
      for (let g = 1; g <= maxG; g++) {
        const items = calculateLinenItemsForProperty(paola, g);
        const hasLenz = hasItemByIds(items, [...LENZUOLA_MATR_IDS, ...LENZUOLA_SING_IDS]);
        results.push({
          name: `6.${g} Paola's Apartment — ${g} ospiti`,
          passed: hasLenz,
          details: hasLenz
            ? `OK — ${items.filter(i => LENZUOLA_MATR_IDS.some(k => i.id.includes(k)) || LENZUOLA_SING_IDS.some(k => i.id.includes(k))).map(i => `${i.name} x${i.quantity}`).join(', ')}`
            : `❌ MANCANO LENZUOLA! Items: ${items.map(i => `${i.name} x${i.quantity}`).join(', ')}`,
          severity: hasLenz ? "info" : "critical",
        });
      }
    }

    // ═══════════════════════════════════════════════════════
    // RIEPILOGO
    // ═══════════════════════════════════════════════════════
    const criticalFails = results.filter(r => !r.passed && r.severity === "critical");
    const warnings = results.filter(r => r.severity === "warning");
    const allPassed = results.every(r => r.passed);
    const elapsed = Date.now() - startTime;

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      elapsedMs: elapsed,
      summary: {
        total: results.length,
        passed: results.filter(r => r.passed).length,
        failed: results.filter(r => !r.passed).length,
        criticalFails: criticalFails.length,
        warnings: warnings.length,
        verdict: criticalFails.length > 0
          ? "❌ FAIL — CI SONO PROBLEMI CRITICI"
          : warnings.length > 0
          ? "⚠️ PASS CON WARNING — il safety net copre i problemi trovati"
          : "✅ TUTTO OK — nessun problema trovato",
      },
      stats: {
        inventoryItems: inventoryItems.length,
        activeProperties: properties.length,
        propertiesWithConfig: propsWithConfig.length,
        totalScenariosTested: totalScenarios,
        safetyNetWouldTrigger: scenariosSafetyNetTriggered,
        safetyNetProperties: safetyNetProps,
        pendingOrders: pendingOrders.length,
        pendingOrdersWithoutLenzuola: ordersWithoutLenz,
        corruptedConfigs: {
          emptyBl: configsWithEmptyBl,
          federeNoLenz: configsWithFedereNoLenz,
          onlyBaKi: configsWithOnlyBaKi,
        },
      },
      results,
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 5),
    }, { status: 500 });
  }
}
