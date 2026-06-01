/**
 * ════════════════════════════════════════════════════════════════════
 * DEBUG: Root-cause acconti — SCOMPOSIZIONE pagina vs carryover
 * ════════════════════════════════════════════════════════════════════
 *
 * GET /api/debug/acconto-rootcause-v1?cronSecret=XXX&month=5&year=2026
 *
 * Domanda a cui risponde: "clicco Incassa Totale, perché poi spunta un
 * acconto il mese dopo?"
 *
 * Per ogni mese che genera eccesso, scompone l'acconto in DUE componenti
 * misurate sui dati reali (NON ipotesi):
 *
 *   surplus = (pagamento − totalePagina_ORA) + (totalePagina_ORA − totaleCanonico_ORA)
 *           = cambioDiStato            + divergenzaCalcolo
 *
 *   • divergenzaCalcolo = totalePagina − totaleCanonico (ORA).
 *       È il BUG DETERMINISTICO: la pagina (processOrder, ciò che
 *       "Incassa Totale" addebita) e il carryover (calculateOrderRawPrice)
 *       classificano gli articoli in modo diverso. Es: la canonica esclude
 *       i "prodotti pulizia" anche per PATTERN del nome (anticalcare,
 *       sgrassatore, detersivo, candeggina, viakal…), la pagina no. Quindi
 *       la pagina conta articoli che il carryover scarta → eccesso ad ogni
 *       incasso, per ogni casa con quegli articoli.
 *
 *   • cambioDiStato = pagamento − totalePagina (ORA).
 *       Il totale del mese è calato DOPO l'incasso: ordini tornati PENDING,
 *       pulizie tornate SCHEDULED, ordini annullati, prezzi cambiati.
 *
 * Vengono elencati gli ARTICOLI divergenti (con il motivo) e gli ordini
 * non più fatturati, così la radice è provata documento per documento.
 *
 * Parametri: month, year, name, ownerId, monthsBack, items=1 (mostra il
 * dettaglio articoli divergenti).
 *
 * SOLO LETTURA.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { MONTHS_IT } from "~/lib/payments/debtManager";
import {
  computeMonthDebt,
  computeOwnerCreditFromPriorMonths,
  isCleaningProductItem,
  type DebtCalcProperty,
  type DebtCalcCleaning,
  type DebtCalcOrder,
  type DebtCalcPayment,
  type DebtCalcOverride,
} from "~/lib/payments/debtCalculator";
import { SYSTEM_ITEMS, OPTIONAL_ITEMS } from "~/lib/inventory/systemItems";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const round = (n: number) => Math.round(n * 100) / 100;
const toDate = (d: any): Date | null => {
  if (!d) return null;
  if (typeof d.toDate === "function") { try { return d.toDate(); } catch { return null; } }
  if (d instanceof Date) return d;
  return null;
};
const inMonth = (d: Date | null, m: number, y: number) => !!d && d.getMonth() === m - 1 && d.getFullYear() === y;

// ════════════════════════════════════════════════════════════════════
// REPLICA FEDELE dei classificatori della PAGINA (useRealtimePayments.ts)
// ════════════════════════════════════════════════════════════════════
const SYSTEM_ITEMS_BY_KEY: Record<string, { name: string; categoryId: string }> = (() => {
  const map: Record<string, { name: string; categoryId: string }> = {};
  const all = [
    ...SYSTEM_ITEMS.map((i: any) => ({ id: i.id, key: i.key, name: i.name, categoryId: i.categoryId })),
    ...OPTIONAL_ITEMS.map((i: any) => ({ id: i.id, key: i.key, name: i.name, categoryId: i.categoryId })),
  ];
  all.forEach(({ id, key, name, categoryId }) => {
    map[id] = { name, categoryId };
    map[key] = { name, categoryId };
    if (id.startsWith("item_")) map[id.replace("item_", "")] = { name, categoryId };
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

function classifyItemAdmin(item: any, invItem: any): string {
  if (item.type === "cleaning_product") return "cleaning_product";
  const itemCat = (item.categoryId || item.category || "").toLowerCase();
  if (itemCat) {
    if (itemCat === "prodotti_pulizia" || itemCat === "cleaning_products") return "cleaning_product";
    if (itemCat === "kit_cortesia") return "kit_cortesia";
    if (itemCat === "servizi_extra") return "servizi_extra";
    if (itemCat === "biancheria_letto" || itemCat === "biancheria_bagno") return "linen";
  }
  const invCat = (invItem?.categoryId || invItem?.categoryName || "").toLowerCase();
  if (invCat) {
    if (invCat === "prodotti_pulizia" || invCat === "cleaning_products") return "cleaning_product";
    if (invCat === "kit_cortesia") return "kit_cortesia";
    if (invCat === "servizi_extra") return "servizi_extra";
    if (invCat === "biancheria_letto" || invCat === "biancheria_bagno") return "linen";
    if (invCat.includes("cortesia") || invCat.includes("kit")) return "kit_cortesia";
    if (invCat.includes("extra")) return "servizi_extra";
    if (invCat.includes("biancheria") || invCat.includes("linen")) return "linen";
  }
  const itemKey = item.itemId || item.id;
  const sysItem = itemKey ? SYSTEM_ITEMS_BY_KEY[itemKey] : undefined;
  if (sysItem) {
    if (sysItem.categoryId === "biancheria_letto" || sysItem.categoryId === "biancheria_bagno") return "linen";
    if (sysItem.categoryId === "kit_cortesia") return "kit_cortesia";
    if (sysItem.categoryId === "servizi_extra") return "servizi_extra";
    if (sysItem.categoryId === "prodotti_pulizia") return "cleaning_product";
  }
  return "altro";
}

function resolveItemNameAdmin(item: any, invItem: any): string | null {
  const itemKey = item.itemId || item.id;
  const sysItem = itemKey ? SYSTEM_ITEMS_BY_KEY[itemKey] : undefined;
  if (invItem?.name && invItem.name.trim()) return invItem.name;
  if (sysItem?.name) return sysItem.name;
  if (item.name && typeof item.name === "string" && item.name.trim()) {
    if (!looksLikeRawId(item.name)) return item.name;
  }
  return null;
}

// Prezzo ordine COME LA PAGINA (processOrder.calculatedTotal → effective = override ?? calc)
function hookOrderPrice(order: any, invMap: Map<string, any>) {
  let calc = 0;
  if (Array.isArray(order.items)) {
    for (const item of order.items) {
      const key = item.itemId || item.id;
      const invItem = invMap.get(key);
      const name = resolveItemNameAdmin(item, invItem);
      if (!name) continue; // la pagina SCARTA gli articoli senza nome risolvibile
      const group = classifyItemAdmin(item, invItem);
      const base = item.unitPrice || item.price || invItem?.sellPrice || 0;
      const unit = item.priceOverride ?? base;
      const qty = item.quantity || 1;
      const itemTotal = item.totalPrice || unit * qty;
      if (group === "cleaning_product") continue; // esclusa dal totale
      calc += itemTotal;
    }
  }
  if (order.deliveryFee && order.deliveryFeeEnabled !== false) calc += order.deliveryFee;
  if (order.bedMaking && order.bedMakingFee) calc += order.bedMakingFee;
  return order.totalPriceOverride ?? calc;
}

// Prezzo ordine COME IL CARRYOVER (calculateOrderRawPrice → effective = override ?? raw)
function canonicalOrderPrice(order: any, invMap: Map<string, any>) {
  let total = 0;
  if (Array.isArray(order.items)) {
    for (const item of order.items) {
      if (isCleaningProductItem(item)) continue; // esclude anche per PATTERN nome
      const key = item.itemId || item.id;
      const invItem = key ? invMap.get(key) : undefined;
      const base = item.unitPrice ?? item.price ?? invItem?.sellPrice ?? invItem?.price ?? 0;
      const unit = item.priceOverride ?? base;
      const qty = item.quantity ?? 1;
      total += item.totalPrice ?? unit * qty;
    }
  }
  if (order.deliveryFee && order.deliveryFeeEnabled !== false) total += order.deliveryFee;
  if (order.bedMaking && order.bedMakingFee) total += order.bedMakingFee;
  return order.totalPriceOverride ?? total;
}

// Articoli che divergono tra pagina e carryover (solo se NON c'è totalPriceOverride)
function divergentItems(order: any, invMap: Map<string, any>) {
  const out: any[] = [];
  if (order.totalPriceOverride !== undefined && order.totalPriceOverride !== null) return out; // override → nessuna divergenza
  if (!Array.isArray(order.items)) return out;
  for (const item of order.items) {
    const key = item.itemId || item.id;
    const invItem = invMap.get(key);
    const name = resolveItemNameAdmin(item, invItem);
    const group = classifyItemAdmin(item, invItem);
    const countedByHook = !!name && group !== "cleaning_product";
    const countedByCanonical = !isCleaningProductItem(item);
    if (countedByHook === countedByCanonical) continue;

    const base = item.unitPrice ?? item.price ?? invItem?.sellPrice ?? 0;
    const unit = item.priceOverride ?? base;
    const qty = item.quantity ?? 1;
    const val = round(item.totalPrice ?? unit * qty);

    let reason: string;
    if (countedByHook && !countedByCanonical) {
      // la canonica lo esclude → perché?
      if (item.type === "cleaning_product") reason = "carryover esclude per type=cleaning_product (ma la pagina lo conta lo stesso)";
      else if ((item.categoryId || item.category) === "prodotti_pulizia") reason = "carryover esclude per categoria prodotti_pulizia";
      else reason = "carryover esclude per PATTERN NOME (prodotto pulizia senza type/categoria) → PAGINA LO CONTA, CARRYOVER NO";
    } else {
      reason = name ? "pagina lo classifica come prodotto pulizia (inventario/sistema) ma il carryover lo conta" : "pagina SCARTA articolo senza nome risolvibile (orfano) → carryover lo conta";
    }
    out.push({
      itemKey: key, name: name || (item.name ?? null), valore: val,
      contatoDaPagina: countedByHook, contatoDaCarryover: countedByCanonical,
      direzione: countedByHook ? "+ pagina (genera acconto)" : "- carryover (riduce acconto)",
      motivo: reason,
    });
  }
  return out;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  if (cronSecret && searchParams.get("cronSecret") !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const now = new Date();
  const refMonth = parseInt(searchParams.get("month") || String(now.getMonth() + 1));
  const refYear = parseInt(searchParams.get("year") || String(now.getFullYear()));
  const monthsBack = parseInt(searchParams.get("monthsBack") || "24");
  const nameFilter = (searchParams.get("name") || "").toLowerCase().trim();
  const ownerFilter = searchParams.get("ownerId");
  const showItems = searchParams.get("items") === "1";

  try {
    const [usersSnap, propsSnap, cleaningsSnap, ordersSnap, paymentsSnap, overridesSnap, inventorySnap] =
      await Promise.all([
        adminDb.collection("users").get(),
        adminDb.collection("properties").where("status", "==", "ACTIVE").get(),
        adminDb.collection("cleanings").get(),
        adminDb.collection("orders").get(),
        adminDb.collection("payments").get(),
        adminDb.collection("paymentOverrides").get(),
        adminDb.collection("inventory").get(),
      ]);

    // Inventory map (id + key + item_ stripped), con i campi che servono ai 2 classificatori
    const invMap = new Map<string, any>();
    inventorySnap.docs.forEach((d) => {
      const data = d.data() as any;
      const item = {
        id: d.id, name: data.name || "",
        sellPrice: data.sellPrice ?? data.price ?? 0, price: data.price,
        categoryName: data.categoryName || data.category || data.categoryId || "",
        categoryId: data.categoryId || data.category || undefined,
      };
      invMap.set(d.id, item);
      if (data.key) invMap.set(data.key, item);
      if (d.id.startsWith("item_")) invMap.set(d.id.replace("item_", ""), item);
    });

    const usersById = new Map<string, any>();
    usersSnap.docs.forEach((d) => usersById.set(d.id, d.data()));

    const propsByOwner = new Map<string, DebtCalcProperty[]>();
    const ownerName = new Map<string, string>();
    const propName = new Map<string, string>();
    propsSnap.docs.forEach((d) => {
      const p = d.data() as any;
      if (!p.ownerId) return;
      propName.set(d.id, p.name || d.id);
      if (!propsByOwner.has(p.ownerId)) propsByOwner.set(p.ownerId, []);
      propsByOwner.get(p.ownerId)!.push({ id: d.id, cleaningPrice: p.cleaningPrice || 0 });
      if (!ownerName.has(p.ownerId)) {
        const u = usersById.get(p.ownerId);
        ownerName.set(p.ownerId, p.ownerName || u?.displayName || u?.name || u?.fullName || u?.email || p.ownerId);
      }
    });

    const cleaningById = new Map<string, { status: string; date: Date | null }>();
    const cleanings: DebtCalcCleaning[] = cleaningsSnap.docs.map((d) => {
      const c = d.data() as any;
      cleaningById.set(d.id, { status: c.status, date: toDate(c.scheduledDate) });
      return { id: d.id, propertyId: c.propertyId, status: c.status, scheduledDate: c.scheduledDate, price: c.price, priceOverride: c.priceOverride, holidayFee: c.holidayFee, excludedFromBilling: c.excludedFromBilling };
    });

    const ordersRaw = ordersSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    const orders: DebtCalcOrder[] = ordersRaw.map((o) => ({
      id: o.id, propertyId: o.propertyId, status: o.status, cleaningId: o.cleaningId,
      scheduledDate: o.scheduledDate, deliveredAt: o.deliveredAt, createdAt: o.createdAt,
      items: o.items, totalPriceOverride: o.totalPriceOverride, deliveryFee: o.deliveryFee,
      deliveryFeeEnabled: o.deliveryFeeEnabled, bedMaking: o.bedMaking, bedMakingFee: o.bedMakingFee,
      excludedFromBilling: o.excludedFromBilling,
    }));
    const ordersById = new Map(ordersRaw.map((o) => [o.id, o]));

    const paymentsRaw = paymentsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    const payments: DebtCalcPayment[] = paymentsRaw
      .filter((p) => typeof p.month === "number" && typeof p.year === "number")
      .map((p) => ({ proprietarioId: p.proprietarioId, month: p.month, year: p.year, amount: p.amount || 0, method: p.method, isCreditTransfer: p.isCreditTransfer === true }));

    const overridesByOwner = new Map<string, Map<string, DebtCalcOverride>>();
    overridesSnap.docs.forEach((d) => {
      const o = d.data() as any;
      if (typeof o.month !== "number" || typeof o.year !== "number" || typeof o.overrideTotal !== "number" || !o.proprietarioId) return;
      if (!overridesByOwner.has(o.proprietarioId)) overridesByOwner.set(o.proprietarioId, new Map());
      overridesByOwner.get(o.proprietarioId)!.set(`${o.year}-${String(o.month).padStart(2, "0")}`, { proprietarioId: o.proprietarioId, month: o.month, year: o.year, overrideTotal: o.overrideTotal, reason: o.reason });
    });

    const reports: any[] = [];
    let totDivergenza = 0, totCambioStato = 0, totAcconti = 0;

    for (const [ownerId, ownerProps] of propsByOwner) {
      if (ownerFilter && ownerId !== ownerFilter) continue;
      const nm = ownerName.get(ownerId) || ownerId;
      if (nameFilter && !nm.toLowerCase().includes(nameFilter)) continue;

      const propertiesById = new Map<string, DebtCalcProperty>(ownerProps.map((p) => [p.id, p]));
      const ownerPropIds = new Set(ownerProps.map((p) => p.id));
      const ownerPayments = payments.filter((p) => p.proprietarioId === ownerId);
      const overridesByMonth = overridesByOwner.get(ownerId);

      const carryover = computeOwnerCreditFromPriorMonths({
        month: refMonth, year: refYear, propertiesById, cleanings, orders,
        payments: ownerPayments, inventoryById: invMap as any, overridesByMonth, monthsBack,
      });
      if (carryover <= 0.01) continue;

      const sourceMonths: any[] = [];

      for (let i = monthsBack; i >= 1; i--) {
        const ref = new Date(refYear, refMonth - 1 - i, 1);
        const m = ref.getMonth() + 1, y = ref.getFullYear();
        const monthKey = `${y}-${String(m).padStart(2, "0")}`;
        const calc = computeMonthDebt({ month: m, year: y, propertiesById, cleanings, orders, payments: ownerPayments, inventoryById: invMap as any, override: overridesByMonth?.get(monthKey) });
        if (!calc || calc.saldo >= -0.01) continue;

        const excess = round(-calc.saldo);

        // pulizie COMPLETED del mese (per i link ordini)
        const completedIds = new Set<string>();
        let cleaningsTotal = 0;
        for (const c of cleanings) {
          if (c.status !== "COMPLETED" || c.excludedFromBilling === true) continue;
          if (!ownerPropIds.has(c.propertyId) || !inMonth(toDate(c.scheduledDate), m, y)) continue;
          completedIds.add(c.id);
          const base = c.price ?? propertiesById.get(c.propertyId)?.cleaningPrice ?? 0;
          cleaningsTotal += (c.priceOverride ?? base) + (c.holidayFee ?? 0);
        }

        // ricostruisco gli ordini fatturabili (regola canonica) e calcolo i 2 prezzi
        let hookOrdersTotal = 0, canonOrdersTotal = 0;
        const itemDivergenze: any[] = [];
        for (const o of orders) {
          if (!ownerPropIds.has(o.propertyId) || o.status === "CANCELLED" || o.excludedFromBilling === true) continue;
          const isLinked = !!o.cleaningId && completedIds.has(o.cleaningId);
          const od = toDate(o.deliveredAt) || toDate(o.scheduledDate);
          if (o.status !== "DELIVERED" && !isLinked) continue;
          if (!inMonth(od, m, y)) continue;
          const raw = ordersById.get(o.id);
          const hp = hookOrderPrice(raw, invMap);
          const cp = canonicalOrderPrice(raw, invMap);
          hookOrdersTotal += hp;
          canonOrdersTotal += cp;
          if (Math.abs(hp - cp) > 0.005) {
            const items = divergentItems(raw, invMap);
            itemDivergenze.push({ orderId: o.id, property: propName.get(o.propertyId) || o.propertyId, hookPrice: round(hp), canonicalPrice: round(cp), diff: round(hp - cp), ...(showItems ? { items } : { numArticoli: items.length }) });
          }
        }

        const totalePaginaOra = round(cleaningsTotal + hookOrdersTotal);
        const totaleCanonicoOra = round(calc.totaleServizi); // = cleaningsTotal + canonOrdersTotal (post-override già gestito da computeMonthDebt)
        const pagamento = round(calc.totalePagato);

        const divergenzaCalcolo = round(totalePaginaOra - totaleCanonicoOra);
        const cambioDiStato = round(pagamento - totalePaginaOra);

        totDivergenza += divergenzaCalcolo;
        totCambioStato += cambioDiStato;

        sourceMonths.push({
          label: `${MONTHS_IT[m - 1]} ${y}`,
          pagamento, totalePaginaOra, totaleCanonicoOra, excess,
          scomposizione: {
            divergenzaCalcolo,   // bug deterministico pagina vs carryover
            cambioDiStato,       // totale calato dopo l'incasso
            check: round(divergenzaCalcolo + cambioDiStato), // deve ≈ excess
          },
          ordiniDivergenti: itemDivergenze,
        });
      }

      totAcconti += round(carryover);
      reports.push({ ownerId, ownerName: nm, accontoMostrato: round(carryover), mesiSorgente: sourceMonths });
    }

    reports.sort((a, b) => b.accontoMostrato - a.accontoMostrato);

    return NextResponse.json({
      success: true,
      ref: { month: refMonth, year: refYear, label: `${MONTHS_IT[refMonth - 1]} ${refYear}`, monthsBack },
      diagnosiFlotta: {
        sommaAcconti: round(totAcconti),
        spiegatoDa_divergenzaCalcolo: round(totDivergenza),
        spiegatoDa_cambioDiStato: round(totCambioStato),
        nota: "Se 'divergenzaCalcolo' è la fetta grossa → la radice è il doppio calcolo pagina/carryover (fix architetturale: una sola funzione di pricing). Se domina 'cambioDiStato' → ordini/pulizie cambiano stato dopo l'incasso (fix: ciclo di vita + ricalcolo).",
      },
      reports,
      _help: {
        divergenzaCalcolo: "totalePagina − totaleCanonico (oggi). >0 = la pagina addebita più di quanto il carryover riconosce → acconto deterministico ad ogni incasso. Vedi 'ordiniDivergenti[].items' (con &items=1) per gli articoli colpevoli.",
        cambioDiStato: "pagamento − totalePagina (oggi). >0 = quando hai incassato il totale era più alto; poi è calato (ordine→PENDING, pulizia→SCHEDULED, annullo, prezzo).",
      },
    });
  } catch (error: any) {
    console.error("acconto-rootcause-v1 error:", error);
    return NextResponse.json({ error: "Errore server", message: error?.message, stack: error?.stack?.split("\n").slice(0, 6).join("\n") }, { status: 500 });
  }
}
