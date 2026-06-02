/**
 * ════════════════════════════════════════════════════════════════════
 * DEBUG: TEST DEFINITIVO — pagina (processOrder) vs canonico, per ordine
 * ════════════════════════════════════════════════════════════════════
 *
 * GET /api/debug/acconto-difftest-v1?cronSecret=XXX
 *
 * Smette di dedurre. Per OGNI ordine non-CANCELLED replica:
 *   A) prezzo COME LA PAGINA  → processOrder (useRealtimePayments.ts):
 *        - scarta item senza nome risolvibile (resolveItemNameAdmin → null)
 *        - esclude cleaning_product (per type/categoria/sistema)
 *        - somma item.totalPrice ?? unit*qty  (+ delivery + bedMaking)
 *        - effettivo = totalPriceOverride ?? calc
 *   B) prezzo CANONICO → calculateOrderRawPrice (debtCalculator.ts):
 *        - esclude cleaning_product SOLO via isCleaningProductItem
 *        - NON scarta orfani
 *        - somma item.totalPrice ?? unit*qty  (+ delivery + bedMaking)
 *        - effettivo = totalPriceOverride ?? raw
 *
 * Dove A ≠ B → ISOLA gli item colpevoli e la regola esatta. Aggrega quanti
 * ordini/€ divergono su TUTTA la flotta. Questo è il test che dice se il
 * problema è VIVO (le due funzioni divergono ORA) o STORICO (combaciano).
 *
 * SOLO LETTURA.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { isCleaningProductItem } from "~/lib/payments/debtCalculator";
import { SYSTEM_ITEMS, OPTIONAL_ITEMS } from "~/lib/inventory/systemItems";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const round = (n: number) => Math.round(n * 100) / 100;

// ── replica SYSTEM_ITEMS_BY_KEY della pagina ──
const SYS: Record<string, { name: string; categoryId: string }> = (() => {
  const map: Record<string, { name: string; categoryId: string }> = {};
  [...SYSTEM_ITEMS, ...OPTIONAL_ITEMS].forEach((i: any) => {
    map[i.id] = { name: i.name, categoryId: i.categoryId };
    map[i.key] = { name: i.name, categoryId: i.categoryId };
    if (String(i.id).startsWith("item_")) map[String(i.id).replace("item_", "")] = { name: i.name, categoryId: i.categoryId };
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
function resolveNamePage(item: any, inv: any): string | null {
  const key = item.itemId || item.id;
  const sys = key ? SYS[key] : undefined;
  if (inv?.name && String(inv.name).trim()) return inv.name;
  if (sys?.name) return sys.name;
  if (item.name && typeof item.name === "string" && item.name.trim() && !looksLikeRawId(item.name)) return item.name;
  return null;
}
function classifyPage(item: any, inv: any): string {
  if (item.type === "cleaning_product") return "cleaning_product";
  const ic = (item.categoryId || item.category || "").toLowerCase();
  if (ic === "prodotti_pulizia" || ic === "cleaning_products") return "cleaning_product";
  if (ic === "kit_cortesia") return "kit_cortesia";
  if (ic === "servizi_extra") return "servizi_extra";
  if (ic === "biancheria_letto" || ic === "biancheria_bagno") return "linen";
  const vc = (inv?.categoryId || inv?.categoryName || "").toLowerCase();
  if (vc) {
    if (vc === "prodotti_pulizia" || vc === "cleaning_products") return "cleaning_product";
    if (vc.includes("cortesia") || vc.includes("kit")) return "kit_cortesia";
    if (vc.includes("extra")) return "servizi_extra";
    if (vc.includes("biancheria") || vc.includes("linen")) return "linen";
  }
  const key = item.itemId || item.id;
  const sys = key ? SYS[key] : undefined;
  if (sys) {
    if (sys.categoryId === "biancheria_letto" || sys.categoryId === "biancheria_bagno") return "linen";
    if (sys.categoryId === "kit_cortesia") return "kit_cortesia";
    if (sys.categoryId === "servizi_extra") return "servizi_extra";
    if (sys.categoryId === "prodotti_pulizia") return "cleaning_product";
  }
  return "altro";
}

function pagePrice(order: any, inv: Map<string, any>): number {
  let calc = 0;
  if (Array.isArray(order.items)) {
    for (const item of order.items) {
      const key = item.itemId || item.id;
      const invItem = inv.get(key);
      const name = resolveNamePage(item, invItem);
      if (!name) continue;                       // PAGINA scarta orfani
      if (classifyPage(item, invItem) === "cleaning_product") continue;
      const base = item.unitPrice || item.price || invItem?.sellPrice || 0;
      const unit = item.priceOverride ?? base;
      const qty = item.quantity || 1;
      calc += item.totalPrice || unit * qty;
    }
  }
  if (order.deliveryFee && order.deliveryFeeEnabled !== false) calc += order.deliveryFee;
  if (order.bedMaking && order.bedMakingFee) calc += order.bedMakingFee;
  return order.totalPriceOverride ?? calc;
}

function canonPrice(order: any, inv: Map<string, any>): number {
  let total = 0;
  if (Array.isArray(order.items)) {
    for (const item of order.items) {
      if (isCleaningProductItem(item)) continue;  // CANONICO: solo questo filtro
      const key = item.itemId || item.id;
      const invItem = key ? inv.get(key) : undefined;
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

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  if (cronSecret && searchParams.get("cronSecret") !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const limit = parseInt(searchParams.get("limit") || "60"); // max divergenze dettagliate

  try {
    const [ordersSnap, inventorySnap] = await Promise.all([
      adminDb.collection("orders").get(),
      adminDb.collection("inventory").get(),
    ]);

    const inv = new Map<string, any>();
    inventorySnap.docs.forEach((d) => {
      const data = d.data() as any;
      const o = { id: d.id, name: data.name || "", sellPrice: data.sellPrice ?? data.price ?? 0, price: data.price, categoryName: data.categoryName || data.category || data.categoryId || "", categoryId: data.categoryId || data.category || undefined };
      inv.set(d.id, o);
      if (data.key) inv.set(data.key, o);
      if (d.id.startsWith("item_")) inv.set(d.id.replace("item_", ""), o);
    });

    let ordiniTotali = 0, ordiniDivergenti = 0, sommaDiffAssoluta = 0, sommaDiffNetta = 0;
    const cause: Record<string, { n: number; eur: number }> = {};
    const esempi: any[] = [];

    for (const d of ordersSnap.docs) {
      const o = { id: d.id, ...(d.data() as any) };
      if (o.status === "CANCELLED") continue;
      ordiniTotali++;
      const p = pagePrice(o, inv);
      const c = canonPrice(o, inv);
      const diff = round(p - c);
      if (Math.abs(diff) <= 0.005) continue;

      ordiniDivergenti++;
      sommaDiffAssoluta = round(sommaDiffAssoluta + Math.abs(diff));
      sommaDiffNetta = round(sommaDiffNetta + diff);

      // isola gli item colpevoli
      const colpevoli: any[] = [];
      if (Array.isArray(o.items)) {
        for (const item of o.items) {
          const key = item.itemId || item.id;
          const invItem = inv.get(key);
          const name = resolveNamePage(item, invItem);
          const grpPage = classifyPage(item, invItem);
          const countedPage = !!name && grpPage !== "cleaning_product";
          const countedCanon = !isCleaningProductItem(item);
          if (countedPage === countedCanon) continue;
          const base = item.unitPrice ?? item.price ?? invItem?.sellPrice ?? 0;
          const val = round(item.totalPrice ?? (item.priceOverride ?? base) * (item.quantity ?? 1));
          let regola: string;
          if (!countedPage && countedCanon) {
            regola = !name ? "ORFANO_SENZA_NOME (pagina scarta, canonico conta)" : "PAGINA classifica prodotto-pulizia, canonico no";
          } else {
            regola = "CANONICO esclude per pattern-nome, PAGINA conta";
          }
          cause[regola] = cause[regola] || { n: 0, eur: 0 };
          cause[regola].n++; cause[regola].eur = round(cause[regola].eur + Math.abs(val));
          colpevoli.push({ itemKey: key, name: name || item.name || null, valore: val, contatoPagina: countedPage, contatoCanonico: countedCanon, regola });
        }
      }
      if (Math.abs(diff) > 0.05 && colpevoli.length === 0) {
        cause["FLOATING_POINT_o_OVERRIDE"] = cause["FLOATING_POINT_o_OVERRIDE"] || { n: 0, eur: 0 };
        cause["FLOATING_POINT_o_OVERRIDE"].n++; cause["FLOATING_POINT_o_OVERRIDE"].eur = round(cause["FLOATING_POINT_o_OVERRIDE"].eur + Math.abs(diff));
      } else if (colpevoli.length === 0) {
        cause["CENTESIMI_FLOATING_POINT"] = cause["CENTESIMI_FLOATING_POINT"] || { n: 0, eur: 0 };
        cause["CENTESIMI_FLOATING_POINT"].n++; cause["CENTESIMI_FLOATING_POINT"].eur = round(cause["CENTESIMI_FLOATING_POINT"].eur + Math.abs(diff));
      }

      if (esempi.length < limit) {
        esempi.push({
          orderId: o.id, property: o.propertyName || o.propertyId, status: o.status,
          prezzoPagina: round(p), prezzoCanonico: round(c), diff,
          hasOverride: o.totalPriceOverride !== undefined && o.totalPriceOverride !== null,
          itemColpevoli: colpevoli,
        });
      }
    }

    return NextResponse.json({
      success: true,
      VERDETTO:
        ordiniDivergenti === 0
          ? "✅ NESSUNA DIVERGENZA: pagina e canonico calcolano IDENTICO su tutti gli ordini ORA. Il bug NON è vivo → gli acconti esistenti sono STORICI (residui). Cura: solo pulizia una-tantum."
          : `⚠️ ${ordiniDivergenti} ordini divergono ORA (netto ${sommaDiffNetta}€): il bug è VIVO. Le cause esatte sono in 'causePerTipo'. Cura: allineare la regola colpevole nelle due funzioni.`,
      riepilogo: {
        ordiniAnalizzati: ordiniTotali,
        ordiniDivergenti,
        sommaDifferenzeAssolute: sommaDiffAssoluta,
        differenzaNetta: sommaDiffNetta,
        causePerTipo: cause,
      },
      esempiDivergenze: esempi,
      _nota: "diff = prezzoPagina − prezzoCanonico. >0 = la pagina fattura PIÙ del canonico (incassi di più → acconto dopo). 'causePerTipo' dice ESATTAMENTE quale regola differisce e per quanti €.",
    });
  } catch (error: any) {
    console.error("acconto-difftest-v1 error:", error);
    return NextResponse.json({ error: "Errore server", message: error?.message, stack: error?.stack?.split("\n").slice(0, 6).join("\n") }, { status: 500 });
  }
}
