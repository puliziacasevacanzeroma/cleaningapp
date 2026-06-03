/**
 * GET /api/debug/payment-records-dump-v1?email=<email>&month=2&year=2026
 *
 * Dump COMPLETO di:
 *   - tutti i record `payments` del proprietario per quel mese
 *   - tutti i record `paymentAudit` (scatola nera) per quel mese: cosa è stato
 *     cliccato, importo registrato, "da incassare" mostrato, già pagato, scarti
 *   - il calcolo del motore per quel mese (servizi, incassato, saldo)
 *
 * Serve a capire perché un clic su "Incassa Totale" ha portato a un
 * SOVRApagamento (es. febbraio incassato 12,40 in più del dovuto).
 *
 * Auth: ADMIN. Sola lettura.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import {
  computeMonthDebt,
  buildInventoryMap,
  type DebtCalcProperty,
  type DebtCalcCleaning,
  type DebtCalcOrder,
  type DebtCalcPayment,
  type DebtCalcOverride,
} from "~/lib/payments/debtCalculator";

export const dynamic = "force-dynamic";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const iso = (t: any) => { try { return t?.toDate?.()?.toISOString?.() ?? null; } catch { return null; } };

export async function GET(req: NextRequest) {
  try {
    const u = await getApiUser();
    if (!u || u.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const email = req.nextUrl.searchParams.get("email")?.toLowerCase().trim();
    const month = Number(req.nextUrl.searchParams.get("month"));
    const year = Number(req.nextUrl.searchParams.get("year"));
    if (!email || !month || !year) {
      return NextResponse.json({ error: "Parametri obbligatori: ?email=...&month=...&year=..." }, { status: 400 });
    }

    const usersSnap = await adminDb.collection("users").where("email", "==", email).limit(1).get();
    if (usersSnap.empty) return NextResponse.json({ error: `Nessun utente ${email}` }, { status: 404 });
    const userId = usersSnap.docs[0].id;

    // ─── PAYMENTS del mese ───
    const paySnap = await adminDb.collection("payments").where("proprietarioId", "==", userId).get();
    const allMonthPayments = paySnap.docs
      .map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }))
      .filter((p: any) => Number(p.month) === month && Number(p.year) === year);

    const pagamenti = allMonthPayments.map((p: any) => ({
      id: p.id,
      importo: p.amount,
      tipo: p.type,
      metodo: p.method,
      isCreditTransfer: p.isCreditTransfer === true,
      nota: p.note || null,
      creatoIl: iso(p.createdAt),
      creatoDa: p.createdBy || null,
    })).sort((a, b) => String(a.creatoIl).localeCompare(String(b.creatoIl)));

    const sommaTutti = r2(allMonthPayments.reduce((s: number, p: any) => s + (p.amount || 0), 0));
    const sommaSenzaCreditTransfer = r2(allMonthPayments
      .filter((p: any) => p.isCreditTransfer !== true)
      .reduce((s: number, p: any) => s + (p.amount || 0), 0));

    // ─── paymentAudit del mese (scatola nera del tasto Incassa) ───
    const auditSnap = await adminDb.collection("paymentAudit")
      .where("proprietarioId", "==", userId).get();
    const audit = auditSnap.docs
      .map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }))
      .filter((a: any) => Number(a.month) === month && Number(a.year) === year)
      .map((a: any) => ({
        quando: iso(a.timestamp),
        pulsante: a.pulsante,
        tipo: a.type,
        importoRegistrato: a.importoRegistrato,
        daIncassare_mostrato: a.totaleDaIncassare_mostratoDallaPagina,
        giaPagatoPrima: a.giaPagatoPrima,
        saldoDopo_motore: a.saldoDopoPagamento_motore,
        scarto_incassato_meno_mostrato: a.scarto_incassato_meno_mostrato,
        scarto_totaleMotore_meno_incassato: a.scarto_totaleMotore_meno_incassato,
        creatoDa: a.createdByName || a.createdBy,
        paymentId: a.paymentId,
      }))
      .sort((a, b) => String(a.quando).localeCompare(String(b.quando)));

    // ─── Calcolo motore per il mese ───
    const propsSnap = await adminDb.collection("properties")
      .where("ownerId", "==", userId).where("status", "==", "ACTIVE").get();
    const propertyIdsSet = new Set(propsSnap.docs.map(d => d.id));
    const propertiesById = new Map<string, DebtCalcProperty>();
    propsSnap.docs.forEach(d => propertiesById.set(d.id, { id: d.id, cleaningPrice: d.data().cleaningPrice || 0 }));

    const mStart = Timestamp.fromDate(new Date(year, month - 1, 1));
    const mEnd = Timestamp.fromDate(new Date(year, month, 0, 23, 59, 59, 999));

    const clSnap = await adminDb.collection("cleanings")
      .where("status", "==", "COMPLETED").where("scheduledDate", ">=", mStart).where("scheduledDate", "<=", mEnd).get();
    const cleanings: DebtCalcCleaning[] = [];
    clSnap.docs.forEach(doc => {
      const d = doc.data();
      if (!propertyIdsSet.has(d.propertyId)) return;
      cleanings.push({ id: doc.id, propertyId: d.propertyId, status: d.status, scheduledDate: d.scheduledDate, price: d.price, priceOverride: d.priceOverride, holidayFee: d.holidayFee, excludedFromBilling: d.excludedFromBilling });
    });

    const invSnap = await adminDb.collection("inventory").get();
    const inventoryById = buildInventoryMap(invSnap.docs.map(d => ({ id: d.id, data: d.data() })));

    const orSnap = await adminDb.collection("orders")
      .where("scheduledDate", ">=", mStart).where("scheduledDate", "<=", mEnd).get();
    const orders: DebtCalcOrder[] = [];
    orSnap.docs.forEach(doc => {
      const o = doc.data();
      if (!propertyIdsSet.has(o.propertyId)) return;
      orders.push({ id: doc.id, propertyId: o.propertyId, status: o.status, cleaningId: o.cleaningId, scheduledDate: o.scheduledDate, deliveredAt: o.deliveredAt, createdAt: o.createdAt, items: o.items, totalPriceOverride: o.totalPriceOverride, calculatedTotal: typeof o.calculatedTotal === "number" ? o.calculatedTotal : undefined, deliveryFee: o.deliveryFee, deliveryFeeEnabled: o.deliveryFeeEnabled, bedMaking: o.bedMaking, bedMakingFee: o.bedMakingFee, excludedFromBilling: o.excludedFromBilling });
    });

    const payments: DebtCalcPayment[] = allMonthPayments
      .filter((p: any) => typeof p.month === "number" && typeof p.year === "number")
      .map((p: any) => ({ proprietarioId: p.proprietarioId, month: p.month, year: p.year, amount: p.amount || 0, method: p.method, isCreditTransfer: p.isCreditTransfer === true }));

    const ovSnap = await adminDb.collection("paymentOverrides").where("proprietarioId", "==", userId).get();
    let override: DebtCalcOverride | undefined;
    ovSnap.docs.forEach(doc => {
      const o = doc.data();
      if (Number(o.month) === month && Number(o.year) === year) {
        override = { proprietarioId: o.proprietarioId, month: o.month, year: o.year, overrideTotal: o.overrideTotal || 0, reason: o.reason };
      }
    });

    const calc = computeMonthDebt({ month, year, propertiesById, cleanings, orders, payments, inventoryById, override });

    const totaleServizi = r2(calc?.totaleServizi ?? 0);
    const saldoMotore = r2(calc?.saldo ?? 0);

    return NextResponse.json({
      proprietario: { email, userId, mese: `${month}/${year}` },
      MOTORE: {
        totaleServizi,
        incassato_valido: sommaSenzaCreditTransfer,
        saldo: saldoMotore,
        stato: saldoMotore > 0.01 ? "DA PAGARE" : saldoMotore < -0.01 ? `SOVRApagato di ${r2(-saldoMotore)}` : "saldato esatto",
        override: override ?? null,
      },
      pagamenti_registrati: {
        quanti: pagamenti.length,
        somma_tutti: sommaTutti,
        somma_senza_creditTransfer: sommaSenzaCreditTransfer,
        dettaglio: pagamenti,
      },
      audit_tasto_incassa: {
        quanti: audit.length,
        dettaglio: audit,
        nota: "Cerca la riga con pulsante INCASSA_TOTALE: 'importoRegistrato' è quanto ha incassato, 'daIncassare_mostrato' è quanto la pagina diceva di dover incassare. Se importoRegistrato > daIncassare → ha incassato troppo.",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Errore", message: e?.message, stack: e?.stack }, { status: 500 });
  }
}
