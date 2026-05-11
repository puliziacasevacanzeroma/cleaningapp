/**
 * ════════════════════════════════════════════════════════════════════
 * DEBUG: Timeline Cleaning v1 — Storia completa di una pulizia + ordine
 * ════════════════════════════════════════════════════════════════════
 *
 * Read-only assoluta. Per un cleaningId specifico mostra:
 *   1. State: stato attuale pulizia + ordine (tutti i campi)
 *   2. Property: stato attuale serviceConfigs della proprietà
 *   3. ExpectedItems: cosa DOVREBBERO essere gli items dell'ordine
 *      data la config attuale (simulazione, zero scrittura)
 *   4. ActualItems: cosa è realmente nell'ordine
 *   5. Diff: differenza tra Expected e Actual
 *   6. AuditLog: tutti gli eventi auditLog filtrati per questa pulizia o ordine
 *   7. Diagnosis: ricostruzione di "cosa è successo" con timeline ricostruita
 *
 * USAGE:
 *   GET /api/debug/timeline-cleaning-v1?cronSecret=XXX&cleaningId=YYY
 *
 * SCRIVE NULLA. SOLO LETTURA.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getItemName } from "~/lib/itemNames";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────
  const CRON_SECRET = process.env.CRON_SECRET || "";
  if (!CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET non configurato" }, { status: 500 });
  }
  const authHeader = req.headers.get("authorization") || "";
  const urlSecret = req.nextUrl.searchParams.get("cronSecret") || "";
  if (authHeader !== `Bearer ${CRON_SECRET}` && urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cleaningId = req.nextUrl.searchParams.get("cleaningId") || "";
  if (!cleaningId) {
    return NextResponse.json({ error: "cleaningId mancante" }, { status: 400 });
  }

  try {
    // ── 1. PULIZIA ─────────────────────────────────────
    const cleaningDoc = await adminDb.collection("cleanings").doc(cleaningId).get();
    if (!cleaningDoc.exists) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }
    const cleaningData = cleaningDoc.data() as any;

    // Serializza tutti i Timestamp in ISO
    const cleaning = serializeFirestoreData(cleaningData);
    cleaning.id = cleaningId;

    // ── 2. ORDINE COLLEGATO ────────────────────────────
    const ordersSnap = await adminDb
      .collection("orders")
      .where("cleaningId", "==", cleaningId)
      .get();

    const orders = ordersSnap.docs.map((d) => {
      const data = serializeFirestoreData(d.data() as any);
      data.id = d.id;
      return data;
    });

    // ── 3. PROPRIETÀ ───────────────────────────────────
    const propertyId = cleaningData.propertyId;
    const propertyDoc = await adminDb.collection("properties").doc(propertyId).get();
    if (!propertyDoc.exists) {
      return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
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
        ? Object.keys(propertyData.serviceConfigs)
        : [],
      serviceConfigForCurrentGuests:
        propertyData.serviceConfigs?.[cleaningData.guestsCount] ||
        propertyData.serviceConfigs?.[String(cleaningData.guestsCount)] ||
        null,
    };

    // ── 4. EXPECTED ITEMS ──────────────────────────────
    // Simula cosa update-linen-order calcolerebbe ADESSO
    const guestsCount = cleaningData.guestsCount || 2;
    const hasCustomConfig =
      cleaningData.linenConfigModified === true && cleaningData.customLinenConfig;

    let expectedConfig: any = null;
    let expectedSource = "";

    if (hasCustomConfig) {
      expectedConfig = cleaningData.customLinenConfig;
      expectedSource = "customLinenConfig";
    } else if (propertyData.serviceConfigs) {
      expectedConfig =
        propertyData.serviceConfigs[guestsCount] ||
        propertyData.serviceConfigs[String(guestsCount)];
      expectedSource = `serviceConfigs[${guestsCount}]`;
    }

    const expectedItems = expectedConfig
      ? simulateCalculateItems(expectedConfig)
      : [];

    // ── 5. ACTUAL ITEMS ────────────────────────────────
    const actualItems =
      orders.length > 0
        ? (orders[0].items || []).map((it: any) => ({
            id: it.id,
            name: it.name,
            quantity: it.quantity,
          }))
        : [];

    // ── 6. DIFF ─────────────────────────────────────────
    const diff = computeDiff(expectedItems, actualItems);

    // ── 7. AUDIT LOG ───────────────────────────────────
    const auditEntriesByCleaningId = await adminDb
      .collection("auditLog")
      .where("entityId", "==", cleaningId)
      .limit(50)
      .get();

    const auditEntriesByOrderId = orders.length
      ? await adminDb
          .collection("auditLog")
          .where("entityId", "==", orders[0].id)
          .limit(50)
          .get()
      : null;

    const auditCleaning = auditEntriesByCleaningId.docs
      .map((d) => {
        const data = serializeFirestoreData(d.data() as any);
        data.id = d.id;
        return data;
      })
      .sort((a: any, b: any) => {
        const ta = a.timestamp || "";
        const tb = b.timestamp || "";
        return ta.localeCompare(tb);
      });

    const auditOrder = auditEntriesByOrderId
      ? auditEntriesByOrderId.docs
          .map((d) => {
            const data = serializeFirestoreData(d.data() as any);
            data.id = d.id;
            return data;
          })
          .sort((a: any, b: any) => {
            const ta = a.timestamp || "";
            const tb = b.timestamp || "";
            return ta.localeCompare(tb);
          })
      : [];

    // ── 8. DIAGNOSIS ────────────────────────────────────
    const diagnosis = buildDiagnosis({
      cleaning,
      order: orders[0] || null,
      expectedItems,
      actualItems,
      diff,
      property,
      expectedSource,
      auditEntries: [...auditCleaning, ...auditOrder],
    });

    return NextResponse.json({
      success: true,
      cleaningId,
      cleaning,
      orders,
      property,
      expected: {
        configSource: expectedSource,
        items: expectedItems,
      },
      actual: {
        items: actualItems,
      },
      diff,
      auditLog: {
        forCleaning: auditCleaning,
        forOrder: auditOrder,
      },
      diagnosis,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Errore lettura timeline",
        details: error?.message || String(error),
        stack: error?.stack || null,
      },
      { status: 500 }
    );
  }
}

// ══════════════════════════════════════════════════════════════════
// HELPERS (puri, zero side effect)
// ══════════════════════════════════════════════════════════════════

function serializeFirestoreData(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data !== "object") return data;
  if (data.toDate && typeof data.toDate === "function") {
    return data.toDate().toISOString();
  }
  if (Array.isArray(data)) {
    return data.map(serializeFirestoreData);
  }
  const out: any = {};
  for (const key of Object.keys(data)) {
    out[key] = serializeFirestoreData(data[key]);
  }
  return out;
}

function simulateCalculateItems(
  config: any
): Array<{ id: string; name: string; quantity: number }> {
  const items: Array<{ id: string; name: string; quantity: number }> = [];
  if (!config) return items;

  // bl: biancheria letto
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
        const grpItems = config.bl[k];
        return (
          grpItems &&
          typeof grpItems === "object" &&
          Object.keys(grpItems).length > 0
        );
      });

    if (hasAll && hasBedGroups) {
      // MERGE: gruppi come base, all sovrascrive
      const merged: Record<string, number> = {};
      bedGroupKeys.forEach((k) => {
        const grpItems = config.bl[k];
        if (grpItems && typeof grpItems === "object") {
          Object.entries(grpItems as Record<string, number>).forEach(
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
          items.push({
            id: itemId,
            name: getItemName(itemId),
            quantity: qty,
          });
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
      Object.entries(config.bl).forEach(([bedId, bedItems]) => {
        if (typeof bedItems === "object" && bedItems !== null) {
          Object.entries(bedItems as Record<string, number>).forEach(
            ([itemId, qty]) => {
              if (typeof qty === "number" && qty > 0) {
                const existing = items.find((i) => i.id === itemId);
                if (existing) {
                  existing.quantity += qty;
                } else {
                  items.push({
                    id: itemId,
                    name: getItemName(itemId),
                    quantity: qty,
                  });
                }
              }
            }
          );
        }
      });
    }
  }

  // ba: biancheria bagno
  if (config.ba && typeof config.ba === "object") {
    Object.entries(config.ba).forEach(([itemId, qty]) => {
      if (typeof qty === "number" && qty > 0) {
        items.push({ id: itemId, name: getItemName(itemId), quantity: qty });
      }
    });
  }

  // ki: kit cortesia
  if (config.ki && typeof config.ki === "object") {
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
  const expectedById = new Map(expected.map((e) => [e.id, e]));
  const actualById = new Map(actual.map((a) => [a.id, a]));

  const missingInActual: any[] = [];
  const extraInActual: any[] = [];
  const quantityMismatch: any[] = [];

  expectedById.forEach((exp, id) => {
    const act = actualById.get(id);
    if (!act) {
      missingInActual.push({ id, name: exp.name, expectedQty: exp.quantity });
    } else if (act.quantity !== exp.quantity) {
      quantityMismatch.push({
        id,
        name: exp.name,
        expectedQty: exp.quantity,
        actualQty: act.quantity,
      });
    }
  });

  actualById.forEach((act, id) => {
    if (!expectedById.has(id)) {
      extraInActual.push({ id, name: act.name, actualQty: act.quantity });
    }
  });

  return {
    missingInActual,
    extraInActual,
    quantityMismatch,
    isMatch:
      missingInActual.length === 0 &&
      extraInActual.length === 0 &&
      quantityMismatch.length === 0,
  };
}

function buildDiagnosis(ctx: {
  cleaning: any;
  order: any;
  expectedItems: any[];
  actualItems: any[];
  diff: any;
  property: any;
  expectedSource: string;
  auditEntries: any[];
}): string[] {
  const out: string[] = [];

  if (!ctx.order) {
    out.push("⚠️ Nessun ordine collegato a questa pulizia.");
    return out;
  }

  // 1. Mismatch items?
  if (ctx.diff.isMatch) {
    out.push("✅ Items ordine = items attesi. Coerenza dotazione OK.");
  } else {
    out.push(
      `❌ MISMATCH ITEMS: ${ctx.diff.missingInActual.length} mancanti, ${ctx.diff.extraInActual.length} extra, ${ctx.diff.quantityMismatch.length} quantità diverse.`
    );
  }

  // 2. configSource coerente?
  if (ctx.order.configSource) {
    if (ctx.order.configSource !== ctx.expectedSource) {
      out.push(
        `❌ CONFIG_SOURCE MISMATCH: ordine generato da '${ctx.order.configSource}', atteso '${ctx.expectedSource}'. Significa che l'ordine NON è stato ricalcolato dopo l'ultimo cambio di guestsCount.`
      );
    } else {
      out.push(
        `✅ configSource = '${ctx.order.configSource}' coerente con guestsCount attuale.`
      );
    }
  } else {
    out.push(
      `⚠️ Ordine senza campo 'configSource' (probabilmente creato dal cron iCal originale, non ricalcolato da update-linen-order)`
    );
  }

  // 3. guestsCount ordine vs pulizia
  if (typeof ctx.order.guestsCount === "number") {
    if (ctx.order.guestsCount !== ctx.cleaning.guestsCount) {
      out.push(
        `❌ ORDER_GUESTS_STALE: order.guestsCount=${ctx.order.guestsCount}, cleaning.guestsCount=${ctx.cleaning.guestsCount}`
      );
    }
  }

  // 4. itemsUpdatedFromConfig flag
  if (ctx.order.itemsUpdatedFromConfig === true) {
    out.push(
      `📦 Flag 'itemsUpdatedFromConfig=true' presente → update-linen-order chiamato almeno una volta. orderUpdatedAt=${ctx.order.updatedAt}`
    );
  } else {
    out.push(
      `⚠️ Flag 'itemsUpdatedFromConfig' assente o false → ordine NON ricalcolato da update-linen-order dopo creazione iniziale.`
    );
  }

  // 5. Pulizia con guestsAppliedBySystem
  if (ctx.cleaning.guestsAppliedBySystem === true) {
    out.push(
      `📅 Pulizia: guestsCount=${ctx.cleaning.guestsCount} applicato dal sistema (cron apply-default-guests) il ${ctx.cleaning.guestsAppliedAt || "?"}`
    );
  }

  // 6. linenConfigModified
  if (ctx.cleaning.linenConfigModified === true) {
    out.push(
      `🔧 Pulizia ha customLinenConfig attiva (linenConfigModified=true). Source: 'customLinenConfig', NON serviceConfigs.`
    );
  } else if (ctx.cleaning.linenConfigModified === false && ctx.cleaning.customLinenConfig) {
    out.push(
      `⚠️ ORPHAN_CUSTOM_CONFIG: customLinenConfig presente ma linenConfigModified=false. Bomba inerte.`
    );
  }

  // 7. Audit log
  if (ctx.auditEntries.length > 0) {
    out.push(
      `📜 Audit log: ${ctx.auditEntries.length} eventi trovati per questa pulizia/ordine.`
    );
  } else {
    out.push(`📜 Nessun audit log per questa pulizia/ordine.`);
  }

  return out;
}
