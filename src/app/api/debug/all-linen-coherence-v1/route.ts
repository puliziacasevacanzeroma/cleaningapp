/**
 * ════════════════════════════════════════════════════════════════════
 * DEBUG: All Properties Linen Coherence v2 — ANALISI FORENSE COMPLETA
 * ════════════════════════════════════════════════════════════════════
 *
 * v2 vs v1:
 *  - Default finestra: 2 giorni (ieri + oggi) invece di 30
 *  - Filtro temporale applicato a CLEANINGS scheduledDate E a ORDERS scheduledDate
 *  - Normalizzazione nomi items FIXATA: prima passa per getItemName() (mappa
 *    completa), così i 3 calcolatori (calculateOrderItemsFromConfig,
 *    calculateDotazioni, order.items) producono chiavi confrontabili
 *  - Filtra fuori orfani CANCELLED (rumore noto del cron iCal)
 *
 * QUERY PARAMS (tutti opzionali):
 *   - propertyId=XXX
 *   - days=2                (default 2, max 365)
 *   - includeFuture=1       (default 1)
 *   - onlyMismatches=1      (default 0)
 *   - includeCancelledOrphans=1  (default 0: nasconde ordini orfani CANCELLED)
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import {
  calculateDotazioni,
  calculateOrderItemsFromConfig,
} from "~/lib/linen/linenService";
import { getItemName, ITEM_NAMES } from "~/lib/itemNames";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function tsToIso(ts: any): string | null {
  if (!ts) return null;
  try {
    if (typeof ts === "object" && typeof ts.toDate === "function") return ts.toDate().toISOString();
    if (ts instanceof Date) return ts.toISOString();
    if (typeof ts === "string") return ts;
    if (typeof ts === "number") return new Date(ts).toISOString();
    if (typeof ts === "object" && "_seconds" in ts) {
      return new Date(ts._seconds * 1000 + (ts._nanoseconds || 0) / 1e6).toISOString();
    }
  } catch {}
  return null;
}

function tsToDate(ts: any): Date | null {
  if (!ts) return null;
  try {
    if (typeof ts === "object" && typeof ts.toDate === "function") return ts.toDate();
    if (ts instanceof Date) return ts;
    if (typeof ts === "string") return new Date(ts);
    if (typeof ts === "number") return new Date(ts);
    if (typeof ts === "object" && "_seconds" in ts) {
      return new Date(ts._seconds * 1000 + (ts._nanoseconds || 0) / 1e6);
    }
  } catch {}
  return null;
}

/**
 * 🔧 Risolve il "nome canonico" di un item.
 * Strategia (provata in ordine, restituisce il primo match):
 *   1. ITEM_NAMES[id]    → mappa completa per ID grezzo
 *   2. ITEM_NAMES[name]  → caso "name è un id che la mappa conosce"
 *   3. Confronto fuzzy sui valori di ITEM_NAMES (case-insensitive)
 *   4. name (se è un nome leggibile)
 *   5. id (ultima spiaggia)
 *
 * Tutti normalizzati in lowercase trim.
 */
function resolveCanonicalName(it: { id?: string; name?: string; n?: string }): string {
  const id = (it.id || "").trim();
  const name = ((it.name || it.n || "") as string).trim();

  // 1. ID nella mappa
  if (id && ITEM_NAMES[id]) return ITEM_NAMES[id].toLowerCase();
  // 2. Name nella mappa (capita quando name === id grezzo)
  if (name && ITEM_NAMES[name]) return ITEM_NAMES[name].toLowerCase();
  // 3. Caso "il name è il valore italiano stesso"
  if (name) {
    const nameLower = name.toLowerCase();
    for (const v of Object.values(ITEM_NAMES)) {
      if (v.toLowerCase() === nameLower) return nameLower;
    }
  }
  // 4. Fallback: name leggibile (non Firestore ID)
  if (name && !/^[a-zA-Z0-9]{15,}$/.test(name)) return name.toLowerCase();
  // 5. Fallback assoluto: id
  return (id || name || "(unknown)").toLowerCase();
}

type NormalizedItems = Record<string, { quantity: number; rawIds: string[]; rawNames: string[] }>;

function normalizeByName(items: Array<{ id?: string; name?: string; n?: string; quantity?: number }>): NormalizedItems {
  const out: NormalizedItems = {};
  for (const it of items || []) {
    if (!it) continue;
    const qty = Number(it.quantity || 0);
    if (qty <= 0) continue;
    const canonical = resolveCanonicalName(it);
    if (!canonical) continue;
    if (!out[canonical]) out[canonical] = { quantity: 0, rawIds: [], rawNames: [] };
    out[canonical].quantity += qty;
    if (it.id && !out[canonical].rawIds.includes(it.id)) out[canonical].rawIds.push(it.id);
    const n = (it.name || it.n) as string | undefined;
    if (n && !out[canonical].rawNames.includes(n)) out[canonical].rawNames.push(n);
  }
  return out;
}

function diffItems(a: NormalizedItems, b: NormalizedItems): null | {
  missingInB: Array<{ name: string; quantity: number }>;
  extraInB: Array<{ name: string; quantity: number }>;
  quantityMismatch: Array<{ name: string; a: number; b: number }>;
  totalDelta: number;
} {
  const missingInB: Array<{ name: string; quantity: number }> = [];
  const extraInB: Array<{ name: string; quantity: number }> = [];
  const quantityMismatch: Array<{ name: string; a: number; b: number }> = [];

  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of allKeys) {
    const ax = a[key];
    const bx = b[key];
    if (ax && !bx) missingInB.push({ name: key, quantity: ax.quantity });
    else if (!ax && bx) extraInB.push({ name: key, quantity: bx.quantity });
    else if (ax && bx && ax.quantity !== bx.quantity) {
      quantityMismatch.push({ name: key, a: ax.quantity, b: bx.quantity });
    }
  }

  if (missingInB.length === 0 && extraInB.length === 0 && quantityMismatch.length === 0) return null;

  let totalDelta = 0;
  for (const m of missingInB) totalDelta += m.quantity;
  for (const m of extraInB) totalDelta += m.quantity;
  for (const m of quantityMismatch) totalDelta += Math.abs(m.a - m.b);

  return { missingInB, extraInB, quantityMismatch, totalDelta };
}

function itemsToList(items: NormalizedItems): Array<{ name: string; quantity: number; rawIds?: string[]; rawNames?: string[] }> {
  return Object.entries(items)
    .map(([name, v]) => ({
      name,
      quantity: v.quantity,
      rawIds: v.rawIds.length > 0 ? v.rawIds : undefined,
      rawNames: v.rawNames.length > 0 ? v.rawNames : undefined,
    }))
    .sort((x, y) => x.name.localeCompare(y.name));
}

// ─────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const CRON_SECRET = process.env.CRON_SECRET || "";
  if (!CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET non configurato" }, { status: 500 });
  }
  const authHeader = req.headers.get("authorization") || "";
  const urlSecret = req.nextUrl.searchParams.get("cronSecret") || "";
  if (authHeader !== `Bearer ${CRON_SECRET}` && urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const propertyIdFilter = sp.get("propertyId");
  let days = Number(sp.get("days") || 2);
  if (!Number.isFinite(days) || days < 1) days = 2;
  if (days > 365) days = 365;
  const includeFuture = sp.get("includeFuture") !== "0";
  const onlyMismatches = sp.get("onlyMismatches") === "1" || sp.get("onlyMismatches") === "true";
  const includeCancelledOrphans =
    sp.get("includeCancelledOrphans") === "1" || sp.get("includeCancelledOrphans") === "true";

  const startedAt = Date.now();

  try {
    const inventorySnap = await adminDb.collection("inventory").get();
    const inventory = inventorySnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    let propsQuery: FirebaseFirestore.Query = adminDb.collection("properties");
    if (propertyIdFilter) propsQuery = propsQuery.where("__name__", "==", propertyIdFilter);
    const propsSnap = await propsQuery.get();
    const properties = propsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    // Finestra temporale: ultimi N giorni (default 2 = ieri + oggi)
    const now = new Date();
    const since = new Date(now);
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);
    const sinceTs = Timestamp.fromDate(since);

    // Upper bound: oggi 23:59 oppure +2 anni se includeFuture
    const upperBound = new Date(now);
    if (includeFuture) {
      upperBound.setDate(upperBound.getDate() + 2); // 2 giorni nel futuro
      upperBound.setHours(23, 59, 59, 999);
    } else {
      upperBound.setHours(23, 59, 59, 999);
    }
    const upperBoundTs = Timestamp.fromDate(upperBound);

    const cleaningsSnap = await adminDb.collection("cleanings")
      .where("scheduledDate", ">=", sinceTs)
      .where("scheduledDate", "<=", upperBoundTs)
      .get();

    let cleanings = cleaningsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    if (propertyIdFilter) cleanings = cleanings.filter((c) => c.propertyId === propertyIdFilter);

    // ORDERS: filtro sullo stesso range scheduledDate
    let ordersQuery: FirebaseFirestore.Query = adminDb.collection("orders")
      .where("scheduledDate", ">=", sinceTs)
      .where("scheduledDate", "<=", upperBoundTs);
    const ordersSnap = await ordersQuery.get();
    let allOrders = ordersSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    if (propertyIdFilter) allOrders = allOrders.filter((o) => o.propertyId === propertyIdFilter);

    const ordersInRange = allOrders;

    const ordersByCleaningId: Record<string, any[]> = {};
    for (const o of ordersInRange) {
      if (!o.cleaningId) continue;
      (ordersByCleaningId[o.cleaningId] = ordersByCleaningId[o.cleaningId] || []).push(o);
    }

    const cleaningIdSet = new Set(cleanings.map((c) => c.id));
    let orphanOrders = ordersInRange.filter((o) => {
      if (!o.cleaningId) return true;
      return !cleaningIdSet.has(o.cleaningId);
    });
    // Filtra orfani CANCELLED (rumore noto)
    if (!includeCancelledOrphans) {
      orphanOrders = orphanOrders.filter((o) => o.status !== "CANCELLED");
    }

    const propertyById: Record<string, any> = {};
    for (const p of properties) propertyById[p.id] = p;

    type PulitziaAnalysis = {
      cleaningId: string;
      scheduledDate: string | null;
      scheduledTime: string | null;
      status: string | null;
      guestsCount: number;
      adulti: number | null;
      neonati: number | null;
      maxGuests: number | null;
      guestsConfirmed: boolean | null;
      guestsAppliedBySystem: boolean | null;
      linenConfigModified: boolean | null;
      hasCustomLinenConfig: boolean;
      hasLinenOrder: boolean | null;
      usesOwnLinen: boolean | null;
      orderId: string | null;
      orderStatus: string | null;
      orderConfigSource: string | null;
      orderItemsUpdatedFromConfig: boolean | null;
      orderGuestsCount: number | null;
      orderUpdatedAt: string | null;
      expectedItems: ReturnType<typeof itemsToList>;
      cardItems: ReturnType<typeof itemsToList>;
      orderItems: ReturnType<typeof itemsToList>;
      expectedSource: string;
      diffs: {
        expected_vs_card: ReturnType<typeof diffItems>;
        expected_vs_order: ReturnType<typeof diffItems>;
        card_vs_order: ReturnType<typeof diffItems>;
      };
      issues: string[];
      hasAnyMismatch: boolean;
    };

    type PropertyAnalysis = {
      propertyId: string;
      propertyName: string;
      maxGuests: number | null;
      bedrooms: number | null;
      bathrooms: number | null;
      usesOwnLinen: boolean | null;
      hasServiceConfigs: boolean;
      serviceConfigsKeys: string[];
      cleaningsAnalyzed: number;
      cleaningsWithMismatch: number;
      cleaningsWithoutOrder: number;
      summary: {
        expectedVsCardMismatches: number;
        expectedVsOrderMismatches: number;
        cardVsOrderMismatches: number;
        criticalIssuesCount: number;
      };
      cleanings: PulitziaAnalysis[];
    };

    const propertyAnalyses: PropertyAnalysis[] = [];

    for (const property of properties) {
      const propertyCleanings = cleanings
        .filter((c) => c.propertyId === property.id)
        .sort((a, b) => {
          const da = tsToDate(a.scheduledDate)?.getTime() || 0;
          const db = tsToDate(b.scheduledDate)?.getTime() || 0;
          return da - db;
        });

      if (propertyCleanings.length === 0 && !propertyIdFilter) continue; // skip proprietà senza pulizie nel range

      const analysis: PropertyAnalysis = {
        propertyId: property.id,
        propertyName: property.name || "(senza nome)",
        maxGuests: property.maxGuests ?? null,
        bedrooms: property.bedrooms ?? null,
        bathrooms: property.bathrooms ?? null,
        usesOwnLinen: property.usesOwnLinen ?? null,
        hasServiceConfigs: !!property.serviceConfigs,
        serviceConfigsKeys: property.serviceConfigs ? Object.keys(property.serviceConfigs) : [],
        cleaningsAnalyzed: 0,
        cleaningsWithMismatch: 0,
        cleaningsWithoutOrder: 0,
        summary: {
          expectedVsCardMismatches: 0,
          expectedVsOrderMismatches: 0,
          cardVsOrderMismatches: 0,
          criticalIssuesCount: 0,
        },
        cleanings: [],
      };

      for (const c of propertyCleanings) {
        const issues: string[] = [];
        const guestsCount = c.guestsCount || 2;
        const maxGuests = property.maxGuests ?? null;

        if (typeof maxGuests === "number" && guestsCount > maxGuests) {
          issues.push(`GUESTS_OVER_MAX: guestsCount=${guestsCount} > maxGuests=${maxGuests}`);
        }
        if (guestsCount < 1) issues.push(`GUESTS_INVALID: guestsCount=${guestsCount}`);
        if (guestsCount === 1 && typeof maxGuests === "number" && maxGuests >= 3) {
          issues.push(`GUESTS_SUSPICIOUS_LOW: guestsCount=1 ma maxGuests=${maxGuests}`);
        }
        if (c.linenConfigModified === false && c.customLinenConfig) {
          issues.push("ORPHAN_CUSTOM_CONFIG: customLinenConfig presente ma linenConfigModified=false");
        }
        if (c.linenConfigModified === true && !c.customLinenConfig) {
          issues.push("CUSTOM_CONFIG_MISSING: linenConfigModified=true ma customLinenConfig assente");
        }
        if (!property.serviceConfigs && !c.customLinenConfig && property.usesOwnLinen !== true) {
          issues.push("NO_CONFIG_AVAILABLE: proprietà senza serviceConfigs e pulizia senza customLinenConfig");
        }

        // ── [A] EXPECTED items ──
        let expectedItemsRaw: Array<{ id: string; name: string; quantity: number }> = [];
        let expectedSource = "none";
        const usesLinen =
          c.hasLinenOrder !== false &&
          !(c.hasLinenOrder === undefined && property.usesOwnLinen === true);

        if (usesLinen) {
          if (c.linenConfigModified === true && c.customLinenConfig) {
            try {
              const customSC: any = { [guestsCount]: c.customLinenConfig };
              expectedItemsRaw = calculateOrderItemsFromConfig(customSC, guestsCount);
              expectedSource = "customLinenConfig";
            } catch (e: any) {
              issues.push(`EXPECTED_CALC_FAILED_CUSTOM: ${e?.message || e}`);
            }
          } else if (property.serviceConfigs) {
            try {
              expectedItemsRaw = calculateOrderItemsFromConfig(property.serviceConfigs as any, guestsCount);
              expectedSource = `serviceConfigs[${guestsCount}]`;
              if (expectedItemsRaw.length === 0) {
                const keys = Object.keys(property.serviceConfigs);
                issues.push(
                  `EXPECTED_EMPTY: serviceConfigs[${guestsCount}] non trovata. Chiavi disponibili: [${keys.join(", ")}]`
                );
              }
            } catch (e: any) {
              issues.push(`EXPECTED_CALC_FAILED_PROP: ${e?.message || e}`);
            }
          }
        }
        const expectedItems = normalizeByName(expectedItemsRaw);

        // ── [B] CARD items ──
        let cardItemsRaw: Array<{ name: string; quantity: number }> = [];
        try {
          const dotaz = calculateDotazioni(
            {
              guestsCount,
              guestsConfirmed: c.guestsConfirmed,
              date: tsToDate(c.scheduledDate),
              customLinenConfig: c.customLinenConfig,
              linenConfigModified: c.linenConfigModified,
              hasLinenOrder: c.hasLinenOrder,
              price: c.price,
              contractPrice: c.contractPrice,
              holidayFee: c.holidayFee,
              holidayName: c.holidayName,
            },
            {
              id: property.id,
              name: property.name,
              bedrooms: property.bedrooms,
              bathrooms: property.bathrooms,
              maxGuests: property.maxGuests,
              cleaningPrice: property.cleaningPrice,
              beds: property.beds,
              bedsConfig: property.bedsConfig,
              serviceConfigs: property.serviceConfigs,
              usesOwnLinen: property.usesOwnLinen,
            },
            inventory as any
          );
          cardItemsRaw = [
            ...(dotaz.bedItems || []),
            ...(dotaz.bathItems || []),
            ...((dotaz.kitItems as any) || []),
          ];
        } catch (e: any) {
          issues.push(`CARD_CALC_FAILED: ${e?.message || e}`);
        }
        const cardItems = normalizeByName(cardItemsRaw);

        // ── [C] ORDER items ──
        const orders = ordersByCleaningId[c.id] || [];
        if (orders.length > 1) {
          issues.push(`DUPLICATE_ORDERS: ${orders.length} ordini collegati alla stessa pulizia`);
        }
        const order = orders[0] || null;
        const orderItemsRaw: Array<{ id: string; name: string; quantity: number }> = order?.items || [];
        const orderItems = normalizeByName(orderItemsRaw);

        if (usesLinen && !order) {
          issues.push("MISSING_ORDER: pulizia senza ordine biancheria collegato");
        }
        if (order && typeof order.guestsCount === "number" && order.guestsCount !== guestsCount) {
          issues.push(`ORDER_GUESTS_STALE: order.guestsCount=${order.guestsCount} ≠ cleaning.guestsCount=${guestsCount}`);
        }
        if (order && order.configSource && order.configSource !== "customLinenConfig") {
          const m = String(order.configSource).match(/serviceConfigs\[(\d+)\]/);
          if (m) {
            const orderCfgGuests = parseInt(m[1], 10);
            if (orderCfgGuests !== guestsCount) {
              issues.push(
                `ORDER_CONFIG_STALE: order.configSource=${order.configSource} non corrisponde a cleaning.guestsCount=${guestsCount}`
              );
            }
          }
        }

        const diff_ec = diffItems(expectedItems, cardItems);
        const diff_eo = diffItems(expectedItems, orderItems);
        const diff_co = diffItems(cardItems, orderItems);

        const hasAnyMismatch = !!(diff_ec || diff_eo || diff_co) || issues.length > 0;
        if (diff_ec) analysis.summary.expectedVsCardMismatches++;
        if (diff_eo) analysis.summary.expectedVsOrderMismatches++;
        if (diff_co) analysis.summary.cardVsOrderMismatches++;
        if (
          issues.some((i) =>
            /GUESTS_OVER_MAX|GUESTS_INVALID|MISSING_ORDER|ORDER_GUESTS_STALE|ORDER_CONFIG_STALE|DUPLICATE_ORDERS|ORPHAN_CUSTOM_CONFIG/.test(
              i
            )
          )
        ) {
          analysis.summary.criticalIssuesCount++;
        }

        const pulizia: PulitziaAnalysis = {
          cleaningId: c.id,
          scheduledDate: tsToIso(c.scheduledDate),
          scheduledTime: c.scheduledTime || null,
          status: c.status || null,
          guestsCount,
          adulti: typeof c.adulti === "number" ? c.adulti : null,
          neonati: typeof c.neonati === "number" ? c.neonati : null,
          maxGuests,
          guestsConfirmed: typeof c.guestsConfirmed === "boolean" ? c.guestsConfirmed : null,
          guestsAppliedBySystem:
            typeof c.guestsAppliedBySystem === "boolean" ? c.guestsAppliedBySystem : null,
          linenConfigModified:
            typeof c.linenConfigModified === "boolean" ? c.linenConfigModified : null,
          hasCustomLinenConfig: !!c.customLinenConfig,
          hasLinenOrder: typeof c.hasLinenOrder === "boolean" ? c.hasLinenOrder : null,
          usesOwnLinen: typeof property.usesOwnLinen === "boolean" ? property.usesOwnLinen : null,
          orderId: order?.id || null,
          orderStatus: order?.status || null,
          orderConfigSource: order?.configSource || null,
          orderItemsUpdatedFromConfig:
            typeof order?.itemsUpdatedFromConfig === "boolean"
              ? order.itemsUpdatedFromConfig
              : null,
          orderGuestsCount: typeof order?.guestsCount === "number" ? order.guestsCount : null,
          orderUpdatedAt: tsToIso(order?.updatedAt),
          expectedItems: itemsToList(expectedItems),
          cardItems: itemsToList(cardItems),
          orderItems: itemsToList(orderItems),
          expectedSource,
          diffs: {
            expected_vs_card: diff_ec,
            expected_vs_order: diff_eo,
            card_vs_order: diff_co,
          },
          issues,
          hasAnyMismatch,
        };

        analysis.cleaningsAnalyzed++;
        if (hasAnyMismatch) analysis.cleaningsWithMismatch++;
        if (usesLinen && !order) analysis.cleaningsWithoutOrder++;

        if (onlyMismatches && !hasAnyMismatch) continue;
        analysis.cleanings.push(pulizia);
      }

      propertyAnalyses.push(analysis);
    }

    const totals = {
      propertiesAnalyzed: propertyAnalyses.length,
      cleaningsAnalyzed: propertyAnalyses.reduce((s, p) => s + p.cleaningsAnalyzed, 0),
      cleaningsWithMismatch: propertyAnalyses.reduce((s, p) => s + p.cleaningsWithMismatch, 0),
      cleaningsWithoutOrder: propertyAnalyses.reduce((s, p) => s + p.cleaningsWithoutOrder, 0),
      orphanOrders: orphanOrders.length,
      expectedVsCardMismatches: propertyAnalyses.reduce(
        (s, p) => s + p.summary.expectedVsCardMismatches,
        0
      ),
      expectedVsOrderMismatches: propertyAnalyses.reduce(
        (s, p) => s + p.summary.expectedVsOrderMismatches,
        0
      ),
      cardVsOrderMismatches: propertyAnalyses.reduce(
        (s, p) => s + p.summary.cardVsOrderMismatches,
        0
      ),
      criticalIssuesCount: propertyAnalyses.reduce((s, p) => s + p.summary.criticalIssuesCount, 0),
    };

    const topProblematic = propertyAnalyses
      .filter((p) => p.cleaningsAnalyzed > 0)
      .map((p) => ({
        propertyId: p.propertyId,
        propertyName: p.propertyName,
        cleaningsAnalyzed: p.cleaningsAnalyzed,
        cleaningsWithMismatch: p.cleaningsWithMismatch,
        mismatchRate:
          p.cleaningsAnalyzed > 0 ? p.cleaningsWithMismatch / p.cleaningsAnalyzed : 0,
        criticalIssuesCount: p.summary.criticalIssuesCount,
      }))
      .sort((a, b) => b.mismatchRate - a.mismatchRate || b.criticalIssuesCount - a.criticalIssuesCount)
      .slice(0, 20);

    const elapsedMs = Date.now() - startedAt;

    return NextResponse.json({
      success: true,
      query: {
        propertyId: propertyIdFilter,
        days,
        includeFuture,
        onlyMismatches,
        includeCancelledOrphans,
      },
      window: {
        sinceIso: since.toISOString(),
        upperBoundIso: upperBound.toISOString(),
        nowIso: now.toISOString(),
      },
      totals,
      topProblematic,
      orphanOrders: orphanOrders.map((o) => ({
        orderId: o.id,
        propertyId: o.propertyId,
        cleaningId: o.cleaningId || null,
        status: o.status || null,
        scheduledDate: tsToIso(o.scheduledDate),
        itemsCount: Array.isArray(o.items) ? o.items.length : 0,
        configSource: o.configSource || null,
        reason: !o.cleaningId
          ? "ORDINE_SENZA_CLEANING_ID"
          : "CLEANING_ID_NON_TROVATO_NEL_RANGE",
      })),
      properties: propertyAnalyses,
      meta: {
        elapsedMs,
        inventoryItemsCount: inventory.length,
        ordersInRangeCount: ordersInRange.length,
        cleaningsInRangeCount: cleanings.length,
        propertiesTotalCount: properties.length,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Errore analisi forense",
        details: error?.message || String(error),
        stack: error?.stack || null,
      },
      { status: 500 }
    );
  }
}
