/**
 * ════════════════════════════════════════════════════════════════════
 * DEBUG: Timeline acconti — COSA è cambiato DOPO l'incasso
 * ════════════════════════════════════════════════════════════════════
 *
 * GET /api/debug/acconto-timeline-v1?cronSecret=XXX&month=5&year=2026
 *
 * Per i mesi che generano eccesso, ricostruisce la cronologia:
 *   - data dell'incasso (payments.createdAt) di quel mese
 *   - per ogni ordine/pulizia del mese: createdAt, updatedAt, status,
 *     deliveredAt, stato pulizia collegata, fatturabile ORA (sì/no)
 *   - flag `modificatoDopoIncasso` (updatedAt > data incasso)
 *
 * VERDETTO per mese:
 *   - REGRESSIONE_STATO_DOPO_INCASSO : esistono ordini ora NON fatturabili
 *     che sono stati modificati DOPO l'incasso → qualcosa li ha resettati
 *     (re-sync / ricalcolo / rigenerazione) = BUG, acconto fantasma.
 *   - SERVIZI_RIMOSSI_LEGITTIMI : ordini annullati/esclusi dopo l'incasso
 *     → credito reale (comportamento voluto).
 *   - PAGAMENTO_SUPERIORE_AI_SERVIZI : nessun ordine cambiato dopo l'incasso
 *     → l'importo incassato era già più alto dei servizi (pagamento
 *     manuale/arrotondato o totale mai pari).
 *
 * Parametri: month, year, name, ownerId, monthsBack, all=1 (mostra tutti
 * gli ordini, non solo quelli rilevanti).
 *
 * SOLO LETTURA.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { MONTHS_IT } from "~/lib/payments/debtManager";
import {
  computeMonthDebt,
  computeOwnerCreditFromPriorMonths,
  buildInventoryMap,
  isCleaningProductItem,
  type DebtCalcProperty,
  type DebtCalcCleaning,
  type DebtCalcOrder,
  type DebtCalcPayment,
  type DebtCalcOverride,
  type DebtCalcInventoryItem,
} from "~/lib/payments/debtCalculator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const round = (n: number) => Math.round(n * 100) / 100;
const toDate = (d: any): Date | null => {
  if (!d) return null;
  if (typeof d.toDate === "function") { try { return d.toDate(); } catch { return null; } }
  if (d instanceof Date) return d;
  return null;
};
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace("T", " ") : null);
const inMonth = (d: Date | null, m: number, y: number) => !!d && d.getMonth() === m - 1 && d.getFullYear() === y;

function orderRawPrice(o: DebtCalcOrder, inv: Map<string, DebtCalcInventoryItem>): number {
  let total = 0;
  if (Array.isArray(o.items)) {
    for (const item of o.items) {
      if (isCleaningProductItem(item)) continue;
      const key = item.itemId || item.id;
      const invItem = key ? inv.get(key) : undefined;
      const base = item.unitPrice ?? item.price ?? invItem?.sellPrice ?? invItem?.price ?? 0;
      const unit = item.priceOverride ?? base;
      const qty = item.quantity ?? 1;
      total += item.totalPrice ?? unit * qty;
    }
  }
  if (o.deliveryFee && o.deliveryFeeEnabled !== false) total += o.deliveryFee;
  if (o.bedMaking && o.bedMakingFee) total += o.bedMakingFee;
  return o.totalPriceOverride ?? total;
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
  const showAll = searchParams.get("all") === "1";

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

    const inventoryById = buildInventoryMap(inventorySnap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, any> })));
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

    // cleaning meta (status + date + updatedAt + createdAt)
    const cleaningMeta = new Map<string, { status: string; date: Date | null; updatedAt: Date | null; createdAt: Date | null }>();
    const cleanings: DebtCalcCleaning[] = cleaningsSnap.docs.map((d) => {
      const c = d.data() as any;
      cleaningMeta.set(d.id, { status: c.status, date: toDate(c.scheduledDate), updatedAt: toDate(c.updatedAt), createdAt: toDate(c.createdAt) });
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
    const orderMetaById = new Map(ordersRaw.map((o) => [o.id, { updatedAt: toDate(o.updatedAt), createdAt: toDate(o.createdAt), deliveredAt: toDate(o.deliveredAt) }]));

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
    const verdictTally: Record<string, number> = {};

    for (const [ownerId, ownerProps] of propsByOwner) {
      if (ownerFilter && ownerId !== ownerFilter) continue;
      const nm = ownerName.get(ownerId) || ownerId;
      if (nameFilter && !nm.toLowerCase().includes(nameFilter)) continue;

      const propertiesById = new Map<string, DebtCalcProperty>(ownerProps.map((p) => [p.id, p]));
      const ownerPropIds = new Set(ownerProps.map((p) => p.id));
      const ownerPayments = payments.filter((p) => p.proprietarioId === ownerId);
      const overridesByMonth = overridesByOwner.get(ownerId);

      const carryover = computeOwnerCreditFromPriorMonths({ month: refMonth, year: refYear, propertiesById, cleanings, orders, payments: ownerPayments, inventoryById, overridesByMonth, monthsBack });
      if (carryover <= 0.01) continue;

      const sourceMonths: any[] = [];

      for (let i = monthsBack; i >= 1; i--) {
        const ref = new Date(refYear, refMonth - 1 - i, 1);
        const m = ref.getMonth() + 1, y = ref.getFullYear();
        const monthKey = `${y}-${String(m).padStart(2, "0")}`;
        const calc = computeMonthDebt({ month: m, year: y, propertiesById, cleanings, orders, payments: ownerPayments, inventoryById, override: overridesByMonth?.get(monthKey) });
        if (!calc || calc.saldo >= -0.01) continue;

        // pagamenti reali del mese + data incasso (max createdAt)
        const monthPays = paymentsRaw.filter((p) => p.proprietarioId === ownerId && Number(p.month) === m && Number(p.year) === y && p.isCreditTransfer !== true);
        const payDates = monthPays.map((p) => toDate(p.createdAt)).filter(Boolean) as Date[];
        const settledAt = payDates.length ? new Date(Math.max(...payDates.map((d) => d.getTime()))) : null;

        // pulizie COMPLETED del mese (per link)
        const completedIds = new Set<string>();
        for (const c of cleanings) {
          if (c.status === "COMPLETED" && c.excludedFromBilling !== true && ownerPropIds.has(c.propertyId) && inMonth(toDate(c.scheduledDate), m, y)) completedIds.add(c.id);
        }

        // analizza ogni ordine la cui data cade nel mese (o linked-completed)
        const righe: any[] = [];
        let regressoValue = 0, rimossoValue = 0;
        for (const o of orders) {
          if (!ownerPropIds.has(o.propertyId)) continue;
          const od = toDate(o.deliveredAt) || toDate(o.scheduledDate);
          const isLinked = !!o.cleaningId && completedIds.has(o.cleaningId);
          if (!inMonth(od, m, y) && !isLinked) continue;

          const meta = orderMetaById.get(o.id);
          const billableNow = o.status !== "CANCELLED" && o.excludedFromBilling !== true && (o.status === "DELIVERED" || isLinked) && inMonth(od, m, y);
          const lc = o.cleaningId ? cleaningMeta.get(o.cleaningId) : undefined;
          const modAfter = !!(settledAt && meta?.updatedAt && meta.updatedAt.getTime() > settledAt.getTime());
          const lcModAfter = !!(settledAt && lc?.updatedAt && lc.updatedAt.getTime() > settledAt.getTime());
          const price = round(orderRawPrice(o, inventoryById));

          // contribuisce alla riduzione del totale?
          if (!billableNow) {
            if (o.status === "CANCELLED" || o.excludedFromBilling === true) {
              if (modAfter) rimossoValue += price;
            } else if (modAfter || lcModAfter) {
              regressoValue += price; // ordine/pulizia regredito DOPO l'incasso
            }
          }

          const riga = {
            orderId: o.id, property: propName.get(o.propertyId) || o.propertyId,
            status: o.status, fatturabileOra: billableNow, prezzo: price,
            createdAt: iso(meta?.createdAt || null), updatedAt: iso(meta?.updatedAt || null),
            deliveredAt: iso(meta?.deliveredAt || null),
            cleaningId: o.cleaningId || null,
            statoPulizia: lc ? lc.status : (o.cleaningId ? "INESISTENTE" : "NESSUN_LINK"),
            puliziaUpdatedAt: iso(lc?.updatedAt || null),
            modificatoDopoIncasso: modAfter, puliziaModificataDopoIncasso: lcModAfter,
          };
          // di default mostro solo le righe rilevanti (non fatturabili ora, o modificate dopo l'incasso)
          if (showAll || !billableNow || modAfter || lcModAfter) righe.push(riga);
        }

        regressoValue = round(regressoValue);
        rimossoValue = round(rimossoValue);
        const excess = round(-calc.saldo);

        let verdict: string;
        if (regressoValue >= 0.5 && regressoValue >= excess * 0.5) verdict = "REGRESSIONE_STATO_DOPO_INCASSO";
        else if (rimossoValue >= 0.5 && rimossoValue >= excess * 0.5) verdict = "SERVIZI_RIMOSSI_LEGITTIMI";
        else verdict = "PAGAMENTO_SUPERIORE_AI_SERVIZI";

        sourceMonths.push({
          label: `${MONTHS_IT[m - 1]} ${y}`,
          incassatoIl: iso(settledAt), pagamentoMese: round(calc.totalePagato),
          totaleServiziOra: round(calc.totaleServizi), excess,
          valoreRegressoDopoIncasso: regressoValue, valoreRimossoDopoIncasso: rimossoValue,
          verdict, ordini: righe,
        });
      }

      const vs = sourceMonths.map((s) => s.verdict);
      let ov = "PAGAMENTO_SUPERIORE_AI_SERVIZI";
      if (vs.some((v) => v === "REGRESSIONE_STATO_DOPO_INCASSO")) ov = "REGRESSIONE_STATO_DOPO_INCASSO";
      else if (vs.some((v) => v === "SERVIZI_RIMOSSI_LEGITTIMI")) ov = "SERVIZI_RIMOSSI_LEGITTIMI";
      verdictTally[ov] = (verdictTally[ov] || 0) + 1;

      reports.push({ ownerId, ownerName: nm, accontoMostrato: round(carryover), verdict: ov, mesiSorgente: sourceMonths });
    }

    reports.sort((a, b) => b.accontoMostrato - a.accontoMostrato);

    return NextResponse.json({
      success: true,
      ref: { month: refMonth, year: refYear, label: `${MONTHS_IT[refMonth - 1]} ${refYear}`, monthsBack },
      summary: { proprietariConAcconto: reports.length, sommaAcconti: round(reports.reduce((s, r) => s + r.accontoMostrato, 0)), verdettiPerTipo: verdictTally },
      reports,
      _help: {
        REGRESSIONE_STATO_DOPO_INCASSO: "Ordini ora non fatturabili (PENDING/pulizia SCHEDULED) ma con updatedAt DOPO l'incasso → un processo li ha resettati. BUG: acconto fantasma. Guarda updatedAt/puliziaUpdatedAt vs incassatoIl.",
        SERVIZI_RIMOSSI_LEGITTIMI: "Ordini annullati/esclusi dopo l'incasso → credito reale.",
        PAGAMENTO_SUPERIORE_AI_SERVIZI: "Niente cambiato dopo l'incasso: l'importo incassato era già > servizi (pagamento manuale/arrotondato).",
        come: "Confronta per ogni ordine 'updatedAt' e 'puliziaUpdatedAt' con 'incassatoIl'. Se modificati dopo → causa identificata.",
      },
    });
  } catch (error: any) {
    console.error("acconto-timeline-v1 error:", error);
    return NextResponse.json({ error: "Errore server", message: error?.message, stack: error?.stack?.split("\n").slice(0, 6).join("\n") }, { status: 500 });
  }
}
