/**
 * 🔍 DIAGNOSI QUANTITÀ LENZUOLA — Analizza ordini e serviceConfigs
 * 
 * GET /api/admin/diagnose-linen-qty?secret=CRON_SECRET
 * GET /api/admin/diagnose-linen-qty?secret=CRON_SECRET&propertyId=DFMuYGPWTtl4QvDMKSrH
 * 
 * Per ogni proprietà ATTIVA (o la singola richiesta):
 * 1. Legge beds → calcola minimo lenzuola (2 per letto)
 * 2. Legge serviceConfigs → per ogni numero ospiti, verifica bl['all'] o gruppi letto
 * 3. Legge ordini PENDING/futuri → verifica quantità lenzuola nell'ordine
 * 4. Segnala discrepanze: lenzuola < minimo, lenzuola = 0, bl['all'] vuoto
 * 
 * NON modifica nulla nel database.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET;

// ID noti per lenzuola
const LENZ_MATR_IDS = ['doublesheets', 'item_doublesheets', 'lenzuola_matrimoniale', 'lenzuolo_matrimoniale', 'lenz_matr'];
const LENZ_SING_IDS = ['singlesheets', 'item_singlesheets', 'lenzuola_singolo', 'lenzuolo_singolo', 'lenz_sing'];
const FEDERE_IDS = ['pillowcases', 'item_pillowcases', 'federa', 'federe'];

function isLenzMatr(id: string): boolean {
  const lower = id.toLowerCase();
  return LENZ_MATR_IDS.some(k => lower.includes(k)) || (lower.includes('matrimonial') && lower.includes('lenzuol'));
}
function isLenzSing(id: string): boolean {
  const lower = id.toLowerCase();
  return LENZ_SING_IDS.some(k => lower.includes(k)) || (lower.includes('singol') && lower.includes('lenzuol'));
}
function isFedera(id: string): boolean {
  const lower = id.toLowerCase();
  return FEDERE_IDS.some(k => lower.includes(k));
}

function countBedMinimums(beds: any[]): { minLenzMatr: number; minLenzSing: number; minFedere: number } {
  let minLenzMatr = 0, minLenzSing = 0, minFedere = 0;
  if (!beds || !Array.isArray(beds)) return { minLenzMatr, minLenzSing, minFedere };
  for (const bed of beds) {
    const tipo = (bed.type || bed.tipo || '').toLowerCase();
    if (tipo === 'matr' || tipo === 'matrimoniale' || tipo === 'divano' || tipo === 'divano_letto') {
      minLenzMatr += 2; minFedere += 2;
    } else if (tipo === 'castello') {
      minLenzSing += 4; minFedere += 2;
    } else {
      minLenzSing += 2; minFedere += 1;
    }
  }
  return { minLenzMatr, minLenzSing, minFedere };
}

function extractBlTotals(bl: any): { lenzMatr: number; lenzSing: number; federe: number; raw: Record<string, number> } {
  let lenzMatr = 0, lenzSing = 0, federe = 0;
  const raw: Record<string, number> = {};
  if (!bl || typeof bl !== 'object') return { lenzMatr, lenzSing, federe, raw };

  const hasAll = bl['all'] && typeof bl['all'] === 'object' && Object.keys(bl['all']).length > 0;

  const processItems = (items: Record<string, any>) => {
    Object.entries(items).forEach(([itemId, qty]) => {
      if (typeof qty !== 'number' || qty <= 0) return;
      raw[itemId] = (raw[itemId] || 0) + qty;
      if (isLenzMatr(itemId)) lenzMatr += qty;
      else if (isLenzSing(itemId)) lenzSing += qty;
      else if (isFedera(itemId)) federe += qty;
    });
  };

  if (hasAll) {
    processItems(bl['all']);
  } else {
    Object.entries(bl).forEach(([key, items]) => {
      if (key !== 'all' && typeof items === 'object' && items !== null) {
        processItems(items as Record<string, any>);
      }
    });
  }
  return { lenzMatr, lenzSing, federe, raw };
}

function extractOrderTotals(items: any[]): { lenzMatr: number; lenzSing: number; federe: number; allItems: string[] } {
  let lenzMatr = 0, lenzSing = 0, federe = 0;
  const allItems: string[] = [];
  if (!items || !Array.isArray(items)) return { lenzMatr, lenzSing, federe, allItems };
  for (const item of items) {
    const id = (item.id || '').toLowerCase();
    const name = (item.name || '').toLowerCase();
    const qty = item.quantity || 0;
    allItems.push(`${item.name || item.id}:${qty}`);
    if (isLenzMatr(id) || isLenzMatr(name)) lenzMatr += qty;
    else if (isLenzSing(id) || isLenzSing(name)) lenzSing += qty;
    else if (isFedera(id) || isFedera(name)) federe += qty;
  }
  return { lenzMatr, lenzSing, federe, allItems };
}

export async function GET(req: NextRequest) {
  const urlSecret = req.nextUrl.searchParams.get("secret");
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${CRON_SECRET}` && urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const filterPropertyId = req.nextUrl.searchParams.get("propertyId");

  try {
    // Carica proprietà
    let propsQuery;
    if (filterPropertyId) {
      const doc = await adminDb.collection("properties").doc(filterPropertyId).get();
      propsQuery = doc.exists ? [doc] : [];
    } else {
      const snap = await adminDb.collection("properties").where("status", "==", "ACTIVE").get();
      propsQuery = snap.docs;
    }

    // Carica ordini futuri
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const results: any[] = [];
    const summary = { totalProperties: 0, propertiesWithIssues: 0, issues: [] as string[] };

    for (const propDoc of propsQuery) {
      const prop = { id: propDoc.id, ...propDoc.data() } as Record<string, any>;
      if (prop.usesOwnLinen) continue;
      summary.totalProperties++;

      const beds = prop.beds || [];
      const minimums = countBedMinimums(beds);
      const maxGuests = prop.maxGuests || 2;

      const propResult: any = {
        id: prop.id,
        name: prop.name,
        maxGuests,
        bedrooms: prop.bedrooms,
        beds: beds.map((b: any) => `${b.type || b.tipo}(${b.name || b.nome})`),
        minimums,
        configAnalysis: {},
        orderAnalysis: [],
        issues: [],
      };

      // Analisi serviceConfigs
      if (prop.serviceConfigs) {
        for (let g = 1; g <= maxGuests; g++) {
          const config = prop.serviceConfigs[g] || prop.serviceConfigs[String(g)];
          if (!config) {
            propResult.configAnalysis[`ospiti_${g}`] = { status: "❌ CONFIG MANCANTE" };
            propResult.issues.push(`Config mancante per ${g} ospiti`);
            continue;
          }

          const configBeds = config.beds || [];
          const selectedBedObjects = beds.filter((b: any) => configBeds.includes(b.id));
          const selectedMins = countBedMinimums(selectedBedObjects);
          const blTotals = extractBlTotals(config.bl);

          const hasAll = config.bl?.['all'] && typeof config.bl['all'] === 'object' && Object.keys(config.bl['all']).length > 0;
          const blKeys = config.bl ? Object.keys(config.bl) : [];

          const configResult: any = {
            beds_selezionati: configBeds,
            formato_bl: hasAll ? "bl['all']" : (blKeys.filter(k => k !== 'all').length > 0 ? "per-letto" : "VUOTO"),
            bl_keys: blKeys,
            bl_raw: blTotals.raw,
            lenzuola_matrimoniali: blTotals.lenzMatr,
            lenzuola_singole: blTotals.lenzSing,
            federe: blTotals.federe,
            minimo_lenz_matr: selectedMins.minLenzMatr,
            minimo_lenz_sing: selectedMins.minLenzSing,
            minimo_federe: selectedMins.minFedere,
          };

          // Check problemi
          if (blTotals.lenzMatr === 0 && blTotals.lenzSing === 0) {
            configResult.problema = "🔴 ZERO LENZUOLA";
            propResult.issues.push(`Config ${g} ospiti: 0 lenzuola (bl=${JSON.stringify(blTotals.raw)})`);
          } else if (blTotals.lenzMatr < selectedMins.minLenzMatr) {
            configResult.problema = `🟡 LENZ MATR INSUFFICIENTI (${blTotals.lenzMatr} < ${selectedMins.minLenzMatr})`;
            propResult.issues.push(`Config ${g} ospiti: lenz.matr ${blTotals.lenzMatr} < minimo ${selectedMins.minLenzMatr}`);
          } else if (blTotals.lenzSing < selectedMins.minLenzSing) {
            configResult.problema = `🟡 LENZ SING INSUFFICIENTI (${blTotals.lenzSing} < ${selectedMins.minLenzSing})`;
            propResult.issues.push(`Config ${g} ospiti: lenz.sing ${blTotals.lenzSing} < minimo ${selectedMins.minLenzSing}`);
          } else {
            configResult.status = "✅ OK";
          }

          propResult.configAnalysis[`ospiti_${g}`] = configResult;
        }
      } else {
        propResult.configAnalysis = { status: "❌ serviceConfigs ASSENTI" };
        propResult.issues.push("serviceConfigs non configurate");
      }

      // Analisi ordini PENDING futuri
      const ordersSnap = await adminDb.collection("orders")
        .where("propertyId", "==", prop.id)
        .where("status", "==", "PENDING")
        .get();

      for (const orderDoc of ordersSnap.docs) {
        const order = orderDoc.data() as Record<string, any>;
        const orderDate = order.scheduledDate?.toDate?.();
        if (!orderDate || orderDate < today) continue;

        const orderTotals = extractOrderTotals(order.items);
        const dateStr = orderDate.toISOString().split('T')[0];

        const orderResult: any = {
          orderId: orderDoc.id,
          date: dateStr,
          guestsCount: order.guestsCount || "N/A",
          items: orderTotals.allItems,
          lenzuola_matrimoniali: orderTotals.lenzMatr,
          lenzuola_singole: orderTotals.lenzSing,
          federe: orderTotals.federe,
        };

        if (orderTotals.lenzMatr === 0 && orderTotals.lenzSing === 0) {
          orderResult.problema = "🔴 ORDINE SENZA LENZUOLA";
          propResult.issues.push(`Ordine ${orderDoc.id} (${dateStr}): 0 lenzuola!`);
        }

        propResult.orderAnalysis.push(orderResult);
      }

      if (propResult.issues.length > 0) {
        summary.propertiesWithIssues++;
        results.push(propResult);
      } else if (filterPropertyId) {
        // Se filtrato per proprietà, mostra comunque anche se OK
        propResult.status = "✅ TUTTO OK";
        results.push(propResult);
      }
    }

    return NextResponse.json({
      summary: {
        ...summary,
        totalWithIssues: results.length,
      },
      properties: results,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
