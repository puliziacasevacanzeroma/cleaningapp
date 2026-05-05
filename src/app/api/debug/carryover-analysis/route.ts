/**
 * ════════════════════════════════════════════════════════════════════
 * DEBUG: Analisi dettagliata acconti carryover
 * ════════════════════════════════════════════════════════════════════
 *
 * GET /api/debug/carryover-analysis?cronSecret=XXX
 *
 * Per ciascun proprietario con un acconto carryover > 0:
 *  - Mostra ESATTAMENTE da quale mese arriva il presunto eccesso
 *  - Confronta i dati raw (somma cleanings + orders) con eventuali override
 *  - Confronta con i pagamenti
 *  - Indica se è un eccesso REALE o un BUG
 *
 * Output: JSON con dettaglio mese per mese.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  const urlSecret = searchParams.get("cronSecret");
  if (cronSecret && urlSecret !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  // Mese di riferimento (default = mese corrente)
  const now = new Date();
  const refMonth = parseInt(searchParams.get("month") || String(now.getMonth() + 1));
  const refYear = parseInt(searchParams.get("year") || String(now.getFullYear()));
  const ownerFilter = searchParams.get("ownerId"); // opzionale: filtra un solo owner
  const nameFilter = searchParams.get("name");      // opzionale: filtra per nome (case insensitive)

  try {
    // ═══════════════════════════════════════════════════════════════
    // 1. CARICA TUTTI I DATI
    // ═══════════════════════════════════════════════════════════════
    const [usersSnap, propsSnap, cleaningsSnap, ordersSnap, paymentsSnap, overridesSnap, inventorySnap] = await Promise.all([
      adminDb.collection("users")
        .where("role", "in", ["PROPRIETARIO", "CLIENTE", "OWNER"])
        .get(),
      adminDb.collection("properties").get(),
      adminDb.collection("cleanings").where("status", "==", "COMPLETED").get(),
      adminDb.collection("orders").get(),
      adminDb.collection("payments").get(),
      adminDb.collection("paymentOverrides").get(),
      adminDb.collection("inventory").get(),
    ]);

    // Indice inventario (con tutti gli alias di ID usati nel codebase)
    const inventoryById = new Map<string, number>();
    inventorySnap.docs.forEach(d => {
      const data = d.data() as any;
      const sellPrice = data.sellPrice ?? data.price ?? 0;
      inventoryById.set(d.id, sellPrice);
      if (data.key) inventoryById.set(data.key, sellPrice);
      if (d.id.startsWith("item_")) inventoryById.set(d.id.replace("item_", ""), sellPrice);
    });

    // Indici
    const ownersById = new Map<string, any>();
    usersSnap.docs.forEach(d => {
      ownersById.set(d.id, { id: d.id, ...(d.data() as any) });
    });

    const propsById = new Map<string, any>();
    const propIdsByOwner = new Map<string, string[]>();
    propsSnap.docs.forEach(d => {
      const pd = d.data() as any;
      propsById.set(d.id, { id: d.id, ...pd });
      const oid = pd.ownerId || "unknown";
      if (!propIdsByOwner.has(oid)) propIdsByOwner.set(oid, []);
      propIdsByOwner.get(oid)!.push(d.id);
    });

    // ═══════════════════════════════════════════════════════════════
    // 2. RAGGRUPPA EVERYTHING PER (ownerId, year-month)
    // ═══════════════════════════════════════════════════════════════
    type MonthBucket = {
      year: number;
      month: number;
      monthKey: string;
      // Dati raw (prima dell'override)
      cleaningsCount: number;
      cleaningsTotal: number;
      ordersCount: number;
      ordersTotal: number;
      rawTotal: number;
      // Override (se presente)
      overrideTotal: number | null;
      overrideReason: string | null;
      // Pagamenti
      paymentsTotal: number;
      paymentsCount: number;
      paymentsCreditTransferTotal: number;
      paymentsCreditTransferCount: number;
      paymentsRealTotal: number; // = paymentsTotal - paymentsCreditTransferTotal
      // Calcolo finale
      effectiveServices: number; // = override ?? raw
      saldo: number; // = effective - paymentsReal
    };

    // Mappa: ownerId -> monthKey -> bucket
    const dataByOwner = new Map<string, Map<string, MonthBucket>>();

    const ensureBucket = (ownerId: string, year: number, month: number): MonthBucket => {
      if (!dataByOwner.has(ownerId)) dataByOwner.set(ownerId, new Map());
      const inner = dataByOwner.get(ownerId)!;
      const key = `${year}-${String(month).padStart(2, "0")}`;
      if (!inner.has(key)) {
        inner.set(key, {
          year, month, monthKey: key,
          cleaningsCount: 0, cleaningsTotal: 0,
          ordersCount: 0, ordersTotal: 0,
          rawTotal: 0,
          overrideTotal: null, overrideReason: null,
          paymentsTotal: 0, paymentsCount: 0,
          paymentsCreditTransferTotal: 0, paymentsCreditTransferCount: 0,
          paymentsRealTotal: 0,
          effectiveServices: 0,
          saldo: 0,
        });
      }
      return inner.get(key)!;
    };

    // Processa cleanings
    cleaningsSnap.docs.forEach(d => {
      const c = d.data() as any;
      if (c.excludedFromBilling === true) return;
      const date = c.scheduledDate?.toDate?.();
      if (!date) return;
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const propId = c.propertyId;
      const prop = propsById.get(propId);
      if (!prop) return;
      const ownerId = prop.ownerId;
      if (!ownerId) return;

      const basePrice = c.price ?? prop.cleaningPrice ?? 0;
      const holidayFee = c.holidayFee ?? 0;
      const eff = (c.priceOverride ?? basePrice) + holidayFee;

      const bucket = ensureBucket(ownerId, year, month);
      bucket.cleaningsCount += 1;
      bucket.cleaningsTotal += eff;
    });

    // Processa orders
    ordersSnap.docs.forEach(d => {
      const o = d.data() as any;
      if (o.status === "CANCELLED") return;
      if (o.excludedFromBilling === true) return;

      const refDate = o.deliveredAt?.toDate?.() || o.scheduledDate?.toDate?.();
      if (!refDate) return;
      const year = refDate.getFullYear();
      const month = refDate.getMonth() + 1;
      const propId = o.propertyId;
      const prop = propsById.get(propId);
      if (!prop) return;
      const ownerId = prop.ownerId;
      if (!ownerId) return;

      let orderPrice = 0;
      if (o.totalPriceOverride !== undefined && o.totalPriceOverride !== null) {
        orderPrice = o.totalPriceOverride;
      } else {
        if (Array.isArray(o.items)) {
          for (const item of o.items) {
            // ⚠️ Stessa logica del front-end (processOrder in useRealtimePayments)
            const itemKey = item.itemId || item.id;
            const invSellPrice = itemKey ? inventoryById.get(itemKey) : undefined;
            const basePrice = item.unitPrice ?? item.price ?? invSellPrice ?? 0;
            const unitPrice = item.priceOverride ?? basePrice;
            const quantity = item.quantity ?? 1;
            const itemTotal = item.totalPrice ?? (unitPrice * quantity);
            orderPrice += itemTotal;
          }
        }
        if (o.deliveryFee && o.deliveryFeeEnabled !== false) orderPrice += o.deliveryFee;
        if (o.bedMaking && o.bedMakingFee) orderPrice += o.bedMakingFee;
      }

      const bucket = ensureBucket(ownerId, year, month);
      bucket.ordersCount += 1;
      bucket.ordersTotal += orderPrice;
    });

    // Processa overrides
    overridesSnap.docs.forEach(d => {
      const ov = d.data() as any;
      if (typeof ov.month !== "number" || typeof ov.year !== "number") return;
      if (typeof ov.overrideTotal !== "number") return;
      const ownerId = ov.proprietarioId;
      if (!ownerId) return;
      const bucket = ensureBucket(ownerId, ov.year, ov.month);
      bucket.overrideTotal = ov.overrideTotal;
      bucket.overrideReason = ov.reason || null;
    });

    // Processa payments
    paymentsSnap.docs.forEach(d => {
      const p = d.data() as any;
      if (typeof p.month !== "number" || typeof p.year !== "number") return;
      const ownerId = p.proprietarioId;
      if (!ownerId) return;
      const amount = p.amount || 0;
      const bucket = ensureBucket(ownerId, p.year, p.month);
      bucket.paymentsCount += 1;
      bucket.paymentsTotal += amount;
      if (p.isCreditTransfer === true) {
        bucket.paymentsCreditTransferCount += 1;
        bucket.paymentsCreditTransferTotal += amount;
      }
    });

    // ═══════════════════════════════════════════════════════════════
    // 3. CALCOLA EFFECTIVE/SALDO E ANALIZZA CARRYOVER
    // ═══════════════════════════════════════════════════════════════
    const isBefore = (m: number, y: number): boolean => {
      if (y < refYear) return true;
      if (y > refYear) return false;
      return m < refMonth;
    };

    const reports: any[] = [];

    dataByOwner.forEach((monthMap, ownerId) => {
      const owner = ownersById.get(ownerId);
      if (!owner) return;
      const ownerName = owner.name || owner.fullName || owner.displayName || "Sconosciuto";

      // Filtri opzionali
      if (ownerFilter && ownerId !== ownerFilter) return;
      if (nameFilter && !ownerName.toLowerCase().includes(nameFilter.toLowerCase())) return;

      // Calcola effective e saldo per ogni mese
      monthMap.forEach((bucket, _key) => {
        bucket.rawTotal = bucket.cleaningsTotal + bucket.ordersTotal;
        bucket.paymentsRealTotal = bucket.paymentsTotal - bucket.paymentsCreditTransferTotal;
        bucket.effectiveServices = bucket.overrideTotal !== null ? bucket.overrideTotal : bucket.rawTotal;
        bucket.saldo = bucket.effectiveServices - bucket.paymentsRealTotal;
      });

      // Filtra solo mesi precedenti al riferimento
      const priorMonths = Array.from(monthMap.values())
        .filter(b => isBefore(b.month, b.year))
        .sort((a, b) => {
          if (a.year !== b.year) return a.year - b.year;
          return a.month - b.month;
        });

      // Carryover: calcolo running credit dai mesi precedenti
      let runningCredit = 0;
      const monthsWithIssues: any[] = [];
      const allMonthsDetail: any[] = [];

      for (const b of priorMonths) {
        // Salta mesi senza alcuna attività
        if (b.rawTotal === 0 && b.paymentsRealTotal === 0 && b.overrideTotal === null) continue;

        let creditChange = 0;
        let consumedFromCredit = 0;
        if (b.saldo < -0.01) {
          creditChange = -b.saldo; // accumulo eccesso
          runningCredit += creditChange;
        } else if (b.saldo > 0.01 && runningCredit > 0) {
          consumedFromCredit = Math.min(b.saldo, runningCredit);
          runningCredit -= consumedFromCredit;
        }

        // Detect issue: pagato in eccesso ma per via di un mismatch raw vs override
        const isOverpaymentWithOverride = (
          b.saldo < -0.01 &&
          b.overrideTotal !== null &&
          Math.abs(b.rawTotal - b.paymentsRealTotal) < 0.5 // raw quasi = pagamenti, ma override + alto
        );

        const isFalseCredit = (
          b.saldo < -0.01 &&
          b.overrideTotal !== null &&
          b.overrideTotal > b.rawTotal &&
          Math.abs(b.paymentsRealTotal - b.overrideTotal) < 0.5
        );

        const detail = {
          monthKey: b.monthKey,
          year: b.year,
          month: b.month,
          cleaningsCount: b.cleaningsCount,
          cleaningsTotal: round(b.cleaningsTotal),
          ordersCount: b.ordersCount,
          ordersTotal: round(b.ordersTotal),
          rawTotal: round(b.rawTotal),
          overrideTotal: b.overrideTotal !== null ? round(b.overrideTotal) : null,
          overrideReason: b.overrideReason,
          effectiveServices: round(b.effectiveServices),
          paymentsCount: b.paymentsCount,
          paymentsTotal: round(b.paymentsTotal),
          paymentsCreditTransferCount: b.paymentsCreditTransferCount,
          paymentsCreditTransferTotal: round(b.paymentsCreditTransferTotal),
          paymentsRealTotal: round(b.paymentsRealTotal),
          saldo: round(b.saldo),
          // Indicatori
          creditAccumulated: round(creditChange),
          consumedFromCredit: round(consumedFromCredit),
          runningCreditAfter: round(runningCredit),
          // FLAG di problemi
          flagFalseCredit: isFalseCredit,
          flagSuspiciousOverride: isOverpaymentWithOverride && !isFalseCredit,
        };
        allMonthsDetail.push(detail);

        if (b.saldo < -0.01) {
          monthsWithIssues.push(detail);
        }
      }

      // Solo se c'è del credito accumulato OR mesi con eccesso → è interessante per il report
      if (runningCredit > 0.01 || monthsWithIssues.length > 0) {
        reports.push({
          ownerId,
          ownerName,
          email: owner.email,
          finalCarryoverCredit: round(runningCredit),
          monthsWithExcess: monthsWithIssues,
          allPriorMonths: allMonthsDetail,
        });
      }
    });

    // Ordina per importo decrescente di credit
    reports.sort((a, b) => b.finalCarryoverCredit - a.finalCarryoverCredit);

    // ═══════════════════════════════════════════════════════════════
    // 4. RISPOSTA
    // ═══════════════════════════════════════════════════════════════
    const summary = {
      refMonth,
      refYear,
      totalOwnersWithCarryover: reports.length,
      sumCarryoverCredit: round(reports.reduce((s, r) => s + r.finalCarryoverCredit, 0)),
      ownersWithFalseCreditCount: reports.filter(r =>
        r.allPriorMonths.some((m: any) => m.flagFalseCredit)
      ).length,
    };

    return NextResponse.json({
      success: true,
      summary,
      reports,
      _help: {
        flagFalseCredit: "saldo<0 + override>raw + pagato≈override → pagato = override, ma il calcolo carryover senza override penserebbe ci sia eccesso. Questo è il BUG noto.",
        flagSuspiciousOverride: "saldo<0 + override presente, raw≈pagato → potrebbe esserci un override che non è stato applicato correttamente",
      },
    });
  } catch (error: any) {
    console.error("Errore carryover-analysis:", error);
    return NextResponse.json({
      error: "Errore server",
      message: error.message,
      stack: error.stack?.split("\n").slice(0, 5).join("\n"),
    }, { status: 500 });
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
