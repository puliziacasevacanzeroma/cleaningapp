/**
 * ════════════════════════════════════════════════════════════════════
 * DEBUG: All Properties Linen Coherence v1 — ANALISI FORENSE COMPLETA
 * ════════════════════════════════════════════════════════════════════
 *
 * Per OGNI proprietà attiva, per OGNI pulizia nella finestra temporale,
 * calcola 3 viste della biancheria e le confronta:
 *
 *   [A] EXPECTED   = ricalcolo deterministico da serviceConfigs/customLinenConfig
 *                    (la "verità" della configurazione)
 *   [B] CARD       = items mostrati nelle card pulizia (calculateDotazioni)
 *   [C] ORDER      = items reali salvati su orders.items (card consegna)
 *
 * Per ogni pulizia genera 3 diff:
 *   - expected_vs_card     → bug renderizzazione card pulizia
 *   - expected_vs_order    → bug ordine non sincronizzato (caso Villa Borghese)
 *   - card_vs_order        → divergenza fra cosa vede l'admin e cosa vede il rider/lavanderia
 *
 * Inoltre rileva:
 *   - Pulizie senza ordine (e che dovrebbero averlo)
 *   - Ordini orfani (senza cleaning collegato)
 *   - Pulizie con customLinenConfig orphan (linenConfigModified=false ma config presente)
 *   - guestsCount anomali (< 1, > maxGuests, == 1 con maxGuests > 1, ecc.)
 *   - configSource su ordine incoerente con cleaning.guestsCount attuale
 *
 * AUTH:
 *   - header Authorization: Bearer <CRON_SECRET>
 *   - query  ?cronSecret=<CRON_SECRET>
 *
 * QUERY PARAMS (tutti opzionali):
 *   - propertyId=XXX        analizza una sola proprietà
 *   - days=30               finestra storica (default 30, max 365)
 *   - includeFuture=1       include pulizie future (default 1)
 *   - onlyMismatches=1      output solo pulizie con almeno 1 incoerenza (default 0)
 *
 * READ-ONLY assoluto. Non scrive nulla su Firestore.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import {
  calculateDotazioni,
  calculateOrderItemsFromConfig,
} from "~/lib/linen/linenService";
import { getItemName } from "~/lib/itemNames";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minuti per analisi pesanti

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
 * Normalizza una lista di items in una mappa { itemId | name : quantity }
 * Per il confronto, usiamo `name` come chiave (perché le card usano name,
 * gli ordini usano id+name, expected usa id). Convertiamo tutto a name lowercased.
 */
type NormalizedItems = Record<string, { quantity: number; sourceKey: string }>;

function normalizeByName(items: Array<{ id?: string; name?: string; n?: string; quantity?: number }>): NormalizedItems {
  const out: NormalizedItems = {};
  for (const it of items || []) {
    if (!it) continue;
    const qty = Number(it.quantity || 0);
    if (qty <= 0) continue;
    // Determina il nome canonico: name → n → tradotto da id → id
    let canonical: string =
      (it.name as string) ||
      (it as any).n ||
      (it.id ? getItemName(it.id) : "") ||
      String(it.id || "(unknown)");
    canonical = canonical.toString().trim().toLowerCase();
    if (!canonical) continue;
    out[canonical] = {
      quantity: (out[canonical]?.quantity || 0) + qty,
      sourceKey: (it.id as string) || canonical,
    };
  }
  return out;
}

/**
 * Confronta due NormalizedItems e ritorna le differenze.
 * Ritorna null se identiche, altrimenti un oggetto con:
 *   - missingInB: items presenti in A ma non in B
 *   - extraInB: items presenti in B ma non in A
 *   - quantityMismatch: items presenti in entrambe ma con qty diversa
 */
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

  // Total delta = somma differenze
  let totalDelta = 0;
  for (const m of missingInB) totalDelta += m.quantity;
  for (const m of extraInB) totalDelta += m.quantity;
  for (const m of quantityMismatch) totalDelta += Math.abs(m.a - m.b);

  return { missingInB, extraInB, quantityMismatch, totalDelta };
}

function itemsToList(items: NormalizedItems): Array<{ name: string; quantity: number }> {
  return Object.entries(items)
    .map(([name, v]) => ({ name, quantity: v.quantity }))
    .sort((x, y) => x.name.localeCompare(y.name));
}

// ─────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────
  const CRON_SECRET = process.env.CRON_SECRET || "";
  if (!CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET non configurato" }, { status: 500 });
  }
  const authHeader = req.headers.get("authorization") || "";
  const urlSecret = req.nextUrl.searchParams.get("cronSecret") || "";
  if (authHeader !== `Bearer ${CRON_SECRET}` && urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Filtri ──────────────────────────────────────────
  const sp = req.nextUrl.searchParams;
  const propertyIdFilter = sp.get("propertyId");
  let days = Number(sp.get("days") || 30);
  if (!Number.isFinite(days) || days < 1) days = 30;
  if (days > 365) days = 365;
  const includeFuture = sp.get("includeFuture") !== "0";
  const onlyMismatches = sp.get("onlyMismatches") === "1" || sp.get("onlyMismatches") === "true";

  const startedAt = Date.now();

  try {
    // ── 1. CARICA INVENTORY (serve a calculateDotazioni) ─
    const inventorySnap = await adminDb.collection("inventory").get();
    const inventory = inventorySnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    // ── 2. CARICA PROPERTIES ────────────────────────────
    let propsQuery: FirebaseFirestore.Query = adminDb.collection("properties");
    if (propertyIdFilter) propsQuery = propsQuery.where("__name__", "==", propertyIdFilter);
    const propsSnap = await propsQuery.get();
    const properties = propsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    // ── 3. CARICA CLEANINGS nella finestra ──────────────
    const now = new Date();
    const since = new Date(now);
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);
    const sinceTs = Timestamp.fromDate(since);

    // Far past sentinel per il filtro "includeFuture"
    const farFuture = new Date(now);
    farFuture.setFullYear(farFuture.getFullYear() + 2);
    const farFutureTs = Timestamp.fromDate(farFuture);

    const cleaningsSnap = await adminDb.collection("cleanings")
      .where("scheduledDate", ">=", sinceTs)
      .where("scheduledDate", "<=", farFutureTs)
      .get();

    let cleanings = cleaningsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    if (propertyIdFilter) cleanings = cleanings.filter((c) => c.propertyId === propertyIdFilter);
    if (!includeFuture) {
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);
      cleanings = cleanings.filter((c) => {
        const d = tsToDate(c.scheduledDate);
        return d ? d <= todayEnd : false;
      });
    }

    // ── 4. CARICA ORDERS collegati a queste cleanings ───
    // Strategia: scarico tutti gli ordini (sono pochi) e poi indicizzo per cleaningId
    let ordersQuery: FirebaseFirestore.Query = adminDb.collection("orders");
    if (propertyIdFilter) ordersQuery = ordersQuery.where("propertyId", "==", propertyIdFilter);
    const ordersSnap = await ordersQuery.get();
    const allOrders = ordersSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    // Filtra ordini nel range temporale
    const ordersInRange = allOrders.filter((o) => {
      const d = tsToDate(o.scheduledDate);
      if (!d) return true; // keep undated to detect orphans
      if (d < since) return false;
      if (!includeFuture && d > now) return false;
      return true;
    });

    // Indice cleaningId → order(s)
    const ordersByCleaningId: Record<string, any[]> = {};
    for (const o of ordersInRange) {
      if (!o.cleaningId) continue;
      (ordersByCleaningId[o.cleaningId] = ordersByCleaningId[o.cleaningId] || []).push(o);
    }

    // ── 5. ORDINI ORFANI ────────────────────────────────
    const cleaningIdSet = new Set(cleanings.map((c) => c.id));
    const orphanOrders = ordersInRange.filter((o) => {
      if (!o.cleaningId) return true; // ordine senza cleaningId → orfano
      return !cleaningIdSet.has(o.cleaningId);
    });

    // ── 6. INDICIZZA PROPRIETÀ ──────────────────────────
    const propertyById: Record<string, any> = {};
    for (const p of properties) propertyById[p.id] = p;

    // ── 7. ANALISI PER PROPRIETÀ ────────────────────────
    type PulitziaAnalysis = {
      cleaningId: string;
      scheduledDate: string | null;
      scheduledTime: string | null;
      status: string | null;
      // Snapshot pulizia
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
      // Ordine collegato
      orderId: string | null;
      orderStatus: string | null;
      orderConfigSource: string | null;
      orderItemsUpdatedFromConfig: boolean | null;
      orderGuestsCount: number | null;
      orderUpdatedAt: string | null;
      // Items (3 viste)
      expectedItems: Array<{ name: string; quantity: number }>;
      cardItems: Array<{ name: string; quantity: number }>;
      orderItems: Array<{ name: string; quantity: number }>;
      expectedSource: string;
      // Diff
      diffs: {
        expected_vs_card: ReturnType<typeof diffItems>;
        expected_vs_order: ReturnType<typeof diffItems>;
        card_vs_order: ReturnType<typeof diffItems>;
      };
      // Issues
      issues: string[];
      // Severity
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

        // ── Issues sulla pulizia ──
        if (typeof maxGuests === "number" && guestsCount > maxGuests) {
          issues.push(`GUESTS_OVER_MAX: guestsCount=${guestsCount} > maxGuests=${maxGuests}`);
        }
        if (guestsCount < 1) {
          issues.push(`GUESTS_INVALID: guestsCount=${guestsCount}`);
        }
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
        // Replico la stessa logica di update-linen-order/route.ts
        let expectedItemsRaw: Array<{ id: string; name: string; quantity: number }> = [];
        let expectedSource = "none";
        const usesLinen =
          c.hasLinenOrder !== false &&
          !(c.hasLinenOrder === undefined && property.usesOwnLinen === true);

        if (usesLinen) {
          if (c.linenConfigModified === true && c.customLinenConfig) {
            // Custom config
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

        // ── [B] CARD items (calculateDotazioni) ──
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
        // Se più di un ordine collegato, è già un'anomalia
        if (orders.length > 1) {
          issues.push(`DUPLICATE_ORDERS: ${orders.length} ordini collegati alla stessa pulizia`);
        }
        const order = orders[0] || null;
        const orderItemsRaw: Array<{ id: string; name: string; quantity: number }> = order?.items || [];
        const orderItems = normalizeByName(orderItemsRaw);

        // ── Issues sull'ordine ──
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
        if (order && order.itemsUpdatedFromConfig === undefined && (order.items?.length || 0) > 0) {
          // Ordine vecchio creato prima del flag - non un bug ma utile saperlo
          issues.push("ORDER_LEGACY: ordine senza itemsUpdatedFromConfig (pre-fix)");
        }

        // ── DIFF ──
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

    // ── 8. AGGREGAZIONI GLOBALI ──────────────────────────
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

    // Top problematic properties (sort by % di pulizie con mismatch)
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
      },
      window: {
        sinceIso: since.toISOString(),
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
