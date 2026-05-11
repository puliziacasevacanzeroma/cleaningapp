// src/app/api/debug/historical-incongruences-v1/route.ts
// API DI SOLA LETTURA — Conta incongruenze biancheria negli ultimi N giorni.
//
// IMPORTANTE: usa getItemName da ~/lib/itemNames (la fonte di verità deployata).
// Non hardcoda nomi né mappe locali per evitare nomi obsoleti.
//
// Filtri richiesti dall'utente:
//   - Tutti gli stati ordine (DELIVERED, IN_TRANSIT, ASSIGNED, PENDING)
//   - Confronto contro serviceConfigs[guestsCount] (configuratore standard)
//   - Items: SOLO biancheria + cortesia (esclude prodotti pulizia)
//   - Pulizie con customLinenConfig attivo segnalate separatamente
//
// USAGE:
//   GET /api/debug/historical-incongruences-v1?cronSecret=XXX&days=11
//   oppure header: Authorization: Bearer XXX
//
// Zero scritture. Sicura in produzione.

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getItemName } from "~/lib/itemNames";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ============================================================
// CATEGORIZZAZIONE ITEMS
// L'inventory ha un campo 'category' (o 'tipo'/'type'):
//   - 'biancheria'/'linen'/'cortesia'/'amenity' → INCLUSO
//   - 'pulizia'/'cleaning'/'detergente' → ESCLUSO
// In assenza di category, ricado su una whitelist di item ID noti.
// ============================================================

// Whitelist di item ID (biancheria + cortesia) come fallback se non c'è 'category' nell'inventory.
const WHITELIST_ITEM_IDS = new Set([
  // Biancheria
  "towelsSmall",
  "towelsFace",
  "towelsLarge",
  "bathMats",
  "pillowcases",
  "doubleSheets",
  "singleSheets",
  "canavaccio_cucina",
  // Cortesia
  "bagnoschiuma",
  "shampoo",
  "saponetta",
  "crema",
  "cremaCorpo",
  // Varianti item_*
  "item_towelsSmall",
  "item_towelsFace",
  "item_towelsLarge",
  "item_bathMats",
  "item_pillowcases",
  "item_doubleSheets",
  "item_singleSheets",
  "item_canavaccio_cucina",
  "item_bagnoschiuma",
  "item_shampoo",
  "item_saponetta",
  "item_crema",
  "item_cremaCorpo",
]);

const CLEANING_PRODUCT_CATEGORIES = new Set([
  "pulizia",
  "cleaning",
  "prodotti",
  "products",
  "detergente",
  "detergenti",
  "detergent",
]);

const LINEN_AMENITY_CATEGORIES = new Set([
  "biancheria",
  "linen",
  "linens",
  "cortesia",
  "amenity",
  "amenities",
  "courtesy",
]);

function shouldIncludeItem(itemId: string, categoryById: Map<string, string>): boolean {
  const cat = categoryById.get(itemId);
  if (cat) {
    const catNorm = String(cat).toLowerCase().trim();
    if (CLEANING_PRODUCT_CATEGORIES.has(catNorm)) return false;
    if (LINEN_AMENITY_CATEGORIES.has(catNorm)) return true;
  }
  if (WHITELIST_ITEM_IDS.has(itemId)) return true;
  if (itemId.startsWith("item_")) {
    const base = itemId.slice(5);
    if (WHITELIST_ITEM_IDS.has(base)) return true;
  }
  return false;
}

// ============================================================
// HELPERS
// ============================================================

function serializeDate(v: any): string | null {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  return null;
}

// Calcola gli items attesi da serviceConfigs[guestsCount] (logica identica a update-linen-order)
function computeExpectedItems(
  serviceConfig: any,
  categoryById: Map<string, string>,
): Map<string, number> {
  const result = new Map<string, number>();
  if (!serviceConfig || typeof serviceConfig !== "object") return result;

  const addItem = (itemId: string, qty: number) => {
    if (!itemId || !isFinite(qty) || qty <= 0) return;
    if (!shouldIncludeItem(itemId, categoryById)) return;
    result.set(itemId, (result.get(itemId) || 0) + qty);
  };

  // bl: biancheria letto
  if (serviceConfig.bl && typeof serviceConfig.bl === "object") {
    const blKeys = Object.keys(serviceConfig.bl);
    const hasAll =
      serviceConfig.bl["all"] &&
      typeof serviceConfig.bl["all"] === "object" &&
      Object.keys(serviceConfig.bl["all"]).length > 0;
    const bedGroupKeys = blKeys.filter((k) => k !== "all");
    const hasBedGroups =
      bedGroupKeys.length > 0 &&
      bedGroupKeys.some((k) => {
        const grp = serviceConfig.bl[k];
        return grp && typeof grp === "object" && Object.keys(grp).length > 0;
      });

    if (hasAll && hasBedGroups) {
      const merged: Record<string, number> = {};
      bedGroupKeys.forEach((k) => {
        const grp = serviceConfig.bl[k];
        if (grp && typeof grp === "object") {
          Object.entries(grp as Record<string, number>).forEach(([id, q]) => {
            if (typeof q === "number" && q > 0) merged[id] = (merged[id] || 0) + q;
          });
        }
      });
      Object.entries(serviceConfig.bl["all"]).forEach(([id, q]) => {
        if (typeof q === "number" && q > 0) merged[id] = q as number;
      });
      Object.entries(merged).forEach(([id, q]) => addItem(id, q));
    } else if (hasAll) {
      Object.entries(serviceConfig.bl["all"]).forEach(([id, q]) => {
        if (typeof q === "number") addItem(id, q);
      });
    } else {
      Object.entries(serviceConfig.bl).forEach(([_bedId, items]) => {
        if (typeof items === "object" && items !== null) {
          Object.entries(items as Record<string, number>).forEach(([id, q]) => {
            if (typeof q === "number") addItem(id, q);
          });
        }
      });
    }
  }

  // ba: biancheria bagno
  if (serviceConfig.ba && typeof serviceConfig.ba === "object") {
    Object.entries(serviceConfig.ba).forEach(([id, q]) => {
      if (typeof q === "number") addItem(id, q);
    });
  }

  // ki: kit cortesia
  if (serviceConfig.ki && typeof serviceConfig.ki === "object") {
    Object.entries(serviceConfig.ki).forEach(([id, q]) => {
      if (typeof q === "number") addItem(id, q);
    });
  }

  return result;
}

// Estrai items "biancheria+cortesia" dall'ordine reale (escludendo prodotti pulizia)
function extractActualItems(
  orderItems: any[],
  categoryById: Map<string, string>,
): Map<string, number> {
  const result = new Map<string, number>();
  if (!Array.isArray(orderItems)) return result;
  for (const it of orderItems) {
    if (!it) continue;
    const id = it.id || it.itemId;
    const qty = Number(it.quantity || it.qty || 0);
    if (!id || qty <= 0) continue;
    if (!shouldIncludeItem(id, categoryById)) continue;
    result.set(id, (result.get(id) || 0) + qty);
  }
  return result;
}

// Diff
function diffMaps(expected: Map<string, number>, actual: Map<string, number>) {
  const missing: { id: string; name: string; qty: number }[] = [];
  const extra: { id: string; name: string; qty: number }[] = [];
  const qtyMismatch: { id: string; name: string; expectedQty: number; actualQty: number }[] = [];

  const allKeys = new Set([...expected.keys(), ...actual.keys()]);
  for (const id of allKeys) {
    const e = expected.get(id) || 0;
    const a = actual.get(id) || 0;
    const name = getItemName(id);
    if (e > 0 && a === 0) missing.push({ id, name, qty: e });
    else if (e === 0 && a > 0) extra.push({ id, name, qty: a });
    else if (e !== a) qtyMismatch.push({ id, name, expectedQty: e, actualQty: a });
  }

  const totalDelta =
    missing.reduce((s, x) => s + x.qty, 0) +
    extra.reduce((s, x) => s + x.qty, 0) +
    qtyMismatch.reduce((s, x) => s + Math.abs(x.expectedQty - x.actualQty), 0);

  return { missing, extra, qtyMismatch, totalDelta };
}

// ============================================================
// ENDPOINT
// ============================================================

export async function GET(req: NextRequest) {
  // Auth
  const CRON_SECRET = process.env.CRON_SECRET || "";
  if (!CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET non configurato" }, { status: 500 });
  }
  const authHeader = req.headers.get("authorization") || "";
  const urlSecret = req.nextUrl.searchParams.get("cronSecret") || "";
  if (authHeader !== `Bearer ${CRON_SECRET}` && urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const daysParam = req.nextUrl.searchParams.get("days");
  const days = Math.max(1, Math.min(60, parseInt(daysParam || "11", 10) || 11));

  const now = new Date();
  const sinceDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  try {
    // 1. Carica inventory per leggere le categorie
    const inventorySnap = await adminDb.collection("inventory").get();
    const categoryById = new Map<string, string>();
    inventorySnap.docs.forEach((d) => {
      const data = d.data() as any;
      const cat = data?.category || data?.tipo || data?.type || "";
      if (cat) categoryById.set(d.id, String(cat));
    });

    // 2. Pulizie negli ultimi N giorni
    const cleaningsSnap = await adminDb
      .collection("cleanings")
      .where("scheduledDate", ">=", Timestamp.fromDate(sinceDate))
      .where("scheduledDate", "<=", Timestamp.fromDate(now))
      .get();

    const cleanings = cleaningsSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    }));

    // 3. Proprietà
    const propertyIds = Array.from(
      new Set(cleanings.map((c) => c.propertyId).filter(Boolean)),
    );
    const propertiesMap = new Map<string, any>();
    for (let i = 0; i < propertyIds.length; i += 10) {
      const batch = propertyIds.slice(i, i + 10);
      const refs = batch.map((id) => adminDb.collection("properties").doc(id));
      const snaps = await adminDb.getAll(...refs);
      snaps.forEach((s) => {
        if (s.exists) propertiesMap.set(s.id, { id: s.id, ...(s.data() as any) });
      });
    }

    // 4. Ordini collegati
    const orderIds = Array.from(
      new Set(cleanings.map((c) => c.laundryOrderId).filter(Boolean)),
    );
    const ordersMap = new Map<string, any>();
    for (let i = 0; i < orderIds.length; i += 10) {
      const batch = orderIds.slice(i, i + 10);
      const refs = batch.map((id) => adminDb.collection("orders").doc(id));
      const snaps = await adminDb.getAll(...refs);
      snaps.forEach((s) => {
        if (s.exists) ordersMap.set(s.id, { id: s.id, ...(s.data() as any) });
      });
    }

    // 5. Analisi
    const VALID_STATUSES = new Set(["PENDING", "ASSIGNED", "IN_TRANSIT", "DELIVERED"]);

    let totalCleaningsAnalyzed = 0;
    let cleaningsWithOrder = 0;
    let ordersOK = 0;
    let ordersWithMismatch = 0;
    let skippedOwnLinen = 0;
    let skippedNoConfig = 0;
    let skippedCustomActive = 0;
    let skippedInvalidStatus = 0;

    const byPropertyMap = new Map<
      string,
      { name: string; total: number; mismatchCount: number }
    >();
    const topProblemItems = new Map<string, { name: string; totalDelta: number }>();
    const mismatchCases: any[] = [];
    const customCases: any[] = [];

    for (const cleaning of cleanings) {
      totalCleaningsAnalyzed += 1;
      const propertyId = cleaning.propertyId;
      const orderId = cleaning.laundryOrderId;
      if (!propertyId || !orderId) continue;

      const property = propertiesMap.get(propertyId);
      const order = ordersMap.get(orderId);
      if (!property || !order) continue;

      if (!VALID_STATUSES.has(order.status)) {
        skippedInvalidStatus += 1;
        continue;
      }

      cleaningsWithOrder += 1;

      const propName = property.name || propertyId;
      const pBucket = byPropertyMap.get(propertyId) || {
        name: propName,
        total: 0,
        mismatchCount: 0,
      };
      pBucket.total += 1;
      byPropertyMap.set(propertyId, pBucket);

      if (property.usesOwnLinen === true) {
        skippedOwnLinen += 1;
        continue;
      }

      const guestsCount = Number(cleaning.guestsCount);
      if (!isFinite(guestsCount) || guestsCount <= 0) {
        skippedNoConfig += 1;
        continue;
      }

      const serviceConfigs = property.serviceConfigs;
      const serviceConfig =
        serviceConfigs?.[guestsCount] ?? serviceConfigs?.[String(guestsCount)];
      if (!serviceConfig) {
        skippedNoConfig += 1;
        continue;
      }

      const hasCustomConfig = !!cleaning.customLinenConfig;
      const linenConfigModified = cleaning.linenConfigModified === true;
      const isCustomActive = hasCustomConfig && linenConfigModified;

      const expected = computeExpectedItems(serviceConfig, categoryById);
      const actual = extractActualItems(order.items || [], categoryById);
      const diff = diffMaps(expected, actual);

      const orderScheduledDate = serializeDate(cleaning.scheduledDate);

      if (diff.totalDelta === 0) {
        ordersOK += 1;
        continue;
      }

      if (isCustomActive) {
        skippedCustomActive += 1;
        customCases.push({
          cleaningId: cleaning.id,
          orderId,
          propertyId,
          propertyName: propName,
          scheduledDate: orderScheduledDate,
          orderStatus: order.status,
          guestsCount,
          maxGuests: property.maxGuests,
          customLinenConfigActive: true,
          note:
            "Pulizia con customLinenConfig attivo. Differenza rispetto a serviceConfigs è prevista.",
          diff,
        });
        continue;
      }

      ordersWithMismatch += 1;
      pBucket.mismatchCount += 1;

      for (const m of diff.missing) {
        const cur = topProblemItems.get(m.id) || { name: m.name, totalDelta: 0 };
        cur.totalDelta += m.qty;
        topProblemItems.set(m.id, cur);
      }
      for (const m of diff.extra) {
        const cur = topProblemItems.get(m.id) || { name: m.name, totalDelta: 0 };
        cur.totalDelta += m.qty;
        topProblemItems.set(m.id, cur);
      }
      for (const m of diff.qtyMismatch) {
        const cur = topProblemItems.get(m.id) || { name: m.name, totalDelta: 0 };
        cur.totalDelta += Math.abs(m.expectedQty - m.actualQty);
        topProblemItems.set(m.id, cur);
      }

      const severity =
        order.status === "DELIVERED" || order.status === "IN_TRANSIT"
          ? "CRITICAL"
          : "WARNING";

      mismatchCases.push({
        cleaningId: cleaning.id,
        orderId,
        propertyId,
        propertyName: propName,
        scheduledDate: orderScheduledDate,
        orderStatus: order.status,
        guestsCount,
        orderGuestsCount: order.guestsCount ?? null,
        maxGuests: property.maxGuests,
        hasCustomConfigOrphan: hasCustomConfig && !linenConfigModified,
        expectedSource: `serviceConfigs[${guestsCount}]`,
        orderConfigSource: order.configSource || null,
        severity,
        diff,
      });
    }

    // 6. Output
    const byProperty = Array.from(byPropertyMap.entries())
      .map(([id, v]) => ({
        propertyId: id,
        propertyName: v.name,
        ordersAnalyzed: v.total,
        ordersWithMismatch: v.mismatchCount,
      }))
      .filter((p) => p.ordersWithMismatch > 0)
      .sort((a, b) => b.ordersWithMismatch - a.ordersWithMismatch);

    const topItems = Array.from(topProblemItems.entries())
      .map(([id, v]) => ({ itemId: id, itemName: v.name, totalDelta: v.totalDelta }))
      .sort((a, b) => b.totalDelta - a.totalDelta)
      .slice(0, 20);

    const critical = mismatchCases
      .filter((m) => m.severity === "CRITICAL")
      .sort((a, b) => (b.diff.totalDelta || 0) - (a.diff.totalDelta || 0));
    const warnings = mismatchCases
      .filter((m) => m.severity === "WARNING")
      .sort((a, b) => (b.diff.totalDelta || 0) - (a.diff.totalDelta || 0));

    return NextResponse.json({
      success: true,
      query: {
        days,
        sinceIso: sinceDate.toISOString(),
        untilIso: now.toISOString(),
      },
      summary: {
        cleaningsAnalyzed: totalCleaningsAnalyzed,
        cleaningsWithOrder,
        ordersOK,
        ordersWithMismatch,
        criticalCount: critical.length,
        warningCount: warnings.length,
        customConfigCount: customCases.length,
        skipped: {
          ownLinen: skippedOwnLinen,
          noServiceConfig: skippedNoConfig,
          customConfigActive: skippedCustomActive,
          invalidOrderStatus: skippedInvalidStatus,
        },
      },
      byProperty,
      topProblemItems: topItems,
      criticalCases: critical,
      warningCases: warnings,
      customConfigCases: customCases,
      meta: {
        elapsedMs: Date.now() - startedAt,
        inventoryItemsLoaded: inventorySnap.size,
        inventoryWithCategory: categoryById.size,
      },
    });
  } catch (err: any) {
    console.error("[historical-incongruences-v1] error", err);
    return NextResponse.json(
      {
        success: false,
        error: err?.message || String(err),
        stack: err?.stack || null,
      },
      { status: 500 },
    );
  }
}
