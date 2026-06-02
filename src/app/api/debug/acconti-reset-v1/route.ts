/**
 * ════════════════════════════════════════════════════════════════════
 * AZZERA ACCONTI — congela i mesi-sorgente al valore incassato
 * ════════════════════════════════════════════════════════════════════
 *
 * POST /api/debug/acconti-reset-v1
 * body JSON: { cronSecret, dryRun?: boolean, ownerId?: string, refMonth, refYear }
 *
 * Gli acconti del carryover NON sono documenti cancellabili: sono il
 * risultato di (pagamento > servizi) in mesi passati. Per azzerarli senza
 * distruggere pagamenti reali, questo endpoint trova i MESI-SORGENTE
 * dell'eccesso e ci scrive un paymentOverride = totale pagato di quel mese.
 * Effetto: saldo di quel mese = 0 → il carryover non riporta più credito.
 *
 * SICUREZZA:
 *   - dryRun:true (DEFAULT) → mostra SOLO cosa farebbe, NON scrive nulla.
 *   - dryRun:false → esegue (scrive gli override). Reversibile: basta
 *     cancellare l'override del mese (azione reset_override esistente).
 *
 * NB: congela al "totalePagato", così quel mese risulta esattamente saldato.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { MONTHS_IT } from "~/lib/payments/debtManager";
import {
  computeMonthDebt,
  computeOwnerCreditFromPriorMonths,
  buildInventoryMap,
  type DebtCalcProperty,
  type DebtCalcCleaning,
  type DebtCalcOrder,
  type DebtCalcPayment,
  type DebtCalcOverride,
} from "~/lib/payments/debtCalculator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const round = (n: number) => Math.round(n * 100) / 100;

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  let body: any = {};
  try { body = await request.json(); } catch { /* vuoto */ }
  // Accetta il secret dal body OPPURE dalla query (?cronSecret=...), così
  // funziona anche se CMD/curl di Windows rompe le virgolette del body JSON.
  const { searchParams } = new URL(request.url);
  const providedSecret = body.cronSecret || searchParams.get("cronSecret");
  if (cronSecret && providedSecret !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  // I parametri possono arrivare da body o da query (fallback robusto)
  const qp = (k: string) => searchParams.get(k);

  const dryRun = (body.dryRun ?? qp("dryRun")) === false || (body.dryRun ?? qp("dryRun")) === "false" ? false : true; // DEFAULT true: non scrive
  const ownerFilter = body.ownerId || qp("ownerId") || null;
  const now = new Date();
  const refMonth = parseInt(body.refMonth || qp("refMonth") || String(now.getMonth() + 1));
  const refYear = parseInt(body.refYear || qp("refYear") || String(now.getFullYear()));
  const monthsBack = parseInt(body.monthsBack || qp("monthsBack") || "24");

  try {
    const [propsSnap, cleaningsSnap, ordersSnap, paymentsSnap, overridesSnap, inventorySnap] =
      await Promise.all([
        adminDb.collection("properties").where("status", "==", "ACTIVE").get(),
        adminDb.collection("cleanings").get(),
        adminDb.collection("orders").get(),
        adminDb.collection("payments").get(),
        adminDb.collection("paymentOverrides").get(),
        adminDb.collection("inventory").get(),
      ]);

    const inventoryById = buildInventoryMap(inventorySnap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, any> })));

    const propsByOwner = new Map<string, DebtCalcProperty[]>();
    const ownerName = new Map<string, string>();
    propsSnap.docs.forEach((d) => {
      const p = d.data() as any;
      if (!p.ownerId) return;
      if (!propsByOwner.has(p.ownerId)) propsByOwner.set(p.ownerId, []);
      propsByOwner.get(p.ownerId)!.push({ id: d.id, cleaningPrice: p.cleaningPrice || 0 });
      if (!ownerName.has(p.ownerId)) ownerName.set(p.ownerId, p.ownerName || p.ownerId);
    });

    const cleanings: DebtCalcCleaning[] = cleaningsSnap.docs.map((d) => {
      const c = d.data() as any;
      return { id: d.id, propertyId: c.propertyId, status: c.status, scheduledDate: c.scheduledDate, price: c.price, priceOverride: c.priceOverride, holidayFee: c.holidayFee, excludedFromBilling: c.excludedFromBilling };
    });
    const orders: DebtCalcOrder[] = ordersSnap.docs.map((d) => {
      const o = d.data() as any;
      return { id: d.id, propertyId: o.propertyId, status: o.status, cleaningId: o.cleaningId, scheduledDate: o.scheduledDate, deliveredAt: o.deliveredAt, createdAt: o.createdAt, items: o.items, totalPriceOverride: o.totalPriceOverride, deliveryFee: o.deliveryFee, deliveryFeeEnabled: o.deliveryFeeEnabled, bedMaking: o.bedMaking, bedMakingFee: o.bedMakingFee, excludedFromBilling: o.excludedFromBilling };
    });
    const payments: DebtCalcPayment[] = paymentsSnap.docs
      .map((d) => d.data() as any)
      .filter((p) => typeof p.month === "number" && typeof p.year === "number")
      .map((p) => ({ proprietarioId: p.proprietarioId, month: p.month, year: p.year, amount: p.amount || 0, method: p.method, isCreditTransfer: p.isCreditTransfer === true }));

    const overridesByOwner = new Map<string, Map<string, DebtCalcOverride>>();
    const existingOverrideDocId = new Map<string, string>(); // ownerId-YYYY-MM → docId
    overridesSnap.docs.forEach((d) => {
      const o = d.data() as any;
      if (typeof o.month !== "number" || typeof o.year !== "number" || typeof o.overrideTotal !== "number" || !o.proprietarioId) return;
      const key = `${o.year}-${String(o.month).padStart(2, "0")}`;
      if (!overridesByOwner.has(o.proprietarioId)) overridesByOwner.set(o.proprietarioId, new Map());
      overridesByOwner.get(o.proprietarioId)!.set(key, { proprietarioId: o.proprietarioId, month: o.month, year: o.year, overrideTotal: o.overrideTotal, reason: o.reason });
      existingOverrideDocId.set(`${o.proprietarioId}-${key}`, d.id);
    });

    const azioni: any[] = [];

    for (const [ownerId, ownerProps] of propsByOwner) {
      if (ownerFilter && ownerId !== ownerFilter) continue;
      const nm = ownerName.get(ownerId) || ownerId;
      const propertiesById = new Map<string, DebtCalcProperty>(ownerProps.map((p) => [p.id, p]));
      const ownerPayments = payments.filter((p) => p.proprietarioId === ownerId);
      const overridesByMonth = overridesByOwner.get(ownerId);

      const carryover = computeOwnerCreditFromPriorMonths({ month: refMonth, year: refYear, propertiesById, cleanings, orders, payments: ownerPayments, inventoryById, overridesByMonth, monthsBack });
      if (carryover <= 0.01) continue;

      // trova i mesi-sorgente (saldo < 0) e congelali al totalePagato
      for (let i = monthsBack; i >= 1; i--) {
        const ref = new Date(refYear, refMonth - 1 - i, 1);
        const m = ref.getMonth() + 1, y = ref.getFullYear();
        const monthKey = `${y}-${String(m).padStart(2, "0")}`;
        const calc = computeMonthDebt({ month: m, year: y, propertiesById, cleanings, orders, payments: ownerPayments, inventoryById, override: overridesByMonth?.get(monthKey) });
        if (!calc || calc.saldo >= -0.01) continue;

        const nuovoTotale = round(calc.totalePagato); // congela = saldo 0
        const azione = {
          ownerId, ownerName: nm, mese: `${MONTHS_IT[m - 1]} ${y}`, month: m, year: y,
          totaleServiziAttuale: round(calc.totaleServizi),
          totalePagato: round(calc.totalePagato),
          eccessoAzzerato: round(-calc.saldo),
          overrideScritto: nuovoTotale,
          giaEsistente: !!overridesByMonth?.get(monthKey),
          eseguito: false,
        };

        if (!dryRun) {
          const docKey = `${ownerId}-${monthKey}`;
          const existingId = existingOverrideDocId.get(docKey);
          const payload = {
            proprietarioId: ownerId, month: m, year: y,
            originalTotal: round(calc.totaleServizi),
            overrideTotal: nuovoTotale,
            reason: "Azzeramento acconto: totale congelato al pagato (reset una-tantum)",
            updatedAt: Timestamp.now(),
          };
          if (existingId) {
            await adminDb.collection("paymentOverrides").doc(existingId).update(payload);
          } else {
            await adminDb.collection("paymentOverrides").add({ ...payload, createdAt: Timestamp.now() });
          }
          azione.eseguito = true;
        }
        azioni.push(azione);
      }
    }

    const totEccesso = round(azioni.reduce((s, a) => s + a.eccessoAzzerato, 0));

    return NextResponse.json({
      success: true,
      modalita: dryRun ? "DRY-RUN (nessuna modifica scritta)" : "ESEGUITO (override scritti)",
      ref: { month: refMonth, year: refYear, label: `${MONTHS_IT[refMonth - 1]} ${refYear}` },
      riepilogo: {
        mesiCongelati: azioni.length,
        eccessoTotaleAzzerato: totEccesso,
      },
      azioni,
      istruzioni: dryRun
        ? "Questo è solo un'anteprima. Per ESEGUIRE davvero, rilancia con dryRun:false nel body. Per limitare a un solo proprietario aggiungi ownerId."
        : "Override scritti. Gli acconti spariranno al prossimo ricalcolo. Reversibile: cancella l'override del mese (azione reset_override) per riaprirlo.",
    });
  } catch (error: any) {
    console.error("acconti-reset-v1 error:", error);
    return NextResponse.json({ error: "Errore server", message: error?.message, stack: error?.stack?.split("\n").slice(0, 6).join("\n") }, { status: 500 });
  }
}
