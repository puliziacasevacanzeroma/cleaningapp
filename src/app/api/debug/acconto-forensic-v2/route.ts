/**
 * ════════════════════════════════════════════════════════════════════
 * DEBUG: Forense acconti carryover v2 — FLOTTA INTERA + VERDETTO
 * ════════════════════════════════════════════════════════════════════
 *
 * GET /api/debug/acconto-forensic-v2?cronSecret=XXX&month=5&year=2026
 *
 * Evoluzione di acconto-forensic-v1. Stessa fonte di verità canonica
 * (computeMonthDebt + computeOwnerCreditFromPriorMonths), ma:
 *
 *   1. Gira su TUTTI i proprietari attivi in un colpo solo.
 *   2. Per ogni ordine ESCLUSO dal calcolo, risolve lo STATO della
 *      pulizia collegata (COMPLETED altro-mese / PENDING / CANCELLED /
 *      INESISTENTE / NESSUN_LINK) così si capisce perché è rimasto fuori.
 *   3. Emette un VERDETTO per ogni mese-sorgente e per ogni proprietario:
 *        - ARTEFATTO_ORDINI_PENDING : l'eccesso è spiegato da ordini
 *          PENDING/orfani non fatturati (probabile sotto-fatturazione).
 *        - SOVRAPAGAMENTO_REALE     : nessun ordine escluso → il cliente
 *          ha pagato davvero più dei servizi.
 *        - OVERRIDE_SOTTO_RAW       : paymentOverride del mese più basso
 *          del raw → l'override crea l'eccesso.
 *        - MISTO                    : combinazione / da verificare a mano.
 *
 * Output COMPATTO di default (incollabile). Usa &full=1 per il dettaglio
 * documento-per-documento (pulizie, ordini, pagamenti, ledger completo).
 *
 * Parametri:
 *   month, year   → mese di riferimento (default = mese corrente)
 *   name          → filtra per nome proprietario (case-insensitive)
 *   ownerId       → filtra un solo ownerId
 *   monthsBack    → quanti mesi indietro (default 24)
 *   full=1        → include tutti i documenti, non solo il verdetto
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
  if (typeof d.toDate === "function") { try { return d.toDate(); } catch { return null; } }
  if (d instanceof Date) return d;
  return null;
}
function inMonth(d: Date | null, m: number, y: number): boolean {
  if (!d) return false;
  return d.getMonth() === m - 1 && d.getFullYear() === y;
}
function ymLabel(d: Date | null): string | null {
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Replica ESATTA di calculateOrderRawPrice (debtCalculator.ts, non esportata). */
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
  const full = searchParams.get("full") === "1";

  try {
    // ─── 1. CARICA DATI — cleanings TUTTE (serve per risolvere lo stato dei link) ───
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

    const inventoryById = buildInventoryMap(
      inventorySnap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, any> })),
    );

    const usersById = new Map<string, any>();
    usersSnap.docs.forEach((d) => usersById.set(d.id, { id: d.id, ...(d.data() as any) }));

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
        ownerNameByOwner.set(ownerId, p.ownerName || u?.displayName || u?.name || u?.fullName || u?.email || ownerId);
      }
    });

    // Mappa cleaningId → {status, date} per risolvere i link degli ordini esclusi
    const cleaningById = new Map<string, { status: string; date: Date | null; propertyId: string }>();
    const cleanings: DebtCalcCleaning[] = cleaningsSnap.docs.map((d) => {
      const c = d.data() as any;
      cleaningById.set(d.id, { status: c.status, date: toDate(c.scheduledDate), propertyId: c.propertyId });
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
      bedMaking: o.bedMaking, bedMakingFee: o.bedMakingFee, excludedFromBilling: o.excludedFromBilling,
    }));

    const paymentsRaw = paymentsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    const payments: DebtCalcPayment[] = paymentsRaw
      .filter((p) => typeof p.month === "number" && typeof p.year === "number")
      .map((p) => ({
        proprietarioId: p.proprietarioId, month: p.month, year: p.year,
        amount: p.amount || 0, method: p.method, isCreditTransfer: p.isCreditTransfer === true,
      }));

    const overridesByOwner = new Map<string, Map<string, DebtCalcOverride>>();
    overridesSnap.docs.forEach((d) => {
      const o = d.data() as any;
      if (typeof o.month !== "number" || typeof o.year !== "number") return;
      if (typeof o.overrideTotal !== "number") return;
      const oid = o.proprietarioId;
      if (!oid) return;
      if (!overridesByOwner.has(oid)) overridesByOwner.set(oid, new Map());
      overridesByOwner.get(oid)!.set(`${o.year}-${String(o.month).padStart(2, "0")}`, {
        proprietarioId: oid, month: o.month, year: o.year, overrideTotal: o.overrideTotal, reason: o.reason,
      });
    });

    // ─── 2. PER OGNI OWNER ───
    const reports: any[] = [];
    const verdictTally: Record<string, number> = {};

    for (const [ownerId, ownerProps] of propsByOwner) {
      if (ownerFilter && ownerId !== ownerFilter) continue;
      const ownerName = ownerNameByOwner.get(ownerId) || ownerId;
      if (nameFilter && !ownerName.toLowerCase().includes(nameFilter)) continue;

      const propertiesById = new Map<string, DebtCalcProperty>(ownerProps.map((p) => [p.id, p]));
      const ownerPropIds = new Set(ownerProps.map((p) => p.id));
      const ownerPayments = payments.filter((p) => p.proprietarioId === ownerId);
      const overridesByMonth = overridesByOwner.get(ownerId);

      const carryoverCredit = computeOwnerCreditFromPriorMonths({
        month: refMonth, year: refYear, propertiesById, cleanings, orders,
        payments: ownerPayments, inventoryById, overridesByMonth, monthsBack,
      });
      if (carryoverCredit <= 0.01) continue;

      let runningCredit = 0;
      const ledger: any[] = [];
      const sourceMonths: any[] = [];

      for (let i = monthsBack; i >= 1; i--) {
        const ref = new Date(refYear, refMonth - 1 - i, 1);
        const m = ref.getMonth() + 1;
        const y = ref.getFullYear();
        const monthKey = `${y}-${String(m).padStart(2, "0")}`;

        const calc = computeMonthDebt({
          month: m, year: y, propertiesById, cleanings, orders,
          payments: ownerPayments, inventoryById, override: overridesByMonth?.get(monthKey),
        });
        if (!calc) continue;

        let accumulated = 0, consumed = 0;
        if (calc.saldo < 0) { accumulated = -calc.saldo; runningCredit += accumulated; }
        else if (calc.saldo > 0 && runningCredit > 0) { consumed = Math.min(calc.saldo, runningCredit); runningCredit -= consumed; }

        ledger.push({
          monthKey, label: `${MONTHS_IT[m - 1]} ${y}`,
          totaleServizi: round(calc.totaleServizi), totalePagato: round(calc.totalePagato),
          saldo: round(calc.saldo), creditAccumulated: round(accumulated),
          consumedFromCredit: round(consumed), runningCreditAfter: round(runningCredit),
        });

        if (calc.saldo >= -0.01) continue; // solo mesi che generano eccesso

        // Pulizie COMPLETED del mese (per i link)
        const completedIds = new Set<string>();
        const cleaningsBillate: any[] = [];
        for (const c of cleanings) {
          if (c.status !== "COMPLETED" || c.excludedFromBilling === true) continue;
          if (!ownerPropIds.has(c.propertyId) || !inMonth(toDate(c.scheduledDate), m, y)) continue;
          completedIds.add(c.id);
          if (full) {
            const base = c.price ?? propertiesById.get(c.propertyId)?.cleaningPrice ?? 0;
            cleaningsBillate.push({ id: c.id, property: propNameById.get(c.propertyId) || c.propertyId, date: toDate(c.scheduledDate)?.toISOString().slice(0, 10), price: round((c.priceOverride ?? base) + (c.holidayFee ?? 0)) });
          }
        }

        const ordersBillati: any[] = [];
        const ordersEsclusi: any[] = [];
        const pendingSospetti: any[] = []; // ordini esclusi PERCHÉ non DELIVERED/non-linked → i veri colpevoli
        let excludedPendingTotal = 0;
        let cancelledCount = 0;

        for (const o of orders) {
          if (!ownerPropIds.has(o.propertyId)) continue;
          const od = toDate(o.deliveredAt) || toDate(o.scheduledDate);
          const isLinked = !!o.cleaningId && completedIds.has(o.cleaningId);
          const dateInMonth = inMonth(od, m, y);
          if (!dateInMonth && !isLinked) continue;

          const price = round(o.totalPriceOverride ?? orderRawPrice(o, inventoryById));
          const itemsLabel = Array.isArray(o.items) ? o.items.map((it: any) => (it as any).name || it.itemId || it.id).slice(0, 8) : [];
          const onlyCleaningProducts = Array.isArray(o.items) && o.items.length > 0 && o.items.every((it) => isCleaningProductItem(it));

          // Risolvi stato pulizia collegata
          let linkedCleaning = "NESSUN_LINK";
          if (o.cleaningId) {
            const lc = cleaningById.get(o.cleaningId);
            if (!lc) linkedCleaning = "INESISTENTE";
            else if (lc.status === "COMPLETED") linkedCleaning = inMonth(lc.date, m, y) ? "COMPLETED_STESSO_MESE" : `COMPLETED_ALTRO_MESE(${ymLabel(lc.date)})`;
            else linkedCleaning = `CLEANING_${lc.status}`;
          }

          const base = {
            id: o.id, status: o.status, cleaningId: o.cleaningId || null, linkedCleaning,
            property: propNameById.get(o.propertyId) || o.propertyId,
            date: od?.toISOString().slice(0, 10) || null,
            deliveredAt: toDate(o.deliveredAt)?.toISOString().slice(0, 10) || null,
            priceBillable: price, items: itemsLabel,
          };

          if (o.status === "CANCELLED") { cancelledCount++; if (full) ordersEsclusi.push({ ...base, reason: "status CANCELLED" }); continue; }
          if (o.excludedFromBilling === true) { if (full) ordersEsclusi.push({ ...base, reason: "excludedFromBilling=true" }); continue; }
          const isDelivered = o.status === "DELIVERED";
          if (!isDelivered && !isLinked) {
            excludedPendingTotal += price;
            pendingSospetti.push(base);
            if (full) ordersEsclusi.push({ ...base, reason: `status="${o.status}" e non collegato a pulizia COMPLETED del mese → NON fatturato` });
            continue;
          }
          if (!dateInMonth) { if (full) ordersEsclusi.push({ ...base, reason: "data fuori mese" }); continue; }
          if (onlyCleaningProducts) { if (full) ordersEsclusi.push({ ...base, reason: "solo prodotti pulizia → escluso" }); continue; }
          if (full) ordersBillati.push(base);
        }

        const excess = round(-calc.saldo);
        excludedPendingTotal = round(excludedPendingTotal);

        // VERDETTO del mese
        let verdict: string;
        if (calc.breakdown.hasOverride && (calc.breakdown.rawCalcBeforeOverride ?? 0) > calc.totaleServizi + 0.5) {
          verdict = "OVERRIDE_SOTTO_RAW";
        } else if (excludedPendingTotal > 0.5 && excludedPendingTotal >= excess * 0.6) {
          verdict = "ARTEFATTO_ORDINI_PENDING";
        } else if (excludedPendingTotal <= 0.5) {
          verdict = "SOVRAPAGAMENTO_REALE";
        } else {
          verdict = "MISTO";
        }

        const sm: any = {
          label: `${MONTHS_IT[m - 1]} ${y}`,
          totaleServizi: round(calc.totaleServizi), totalePagato: round(calc.totalePagato),
          excess, hasOverride: calc.breakdown.hasOverride,
          overrideRawBefore: calc.breakdown.rawCalcBeforeOverride != null ? round(calc.breakdown.rawCalcBeforeOverride) : null,
          excludedPendingTotal, excludedPendingCount: pendingSospetti.length, cancelledCount,
          verdict,
          ordiniPendingSospetti: pendingSospetti, // sempre inclusi: sono pochi e sono la chiave
        };
        if (full) { sm.cleaningsBillate = cleaningsBillate; sm.ordersBillati = ordersBillati; sm.ordersEsclusi = ordersEsclusi; }
        sourceMonths.push(sm);
      }

      // Verdetto a livello proprietario
      const verdicts = sourceMonths.map((s) => s.verdict);
      let ownerVerdict = "MISTO";
      if (verdicts.every((v) => v === "SOVRAPAGAMENTO_REALE")) ownerVerdict = "SOVRAPAGAMENTO_REALE";
      else if (verdicts.some((v) => v === "ARTEFATTO_ORDINI_PENDING")) ownerVerdict = "ARTEFATTO_ORDINI_PENDING";
      else if (verdicts.every((v) => v === "OVERRIDE_SOTTO_RAW")) ownerVerdict = "OVERRIDE_SOTTO_RAW";
      verdictTally[ownerVerdict] = (verdictTally[ownerVerdict] || 0) + 1;

      const report: any = {
        ownerId, ownerName,
        accontoMostrato: round(carryoverCredit),
        verdict: ownerVerdict,
        mesiSorgente: sourceMonths,
      };
      if (full) report.ledgerCompleto = ledger;
      reports.push(report);
    }

    reports.sort((a, b) => b.accontoMostrato - a.accontoMostrato);

    return NextResponse.json({
      success: true,
      ref: { month: refMonth, year: refYear, label: `${MONTHS_IT[refMonth - 1]} ${refYear}`, monthsBack, full },
      summary: {
        proprietariConAcconto: reports.length,
        sommaAcconti: round(reports.reduce((s, r) => s + r.accontoMostrato, 0)),
        verdettiPerTipo: verdictTally,
      },
      reports,
      _legend: {
        ARTEFATTO_ORDINI_PENDING: "L'eccesso è spiegato da ordini PENDING/orfani non fatturati: probabile sotto-fatturazione (biancheria consegnata ma ordine mai DELIVERED/scollegato). Controllare 'linkedCleaning' degli ordini.",
        SOVRAPAGAMENTO_REALE: "Nessun ordine escluso: il cliente ha pagato più dei servizi → acconto LEGITTIMO.",
        OVERRIDE_SOTTO_RAW: "paymentOverride del mese più basso del raw calcolato → l'override genera l'eccesso.",
        MISTO: "Combinazione di cause → verificare i mesiSorgente a mano.",
        linkedCleaning: "Stato della pulizia collegata all'ordine: CLEANING_PENDING/INESISTENTE/NESSUN_LINK = ordine non fatturabile con le regole attuali.",
      },
    });
  } catch (error: any) {
    console.error("acconto-forensic-v2 error:", error);
    return NextResponse.json(
      { error: "Errore server", message: error?.message, stack: error?.stack?.split("\n").slice(0, 6).join("\n") },
      { status: 500 },
    );
  }
}
