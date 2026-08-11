/**
 * ════════════════════════════════════════════════════════════════════
 * DEBUG: Audit Categorie & Coerenza Pagamenti v1 — READ ONLY
 * ════════════════════════════════════════════════════════════════════
 *
 * GET /api/debug/audit-categorie-v1?cronSecret=XXX&month=8&year=2026
 *
 * Quantifica sui DATI VERI tutte le incongruenze che il refactor di
 * `paymentsCore.ts` corregge. Va eseguita PRIMA di deployare il fix,
 * per sapere quanti euro si muovono e su quali ordini.
 *
 * 🔒 NON SCRIVE NULLA. Nessun parametro `apply`. Solo letture.
 *
 * Query params:
 *   cronSecret  (obbligatorio)
 *   month       (default: mese corrente)
 *   year        (default: anno corrente)
 *   ownerId     (opzionale, restringe a un proprietario)
 *   samples     (default 25, max 200) → quanti esempi dettagliati
 *
 * ─── COSA MISURA ─────────────────────────────────────────────────
 *  A. deltaProdottiPulizia  → item che la regola canonica esclude PER NOME
 *     (anticalcare, sgrassatore…) ma che la vecchia logica admin fatturava.
 *  B. deltaOrfani           → item senza nome risolvibile: la vecchia logica
 *     admin/proprietario li scartava, la formula canonica li fattura.
 *  C. bucketAltro           → euro finiti in categoria "altro" e quindi
 *     spalmati in silenzio sulle altre categorie dal vecchio scaling.
 *  D. deltaPrezzoZero       → item con prezzo 0 sporco (divergenza `||`/`??`).
 *  E. ordiniCancellati      → CANCELLED collegati a pulizia COMPLETED che
 *     entravano nei riquadri categoria ma non nel totale.
 *  F. serviziEsclusi        → excludedFromBilling contati nel totale proprietà.
 *  G. storedVsRecompute     → `calculatedTotal` salvato ≠ ricalcolo canonico
 *     (il proprietario/le email leggono il salvato, l'admin il ricalcolo).
 *  H. overrideMensili       → mesi con override admin, ignorato lato admin.
 *  I. totaleVecchio vs totaleNuovo per proprietario, con delta.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import {
  buildInventoryMap,
  calculateOrderRawPrice,
  isCleaningProductItem,
  type DebtCalcOrder,
} from "~/lib/payments/debtCalculator";
import {
  classifyItemGroup,
  resolveItemTotal,
  pickMainCategory,
  splitOrderByCategory,
  isCleaningBillable,
  isOrderBillable,
  round2,
  type OrderSubtotals,
} from "~/lib/payments/paymentsCore";
import { SYSTEM_ITEMS, OPTIONAL_ITEMS } from "~/lib/inventory/systemItems";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYSTEM_ITEMS_BY_KEY: Record<string, { name: string; categoryId: string }> = (() => {
  const map: Record<string, { name: string; categoryId: string }> = {};
  [...SYSTEM_ITEMS, ...OPTIONAL_ITEMS].forEach((i: any) => {
    const entry = { name: i.name, categoryId: i.categoryId };
    map[i.id] = entry;
    map[i.key] = entry;
    if (String(i.id).startsWith("item_")) map[String(i.id).replace("item_", "")] = entry;
  });
  return map;
})();

function looksLikeRawId(s: string): boolean {
  if (!s || s.length < 4) return false;
  if (/[\s-]/.test(s)) return false;
  if (/^[a-z][a-z0-9_]*_[a-z0-9_]+$/.test(s)) return true;
  if (/^[a-z][a-z0-9]*[A-Z]/.test(s)) return true;
  if (/^[A-Z][a-z0-9]*$/.test(s)) return false;
  if (s.length >= 12) {
    const hasMultipleUpper = (s.match(/[A-Z]/g) || []).length >= 2;
    const hasDigit = /[0-9]/.test(s);
    if (hasMultipleUpper && hasDigit) return true;
  }
  return false;
}

function resolveName(item: any, invItem: any): string | null {
  const itemKey = item.itemId || item.id;
  const sysItem = itemKey ? SYSTEM_ITEMS_BY_KEY[itemKey] : undefined;
  if (invItem?.name && String(invItem.name).trim()) return invItem.name;
  if (sysItem?.name) return sysItem.name;
  if (item.name && typeof item.name === "string" && item.name.trim()) {
    if (!looksLikeRawId(item.name)) return item.name;
  }
  return null;
}

function toDate(v: any): Date | null {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  if (v instanceof Date) return v;
  if (v?.seconds) return new Date(v.seconds * 1000);
  return null;
}

function inMonth(v: any, month: number, year: number): boolean {
  const d = toDate(v);
  if (!d) return false;
  return d.getMonth() === month - 1 && d.getFullYear() === year;
}

/** Vecchia logica admin (pre-refactor), replicata per il confronto. */
function legacyAdminOrderTotal(order: any, inventory: Map<string, any>) {
  let total = 0;
  let linen = 0;
  let kit = 0;
  let extra = 0;
  for (const item of Array.isArray(order.items) ? order.items : []) {
    const itemKey = item.itemId || item.id;
    const invItem = inventory.get(itemKey);
    const name = resolveName(item, invItem);
    if (!name) continue; // vecchio: orfani scartati

    // vecchia classificazione: NESSUN fallback per nome sui prodotti pulizia
    const itemCat = String(item.categoryId || item.category || "").toLowerCase();
    const invCat = String(invItem?.categoryId || invItem?.categoryName || "").toLowerCase();
    const sysCat = String(SYSTEM_ITEMS_BY_KEY[itemKey]?.categoryId || "").toLowerCase();
    const cat = itemCat || invCat || sysCat;
    let group = "altro";
    if (item.type === "cleaning_product" || cat === "prodotti_pulizia" || cat === "cleaning_products") group = "cleaning_product";
    else if (cat === "kit_cortesia" || invCat.includes("cortesia") || invCat.includes("kit")) group = "kit_cortesia";
    else if (cat === "servizi_extra" || invCat.includes("extra")) group = "servizi_extra";
    else if (cat === "biancheria_letto" || cat === "biancheria_bagno" || invCat.includes("biancheria")) group = "linen";
    if (group === "cleaning_product") continue;

    const basePrice = item.unitPrice || item.price || invItem?.sellPrice || 0;
    const unitPrice = item.priceOverride ?? basePrice;
    const quantity = item.quantity || 1;
    const itemTotal = item.totalPrice || unitPrice * quantity;

    total += itemTotal;
    if (group === "linen") linen += itemTotal;
    else if (group === "kit_cortesia") kit += itemTotal;
    else if (group === "servizi_extra") extra += itemTotal;
  }
  const deliveryFee = order.deliveryFee && order.deliveryFeeEnabled !== false ? order.deliveryFee : 0;
  const bedMakingFee = order.bedMaking && order.bedMakingFee ? order.bedMakingFee : 0;
  total += deliveryFee + bedMakingFee;
  return { total, linen, kit, extra, others: deliveryFee + bedMakingFee };
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("cronSecret") || req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const month = Number(req.nextUrl.searchParams.get("month") || now.getMonth() + 1);
  const year = Number(req.nextUrl.searchParams.get("year") || now.getFullYear());
  const ownerFilter = req.nextUrl.searchParams.get("ownerId") || null;
  const maxSamples = Math.min(200, Number(req.nextUrl.searchParams.get("samples") || 25));

  try {
    const [propsSnap, invSnap, cleaningsSnap, ordersSnap, overridesSnap] = await Promise.all([
      adminDb.collection("properties").get(),
      adminDb.collection("inventory").get(),
      adminDb.collection("cleanings").get(),
      adminDb.collection("orders").get(),
      adminDb.collection("paymentOverrides").get(),
    ]);

    // Inventario con i 3 schemi di id coesistenti
    const inventory = new Map<string, any>();
    invSnap.docs.forEach((d: any) => {
      const data: any = d.data();
      const entry = {
        id: d.id,
        name: data.name || "",
        sellPrice: data.sellPrice || data.price || 0,
        price: data.price,
        categoryName: data.categoryName || data.category || data.categoryId || "Altro",
        categoryId: data.categoryId || data.category || undefined,
      };
      inventory.set(d.id, entry);
      if (data.key) inventory.set(data.key, entry);
      if (d.id.startsWith("item_")) inventory.set(d.id.replace("item_", ""), entry);
    });
    const inventoryById = buildInventoryMap(invSnap.docs.map((d: any) => ({ id: d.id, ...(d.data() as any) })) as any);

    const properties = new Map<string, any>();
    propsSnap.docs.forEach(d => properties.set(d.id, { id: d.id, ...(d.data() as any) }));

    const cleanings = cleaningsSnap.docs
      .map((d: any) => ({ id: d.id, ...(d.data() as any) }))
      .filter((c: any) => inMonth(c.scheduledDate, month, year));
    const orders = ordersSnap.docs
      .map((d: any) => ({ id: d.id, ...(d.data() as any) }))
      .filter((o: any) => inMonth(o.deliveredAt || o.scheduledDate, month, year));

    const billableCleaningIds = new Set<string>(
      cleanings.filter((c: any) => isCleaningBillable(c)).map((c: any) => String(c.id)),
    );
    // Set "vecchio": tutte le COMPLETED, anche escluse
    const legacyCompletedIds = new Set<string>(
      cleanings.filter((c: any) => c.status === "COMPLETED").map((c: any) => String(c.id)),
    );

    const agg = {
      deltaProdottiPulizia: 0,
      deltaOrfani: 0,
      bucketAltro: 0,
      deltaPrezzoZero: 0,
      ordiniCancellatiEuro: 0,
      serviziEsclusiEuro: 0,
      storedVsRecomputeEuro: 0,
    };
    const counts = {
      ordiniAnalizzati: 0,
      ordiniConProdottiPuliziaPerNome: 0,
      ordiniConOrfani: 0,
      ordiniConBucketAltro: 0,
      ordiniConPrezzoZero: 0,
      ordiniCancellatiContati: 0,
      pulizieEscluse: 0,
      ordiniEsclusi: 0,
      ordiniStoredDiverso: 0,
    };

    const samples: any[] = [];
    const perOwner = new Map<string, { name: string; vecchio: number; nuovo: number; delta: number }>();

    // ─── PULIZIE ───
    for (const c of cleanings as any[]) {
      const prop = properties.get(c.propertyId);
      if (!prop) continue;
      if (ownerFilter && prop.ownerId !== ownerFilter) continue;
      if (c.status !== "COMPLETED") continue;

      const basePrice = c.price || prop.cleaningPrice || 0;
      const price = (c.priceOverride ?? basePrice) + (c.holidayFee ?? 0);
      const billable = isCleaningBillable(c);
      if (!billable) {
        counts.pulizieEscluse++;
        agg.serviziEsclusiEuro = round2(agg.serviziEsclusiEuro + price);
      }

      const ownerId = prop.ownerId || "unknown";
      if (!perOwner.has(ownerId)) {
        perOwner.set(ownerId, { name: prop.ownerName || "?", vecchio: 0, nuovo: 0, delta: 0 });
      }
      const row = perOwner.get(ownerId)!;
      // vecchio: escludeva già le pulizie escluse dai totali cliente
      if (c.excludedFromBilling !== true) row.vecchio = round2(row.vecchio + price);
      if (billable) row.nuovo = round2(row.nuovo + price);
    }

    // ─── ORDINI ───
    for (const o of orders as any[]) {
      const prop = properties.get(o.propertyId);
      if (!prop) continue;
      if (ownerFilter && prop.ownerId !== ownerFilter) continue;

      const legacyIncluded =
        o.status === "DELIVERED" || (o.cleaningId && legacyCompletedIds.has(o.cleaningId));
      const newIncluded = isOrderBillable(o, billableCleaningIds);
      if (!legacyIncluded && !newIncluded) continue;

      counts.ordiniAnalizzati++;

      // ── nuova logica canonica ──
      let linen = 0, kit = 0, extra = 0, altro = 0, total = 0;
      let orfaniEuro = 0, prodottiPuliziaPerNomeEuro = 0, prezzoZeroEuro = 0;
      const noteItems: any[] = [];

      for (const item of Array.isArray(o.items) ? o.items : []) {
        const itemKey = item.itemId || item.id;
        const invItem = inventory.get(itemKey);
        const sysItem = itemKey ? SYSTEM_ITEMS_BY_KEY[itemKey] : undefined;
        const group = classifyItemGroup(item, invItem, sysItem);
        const itemTotal = resolveItemTotal(item, invItem);

        // A) prodotto pulizia riconosciuto SOLO per nome
        const flaggedByType =
          item.type === "cleaning_product" ||
          ["prodotti_pulizia", "cleaning_products"].includes(String(item.categoryId || item.category || ""));
        if (group === "cleaning_product") {
          if (!flaggedByType) {
            prodottiPuliziaPerNomeEuro = round2(prodottiPuliziaPerNomeEuro + itemTotal);
            noteItems.push({ tipo: "prodotto_pulizia_per_nome", name: item.name, itemKey, euro: round2(itemTotal) });
          }
          continue;
        }

        // D) prezzo 0 sporco recuperato dal listino
        const rawTotal = item.totalPrice;
        if ((rawTotal === 0 || item.unitPrice === 0) && itemTotal > 0.001) {
          prezzoZeroEuro = round2(prezzoZeroEuro + itemTotal);
          noteItems.push({ tipo: "prezzo_zero_sporco", name: item.name, itemKey, euro: round2(itemTotal) });
        }

        // B) item orfano
        const name = resolveName(item, invItem);
        const isOrphan = !name;
        if (isOrphan) {
          orfaniEuro = round2(orfaniEuro + itemTotal);
          noteItems.push({ tipo: "orfano", rawName: item.name, itemKey, euro: round2(itemTotal) });
        }

        total = round2(total + itemTotal);
        const g = isOrphan ? "altro" : group;
        if (g === "linen") linen = round2(linen + itemTotal);
        else if (g === "kit_cortesia") kit = round2(kit + itemTotal);
        else if (g === "servizi_extra") extra = round2(extra + itemTotal);
        else {
          altro = round2(altro + itemTotal);
          if (!isOrphan) {
            noteItems.push({ tipo: "categoria_non_riconosciuta", name: item.name, itemKey, euro: round2(itemTotal) });
          }
        }
      }

      const deliveryFee = o.deliveryFee && o.deliveryFeeEnabled !== false ? o.deliveryFee : 0;
      const bedMakingFee = o.bedMaking && o.bedMakingFee ? o.bedMakingFee : 0;
      const others = deliveryFee + bedMakingFee;
      total = round2(total + others);

      const subtotals: OrderSubtotals = { linen, kit, extra, altro, others, total };
      const mainCat = pickMainCategory(linen, kit, extra);
      const effectiveNew = o.totalPriceOverride ?? total;
      const splitNew = splitOrderByCategory(subtotals, mainCat, effectiveNew);

      // ── vecchia logica admin ──
      const legacy = legacyAdminOrderTotal(o, inventory);
      const effectiveOld = o.totalPriceOverride ?? legacy.total;

      // ── stored vs ricalcolo canonico (ciò che vede il proprietario) ──
      const orderForCalc: DebtCalcOrder = {
        id: o.id, propertyId: o.propertyId, status: o.status, cleaningId: o.cleaningId,
        items: o.items, totalPriceOverride: o.totalPriceOverride,
        deliveryFee: o.deliveryFee, deliveryFeeEnabled: o.deliveryFeeEnabled,
        bedMaking: o.bedMaking, bedMakingFee: o.bedMakingFee,
      };
      const canonicalRaw = round2(calculateOrderRawPrice(orderForCalc, inventoryById));
      const stored = typeof o.calculatedTotal === "number" ? round2(o.calculatedTotal) : null;
      const storedDelta = stored === null ? 0 : round2(canonicalRaw - stored);

      // ── accumulo ──
      if (prodottiPuliziaPerNomeEuro > 0.001) {
        counts.ordiniConProdottiPuliziaPerNome++;
        agg.deltaProdottiPulizia = round2(agg.deltaProdottiPulizia + prodottiPuliziaPerNomeEuro);
      }
      if (orfaniEuro > 0.001) {
        counts.ordiniConOrfani++;
        agg.deltaOrfani = round2(agg.deltaOrfani + orfaniEuro);
      }
      if (altro > 0.001) {
        counts.ordiniConBucketAltro++;
        agg.bucketAltro = round2(agg.bucketAltro + altro);
      }
      if (prezzoZeroEuro > 0.001) {
        counts.ordiniConPrezzoZero++;
        agg.deltaPrezzoZero = round2(agg.deltaPrezzoZero + prezzoZeroEuro);
      }
      if (legacyIncluded && !newIncluded && o.status === "CANCELLED") {
        counts.ordiniCancellatiContati++;
        agg.ordiniCancellatiEuro = round2(agg.ordiniCancellatiEuro + effectiveOld);
      }
      if (o.excludedFromBilling === true) {
        counts.ordiniEsclusi++;
        agg.serviziEsclusiEuro = round2(agg.serviziEsclusiEuro + effectiveOld);
      }
      if (stored !== null && Math.abs(storedDelta) > 0.01) {
        counts.ordiniStoredDiverso++;
        agg.storedVsRecomputeEuro = round2(agg.storedVsRecomputeEuro + Math.abs(storedDelta));
      }

      const ownerId = prop.ownerId || "unknown";
      if (!perOwner.has(ownerId)) {
        perOwner.set(ownerId, { name: prop.ownerName || "?", vecchio: 0, nuovo: 0, delta: 0 });
      }
      const row = perOwner.get(ownerId)!;
      if (legacyIncluded && o.excludedFromBilling !== true) row.vecchio = round2(row.vecchio + effectiveOld);
      if (newIncluded) row.nuovo = round2(row.nuovo + effectiveNew);

      const orderDelta = round2(effectiveNew - effectiveOld);
      if (
        samples.length < maxSamples &&
        (Math.abs(orderDelta) > 0.01 || noteItems.length > 0 || Math.abs(storedDelta) > 0.01 || (legacyIncluded && !newIncluded))
      ) {
        samples.push({
          orderId: o.id,
          proprieta: o.propertyName || prop.name,
          proprietario: prop.ownerName,
          status: o.status,
          escluso: o.excludedFromBilling === true,
          contatoPrimaOraNo: legacyIncluded && !newIncluded,
          totaleVecchio: round2(effectiveOld),
          totaleNuovo: round2(effectiveNew),
          delta: orderDelta,
          calculatedTotalSalvato: stored,
          ricalcoloCanonico: canonicalRaw,
          deltaSalvatoVsCanonico: storedDelta,
          splitVecchio: {
            biancheria: round2(legacy.linen + (mainCat === "BIANCHERIA" ? legacy.others : 0)),
            kit: round2(legacy.kit),
            extra: round2(legacy.extra),
          },
          splitNuovo: {
            biancheria: round2(splitNew.linen),
            kit: round2(splitNew.kit),
            extra: round2(splitNew.extra),
          },
          bucketAltro: round2(altro),
          voci: noteItems.slice(0, 12),
        });
      }
    }

    // ─── OVERRIDE MENSILI ───
    const overrides = overridesSnap.docs
      .map((d: any) => ({ id: d.id, ...(d.data() as any) }))
      .filter((o: any) => Number(o.month) === month && Number(o.year) === year)
      .filter((o: any) => !ownerFilter || o.proprietarioId === ownerFilter)
      .map((o: any) => ({
        proprietarioId: o.proprietarioId,
        overrideTotal: o.overrideTotal,
        reason: o.reason,
      }));

    const perOwnerRows = Array.from(perOwner.entries())
      .map(([ownerId, r]) => ({
        ownerId,
        proprietario: r.name,
        totaleVecchio: r.vecchio,
        totaleNuovo: r.nuovo,
        delta: round2(r.nuovo - r.vecchio),
      }))
      .filter(r => Math.abs(r.delta) > 0.01 || r.totaleVecchio > 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    const deltaTotale = round2(perOwnerRows.reduce((s, r) => s + r.delta, 0));

    return NextResponse.json({
      readOnly: true,
      mese: `${String(month).padStart(2, "0")}/${year}`,
      ownerFilter,
      esposizioneTotale: {
        deltaEuroSuTuttiIProprietari: deltaTotale,
        proprietariImpattati: perOwnerRows.filter(r => Math.abs(r.delta) > 0.01).length,
        commento:
          "delta > 0 = dopo il fix il proprietario paga DI PIÙ. delta < 0 = paga di meno. " +
          "Zero ovunque = il fix è solo di attribuzione fra categorie, nessun euro cambia.",
      },
      cause: {
        A_prodottiPuliziaRiconosciutiPerNome: {
          euro: agg.deltaProdottiPulizia,
          ordini: counts.ordiniConProdottiPuliziaPerNome,
          effetto: "prima l'admin li fatturava, il proprietario no → ora esclusi ovunque",
        },
        B_itemOrfani: {
          euro: agg.deltaOrfani,
          ordini: counts.ordiniConOrfani,
          effetto: "prima scartati dai totali UI ma fatturati dalla formula canonica → ora inclusi e visibili",
        },
        C_bucketAltro: {
          euro: agg.bucketAltro,
          ordini: counts.ordiniConBucketAltro,
          effetto: "euro senza categoria, prima spalmati in silenzio sulle altre → ora attribuiti alla dominante",
        },
        D_prezzoZeroSporco: {
          euro: agg.deltaPrezzoZero,
          ordini: counts.ordiniConPrezzoZero,
          effetto: "divergenza || vs ?? fra admin e area proprietario → ora regola unica (listino)",
        },
        E_ordiniCancellatiContati: {
          euro: agg.ordiniCancellatiEuro,
          ordini: counts.ordiniCancellatiContati,
          effetto: "CANCELLED collegati a pulizia completata: entravano nei riquadri categoria",
        },
        F_serviziEsclusiNelTotaleProprieta: {
          euro: agg.serviziEsclusiEuro,
          pulizie: counts.pulizieEscluse,
          ordini: counts.ordiniEsclusi,
          effetto: "gonfiavano il 'Totale mese' della card proprietà",
        },
        G_calculatedTotalSalvatoDisallineato: {
          euroAssoluti: agg.storedVsRecomputeEuro,
          ordini: counts.ordiniStoredDiverso,
          effetto:
            "il proprietario e le email leggono il valore SALVATO, l'admin ricalcola. " +
            "Se questo numero non è 0, serve /api/admin/recalc-order-totals (dry-run, poi apply).",
        },
        H_overrideMensili: {
          quanti: overrides.length,
          dettaglio: overrides,
          effetto: "prima applicati solo lato proprietario, ora anche lato admin",
        },
      },
      ordiniAnalizzati: counts.ordiniAnalizzati,
      perProprietario: perOwnerRows,
      esempi: samples,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
