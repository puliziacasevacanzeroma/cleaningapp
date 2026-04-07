/**
 * GET /api/cron/fix-inventory-ids?secret=XXXX
 *   → DRY RUN
 * GET /api/cron/fix-inventory-ids?secret=XXXX&execute=true
 *   → ESEGUE
 * 
 * Per OGNI item inventario con ID Firestore auto-generato:
 * 1. Genera una key leggibile dal nome (slug)
 * 2. Salva la key nell'item inventario
 * 3. Sostituisce l'ID in tutte le serviceConfigs
 * 4. Sostituisce l'ID in tutti gli ordini PENDING/READY e aggiorna il campo name
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";
const CRON_SECRET = process.env.CRON_SECRET;

// ID di sistema (già OK)
const SYSTEM_DOC_IDS = new Set([
  'item_doubleSheets', 'item_singleSheets', 'item_pillowcases',
  'item_towelsLarge', 'item_towelsFace', 'item_towelsSmall', 'item_bathMats',
]);

// Genera una key leggibile da un nome italiano
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // rimuovi accenti
    .replace(/[^a-z0-9\s]/g, '') // rimuovi caratteri speciali
    .trim()
    .replace(/\s+/g, '_') // spazi → underscore
    .slice(0, 40); // max 40 char
}

export async function GET(req: NextRequest) {
  const urlSecret = req.nextUrl.searchParams.get("secret");
  if (urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const execute = req.nextUrl.searchParams.get("execute") === "true";

  try {
    // ══════════════════════════════════════════════════
    // FASE 1: Trova item con ID random, genera key
    // ══════════════════════════════════════════════════
    const invSnap = await adminDb.collection("inventory").get();
    const allItems = invSnap.docs.map(d => ({ docId: d.id, ...d.data() })) as any[];

    // Trova item che hanno bisogno di una key
    const itemsToFix: Array<{
      docId: string;
      name: string;
      currentKey: string | null;
      newKey: string;
    }> = [];

    // Set di key già esistenti (per evitare duplicati)
    const existingKeys = new Set<string>();
    allItems.forEach(item => {
      if (item.key) existingKeys.add(item.key);
    });

    for (const item of allItems) {
      if (SYSTEM_DOC_IDS.has(item.docId)) continue; // sistema → skip
      if (item.key && item.key.length > 0 && item.key !== item.docId) continue; // ha già una key valida

      const isRandomId = item.docId.length >= 15 && !item.docId.startsWith('item_');
      if (!isRandomId) continue;

      const name = item.name || '';
      if (!name) continue;

      // Genera key unica
      let baseKey = slugify(name);
      if (!baseKey) baseKey = `item_${item.docId.slice(0, 8)}`;
      
      let finalKey = baseKey;
      let counter = 2;
      while (existingKeys.has(finalKey)) {
        finalKey = `${baseKey}_${counter}`;
        counter++;
      }
      existingKeys.add(finalKey);

      itemsToFix.push({
        docId: item.docId,
        name: name,
        currentKey: item.key || null,
        newKey: finalKey,
      });
    }

    // Mappa di sostituzione: vecchioId → nuovaKey
    const replaceMap = new Map<string, { newKey: string; name: string }>();
    for (const item of itemsToFix) {
      replaceMap.set(item.docId, { newKey: item.newKey, name: item.name });
    }

    // ══════════════════════════════════════════════════
    // FASE 2: Scansiona serviceConfigs
    // ══════════════════════════════════════════════════
    const propsSnap = await adminDb.collection("properties").get();
    let configsFixed = 0;
    const configFixDetails: string[] = [];
    const propsToUpdate: Array<{ propId: string; newConfigs: any }> = [];

    function replaceIdsInObject(obj: Record<string, number>): { result: Record<string, number>; changed: boolean } {
      const result: Record<string, number> = {};
      let changed = false;
      for (const [key, val] of Object.entries(obj)) {
        const replacement = replaceMap.get(key);
        if (replacement) {
          result[replacement.newKey] = (result[replacement.newKey] || 0) + (val as number);
          changed = true;
        } else {
          result[key] = (result[key] || 0) + (val as number);
        }
      }
      return { result, changed };
    }

    for (const propDoc of propsSnap.docs) {
      const prop = propDoc.data() as any;
      if (!prop.serviceConfigs) continue;

      let propChanged = false;
      const newConfigs = JSON.parse(JSON.stringify(prop.serviceConfigs));

      for (const [, cfg] of Object.entries(newConfigs) as [string, any][]) {
        // Fix bl
        if (cfg.bl && typeof cfg.bl === 'object') {
          for (const [blKey, blVal] of Object.entries(cfg.bl)) {
            if (typeof blVal === 'object' && blVal !== null) {
              const { result, changed } = replaceIdsInObject(blVal as Record<string, number>);
              if (changed) { cfg.bl[blKey] = result; propChanged = true; }
            }
          }
        }
        // Fix ba, ki, ex
        for (const section of ['ba', 'ki', 'ex'] as const) {
          if (cfg[section] && typeof cfg[section] === 'object') {
            const { result, changed } = replaceIdsInObject(cfg[section] as Record<string, number>);
            if (changed) { cfg[section] = result; propChanged = true; }
          }
        }
      }

      if (propChanged) {
        configsFixed++;
        configFixDetails.push(prop.name || propDoc.id);
        propsToUpdate.push({ propId: propDoc.id, newConfigs });
      }
    }

    // ══════════════════════════════════════════════════
    // FASE 3: Scansiona TUTTI gli ordini (non solo PENDING)
    // ══════════════════════════════════════════════════
    const ordersSnap = await adminDb.collection("orders")
      .where("status", "in", ["PENDING", "READY", "IN_TRANSIT", "PICKING"])
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
        if (replacement) {
          changed = true;
          return {
            ...item,
            id: replacement.newKey,
            name: replacement.name,
          };
        }
        return item;
      });

      if (changed) {
        ordersFixed++;
        const propName = order.propertyName || '?';
        const dateStr = order.scheduledDate?.toDate ? order.scheduledDate.toDate().toLocaleDateString('it-IT') : '?';
        orderFixDetails.push(`${propName} (${dateStr})`);
        ordersToUpdate.push({ orderId: orderDoc.id, newItems });
      }
    }

    // ══════════════════════════════════════════════════
    // FASE 4: Esecuzione
    // ══════════════════════════════════════════════════
    let executed = { inventory: 0, configs: 0, orders: 0, errors: [] as string[] };

    if (execute && itemsToFix.length > 0) {
      // 4a: Aggiorna item inventario
      for (const item of itemsToFix) {
        try {
          await adminDb.collection("inventory").doc(item.docId).update({
            key: item.newKey,
            _keyAssignedAt: Timestamp.now(),
          });
          executed.inventory++;
        } catch (e: any) {
          executed.errors.push(`inv ${item.docId}: ${e.message}`);
        }
      }

      // 4b: Aggiorna serviceConfigs
      for (const { propId, newConfigs } of propsToUpdate) {
        try {
          await adminDb.collection("properties").doc(propId).update({
            serviceConfigs: newConfigs,
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
          batch.update(adminDb.collection("orders").doc(orderId), { items: newItems });
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
      
      itemsToFix: itemsToFix.map(i => ({
        docId: i.docId,
        name: i.name,
        newKey: i.newKey,
      })),

      summary: {
        inventoryItemsToFix: itemsToFix.length,
        serviceConfigsToFix: configsFixed,
        ordersToFix: ordersFixed,
      },

      affectedProperties: configFixDetails,
      affectedOrders: orderFixDetails.slice(0, 50),

      ...(execute ? { executed } : {}),
    });
  } catch (error: any) {
    console.error("[fix-inventory-ids] Errore:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
