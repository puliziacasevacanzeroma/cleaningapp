/**
 * ════════════════════════════════════════════════════════════════════
 * DEBUG: Forense acconti carryover — FONTE DI VERITÀ CANONICA
 * ════════════════════════════════════════════════════════════════════
 *
 * GET /api/debug/acconto-forensic-v1?cronSecret=XXX&month=5&year=2026
 *
 * Differenza vs /api/debug/carryover-analysis:
 *   - Usa ESATTAMENTE computeMonthDebt + computeOwnerCreditFromPriorMonths
 *     (le stesse funzioni che alimentano /dashboard/pagamenti). Quindi il
 *     credito riportato qui combacia AL CENTESIMO con l'acconto mostrato
 *     nella pagina. La vecchia carryover-analysis ricalcolava il saldo a
 *     mano contando TUTTI gli ordini non-CANCELLED e SENZA escludere i
 *     prodotti pulizia → poteva divergere e mascherare la causa.
 *
 *   - Per ogni MESE che genera eccesso (saldo < 0), elenca i DOCUMENTI:
 *       • pulizie conteggiate
 *       • ordini conteggiati
 *       • ordini ESCLUSI dalla fatturazione + MOTIVO (non DELIVERED né
 *         collegato a pulizia COMPLETED / data fuori mese / solo prodotti
 *         pulizia / excludedFromBilling)
 *       • pagamenti del mese (reali + isCreditTransfer)
 *     e una `likelyCause` testuale.
 *
 * Parametri opzionali:
 *   month, year   → mese di riferimento (default = mese corrente)
 *   name          → filtra per nome proprietario (case-insensitive)
 *   ownerId       → filtra un solo ownerId
 *   monthsBack    → quanti mesi indietro guardare (default 24)
 *
 * SOLO LETTURA. Non modifica nulla.
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

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function toDate(d: any): Date | null {
  if (!d) return null;
  if (typeof d.toDate === "function") {
    try { return d.toDate(); } catch { return null; }
  }
  if (d instanceof Date) return d;
  return null;
}

function inMonth(d: Date | null, m: number, y: number): boolean {
  if (!d) return false;
  return d.getMonth() === m - 1 && d.getFullYear() === y;
}

/** Replica ESATTA di calculateOrderRawPrice (debtCalculator.ts, non esportata). */
function orderRawPrice(
  o: DebtCalcOrder,
  inv: Map<string, DebtCalcInventoryItem>,
): number {
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
  return total;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  const urlSecret = searchParams.get("cronSecret");
  if (cronSecret && urlSecret !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const now = new Date();
  const refMonth = parseInt(searchParams.get("month") || String(now.getMonth() + 1));
  const refYear = parseInt(searchParams.get("year") || String(now.getFullYear()));
  const monthsBack = parseInt(searchParams.get("monthsBack") || "24");
  const nameFilter = (searchParams.get("name") || "").toLowerCase().trim();
  const ownerFilter = searchParams.get("ownerId");

  try {
    // ─── 1. CARICA DATI (stesso perimetro della pagina: proprietà ACTIVE) ───
    const [usersSnap, propsSnap, cleaningsSnap, ordersSnap, paymentsSnap, overridesSnap, inventorySnap] =
      await Promise.all([
        adminDb.collection("users").get(),
        adminDb.collection("properties").where("status", "==", "ACTIVE").get(),
        adminDb.collection("cleanings").where("status", "==", "COMPLETED").get(),
        adminDb.collection("orders").get(),
        adminDb.collection("payments").get(),
        adminDb.collection("paymentOverrides").get(),
        adminDb.collection("inventory").get(),
      ]);

    const inventoryById = buildInventoryMap(
      inventorySnap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, any> })),
    );

    const usersById = new Map<string, any>();
    usersSnap.docs.forEach((d) => usersById.set(d.id, { id: d.id, ...(d.data() as any) }));

    // Proprietà ACTIVE raggruppate per owner
    const propsByOwner = new Map<string, DebtCalcProperty[]>();
    const ownerNameByOwner = new Map<string, string>();
    const propNameById = new Map<string, string>();
    propsSnap.docs.forEach((d) => {
      const p = d.data() as any;
      const ownerId = p.ownerId;
      if (!ownerId) return;
      propNameById.set(d.id, p.name || d.id);
      if (!propsByOwner.has(ownerId)) propsByOwner.set(ownerId, []);
      propsByOwner.get(ownerId)!.push({ id: d.id, cleaningPrice: p.cleaningPrice || 0 });
      if (!ownerNameByOwner.has(ownerId)) {
        const u = usersById.get(ownerId);
        ownerNameByOwner.set(
          ownerId,
          p.ownerName || u?.displayName || u?.name || u?.fullName || u?.email || ownerId,
        );
      }
    });

    // Cleanings/orders/payments/overrides in tipi canonici (zero loss)
    const cleanings: DebtCalcCleaning[] = cleaningsSnap.docs.map((d) => {
      const c = d.data() as any;
      return {
        id: d.id, propertyId: c.propertyId, status: c.status,
        scheduledDate: c.scheduledDate, price: c.price, priceOverride: c.priceOverride,
        holidayFee: c.holidayFee, excludedFromBilling: c.excludedFromBilling,
      };
    });

    const ordersRaw = ordersSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    const orders: DebtCalcOrder[] = ordersRaw.map((o) => ({
      id: o.id, propertyId: o.propertyId, status: o.status, cleaningId: o.cleaningId,
      scheduledDate: o.scheduledDate, deliveredAt: o.deliveredAt, createdAt: o.createdAt,
      items: o.items, totalPriceOverride: o.totalPriceOverride,
      deliveryFee: o.deliveryFee, deliveryFeeEnabled: o.deliveryFeeEnabled,
      bedMaking: o.bedMaking, bedMakingFee: o.bedMakingFee,
      excludedFromBilling: o.excludedFromBilling,
    }));

    const paymentsRaw = paymentsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    const payments: DebtCalcPayment[] = paymentsRaw
      .filter((p) => typeof p.month === "number" && typeof p.year === "number")
      .map((p) => ({
        proprietarioId: p.proprietarioId, month: p.month, year: p.year,
        amount: p.amount || 0, method: p.method, isCreditTransfer: p.isCreditTransfer === true,
      }));

    // Override per owner → Map<monthKey, override>
    const overridesByOwner = new Map<string, Map<string, DebtCalcOverride>>();
    overridesSnap.docs.forEach((d) => {
      const o = d.data() as any;
      if (typeof o.month !== "number" || typeof o.year !== "number") return;
      if (typeof o.overrideTotal !== "number") return;
      const oid = o.proprietarioId;
      if (!oid) return;
      if (!overridesByOwner.has(oid)) overridesByOwner.set(oid, new Map());
      overridesByOwner.get(oid)!.set(`${o.year}-${String(o.month).padStart(2, "0")}`, {
        proprietarioId: oid, month: o.month, year: o.year,
        overrideTotal: o.overrideTotal, reason: o.reason,
      });
    });

    // ─── 2. PER OGNI OWNER: credito canonico + forense mese sorgente ───
    const reports: any[] = [];

    for (const [ownerId, ownerProps] of propsByOwner) {
      if (ownerFilter && ownerId !== ownerFilter) continue;
      const ownerName = ownerNameByOwner.get(ownerId) || ownerId;
      if (nameFilter && !ownerName.toLowerCase().includes(nameFilter)) continue;

      const propertiesById = new Map<string, DebtCalcProperty>(ownerProps.map((p) => [p.id, p]));
      const ownerPropIds = new Set(ownerProps.map((p) => p.id));
      const ownerPayments = payments.filter((p) => p.proprietarioId === ownerId);
      const overridesByMonth = overridesByOwner.get(ownerId);

      // 🎯 CREDITO CANONICO — identico a quello mostrato nella pagina
      const carryoverCredit = computeOwnerCreditFromPriorMonths({
        month: refMonth, year: refYear,
        propertiesById, cleanings, orders, payments: ownerPayments,
        inventoryById, overridesByMonth, monthsBack,
      });

      if (carryoverCredit <= 0.01) continue; // niente acconto → niente da spiegare

      // Walk dei mesi precedenti, identico al loop interno canonico,
      // ma con forense sui documenti per i mesi in eccesso.
      let runningCredit = 0;
      const ledger: any[] = [];
      const surplusMonths: any[] = [];

      for (let i = monthsBack; i >= 1; i--) {
        const ref = new Date(refYear, refMonth - 1 - i, 1);
        const m = ref.getMonth() + 1;
        const y = ref.getFullYear();
        const monthKey = `${y}-${String(m).padStart(2, "0")}`;

        const calc = computeMonthDebt({
          month: m, year: y, propertiesById, cleanings, orders,
          payments: ownerPayments, inventoryById,
          override: overridesByMonth?.get(monthKey),
        });
        if (!calc) continue;

        let accumulated = 0;
        let consumed = 0;
        if (calc.saldo < 0) { accumulated = -calc.saldo; runningCredit += accumulated; }
        else if (calc.saldo > 0 && runningCredit > 0) {
          consumed = Math.min(calc.saldo, runningCredit);
          runningCredit -= consumed;
        }

        const row: any = {
          monthKey, label: `${MONTHS_IT[m - 1]} ${y}`,
          totaleServizi: round(calc.totaleServizi),
          totalePagato: round(calc.totalePagato),
          saldo: round(calc.saldo),
          hasOverride: calc.breakdown.hasOverride,
          overrideRawBefore: calc.breakdown.rawCalcBeforeOverride != null ? round(calc.breakdown.rawCalcBeforeOverride) : null,
          cleaningsCount: calc.breakdown.cleaningsCount,
          ordersCount: calc.breakdown.ordersCount,
          creditAccumulated: round(accumulated),
          consumedFromCredit: round(consumed),
          runningCreditAfter: round(runningCredit),
        };
        ledger.push(row);

        // ─── FORENSE: solo per i mesi che GENERANO eccesso ───
        if (calc.saldo < -0.01) {
          // ricostruisco le pulizie COMPLETED del mese (per le linked-orders)
          const completedIds = new Set<string>();
          const cleaningDocs: any[] = [];
          for (const c of cleanings) {
            if (c.status !== "COMPLETED") continue;
            if (c.excludedFromBilling === true) continue;
            if (!ownerPropIds.has(c.propertyId)) continue;
            if (!inMonth(toDate(c.scheduledDate), m, y)) continue;
            completedIds.add(c.id);
            const base = c.price ?? propertiesById.get(c.propertyId)?.cleaningPrice ?? 0;
            cleaningDocs.push({
              id: c.id, property: propNameById.get(c.propertyId) || c.propertyId,
              date: toDate(c.scheduledDate)?.toISOString().slice(0, 10),
              price: round((c.priceOverride ?? base) + (c.holidayFee ?? 0)),
            });
          }

          const orderedIncluded: any[] = [];
          const orderedExcluded: any[] = [];
          for (const o of orders) {
            if (!ownerPropIds.has(o.propertyId)) continue;
            const od = toDate(o.deliveredAt) || toDate(o.scheduledDate);
            // consideriamo solo ordini la cui data cade nel mese sorgente
            // (oppure collegati a pulizia completed del mese, che hanno la data nel mese comunque)
            const isLinked = !!o.cleaningId && completedIds.has(o.cleaningId);
            const dateInMonth = inMonth(od, m, y);
            if (!dateInMonth && !isLinked) continue; // ordine di un altro mese: ignora

            const price = round(o.totalPriceOverride ?? orderRawPrice(o, inventoryById));
            const itemsLabel = Array.isArray(o.items)
              ? o.items.map((it: any) => (it as any).name || it.itemId || it.id).slice(0, 8)
              : [];
            const onlyCleaningProducts =
              Array.isArray(o.items) && o.items.length > 0 && o.items.every((it) => isCleaningProductItem(it));

            const base = {
              id: o.id, status: o.status, cleaningId: o.cleaningId || null,
              property: propNameById.get(o.propertyId) || o.propertyId,
              date: od?.toISOString().slice(0, 10) || null,
              deliveredAt: toDate(o.deliveredAt)?.toISOString().slice(0, 10) || null,
              priceBillable: price,
              items: itemsLabel,
            };

            // Applico la regola canonica di inclusione
            if (o.status === "CANCELLED") { orderedExcluded.push({ ...base, reason: "status CANCELLED" }); continue; }
            if (o.excludedFromBilling === true) { orderedExcluded.push({ ...base, reason: "excludedFromBilling=true" }); continue; }
            const isDelivered = o.status === "DELIVERED";
            if (!isDelivered && !isLinked) {
              orderedExcluded.push({ ...base, reason: `status="${o.status}" e non collegato a pulizia COMPLETED del mese → NON fatturato` });
              continue;
            }
            if (!dateInMonth) {
              orderedExcluded.push({ ...base, reason: "data effettiva (deliveredAt/scheduledDate) fuori dal mese" });
              continue;
            }
            if (onlyCleaningProducts) {
              orderedExcluded.push({ ...base, reason: "ordine composto SOLO da prodotti pulizia → escluso dal totale proprietario" });
              continue;
            }
            orderedIncluded.push(base);
          }

          const paymentDocs = paymentsRaw
            .filter((p) => p.proprietarioId === ownerId && Number(p.month) === m && Number(p.year) === y)
            .map((p) => ({
              id: p.id, amount: round(p.amount || 0), method: p.method,
              type: p.type, isCreditTransfer: p.isCreditTransfer === true,
              note: p.note || null,
              createdAt: toDate(p.createdAt)?.toISOString().slice(0, 10) || null,
            }));

          // Euristica causa probabile
          const excludedBillable = orderedExcluded
            .filter((e) => e.status !== "CANCELLED" && !String(e.reason).includes("CANCELLED"))
            .reduce((s, e) => s + (e.priceBillable || 0), 0);
          const excess = round(-calc.saldo);
          let likelyCause = "Sovra-pagamento reale: il proprietario ha pagato più dei servizi fatturabili del mese.";
          if (calc.breakdown.hasOverride && (calc.breakdown.rawCalcBeforeOverride ?? 0) > calc.totaleServizi + 0.5) {
            likelyCause = `paymentOverride del mese (${round(calc.totaleServizi)}€) PIÙ BASSO del raw calcolato (${round(calc.breakdown.rawCalcBeforeOverride ?? 0)}€): se è stato pagato il raw, l'override crea l'eccesso.`;
          } else if (excludedBillable > 0.5 && Math.abs(excludedBillable - excess) < Math.max(1, excess * 0.5)) {
            likelyCause = `Ordini PAGATI ma NON fatturati (≈${round(excludedBillable)}€ esclusi dalla regola DELIVERED/linked-COMPLETED): probabilmente il pagamento li includeva ma il calcolo no → eccesso ≈${excess}€.`;
          } else if (paymentDocs.some((p) => p.isCreditTransfer)) {
            likelyCause = "Presente un pagamento isCreditTransfer in questo mese: verificare che il credito non sia già stato spostato altrove (possibile doppio conteggio a monte).";
          }

          surplusMonths.push({
            ...row,
            excess,
            likelyCause,
            cleaningsBillate: cleaningDocs,
            ordersBillati: orderedIncluded,
            ordersEsclusiDalCalcolo: orderedExcluded,
            pagamenti: paymentDocs,
          });
        }
      }

      reports.push({
        ownerId,
        ownerName,
        accontoMostrato: round(carryoverCredit),
        runningCreditFinal: round(runningCredit),
        numMesiInEccesso: surplusMonths.length,
        mesiSorgenteEccesso: surplusMonths,
        ledgerCompleto: ledger,
      });
    }

    reports.sort((a, b) => b.accontoMostrato - a.accontoMostrato);

    return NextResponse.json({
      success: true,
      ref: { month: refMonth, year: refYear, label: `${MONTHS_IT[refMonth - 1]} ${refYear}`, monthsBack },
      summary: {
        proprietariConAcconto: reports.length,
        sommaAcconti: round(reports.reduce((s, r) => s + r.accontoMostrato, 0)),
      },
      reports,
      _help: {
        cosaFa: "Per ogni proprietario con un acconto a (month,year), mostra il libro mastro dei mesi precedenti e, per i mesi che generano eccesso, i documenti esatti (pulizie/ordini fatturati, ordini ESCLUSI dal calcolo con motivo, pagamenti).",
        regolaOrdini: "Un ordine è fatturato solo se DELIVERED oppure collegato a pulizia COMPLETED dello stesso mese; gli ordini con soli prodotti pulizia sono esclusi.",
        comeUsare: "Leggi 'mesiSorgenteEccesso[].likelyCause' e confronta 'ordersEsclusiDalCalcolo' con 'pagamenti' per capire se l'acconto è reale o un artefatto.",
      },
    });
  } catch (error: any) {
    console.error("acconto-forensic-v1 error:", error);
    return NextResponse.json(
      { error: "Errore server", message: error?.message, stack: error?.stack?.split("\n").slice(0, 6).join("\n") },
      { status: 500 },
    );
  }
}
