/**
 * ════════════════════════════════════════════════════════════════════
 * DEBUG: Backfill Stale Linen Orders v1
 * ════════════════════════════════════════════════════════════════════
 *
 * Trova ordini biancheria con `configSource` o items non allineati al
 * `cleaning.guestsCount` attuale, e li ricalcola.
 *
 * VINCOLI DI SICUREZZA (NO retroactive surprises):
 *   - Tocca SOLO ordini con status ∈ {PENDING, ASSIGNED}
 *   - SKIPPA ordini DELIVERED, CANCELLED, IN_TRANSIT
 *   - SKIPPA cleaning con `linenConfigModified === true` (custom legittima)
 *   - SKIPPA cleaning con `customLinenConfig` presente E `linenConfigModified !== false`
 *     (orphan custom: trattamento separato, non riallineare a serviceConfigs perché
 *     l'ordine esistente potrebbe rispecchiare la custom voluta)
 *   - SKIPPA ordini con `_repairReason`, `_repairedAt`, `createdByFix` (già toccati da fix manuali)
 *   - SKIPPA ordini con schema "ricco" (presenza di `unitPrice`, `totalPrice` su items[0])
 *     perché sono stati toccati dal modulo pagamenti e riscriverli farebbe perdere i prezzi
 *   - SOLO se diff espressivo: items missingInActual.length > 0 OR quantityMismatch.length > 0
 *
 * DUE MODALITÀ:
 *   GET ?cronSecret=XXX                → DRY RUN, ritorna preview JSON
 *   GET ?cronSecret=XXX&apply=1        → applica modifiche, scrive auditLog
 *   GET ?cronSecret=XXX&apply=1&cleaningId=XXX → applica modifiche SOLO su 1 caso
 *
 * AUDIT:
 *   Ogni write produce un auditLog entry `LINEN_ORDER_BACKFILLED` con
 *   before/after items, motivo, snapshot completo della cleaning.
 *
 * IDEMPOTENTE: rilanciandolo dopo apply non cambia nulla (già coerente).
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getItemName } from "~/lib/itemNames";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ═══════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════
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

  const apply = req.nextUrl.searchParams.get("apply") === "1";
  const onlyCleaningId = req.nextUrl.searchParams.get("cleaningId") || null;
  const daysBack = parseInt(req.nextUrl.searchParams.get("daysBack") || "30");
  const daysForward = parseInt(req.nextUrl.searchParams.get("daysForward") || "30");

  try {
    // ── 1. Carica ordini candidati (status PENDING/ASSIGNED, finestra temporale) ──
    const now = new Date();
    const since = new Date(now);
    since.setDate(since.getDate() - daysBack);
    const until = new Date(now);
    until.setDate(until.getDate() + daysForward);

    let ordersQuery = adminDb
      .collection("orders")
      .where("scheduledDate", ">=", Timestamp.fromDate(since))
      .where("scheduledDate", "<=", Timestamp.fromDate(until));

    const ordersSnap = await ordersQuery.get();
    const candidateOrders: any[] = [];
    for (const orderDoc of ordersSnap.docs) {
      const data = orderDoc.data() as any;
      const status = data.status;
      if (status !== "PENDING" && status !== "ASSIGNED") continue;
      if (!data.cleaningId) continue;
      if (onlyCleaningId && data.cleaningId !== onlyCleaningId) continue;
      candidateOrders.push({ id: orderDoc.id, ...data });
    }

    const report: any = {
      mode: apply ? "APPLY" : "DRY_RUN",
      window: { since: since.toISOString(), until: until.toISOString() },
      candidates: candidateOrders.length,
      skipped: [],
      eligible: [],
      applied: [],
      failed: [],
    };

    // ── 2. Analizza ciascuno ──
    for (const order of candidateOrders) {
      try {
        const result = await analyzeOrder(order);
        if (result.skip) {
          report.skipped.push({
            orderId: order.id,
            cleaningId: order.cleaningId,
            reason: result.skipReason,
          });
          continue;
        }
        if (!result.needsBackfill) {
          report.skipped.push({
            orderId: order.id,
            cleaningId: order.cleaningId,
            reason: "items già coerenti con cleaning.guestsCount",
          });
          continue;
        }
        // Eligibile per backfill
        const eligibleEntry: any = {
          orderId: order.id,
          cleaningId: order.cleaningId,
          propertyName: result.propertyName,
          cleaningGuestsCount: result.cleaningGuestsCount,
          orderStatus: order.status,
          orderConfigSource: order.configSource || null,
          expectedConfigSource: `serviceConfigs[${result.cleaningGuestsCount}]`,
          itemsBefore: result.itemsBefore,
          itemsAfter: result.itemsAfter,
          diffSummary: result.diffSummary,
        };
        report.eligible.push(eligibleEntry);

        if (apply) {
          try {
            await applyBackfill(order, result);
            report.applied.push({
              orderId: order.id,
              cleaningId: order.cleaningId,
              itemsBeforeCount: result.itemsBefore.length,
              itemsAfterCount: result.itemsAfter.length,
            });
          } catch (writeErr: any) {
            report.failed.push({
              orderId: order.id,
              cleaningId: order.cleaningId,
              error: writeErr?.message || String(writeErr),
            });
          }
        }
      } catch (err: any) {
        report.failed.push({
          orderId: order.id,
          cleaningId: order.cleaningId,
          error: err?.message || String(err),
        });
      }
    }

    report.summary = {
      candidates: report.candidates,
      skipped: report.skipped.length,
      eligible: report.eligible.length,
      applied: report.applied.length,
      failed: report.failed.length,
    };

    return NextResponse.json(report);
  } catch (err: any) {
    return NextResponse.json(
      { error: "Errore backfill", details: err?.message, stack: err?.stack },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// ANALISI ORDINE
// ═══════════════════════════════════════════════════════════════
interface AnalysisResult {
  skip: boolean;
  skipReason?: string;
  needsBackfill: boolean;
  cleaningGuestsCount?: number;
  propertyId?: string;
  propertyName?: string;
  propertyMaxGuests?: number | null;
  config?: any;
  itemsBefore: Array<{ id: string; name: string; quantity: number }>;
  itemsAfter: Array<{ id: string; name: string; quantity: number }>;
  diffSummary?: string;
  cleaningSnapshot?: any;
}

async function analyzeOrder(order: any): Promise<AnalysisResult> {
  const baseResult: AnalysisResult = {
    skip: false,
    needsBackfill: false,
    itemsBefore: [],
    itemsAfter: [],
  };

  // ── 1. Schema items "ricco" (pagamenti) → SKIP per sicurezza ──
  const items = Array.isArray(order.items) ? order.items : [];
  const hasRichSchema = items.length > 0 && items.some(
    (it: any) => it && (typeof it.unitPrice === "number" || typeof it.totalPrice === "number" || typeof it.categoryName === "string")
  );
  if (hasRichSchema) {
    return { ...baseResult, skip: true, skipReason: "items con schema 'ricco' (pagamenti) — NON tocchiamo" };
  }

  // ── 2. _repairReason / _repairedAt / createdByFix → SKIP ──
  if (order._repairReason || order._repairedAt || order.createdByFix === true) {
    return { ...baseResult, skip: true, skipReason: "ordine già toccato da script di fix precedenti" };
  }

  // ── 3. Carica cleaning ──
  const cleaningDoc = await adminDb.collection("cleanings").doc(order.cleaningId).get();
  if (!cleaningDoc.exists) {
    return { ...baseResult, skip: true, skipReason: "cleaning non trovata" };
  }
  const cleaning = cleaningDoc.data() as any;

  // ── 4. Stati cleaning bloccanti ──
  if (cleaning.status === "COMPLETED" || cleaning.status === "VERIFIED") {
    return { ...baseResult, skip: true, skipReason: `cleaning ${cleaning.status} (ordine non coerente con realtà fisica)` };
  }
  if (cleaning.status === "IN_PROGRESS") {
    return { ...baseResult, skip: true, skipReason: "cleaning IN_PROGRESS (operatore al lavoro)" };
  }

  // ── 5. Custom linen config → SKIP (rispetta la scelta del proprietario/admin) ──
  if (cleaning.linenConfigModified === true) {
    return { ...baseResult, skip: true, skipReason: "cleaning.linenConfigModified=true (config custom legittima)" };
  }

  // ── 6. Orphan custom config → SKIP (decisione separata) ──
  if (cleaning.customLinenConfig && cleaning.linenConfigModified !== false) {
    // customLinenConfig presente E linenConfigModified non esplicitamente false → ambiguo
    return { ...baseResult, skip: true, skipReason: "customLinenConfig presente con stato ambiguo — analisi manuale" };
  }
  // Caso particolare: customLinenConfig + linenConfigModified=false → orphan vero,
  // l'ordine potrebbe rispecchiare la customConfig orfana. Per sicurezza skippa anche
  // questi: trattamento separato in un secondo script dedicato.
  if (cleaning.customLinenConfig && cleaning.linenConfigModified === false) {
    return { ...baseResult, skip: true, skipReason: "ORPHAN_CUSTOM_CONFIG (gestione separata)" };
  }

  // ── 7. Carica property ──
  const propertyDoc = await adminDb.collection("properties").doc(cleaning.propertyId).get();
  if (!propertyDoc.exists) {
    return { ...baseResult, skip: true, skipReason: "property non trovata" };
  }
  const property = propertyDoc.data() as any;
  if (property.usesOwnLinen) {
    return { ...baseResult, skip: true, skipReason: "property usesOwnLinen=true" };
  }
  if (!property.serviceConfigs) {
    return { ...baseResult, skip: true, skipReason: "property senza serviceConfigs" };
  }

  // ── 8. Calcola items attesi per cleaning.guestsCount attuale ──
  const guestsCount = cleaning.guestsCount;
  if (typeof guestsCount !== "number" || guestsCount < 1) {
    return { ...baseResult, skip: true, skipReason: `cleaning.guestsCount non valido (${guestsCount})` };
  }
  const config = property.serviceConfigs[guestsCount] || property.serviceConfigs[String(guestsCount)];
  if (!config) {
    return { ...baseResult, skip: true, skipReason: `serviceConfigs[${guestsCount}] non esiste sulla property` };
  }
  const expectedItems = calculateItemsFromConfig(config);
  if (expectedItems.length === 0) {
    return { ...baseResult, skip: true, skipReason: "serviceConfigs vuota (no items da calcolare)" };
  }

  // ── 9. Diff ──
  const itemsBefore = items.map((it: any) => ({
    id: String(it.id),
    name: it.name || getItemName(String(it.id)),
    quantity: Number(it.quantity) || 0,
  }));
  const diff = computeDiff(expectedItems, itemsBefore);
  const needsBackfill = diff.missingInActual.length > 0 || diff.quantityMismatch.length > 0;

  // ── 10. configSource già coerente? Se sì, NON tocchiamo (idempotent) ──
  // Verifica anche `configSource`: se è già `serviceConfigs[guestsCount]` E items coincidono → OK
  if (!needsBackfill && order.configSource === `serviceConfigs[${guestsCount}]`) {
    return { ...baseResult, needsBackfill: false };
  }
  // Se items coincidono ma configSource è altro/null → patch solo metadati? NO: la regola è
  // "items missing/qty mismatch" come trigger. Solo metadati senza diff items: skip.
  if (!needsBackfill) {
    return { ...baseResult, needsBackfill: false };
  }

  // ── 11. Diff summary leggibile ──
  const diffParts: string[] = [];
  if (diff.missingInActual.length > 0) {
    diffParts.push(`MANCANTI: ${diff.missingInActual.map(m => `${m.name}:${m.expectedQty}`).join(", ")}`);
  }
  if (diff.quantityMismatch.length > 0) {
    diffParts.push(`QTY: ${diff.quantityMismatch.map(m => `${m.name}:${m.actualQty}→${m.expectedQty}`).join(", ")}`);
  }
  if (diff.extraInActual.length > 0) {
    // Items extra non vengono rimossi (potrebbero essere cleaning products, kit specifici).
    // Per sicurezza notiamo ma NON cancelliamo: preservare e fare MERGE invece.
    diffParts.push(`EXTRA_PRESERVED: ${diff.extraInActual.map(e => `${e.name}:${e.actualQty}`).join(", ")}`);
  }

  // ── 12. Items finali: MERGE expected + extras preservati ──
  // I "extras" sono items presenti in actual ma NON in expected.
  // Tipicamente: cleaning products (prodotti_pulizia), richieste extra del proprietario.
  // Li PRESERVIAMO per non perdere dati operativi.
  const finalItems: Array<{ id: string; name: string; quantity: number; [k: string]: any }> = [];
  for (const exp of expectedItems) {
    finalItems.push({ id: exp.id, name: exp.name, quantity: exp.quantity });
  }
  // Preserva extras con tutti i loro metadati (type, categoryId, etc.)
  for (const it of items) {
    const itemId = String(it.id);
    if (!expectedItems.find(e => e.id === itemId)) {
      // Extra: preservalo con tutti i suoi campi originali
      finalItems.push({ ...it });
    }
  }

  return {
    skip: false,
    needsBackfill: true,
    cleaningGuestsCount: guestsCount,
    propertyId: cleaning.propertyId,
    propertyName: property.name || "(unknown)",
    propertyMaxGuests: property.maxGuests || null,
    config,
    itemsBefore,
    itemsAfter: finalItems,
    diffSummary: diffParts.join(" | ") || "no diff",
    cleaningSnapshot: {
      status: cleaning.status,
      guestsCount: cleaning.guestsCount,
      guestsConfirmed: cleaning.guestsConfirmed ?? null,
      adulti: cleaning.adulti ?? null,
      neonati: cleaning.neonati ?? null,
      linenConfigModified: cleaning.linenConfigModified ?? null,
      hasCustomLinenConfig: !!cleaning.customLinenConfig,
      updatedAt: serializeTs(cleaning.updatedAt),
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// APPLY (scrittura + audit log)
// ═══════════════════════════════════════════════════════════════
async function applyBackfill(order: any, result: AnalysisResult) {
  if (!result.needsBackfill || !result.cleaningGuestsCount) return;

  const orderRef = adminDb.collection("orders").doc(order.id);

  // Doppia verifica pre-write: lo status non deve essere cambiato nel frattempo
  const fresh = await orderRef.get();
  if (!fresh.exists) throw new Error("ordine scomparso");
  const freshData = fresh.data() as any;
  if (freshData.status !== "PENDING" && freshData.status !== "ASSIGNED") {
    throw new Error(`status cambiato a ${freshData.status}, abort`);
  }

  // Scrittura idempotente: items, configSource, itemsUpdatedFromConfig, updatedAt
  await orderRef.update({
    items: result.itemsAfter,
    configSource: `serviceConfigs[${result.cleaningGuestsCount}]`,
    itemsUpdatedFromConfig: true,
    updatedAt: Timestamp.now(),
    backfilledAt: Timestamp.now(),
    backfilledReason: "stale_linen_order_v1",
  });

  // Audit log
  try {
    await adminDb.collection("auditLog").add({
      action: "LINEN_ORDER_BACKFILLED",
      entityType: "order",
      entityId: order.id,
      propertyId: result.propertyId || null,
      propertyName: result.propertyName || null,
      source: "api/debug/backfill-stale-linen-orders-v1",
      details: {
        cleaningId: order.cleaningId,
        cleaningGuestsCount: result.cleaningGuestsCount,
        orderStatusBefore: order.status,
        orderConfigSourceBefore: order.configSource || null,
        itemsBeforeCount: result.itemsBefore.length,
        itemsAfterCount: result.itemsAfter.length,
        itemsBefore: result.itemsBefore,
        itemsAfter: result.itemsAfter,
        diffSummary: result.diffSummary,
        cleaningSnapshot: result.cleaningSnapshot,
      },
      timestamp: Timestamp.now(),
    });
  } catch (auditErr) {
    console.error("[backfill] audit write failed:", auditErr);
    // non rompere il flow
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPERS (identici a update-linen-order/route.ts logic)
// ═══════════════════════════════════════════════════════════════
function calculateItemsFromConfig(
  config: any
): Array<{ id: string; name: string; quantity: number }> {
  const items: Array<{ id: string; name: string; quantity: number }> = [];
  if (!config) return items;

  // Biancheria Letto (bl) - logica identica a update-linen-order
  if (config.bl) {
    if (config.bl["all"]) {
      Object.entries(config.bl["all"]).forEach(([itemId, qty]) => {
        if (typeof qty === "number" && qty > 0) {
          items.push({ id: itemId, name: getItemName(itemId), quantity: qty });
        }
      });
    } else {
      Object.entries(config.bl).forEach(([_bedId, bedItems]) => {
        if (typeof bedItems === "object" && bedItems !== null) {
          Object.entries(bedItems as Record<string, number>).forEach(([itemId, qty]) => {
            if (typeof qty === "number" && qty > 0) {
              const existing = items.find((i) => i.id === itemId);
              if (existing) existing.quantity += qty;
              else items.push({ id: itemId, name: getItemName(itemId), quantity: qty });
            }
          });
        }
      });
    }
  }

  // Biancheria Bagno (ba)
  if (config.ba) {
    Object.entries(config.ba).forEach(([itemId, qty]) => {
      if (typeof qty === "number" && qty > 0) {
        items.push({ id: itemId, name: getItemName(itemId), quantity: qty });
      }
    });
  }

  // Kit Cortesia (ki)
  if (config.ki) {
    Object.entries(config.ki).forEach(([itemId, qty]) => {
      if (typeof qty === "number" && qty > 0) {
        items.push({ id: itemId, name: getItemName(itemId), quantity: qty });
      }
    });
  }

  return items;
}

function computeDiff(
  expected: Array<{ id: string; name: string; quantity: number }>,
  actual: Array<{ id: string; name: string; quantity: number }>
) {
  const expById = new Map(expected.map((e) => [e.id, e]));
  const actById = new Map(actual.map((a) => [a.id, a]));
  const missingInActual: any[] = [];
  const extraInActual: any[] = [];
  const quantityMismatch: any[] = [];
  expById.forEach((exp, id) => {
    const act = actById.get(id);
    if (!act) missingInActual.push({ id, name: exp.name, expectedQty: exp.quantity });
    else if (act.quantity !== exp.quantity)
      quantityMismatch.push({ id, name: exp.name, expectedQty: exp.quantity, actualQty: act.quantity });
  });
  actById.forEach((act, id) => {
    if (!expById.has(id)) extraInActual.push({ id, name: act.name, actualQty: act.quantity });
  });
  return { missingInActual, extraInActual, quantityMismatch };
}

function serializeTs(v: any): string | null {
  try {
    if (!v) return null;
    if (typeof v?.toDate === "function") return v.toDate().toISOString();
    if (v instanceof Date) return v.toISOString();
    return String(v);
  } catch { return null; }
}
