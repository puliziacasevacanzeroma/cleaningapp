/**
 * ════════════════════════════════════════════════════════════════════
 * DEBUG: Root-cause acconti v2 — ATTRIBUZIONE BASATA SUI FATTI
 * ════════════════════════════════════════════════════════════════════
 *
 * GET /api/debug/acconto-rootcause-v2?cronSecret=XXX&month=5&year=2026
 *
 * NON assume "è il cron". Per ogni proprietario con acconto risale al mese
 * sorgente e, per OGNI ordine/pulizia collegata, espone gli INDIZI reali su
 * cosa è successo, senza interpretazioni:
 *
 *   Per ordine:
 *     - status, statoPulizia, fatturabileOra
 *     - createdAt / updatedAt / deliveredAt / incassatoIl
 *     - modificatoDopoIncasso  (updatedAt > incasso)
 *     - creatoDopoIncasso      (createdAt > incasso) ← ordine NATO dopo l'incasso
 *     - guestsAppliedBySystem  (cron apply-default-guests ha messo gli ospiti)
 *     - guestsAppliedAt
 *     - autoConfirmedByCleaningCompletion
 *     - hasPickup / pickupItemsCount (il pickup gonfia il valore di un ordine)
 *     - source / origin / lastModifiedBy (se presenti)
 *     - itemsCount
 *
 * VERDETTO per mese (dedotto dai fatti, non assunto):
 *     - PULIZIA_MAI_COMPLETATA : esistono pulizie SCHEDULED con data passata
 *       il cui ordine quindi non è fatturato → il lavoro è stato fatto ma lo
 *       stato è rimasto indietro. (causa OPERATIVA, non software)
 *     - ORDINE_REGREDITO_DOPO_INCASSO : ordine fatturabile all'incasso, ora no,
 *       con updatedAt dopo l'incasso → qualcosa l'ha cambiato.
 *     - ORDINE_CREATO_DOPO_INCASSO : ordine con createdAt dopo l'incasso (un
 *       processo ha AGGIUNTO biancheria a quel mese dopo che avevi pagato).
 *     - PAGAMENTO_ARROTONDATO : niente di tutto ciò, pagato > servizi di pochi €.
 *
 * Aggregazione flotta: conta i verdetti e i campi-indizio, così "da dove
 * vengono" gli acconti emerge dai numeri.
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

    const cleaningMeta = new Map<string, any>();
    const cleanings: DebtCalcCleaning[] = cleaningsSnap.docs.map((d) => {
      const c = d.data() as any;
      cleaningMeta.set(d.id, { status: c.status, date: toDate(c.scheduledDate), updatedAt: toDate(c.updatedAt), createdAt: toDate(c.createdAt), guestsAppliedBySystem: c.guestsAppliedBySystem === true, guestsAppliedAt: toDate(c.guestsAppliedAt), linenConfigModified: c.linenConfigModified === true });
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
    const orderRawById = new Map(ordersRaw.map((o) => [o.id, o]));

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
    const clueTally: Record<string, number> = { guestsAppliedBySystem: 0, autoConfirmed: 0, hasPickupAdded: 0, createdAfterSettle: 0, updatedAfterSettle: 0, cleaningStillScheduled: 0 };

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

        const monthPays = paymentsRaw.filter((p) => p.proprietarioId === ownerId && Number(p.month) === m && Number(p.year) === y && p.isCreditTransfer !== true);
        const payDates = monthPays.map((p) => toDate(p.createdAt)).filter(Boolean) as Date[];
        const settledAt = payDates.length ? new Date(Math.max(...payDates.map((d) => d.getTime()))) : null;

        const completedIds = new Set<string>();
        for (const c of cleanings) {
          if (c.status === "COMPLETED" && c.excludedFromBilling !== true && ownerPropIds.has(c.propertyId) && inMonth(toDate(c.scheduledDate), m, y)) completedIds.add(c.id);
        }

        const righe: any[] = [];
        const pulizieSchedulatePassate: any[] = [];
        let valNonFatturatoPerStato = 0, valCreatoDopoIncasso = 0;

        // ordini del mese (per data o link a completed)
        for (const o of orders) {
          if (!ownerPropIds.has(o.propertyId)) continue;
          const od = toDate(o.deliveredAt) || toDate(o.scheduledDate);
          const isLinked = !!o.cleaningId && completedIds.has(o.cleaningId);
          if (!inMonth(od, m, y) && !isLinked) continue;

          const raw = orderRawById.get(o.id);
          const lc = o.cleaningId ? cleaningMeta.get(o.cleaningId) : undefined;
          const billableNow = o.status !== "CANCELLED" && o.excludedFromBilling !== true && (o.status === "DELIVERED" || isLinked) && inMonth(od, m, y);
          const createdAt = toDate(raw?.createdAt);
          const updatedAt = toDate(raw?.updatedAt);
          const createdAfter = !!(settledAt && createdAt && createdAt.getTime() > settledAt.getTime());
          const updatedAfter = !!(settledAt && updatedAt && updatedAt.getTime() > settledAt.getTime());
          const price = round(orderRawPrice(o, inventoryById));
          const pickupCount = Array.isArray(raw?.pickupItems) ? raw.pickupItems.length : 0;

          if (createdAfter) clueTally.createdAfterSettle++;
          if (updatedAfter) clueTally.updatedAfterSettle++;
          if (raw?.guestsAppliedBySystem === true) clueTally.guestsAppliedBySystem++;
          if (raw?.autoConfirmedByCleaningCompletion === true) clueTally.autoConfirmed++;
          if (pickupCount > 0) clueTally.hasPickupAdded++;

          // contributi alla riduzione
          if (createdAfter) valCreatoDopoIncasso += price;
          if (!billableNow && o.status !== "CANCELLED" && o.excludedFromBilling !== true) valNonFatturatoPerStato += price;

          // mostro solo righe interessanti
          if (!billableNow || createdAfter || updatedAfter) {
            righe.push({
              orderId: o.id, property: propName.get(o.propertyId) || o.propertyId,
              status: o.status, fatturabileOra: billableNow, prezzo: price,
              statoPulizia: lc ? lc.status : (o.cleaningId ? "INESISTENTE" : "NESSUN_LINK"),
              createdAt: iso(createdAt), updatedAt: iso(updatedAt), deliveredAt: iso(toDate(raw?.deliveredAt)),
              incassatoIl: iso(settledAt),
              creatoDopoIncasso: createdAfter, modificatoDopoIncasso: updatedAfter,
              guestsAppliedBySystem: raw?.guestsAppliedBySystem === true,
              guestsAppliedAt: iso(toDate(raw?.guestsAppliedAt)),
              autoConfirmed: raw?.autoConfirmedByCleaningCompletion === true,
              pickupItemsCount: pickupCount,
              itemsCount: Array.isArray(o.items) ? o.items.length : 0,
              source: raw?.source ?? null, origin: raw?.origin ?? null, lastModifiedBy: raw?.lastModifiedBy ?? null,
            });
          }
        }

        // pulizie SCHEDULED con data nel mese (lavoro previsto ma mai completato)
        for (const c of cleanings) {
          if (!ownerPropIds.has(c.propertyId)) continue;
          const cd = toDate(c.scheduledDate);
          if (!inMonth(cd, m, y)) continue;
          const meta = cleaningMeta.get(c.id);
          if (meta && ["SCHEDULED", "ASSIGNED", "IN_PROGRESS"].includes(meta.status)) {
            clueTally.cleaningStillScheduled++;
            pulizieSchedulatePassate.push({
              cleaningId: c.id, property: propName.get(c.propertyId) || c.propertyId,
              date: iso(cd), status: meta.status,
              guestsAppliedBySystem: meta.guestsAppliedBySystem,
              prezzoPulizia: round((c.priceOverride ?? c.price ?? propertiesById.get(c.propertyId)?.cleaningPrice ?? 0) + (c.holidayFee ?? 0)),
            });
          }
        }

        const excess = round(-calc.saldo);
        let verdict: string;
        if (round(valCreatoDopoIncasso) >= 0.5 && round(valCreatoDopoIncasso) >= excess * 0.5) verdict = "ORDINE_CREATO_DOPO_INCASSO";
        else if (pulizieSchedulatePassate.length > 0 && round(valNonFatturatoPerStato) >= excess * 0.5) verdict = "PULIZIA_MAI_COMPLETATA";
        else if (round(valNonFatturatoPerStato) >= excess * 0.5) verdict = "ORDINE_REGREDITO_DOPO_INCASSO";
        else verdict = "PAGAMENTO_ARROTONDATO";

        sourceMonths.push({
          label: `${MONTHS_IT[m - 1]} ${y}`, incassatoIl: iso(settledAt),
          pagamentoMese: round(calc.totalePagato), totaleServiziOra: round(calc.totaleServizi), excess,
          valoreNonFatturatoPerStato: round(valNonFatturatoPerStato),
          valoreCreatoDopoIncasso: round(valCreatoDopoIncasso),
          numPulizieSchedulatePassate: pulizieSchedulatePassate.length,
          verdict,
          pulizieSchedulatePassate,
          ordiniRilevanti: righe,
        });
      }

      const vs = sourceMonths.map((s) => s.verdict);
      let ov = vs[0] || "PAGAMENTO_ARROTONDATO";
      const priority = ["ORDINE_CREATO_DOPO_INCASSO", "PULIZIA_MAI_COMPLETATA", "ORDINE_REGREDITO_DOPO_INCASSO", "PAGAMENTO_ARROTONDATO"];
      for (const p of priority) { if (vs.includes(p)) { ov = p; break; } }
      verdictTally[ov] = (verdictTally[ov] || 0) + 1;

      reports.push({ ownerId, ownerName: nm, accontoMostrato: round(carryover), verdict: ov, mesiSorgente: sourceMonths });
    }

    reports.sort((a, b) => b.accontoMostrato - a.accontoMostrato);

    return NextResponse.json({
      success: true,
      ref: { month: refMonth, year: refYear, label: `${MONTHS_IT[refMonth - 1]} ${refYear}`, monthsBack },
      diagnosiFlotta: {
        proprietariConAcconto: reports.length,
        sommaAcconti: round(reports.reduce((s, r) => s + r.accontoMostrato, 0)),
        verdettiPerProprietario: verdictTally,
        indiziTotali: clueTally,
        comeLeggere: "Guarda 'verdettiPerProprietario' per la causa dominante e 'indiziTotali' per i meccanismi. Es: se 'cleaningStillScheduled' è alto → molte pulizie fatte ma rimaste SCHEDULED (problema operativo). Se 'createdAfterSettle' è alto → ordini aggiunti a mesi già pagati (processo che crea biancheria a posteriori).",
      },
      reports,
      _verdetti: {
        PULIZIA_MAI_COMPLETATA: "Pulizie SCHEDULED con data passata: il lavoro c'è stato ma lo stato è rimasto 'programmato', quindi il loro ordine non viene fatturato → il totale cala. Causa OPERATIVA (chiusura pulizie), non un bug software.",
        ORDINE_REGREDITO_DOPO_INCASSO: "Ordine fatturabile all'incasso, ora non più, modificato dopo l'incasso.",
        ORDINE_CREATO_DOPO_INCASSO: "Ordine NATO dopo l'incasso: un processo ha aggiunto biancheria a un mese già pagato.",
        PAGAMENTO_ARROTONDATO: "Nessun cambiamento rilevante: pagato più dei servizi di pochi euro (cifra tonda).",
      },
    });
  } catch (error: any) {
    console.error("acconto-rootcause-v2 error:", error);
    return NextResponse.json({ error: "Errore server", message: error?.message, stack: error?.stack?.split("\n").slice(0, 6).join("\n") }, { status: 500 });
  }
}
