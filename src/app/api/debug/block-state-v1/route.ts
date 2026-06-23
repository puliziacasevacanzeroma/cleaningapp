import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { isCleaningProductItem } from "~/lib/payments/debtCalculator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/debug/block-state-v1?secret=CRON_SECRET
 *
 * READ-ONLY. Nessuna scrittura. Replica ESATTA della logica del cron
 * check-payment-blocks PATCHATO (totalPriceOverride ?? calculatedTotal ??
 * ricalcolo-items, e skip excludedFromBilling su pulizie e ordini), ma invece
 * di bloccare/sbloccare stampa, per OGNI account con paymentBlock.active===true:
 *   - lo stato reale di paymentBlock (active / overriddenByAdmin / since)
 *   - la classificazione che farebbe il cron (skip / valutato)
 *   - il saldo ricalcolato mese per mese (logica nuova)
 *   - hasOverdueDebt finale e quale mese lo scatena
 *
 * Serve a capire perché il cron riporta unblocked:0 nonostante i banner rossi.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  const urlSecret = searchParams.get("secret");
  if (cronSecret && urlSecret !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const SCADENZA_GIORNO = 10;
    const rangeStart = new Date(currentYear - 2, currentMonth - 1, 1);

    const [usersSnap, propsSnap, paymentsSnap, inventorySnap, cleaningsSnap, ordersSnap, overridesSnap] =
      await Promise.all([
        adminDb.collection("users").where("role", "in", ["PROPRIETARIO", "CLIENTE", "OWNER"]).where("status", "==", "ACTIVE").get(),
        adminDb.collection("properties").where("status", "==", "ACTIVE").get(),
        adminDb.collection("payments").get(),
        adminDb.collection("inventory").get(),
        adminDb.collection("cleanings").where("status", "==", "COMPLETED").where("scheduledDate", ">=", Timestamp.fromDate(rangeStart)).get(),
        adminDb.collection("orders").where("scheduledDate", ">=", Timestamp.fromDate(rangeStart)).get(),
        adminDb.collection("paymentOverrides").get(),
      ]);

    const propsByOwner = new Map<string, string[]>();
    const propCleaningPrice = new Map<string, number>();
    propsSnap.docs.forEach(doc => {
      const data = doc.data();
      const ownerId = data.ownerId;
      if (!ownerId) return;
      if (!propsByOwner.has(ownerId)) propsByOwner.set(ownerId, []);
      propsByOwner.get(ownerId)!.push(doc.id);
      if (data.cleaningPrice) propCleaningPrice.set(doc.id, data.cleaningPrice);
    });

    const paymentsByOwner = new Map<string, { month: number; year: number; amount: number; isCreditTransfer?: boolean }[]>();
    paymentsSnap.docs.forEach(doc => {
      const data = doc.data();
      const ownerId = data.proprietarioId;
      if (!ownerId) return;
      if (!paymentsByOwner.has(ownerId)) paymentsByOwner.set(ownerId, []);
      paymentsByOwner.get(ownerId)!.push({ month: data.month, year: data.year, amount: data.amount || 0, isCreditTransfer: data.isCreditTransfer === true });
    });

    const inventoryById = new Map<string, number>();
    inventorySnap.docs.forEach(doc => {
      const data = doc.data() as any;
      const sellPrice = data.sellPrice ?? data.price ?? 0;
      inventoryById.set(doc.id, sellPrice);
      if (data.key) inventoryById.set(data.key, sellPrice);
      if (doc.id.startsWith("item_")) inventoryById.set(doc.id.replace("item_", ""), sellPrice);
    });

    // ── Pulizie pre-aggregate (logica PATCHATA: skip excludedFromBilling) ──
    const cleaningsByPropMonth = new Map<string, number>();
    const completedCleaningIds = new Set<string>();
    cleaningsSnap.docs.forEach(doc => {
      const data = doc.data();
      if (data.excludedFromBilling === true) return;
      completedCleaningIds.add(doc.id);
      const propId = data.propertyId;
      const date = data.scheduledDate?.toDate?.();
      if (!propId || !date) return;
      const m = date.getMonth() + 1;
      const y = date.getFullYear();
      const key = `${propId}|${y}-${m}`;
      const price = (data.priceOverride ?? data.price ?? propCleaningPrice.get(propId) ?? 0) + (data.holidayFee ?? 0);
      cleaningsByPropMonth.set(key, (cleaningsByPropMonth.get(key) || 0) + price);
    });

    // ── Ordini pre-aggregati (logica PATCHATA: calculatedTotal + skip excluded) ──
    const ordersByPropMonth = new Map<string, number>();
    ordersSnap.docs.forEach(doc => {
      const data = doc.data();
      if (data.status === "CANCELLED") return;
      if (data.excludedFromBilling === true) return;
      const isDelivered = data.status === "DELIVERED";
      const isLinkedToCompleted = data.cleaningId && completedCleaningIds.has(data.cleaningId);
      if (!isDelivered && !isLinkedToCompleted) return;
      const propId = data.propertyId;
      const date = data.deliveredAt?.toDate?.() || data.scheduledDate?.toDate?.();
      if (!propId || !date) return;

      let total = 0;
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item: any) => {
          if (isCleaningProductItem(item)) return;
          const itemKey = item.itemId || item.id;
          const invSellPrice = itemKey ? inventoryById.get(itemKey) : undefined;
          const unitPrice = item.priceOverride ?? (item.unitPrice || undefined) ?? (item.price || undefined) ?? invSellPrice ?? 0;
          total += (item.totalPrice || undefined) ?? (unitPrice * (item.quantity || 1));
        });
      }
      if (data.deliveryFee && data.deliveryFeeEnabled !== false) total += data.deliveryFee;
      if (data.bedMaking && data.bedMakingFee) total += data.bedMakingFee;
      const storedTotal = typeof data.calculatedTotal === "number" ? data.calculatedTotal : undefined;
      total = data.totalPriceOverride ?? storedTotal ?? total;

      const m = date.getMonth() + 1;
      const y = date.getFullYear();
      const key = `${propId}|${y}-${m}`;
      ordersByPropMonth.set(key, (ordersByPropMonth.get(key) || 0) + total);
    });

    const overridesByOwner = new Map<string, Map<string, number>>();
    overridesSnap.docs.forEach(doc => {
      const data = doc.data();
      const ownerId = data.proprietarioId;
      if (!ownerId) return;
      if (!overridesByOwner.has(ownerId)) overridesByOwner.set(ownerId, new Map());
      overridesByOwner.get(ownerId)!.set(`${data.month}-${data.year}`, data.overrideTotal);
    });

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const report: any[] = [];

    for (const userDoc of usersSnap.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      const existingBlock = userData.paymentBlock;

      // Solo account attualmente bloccati (banner rosso = active===true)
      if (existingBlock?.active !== true) continue;

      const classification =
        userData.paymentExempt === true ? "SKIP_paymentExempt(sblocca)"
        : existingBlock?.overriddenByAdmin === true ? "SKIP_overriddenByAdmin(NON tocca)"
        : "VALUTATO";

      const propIds = propsByOwner.get(userId) || [];
      const ownerPayments = paymentsByOwner.get(userId) || [];
      const ownerOv = overridesByOwner.get(userId);

      const calcSaldoMese = (m: number, y: number): { totSer: number; totPag: number; saldo: number; hasOv: boolean } | null => {
        let totSer = 0;
        for (const propId of propIds) {
          const monthKey = `${propId}|${y}-${m}`;
          totSer += cleaningsByPropMonth.get(monthKey) || 0;
          totSer += ordersByPropMonth.get(monthKey) || 0;
        }
        if (totSer === 0) return null;
        const ovKey = `${m}-${y}`;
        let hasOv = false;
        if (ownerOv?.has(ovKey)) { totSer = ownerOv.get(ovKey)!; hasOv = true; }
        const totPag = ownerPayments.filter(p => p.month === m && p.year === y && p.isCreditTransfer !== true).reduce((s, p) => s + p.amount, 0);
        return { totSer: round2(totSer), totPag: round2(totPag), saldo: round2(totSer - totPag), hasOv };
      };

      type MS = { m: number; y: number; r: ReturnType<typeof calcSaldoMese> };
      const monthlySaldi: MS[] = [];
      for (let i = 24; i >= 0; i--) {
        let m = currentMonth - i, y = currentYear;
        while (m <= 0) { m += 12; y--; }
        monthlySaldi.push({ m, y, r: calcSaldoMese(m, y) });
      }

      const creditBeforeMonth = new Map<string, number>();
      let running = 0;
      for (let idx = 0; idx < monthlySaldi.length - 1; idx++) {
        const ms = monthlySaldi[idx]!;
        creditBeforeMonth.set(`${ms.y}-${ms.m}`, running);
        if (!ms.r) continue;
        if (ms.r.saldo < 0) running += -ms.r.saldo;
        else if (ms.r.saldo > 0 && running > 0) running -= Math.min(ms.r.saldo, running);
      }

      let hasOverdueDebt = false;
      let overdueMonth: string | null = null;
      let overdueDetail: any = null;
      for (let i = 1; i <= 24; i++) {
        const idx = monthlySaldi.length - 1 - i;
        if (idx < 0) break;
        const ms = monthlySaldi[idx]!;
        let scadMonth = ms.m + 1, scadYear = ms.y;
        if (scadMonth > 12) { scadMonth = 1; scadYear++; }
        const scadenza = new Date(scadYear, scadMonth - 1, SCADENZA_GIORNO - 1, 23, 59, 59);
        if (now <= scadenza) continue;
        if (!ms.r) continue;
        if (ms.r.saldo <= 0.01) continue;
        const creditoDisp = creditBeforeMonth.get(`${ms.y}-${ms.m}`) || 0;
        const saldoNetto = round2(ms.r.saldo - creditoDisp);
        if (saldoNetto > 0.01) {
          hasOverdueDebt = true;
          overdueMonth = `${ms.m}/${ms.y}`;
          overdueDetail = { ...ms.r, creditoDisp: round2(creditoDisp), saldoNetto };
          break;
        }
      }

      const cronWouldDo =
        classification.startsWith("SKIP") ? classification
        : hasOverdueDebt ? "RESTA BLOCCATO (debito scaduto residuo)"
        : "SBLOCCA (nessun debito scaduto)";

      report.push({
        name: userData.name || userData.displayName || userData.email || userId,
        userId,
        paymentBlock: { active: existingBlock?.active === true, overriddenByAdmin: existingBlock?.overriddenByAdmin === true, since: existingBlock?.since?.toDate?.()?.toISOString?.() || null, reason: existingBlock?.reason || null },
        paymentExempt: userData.paymentExempt === true,
        classification,
        hasOverdueDebt,
        overdueMonth,
        overdueDetail,
        cronWouldDo,
        mesiConAttivita: monthlySaldi.filter(ms => ms.r).map(ms => ({ mese: `${ms.m}/${ms.y}`, ...ms.r })),
      });
    }

    return NextResponse.json({
      success: true,
      now: now.toISOString(),
      bloccatiTrovati: report.length,
      nota: "saldo>0.01 dopo il 9 del mese successivo = debito scaduto. cronWouldDo dice cosa farebbe il cron ORA.",
      report,
    }, { status: 200 });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Errore server", details: errMsg }, { status: 500 });
  }
}
