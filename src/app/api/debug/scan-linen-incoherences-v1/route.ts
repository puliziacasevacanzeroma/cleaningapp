/**
 * ════════════════════════════════════════════════════════════════════
 * DEBUG: Scansione globale ordini biancheria incoerenti
 * ════════════════════════════════════════════════════════════════════
 *
 * GET /api/debug/scan-linen-incoherences-v1?cronSecret=XXX
 *
 * Cerca tutte le pulizie nel range [-30 giorni, +30 giorni] dove l'ordine
 * biancheria collegato HA QUANTITÀ DIVERSE da quelle attese in base a:
 *   1. cleaning.linenConfigModified=true → cleaning.customLinenConfig
 *   2. property.serviceConfigs[cleaning.guestsCount]
 *
 * READ-ONLY: nessuna scrittura.
 *
 * Query params:
 *   cronSecret      (obbligatorio se settato)
 *   daysBack        (default 30) — quanti giorni indietro
 *   daysForward     (default 30) — quanti giorni avanti
 *   onlyFuture      ("1" → ignora pulizie passate, utile per "evita incidenti")
 *   propertyName    (filtro opzionale)
 *
 * Output: lista di incoerenze raggruppate per gravità + statistiche
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

// ════════════════════════════════════════════════════════════
// HELPERS — replicano logica canonica di sync-ical / update-linen-order
// ════════════════════════════════════════════════════════════

/** Estrae items attesi dalla config (bl + ba + ki). Mantiene fedele la
 * logica di MERGE bl['all'] + bedGroups usata in sync-ical. */
function extractExpectedItemsFromConfig(config: any): Record<string, number> {
  const expected: Record<string, number> = {};
  if (!config || typeof config !== "object") return expected;

  // BIANCHERIA LETTO (bl)
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
      // MERGE: gruppi letto + sovrascrittura con bl['all']
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

  // BIANCHERIA BAGNO (ba)
  if (config.ba && typeof config.ba === "object") {
    Object.entries(config.ba).forEach(([itemId, qty]: [string, any]) => {
      if (typeof qty === "number" && qty > 0) {
        expected[itemId] = (expected[itemId] || 0) + qty;
      }
    });
  }

  // KIT CORTESIA (ki)
  if (config.ki && typeof config.ki === "object") {
    Object.entries(config.ki).forEach(([itemId, qty]: [string, any]) => {
      if (typeof qty === "number" && qty > 0) {
        expected[itemId] = (expected[itemId] || 0) + qty;
      }
    });
  }

  return expected;
}

/** Estrae quantità "biancheria" dall'ordine, ignorando voci di servizio
 * (delivery_fee, bed_making, prodotti pulizia). */
function extractActualItemsFromOrder(order: any): Record<string, number> {
  const result: Record<string, number> = {};
  if (!Array.isArray(order?.items)) return result;

  for (const it of order.items) {
    const id = it.itemId || it.id;
    if (!id) continue;
    // Ignora voci di servizio
    if (id === "_delivery_fee" || id === "_bed_making_fee") continue;
    if (it.type === "cleaning_product") continue;
    const qty = typeof it.quantity === "number" ? it.quantity : 0;
    if (qty <= 0) continue;
    result[id] = (result[id] || 0) + qty;
  }

  return result;
}

interface DiffEntry {
  itemId: string;
  expected: number;
  actual: number;
  delta: number; // actual - expected
}

function compareItems(
  expected: Record<string, number>,
  actual: Record<string, number>,
): { missing: DiffEntry[]; extra: DiffEntry[]; mismatched: DiffEntry[] } {
  const allKeys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  const missing: DiffEntry[] = []; // sotto-dotazione: actual < expected
  const extra: DiffEntry[] = []; // sopra-dotazione: actual > expected
  const mismatched: DiffEntry[] = []; // articolo presente in expected ma non in actual o viceversa

  for (const k of allKeys) {
    const e = expected[k] ?? 0;
    const a = actual[k] ?? 0;
    if (e === a) continue;
    if (e > 0 && a === 0) {
      mismatched.push({ itemId: k, expected: e, actual: 0, delta: -e });
    } else if (e === 0 && a > 0) {
      mismatched.push({ itemId: k, expected: 0, actual: a, delta: a });
    } else if (a < e) {
      missing.push({ itemId: k, expected: e, actual: a, delta: a - e });
    } else {
      extra.push({ itemId: k, expected: e, actual: a, delta: a - e });
    }
  }

  return { missing, extra, mismatched };
}

/** Severità basata sui diff:
 *   CRITICAL: ordine ha MENO biancheria del dovuto → rischio operativo
 *   WARNING:  ordine ha PIÙ del dovuto o articoli mai visti → spreco
 *   INFO:     piccole differenze (es. solo extra item)
 *   OK:       coerente
 */
function classifySeverity(
  missing: DiffEntry[],
  extra: DiffEntry[],
  mismatched: DiffEntry[],
): { severity: "CRITICAL" | "WARNING" | "INFO" | "OK"; reasons: string[] } {
  const reasons: string[] = [];
  let severity: "CRITICAL" | "WARNING" | "INFO" | "OK" = "OK";

  // Articoli con quantità inferiore al previsto = sotto-dotazione
  if (missing.length > 0) {
    severity = "CRITICAL";
    reasons.push(
      `Sotto-dotazione su ${missing.length} articoli: ${missing
        .map((m) => `${m.itemId}(${m.actual}/${m.expected})`)
        .join(", ")}`,
    );
  }

  // Articoli completamente mancanti dall'ordine
  const completelyMissing = mismatched.filter((m) => m.expected > 0 && m.actual === 0);
  if (completelyMissing.length > 0) {
    severity = "CRITICAL";
    reasons.push(
      `Articoli MAI presenti nell'ordine: ${completelyMissing
        .map((m) => `${m.itemId}(atteso ${m.expected})`)
        .join(", ")}`,
    );
  }

  // Sovra-dotazione
  if (extra.length > 0 && severity !== "CRITICAL") {
    severity = "WARNING";
    reasons.push(
      `Sopra-dotazione su ${extra.length} articoli: ${extra
        .map((m) => `${m.itemId}(${m.actual}/${m.expected})`)
        .join(", ")}`,
    );
  }

  // Articoli extra non previsti
  const extraneous = mismatched.filter((m) => m.expected === 0 && m.actual > 0);
  if (extraneous.length > 0 && severity === "OK") {
    severity = "INFO";
    reasons.push(
      `Articoli extra non in config: ${extraneous
        .map((m) => `${m.itemId}(${m.actual})`)
        .join(", ")}`,
    );
  } else if (extraneous.length > 0) {
    reasons.push(
      `+ articoli extra non in config: ${extraneous.map((m) => m.itemId).join(", ")}`,
    );
  }

  return { severity, reasons };
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
    // ─── Range temporale ───
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - daysBack);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + daysForward);
    endDate.setHours(23, 59, 59, 999);
    const startTs = Timestamp.fromDate(startDate);
    const endTs = Timestamp.fromDate(endDate);

    // ─── Carica properties (con serviceConfigs) ───
    const propsSnap = await adminDb.collection("properties").get();
    const propsById = new Map<string, any>();
    propsSnap.docs.forEach((d) => {
      propsById.set(d.id, { id: d.id, ...(d.data() as any) });
    });

    // ─── Carica cleanings nel range ───
    const cleaningsSnap = await adminDb
      .collection("cleanings")
      .where("scheduledDate", ">=", startTs)
      .where("scheduledDate", "<=", endTs)
      .get();

    // ─── Pre-carica orders (ottimizzazione: una sola query con limite intelligente) ───
    // Per evitare N+1, scarico tutti gli orders del range
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

    // ─── Analisi ───
    const incoherences: any[] = [];
    const skippedReasons: Record<string, number> = {};

    for (const cDoc of cleaningsSnap.docs) {
      const c = cDoc.data() as any;
      const cleaning = { id: cDoc.id, ...c };

      const scheduledDate: Date | null = c.scheduledDate?.toDate?.() || null;

      // Filtri opzionali
      if (onlyFuture) {
        if (!scheduledDate || scheduledDate < now) continue;
      }

      const property = propsById.get(c.propertyId);
      if (!property) {
        skippedReasons["property_not_found"] = (skippedReasons["property_not_found"] || 0) + 1;
        continue;
      }

      if (propertyNameFilter && !(property.name || "").toLowerCase().includes(propertyNameFilter)) {
        continue;
      }

      // Skip se proprietà usa biancheria propria
      if (property.usesOwnLinen === true) {
        skippedReasons["uses_own_linen"] = (skippedReasons["uses_own_linen"] || 0) + 1;
        continue;
      }

      // Skip se autoGenerateLaundry esplicitamente false
      if (property.autoGenerateLaundry === false) {
        skippedReasons["autoGenerateLaundry_off"] = (skippedReasons["autoGenerateLaundry_off"] || 0) + 1;
        continue;
      }

      const guestsCount = c.guestsCount || c.maxGuests || property.maxGuests || 2;

      // ─── Determina config attesa ───
      let expectedSource: string;
      let config: any = null;
      const hasCustomConfig =
        c.linenConfigModified === true &&
        c.customLinenConfig &&
        typeof c.customLinenConfig === "object";

      if (hasCustomConfig) {
        config = c.customLinenConfig;
        expectedSource = "customLinenConfig";
      } else if (property.serviceConfigs) {
        config =
          property.serviceConfigs[guestsCount] ||
          property.serviceConfigs[String(guestsCount)];
        expectedSource = `serviceConfigs[${guestsCount}]`;
      }

      if (!config) {
        // Niente config trovata: segnalo come WARNING separato
        const linkedOrders = ordersByCleaningId.get(cleaning.id) || [];
        if (linkedOrders.length > 0 && linkedOrders.some((o) => o.status !== "CANCELLED")) {
          incoherences.push({
            cleaningId: cleaning.id,
            propertyId: property.id,
            propertyName: property.name,
            scheduledDate: scheduledDate?.toISOString(),
            guestsCount,
            cleaningStatus: c.status,
            severity: "WARNING",
            reasons: [
              `Nessuna config disponibile (hasCustomConfig=${hasCustomConfig}, serviceConfigs ha chiavi: ${
                property.serviceConfigs ? Object.keys(property.serviceConfigs).join(",") : "NESSUNA"
              })`,
            ],
            expectedSource: "NONE",
            expected: {},
            actual: extractActualItemsFromOrder(linkedOrders[0]),
            orderId: linkedOrders[0].id,
            orderStatus: linkedOrders[0].status,
          });
        } else {
          skippedReasons["no_config_no_order"] = (skippedReasons["no_config_no_order"] || 0) + 1;
        }
        continue;
      }

      // ─── Cerca ordine collegato (escludi CANCELLED) ───
      let order: any = null;
      // Priorità 1: laundryOrderId esplicito sulla pulizia
      if (c.laundryOrderId) {
        const candidate = ordersById.get(c.laundryOrderId);
        if (candidate && candidate.status !== "CANCELLED") {
          order = candidate;
        }
      }
      // Priorità 2: cerca via cleaningId
      if (!order) {
        const linked = ordersByCleaningId.get(cleaning.id) || [];
        const active = linked.filter((o) => o.status !== "CANCELLED");
        if (active.length > 0) {
          order = active[0];
        }
      }

      if (!order) {
        // Pulizia senza ordine — può essere normale (es. proprietà che non usa biancheria, oppure ordine fuori range)
        // Lo segnalo solo se hasLinenOrder esplicitamente true
        if (c.hasLinenOrder === true) {
          incoherences.push({
            cleaningId: cleaning.id,
            propertyId: property.id,
            propertyName: property.name,
            scheduledDate: scheduledDate?.toISOString(),
            guestsCount,
            cleaningStatus: c.status,
            severity: "WARNING",
            reasons: ["hasLinenOrder=true ma nessun ordine attivo trovato"],
            expectedSource,
            expected: extractExpectedItemsFromConfig(config),
            actual: {},
          });
        } else {
          skippedReasons["no_order_linked"] = (skippedReasons["no_order_linked"] || 0) + 1;
        }
        continue;
      }

      // ─── Confronto ───
      const expected = extractExpectedItemsFromConfig(config);
      const actual = extractActualItemsFromOrder(order);
      const { missing, extra, mismatched } = compareItems(expected, actual);

      const totalKeys = new Set([...Object.keys(expected), ...Object.keys(actual)]).size;
      if (
        missing.length === 0 &&
        extra.length === 0 &&
        mismatched.length === 0 &&
        totalKeys > 0
      ) {
        skippedReasons["coherent"] = (skippedReasons["coherent"] || 0) + 1;
        continue;
      }

      const { severity, reasons } = classifySeverity(missing, extra, mismatched);
      if (severity === "OK") continue;

      incoherences.push({
        cleaningId: cleaning.id,
        propertyId: property.id,
        propertyName: property.name,
        scheduledDate: scheduledDate?.toISOString(),
        scheduledDateLocal: scheduledDate?.toLocaleString("it-IT"),
        guestsCount,
        cleaningStatus: c.status,
        cleaningCreatedAt: c.createdAt?.toDate?.()?.toISOString() || null,
        cleaningUpdatedAt: c.updatedAt?.toDate?.()?.toISOString() || null,
        cleaningSource: c.source || c.bookingSource || null,
        linenConfigModified: c.linenConfigModified === true,
        guestsAppliedBySystem: c.guestsAppliedBySystem === true,
        guestsConfirmed: c.guestsConfirmed === true,
        severity,
        reasons,
        expectedSource,
        expected,
        actual,
        diffMissing: missing,
        diffExtra: extra,
        diffMismatched: mismatched,
        order: {
          id: order.id,
          status: order.status,
          type: order.type,
          createdAt: order.createdAt?.toDate?.()?.toISOString() || null,
          updatedAt: order.updatedAt?.toDate?.()?.toISOString() || null,
          autoGenerated: order.autoGenerated === true,
          itemsUpdatedFromConfig: order.itemsUpdatedFromConfig === true,
          configSource: order.configSource || null,
        },
      });
    }

    // ─── Ordina per gravità + data ───
    const severityRank = { CRITICAL: 0, WARNING: 1, INFO: 2, OK: 3 };
    incoherences.sort((a, b) => {
      const sd = severityRank[a.severity] - severityRank[b.severity];
      if (sd !== 0) return sd;
      return (a.scheduledDate || "").localeCompare(b.scheduledDate || "");
    });

    // ─── Statistiche aggregate ───
    const byProperty: Record<string, number> = {};
    const bySeverity: Record<string, number> = { CRITICAL: 0, WARNING: 0, INFO: 0 };
    const byOrderStatus: Record<string, number> = {};
    incoherences.forEach((inc) => {
      byProperty[inc.propertyName] = (byProperty[inc.propertyName] || 0) + 1;
      bySeverity[inc.severity] = (bySeverity[inc.severity] || 0) + 1;
      const os = inc.order?.status || "NO_ORDER";
      byOrderStatus[os] = (byOrderStatus[os] || 0) + 1;
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      query: {
        rangeStart: startDate.toISOString(),
        rangeEnd: endDate.toISOString(),
        daysBack,
        daysForward,
        onlyFuture,
        propertyNameFilter,
      },
      stats: {
        cleaningsScanned: cleaningsSnap.size,
        ordersInRange: ordersSnap.size,
        incoherencesFound: incoherences.length,
        bySeverity,
        byOrderStatus,
        byProperty,
        skipped: skippedReasons,
      },
      _legend: {
        CRITICAL: "Sotto-dotazione: l'operatore avrà MENO biancheria del previsto. Rischio operativo.",
        WARNING: "Sovra-dotazione o configurazione mancante: spreco o problema dati.",
        INFO: "Articoli extra non in config (probabilmente aggiunti manualmente).",
      },
      incoherences,
    });
  } catch (error: any) {
    console.error("Errore scan-linen-incoherences-v1:", error);
    return NextResponse.json(
      {
        error: "Errore server",
        message: error?.message,
        stack: error?.stack?.split("\n").slice(0, 5).join("\n"),
      },
      { status: 500 },
    );
  }
}
