/**
 * GET /api/debug/payments-vs-report-audit
 *
 * SCRIPT DI CONFRONTO CHIRURGICO Pagamenti vs Statistiche.
 *
 * VERSIONE: v3-2026-05-05-NO-INDEXES
 *
 * Per identificare la versione del deploy attivo, l'endpoint restituisce
 * sempre il campo "_version" nella risposta. Se è "v3-2026-05-05-NO-INDEXES"
 * → la versione corretta è online e il bug indici è risolto.
 *
 * Carica TUTTI i dati con UNA SOLA query su scheduledDate (finestra ampliata
 * ±1 mese). Niente più query secondarie con .where("status", ...) che
 * richiedono indici compositi.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import { buildInventoryMap } from "~/lib/payments/debtCalculator";

export const dynamic = "force-dynamic";

const SCRIPT_VERSION = "v3-2026-05-05-NO-INDEXES";

function toDate(d: any): Date | null {
  if (!d) return null;
  if (d instanceof Date) return d;
  if (typeof d.toDate === "function") {
    try { return d.toDate(); } catch { return null; }
  }
  return null;
}

function isInRange(d: Date | null, start: Date, end: Date): boolean {
  if (!d) return false;
  return d >= start && d <= end;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user || user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato", _version: SCRIPT_VERSION }, { status: 401 });
    }

    const monthParam = req.nextUrl.searchParams.get("month");
    const yearParam = req.nextUrl.searchParams.get("year");
    const detail = req.nextUrl.searchParams.get("detail") === "true";

    if (!monthParam || !yearParam) {
      return NextResponse.json({
        error: "Parametri month e year obbligatori (es. ?month=4&year=2026)",
        _version: SCRIPT_VERSION,
      }, { status: 400 });
    }

    const month = parseInt(monthParam, 10);
    const year = parseInt(yearParam, 10);
    if (isNaN(month) || month < 1 || month > 12 || isNaN(year)) {
      return NextResponse.json({ error: "month/year invalidi", _version: SCRIPT_VERSION }, { status: 400 });
    }

    const t0 = Date.now();

    const monthStart = new Date(year, month - 1, 1, 0, 0, 0);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

    // ─── 1. PROPRIETÀ ─────────────────────────────────
    const propsSnap = await adminDb.collection("properties").get();
    const allProperties = propsSnap.docs.map(d => ({
      id: d.id,
      ownerId: d.data().ownerId as string,
      cleaningPrice: (d.data().cleaningPrice as number) || 0,
      status: d.data().status as string,
      name: d.data().name as string,
    }));

    // ─── 2. INVENTORY ─────────────────────────────────
    const invSnap = await adminDb.collection("inventory").get();
    const reportInvMap = new Map<string, number>();
    invSnap.docs.forEach(d => {
      const data = d.data();
      reportInvMap.set(d.id, (data.sellPrice as number) || 0);
      if (data.key) reportInvMap.set(data.key as string, (data.sellPrice as number) || 0);
    });
    const paymentsInvMap = buildInventoryMap(
      invSnap.docs.map(d => ({ id: d.id, data: d.data() }))
    );

    // ─── 3. CLEANINGS — UNA query, finestra ampliata ──
    // ATTENZIONE: NIENTE .where("status",...) qui per evitare indici compositi
    const widenedStart = new Date(year, month - 2, 1, 0, 0, 0);
    const widenedEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
    const wStartTs = Timestamp.fromDate(widenedStart);
    const wEndTs = Timestamp.fromDate(widenedEnd);

    const cleaningsSnap = await adminDb.collection("cleanings")
      .where("scheduledDate", ">=", wStartTs)
      .where("scheduledDate", "<=", wEndTs)
      .get();
    const allCleanings = cleaningsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

    // ─── 4. ORDERS — UNA query, finestra ampliata ─────
    const ordersSnap = await adminDb.collection("orders")
      .where("scheduledDate", ">=", wStartTs)
      .where("scheduledDate", "<=", wEndTs)
      .get();
    const allOrders = ordersSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

    // ─── 5. OVERRIDES ─────────────────────────────────
    const overridesSnap = await adminDb.collection("paymentOverrides")
      .where("month", "==", month)
      .where("year", "==", year)
      .get();
    const overrideByOwner = new Map<string, any>();
    overridesSnap.docs.forEach(d => {
      const o = d.data();
      overrideByOwner.set(o.proprietarioId, o);
    });

    // ─── 6. Determina modo mese ───────────────────────
    const today = new Date();
    const todayMonthStart = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0);
    const isCurrent = monthStart.getTime() === todayMonthStart.getTime();
    const isPast = monthStart.getTime() < todayMonthStart.getTime();
    const monthMode = isPast ? "PAST" : isCurrent ? "CURRENT" : "FUTURE";

    // ═══════════════════════════════════════════════════════
    // 7. CALCOLO STATISTICHE (heroBanner di ReportContent)
    // ═══════════════════════════════════════════════════════
    const reportCleanings = allCleanings.filter((c: any) => {
      if (c.status === "CANCELLED") return false;
      if (isPast) {
        if (c.status !== "COMPLETED") return false;
        const d = toDate(c.completedAt) || toDate(c.scheduledDate);
        return isInRange(d, monthStart, monthEnd);
      }
      const d = toDate(c.scheduledDate);
      return isInRange(d, monthStart, monthEnd);
    });

    const reportOrders = allOrders.filter((o: any) => {
      if (o.status === "CANCELLED") return false;
      if (isPast) {
        if (o.status !== "DELIVERED") return false;
        const d = toDate(o.deliveredAt) || toDate(o.scheduledDate) || toDate(o.createdAt);
        return isInRange(d, monthStart, monthEnd);
      }
      const d = toDate(o.scheduledDate) || toDate(o.createdAt);
      return isInRange(d, monthStart, monthEnd);
    });

    let reportCleaningsRevenue = 0;
    reportCleanings.forEach((c: any) => { reportCleaningsRevenue += c.price || 0; });

    let reportOrdersRevenue = 0;
    let reportDeliveryFees = 0;
    reportOrders.forEach((o: any) => {
      if (Array.isArray(o.items)) {
        o.items.forEach((item: any) => {
          const unitPrice = reportInvMap.get(item.id) || 0;
          reportOrdersRevenue += unitPrice * (item.quantity || 0);
        });
      }
      reportDeliveryFees += o.deliveryFee || 0;
    });
    const reportTotal = reportCleaningsRevenue + reportOrdersRevenue + reportDeliveryFees;

    // ═══════════════════════════════════════════════════════
    // 8. CALCOLO PAGAMENTI (computeMonthDebt aggregato)
    // ═══════════════════════════════════════════════════════
    const paymentsActiveProps = allProperties.filter(p => p.status === "ACTIVE");
    const activePropertyIds = new Set(paymentsActiveProps.map(p => p.id));
    const paymentsPropertiesById = new Map(paymentsActiveProps.map(p => [p.id, p]));

    const paymentsCleanings = allCleanings.filter((c: any) => {
      if (c.status !== "COMPLETED") return false;
      if (!activePropertyIds.has(c.propertyId)) return false;
      const d = toDate(c.scheduledDate);
      return isInRange(d, monthStart, monthEnd);
    });

    let paymentsCleaningsRevenue = 0;
    const paymentsCompletedIds = new Set<string>();
    paymentsCleanings.forEach((c: any) => {
      const prop = paymentsPropertiesById.get(c.propertyId);
      const basePrice = c.price ?? prop?.cleaningPrice ?? 0;
      const holidayFee = c.holidayFee ?? 0;
      const effectivePrice = (c.priceOverride ?? basePrice) + holidayFee;
      paymentsCleaningsRevenue += effectivePrice;
      paymentsCompletedIds.add(c.id);
    });

    const paymentsOrders = allOrders.filter((o: any) => {
      if (o.status === "CANCELLED") return false;
      if (!activePropertyIds.has(o.propertyId)) return false;
      const isDelivered = o.status === "DELIVERED";
      const isLinked = o.cleaningId && paymentsCompletedIds.has(o.cleaningId);
      if (!isDelivered && !isLinked) return false;
      const d = toDate(o.deliveredAt) || toDate(o.scheduledDate);
      return isInRange(d, monthStart, monthEnd);
    });

    let paymentsOrdersRevenue = 0;
    paymentsOrders.forEach((o: any) => {
      let calc = 0;
      if (Array.isArray(o.items)) {
        o.items.forEach((item: any) => {
          const itemKey = item.itemId || item.id;
          const inv = paymentsInvMap.get(itemKey);
          const basePrice = item.unitPrice ?? item.price ?? inv?.sellPrice ?? inv?.price ?? 0;
          const unitPrice = item.priceOverride ?? basePrice;
          const qty = item.quantity ?? 1;
          calc += item.totalPrice ?? (unitPrice * qty);
        });
      }
      if (o.deliveryFee && o.deliveryFeeEnabled !== false) calc += o.deliveryFee;
      if (o.bedMaking && o.bedMakingFee) calc += o.bedMakingFee;
      paymentsOrdersRevenue += o.totalPriceOverride ?? calc;
    });

    let paymentsOverridesAdjustment = 0;
    overrideByOwner.forEach((override, ownerId) => {
      const ownerProps = paymentsActiveProps.filter(p => p.ownerId === ownerId);
      if (ownerProps.length === 0) return;
      const ownerPropIds = new Set(ownerProps.map(p => p.id));
      let ownerCleaningsTot = 0;
      const ownerCompletedIds = new Set<string>();
      paymentsCleanings.forEach((c: any) => {
        if (!ownerPropIds.has(c.propertyId)) return;
        const prop = paymentsPropertiesById.get(c.propertyId);
        const basePrice = c.price ?? prop?.cleaningPrice ?? 0;
        const hFee = c.holidayFee ?? 0;
        ownerCleaningsTot += (c.priceOverride ?? basePrice) + hFee;
        ownerCompletedIds.add(c.id);
      });
      let ownerOrdersTot = 0;
      paymentsOrders.forEach((o: any) => {
        if (!ownerPropIds.has(o.propertyId)) return;
        let calc = 0;
        if (Array.isArray(o.items)) {
          o.items.forEach((item: any) => {
            const itemKey = item.itemId || item.id;
            const inv = paymentsInvMap.get(itemKey);
            const basePrice = item.unitPrice ?? item.price ?? inv?.sellPrice ?? 0;
            const unitPrice = item.priceOverride ?? basePrice;
            const qty = item.quantity ?? 1;
            calc += item.totalPrice ?? (unitPrice * qty);
          });
        }
        if (o.deliveryFee && o.deliveryFeeEnabled !== false) calc += o.deliveryFee;
        if (o.bedMaking && o.bedMakingFee) calc += o.bedMakingFee;
        ownerOrdersTot += o.totalPriceOverride ?? calc;
      });
      const ownerRaw = ownerCleaningsTot + ownerOrdersTot;
      paymentsOverridesAdjustment += (override.overrideTotal || 0) - ownerRaw;
    });

    const paymentsTotal = paymentsCleaningsRevenue + paymentsOrdersRevenue + paymentsOverridesAdjustment;

    // ═══════════════════════════════════════════════════════
    // 9. ATTRIBUZIONE CAUSE
    // ═══════════════════════════════════════════════════════
    const reportCleaningIds = new Set(reportCleanings.map((c: any) => c.id));
    const paymentsCleaningIds = new Set(paymentsCleanings.map((c: any) => c.id));
    const reportOrderIds = new Set(reportOrders.map((o: any) => o.id));
    const paymentsOrderIds = new Set(paymentsOrders.map((o: any) => o.id));

    const cleaningsInBoth = paymentsCleanings.filter((c: any) => reportCleaningIds.has(c.id));
    const cleaningsOnlyInPayments = paymentsCleanings.filter((c: any) => !reportCleaningIds.has(c.id));
    const cleaningsOnlyInReport = reportCleanings.filter((c: any) => !paymentsCleaningIds.has(c.id));
    const ordersInBoth = paymentsOrders.filter((o: any) => reportOrderIds.has(o.id));
    const ordersOnlyInPayments = paymentsOrders.filter((o: any) => !reportOrderIds.has(o.id));
    const ordersOnlyInReport = reportOrders.filter((o: any) => !paymentsOrderIds.has(o.id));

    let causeA_holidayFee = 0;
    let causeB_priceOverride = 0;
    let causeC_propertyCleaningPrice = 0;
    const detailA: any[] = [];
    const detailB: any[] = [];
    const detailC: any[] = [];

    cleaningsInBoth.forEach((c: any) => {
      const hFee = c.holidayFee ?? 0;
      if (hFee !== 0) {
        causeA_holidayFee += hFee;
        if (detail) detailA.push({ id: c.id, propertyId: c.propertyId, holidayFee: hFee });
      }
      if (c.priceOverride !== undefined && c.priceOverride !== null) {
        const diff = c.priceOverride - (c.price || 0);
        causeB_priceOverride += diff;
        if (detail) detailB.push({ id: c.id, propertyId: c.propertyId, price: c.price, priceOverride: c.priceOverride, diff });
      }
      const prop = paymentsPropertiesById.get(c.propertyId);
      if ((c.price === undefined || c.price === null || c.price === 0) && prop && prop.cleaningPrice > 0) {
        causeC_propertyCleaningPrice += prop.cleaningPrice;
        if (detail) detailC.push({ id: c.id, propertyId: c.propertyId, propCleaningPrice: prop.cleaningPrice });
      }
    });

    let causeD_bedMakingFee = 0;
    let causeE_itemPriceOverride = 0;
    let causeF_totalPriceOverride = 0;
    let causeG_deliveryFeeDisabled = 0;
    const detailD: any[] = [];
    const detailE: any[] = [];
    const detailF: any[] = [];
    const detailG: any[] = [];

    ordersInBoth.forEach((o: any) => {
      const bmf = (o.bedMaking && o.bedMakingFee) ? o.bedMakingFee : 0;
      if (bmf > 0 && (o.totalPriceOverride === undefined || o.totalPriceOverride === null)) {
        causeD_bedMakingFee += bmf;
        if (detail) detailD.push({ id: o.id, propertyId: o.propertyId, bedMakingFee: bmf });
      }
      if (Array.isArray(o.items) && (o.totalPriceOverride === undefined || o.totalPriceOverride === null)) {
        o.items.forEach((item: any) => {
          if (item.priceOverride !== undefined && item.priceOverride !== null) {
            const itemKey = item.itemId || item.id;
            const inv = paymentsInvMap.get(itemKey);
            const basePrice = item.unitPrice ?? item.price ?? inv?.sellPrice ?? 0;
            const diff = (item.priceOverride - basePrice) * (item.quantity || 1);
            causeE_itemPriceOverride += diff;
            if (detail) detailE.push({ orderId: o.id, itemKey, basePrice, priceOverride: item.priceOverride, qty: item.quantity, diff });
          }
        });
      }
      if (o.totalPriceOverride !== undefined && o.totalPriceOverride !== null) {
        let statsCalc = 0;
        if (Array.isArray(o.items)) {
          o.items.forEach((item: any) => {
            statsCalc += (reportInvMap.get(item.id) || 0) * (item.quantity || 0);
          });
        }
        statsCalc += o.deliveryFee || 0;
        const diff = o.totalPriceOverride - statsCalc;
        causeF_totalPriceOverride += diff;
        if (detail) detailF.push({ id: o.id, totalPriceOverride: o.totalPriceOverride, statsCalc, diff });
      }
      if (o.deliveryFee && o.deliveryFeeEnabled === false) {
        causeG_deliveryFeeDisabled -= o.deliveryFee;
        if (detail) detailG.push({ id: o.id, deliveryFee: o.deliveryFee });
      }
    });

    let causeH_pendingLinkedToCompleted = 0;
    let causeI_propertyNotActive = 0;
    let causeJ_extraInPagamenti = 0;
    let causeK_otherSoloReport = 0;

    ordersOnlyInPayments.forEach((o: any) => {
      let calc = 0;
      if (Array.isArray(o.items)) {
        o.items.forEach((item: any) => {
          const itemKey = item.itemId || item.id;
          const inv = paymentsInvMap.get(itemKey);
          const basePrice = item.unitPrice ?? item.price ?? inv?.sellPrice ?? 0;
          const unitPrice = item.priceOverride ?? basePrice;
          const qty = item.quantity ?? 1;
          calc += item.totalPrice ?? (unitPrice * qty);
        });
      }
      if (o.deliveryFee && o.deliveryFeeEnabled !== false) calc += o.deliveryFee;
      if (o.bedMaking && o.bedMakingFee) calc += o.bedMakingFee;
      causeH_pendingLinkedToCompleted += o.totalPriceOverride ?? calc;
    });

    cleaningsOnlyInReport.forEach((c: any) => {
      const prop = allProperties.find(p => p.id === c.propertyId);
      if (prop && prop.status !== "ACTIVE") causeI_propertyNotActive += c.price || 0;
      else causeK_otherSoloReport += c.price || 0;
    });
    ordersOnlyInReport.forEach((o: any) => {
      const prop = allProperties.find(p => p.id === o.propertyId);
      let orderTot = 0;
      if (Array.isArray(o.items)) o.items.forEach((it: any) => { orderTot += (reportInvMap.get(it.id) || 0) * (it.quantity || 0); });
      orderTot += o.deliveryFee || 0;
      if (prop && prop.status !== "ACTIVE") causeI_propertyNotActive += orderTot;
      else causeK_otherSoloReport += orderTot;
    });
    cleaningsOnlyInPayments.forEach((c: any) => {
      const prop = paymentsPropertiesById.get(c.propertyId);
      const basePrice = c.price ?? prop?.cleaningPrice ?? 0;
      const hFee = c.holidayFee ?? 0;
      causeJ_extraInPagamenti += (c.priceOverride ?? basePrice) + hFee;
    });

    const sumCauses =
      causeA_holidayFee + causeB_priceOverride + causeC_propertyCleaningPrice +
      causeD_bedMakingFee + causeE_itemPriceOverride + causeF_totalPriceOverride +
      causeG_deliveryFeeDisabled + causeH_pendingLinkedToCompleted +
      causeJ_extraInPagamenti - causeI_propertyNotActive - causeK_otherSoloReport +
      paymentsOverridesAdjustment;

    const actualDiff = paymentsTotal - reportTotal;
    const reconciliationGap = actualDiff - sumCauses;
    const elapsedMs = Date.now() - t0;

    return NextResponse.json({
      ok: true,
      _version: SCRIPT_VERSION,
      params: { month, year, monthMode, detail },
      summary: {
        elapsedMs,
        totals: {
          report: round2(reportTotal),
          pagamenti: round2(paymentsTotal),
          difference: round2(actualDiff),
        },
        counts: {
          cleanings: {
            inReport: reportCleanings.length,
            inPagamenti: paymentsCleanings.length,
            inBoth: cleaningsInBoth.length,
            onlyInReport: cleaningsOnlyInReport.length,
            onlyInPagamenti: cleaningsOnlyInPayments.length,
          },
          orders: {
            inReport: reportOrders.length,
            inPagamenti: paymentsOrders.length,
            inBoth: ordersInBoth.length,
            onlyInReport: ordersOnlyInReport.length,
            onlyInPagamenti: ordersOnlyInPayments.length,
          },
        },
        reportBreakdown: {
          cleaningsRevenue: round2(reportCleaningsRevenue),
          ordersRevenue: round2(reportOrdersRevenue),
          deliveryFees: round2(reportDeliveryFees),
        },
        pagamentiBreakdown: {
          cleaningsTotal: round2(paymentsCleaningsRevenue),
          ordersTotal: round2(paymentsOrdersRevenue),
          overridesAdjustment: round2(paymentsOverridesAdjustment),
        },
      },
      causesEur: {
        A_holidayFee: round2(causeA_holidayFee),
        B_cleaningPriceOverride: round2(causeB_priceOverride),
        C_propertyCleaningPriceFallback: round2(causeC_propertyCleaningPrice),
        D_bedMakingFee: round2(causeD_bedMakingFee),
        E_itemPriceOverride: round2(causeE_itemPriceOverride),
        F_totalPriceOverride: round2(causeF_totalPriceOverride),
        G_deliveryFeeDisabled: round2(causeG_deliveryFeeDisabled),
        H_pendingLinkedToCompleted: round2(causeH_pendingLinkedToCompleted),
        I_nonActiveProperties: round2(-causeI_propertyNotActive),
        J_extraInPagamenti: round2(causeJ_extraInPagamenti),
        K_otherSoloReport: round2(-causeK_otherSoloReport),
        paymentOverridesAdmin: round2(paymentsOverridesAdjustment),
      },
      causesExplained: {
        A_holidayFee: "Festività: Pagamenti somma, Statistiche no",
        B_cleaningPriceOverride: "Sconto admin sul prezzo pulizia",
        C_propertyCleaningPriceFallback: "Pulizia senza c.price ma con cleaningPrice nel doc property",
        D_bedMakingFee: "Preparazione letti: Pagamenti somma, Statistiche no",
        E_itemPriceOverride: "Sconto su item",
        F_totalPriceOverride: "Sconto su totale ordine",
        G_deliveryFeeDisabled: "Ordine con deliveryFeeEnabled=false: Statistiche somma comunque",
        H_pendingLinkedToCompleted: "Ordini PENDING legati a pulizia COMPLETED del mese",
        I_nonActiveProperties: "Pulizie/ordini di proprietà non ACTIVE",
        J_extraInPagamenti: "Pulizie viste solo da Pagamenti per altri motivi",
        K_otherSoloReport: "Servizi visti solo da Statistiche per altri motivi",
        paymentOverridesAdmin: "Override admin sul totale mensile",
      },
      reconciliation: {
        sumOfCausesEur: round2(sumCauses),
        actualDifferenceEur: round2(actualDiff),
        gapEur: round2(reconciliationGap),
        gapNote: Math.abs(reconciliationGap) < 0.5
          ? "Riconciliazione perfetta"
          : `Gap di ${round2(reconciliationGap)}€ non attribuito`,
      },
      ...(detail ? { details: { A: detailA, B: detailB, C: detailC, D: detailD, E: detailE, F: detailF, G: detailG } } : {}),
    });
  } catch (err: any) {
    console.error("[payments-vs-report-audit] errore:", err);
    return NextResponse.json({
      ok: false,
      _version: SCRIPT_VERSION,
      error: err?.message || "Errore interno",
      stack: err?.stack,
    }, { status: 500 });
  }
}
