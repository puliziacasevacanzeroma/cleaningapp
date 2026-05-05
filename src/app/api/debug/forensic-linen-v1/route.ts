/**
 * ════════════════════════════════════════════════════════════════════
 * DEBUG: Analisi forense profonda per ogni ordine incoerente
 * ════════════════════════════════════════════════════════════════════
 *
 * GET /api/debug/forensic-linen-v1?cronSecret=XXX&onlyFuture=1
 *
 * Per ogni ordine incoerente trovato dallo scan, ricostruisce:
 *   - timestamp di tutti i campi della cleaning, order e property
 *   - tutti i campi "indizio" su come sono stati creati/modificati
 *   - confronta config attuale property con configSource scritta sull'ordine
 *   - verifica se cleaning.guestsCount è cambiato dopo creazione ordine
 *   - cerca tracce di chiamate a update-linen-order
 *   - identifica se c'è un mismatch tra "configSource" salvata sull'ordine
 *     e items effettivi (= ordine generato e poi config cambiata)
 *   - calcola serviceConfigs[N] vs items per ogni N possibile per scovare
 *     da quale config era originariamente nato l'ordine
 *
 * READ-ONLY assoluto.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

function extractExpectedItemsFromConfig(config: any): Record<string, number> {
  const expected: Record<string, number> = {};
  if (!config || typeof config !== "object") return expected;

  if (config.bl && typeof config.bl === "object") {
    const blKeys = Object.keys(config.bl);
    const hasAll =
      config.bl["all"] &&
      typeof config.bl["all"] === "object" &&
      Object.keys(config.bl["all"]).length > 0;
    const bedGroupKeys = blKeys.filter((k) => k !== "all");
    const hasBedGroups =
      bedGroupKeys.length > 0 &&
      bedGroupKeys.some((k: string) => {
        const items = config.bl[k];
        return items && typeof items === "object" && Object.keys(items).length > 0;
      });

    if (hasAll && hasBedGroups) {
      bedGroupKeys.forEach((k: string) => {
        const items = config.bl[k];
        if (items && typeof items === "object") {
          Object.entries(items).forEach(([itemId, qty]: [string, any]) => {
            if (typeof qty === "number" && qty > 0) {
              expected[itemId] = (expected[itemId] || 0) + qty;
            }
          });
        }
      });
      Object.entries(config.bl["all"]).forEach(([itemId, qty]: [string, any]) => {
        if (typeof qty === "number" && qty > 0) expected[itemId] = qty;
      });
    } else if (hasAll) {
      Object.entries(config.bl["all"]).forEach(([itemId, qty]: [string, any]) => {
        if (typeof qty === "number" && qty > 0) expected[itemId] = qty;
      });
    } else {
      Object.entries(config.bl).forEach(([bedId, items]: [string, any]) => {
        if (bedId === "all") return;
        if (items && typeof items === "object") {
          Object.entries(items).forEach(([itemId, qty]: [string, any]) => {
            if (typeof qty === "number" && qty > 0) {
              expected[itemId] = (expected[itemId] || 0) + qty;
            }
          });
        }
      });
    }
  }

  if (config.ba && typeof config.ba === "object") {
    Object.entries(config.ba).forEach(([itemId, qty]: [string, any]) => {
      if (typeof qty === "number" && qty > 0) {
        expected[itemId] = (expected[itemId] || 0) + qty;
      }
    });
  }

  if (config.ki && typeof config.ki === "object") {
    Object.entries(config.ki).forEach(([itemId, qty]: [string, any]) => {
      if (typeof qty === "number" && qty > 0) {
        expected[itemId] = (expected[itemId] || 0) + qty;
      }
    });
  }

  return expected;
}

function extractActualItemsFromOrder(order: any): Record<string, number> {
  const result: Record<string, number> = {};
  if (!Array.isArray(order?.items)) return result;
  for (const it of order.items) {
    const id = it.itemId || it.id;
    if (!id) continue;
    if (id === "_delivery_fee" || id === "_bed_making_fee") continue;
    if (it.type === "cleaning_product") continue;
    const qty = typeof it.quantity === "number" ? it.quantity : 0;
    if (qty <= 0) continue;
    result[id] = (result[id] || 0) + qty;
  }
  return result;
}

function itemsEqual(a: Record<string, number>, b: Record<string, number>): boolean {
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of allKeys) {
    if ((a[k] || 0) !== (b[k] || 0)) return false;
  }
  return true;
}

function itemsSimilarity(
  expected: Record<string, number>,
  actual: Record<string, number>,
): number {
  // Score 0..1 di quanto due set di items sono simili (overlap pesato)
  const allKeys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  let total = 0;
  let match = 0;
  for (const k of allKeys) {
    const e = expected[k] || 0;
    const a = actual[k] || 0;
    total += Math.max(e, a);
    match += Math.min(e, a);
  }
  return total === 0 ? 0 : match / total;
}

function tsToIso(ts: any): string | null {
  try {
    if (!ts) return null;
    if (typeof ts.toDate === "function") return ts.toDate().toISOString();
    if (ts instanceof Date) return ts.toISOString();
    if (typeof ts === "string") return ts;
    return null;
  } catch {
    return null;
  }
}

// ════════════════════════════════════════════════════════════
// HANDLER
// ════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  const urlSecret = searchParams.get("cronSecret") || searchParams.get("secret");
  if (cronSecret && urlSecret !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const daysBack = parseInt(searchParams.get("daysBack") || "30");
  const daysForward = parseInt(searchParams.get("daysForward") || "30");
  const onlyFuture = searchParams.get("onlyFuture") === "1";
  const propertyNameFilter = searchParams.get("propertyName")?.toLowerCase() || null;

  try {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - daysBack);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + daysForward);
    endDate.setHours(23, 59, 59, 999);
    const startTs = Timestamp.fromDate(startDate);
    const endTs = Timestamp.fromDate(endDate);

    const propsSnap = await adminDb.collection("properties").get();
    const propsById = new Map<string, any>();
    propsSnap.docs.forEach((d) => {
      propsById.set(d.id, { id: d.id, ...(d.data() as any) });
    });

    const cleaningsSnap = await adminDb
      .collection("cleanings")
      .where("scheduledDate", ">=", startTs)
      .where("scheduledDate", "<=", endTs)
      .get();

    const ordersSnap = await adminDb
      .collection("orders")
      .where("scheduledDate", ">=", startTs)
      .where("scheduledDate", "<=", endTs)
      .get();
    const ordersByCleaningId = new Map<string, any[]>();
    const ordersById = new Map<string, any>();
    ordersSnap.docs.forEach((d) => {
      const data = d.data() as any;
      const order = { id: d.id, ...data };
      ordersById.set(d.id, order);
      const cId = data.cleaningId;
      if (cId) {
        if (!ordersByCleaningId.has(cId)) ordersByCleaningId.set(cId, []);
        ordersByCleaningId.get(cId)!.push(order);
      }
    });

    const forensics: any[] = [];

    for (const cDoc of cleaningsSnap.docs) {
      const c = cDoc.data() as any;
      const cleaning = { id: cDoc.id, ...c };

      const scheduledDate: Date | null = c.scheduledDate?.toDate?.() || null;
      if (onlyFuture) {
        if (!scheduledDate || scheduledDate < now) continue;
      }

      const property = propsById.get(c.propertyId);
      if (!property) continue;
      if (property.usesOwnLinen === true) continue;
      if (property.autoGenerateLaundry === false) continue;

      if (
        propertyNameFilter &&
        !(property.name || "").toLowerCase().includes(propertyNameFilter)
      ) {
        continue;
      }

      // Trova ordine
      let order: any = null;
      if (c.laundryOrderId) {
        const candidate = ordersById.get(c.laundryOrderId);
        if (candidate && candidate.status !== "CANCELLED") order = candidate;
      }
      if (!order) {
        const linked = ordersByCleaningId.get(cleaning.id) || [];
        const active = linked.filter((o) => o.status !== "CANCELLED");
        if (active.length > 0) order = active[0];
      }
      if (!order) continue;

      const guestsCount = c.guestsCount || c.maxGuests || property.maxGuests || 2;

      // Config attesa
      const hasCustomConfig =
        c.linenConfigModified === true &&
        c.customLinenConfig &&
        typeof c.customLinenConfig === "object";

      let expectedConfig: any = null;
      let expectedSource: string;
      if (hasCustomConfig) {
        expectedConfig = c.customLinenConfig;
        expectedSource = "customLinenConfig";
      } else if (property.serviceConfigs) {
        expectedConfig =
          property.serviceConfigs[guestsCount] ||
          property.serviceConfigs[String(guestsCount)];
        expectedSource = `serviceConfigs[${guestsCount}]`;
      } else {
        continue;
      }
      if (!expectedConfig) continue;

      const expected = extractExpectedItemsFromConfig(expectedConfig);
      const actual = extractActualItemsFromOrder(order);

      // Solo casi incoerenti
      if (itemsEqual(expected, actual)) continue;

      // ─── ANALISI FORENSE ───

      // 1. Da quale serviceConfigs[N] potrebbe essere stato generato l'ordine?
      const matchingConfigs: { N: string; similarity: number; exact: boolean }[] = [];
      if (property.serviceConfigs) {
        for (const [N, cfg] of Object.entries(property.serviceConfigs as any)) {
          const items = extractExpectedItemsFromConfig(cfg);
          const sim = itemsSimilarity(items, actual);
          const exact = itemsEqual(items, actual);
          matchingConfigs.push({ N, similarity: sim, exact });
        }
      }
      matchingConfigs.sort((a, b) => b.similarity - a.similarity);

      // 2. Cleaning timestamps
      const cleaningCreatedAt = tsToIso(c.createdAt);
      const cleaningUpdatedAt = tsToIso(c.updatedAt);

      // 3. Order timestamps
      const orderCreatedAt = tsToIso(order.createdAt);
      const orderUpdatedAt = tsToIso(order.updatedAt);

      // 4. Property timestamp
      const propUpdatedAt = tsToIso(property.updatedAt);

      // 5. Indizi chiave
      const isOrderUpdatedAfterCreated =
        orderCreatedAt &&
        orderUpdatedAt &&
        new Date(orderUpdatedAt).getTime() > new Date(orderCreatedAt).getTime() + 1000;

      const isCleaningUpdatedAfterOrderUpdated =
        cleaningUpdatedAt &&
        orderUpdatedAt &&
        new Date(cleaningUpdatedAt).getTime() > new Date(orderUpdatedAt).getTime() + 1000;

      const isPropertyUpdatedAfterOrderUpdated =
        propUpdatedAt &&
        orderUpdatedAt &&
        new Date(propUpdatedAt).getTime() > new Date(orderUpdatedAt).getTime() + 1000;

      // 6. Pattern detection
      const patterns: string[] = [];

      // Pattern A: ordine generato da update-linen-order ma poi config cambiata
      if (
        order.itemsUpdatedFromConfig === true &&
        order.configSource &&
        isPropertyUpdatedAfterOrderUpdated
      ) {
        patterns.push(
          "PROPERTY_CONFIG_CHANGED_AFTER_ORDER: la proprietà è stata modificata DOPO l'ultimo update dell'ordine",
        );
      }

      // Pattern B: ordine generato da update-linen-order con configSource diversa da quella attesa
      if (order.configSource && order.configSource !== expectedSource) {
        patterns.push(
          `CONFIG_SOURCE_MISMATCH: ordine generato da '${order.configSource}', atteso '${expectedSource}'`,
        );
      }

      // Pattern C: items dell'ordine matchano una config diversa da quella attesa
      const exactMatchOtherConfig = matchingConfigs.find(
        (m) => m.exact && `serviceConfigs[${m.N}]` !== expectedSource,
      );
      if (exactMatchOtherConfig) {
        patterns.push(
          `ITEMS_MATCH_OTHER_CONFIG: gli items corrispondono ESATTAMENTE a serviceConfigs[${exactMatchOtherConfig.N}], non a quella attesa`,
        );
      }

      // Pattern D: ordine MAI rigenerato (no update dopo create)
      if (!isOrderUpdatedAfterCreated) {
        patterns.push(
          "ORDER_NEVER_UPDATED: ordine creato e mai più toccato — items sono quelli iniziali",
        );
      }

      // Pattern E: cleaning aggiornata DOPO l'ordine ma ordine non rigenerato
      if (isCleaningUpdatedAfterOrderUpdated) {
        patterns.push(
          "CLEANING_UPDATED_AFTER_ORDER: la pulizia è stata modificata dopo l'ultimo update dell'ordine — possibile cambio guestsCount o config non propagato",
        );
      }

      // Pattern F: ordine generato da iCal sync iniziale (quando guestsCount era diverso)
      if (
        order.guestsCount !== undefined &&
        order.guestsCount !== guestsCount
      ) {
        patterns.push(
          `ORDER_FROZEN_AT_INITIAL_GUESTS: order.guestsCount=${order.guestsCount}, cleaning.guestsCount=${guestsCount}`,
        );
      }

      // 7. Differenze articolo per articolo
      const itemDiffs: any[] = [];
      const allItemKeys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
      for (const k of allItemKeys) {
        const e = expected[k] || 0;
        const a = actual[k] || 0;
        if (e === a) continue;
        itemDiffs.push({ itemId: k, expected: e, actual: a, delta: a - e });
      }

      forensics.push({
        propertyName: property.name,
        propertyId: property.id,
        cleaningId: cleaning.id,
        orderId: order.id,
        scheduledDate: tsToIso(c.scheduledDate),
        scheduledDateLocal: scheduledDate?.toLocaleString("it-IT") || null,

        // ─── timestamps ───
        timeline: {
          cleaningCreatedAt,
          cleaningUpdatedAt,
          orderCreatedAt,
          orderUpdatedAt,
          propertyUpdatedAt: propUpdatedAt,
          isOrderUpdatedAfterCreated,
          isCleaningUpdatedAfterOrderUpdated,
          isPropertyUpdatedAfterOrderUpdated,
        },

        // ─── stato ───
        cleaning: {
          status: c.status,
          guestsCount,
          source: c.source || c.bookingSource || null,
          linenConfigModified: c.linenConfigModified === true,
          guestsAppliedBySystem: c.guestsAppliedBySystem === true,
          guestsConfirmed: c.guestsConfirmed === true,
          hasCustomLinenConfig: !!c.customLinenConfig,
          maxGuestsAtTimeOfCreation: c.maxGuestsAtTimeOfCreation || null,
        },
        order: {
          status: order.status,
          type: order.type,
          guestsCount: order.guestsCount,
          autoGenerated: order.autoGenerated === true,
          itemsUpdatedFromConfig: order.itemsUpdatedFromConfig === true,
          configSource: order.configSource || null,
        },

        // ─── analisi config ───
        expectedSource,
        expected,
        actual,
        itemDiffs,
        configsAvailable: property.serviceConfigs
          ? Object.keys(property.serviceConfigs)
          : [],
        bestMatchConfig: matchingConfigs[0] || null,
        allConfigMatches: matchingConfigs,

        // ─── verdetto ───
        patterns,
        rootCauseHypothesis: patterns[0] || "UNKNOWN",
      });
    }

    // Raggruppa per pattern principale
    const byPattern: Record<string, number> = {};
    forensics.forEach((f) => {
      const main = f.patterns[0] || "UNKNOWN";
      const tag = main.split(":")[0];
      byPattern[tag] = (byPattern[tag] || 0) + 1;
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      _legend: {
        PROPERTY_CONFIG_CHANGED_AFTER_ORDER:
          "La proprietà è stata modificata DOPO l'ultimo update dell'ordine. → Cambio config admin non propagato.",
        CONFIG_SOURCE_MISMATCH:
          "L'ordine è stato generato da una configSource diversa da quella attesa adesso (es. ordine fatto per 5 ospiti, ora richiesti 3).",
        ITEMS_MATCH_OTHER_CONFIG:
          "Gli items corrispondono ESATTAMENTE a una config diversa da quella attesa. → L'ordine è 'congelato' su un'altra config.",
        ORDER_NEVER_UPDATED:
          "L'ordine è stato creato e MAI più aggiornato dalla creazione iniziale.",
        CLEANING_UPDATED_AFTER_ORDER:
          "La pulizia è stata modificata dopo l'ultimo update dell'ordine. → Possibile cambio guestsCount/linenConfig fallito.",
        ORDER_FROZEN_AT_INITIAL_GUESTS:
          "order.guestsCount differisce da cleaning.guestsCount → ordine generato con vecchio numero ospiti.",
      },
      stats: {
        totalAnalyzed: forensics.length,
        byPattern,
      },
      forensics,
    });
  } catch (error: any) {
    console.error("Errore forensic-linen-v1:", error);
    return NextResponse.json(
      { error: "Errore server", message: error?.message },
      { status: 500 },
    );
  }
}
