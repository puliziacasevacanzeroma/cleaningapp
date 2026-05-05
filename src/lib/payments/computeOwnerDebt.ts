/**
 * computeOwnerDebt — UNICA FONTE DI VERITÀ server-side per calcolo debiti.
 *
 * Wrapper sottile attorno alla funzione condivisa `computeMonthDebt`,
 * adattato per usare adminDb (firebase-admin SDK) invece dell'SDK client.
 *
 * Garantisce coerenza con:
 *   - useOwnerBalance.ts          (modal Pagamenti in sospeso)
 *   - useOwnerDebts.ts            (slide pagamenti, layout, pulizie)
 *   - useOwnerRealtimePayments.ts (pagina /proprietario/pagamenti)
 *
 * Usato da:
 *   - /api/cron/send-payment-warning  (email 5 del mese)
 *   - /api/cron/send-payment-suspension (email 10 del mese)
 *   - /api/debug/test-payment-warning
 *   - /api/debug/test-payment-suspension
 *
 * Bug-fix architetturali rispetto alla versione precedente:
 *   - bedMakingFee ora INCLUSO negli ordini (era escluso → cron sottostimavano)
 *   - Tutta la logica di pricing ora vive in un solo file (debtCalculator.ts)
 */

import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import {
  type DebtStatus,
  MONTHS_IT,
  getDebtStatus,
  getScadenzaDate,
  getWarningDate,
  getMonthKey,
} from "~/lib/payments/debtManager";
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

// ════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════

export interface MonthDebtServer {
  month: number;
  year: number;
  monthName: string;
  monthKey: string;
  totaleServizi: number;
  totalePagato: number;
  saldo: number;
  status: DebtStatus;
  scadenza: Date;
  warningDate: Date;
}

export interface OwnerDebtSummary {
  /** Document ID dell'utente in collection users */
  userId: string;
  /** Email del proprietario (lowercase) */
  email: string;
  /** Nome visualizzato (displayName || name || email) */
  name: string;
  /** Tutti i debiti non saldati ordinati per data crescente */
  debts: MonthDebtServer[];
  /** Somma di tutti i saldi insoluti */
  totalDebt: number;
  /** Numero proprietà ACTIVE del proprietario */
  propertiesCount: number;
  /** True se admin ha fatto override del paymentBlock — quei clienti vanno SKIPPATI */
  paymentBlockOverridden: boolean;
}

// ════════════════════════════════════════════════════════════════
// CONSTANTI
// ════════════════════════════════════════════════════════════════

/** Soglia per evitare problemi di floating point: < 1 centesimo = saldato */
const SALDO_THRESHOLD = 0.01;

// ════════════════════════════════════════════════════════════════
// FUNZIONI PRINCIPALI
// ════════════════════════════════════════════════════════════════

/**
 * Calcola TUTTI i debiti insoluti di un singolo proprietario.
 * Restituisce null se l'utente non è valido (no email, ecc.)
 *
 * @param userId Document ID utente in users collection
 * @returns OwnerDebtSummary o null se utente non processabile
 */
export async function computeOwnerDebt(
  userId: string,
): Promise<OwnerDebtSummary | null> {
  // ─── 1. Carica utente ───────────────────────────────────
  const userDoc = await adminDb.collection("users").doc(userId).get();
  if (!userDoc.exists) return null;

  const userData = userDoc.data()!;
  const email = (userData.email || "").toLowerCase().trim();
  if (!email) return null;

  const name = userData.displayName || userData.name || email;
  const paymentBlockOverridden = userData.paymentBlock?.overriddenByAdmin === true;

  // ─── 2. Proprietà ATTIVE del proprietario ──────────────
  const propsSnap = await adminDb.collection("properties")
    .where("ownerId", "==", userId)
    .where("status", "==", "ACTIVE")
    .get();

  if (propsSnap.empty) {
    return {
      userId, email, name,
      debts: [], totalDebt: 0,
      propertiesCount: 0,
      paymentBlockOverridden,
    };
  }

  const propertyIds = propsSnap.docs.map(d => d.id);
  const propertiesById = new Map<string, DebtCalcProperty>();
  propsSnap.docs.forEach(d => {
    const data = d.data();
    propertiesById.set(d.id, { id: d.id, cleaningPrice: data.cleaningPrice || 0 });
  });
  const propertyIdsSet = new Set(propertyIds);

  // ─── 3. Range temporale: ultimi 24 mesi (esclude mese corrente) ───
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const rangeStart = new Date(currentYear - 2, currentMonth - 1, 1);
  const rangeEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);
  const startTs = Timestamp.fromDate(rangeStart);
  const endTs = Timestamp.fromDate(rangeEnd);

  // ─── 4. Pulizie nel range (filtro status COMPLETED dentro computeMonthDebt) ───
  // NOTA: filtriamo per COMPLETED qui via .where() per ridurre payload, anche se
  // computeMonthDebt rifiltrerebbe internamente. Riduce I/O senza cambiare logica.
  const cleaningsSnap = await adminDb.collection("cleanings")
    .where("status", "==", "COMPLETED")
    .where("scheduledDate", ">=", startTs)
    .where("scheduledDate", "<=", endTs)
    .get();

  const cleanings: DebtCalcCleaning[] = [];
  cleaningsSnap.docs.forEach(doc => {
    const d = doc.data();
    if (!propertyIdsSet.has(d.propertyId)) return;
    cleanings.push({
      id: doc.id,
      propertyId: d.propertyId,
      status: d.status,
      scheduledDate: d.scheduledDate,
      price: d.price,
      priceOverride: d.priceOverride,
      holidayFee: d.holidayFee,
      excludedFromBilling: d.excludedFromBilling,
    });
  });

  // ─── 5. Inventory ──────────────────────────────────────
  const inventorySnap = await adminDb.collection("inventory").get();
  const inventoryById = buildInventoryMap(
    inventorySnap.docs.map(d => ({ id: d.id, data: d.data() })),
  );

  // ─── 6. Ordini nel range ───────────────────────────────
  const ordersSnap = await adminDb.collection("orders")
    .where("scheduledDate", ">=", startTs)
    .where("scheduledDate", "<=", endTs)
    .get();

  const orders: DebtCalcOrder[] = [];
  ordersSnap.docs.forEach(doc => {
    const o = doc.data();
    if (!propertyIdsSet.has(o.propertyId)) return;
    orders.push({
      id: doc.id,
      propertyId: o.propertyId,
      status: o.status,
      cleaningId: o.cleaningId,
      scheduledDate: o.scheduledDate,
      deliveredAt: o.deliveredAt,
      createdAt: o.createdAt,
      items: o.items,
      totalPriceOverride: o.totalPriceOverride,
      deliveryFee: o.deliveryFee,
      deliveryFeeEnabled: o.deliveryFeeEnabled,
      bedMaking: o.bedMaking,
      bedMakingFee: o.bedMakingFee,
      excludedFromBilling: o.excludedFromBilling,
    });
  });

  // ─── 7. Pagamenti ──────────────────────────────────────
  const paymentsSnap = await adminDb.collection("payments")
    .where("proprietarioId", "==", userId)
    .get();

  const payments: DebtCalcPayment[] = [];
  paymentsSnap.docs.forEach(doc => {
    const p = doc.data();
    if (typeof p.month !== "number" || typeof p.year !== "number") return;
    payments.push({
      proprietarioId: p.proprietarioId,
      month: p.month,
      year: p.year,
      amount: p.amount || 0,
      method: p.method,
    });
  });

  // ─── 8. Override admin sui totali mese ─────────────────
  const overridesSnap = await adminDb.collection("paymentOverrides")
    .where("proprietarioId", "==", userId)
    .get();

  const overrideByMonthKey = new Map<string, DebtCalcOverride>();
  overridesSnap.docs.forEach(doc => {
    const o = doc.data();
    if (typeof o.month !== "number" || typeof o.year !== "number") return;
    overrideByMonthKey.set(`${o.year}-${o.month}`, {
      proprietarioId: o.proprietarioId,
      month: o.month,
      year: o.year,
      overrideTotal: o.overrideTotal || 0,
      reason: o.reason,
    });
  });

  // ─── 9. Calcola debiti per ogni mese ────────────────────
  const debts: MonthDebtServer[] = [];
  const monthsToCheck = getMonthsToCheck(now, 24);

  for (const { month, year } of monthsToCheck) {
    const calc = computeMonthDebt({
      month, year,
      propertiesById,
      cleanings,
      orders,
      payments,
      inventoryById,
      override: overrideByMonthKey.get(`${year}-${month}`),
    });

    if (!calc) continue;
    if (calc.saldo <= SALDO_THRESHOLD) continue;

    debts.push({
      month, year,
      monthName: MONTHS_IT[month - 1] || "",
      monthKey: getMonthKey(month, year),
      totaleServizi: calc.totaleServizi,
      totalePagato: calc.totalePagato,
      saldo: calc.saldo,
      status: getDebtStatus(month, year, calc.saldo),
      scadenza: getScadenzaDate(month, year),
      warningDate: getWarningDate(month, year),
    });
  }

  // Ordino dal più vecchio al più recente (FIFO display nelle email)
  debts.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  const totalDebt = debts.reduce((sum, d) => sum + d.saldo, 0);

  return {
    userId,
    email,
    name,
    debts,
    totalDebt,
    propertiesCount: propertyIds.length,
    paymentBlockOverridden,
  };
}

/**
 * Carica TUTTI i proprietari ATTIVI con saldo > 0.
 * Filtra automaticamente:
 *   - utenti senza email
 *   - utenti senza proprietà attive
 *   - utenti con saldo <= 0.01 €
 *
 * NOTA: paymentBlockOverridden NON è un filtro di skip. Le email di
 * sollecito vengono inviate anche ai clienti sbloccati manualmente
 * dall'admin per garantire una tracciatura formale dei solleciti.
 * Il blocco account resta gestito separatamente da check-payment-blocks.
 *
 * @returns Lista garantita di proprietari che HANNO REALMENTE debiti insoluti
 */
export async function getAllOwnersWithDebt(): Promise<OwnerDebtSummary[]> {
  const usersSnap = await adminDb.collection("users")
    .where("role", "==", "PROPRIETARIO")
    .where("status", "==", "ACTIVE")
    .get();

  const results: OwnerDebtSummary[] = [];

  for (const userDoc of usersSnap.docs) {
    try {
      const summary = await computeOwnerDebt(userDoc.id);
      if (!summary) continue;
      if (!summary.email) continue;
      if (summary.propertiesCount === 0) continue;
      if (summary.totalDebt <= SALDO_THRESHOLD) continue;
      results.push(summary);
    } catch (err) {
      // NON crashare il cron per un singolo utente con dati corrotti
      console.error(`[computeOwnerDebt] Errore su userId=${userDoc.id}:`, err);
    }
  }

  return results;
}
