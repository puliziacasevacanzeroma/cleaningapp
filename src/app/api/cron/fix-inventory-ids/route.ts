/**
 * GET /api/cron/fix-inventory-ids?secret=XXXX
 *   → DRY RUN: mostra cosa verrebbe fixato
 * 
 * GET /api/cron/fix-inventory-ids?secret=XXXX&execute=true
 *   → ESEGUE: normalizza ID inventario + aggiorna serviceConfigs + ordini
 * 
 * Trova item nell'inventario con ID auto-generati Firestore (no key leggibile),
 * identifica cosa sono dal nome, e sostituisce ovunque con l'ID canonico.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";
const CRON_SECRET = process.env.CRON_SECRET;

// Mappa nome → ID canonico (gli ID che il sistema riconosce ovunque)
const CANONICAL_MAP: Record<string, { canonicalKey: string; canonicalDocId: string; name: string; categoryId: string }> = {
  'lenzuola matrimoniali': { canonicalKey: 'doubleSheets', canonicalDocId: 'item_doubleSheets', name: 'Lenzuola Matrimoniali', categoryId: 'biancheria_letto' },
  'lenzuola matrimoniale': { canonicalKey: 'doubleSheets', canonicalDocId: 'item_doubleSheets', name: 'Lenzuola Matrimoniali', categoryId: 'biancheria_letto' },
  'lenzuola singole': { canonicalKey: 'singleSheets', canonicalDocId: 'item_singleSheets', name: 'Lenzuola Singole', categoryId: 'biancheria_letto' },
  'lenzuola singolo': { canonicalKey: 'singleSheets', canonicalDocId: 'item_singleSheets', name: 'Lenzuola Singole', categoryId: 'biancheria_letto' },
  'federe': { canonicalKey: 'pillowcases', canonicalDocId: 'item_pillowcases', name: 'Federe', categoryId: 'biancheria_letto' },
  'federa': { canonicalKey: 'pillowcases', canonicalDocId: 'item_pillowcases', name: 'Federe', categoryId: 'biancheria_letto' },
  'telo doccia': { canonicalKey: 'towelsLarge', canonicalDocId: 'item_towelsLarge', name: 'Telo Doccia', categoryId: 'biancheria_bagno' },
  'asciugamano viso': { canonicalKey: 'towelsFace', canonicalDocId: 'item_towelsFace', name: 'Asciugamano Viso', categoryId: 'biancheria_bagno' },
  'asciugamano bidet': { canonicalKey: 'towelsSmall', canonicalDocId: 'item_towelsSmall', name: 'Asciugamano Bidet', categoryId: 'biancheria_bagno' },
  'asciugamano ospite': { canonicalKey: 'towelsSmall', canonicalDocId: 'item_towelsSmall', name: 'Asciugamano Bidet', categoryId: 'biancheria_bagno' },
  'tappetino scendibagno': { canonicalKey: 'bathMats', canonicalDocId: 'item_bathMats', name: 'Tappetino Scendibagno', categoryId: 'biancheria_bagno' },
  'tappetino bagno': { canonicalKey: 'bathMats', canonicalDocId: 'item_bathMats', name: 'Tappetino Scendibagno', categoryId: 'biancheria_bagno' },
};

// ID di sistema (questi sono OK, non toccarli)
const SYSTEM_DOC_IDS = new Set([
  'item_doubleSheets', 'item_singleSheets', 'item_pillowcases',
  'item_towelsLarge', 'item_towelsFace', 'item_towelsSmall', 'item_bathMats',
]);
const SYSTEM_KEYS = new Set([
  'doubleSheets', 'singleSheets', 'pillowcases',
  'towelsLarge', 'towelsFace', 'towelsSmall', 'bathMats',
]);

function findCanonical(name: string): { canonicalKey: string; canonicalDocId: string; name: string } | null {
  const lower = (name || '').toLowerCase().trim();
  for (const [pattern, info] of Object.entries(CANONICAL_MAP)) {
    if (lower.includes(pattern) || pattern.includes(lower)) {
      return info;
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const urlSecret = req.nextUrl.searchParams.get("secret");
  if (urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const execute = req.nextUrl.searchParams.get("execute") === "true";

  try {
    // ══════════════════════════════════════════════════
    // FASE 1: Trova item inventario con ID random
    // ══════════════════════════════════════════════════
    const invSnap = await adminDb.collection("inventory").get();
    const allItems = invSnap.docs.map(d => ({ docId: d.id, ...d.data() })) as any[];

    // Trova item con ID Firestore auto-generato (20+ char alfanumerici, no underscore/prefisso)
    const randomIdItems: Array<{
      docId: string;
      name: string;
      key: string;
      categoryId: string;
      canonical: { canonicalKey: string; canonicalDocId: string; name: string } | null;
    }> = [];

    for (const item of allItems) {
      const isSystem = SYSTEM_DOC_IDS.has(item.docId);
      const hasProperKey = item.key && SYSTEM_KEYS.has(item.key);
      const isLikelyRandom = !isSystem && !hasProperKey && item.docId.length >= 15 && !item.docId.startsWith('item_');
      
      if (isLikelyRandom) {
        const canonical = findCanonical(item.name || '');
        randomIdItems.push({
          docId: item.docId,
          name: item.name || '(senza nome)',
          key: item.key || '(nessuna key)',
          categoryId: item.categoryId || '',
          canonical,
        });
      }
    }

    // Costruisci mappa di sostituzione: oldId → canonicalKey
    const replaceMap = new Map<string, string>();
    for (const item of randomIdItems) {
      if (item.canonical) {
        replaceMap.set(item.docId, item.canonical.canonicalKey);
        // Anche la key se diversa
        if (item.key && item.key !== item.canonical.canonicalKey) {
          replaceMap.set(item.key, item.canonical.canonicalKey);
        }
      }
    }

    // ══════════════════════════════════════════════════
    // FASE 2: Scansiona serviceConfigs di tutte le proprietà
    // ══════════════════════════════════════════════════
    const propsSnap = await adminDb.collection("properties").get();
    let configsFixed = 0;
    const configFixDetails: string[] = [];
    const propsToUpdate: Array<{ propId: string; propName: string; newConfigs: any }> = [];

    for (const propDoc of propsSnap.docs) {
      const prop = propDoc.data() as any;
      if (!prop.serviceConfigs) continue;

      let changed = false;
      const newConfigs = JSON.parse(JSON.stringify(prop.serviceConfigs));

      for (const [gKey, cfg] of Object.entries(newConfigs) as [string, any][]) {
        // Fix bl
        if (cfg.bl) {
          for (const [blKey, blVal] of Object.entries(cfg.bl)) {
            if (blKey === 'all' && typeof blVal === 'object') {
              const newAll: Record<string, number> = {};
              for (const [itemId, qty] of Object.entries(blVal as Record<string, number>)) {
                const replacement = replaceMap.get(itemId);
                if (replacement && replacement !== itemId) {
                  newAll[replacement] = (newAll[replacement] || 0) + (qty as number);
                  changed = true;
                } else {
                  newAll[itemId] = (newAll[itemId] || 0) + (qty as number);
                }
              }
              cfg.bl['all'] = newAll;
            } else if (typeof blVal === 'object' && blKey !== 'all') {
              // Per-bed format
              const newBed: Record<string, number> = {};
              for (const [itemId, qty] of Object.entries(blVal as Record<string, number>)) {
                const replacement = replaceMap.get(itemId);
                if (replacement && replacement !== itemId) {
                  newBed[replacement] = (newBed[replacement] || 0) + (qty as number);
                  changed = true;
                } else {
                  newBed[itemId] = (newBed[itemId] || 0) + (qty as number);
                }
              }
              cfg.bl[blKey] = newBed;
            }
          }
        }
        // Fix ba, ki
        for (const section of ['ba', 'ki'] as const) {
          if (cfg[section] && typeof cfg[section] === 'object') {
            const newSection: Record<string, number> = {};
            for (const [itemId, qty] of Object.entries(cfg[section] as Record<string, number>)) {
              const replacement = replaceMap.get(itemId);
              if (replacement && replacement !== itemId) {
                newSection[replacement] = (newSection[replacement] || 0) + (qty as number);
                changed = true;
              } else {
                newSection[itemId] = (newSection[itemId] || 0) + (qty as number);
              }
            }
            cfg[section] = newSection;
          }
        }
      }

      if (changed) {
        configsFixed++;
        configFixDetails.push(prop.name || propDoc.id);
        propsToUpdate.push({ propId: propDoc.id, propName: prop.name || propDoc.id, newConfigs });
      }
    }

    // ══════════════════════════════════════════════════
    // FASE 3: Scansiona ordini PENDING/READY
    // ══════════════════════════════════════════════════
    const ordersSnap = await adminDb.collection("orders")
      .where("status", "in", ["PENDING", "READY"])
      .get();

    let ordersFixed = 0;
    const orderFixDetails: string[] = [];
    const ordersToUpdate: Array<{ orderId: string; newItems: any[] }> = [];

    for (const orderDoc of ordersSnap.docs) {
      const order = orderDoc.data() as any;
      const items = order.items || [];
      let changed = false;

      const newItems = items.map((item: any) => {
        const replacement = replaceMap.get(item.id);
        if (replacement && replacement !== item.id) {
          changed = true;
          // Trova il nome corretto
          const canonical = findCanonical(item.name || '') || findCanonical(replacement);
          return {
            ...item,
            id: replacement,
            name: canonical?.name || item.name,
          };
        }
        return item;
      });

      if (changed) {
        ordersFixed++;
        const propName = order.propertyName || order.propertyId || '?';
        const dateStr = order.scheduledDate?.toDate ? order.scheduledDate.toDate().toLocaleDateString('it-IT') : '?';
        orderFixDetails.push(`${propName} (${dateStr}, ${orderDoc.id.slice(0, 8)})`);
        ordersToUpdate.push({ orderId: orderDoc.id, newItems });
      }
    }

    // ══════════════════════════════════════════════════
    // FASE 4: Esegui se richiesto
    // ══════════════════════════════════════════════════
    let executed = { inventory: 0, configs: 0, orders: 0, errors: [] as string[] };

    if (execute && replaceMap.size > 0) {
      // 4a: Aggiungi key agli item inventario random
      for (const item of randomIdItems) {
        if (item.canonical) {
          try {
            await adminDb.collection("inventory").doc(item.docId).update({
              key: item.canonical.canonicalKey,
              name: item.canonical.name,
              categoryId: item.categoryId || item.canonical.canonicalKey,
              _normalizedAt: Timestamp.now(),
            });
            executed.inventory++;
          } catch (e: any) {
            executed.errors.push(`inv ${item.docId}: ${e.message}`);
          }
        }
      }

      // 4b: Aggiorna serviceConfigs
      for (const { propId, newConfigs } of propsToUpdate) {
        try {
          await adminDb.collection("properties").doc(propId).update({
            serviceConfigs: newConfigs,
            _configsNormalizedAt: Timestamp.now(),
          });
          executed.configs++;
        } catch (e: any) {
          executed.errors.push(`prop ${propId}: ${e.message}`);
        }
      }

      // 4c: Aggiorna ordini
      const BATCH_SIZE = 400;
      for (let i = 0; i < ordersToUpdate.length; i += BATCH_SIZE) {
        const batch = adminDb.batch();
        const chunk = ordersToUpdate.slice(i, i + BATCH_SIZE);
        for (const { orderId, newItems } of chunk) {
          batch.update(adminDb.collection("orders").doc(orderId), {
            items: newItems,
            _itemsNormalizedAt: Timestamp.now(),
          });
        }
        try {
          await batch.commit();
          executed.orders += chunk.length;
        } catch (e: any) {
          executed.errors.push(`batch ordini: ${e.message}`);
        }
      }
    }

    return NextResponse.json({
      mode: execute ? "EXECUTE" : "DRY RUN (aggiungi &execute=true per eseguire)",
      timestamp: new Date().toISOString(),
      
      randomIdItems: randomIdItems.map(i => ({
        docId: i.docId,
        name: i.name,
        currentKey: i.key,
        willMapTo: i.canonical?.canonicalKey || '⚠️ NON RICONOSCIUTO — richiede fix manuale',
      })),

      replaceMap: Object.fromEntries(replaceMap),

      summary: {
        inventoryItemsWithRandomId: randomIdItems.length,
        identifiedAndMappable: randomIdItems.filter(i => i.canonical).length,
        unidentified: randomIdItems.filter(i => !i.canonical).length,
        serviceConfigsToFix: configsFixed,
        ordersToFix: ordersFixed,
      },

      configFixDetails: configFixDetails.slice(0, 20),
      orderFixDetails: orderFixDetails.slice(0, 30),

      ...(execute ? { executed } : {}),
    });
  } catch (error: any) {
    console.error("[fix-inventory-ids] Errore:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
