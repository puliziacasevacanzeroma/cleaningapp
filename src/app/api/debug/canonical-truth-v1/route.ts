/**
 * ════════════════════════════════════════════════════════════════════
 * DEBUG: Canonical Truth v1 — VERITÀ secondo debtCalculator.ts
 * ════════════════════════════════════════════════════════════════════
 *
 * GET /api/debug/canonical-truth-v1?cronSecret=XXX
 *
 * Per ogni proprietario ATTIVO calcola debito + credito carryover usando
 * ESATTAMENTE le funzioni dichiarate "fonte di verità" in debtCalculator.ts:
 *   - computeMonthDebt          (per il saldo di ogni mese)
 *   - getMonthsToCheck          (24 mesi precedenti, escluso corrente)
 *   - buildInventoryMap         (alias inventario)
 *
 * La funzione di accumulo carryover è replicata fedelmente dalla logica di
 * computeOwnerDebt.ts (server-side) — quella usata da:
 *   • cron email (warning + suspension)
 *   • POST /api/payments (auto-sblocco)
 *   • useOwnerBalance (modal "Pagamenti in sospeso")
 *
 * READ-ONLY: nessuna scrittura su Firestore.
 *
 * Query params:
 *   cronSecret  (obbligatorio se CRON_SECRET è settato)
 *   ownerId     (opzionale, filtra un solo owner)
 *   name        (opzionale, filtra per nome - case insensitive)
 *   verbose=1   (opzionale, include array completo dei 24 mesi anche se vuoti)
 *
 * Output JSON:
 *   summary: { ownersAnalyzed, totalCreditoTotale, totalDebt, totalDebtNet, ownersWithCredit, ownersWithDebt }
 *   reports: [
 *     {
 *       ownerId, ownerName, email, propertiesCount,
 *       canonical_creditoTotale, canonical_totalDebt, canonical_totalDebtNet,
 *       monthsWithDebt: [{ month, year, totaleServizi, totalePagato, saldo }],
 *       monthsWithCredit: [{ month, year, totaleServizi, totalePagato, saldo }],  // saldo<0
 *       allMonths?: [...]  // solo se verbose=1
 *     }
 *   ]
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import {
  computeMonthDebt,
  getMonthsToCheck,
  buildInventoryMap,
  type DebtCalcProperty,
  type DebtCalcCleaning,
  type DebtCalcOrder,
  type DebtCalcPayment,
  type DebtCalcOverride,
} from "~/lib/payments/debtCalculator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Soglia identica a computeOwnerDebt.ts
const SALDO_THRESHOLD = 0.01;

export async function GET(request: NextRequest) {
  // ─── AUTH ───
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  const urlSecret = searchParams.get("cronSecret");
  if (cronSecret && urlSecret !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const ownerFilter = searchParams.get("ownerId");
  const nameFilter = searchParams.get("name")?.toLowerCase() || null;
  const verbose = searchParams.get("verbose") === "1";

  try {
    // ════════════════════════════════════════════════════════════
    // 1. CARICA TUTTO UNA VOLTA SOLA
    // ════════════════════════════════════════════════════════════
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const rangeStart = new Date(currentYear - 2, currentMonth - 1, 1);
    const startTs = Timestamp.fromDate(rangeStart);

    const [
      usersSnap,
      propsSnap,
      cleaningsSnap,
      ordersSnap,
      paymentsSnap,
      overridesSnap,
      inventorySnap,
    ] = await Promise.all([
      adminDb.collection("users")
        .where("role", "in", ["PROPRIETARIO", "CLIENTE", "OWNER"])
        .where("status", "==", "ACTIVE")
        .get(),
      adminDb.collection("properties")
        .where("status", "==", "ACTIVE")
        .get(),
      adminDb.collection("cleanings")
        .where("status", "==", "COMPLETED")
        .where("scheduledDate", ">=", startTs)
        .get(),
      adminDb.collection("orders")
        .where("scheduledDate", ">=", startTs)
        .get(),
      adminDb.collection("payments").get(),
      adminDb.collection("paymentOverrides").get(),
      adminDb.collection("inventory").get(),
    ]);

    // Inventory map (con tutti gli alias)
    const inventoryById = buildInventoryMap(
      inventorySnap.docs.map((d) => ({ id: d.id, data: d.data() })),
    );

    // Properties indicizzate per ownerId
    const propsByOwner = new Map<string, Map<string, DebtCalcProperty>>();
    propsSnap.docs.forEach((d) => {
      const data = d.data() as any;
      const ownerId = data.ownerId;
      if (!ownerId) return;
      if (!propsByOwner.has(ownerId)) propsByOwner.set(ownerId, new Map());
      propsByOwner.get(ownerId)!.set(d.id, {
        id: d.id,
        cleaningPrice: data.cleaningPrice || 0,
      });
    });

    // Pulizie indicizzate per propertyId
    const cleaningsByProp = new Map<string, DebtCalcCleaning[]>();
    cleaningsSnap.docs.forEach((d) => {
      const data = d.data() as any;
      const propId = data.propertyId;
      if (!propId) return;
      if (!cleaningsByProp.has(propId)) cleaningsByProp.set(propId, []);
      cleaningsByProp.get(propId)!.push({
        id: d.id,
        propertyId: propId,
        status: data.status,
        scheduledDate: data.scheduledDate,
        price: data.price,
        priceOverride: data.priceOverride,
        holidayFee: data.holidayFee,
        excludedFromBilling: data.excludedFromBilling,
      });
    });

    // Ordini indicizzati per propertyId
    const ordersByProp = new Map<string, DebtCalcOrder[]>();
    ordersSnap.docs.forEach((d) => {
      const data = d.data() as any;
      const propId = data.propertyId;
      if (!propId) return;
      if (!ordersByProp.has(propId)) ordersByProp.set(propId, []);
      ordersByProp.get(propId)!.push({
        id: d.id,
        propertyId: propId,
        status: data.status,
        cleaningId: data.cleaningId,
        scheduledDate: data.scheduledDate,
        deliveredAt: data.deliveredAt,
        createdAt: data.createdAt,
        items: data.items,
        totalPriceOverride: data.totalPriceOverride,
        deliveryFee: data.deliveryFee,
        deliveryFeeEnabled: data.deliveryFeeEnabled,
        bedMaking: data.bedMaking,
        bedMakingFee: data.bedMakingFee,
        excludedFromBilling: data.excludedFromBilling,
      });
    });

    // Pagamenti indicizzati per ownerId
    const paymentsByOwner = new Map<string, DebtCalcPayment[]>();
    paymentsSnap.docs.forEach((d) => {
      const data = d.data() as any;
      const ownerId = data.proprietarioId;
      if (!ownerId) return;
      if (typeof data.month !== "number" || typeof data.year !== "number") return;
      if (!paymentsByOwner.has(ownerId)) paymentsByOwner.set(ownerId, []);
      paymentsByOwner.get(ownerId)!.push({
        proprietarioId: ownerId,
        month: data.month,
        year: data.year,
        amount: data.amount || 0,
        method: data.method,
        isCreditTransfer: data.isCreditTransfer === true,
      });
    });

    // Overrides indicizzati per ownerId+monthKey
    const overridesByOwner = new Map<string, Map<string, DebtCalcOverride>>();
    overridesSnap.docs.forEach((d) => {
      const data = d.data() as any;
      const ownerId = data.proprietarioId;
      if (!ownerId) return;
      if (typeof data.month !== "number" || typeof data.year !== "number") return;
      if (typeof data.overrideTotal !== "number") return;
      if (!overridesByOwner.has(ownerId)) overridesByOwner.set(ownerId, new Map());
      overridesByOwner.get(ownerId)!.set(`${data.year}-${data.month}`, {
        proprietarioId: ownerId,
        month: data.month,
        year: data.year,
        overrideTotal: data.overrideTotal,
        reason: data.reason,
      });
    });

    // ════════════════════════════════════════════════════════════
    // 2. PER OGNI OWNER, CALCOLA SECONDO IL CANONICO
    // ════════════════════════════════════════════════════════════
    const monthsToCheck = getMonthsToCheck(now, 24);
    const reports: any[] = [];

    for (const userDoc of usersSnap.docs) {
      const ownerId = userDoc.id;
      const userData = userDoc.data() as any;
      const ownerName =
        userData.displayName || userData.name || userData.fullName || userData.email || "?";
      const email = (userData.email || "").toLowerCase();

      // Filtri opzionali
      if (ownerFilter && ownerId !== ownerFilter) continue;
      if (nameFilter && !ownerName.toLowerCase().includes(nameFilter)) continue;

      const ownerProps = propsByOwner.get(ownerId);
      if (!ownerProps || ownerProps.size === 0) continue;

      // Aggrega cleanings + orders del proprietario (solo dalle SUE proprietà)
      const cleanings: DebtCalcCleaning[] = [];
      const orders: DebtCalcOrder[] = [];
      ownerProps.forEach((_p, propId) => {
        const cs = cleaningsByProp.get(propId);
        if (cs) cleanings.push(...cs);
        const os = ordersByProp.get(propId);
        if (os) orders.push(...os);
      });

      const payments = paymentsByOwner.get(ownerId) || [];
      const overrideMap = overridesByOwner.get(ownerId);

      // ─── CALCOLO PER OGNI MESE ───
      let creditoTotale = 0;
      let totalDebt = 0;
      const monthsWithDebt: any[] = [];
      const monthsWithCredit: any[] = [];
      const allMonthsDetail: any[] = [];

      for (const { month, year } of monthsToCheck) {
        const calc = computeMonthDebt({
          month,
          year,
          propertiesById: ownerProps,
          cleanings,
          orders,
          payments,
          inventoryById,
          override: overrideMap?.get(`${year}-${month}`) ?? null,
        });

        if (!calc) {
          if (verbose) {
            allMonthsDetail.push({
              month, year, status: "NO_ACTIVITY",
            });
          }
          continue;
        }

        const monthDetail = {
          month, year,
          totaleServizi: round(calc.totaleServizi),
          totalePagato: round(calc.totalePagato),
          saldo: round(calc.saldo),
          cleaningsCount: calc.breakdown.cleaningsCount,
          ordersCount: calc.breakdown.ordersCount,
          hasOverride: calc.breakdown.hasOverride,
          rawCalcBeforeOverride: calc.breakdown.rawCalcBeforeOverride !== undefined
            ? round(calc.breakdown.rawCalcBeforeOverride)
            : undefined,
          overrideReason: calc.breakdown.overrideReason,
        };

        // Somma identica a computeOwnerDebt.ts (riga 266-267)
        if (calc.saldo < -SALDO_THRESHOLD) {
          creditoTotale += -calc.saldo;
          monthsWithCredit.push(monthDetail);
        }

        // Identica a computeOwnerDebt.ts (riga 270)
        if (calc.saldo > SALDO_THRESHOLD) {
          totalDebt += calc.saldo;
          monthsWithDebt.push(monthDetail);
        }

        if (verbose) allMonthsDetail.push(monthDetail);
      }

      const totalDebtNet = Math.max(0, totalDebt - creditoTotale);

      // Includi nel report solo se ha qualcosa di interessante
      const hasCredit = creditoTotale > SALDO_THRESHOLD;
      const hasDebt = totalDebt > SALDO_THRESHOLD;
      if (!hasCredit && !hasDebt) continue;

      // Ordina mesi cronologicamente
      const sortMonths = (a: any, b: any) =>
        a.year !== b.year ? a.year - b.year : a.month - b.month;
      monthsWithDebt.sort(sortMonths);
      monthsWithCredit.sort(sortMonths);
      if (verbose) allMonthsDetail.sort(sortMonths);

      reports.push({
        ownerId,
        ownerName,
        email,
        propertiesCount: ownerProps.size,
        canonical_creditoTotale: round(creditoTotale),
        canonical_totalDebt: round(totalDebt),
        canonical_totalDebtNet: round(totalDebtNet),
        monthsWithDebt,
        monthsWithCredit,
        ...(verbose ? { allMonths: allMonthsDetail } : {}),
      });
    }

    // ════════════════════════════════════════════════════════════
    // 3. ORDINA E SOMMA
    // ════════════════════════════════════════════════════════════
    reports.sort((a, b) => b.canonical_creditoTotale - a.canonical_creditoTotale);

    const summary = {
      timestamp: new Date().toISOString(),
      refMonth: currentMonth,
      refYear: currentYear,
      ownersAnalyzed: reports.length,
      ownersWithCredit: reports.filter((r) => r.canonical_creditoTotale > SALDO_THRESHOLD).length,
      ownersWithDebt: reports.filter((r) => r.canonical_totalDebt > SALDO_THRESHOLD).length,
      ownersWithDebtNet: reports.filter((r) => r.canonical_totalDebtNet > SALDO_THRESHOLD).length,
      sumCreditoTotale: round(reports.reduce((s, r) => s + r.canonical_creditoTotale, 0)),
      sumTotalDebt: round(reports.reduce((s, r) => s + r.canonical_totalDebt, 0)),
      sumTotalDebtNet: round(reports.reduce((s, r) => s + r.canonical_totalDebtNet, 0)),
    };

    return NextResponse.json({
      success: true,
      _source: "debtCalculator.computeMonthDebt + carryover logic da computeOwnerDebt.ts",
      summary,
      reports,
    });
  } catch (error: any) {
    console.error("Errore canonical-truth-v1:", error);
    return NextResponse.json(
      {
        error: "Errore server",
        message: error?.message,
        stack: error?.stack?.split("\n").slice(0, 5).join("\n"),
      },
      { status: 500 },
    );
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
