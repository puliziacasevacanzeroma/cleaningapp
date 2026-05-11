/**
 * 🔍 DEBUG ENDPOINT — Audit completo flussi pulizie ↔ ordini biancheria
 *
 * Endpoint READ-ONLY (zero scritture, zero side-effect).
 *
 * Modalità di utilizzo:
 *
 * 1) AUDIT GLOBALE (default): scansiona TUTTE le pulizie attive del range temporale
 *      GET /api/debug/cleanings-orders-audit?secret=YYY
 *      GET /api/debug/cleanings-orders-audit?secret=YYY&days=14
 *      GET /api/debug/cleanings-orders-audit?secret=YYY&days=30&onlyMisaligned=true
 *
 * 2) AUDIT SINGOLO: una specifica pulizia
 *      GET /api/debug/cleanings-orders-audit?secret=YYY&cleaningId=ABC123
 *
 * 3) AUDIT PROPRIETÀ: tutte le pulizie di una proprietà in una data
 *      GET /api/debug/cleanings-orders-audit?secret=YYY&propertyId=XXX
 *      GET /api/debug/cleanings-orders-audit?secret=YYY&propertyId=XXX&date=2026-05-11
 *
 * 4) FLOW MAP: documentazione statica dei flussi
 *      GET /api/debug/cleanings-orders-audit?secret=YYY&mode=flowmap
 *
 * Output (JSON):
 *   {
 *     mode: "audit" | "flowmap",
 *     params: { ... },
 *     summary: { analyzed, misaligned, withOrphanOrders, ... },
 *     flowMap: [ ... ],          // mappa dei flussi (sempre presente per riferimento)
 *     results: [ ... ]            // un oggetto per ogni cleaning analizzata
 *   }
 *
 * Ogni `result` contiene:
 *   - cleaning: snapshot stato in DB
 *   - property: snapshot config relevant
 *   - orders: TUTTI gli ordini collegati (PENDING/ASSIGNED/IN_TRANSIT/DELIVERED/...)
 *             con stato, items, source (where cleaningId o orfano via laundryOrderId)
 *   - expectedFromCardPulizia: items calcolati al volo come fa la UI
 *   - diffs: confronto item-per-item card pulizia vs ordine
 *   - diagnosis: array di stringhe testuali con la causa esatta del disallineamento
 *   - flowsInvolved: quali flussi hanno toccato cleaning/ordini di recente (in base agli updatedAt)
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET;

// ════════════════════════════════════════════════════════════════════════════
// 📚 FLOW MAP — Mappa statica dei flussi che creano/modificano cleanings/orders
// ════════════════════════════════════════════════════════════════════════════
// Aggiornare quando si aggiungono nuovi endpoint/componenti.
const FLOW_MAP = [
  // ─── CREAZIONE CLEANINGS ───
  { actor: "ADMIN/PROPRIETARIO via UI", endpoint: "POST /api/cleanings", action: "CREATE cleaning + (opzionale) CREATE order PENDING via createLinenOrder()" },
  { actor: "ADMIN via UI manuale", endpoint: "POST /api/cleanings/manual", action: "CREATE cleaning manuale (può avere linenConfigModified=true). NON crea ordine automaticamente." },
  { actor: "CRON sync-ical (notturno + ogni 4h)", endpoint: "POST /api/cron/sync-ical", action: "CREATE cleaning da prenotazione iCal + CREATE order PENDING con cleaningId" },
  { actor: "ADMIN trigger manuale", endpoint: "POST /api/sync-all-ical", action: "Trigger sincronizzazione iCal su tutte le proprietà" },
  { actor: "ADMIN trigger manuale", endpoint: "POST /api/properties/[id]/sync-ical", action: "Sync iCal singola proprietà → CREATE cleaning + order" },
  { actor: "PROPRIETARIO trigger", endpoint: "POST /api/proprietario/sync-ical", action: "Idem ma scoped al proprietario" },
  { actor: "PROPRIETARIO assistant", endpoint: "POST /api/proprietario/assistant", action: "Crea cleaning + order tramite assistente AI" },

  // ─── MODIFICA CLEANINGS ───
  { actor: "ADMIN dashboard mobile/desktop card", endpoint: "Direct updateDoc + POST /api/cleanings/[id]/update-linen-order", action: "UPDATE guestsCount lato client + chiamata API per ricalcolare ordine ⚠️ FILTRA SOLO PENDING" },
  { actor: "ADMIN modifica completa", endpoint: "PATCH /api/cleanings/[id]", action: "UPDATE cleaning + ricalcola items ordine (only PENDING) ⚠️ wasCustom blocca update" },
  { actor: "ADMIN dashboard PATCH veloce", endpoint: "PATCH /api/dashboard/cleanings/[id]", action: "UPDATE quick (orari/ospiti/operatori) + ricalcola ordine se !wasCustom && guestsChanged ⚠️ filtra PENDING" },
  { actor: "ADMIN assegnazione", endpoint: "PATCH /api/dashboard/cleanings/[id]/assign", action: "Assegna operatore. NON tocca ordini." },
  { actor: "PROPRIETARIO modal completo", endpoint: "Direct updateDoc da EditCleaningModal", action: "UPDATE cleaning + updateDoc orders direttamente da client (aggiorna SEMPRE items, ignora status)" },
  { actor: "PROPRIETARIO modal PulizieModals", endpoint: "Direct updateDoc da PulizieModals", action: "Idem versione semplificata" },
  { actor: "ADMIN proprietà PATCH", endpoint: "PATCH /api/properties/[id]", action: "Cambio serviceConfigs ⚠️ può influire su pulizie future" },
  { actor: "ADMIN move", endpoint: "PUT /api/cleanings/[id]/move", action: "Sposta cleaning a nuova data + update ordine collegato" },
  { actor: "ADMIN cancel", endpoint: "POST /api/cleanings/[id]/cancel", action: "Cancella cleaning + CANCEL ordine collegato" },
  { actor: "OPERATORE start", endpoint: "POST /api/cleanings/[id]/start", action: "Cleaning IN_PROGRESS + crea ordine prodotti pulizia (separato)" },
  { actor: "OPERATORE complete", endpoint: "POST /api/cleanings/[id]/complete", action: "Cleaning COMPLETED + ordine biancheria DELIVERY ready" },
  { actor: "OPERATORE wizard", endpoint: "Direct updateDoc da CleaningWizard", action: "Update durante esecuzione (foto, problemi, ...)" },
  { actor: "CRON apply-default-guests", endpoint: "GET /api/cron/apply-default-guests", action: "Setta guestsCount=default per cleanings con guestsConfirmed=false" },
  { actor: "CRON check-uncompleted", endpoint: "GET /api/cron/check-uncompleted", action: "Aggiorna stato cleanings non completate alle 20:00" },

  // ─── CREAZIONE ORDINI ───
  { actor: "FIRESTORE LIB (admin SDK)", endpoint: "src/lib/firebase/firestore-data-admin.ts", action: "createLinenOrder() — crea order con cleaningId + items da serviceConfigs" },
  { actor: "FIRESTORE LIB (client SDK)", endpoint: "src/lib/firebase/firestore-data.ts", action: "Idem ma da client SDK" },
  { actor: "ADMIN fix orders", endpoint: "POST /api/admin/fix-missing-orders", action: "Crea ordini mancanti per cleanings senza ordine collegato" },
  { actor: "OPERATORE start", endpoint: "POST /api/cleanings/[id]/start", action: "Crea ordine prodotti pulizia (richiesta operatore)" },
  { actor: "PROPRIETARIO product-requests", endpoint: "POST /api/product-requests", action: "Richiesta prodotti aggiuntivi (collegata a ordine esistente)" },

  // ─── MODIFICA ORDINI ───
  { actor: "API update-linen-order", endpoint: "POST /api/cleanings/[id]/update-linen-order", action: "Aggiorna items ordine. ⚠️ FILTRA solo PENDING (compound query cleaningId+status)" },
  { actor: "API cleanings PATCH", endpoint: "PATCH /api/cleanings/[id]", action: "Aggiorna items se guestsCount cambiato e !wasCustom ⚠️ solo PENDING" },
  { actor: "API dashboard cleanings PATCH", endpoint: "PATCH /api/dashboard/cleanings/[id]", action: "Idem ⚠️ solo PENDING + filtro !wasCustom" },
  { actor: "API properties PATCH", endpoint: "PATCH /api/properties/[id]", action: "Se cambia serviceConfigs, può aggiornare ordini PENDING futuri" },
  { actor: "API update-pending-orders", endpoint: "POST /api/properties/[id]/update-pending-orders", action: "Forza ricalcolo ordini PENDING di una proprietà" },
  { actor: "API admin update-all-pending-orders", endpoint: "POST /api/admin/update-all-pending-orders", action: "Bulk update di tutti gli ordini PENDING — skip se cleaning.linenConfigModified=true" },
  { actor: "API orders deliver", endpoint: "POST /api/orders/[id]/deliver", action: "Ordine → DELIVERED" },
  { actor: "API cleanings cancel", endpoint: "POST /api/cleanings/[id]/cancel", action: "Cancella ordine collegato (status → CANCELLED)" },
  { actor: "API cleanings move", endpoint: "PUT /api/cleanings/[id]/move", action: "Sposta scheduledDate dell'ordine" },
  { actor: "PROPRIETARIO EditCleaningModal", endpoint: "Direct updateDoc da client", action: "Aggiorna items ordine SEMPRE (ignora status)" },
  { actor: "ADMIN OrderDetailModal", endpoint: "Direct updateDoc da client", action: "Modifica items/dettagli ordine specifico" },
  { actor: "ADMIN DeliveriesView", endpoint: "Direct updateDoc da client", action: "Assegna rider, marca consegnato" },
  { actor: "RIDER rider page", endpoint: "Direct updateDoc da client", action: "Aggiorna stato consegna" },
  { actor: "CRON sync-ical", endpoint: "POST /api/cron/sync-ical", action: "Può cancellare ordini per booking eliminate" },
];

// ════════════════════════════════════════════════════════════════════════════
// HELPER: replica calculateDotazioni (logica UI card pulizia)
// ════════════════════════════════════════════════════════════════════════════
function calculateExpectedItems(
  cleaning: Record<string, any>,
  property: Record<string, any> | undefined
): { items: Array<{ id: string; quantity: number; group: string }>; configSource: string; warnings: string[] } {
  const warnings: string[] = [];
  const items: Array<{ id: string; quantity: number; group: string }> = [];
  const guestsCount = cleaning.guestsCount || 2;
  const hasCustomConfig =
    cleaning.linenConfigModified === true &&
    cleaning.customLinenConfig &&
    cleaning.customLinenConfig.bl &&
    Object.keys(cleaning.customLinenConfig.bl).length > 0;

  let config: any = null;
  let configSource = "";

  if (hasCustomConfig) {
    config = cleaning.customLinenConfig;
    configSource = "customLinenConfig";
  } else if (property?.serviceConfigs) {
    config = property.serviceConfigs[guestsCount] || property.serviceConfigs[String(guestsCount)];
    configSource = config ? `serviceConfigs[${guestsCount}]` : `(missing serviceConfigs[${guestsCount}])`;
    if (!config) {
      warnings.push(
        `serviceConfigs[${guestsCount}] NON ESISTE. Chiavi disponibili: [${Object.keys(property.serviceConfigs).join(",")}]`
      );
    }
  } else {
    warnings.push("Nessuna config: no customLinenConfig, no property.serviceConfigs");
    return { items, configSource: "none", warnings };
  }
  if (!config) return { items, configSource, warnings };

  // Biancheria letto: merge 'all' + gruppi letto (logica più recente)
  if (config.bl) {
    const blKeys = Object.keys(config.bl);
    const bedGroupKeys = blKeys.filter((k) => k !== "all");
    const hasAll = blKeys.includes("all") && config.bl["all"] && Object.keys(config.bl["all"]).length > 0;
    const hasBedGroups = bedGroupKeys.length > 0 && bedGroupKeys.some((k) => {
      const it = config.bl[k];
      return it && typeof it === "object" && Object.keys(it).length > 0;
    });

    if (hasAll && hasBedGroups) {
      const mergedBl: Record<string, number> = {};
      Object.entries(config.bl).forEach(([key, val]) => {
        if (key !== "all" && typeof val === "object" && val !== null) {
          Object.entries(val as Record<string, number>).forEach(([itemId, qty]) => {
            if (typeof qty === "number" && qty > 0) mergedBl[itemId] = (mergedBl[itemId] || 0) + qty;
          });
        }
      });
      Object.entries(config.bl["all"]).forEach(([itemId, qty]) => {
        if (typeof qty === "number" && qty > 0) mergedBl[itemId] = qty as number;
      });
      Object.entries(mergedBl).forEach(([itemId, qty]) => {
        if (qty > 0) items.push({ id: itemId, quantity: qty, group: "bl" });
      });
    } else if (hasAll) {
      Object.entries(config.bl["all"]).forEach(([itemId, qty]) => {
        if (typeof qty === "number" && qty > 0) items.push({ id: itemId, quantity: qty, group: "bl" });
      });
    } else {
      Object.entries(config.bl).forEach(([bedId, bedItems]) => {
        if (bedId !== "all" && typeof bedItems === "object" && bedItems !== null) {
          Object.entries(bedItems as Record<string, number>).forEach(([itemId, qty]) => {
            if (typeof qty === "number" && qty > 0) {
              const existing = items.find((i) => i.id === itemId);
              if (existing) existing.quantity += qty;
              else items.push({ id: itemId, quantity: qty, group: "bl" });
            }
          });
        }
      });
    }
  }

  if (config.ba) {
    Object.entries(config.ba).forEach(([itemId, qty]) => {
      if (typeof qty === "number" && qty > 0) items.push({ id: itemId, quantity: qty, group: "ba" });
    });
  }
  if (config.ki) {
    Object.entries(config.ki).forEach(([itemId, qty]) => {
      if (typeof qty === "number" && qty > 0) items.push({ id: itemId, quantity: qty, group: "ki" });
    });
  }
  return { items, configSource, warnings };
}

// ════════════════════════════════════════════════════════════════════════════
// HELPER: diff item-per-item
// ════════════════════════════════════════════════════════════════════════════
function diffItems(
  expected: Array<{ id: string; quantity: number }>,
  actual: Array<{ id: string; quantity: number }>
): { matches: boolean; differences: Array<{ id: string; expected: number; actual: number; delta: number }> } {
  const expMap = new Map(expected.map((i) => [i.id, i.quantity]));
  const actMap = new Map(actual.map((i) => [i.id, i.quantity]));
  const allIds = new Set<string>([...expMap.keys(), ...actMap.keys()]);
  const differences: Array<{ id: string; expected: number; actual: number; delta: number }> = [];
  allIds.forEach((id) => {
    const e = expMap.get(id) || 0;
    const a = actMap.get(id) || 0;
    if (e !== a) differences.push({ id, expected: e, actual: a, delta: a - e });
  });
  return { matches: differences.length === 0, differences };
}

// ════════════════════════════════════════════════════════════════════════════
// HELPER: analizza una singola pulizia
// ════════════════════════════════════════════════════════════════════════════
async function analyzeCleaning(
  cleaningId: string,
  preloaded?: { cleaning?: any; property?: any }
): Promise<any> {
  const result: any = { cleaningId, diagnosis: [] as string[] };

  // ── 1. Carica cleaning ─────────────────────────────────────────
  let cleaning: Record<string, any>;
  if (preloaded?.cleaning) {
    cleaning = preloaded.cleaning;
  } else {
    const cleaningDoc = await adminDb.collection("cleanings").doc(cleaningId).get();
    if (!cleaningDoc.exists) {
      result.error = "Cleaning non trovata";
      return result;
    }
    cleaning = cleaningDoc.data() as Record<string, any>;
  }
  const scheduledDate = cleaning.scheduledDate?.toDate?.() || null;

  result.cleaning = {
    id: cleaningId,
    propertyId: cleaning.propertyId,
    propertyName: cleaning.propertyName,
    status: cleaning.status,
    scheduledDate: scheduledDate?.toISOString() || null,
    scheduledTime: cleaning.scheduledTime,
    guestsCount: cleaning.guestsCount,
    guestsCountType: typeof cleaning.guestsCount,
    guestsConfirmed: cleaning.guestsConfirmed === true,
    linenConfigModified: cleaning.linenConfigModified === true,
    hasCustomLinenConfig: !!cleaning.customLinenConfig,
    laundryOrderId: cleaning.laundryOrderId || null,
    hasLinenOrder: cleaning.hasLinenOrder,
    bookingId: cleaning.bookingId || null,
    operatorId: cleaning.operatorId || null,
    customLinenConfigSummary: cleaning.customLinenConfig
      ? {
          bl_keys: Object.keys(cleaning.customLinenConfig.bl || {}),
          ba_count: Object.keys(cleaning.customLinenConfig.ba || {}).length,
          ki_count: Object.keys(cleaning.customLinenConfig.ki || {}).length,
        }
      : null,
    createdAt: cleaning.createdAt?.toDate?.()?.toISOString() || null,
    updatedAt: cleaning.updatedAt?.toDate?.()?.toISOString() || null,
  };

  // ── 2. Carica property ─────────────────────────────────────────
  let property: Record<string, any> | undefined = preloaded?.property;
  if (!property && cleaning.propertyId) {
    const propDoc = await adminDb.collection("properties").doc(cleaning.propertyId).get();
    if (propDoc.exists) property = propDoc.data() as Record<string, any>;
  }
  if (property) {
    const gc = cleaning.guestsCount || 2;
    const cfg = property.serviceConfigs?.[gc] || property.serviceConfigs?.[String(gc)];
    result.property = {
      id: cleaning.propertyId,
      name: property.name,
      maxGuests: property.maxGuests,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      serviceConfigsKeys: property.serviceConfigs ? Object.keys(property.serviceConfigs) : [],
      configForCurrentGuests: cfg
        ? {
            bl_keys: Object.keys(cfg.bl || {}),
            bl_all_keys: cfg.bl?.all ? Object.keys(cfg.bl.all) : null,
            ba: cfg.ba || null,
            ki: cfg.ki || null,
          }
        : null,
      usesOwnLinen: property.usesOwnLinen,
    };
  } else if (cleaning.propertyId) {
    result.property = { id: cleaning.propertyId, error: "NOT FOUND" };
    result.diagnosis.push("❌ Proprietà collegata non trovata");
  }

  // ── 3. Ordini collegati (TUTTI, anche orfani) ──────────────────
  const ordersByCleaningId = await adminDb
    .collection("orders")
    .where("cleaningId", "==", cleaningId)
    .get();

  const orderDocs: Array<{ id: string; data: Record<string, any>; source: string }> = [];
  ordersByCleaningId.docs.forEach((d) =>
    orderDocs.push({ id: d.id, data: d.data() as Record<string, any>, source: "where(cleaningId)" })
  );
  if (cleaning.laundryOrderId && !orderDocs.some((o) => o.id === cleaning.laundryOrderId)) {
    try {
      const ld = await adminDb.collection("orders").doc(cleaning.laundryOrderId).get();
      if (ld.exists) {
        orderDocs.push({
          id: ld.id,
          data: ld.data() as Record<string, any>,
          source: "cleaning.laundryOrderId (ORFANO: ordine senza cleaningId)",
        });
      }
    } catch {}
  }

  result.orders = orderDocs.map(({ id, data, source }) => ({
    id,
    source,
    status: data.status,
    type: data.type,
    cleaningIdInOrder: data.cleaningId || "(MANCANTE)",
    propertyId: data.propertyId,
    scheduledDate: data.scheduledDate?.toDate?.()?.toISOString() || null,
    deliveredAt: data.deliveredAt?.toDate?.()?.toISOString() || null,
    riderId: data.riderId || null,
    riderName: data.riderName || null,
    itemsCount: Array.isArray(data.items) ? data.items.length : 0,
    items: Array.isArray(data.items)
      ? data.items.map((i: any) => ({ id: i.id || i.itemId, name: i.name, quantity: i.quantity }))
      : [],
    guestsCountUpdated: data.guestsCountUpdated || null,
    configSource: data.configSource || null,
    itemsUpdatedFromConfig: data.itemsUpdatedFromConfig === true,
    createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
    updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
  }));

  // ── 4. Calcolo expected dalla card pulizia ─────────────────────
  const { items: expectedItems, configSource, warnings } = calculateExpectedItems(cleaning, property);
  result.expectedFromCardPulizia = { items: expectedItems, configSource, warnings };

  // ── 5. Diff per ogni ordine ────────────────────────────────────
  result.diffs = orderDocs
    .filter(({ data }) => data.status !== "CANCELLED")
    .map(({ id, data }) => {
      const actual = Array.isArray(data.items)
        ? data.items.map((i: any) => ({ id: i.id || i.itemId, quantity: i.quantity }))
        : [];
      const d = diffItems(
        expectedItems.map((i) => ({ id: i.id, quantity: i.quantity })),
        actual
      );
      return { orderId: id, status: data.status, matches: d.matches, differences: d.differences };
    });

  // ── 6. Diagnosi causa principale ───────────────────────────────
  const dx = result.diagnosis as string[];
  if (!cleaning.propertyId) dx.push("❌ Cleaning senza propertyId");
  if (cleaning.linenConfigModified === true && !cleaning.customLinenConfig)
    dx.push("⚠️ linenConfigModified=true ma customLinenConfig mancante → fallback serviceConfigs");
  if (cleaning.linenConfigModified === true && cleaning.customLinenConfig)
    dx.push("ℹ️ Pulizia ha customLinenConfig: cambi al guestsCount NON ricalcolano l'ordine");
  if (orderDocs.length === 0)
    dx.push("❌ NESSUN ordine collegato — la card consegne non avrà niente da mostrare");

  let blockedByPendingFilter = false;
  let hasOrphan = false;
  let hasDelivered = false;
  let hasCancelled = false;
  orderDocs.forEach(({ id, data, source }) => {
    if (source.includes("ORFANO")) {
      hasOrphan = true;
      dx.push(`⚠️ Ordine ${id} ORFANO: cleaning.laundryOrderId=${id} ma il doc ordine NON ha campo cleaningId → query where(cleaningId) NON lo trova → update-linen-order NON lo aggiorna mai`);
    }
    if (data.status === "DELIVERED") {
      hasDelivered = true;
      dx.push(`ℹ️ Ordine ${id} è DELIVERED → API non lo aggiorna (corretto: già consegnato)`);
    }
    if (data.status === "CANCELLED") {
      hasCancelled = true;
    }
    if (data.status && !["PENDING", "DELIVERED", "CANCELLED"].includes(data.status)) {
      blockedByPendingFilter = true;
      dx.push(`🚨 Ordine ${id} status=${data.status} (≠ PENDING) → endpoint update-linen-order ATTUALE NON lo aggiorna (filtra solo PENDING)`);
    }
  });

  // Recency check: chi è stato modificato più recentemente?
  const cleaningUpdated = cleaning.updatedAt?.toDate?.() || null;
  orderDocs.forEach(({ id, data }) => {
    const orderUpdated = data.updatedAt?.toDate?.() || null;
    if (cleaningUpdated && orderUpdated) {
      const diffMs = cleaningUpdated.getTime() - orderUpdated.getTime();
      if (diffMs > 60_000) {
        dx.push(`⏱️ Cleaning aggiornata ${Math.round(diffMs / 60000)}min DOPO ordine ${id} → modifiche cleaning non propagate all'ordine`);
      }
    }
  });

  const anyDiff = (result.diffs as any[]).some((x) => !x.matches);
  if (anyDiff) {
    if (blockedByPendingFilter) dx.push("🔴 DISALLINEAMENTO + status ≠ PENDING → causa identificata: filtro PENDING di update-linen-order");
    else if (hasOrphan) dx.push("🔴 DISALLINEAMENTO + ordine orfano → causa identificata: missing cleaningId nel doc ordine");
    else if (cleaning.linenConfigModified) dx.push("🔴 DISALLINEAMENTO + customLinenConfig → causa identificata: cambi guests non propagano (gestito ma intenzionale)");
    else dx.push("🔴 DISALLINEAMENTO + ordine PENDING senza cause note → INVESTIGARE: forse update-linen-order non è stato chiamato dopo l'update guestsCount");
  } else if (orderDocs.filter((o) => o.data.status !== "CANCELLED").length > 0) {
    dx.push("✅ Allineamento OK");
  }

  result.misaligned = anyDiff;
  result.causes = {
    blockedByPendingFilter,
    hasOrphan,
    hasDelivered,
    hasCancelled,
    hasCustomConfig: cleaning.linenConfigModified === true,
    noOrders: orderDocs.length === 0,
  };

  return result;
}

// ════════════════════════════════════════════════════════════════════════════
// HANDLER
// ════════════════════════════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const urlSecret = req.nextUrl.searchParams.get("secret");
  if (CRON_SECRET && urlSecret !== CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const mode = req.nextUrl.searchParams.get("mode") || "audit";

    // ───── MODE: flowmap ──────────────────────────────────────
    if (mode === "flowmap") {
      return NextResponse.json({
        mode: "flowmap",
        description: "Mappa statica di tutti i flussi che creano/modificano cleanings e orders. Aggiornare manualmente quando si aggiungono nuovi endpoint.",
        flowsCount: FLOW_MAP.length,
        flows: FLOW_MAP,
      });
    }

    // ───── MODE: audit ────────────────────────────────────────
    const cleaningId = req.nextUrl.searchParams.get("cleaningId");
    const cleaningIdsParam = req.nextUrl.searchParams.get("cleaningIds");
    const propertyId = req.nextUrl.searchParams.get("propertyId");
    const date = req.nextUrl.searchParams.get("date");
    const days = parseInt(req.nextUrl.searchParams.get("days") || "7", 10);
    const onlyMisaligned = req.nextUrl.searchParams.get("onlyMisaligned") === "true";
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "100", 10), 500);

    let cleaningIds: string[] = [];

    if (cleaningId) {
      cleaningIds = [cleaningId];
    } else if (cleaningIdsParam) {
      cleaningIds = cleaningIdsParam.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (propertyId) {
      const snap = await adminDb.collection("cleanings").where("propertyId", "==", propertyId).get();
      cleaningIds = snap.docs
        .filter((d) => {
          if (!date) return true;
          const sd = (d.data().scheduledDate as any)?.toDate?.();
          if (!sd) return false;
          const start = new Date(`${date}T00:00:00.000Z`);
          const end = new Date(`${date}T23:59:59.999Z`);
          return sd >= start && sd <= end;
        })
        .map((d) => d.id);
    } else {
      // AUDIT GLOBALE: ultimi N giorni
      const now = new Date();
      const start = new Date(now);
      start.setDate(start.getDate() - days);
      const end = new Date(now);
      end.setDate(end.getDate() + days); // include futuro: pulizie programmate
      const snap = await adminDb
        .collection("cleanings")
        .where("scheduledDate", ">=", start)
        .where("scheduledDate", "<=", end)
        .get();
      cleaningIds = snap.docs.slice(0, limit).map((d) => d.id);
    }

    if (cleaningIds.length === 0) {
      return NextResponse.json({
        mode: "audit",
        summary: { analyzed: 0 },
        flowMap: { count: FLOW_MAP.length, info: "Chiama ?mode=flowmap per vedere i flussi" },
        results: [],
      });
    }
    if (cleaningIds.length > 500) {
      return NextResponse.json(
        { error: `Troppe pulizie (${cleaningIds.length}), max 500` },
        { status: 400 }
      );
    }

    // Processa in batch da 25 per ridurre carico Firestore
    const results: any[] = [];
    const BATCH = 25;
    for (let i = 0; i < cleaningIds.length; i += BATCH) {
      const batch = cleaningIds.slice(i, i + BATCH);
      const batchResults = await Promise.all(batch.map((id) => analyzeCleaning(id)));
      results.push(...batchResults);
    }

    const filtered = onlyMisaligned ? results.filter((r) => r.misaligned) : results;

    // Aggregati
    const summary = {
      analyzed: results.length,
      misaligned: results.filter((r) => r.misaligned).length,
      withMissingOrders: results.filter((r) => r.causes?.noOrders).length,
      withOrphanOrders: results.filter((r) => r.causes?.hasOrphan).length,
      withNonPendingNonDelivered: results.filter((r) => r.causes?.blockedByPendingFilter).length,
      withCustomConfig: results.filter((r) => r.causes?.hasCustomConfig).length,
      breakdownByCause: {
        pendingFilter: results.filter((r) => r.misaligned && r.causes?.blockedByPendingFilter).length,
        orphan: results.filter((r) => r.misaligned && r.causes?.hasOrphan).length,
        customConfig: results.filter((r) => r.misaligned && r.causes?.hasCustomConfig).length,
        noOrders: results.filter((r) => r.misaligned && r.causes?.noOrders).length,
        unknown: results.filter((r) => r.misaligned && !r.causes?.blockedByPendingFilter && !r.causes?.hasOrphan && !r.causes?.hasCustomConfig && !r.causes?.noOrders).length,
      },
    };

    return NextResponse.json({
      mode: "audit",
      params: { cleaningId, cleaningIds: cleaningIdsParam, propertyId, date, days, onlyMisaligned, limit },
      summary,
      flowMap: { count: FLOW_MAP.length, info: "Chiama ?mode=flowmap per vedere i flussi" },
      results: filtered,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Errore server", details: err?.message || String(err), stack: err?.stack },
      { status: 500 }
    );
  }
}
