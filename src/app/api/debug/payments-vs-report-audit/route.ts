/**
 * GET /api/debug/payments-vs-report-audit
 *
 * SCRIPT DI CONFRONTO CHIRURGICO tra:
 *   - Pagina /dashboard/pagamenti (tutti i clienti)
 *     → usa formula `computeMonthDebt` (debtCalculator.ts)
 *
 *   - Pagina /dashboard/report (banner blu "INCASSO")
 *     → usa formula `heroBanner` in ReportContent.tsx
 *
 * Per un mese specifico calcola entrambi i totali sui DATI IDENTICI E REALI
 * di Firestore, e attribuisce ogni centesimo di differenza a una causa precisa.
 *
 * 8 cause analizzate:
 *   PULIZIE
 *   A) holidayFee non sommato dalla pagina Statistiche
 *   B) priceOverride pulizia ignorato dalla pagina Statistiche
 *   C) fallback su property.cleaningPrice mancante in Statistiche
 *
 *   ORDINI
 *   D) bedMakingFee non sommato dalla pagina Statistiche
 *   E) priceOverride per item ignorato in Statistiche
 *   F) totalPriceOverride dell'ordine ignorato in Statistiche
 *   G) deliveryFeeEnabled ignorato (Statistiche somma sempre)
 *
 *   FILTRI
 *   H) Ordini PENDING-linked-COMPLETED esclusi da Statistiche
 *   I) Pulizie scartate da Pagamenti per mancanza di cleaningPrice nel doc property
 *
 * Auth: ADMIN
 *
 * Query params:
 *   month = mese (REQUIRED, 1-12)
 *   year  = anno (REQUIRED, es. 2026)
 *   detail = "true" → include lista item-per-item delle differenze
 *
 * Output: JSON con summary aggregato + breakdown per causa + (opzionale) lista item.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import { buildInventoryMap, type DebtCalcInventoryItem } from "~/lib/payments/debtCalculator";

export const dynamic = "force-dynamic";

// ════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════

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

// ════════════════════════════════════════════════════════════════
// HANDLER
// ════════════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  try {
    // ─── AUTH ────────────────────────────────────────
    const user = await getApiUser();
    if (!user || user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const monthParam = req.nextUrl.searchParams.get("month");
    const yearParam = req.nextUrl.searchParams.get("year");
    const detail = req.nextUrl.searchParams.get("detail") === "true";

    if (!monthParam || !yearParam) {
      return NextResponse.json({
        error: "Parametri month e year obbligatori (es. ?month=4&year=2026)",
      }, { status: 400 });
    }

    const month = parseInt(monthParam, 10);
    const year = parseInt(yearParam, 10);
    if (isNaN(month) || month < 1 || month > 12 || isNaN(year)) {
      return NextResponse.json({ error: "month/year invalidi" }, { status: 400 });
    }

    const t0 = Date.now();

    // ═══════════════════════════════════════════════════════
    // 1. CARICA DATI — esattamente come fanno le 2 pagine
    // ═══════════════════════════════════════════════════════

    const monthStart = new Date(year, month - 1, 1, 0, 0, 0);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
    const startTs = Timestamp.fromDate(monthStart);
    const endTs = Timestamp.fromDate(monthEnd);

    // 1a. PROPRIETÀ — Statistiche carica TUTTE, Pagamenti solo ACTIVE
    // Carico TUTTE per poter simulare entrambe le logiche
    const propsSnap = await adminDb.collection("properties").get();
    const allProperties = propsSnap.docs.map(d => ({
      id: d.id,
      ownerId: d.data().ownerId as string,
      cleaningPrice: (d.data().cleaningPrice as number) || 0,
      status: d.data().status as string,
      name: d.data().name as string,
    }));

    // 1b. INVENTORY
    const invSnap = await adminDb.collection("inventory").get();
    // Map per Statistiche (semplice: id → sellPrice, e key → sellPrice)
    const reportInvMap = new Map<string, number>();
    invSnap.docs.forEach(d => {
      const data = d.data();
      reportInvMap.set(d.id, (data.sellPrice as number) || 0);
      if (data.key) reportInvMap.set(data.key as string, (data.sellPrice as number) || 0);
    });
    // Map per Pagamenti (con alias item_X → X come fa debtCalculator)
    const paymentsInvMap = buildInventoryMap(
      invSnap.docs.map(d => ({ id: d.id, data: d.data() }))
    );

    // 1c. CLEANINGS — carico tutte le pulizie nel mese
    const cleaningsSnap = await adminDb.collection("cleanings")
      .where("scheduledDate", ">=", startTs)
      .where("scheduledDate", "<=", endTs)
      .get();

    // Aggiungo anche pulizie con completedAt nel mese ma scheduledDate fuori
    // (caso raro ma possibile)
    const completedSnap = await adminDb.collection("cleanings")
      .where("status", "==", "COMPLETED")
      .where("completedAt", ">=", startTs)
      .where("completedAt", "<=", endTs)
      .get();

    const cleaningsById = new Map<string, any>();
    [...cleaningsSnap.docs, ...completedSnap.docs].forEach(d => {
      if (cleaningsById.has(d.id)) return;
      cleaningsById.set(d.id, { id: d.id, ...(d.data() as any) });
    });
    const allCleanings = Array.from(cleaningsById.values());

    // 1d. ORDERS — carico tutti gli ordini nel mese
    const ordersSnap = await adminDb.collection("orders")
      .where("scheduledDate", ">=", startTs)
      .where("scheduledDate", "<=", endTs)
      .get();
    // Aggiungo anche ordini con deliveredAt nel mese
    const deliveredSnap = await adminDb.collection("orders")
      .where("status", "==", "DELIVERED")
      .where("deliveredAt", ">=", startTs)
      .where("deliveredAt", "<=", endTs)
      .get();

    const ordersById = new Map<string, any>();
    [...ordersSnap.docs, ...deliveredSnap.docs].forEach(d => {
      if (ordersById.has(d.id)) return;
      ordersById.set(d.id, { id: d.id, ...(d.data() as any) });
    });
    const allOrders = Array.from(ordersById.values());

    // 1e. OVERRIDES — solo per logica Pagamenti
    const overridesSnap = await adminDb.collection("paymentOverrides")
      .where("month", "==", month)
      .where("year", "==", year)
      .get();
    const overrideByOwner = new Map<string, any>();
    overridesSnap.docs.forEach(d => {
      const o = d.data();
      overrideByOwner.set(o.proprietarioId, o);
    });

    // ═══════════════════════════════════════════════════════
    // 2. DETERMINA il "modo" del mese (passato/corrente/futuro)
    // ═══════════════════════════════════════════════════════
    const today = new Date();
    const todayMonthStart = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0);
    const isCurrent = monthStart.getTime() === todayMonthStart.getTime();
    const isPast = monthStart.getTime() < todayMonthStart.getTime();
    const monthMode = isPast ? "PAST" : isCurrent ? "CURRENT" : "FUTURE";

    // ═══════════════════════════════════════════════════════
    // 3. CALCOLO STATISTICHE (heroBanner di ReportContent.tsx)
    //    Replica fedele della logica esistente
    // ═══════════════════════════════════════════════════════

    // Pulizie del mese — STESSA logica di heroBanner
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

    // Ordini del mese — STESSA logica di heroBanner
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
    reportCleanings.forEach((c: any) => {
      reportCleaningsRevenue += c.price || 0;
    });
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
    // 4. CALCOLO PAGAMENTI (computeMonthDebt aggregato per tutti)
    //    Stessa logica della pagina /pagamenti per ogni proprietario
    // ═══════════════════════════════════════════════════════

    // Solo proprietà ACTIVE per Pagamenti
    const paymentsActiveProps = allProperties.filter(p => p.status === "ACTIVE");
    const activePropertyIds = new Set(paymentsActiveProps.map(p => p.id));
    const paymentsPropertiesById = new Map(paymentsActiveProps.map(p => [p.id, p]));

    // Pulizie con la logica di computeMonthDebt
    // (filtro: COMPLETED + scheduledDate nel mese + propertyId in ACTIVE)
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

    // Ordini con la logica di computeMonthDebt
    // (filtro: DELIVERED || cleaningId-linked-to-COMPLETED + propertyId in ACTIVE
    //  + data deliveredAt → scheduledDate (no createdAt fallback))
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
      if (o.deliveryFee && o.deliveryFeeEnabled !== false) {
        calc += o.deliveryFee;
      }
      if (o.bedMaking && o.bedMakingFee) {
        calc += o.bedMakingFee;
      }
      paymentsOrdersRevenue += o.totalPriceOverride ?? calc;
    });

    // Override admin — Pagamenti li applica
    let paymentsOverridesAdjustment = 0;
    overrideByOwner.forEach((override, ownerId) => {
      // Calcola il rawCalc del proprietario per sottrarlo e sostituirlo
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
            const basePrice = item.unitPrice ?? item.price ?? inv?.sellPrice ?? inv?.price ?? 0;
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
      // Pagamenti rimpiazza ownerRaw con override.overrideTotal
      paymentsOverridesAdjustment += (override.overrideTotal || 0) - ownerRaw;
    });

    const paymentsTotal = paymentsCleaningsRevenue + paymentsOrdersRevenue + paymentsOverridesAdjustment;

    // ═══════════════════════════════════════════════════════
    // 5. ATTRIBUZIONE CAUSA-PER-CAUSA della differenza
    // ═══════════════════════════════════════════════════════

    // Prendiamo gli ID che ENTRAMBE includono per analizzare differenze prezzo
    const reportCleaningIds = new Set(reportCleanings.map((c: any) => c.id));
    const paymentsCleaningIds = new Set(paymentsCleanings.map((c: any) => c.id));
    const reportOrderIds = new Set(reportOrders.map((o: any) => o.id));
    const paymentsOrderIds = new Set(paymentsOrders.map((o: any) => o.id));

    // Pulizie in entrambi
    const cleaningsInBoth = paymentsCleanings.filter((c: any) => reportCleaningIds.has(c.id));
    // Pulizie solo in pagamenti (non in report)
    const cleaningsOnlyInPayments = paymentsCleanings.filter((c: any) => !reportCleaningIds.has(c.id));
    // Pulizie solo in report (non in pagamenti)
    const cleaningsOnlyInReport = reportCleanings.filter((c: any) => !paymentsCleaningIds.has(c.id));

    const ordersInBoth = paymentsOrders.filter((o: any) => reportOrderIds.has(o.id));
    const ordersOnlyInPayments = paymentsOrders.filter((o: any) => !reportOrderIds.has(o.id));
    const ordersOnlyInReport = reportOrders.filter((o: any) => !paymentsOrderIds.has(o.id));

    // Cause sulle pulizie in BOTH
    let causeA_holidayFee = 0;        // somma holidayFee non visto da Statistiche
    let causeB_priceOverride = 0;     // somma priceOverride - price (pagamenti applica, statistiche no)
    let causeC_propertyCleaningPrice = 0; // pulizie senza c.price ma con prop.cleaningPrice (pagamenti vede, statistiche perde)
    const detailA: any[] = [];
    const detailB: any[] = [];
    const detailC: any[] = [];

    cleaningsInBoth.forEach((c: any) => {
      // (A) holidayFee
      const hFee = c.holidayFee ?? 0;
      if (hFee !== 0) {
        causeA_holidayFee += hFee;
        if (detail) detailA.push({ id: c.id, propertyId: c.propertyId, holidayFee: hFee });
      }
      // (B) priceOverride
      const prop = paymentsPropertiesById.get(c.propertyId);
      const basePrice = c.price ?? prop?.cleaningPrice ?? 0;
      if (c.priceOverride !== undefined && c.priceOverride !== null) {
        const diff = c.priceOverride - (c.price || 0);
        // Statistiche somma c.price; Pagamenti somma priceOverride
        // Differenza che Pagamenti aggiunge rispetto a Statistiche: priceOverride - c.price
        causeB_priceOverride += diff;
        if (detail) detailB.push({ id: c.id, propertyId: c.propertyId, price: c.price, priceOverride: c.priceOverride, diff });
      }
      // (C) c.price mancante ma cleaningPrice nella property: solo Pagamenti lo recupera
      if ((c.price === undefined || c.price === null || c.price === 0) && prop && prop.cleaningPrice > 0) {
        const recovered = prop.cleaningPrice;
        causeC_propertyCleaningPrice += recovered;
        if (detail) detailC.push({ id: c.id, propertyId: c.propertyId, propCleaningPrice: prop.cleaningPrice });
      }
    });

    // Cause sugli ordini in BOTH
    let causeD_bedMakingFee = 0;
    let causeE_itemPriceOverride = 0;
    let causeF_totalPriceOverride = 0;
    let causeG_deliveryFeeDisabled = 0;
    const detailD: any[] = [];
    const detailE: any[] = [];
    const detailF: any[] = [];
    const detailG: any[] = [];

    ordersInBoth.forEach((o: any) => {
      // (D) bedMakingFee
      const bmf = (o.bedMaking && o.bedMakingFee) ? o.bedMakingFee : 0;
      if (bmf > 0) {
        // Solo se non c'è totalPriceOverride: con override il prezzo è fissato
        if (o.totalPriceOverride === undefined || o.totalPriceOverride === null) {
          causeD_bedMakingFee += bmf;
          if (detail) detailD.push({ id: o.id, propertyId: o.propertyId, bedMakingFee: bmf });
        }
      }
      // (E) priceOverride per item
      if (Array.isArray(o.items) && (o.totalPriceOverride === undefined || o.totalPriceOverride === null)) {
        o.items.forEach((item: any) => {
          if (item.priceOverride !== undefined && item.priceOverride !== null) {
            const itemKey = item.itemId || item.id;
            const inv = paymentsInvMap.get(itemKey);
            const basePrice = item.unitPrice ?? item.price ?? inv?.sellPrice ?? 0;
            // Statistiche fa: invMap.get(item.id) * quantity = basePrice * qty
            // Pagamenti fa: priceOverride * qty
            const diff = (item.priceOverride - basePrice) * (item.quantity || 1);
            causeE_itemPriceOverride += diff;
            if (detail) detailE.push({ orderId: o.id, itemKey, basePrice, priceOverride: item.priceOverride, qty: item.quantity, diff });
          }
        });
      }
      // (F) totalPriceOverride
      if (o.totalPriceOverride !== undefined && o.totalPriceOverride !== null) {
        // Statistiche calcola items + deliveryFee separatamente
        // Pagamenti rimpiazza tutto con totalPriceOverride
        let statsCalc = 0;
        if (Array.isArray(o.items)) {
          o.items.forEach((item: any) => {
            statsCalc += (reportInvMap.get(item.id) || 0) * (item.quantity || 0);
          });
        }
        statsCalc += o.deliveryFee || 0;
        // Differenza: pagamenti - statistiche per questo ordine
        const diff = o.totalPriceOverride - statsCalc;
        causeF_totalPriceOverride += diff;
        if (detail) detailF.push({ id: o.id, totalPriceOverride: o.totalPriceOverride, statsCalc, diff });
      }
      // (G) deliveryFee disabilitato
      if (o.deliveryFee && o.deliveryFeeEnabled === false) {
        // Statistiche somma comunque; Pagamenti no
        causeG_deliveryFeeDisabled -= o.deliveryFee; // Pagamenti perde queste rispetto a Statistiche
        if (detail) detailG.push({ id: o.id, deliveryFee: o.deliveryFee });
      }
    });

    // Cause "filtro": pulizie/ordini presenti solo da una parte
    let causeH_pendingLinkedToCompleted = 0; // ordini PENDING-linked, solo in Pagamenti
    let causeI_propertyNotActive = 0;        // pulizie/ordini di proprietà NON ACTIVE: Statistiche le include, Pagamenti no
    let causeJ_priceOverrideOnSoloPagamenti = 0;
    let causeK_otherSoloReport = 0;

    ordersOnlyInPayments.forEach((o: any) => {
      // Calcolo prezzo come fa pagamenti
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
      const eff = o.totalPriceOverride ?? calc;
      causeH_pendingLinkedToCompleted += eff;
    });

    // Pulizie/ordini di proprietà NON ACTIVE — Statistiche le include, Pagamenti no
    cleaningsOnlyInReport.forEach((c: any) => {
      const prop = allProperties.find(p => p.id === c.propertyId);
      if (prop && prop.status !== "ACTIVE") {
        causeI_propertyNotActive += c.price || 0;
      } else {
        causeK_otherSoloReport += c.price || 0;
      }
    });
    ordersOnlyInReport.forEach((o: any) => {
      const prop = allProperties.find(p => p.id === o.propertyId);
      const orderTot = (() => {
        let t = 0;
        if (Array.isArray(o.items)) o.items.forEach((it: any) => { t += (reportInvMap.get(it.id) || 0) * (it.quantity || 0); });
        t += o.deliveryFee || 0;
        return t;
      })();
      if (prop && prop.status !== "ACTIVE") {
        causeI_propertyNotActive += orderTot;
      } else {
        causeK_otherSoloReport += orderTot;
      }
    });
    cleaningsOnlyInPayments.forEach((c: any) => {
      const prop = paymentsPropertiesById.get(c.propertyId);
      const basePrice = c.price ?? prop?.cleaningPrice ?? 0;
      const hFee = c.holidayFee ?? 0;
      causeJ_priceOverrideOnSoloPagamenti += (c.priceOverride ?? basePrice) + hFee;
    });

    // ═══════════════════════════════════════════════════════
    // 6. RICONCILIAZIONE
    // ═══════════════════════════════════════════════════════
    // Verifico che le cause spieghino l'intera differenza
    const sumCauses =
      causeA_holidayFee +
      causeB_priceOverride +
      causeC_propertyCleaningPrice +
      causeD_bedMakingFee +
      causeE_itemPriceOverride +
      causeF_totalPriceOverride +
      causeG_deliveryFeeDisabled +
      causeH_pendingLinkedToCompleted +
      causeJ_priceOverrideOnSoloPagamenti -
      causeI_propertyNotActive -
      causeK_otherSoloReport +
      paymentsOverridesAdjustment;

    const actualDiff = paymentsTotal - reportTotal;
    const reconciliationGap = actualDiff - sumCauses;

    const elapsedMs = Date.now() - t0;

    return NextResponse.json({
      ok: true,
      params: { month, year, monthMode, detail },
      summary: {
        elapsedMs,
        // Totali calcolati
        totals: {
          report: round2(reportTotal),
          pagamenti: round2(paymentsTotal),
          difference: round2(actualDiff),
          reportDescription: "Pagina /dashboard/report banner blu (heroBanner)",
          pagamentiDescription: "Pagina /dashboard/pagamenti totale (computeMonthDebt aggregato)",
        },
        // Conteggi servizi
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
        // Sub-totali Statistiche
        reportBreakdown: {
          cleaningsRevenue: round2(reportCleaningsRevenue),
          ordersRevenue: round2(reportOrdersRevenue),
          deliveryFees: round2(reportDeliveryFees),
        },
        // Sub-totali Pagamenti
        pagamentiBreakdown: {
          cleaningsTotal: round2(paymentsCleaningsRevenue),
          ordersTotal: round2(paymentsOrdersRevenue),
          overridesAdjustment: round2(paymentsOverridesAdjustment),
        },
      },
      // ═══════════════════════════════════════════════════════
      // ATTRIBUZIONE CAUSE — segno + = Pagamenti vede di più di Statistiche
      // ═══════════════════════════════════════════════════════
      causesEur: {
        A_holidayFee: round2(causeA_holidayFee),
        B_cleaningPriceOverride: round2(causeB_priceOverride),
        C_propertyCleaningPriceFallback: round2(causeC_propertyCleaningPrice),
        D_bedMakingFee: round2(causeD_bedMakingFee),
        E_itemPriceOverride: round2(causeE_itemPriceOverride),
        F_totalPriceOverride: round2(causeF_totalPriceOverride),
        G_deliveryFeeDisabled_lostByPagamenti: round2(causeG_deliveryFeeDisabled),
        H_pendingLinkedToCompleted_onlyInPagamenti: round2(causeH_pendingLinkedToCompleted),
        I_nonActiveProperties_onlyInReport: round2(-causeI_propertyNotActive),
        J_extraInPagamenti: round2(causeJ_priceOverrideOnSoloPagamenti),
        K_otherSoloReport: round2(-causeK_otherSoloReport),
        paymentOverridesAdmin: round2(paymentsOverridesAdjustment),
      },
      causesExplained: {
        A_holidayFee: "Festività (es. Pasqua, 25 aprile): Pagamenti li somma, Statistiche no",
        B_cleaningPriceOverride: "Sconto admin sul prezzo pulizia: Pagamenti applica, Statistiche usa price originale",
        C_propertyCleaningPriceFallback: "Pulizia senza c.price ma con cleaningPrice nel doc property: Pagamenti recupera, Statistiche perde",
        D_bedMakingFee: "Preparazione letti: Pagamenti somma, Statistiche no",
        E_itemPriceOverride: "Sconto admin sul singolo articolo biancheria: Pagamenti applica, Statistiche usa prezzo standard inventory",
        F_totalPriceOverride: "Sconto admin sull'intero ordine: Pagamenti rimpiazza tutto, Statistiche somma item+delivery",
        G_deliveryFeeDisabled_lostByPagamenti: "Ordine con deliveryFee MA deliveryFeeEnabled=false: Statistiche somma comunque, Pagamenti no",
        H_pendingLinkedToCompleted_onlyInPagamenti: "Ordini PENDING ma legati a pulizia COMPLETED del mese: Pagamenti li include come fatturabili, Statistiche solo DELIVERED",
        I_nonActiveProperties_onlyInReport: "Pulizie/ordini di proprietà non ACTIVE (archived/disabled): Statistiche include tutto, Pagamenti solo ACTIVE",
        J_extraInPagamenti: "Pulizie che Pagamenti vede e Statistiche no per altri motivi (es. completedAt vs scheduledDate)",
        K_otherSoloReport: "Servizi che Statistiche vede e Pagamenti no per altri motivi residui",
        paymentOverridesAdmin: "Override admin sul totale mensile del proprietario: solo Pagamenti applica",
      },
      reconciliation: {
        sumOfCausesEur: round2(sumCauses),
        actualDifferenceEur: round2(actualDiff),
        gapEur: round2(reconciliationGap),
        gapNote: Math.abs(reconciliationGap) < 0.5
          ? "Riconciliazione perfetta: tutta la differenza è spiegata dalle cause sopra"
          : `Gap di ${round2(reconciliationGap)}€ non attribuito — ricontrollare le formule`,
      },
      ...(detail ? {
        details: {
          A: detailA,
          B: detailB,
          C: detailC,
          D: detailD,
          E: detailE,
          F: detailF,
          G: detailG,
        },
      } : {}),
    });
  } catch (err: any) {
    console.error("[payments-vs-report-audit] errore:", err);
    return NextResponse.json({
      ok: false,
      error: err?.message || "Errore interno",
      stack: err?.stack,
    }, { status: 500 });
  }
}
