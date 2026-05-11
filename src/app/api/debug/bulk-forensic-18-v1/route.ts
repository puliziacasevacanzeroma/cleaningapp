/**
 * ════════════════════════════════════════════════════════════════════
 * DEBUG: Bulk Forensic 18 v1 — Fingerprint forense per i 18 casi 3-way
 * ════════════════════════════════════════════════════════════════════
 *
 * Per CIASCUNO dei 18 cleaningId, raccoglie in un singolo JSON:
 *   - cleaning (tutti i campi + timestamps)
 *   - order (tutti i campi + timestamps + ordersTouched timeline)
 *   - property (serviceConfigs disponibili, maxGuests)
 *   - expected items per il guestsCount attuale (calc lato server)
 *   - diff expected vs actual
 *   - audit log filtrato per questo cleaningId E per questo orderId
 *   - "best-match guestsCount fit": prova ogni serviceConfigs[N] e
 *     ritorna quale N matcha meglio gli items attuali (rivela da quale
 *     N è stato in origine generato l'ordine)
 *   - fingerprint: pattern booleani per classificare l'ordine in uno dei
 *     9 path identificati (A-I) del mental model
 *
 * USAGE:
 *   GET /api/debug/bulk-forensic-18-v1?cronSecret=XXX
 *
 * ZERO SCRITTURE. Output JSON strutturato per analisi automatica.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getItemName } from "~/lib/itemNames";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

// ───────────────────────────────────────────────────────────────
// I 18 cleaningId hardcoded (dal briefing)
// ───────────────────────────────────────────────────────────────
const CLEANING_IDS = [
  // FAMIGLIA 1 — configSource stale
  { id: "CJkNPspHU00Dyu7jY2bq", family: 1, label: "CASALE 2.0 g2 vs sc[8]" },
  { id: "0AFM2k8Y1BPvmWZtzEAG", family: 1, label: "Arya g6 cfgSource null" },
  { id: "dUbcBv1xAyOR8s9bHra1", family: 1, label: "Villa Borghese g3 vs sc[1]" },
  { id: "e8n6sXVZROBn95fdQKpf", family: 1, label: "The Aristocats g3 vs sc[4]" },
  { id: "G3SKBvsQzYMklkjrE8No", family: 1, label: "Nina's House g3 vs sc[5]" },
  // FAMIGLIA 2 — SERENDIPITY mancata cortesia
  { id: "WXAoXTBIIE5lRPVmrobG", family: 2, label: "SERENDIPITY 2026-05-05" },
  { id: "3phKfpk7FqLaGz9wuedc", family: 2, label: "SERENDIPITY 2026-05-09" },
  // FAMIGLIA 3 — Gaia tappetino=1
  { id: "iBqToEvSxzbEZIXELkAk", family: 3, label: "Gaia 2026-05-03" },
  { id: "d8KuP4vddCvx5RHXo574", family: 3, label: "Gaia 2026-05-07" },
  { id: "M88XwKiFWSfChqr6o34E", family: 3, label: "Gaia 2026-05-09" },
  // FAMIGLIA 4 — Orphan/sporadici
  { id: "JFwNGqyROQr5kY10pX1Q", family: 4, label: "Trevi 1 orphan" },
  { id: "R0t9i1ZDY3jEwn1tjIi3", family: 4, label: "Trevi 1 orphan #2" },
  { id: "GH3W7Z0JTKsL7UyyMtRz", family: 4, label: "Trevi 3 orphan" },
  { id: "w1iCmuQSfoJdh2LuntOV", family: 4, label: "Trevi 2 orphan" },
  { id: "jrqKBOB91tMuYXJ4cd0C", family: 4, label: "Trastevere orphan -7fed -3lenz" },
  { id: "w8dA7DEiZYcyWM7VyNfr", family: 4, label: "Paola g4 vs order.guests=5" },
  { id: "CMgQlLdoc3TdAXwpisDt", family: 4, label: "Paola g2 vs order.guests=5" },
  { id: "fVuXkxC5PleKjOErI3Sv", family: 4, label: "Navona g4 lenz mismatch" },
];

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

  try {
    const results: any[] = [];
    for (const entry of CLEANING_IDS) {
      try {
        const analysis = await analyzeCleaning(entry.id, entry.family, entry.label);
        results.push(analysis);
      } catch (caseErr: any) {
        results.push({
          cleaningId: entry.id,
          family: entry.family,
          label: entry.label,
          error: caseErr?.message || String(caseErr),
        });
      }
    }
    return NextResponse.json({ success: true, count: results.length, results });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Errore analisi", details: err?.message || String(err), stack: err?.stack },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// CORE: analizza un singolo cleaningId
// ═══════════════════════════════════════════════════════════════
async function analyzeCleaning(cleaningId: string, family: number, label: string) {
  // 1. Cleaning doc
  const cleaningDoc = await adminDb.collection("cleanings").doc(cleaningId).get();
  if (!cleaningDoc.exists) {
    return { cleaningId, family, label, error: "Cleaning non trovata" };
  }
  const cleaning = serialize(cleaningDoc.data());

  // 2. Order(s) — uso cleaningId, può essere multi
  const ordersSnap = await adminDb
    .collection("orders")
    .where("cleaningId", "==", cleaningId)
    .get();
  const orders = ordersSnap.docs.map((d) => ({ id: d.id, ...serialize(d.data()) }));

  // 3. Property
  const propertyId = cleaning.propertyId;
  const propertyDoc = await adminDb.collection("properties").doc(propertyId).get();
  if (!propertyDoc.exists) {
    return { cleaningId, family, label, error: "Property non trovata" };
  }
  const propertyData = propertyDoc.data() as any;
  const property = {
    id: propertyId,
    name: propertyData.name || null,
    maxGuests: propertyData.maxGuests || null,
    bedrooms: propertyData.bedrooms || null,
    bathrooms: propertyData.bathrooms || null,
    usesOwnLinen: propertyData.usesOwnLinen || false,
    serviceConfigsAvailable: propertyData.serviceConfigs
      ? Object.keys(propertyData.serviceConfigs).sort()
      : [],
  };

  // 4. Expected items per l'attuale guestsCount
  const guestsCount = cleaning.guestsCount || 2;
  const hasCustomConfig =
    cleaning.linenConfigModified === true && cleaning.customLinenConfig;
  let expectedConfig: any = null;
  let expectedSource = "";
  if (hasCustomConfig) {
    expectedConfig = cleaning.customLinenConfig;
    expectedSource = "customLinenConfig";
  } else if (propertyData.serviceConfigs) {
    expectedConfig =
      propertyData.serviceConfigs[guestsCount] ||
      propertyData.serviceConfigs[String(guestsCount)];
    expectedSource = `serviceConfigs[${guestsCount}]`;
  }
  const expectedItems = expectedConfig
    ? simulateCalculate(expectedConfig)
    : [];

  // 5. Actual items
  const order = orders[0] || null;
  const actualItems = (order?.items || []).map((it: any) => ({
    id: it.id,
    name: it.name,
    quantity: it.quantity,
  }));

  // 6. Diff
  const diff = computeDiff(expectedItems, actualItems);

  // 7. Best-match: prova ogni serviceConfigs[N] vs actualItems
  const bestMatchTable: Array<{
    guestsTried: string;
    matchScore: number;
    perfectMatch: boolean;
    expectedItemCount: number;
    diffMissing: number;
    diffExtra: number;
    diffQtyMismatch: number;
  }> = [];
  if (propertyData.serviceConfigs && actualItems.length > 0) {
    for (const k of Object.keys(propertyData.serviceConfigs)) {
      const cfg = propertyData.serviceConfigs[k];
      const exp = simulateCalculate(cfg);
      const d = computeDiff(exp, actualItems);
      // Score = numero items matchati perfettamente / totale
      const correctIds = exp.filter((e) =>
        actualItems.some(
          (a: any) => a.id === e.id && a.quantity === e.quantity
        )
      ).length;
      bestMatchTable.push({
        guestsTried: k,
        matchScore: exp.length ? correctIds / exp.length : 0,
        perfectMatch: d.missingInActual.length === 0 && d.extraInActual.length === 0 && d.quantityMismatch.length === 0,
        expectedItemCount: exp.length,
        diffMissing: d.missingInActual.length,
        diffExtra: d.extraInActual.length,
        diffQtyMismatch: d.quantityMismatch.length,
      });
    }
    bestMatchTable.sort((a, b) => b.matchScore - a.matchScore);
  }

  // 8. Audit log (cerca per cleaningId E per orderId)
  const auditByCleaning = await adminDb
    .collection("auditLog")
    .where("entityId", "==", cleaningId)
    .limit(50)
    .get();
  const auditClean = auditByCleaning.docs.map((d) => ({ id: d.id, ...serialize(d.data()) }));
  let auditOrder: any[] = [];
  if (order) {
    const auditByOrder = await adminDb
      .collection("auditLog")
      .where("entityId", "==", order.id)
      .limit(50)
      .get();
    auditOrder = auditByOrder.docs.map((d) => ({ id: d.id, ...serialize(d.data()) }));
  }
  const allAudit = [...auditClean, ...auditOrder].sort((a: any, b: any) => {
    const ta = a.timestamp || "";
    const tb = b.timestamp || "";
    return ta.localeCompare(tb);
  });

  // 9. Fingerprint (lettere A-I dal mental model)
  const fp: Record<string, any> = {
    order_exists: !!order,
    order_configSource: order?.configSource ?? null,
    order_itemsUpdatedFromConfig: order?.itemsUpdatedFromConfig ?? null,
    order_guestsCount: order?.guestsCount ?? null,
    order_guestsCountUpdated: order?.guestsCountUpdated ?? null,
    order_guestsAppliedBySystem: order?.guestsAppliedBySystem ?? null,
    order_status: order?.status ?? null,
    order_createdAt: order?.createdAt ?? null,
    order_updatedAt: order?.updatedAt ?? null,
    cleaning_guestsCount: cleaning.guestsCount ?? null,
    cleaning_guestsConfirmed: cleaning.guestsConfirmed ?? null,
    cleaning_guestsAppliedBySystem: cleaning.guestsAppliedBySystem ?? null,
    cleaning_guestsAppliedAt: cleaning.guestsAppliedAt ?? null,
    cleaning_linenConfigModified: cleaning.linenConfigModified ?? null,
    cleaning_hasCustomLinenConfig: !!cleaning.customLinenConfig,
    cleaning_createdAt: cleaning.createdAt ?? null,
    cleaning_updatedAt: cleaning.updatedAt ?? null,
    cleaning_bookingSource: cleaning.bookingSource ?? null,
    cleaning_bookingId: cleaning.bookingId ?? null,
    cleaning_movedAt: cleaning.movedAt ?? null,
    cleaning_modifiedBy: cleaning.modifiedBy ?? null,
    audit_count: allAudit.length,
    audit_has_LINEN_ORDER_RECALCULATED: allAudit.some(
      (a: any) => a.action === "LINEN_ORDER_RECALCULATED"
    ),
    audit_has_CLEANING_CREATED: allAudit.some(
      (a: any) => a.action === "CLEANING_CREATED"
    ),
    audit_has_SAFETY_NET: allAudit.some((a: any) => a.action === "SAFETY_NET_TRIGGERED"),
    audit_has_orderCreated_event: allAudit.some(
      (a: any) => a.action === "ORDER_CREATED" || a.action === "LINEN_ORDER_CREATED"
    ),
    audit_oldest_action: allAudit[0]?.action ?? null,
    audit_oldest_source: allAudit[0]?.source ?? null,
    audit_oldest_timestamp: allAudit[0]?.timestamp ?? null,
    audit_newest_action: allAudit[allAudit.length - 1]?.action ?? null,
    audit_newest_source: allAudit[allAudit.length - 1]?.source ?? null,
    audit_newest_timestamp: allAudit[allAudit.length - 1]?.timestamp ?? null,
  };

  // 10. Classificazione path
  const classification = classifyPath(fp, order, cleaning, bestMatchTable);

  // 11. Booking data se presente (per vedere booking.guests vs order.guests)
  let booking: any = null;
  if (cleaning.bookingId) {
    try {
      const bookingDoc = await adminDb
        .collection("bookings")
        .doc(cleaning.bookingId)
        .get();
      if (bookingDoc.exists) {
        const b = serialize(bookingDoc.data());
        booking = {
          id: bookingDoc.id,
          guests: b.guests ?? null,
          guestsCount: b.guestsCount ?? null,
          guestsConfirmed: b.guestsConfirmed ?? null,
          guestsConfirmedAt: b.guestsConfirmedAt ?? null,
          adults: b.adults ?? null,
          children: b.children ?? null,
          infants: b.infants ?? null,
          checkIn: b.checkIn ?? null,
          checkOut: b.checkOut ?? null,
          source: b.source ?? null,
          createdAt: b.createdAt ?? null,
          updatedAt: b.updatedAt ?? null,
        };
      }
    } catch {}
  }

  return {
    cleaningId,
    family,
    label,
    cleaning,
    order,
    property,
    booking,
    expected: { source: expectedSource, items: expectedItems },
    actual: { items: actualItems },
    diff,
    bestMatchTable: bestMatchTable.slice(0, 5), // top 5
    auditLog: allAudit,
    fingerprint: fp,
    classification,
  };
}

// ═══════════════════════════════════════════════════════════════
// CLASSIFICATION
// ═══════════════════════════════════════════════════════════════
function classifyPath(
  fp: any,
  order: any,
  cleaning: any,
  bestMatch: any[]
): { path: string; confidence: string; reasoning: string[] } {
  const reasoning: string[] = [];
  let path = "UNKNOWN";
  let confidence = "low";

  // Caso ovvio 1: no order
  if (!order) {
    return {
      path: "NO_ORDER",
      confidence: "high",
      reasoning: ["Nessun ordine collegato"],
    };
  }

  // Path I: creato da linenOrderService (sync-all-ical o proprietario/sync-ical)
  // Fingerprint: configSource assente + guestsCount sull'ordine PRESENTE +
  // items SENZA kit cortesia (config.ki ignorato)
  const hasKiItems = (order.items || []).some((it: any) => {
    const n = (it.name || "").toLowerCase();
    return n.includes("shampoo") || n.includes("bagnoschiuma") ||
           n.includes("balsamo") || n.includes("sapone") ||
           n.includes("kit") || n.includes("cortesia");
  });
  const hasGuestsCount = typeof order.guestsCount === "number";

  if (!fp.order_configSource && hasGuestsCount && !hasKiItems) {
    // Verifica anche che la property abbia ki configurato (altrimenti è normale)
    reasoning.push(
      `Pattern Path I (linenOrderService): no configSource + guestsCount=${order.guestsCount} su order + NO kit cortesia.`
    );
    path = "I_linenOrderService";
    confidence = "high";
  }

  // Path H: cron iCal originale, mai ricalcolato
  // Fingerprint: configSource assente + guestsCount sull'ordine ASSENTE +
  // itemsUpdatedFromConfig assente
  if (
    !fp.order_configSource &&
    !hasGuestsCount &&
    !fp.order_itemsUpdatedFromConfig
  ) {
    reasoning.push(
      "Pattern Path H (cron/sync-ical): no configSource, no order.guestsCount, no itemsUpdatedFromConfig — mai ricalcolato dopo creazione."
    );
    path = "H_cronIcalOnly";
    confidence = "high";
  }

  // configSource stale: scritto da una chiamata passata, ma cleaning.guestsCount cambiato dopo
  const csMatch = String(fp.order_configSource || "").match(/serviceConfigs\[(\d+)\]/);
  if (csMatch) {
    const csN = parseInt(csMatch[1]);
    if (csN !== fp.cleaning_guestsCount) {
      reasoning.push(
        `configSource STALE: scritto per guests=${csN}, ma cleaning.guestsCount=${fp.cleaning_guestsCount}.`
      );
      // Chi può averlo lasciato così?
      if (fp.audit_has_LINEN_ORDER_RECALCULATED) {
        reasoning.push(
          "audit_has_LINEN_ORDER_RECALCULATED=true → Path A (update-linen-order) ha scritto questo configSource per guests=" +
            csN +
            ". Poi qualcosa ha cambiato cleaning.guestsCount senza richiamare update-linen-order."
        );
        path = "STALE_after_A";
      } else {
        reasoning.push(
          "audit_has_LINEN_ORDER_RECALCULATED=false → configSource scritto da Path C/D (no audit). Cambio guests successivo via path che non scrive configSource (B/E/F/G)."
        );
        path = "STALE_after_C_or_D";
      }
      confidence = "high";
    }
  }

  // Order.guestsCount mismatch (mantiene un valore vecchio)
  if (
    hasGuestsCount &&
    typeof fp.cleaning_guestsCount === "number" &&
    order.guestsCount !== fp.cleaning_guestsCount
  ) {
    reasoning.push(
      `order.guestsCount=${order.guestsCount} != cleaning.guestsCount=${fp.cleaning_guestsCount} → toolUpdateGuests (Path F) sospetto, oppure path B/G non sincronizzati.`
    );
    if (path === "UNKNOWN") path = "GUESTS_DIVERGENT_F_or_B";
    confidence = "medium";
  }

  // Orphan custom: customLinenConfig presente ma linenConfigModified=false
  if (cleaning.linenConfigModified === false && cleaning.customLinenConfig) {
    reasoning.push(
      "ORPHAN_CUSTOM_CONFIG: cleaning ha customLinenConfig ma linenConfigModified=false → bomba inerte, ignorata dal sistema, ma persistente come dato sporco."
    );
    if (path === "UNKNOWN" || path.startsWith("STALE")) {
      path += "+ORPHAN_CUSTOM";
    }
  }

  // Best-match hint
  if (bestMatch.length > 0) {
    const top = bestMatch[0];
    if (top.perfectMatch) {
      reasoning.push(
        `Best-match: actualItems combaciano PERFETTAMENTE con serviceConfigs[${top.guestsTried}].`
      );
    } else {
      reasoning.push(
        `Best-match top: serviceConfigs[${top.guestsTried}] con score=${top.matchScore.toFixed(2)} (no perfect match — possibile customConfig orfana o intermedia).`
      );
    }
  }

  if (path === "UNKNOWN") {
    reasoning.push("Pattern non riconosciuto dai casi noti.");
  }
  return { path, confidence, reasoning };
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
function serialize(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data !== "object") return data;
  if (data.toDate && typeof data.toDate === "function") {
    return data.toDate().toISOString();
  }
  if (Array.isArray(data)) return data.map(serialize);
  const out: any = {};
  for (const k of Object.keys(data)) out[k] = serialize(data[k]);
  return out;
}

function simulateCalculate(
  config: any
): Array<{ id: string; name: string; quantity: number }> {
  const items: Array<{ id: string; name: string; quantity: number }> = [];
  if (!config) return items;

  if (config.bl && typeof config.bl === "object") {
    const blKeys = Object.keys(config.bl);
    const hasAll =
      config.bl["all"] &&
      typeof config.bl["all"] === "object" &&
      Object.keys(config.bl["all"]).length > 0;
    const bedGroupKeys = blKeys.filter((k) => k !== "all");
    const hasBedGroups =
      bedGroupKeys.length > 0 &&
      bedGroupKeys.some((k) => {
        const grp = config.bl[k];
        return grp && typeof grp === "object" && Object.keys(grp).length > 0;
      });

    if (hasAll && hasBedGroups) {
      const merged: Record<string, number> = {};
      bedGroupKeys.forEach((k) => {
        const grp = config.bl[k];
        if (grp && typeof grp === "object") {
          Object.entries(grp as Record<string, number>).forEach(
            ([itemId, qty]) => {
              if (typeof qty === "number" && qty > 0)
                merged[itemId] = (merged[itemId] || 0) + qty;
            }
          );
        }
      });
      Object.entries(config.bl["all"]).forEach(([itemId, qty]) => {
        if (typeof qty === "number" && qty > 0) merged[itemId] = qty as number;
      });
      Object.entries(merged).forEach(([itemId, qty]) => {
        if (qty > 0)
          items.push({ id: itemId, name: getItemName(itemId), quantity: qty });
      });
    } else if (hasAll) {
      Object.entries(config.bl["all"]).forEach(([itemId, qty]) => {
        if (typeof qty === "number" && qty > 0) {
          items.push({
            id: itemId,
            name: getItemName(itemId),
            quantity: qty as number,
          });
        }
      });
    } else {
      Object.entries(config.bl).forEach(([_bedId, bedItems]) => {
        if (typeof bedItems === "object" && bedItems !== null) {
          Object.entries(bedItems as Record<string, number>).forEach(
            ([itemId, qty]) => {
              if (typeof qty === "number" && qty > 0) {
                const existing = items.find((i) => i.id === itemId);
                if (existing) existing.quantity += qty;
                else
                  items.push({
                    id: itemId,
                    name: getItemName(itemId),
                    quantity: qty,
                  });
              }
            }
          );
        }
      });
    }
  }

  if (config.ba && typeof config.ba === "object") {
    Object.entries(config.ba).forEach(([itemId, qty]) => {
      if (typeof qty === "number" && qty > 0)
        items.push({ id: itemId, name: getItemName(itemId), quantity: qty });
    });
  }

  if (config.ki && typeof config.ki === "object") {
    Object.entries(config.ki).forEach(([itemId, qty]) => {
      if (typeof qty === "number" && qty > 0)
        items.push({ id: itemId, name: getItemName(itemId), quantity: qty });
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
      quantityMismatch.push({
        id,
        name: exp.name,
        expectedQty: exp.quantity,
        actualQty: act.quantity,
      });
  });
  actById.forEach((act, id) => {
    if (!expById.has(id))
      extraInActual.push({ id, name: act.name, actualQty: act.quantity });
  });
  return { missingInActual, extraInActual, quantityMismatch };
}
