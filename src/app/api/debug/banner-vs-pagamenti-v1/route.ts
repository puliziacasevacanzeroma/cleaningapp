/**
 * GET /api/debug/banner-vs-pagamenti-v1?email=<email_proprietario>
 *
 * SCOPO: capire PERCHÉ il totale del BANNER (area proprietario) diverge dal
 * totale mostrato nella pagina PAGAMENTI (area admin) per lo stesso proprietario.
 *
 * Le due pagine usano due percorsi di prezzo diversi per gli ORDINI:
 *   - PAGAMENTI (admin / useRealtimePayments): usa il totale memorizzato
 *       effettivo = order.totalPriceOverride ?? order.calculatedTotal
 *   - BANNER "vecchio" (computeMonthDebt SENZA calculatedTotal, = email/cron):
 *       effettivo = order.totalPriceOverride ?? RICALCOLO_da_items(+fee)
 *
 * Questo script calcola il debito del proprietario in ENTRAMBI i modi, mese per
 * mese, e ELENCA gli ordini in cui i due valori differiscono (con il dettaglio
 * degli articoli), così si vede l'origine esatta dei centesimi di scarto.
 *
 * Auth: ADMIN.  Sola lettura (non scrive nulla).
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import {
  computeMonthDebt,
  getMonthsToCheck,
  buildInventoryMap,
  isCleaningProductItem,
  type DebtCalcProperty,
  type DebtCalcCleaning,
  type DebtCalcOrder,
  type DebtCalcPayment,
  type DebtCalcOverride,
  type DebtCalcInventoryItem,
} from "~/lib/payments/debtCalculator";
import { computeOwnerDebt } from "~/lib/payments/computeOwnerDebt";

export const dynamic = "force-dynamic";

const MONTHS_IT = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Replica ESATTA di calculateOrderRawPrice (debtCalculator, non esportata). */
function rawOrderPrice(order: DebtCalcOrder, invById: Map<string, DebtCalcInventoryItem>): number {
  let total = 0;
  if (Array.isArray(order.items)) {
    for (const item of order.items) {
      if (isCleaningProductItem(item)) continue;
      const itemKey = item.itemId || item.id;
      const invItem = itemKey ? invById.get(itemKey) : undefined;
      const basePrice =
        (item.unitPrice || undefined) ??
        (item.price || undefined) ??
        invItem?.sellPrice ??
        0;
      const unitPrice = item.priceOverride ?? basePrice;
      const quantity = item.quantity ?? 1;
      const itemTotal = (item.totalPrice || undefined) ?? unitPrice * quantity;
      total += itemTotal;
    }
  }
  if (order.deliveryFee && order.deliveryFeeEnabled !== false) total += order.deliveryFee;
  if (order.bedMaking && order.bedMakingFee) total += order.bedMakingFee;
  return total;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user || user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const email = req.nextUrl.searchParams.get("email")?.toLowerCase().trim();
    if (!email) {
      return NextResponse.json({ error: "Parametro ?email=... obbligatorio" }, { status: 400 });
    }

    // ─── Utente ───
    const usersSnap = await adminDb.collection("users").where("email", "==", email).limit(1).get();
    if (usersSnap.empty) {
      return NextResponse.json({ error: `Nessun utente con email ${email}` }, { status: 404 });
    }
    const userId = usersSnap.docs[0].id;
    const userName = usersSnap.docs[0].data().displayName || usersSnap.docs[0].data().name || email;

    // ─── Proprietà ATTIVE ───
    const propsSnap = await adminDb.collection("properties")
      .where("ownerId", "==", userId).where("status", "==", "ACTIVE").get();
    const propertyIdsSet = new Set(propsSnap.docs.map(d => d.id));
    const propertiesById = new Map<string, DebtCalcProperty>();
    propsSnap.docs.forEach(d => propertiesById.set(d.id, { id: d.id, cleaningPrice: d.data().cleaningPrice || 0 }));

    // ─── Range 24 mesi (esclude mese corrente) — identico a computeOwnerDebt ───
    const now = new Date();
    const cm = now.getMonth() + 1, cy = now.getFullYear();
    const startTs = Timestamp.fromDate(new Date(cy - 2, cm - 1, 1));
    const endTs = Timestamp.fromDate(new Date(cy, cm, 0, 23, 59, 59, 999));

    // ─── Pulizie ───
    const cleaningsSnap = await adminDb.collection("cleanings")
      .where("status", "==", "COMPLETED").where("scheduledDate", ">=", startTs).where("scheduledDate", "<=", endTs).get();
    const cleanings: DebtCalcCleaning[] = [];
    cleaningsSnap.docs.forEach(doc => {
      const d = doc.data();
      if (!propertyIdsSet.has(d.propertyId)) return;
      cleanings.push({
        id: doc.id, propertyId: d.propertyId, status: d.status, scheduledDate: d.scheduledDate,
        price: d.price, priceOverride: d.priceOverride, holidayFee: d.holidayFee, excludedFromBilling: d.excludedFromBilling,
      });
    });

    // ─── Inventory ───
    const inventorySnap = await adminDb.collection("inventory").get();
    const inventoryById = buildInventoryMap(inventorySnap.docs.map(d => ({ id: d.id, data: d.data() })));

    // ─── Ordini ───
    const ordersSnap = await adminDb.collection("orders")
      .where("scheduledDate", ">=", startTs).where("scheduledDate", "<=", endTs).get();
    const ordersRaw: Array<{ base: DebtCalcOrder; calculatedTotal: number | undefined }> = [];
    ordersSnap.docs.forEach(doc => {
      const o = doc.data();
      if (!propertyIdsSet.has(o.propertyId)) return;
      const base: DebtCalcOrder = {
        id: doc.id, propertyId: o.propertyId, status: o.status, cleaningId: o.cleaningId,
        scheduledDate: o.scheduledDate, deliveredAt: o.deliveredAt, createdAt: o.createdAt,
        items: o.items, totalPriceOverride: o.totalPriceOverride,
        deliveryFee: o.deliveryFee, deliveryFeeEnabled: o.deliveryFeeEnabled,
        bedMaking: o.bedMaking, bedMakingFee: o.bedMakingFee, excludedFromBilling: o.excludedFromBilling,
      };
      ordersRaw.push({ base, calculatedTotal: typeof o.calculatedTotal === "number" ? o.calculatedTotal : undefined });
    });

    // Due varianti per computeMonthDebt
    const ordersRecompute: DebtCalcOrder[] = ordersRaw.map(x => x.base);
    const ordersCalculated: DebtCalcOrder[] = ordersRaw.map(x => ({ ...x.base, calculatedTotal: x.calculatedTotal }));

    // ─── Pagamenti ───
    const paymentsSnap = await adminDb.collection("payments").where("proprietarioId", "==", userId).get();
    const payments: DebtCalcPayment[] = [];
    paymentsSnap.docs.forEach(doc => {
      const p = doc.data();
      if (typeof p.month !== "number" || typeof p.year !== "number") return;
      payments.push({ proprietarioId: p.proprietarioId, month: p.month, year: p.year, amount: p.amount || 0, method: p.method, isCreditTransfer: p.isCreditTransfer === true });
    });

    // ─── Override ───
    const overridesSnap = await adminDb.collection("paymentOverrides").where("proprietarioId", "==", userId).get();
    const overrideByKey = new Map<string, DebtCalcOverride>();
    overridesSnap.docs.forEach(doc => {
      const o = doc.data();
      if (typeof o.month !== "number" || typeof o.year !== "number") return;
      overrideByKey.set(`${o.year}-${o.month}`, { proprietarioId: o.proprietarioId, month: o.month, year: o.year, overrideTotal: o.overrideTotal || 0, reason: o.reason });
    });

    // ─── Calcolo per mese, nei DUE modi ───
    const months = getMonthsToCheck(now, 24);
    const byMonth: any[] = [];
    let totRecompute = 0, credRecompute = 0;
    let totCalculated = 0, credCalculated = 0;
    const TH = 0.01;

    for (const { month, year } of months) {
      const override = overrideByKey.get(`${year}-${month}`);
      const calcRe = computeMonthDebt({ month, year, propertiesById, cleanings, orders: ordersRecompute, payments, inventoryById, override });
      const calcCa = computeMonthDebt({ month, year, propertiesById, cleanings, orders: ordersCalculated, payments, inventoryById, override });
      if (!calcRe && !calcCa) continue;

      const sRe = calcRe?.saldo ?? 0;
      const sCa = calcCa?.saldo ?? 0;
      if (sRe < -TH) credRecompute += -sRe;
      if (sRe > TH) totRecompute += sRe;
      if (sCa < -TH) credCalculated += -sCa;
      if (sCa > TH) totCalculated += sCa;

      const diff = r2(sRe - sCa);
      byMonth.push({
        mese: `${MONTHS_IT[month - 1]} ${year}`,
        servizi_ricalcolo: r2(calcRe?.totaleServizi ?? 0),
        servizi_calculatedTotal: r2(calcCa?.totaleServizi ?? 0),
        pagato: r2(calcRe?.totalePagato ?? calcCa?.totalePagato ?? 0),
        saldo_ricalcolo: r2(sRe),
        saldo_calculatedTotal: r2(sCa),
        ...(Math.abs(diff) > TH ? { DIFFERENZA: diff } : {}),
      });
    }

    const netRecompute = r2(Math.max(0, totRecompute - credRecompute));
    const netCalculated = r2(Math.max(0, totCalculated - credCalculated));

    // ─── Dettaglio ORDINI divergenti (recompute vs calculatedTotal) ───
    const orderDivergences: any[] = [];
    let divSumRecompute = 0, divSumCalculated = 0;
    for (const { base, calculatedTotal } of ordersRaw) {
      const recompute = r2(rawOrderPrice(base, inventoryById));
      const stored = calculatedTotal;
      const effAdmin = base.totalPriceOverride ?? stored;           // pagina Pagamenti
      const effBannerOld = base.totalPriceOverride ?? recompute;    // banner vecchio / email
      if (effAdmin === undefined) continue;                         // ordine senza calculatedTotal: caso a parte
      if (Math.abs((effAdmin as number) - effBannerOld) > TH) {
        const d = (base.deliveredAt as any)?.toDate?.() || (base.scheduledDate as any)?.toDate?.() || null;
        divSumRecompute += effBannerOld;
        divSumCalculated += effAdmin as number;
        orderDivergences.push({
          orderId: base.id,
          propertyId: base.propertyId,
          mese: d ? `${MONTHS_IT[d.getMonth()]} ${d.getFullYear()}` : "?",
          status: base.status,
          n_articoli: Array.isArray(base.items) ? base.items.length : 0,
          ricalcolo_da_items: recompute,
          calculatedTotal_memorizzato: stored,
          totalPriceOverride: base.totalPriceOverride ?? null,
          deliveryFee: base.deliveryFee ?? 0,
          deliveryFeeEnabled: base.deliveryFeeEnabled !== false,
          bedMaking: base.bedMaking ?? false,
          bedMakingFee: base.bedMakingFee ?? 0,
          differenza_admin_meno_banner: r2((effAdmin as number) - effBannerOld),
          articoli: (Array.isArray(base.items) ? base.items : []).map((it: any) => ({
            nome: it.name || it.itemName || it.itemId || it.id,
            tipo: it.type || it.categoryId || it.category,
            qty: it.quantity ?? 1,
            unitPrice: it.unitPrice ?? null,
            price: it.price ?? null,
            totalPrice: it.totalPrice ?? null,
            priceOverride: it.priceOverride ?? null,
          })),
        });
      }
    }

    // ─── Numero ufficiale email/cron (recompute) ───
    let official: any = null;
    try {
      const od = await computeOwnerDebt(userId);
      if (od) official = { totalDebt: r2(od.totalDebt), creditoTotale: r2(od.creditoTotale), totalDebtNet: r2(od.totalDebtNet), propertiesCount: od.propertiesCount };
    } catch { /* ignore */ }

    return NextResponse.json({
      proprietario: { email, userId, nome: userName, proprietaAttive: propertyIdsSet.size, ordiniTotali: ordersRaw.length, pulizieTotali: cleanings.length },
      RISULTATO: {
        banner_RICALCOLO_da_items: { totaleLordo: r2(totRecompute), credito: r2(credRecompute), NETTO: netRecompute },
        pagamenti_CALCULATED_TOTAL: { totaleLordo: r2(totCalculated), credito: r2(credCalculated), NETTO: netCalculated },
        DIVERGENZA_NETTA: r2(netRecompute - netCalculated),
        nota: "Se il banner mostra il valore 'RICALCOLO' e la pagina Pagamenti mostra 'CALCULATED_TOTAL', la differenza qui sopra è esattamente lo scarto che vedi.",
      },
      ordini_divergenti: {
        quanti: orderDivergences.length,
        somma_ricalcolo: r2(divSumRecompute),
        somma_calculatedTotal: r2(divSumCalculated),
        somma_differenza: r2(divSumCalculated - divSumRecompute),
        dettaglio: orderDivergences,
      },
      numero_ufficiale_email_cron_computeOwnerDebt: official,
      dettaglio_mensile: byMonth,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Errore", message: e?.message, stack: e?.stack }, { status: 500 });
  }
}
