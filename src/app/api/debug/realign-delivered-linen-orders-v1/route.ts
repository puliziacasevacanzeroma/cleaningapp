/**
 * ════════════════════════════════════════════════════════════════════
 * DEBUG: Realign DELIVERED Linen Orders v1
 * ════════════════════════════════════════════════════════════════════
 *
 * Riallinea gli items di ordini biancheria GIÀ CONSEGNATI (DELIVERED) alla
 * config ATTUALE della pulizia/proprietà, riscrivendo `order.items`.
 *
 * ⚠️ ATTENZIONE: questo endpoint RISCRIVE IL FATTURATO PASSATO.
 *    Usalo solo con piena consapevolezza. È nato per la pulizia una-tantum
 *    delle incoerenze storiche scovate da scan-linen-incoherences-v1.
 *
 * Estrazione items = STESSA logica canonica di scan-linen-incoherences-v1
 * (merge bl['all'] + gruppi letto), così dopo l'apply lo scan torna COHERENT
 * e la card (che leggerà l'ordine) mostrerà gli stessi articoli.
 *
 * SICUREZZA:
 *   - Richiede `propertyName` OPPURE `cleaningId` (no rewrite di flotta a caso)
 *   - Tocca SOLO ordini con status ∈ includeStatuses (default: DELIVERED)
 *   - SKIPPA sempre CANCELLED
 *   - SKIPPA ordini già coerenti (idempotente)
 *   - Risolve prezzo/categoria dall'inventory reale → scrive items "ricchi"
 *     (id, name, quantity, unitPrice, totalPrice, categoryId) così pagamenti
 *     non dipende da fallback e il subtotale resta corretto
 *   - DRY-RUN di default. Scrive solo con apply=1
 *   - Audit log `LINEN_ORDER_REALIGNED_DELIVERED` per ogni write
 *
 * MODALITÀ:
 *   GET ?cronSecret=XXX&propertyName=arya                 → DRY RUN (preview)
 *   GET ?cronSecret=XXX&propertyName=arya&apply=1         → applica
 *   GET ?cronSecret=XXX&cleaningId=ABC&apply=1            → applica 1 caso
 *
 * Query params:
 *   cronSecret      (obbligatorio se CRON_SECRET settato)
 *   propertyName    (filtro su NOME proprietà, case-insensitive, includes)
 *   cleaningId      (target singolo, alternativo a propertyName)
 *   daysBack        (default 60)
 *   daysForward     (default 30)
 *   includeStatuses (default "DELIVERED"; lista separata da virgola)
 *   apply           ("1" per scrivere; altrimenti dry-run)
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getItemName } from "~/lib/itemNames";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ═══════════════════════════════════════════════════════════════
// ESTRAZIONE CANONICA — identica a scan-linen-incoherences-v1 ma
// separata per sezione (bl/ba/ki) così possiamo assegnare categoryId.
// ═══════════════════════════════════════════════════════════════

type Section = "linen" | "kit";
interface ExpectedItem {
  itemId: string;
  quantity: number;
  categoryId: "biancheria_letto" | "biancheria_bagno" | "kit_cortesia";
  section: Section;
}

/** Biancheria letto (bl): merge bl['all'] (verità) + gruppi letto (riempie i mancanti). */
function extractBed(config: any): Record<string, number> {
  const out: Record<string, number> = {};
  if (!config?.bl || typeof config.bl !== "object") return out;

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
    // 1) somma dai gruppi letto
    bedGroupKeys.forEach((k: string) => {
      const items = config.bl[k];
      if (items && typeof items === "object") {
        Object.entries(items).forEach(([itemId, qty]: [string, any]) => {
          if (typeof qty === "number" && qty > 0) {
            out[itemId] = (out[itemId] || 0) + qty;
          }
        });
      }
    });
    // 2) bl['all'] SOVRASCRIVE (è la verità per le voci che contiene)
    Object.entries(config.bl["all"]).forEach(([itemId, qty]: [string, any]) => {
      if (typeof qty === "number" && qty > 0) out[itemId] = qty;
    });
  } else if (hasAll) {
    Object.entries(config.bl["all"]).forEach(([itemId, qty]: [string, any]) => {
      if (typeof qty === "number" && qty > 0) out[itemId] = qty;
    });
  } else {
    Object.entries(config.bl).forEach(([bedId, items]: [string, any]) => {
      if (bedId === "all") return;
      if (items && typeof items === "object") {
        Object.entries(items).forEach(([itemId, qty]: [string, any]) => {
          if (typeof qty === "number" && qty > 0) {
            out[itemId] = (out[itemId] || 0) + qty;
          }
        });
      }
    });
  }
  return out;
}

function extractFlat(obj: any): Record<string, number> {
  const out: Record<string, number> = {};
  if (!obj || typeof obj !== "object") return out;
  Object.entries(obj).forEach(([itemId, qty]: [string, any]) => {
    if (typeof qty === "number" && qty > 0) out[itemId] = (out[itemId] || 0) + qty;
  });
  return out;
}

/** Tutti gli item attesi dalla config, con categoria/sezione. */
function buildExpectedItems(config: any): ExpectedItem[] {
  const items: ExpectedItem[] = [];
  const bed = extractBed(config);
  Object.entries(bed).forEach(([itemId, quantity]) =>
    items.push({ itemId, quantity, categoryId: "biancheria_letto", section: "linen" }),
  );
  const bath = extractFlat(config?.ba);
  Object.entries(bath).forEach(([itemId, quantity]) =>
    items.push({ itemId, quantity, categoryId: "biancheria_bagno", section: "linen" }),
  );
  const kit = extractFlat(config?.ki);
  Object.entries(kit).forEach(([itemId, quantity]) =>
    items.push({ itemId, quantity, categoryId: "kit_cortesia", section: "kit" }),
  );
  return items;
}

/** Quantità reali dall'ordine (ignora voci di servizio e prodotti pulizia). */
function extractActualItems(order: any): Record<string, number> {
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

function isCoherent(expected: ExpectedItem[], actual: Record<string, number>): boolean {
  const exp: Record<string, number> = {};
  expected.forEach((e) => (exp[e.itemId] = (exp[e.itemId] || 0) + e.quantity));
  const keys = new Set([...Object.keys(exp), ...Object.keys(actual)]);
  for (const k of keys) {
    if ((exp[k] ?? 0) !== (actual[k] ?? 0)) return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  const urlSecret = searchParams.get("cronSecret") || searchParams.get("secret");
  if (cronSecret && urlSecret !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const propertyNameFilter = searchParams.get("propertyName")?.toLowerCase() || null;
  const cleaningIdFilter = searchParams.get("cleaningId") || null;
  const daysBack = parseInt(searchParams.get("daysBack") || "60");
  const daysForward = parseInt(searchParams.get("daysForward") || "30");
  const apply = searchParams.get("apply") === "1";
  const includeStatuses = (searchParams.get("includeStatuses") || "DELIVERED")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  // 🔒 Guardia anti-disastro: serve un filtro esplicito
  if (!propertyNameFilter && !cleaningIdFilter) {
    return NextResponse.json(
      { error: "Specifica propertyName oppure cleaningId (no rewrite di flotta)." },
      { status: 400 },
    );
  }

  try {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - daysBack);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + daysForward);
    endDate.setHours(23, 59, 59, 999);

    // ── Inventory (per prezzo/nome) ──
    const invSnap = await adminDb.collection("inventory").get();
    const invMap = new Map<string, any>();
    invSnap.docs.forEach((d) => {
      const data = d.data() as any;
      const rec = {
        id: d.id,
        name: data.name || "",
        sellPrice: data.sellPrice ?? data.price ?? 0,
        categoryId: data.categoryId || data.categoryName || null,
      };
      invMap.set(d.id, rec);
      if (data.key) invMap.set(data.key, rec);
      if (d.id.startsWith("item_")) invMap.set(d.id.replace("item_", ""), rec);
    });
    const resolveInv = (itemId: string) =>
      invMap.get(itemId) || invMap.get(`item_${itemId}`) || null;

    // ── Properties ──
    const propsSnap = await adminDb.collection("properties").get();
    const propsById = new Map<string, any>();
    propsSnap.docs.forEach((d) => propsById.set(d.id, { id: d.id, ...(d.data() as any) }));

    // ── Cleanings ──
    let cleaningDocs: any[] = [];
    if (cleaningIdFilter) {
      const cDoc = await adminDb.collection("cleanings").doc(cleaningIdFilter).get();
      if (cDoc.exists) cleaningDocs = [{ id: cDoc.id, ...(cDoc.data() as any) }];
    } else {
      const cSnap = await adminDb
        .collection("cleanings")
        .where("scheduledDate", ">=", Timestamp.fromDate(startDate))
        .where("scheduledDate", "<=", Timestamp.fromDate(endDate))
        .get();
      cleaningDocs = cSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    }

    // ── Orders nel range (per lookup veloce) ──
    const ordersByCleaningId = new Map<string, any[]>();
    const ordersById = new Map<string, any>();
    const oSnap = await adminDb
      .collection("orders")
      .where("scheduledDate", ">=", Timestamp.fromDate(startDate))
      .where("scheduledDate", "<=", Timestamp.fromDate(endDate))
      .get();
    oSnap.docs.forEach((d) => {
      const data = d.data() as any;
      const order = { id: d.id, ...data };
      ordersById.set(d.id, order);
      if (data.cleaningId) {
        if (!ordersByCleaningId.has(data.cleaningId)) ordersByCleaningId.set(data.cleaningId, []);
        ordersByCleaningId.get(data.cleaningId)!.push(order);
      }
    });

    const results: any[] = [];
    const skipped: Record<string, number> = {};
    let wouldUpdate = 0;
    let updated = 0;
    const priceWarnings: any[] = [];

    for (const c of cleaningDocs) {
      const property = propsById.get(c.propertyId);
      if (!property) {
        skipped["property_not_found"] = (skipped["property_not_found"] || 0) + 1;
        continue;
      }
      if (propertyNameFilter && !(property.name || "").toLowerCase().includes(propertyNameFilter)) {
        continue;
      }

      const guestsCount = c.guestsCount || c.maxGuests || property.maxGuests || 2;

      // Config: customLinenConfig se modificata, altrimenti serviceConfigs[guests]
      let config: any = null;
      let configSource = "";
      const hasCustom =
        c.linenConfigModified === true &&
        c.customLinenConfig &&
        typeof c.customLinenConfig === "object";
      if (hasCustom) {
        config = c.customLinenConfig;
        configSource = "customLinenConfig";
      } else if (property.serviceConfigs) {
        config =
          property.serviceConfigs[guestsCount] ||
          property.serviceConfigs[String(guestsCount)];
        configSource = `serviceConfigs[${guestsCount}]`;
      }
      if (!config) {
        skipped["no_config"] = (skipped["no_config"] || 0) + 1;
        continue;
      }

      // Ordine collegato
      let order: any = null;
      if (c.laundryOrderId) {
        const cand = ordersById.get(c.laundryOrderId);
        if (cand && cand.status !== "CANCELLED") order = cand;
      }
      if (!order) {
        const linked = (ordersByCleaningId.get(c.id) || []).filter((o) => o.status !== "CANCELLED");
        if (linked.length > 0) order = linked[0];
      }
      if (!order) {
        skipped["no_order"] = (skipped["no_order"] || 0) + 1;
        continue;
      }
      if (!includeStatuses.includes(String(order.status).toUpperCase())) {
        skipped[`status_${order.status}`] = (skipped[`status_${order.status}`] || 0) + 1;
        continue;
      }

      const expected = buildExpectedItems(config);
      const actual = extractActualItems(order);

      if (isCoherent(expected, actual)) {
        skipped["already_coherent"] = (skipped["already_coherent"] || 0) + 1;
        continue;
      }

      // ── Costruisci nuovi items "ricchi" ──
      const newItems = expected.map((e) => {
        const inv = resolveInv(e.itemId);
        const unitPrice = inv?.sellPrice ?? 0;
        const name = inv?.name?.trim() || getItemName(e.itemId);
        if (!inv) {
          priceWarnings.push({
            cleaningId: c.id,
            itemId: e.itemId,
            name,
            note: "Nessun match inventory → unitPrice=0. Verifica che l'articolo esista in inventory.",
          });
        }
        return {
          id: e.itemId,
          itemId: e.itemId,
          name,
          quantity: e.quantity,
          unitPrice,
          totalPrice: Math.round(unitPrice * e.quantity * 100) / 100,
          categoryId: e.categoryId,
        };
      });

      // ── PRESERVAZIONE CONSERVATIVA ──────────────────────────────
      // Tocchiamo SOLO gli articoli di biancheria/bagno/kit (quelli che il
      // ricalcolo dalla config gestisce). TUTTO il resto (prodotti pulizia,
      // servizi extra, fee, articoli orfani/non risolvibili) viene LASCIATO
      // INTATTO così com'è nell'ordine. Niente cancellazioni silenziose.
      const MANAGED_CATS = new Set(["biancheria_letto", "biancheria_bagno", "kit_cortesia"]);
      const isManagedByRecompute = (it: any): boolean => {
        const id = it.itemId || it.id;
        if (!id) return false; // niente id → preserva per sicurezza
        if (id === "_delivery_fee" || id === "_bed_making_fee") return false; // preserva
        if (it.type === "cleaning_product") return false; // preserva prodotti pulizia
        const inv = resolveInv(id);
        const cat = String(it.categoryId || it.category || inv?.categoryId || "").toLowerCase();
        // Gestito dal ricalcolo SOLO se è chiaramente biancheria/bagno/kit.
        // Categoria sconosciuta / non risolvibile → NON gestito → preserva.
        return MANAGED_CATS.has(cat);
      };

      const preserved = (Array.isArray(order.items) ? order.items : []).filter(
        (it: any) => !isManagedByRecompute(it),
      );
      const finalItems = [...newItems, ...preserved];

      const itemsBeforeSummary = (Array.isArray(order.items) ? order.items : []).map((it: any) => ({
        id: it.itemId || it.id,
        quantity: Number(it.quantity) || 0,
      }));
      const itemsAfterSummary = finalItems.map((it: any) => ({
        id: it.itemId || it.id,
        quantity: it.quantity,
      }));
      const preservedSummary = preserved.map((it: any) => it.itemId || it.id);

      const resultEntry: any = {
        cleaningId: c.id,
        propertyName: property.name,
        scheduledDate: c.scheduledDate?.toDate?.()?.toISOString() || null,
        guestsCount,
        orderId: order.id,
        orderStatus: order.status,
        configSource,
        itemsBefore: itemsBeforeSummary,
        itemsAfter: itemsAfterSummary,
        preserved: preservedSummary,
        applied: false,
      };

      if (apply) {
        // Doppia verifica: ricarica l'ordine e controlla che lo status non sia cambiato
        const fresh = await adminDb.collection("orders").doc(order.id).get();
        const freshStatus = (fresh.data() as any)?.status;
        if (!includeStatuses.includes(String(freshStatus).toUpperCase())) {
          resultEntry.skippedReason = `status cambiato a ${freshStatus}, abort`;
          results.push(resultEntry);
          continue;
        }

        await adminDb.collection("orders").doc(order.id).update({
          items: finalItems,
          updatedAt: Timestamp.now(),
          itemsUpdatedFromConfig: true,
          configSource,
          _realignedAt: Timestamp.now(),
          _realignReason: "realign-delivered-linen-orders-v1",
          _realignConfigSource: configSource,
        });
        updated++;
        resultEntry.applied = true;

        // Audit (fire-and-forget)
        try {
          await adminDb.collection("auditLog").add({
            action: "LINEN_ORDER_REALIGNED_DELIVERED",
            entityType: "order",
            entityId: order.id,
            propertyId: property.id,
            propertyName: property.name,
            source: "api/debug/realign-delivered-linen-orders-v1",
            timestamp: Timestamp.now(),
            details: {
              cleaningId: c.id,
              orderStatus: order.status,
              configSource,
              guestsCount,
              itemsBefore: itemsBeforeSummary,
              itemsAfter: itemsAfterSummary,
              callerIp:
                request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                request.headers.get("x-real-ip") ||
                null,
            },
          });
        } catch (auditErr) {
          console.error("[realign] audit fail:", auditErr);
        }
      } else {
        wouldUpdate++;
      }

      results.push(resultEntry);
    }

    return NextResponse.json({
      success: true,
      mode: apply ? "APPLY" : "DRY_RUN",
      timestamp: new Date().toISOString(),
      query: {
        propertyName: propertyNameFilter,
        cleaningId: cleaningIdFilter,
        includeStatuses,
        daysBack,
        daysForward,
        rangeStart: startDate.toISOString(),
        rangeEnd: endDate.toISOString(),
      },
      stats: {
        cleaningsScanned: cleaningDocs.length,
        ordersInRange: oSnap.size,
        divergentFound: results.length,
        wouldUpdate: apply ? 0 : wouldUpdate,
        updated: apply ? updated : 0,
        skipped,
        priceWarningsCount: priceWarnings.length,
      },
      priceWarnings,
      results,
      _hint: apply
        ? "Applicato. Rilancia scan-linen-incoherences-v1 per confermare COHERENT."
        : "DRY RUN. Aggiungi &apply=1 per scrivere. Controlla priceWarnings prima.",
    });
  } catch (error: any) {
    console.error("Errore realign-delivered-linen-orders-v1:", error);
    return NextResponse.json(
      { error: "Errore server", details: error?.message || String(error) },
      { status: 500 },
    );
  }
}
