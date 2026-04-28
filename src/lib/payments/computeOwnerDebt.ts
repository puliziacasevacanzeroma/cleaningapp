/**
 * computeOwnerDebt — UNICA FONTE DI VERITÀ server-side per calcolo debiti.
 *
 * Replica ESATTAMENTE la logica di:
 *   - src/hooks/useOwnerDebts.ts (client realtime)
 *   - src/hooks/useOwnerBalance.ts (client realtime alternativo)
 *   - src/app/api/cron/check-payment-blocks/route.ts (server)
 *   - src/app/api/debug/test-monthly-email/route.ts (server)
 *
 * Usato da:
 *   - /api/cron/send-payment-warning (email 5 del mese)
 *   - /api/cron/send-payment-suspension (email 10 del mese)
 *   - /api/debug/test-payment-warning
 *   - /api/debug/test-payment-suspension
 *
 * IMPORTANTE: ogni modifica alla formula DEVE essere replicata anche nei due
 * hook client per mantenere coerenza tra dashboard e cron. Vedi commenti inline.
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

/** Stessa classificazione hardcoded di test-monthly-email per consistenza totali */
const KIT_CORTESIA_IDS = new Set([
  "shampoo", "bagnoschiuma", "saponetta", "crema_corpo", "cremaCorpo", "crema",
  "sapone", "doccia_shampoo", "doccia-shampoo", "cuffia_doccia", "cuffiaDoccia",
  "set_cortesia", "setCortesia", "canavaccio_cucina", "canavaccioCucina",
  "item_shampoo", "item_bagnoschiuma", "item_saponetta", "item_crema_corpo",
  "item_cremaCorpo", "item_crema", "item_sapone", "item_doccia_shampoo",
  "item_cuffia_doccia", "item_cuffiaDoccia", "item_set_cortesia",
]);

const SERVIZI_EXTRA_IDS = new Set([
  "welcome_kit", "welcomeKit", "fiori_freschi", "fioriFreschi", "frigo_pieno",
  "frigoPieno", "prosecco", "prosecco_dry", "proseccoDry",
  "item_welcome_kit", "item_fiori_freschi", "item_frigo_pieno", "item_prosecco_dry",
]);

// ════════════════════════════════════════════════════════════════
// FUNZIONI PRINCIPALI
// ════════════════════════════════════════════════════════════════

/**
 * Calcola TUTTI i debiti insoluti di un singolo proprietario.
 * Restituisce null se l'utente non è valido (no email, no proprietà attive, ecc.)
 *
 * @param userId Document ID utente in users collection
 * @returns OwnerDebtSummary o null se utente non processabile
 */
export async function computeOwnerDebt(
  userId: string
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
  const propertyIdsSet = new Set(propertyIds);
  const propertiesById = new Map<string, { cleaningPrice: number }>();
  propsSnap.docs.forEach(d => {
    const data = d.data();
    propertiesById.set(d.id, { cleaningPrice: data.cleaningPrice || 0 });
  });

  // ─── 3. Range temporale: ultimi 24 mesi (esclude mese corrente) ───
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const rangeStart = new Date(currentYear - 2, currentMonth - 1, 1);
  const rangeEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);
  const startTs = Timestamp.fromDate(rangeStart);
  const endTs = Timestamp.fromDate(rangeEnd);

  // ─── 4. Pulizie COMPLETED nel range ────────────────────
  const cleaningsSnap = await adminDb.collection("cleanings")
    .where("status", "==", "COMPLETED")
    .where("scheduledDate", ">=", startTs)
    .where("scheduledDate", "<=", endTs)
    .get();

  const completedCleaningIds = new Set<string>();
  const cleaningsByMonth = new Map<string, number>(); // "YYYY-MM" → total
  cleaningsSnap.docs.forEach(doc => {
    const d = doc.data();
    if (!propertyIdsSet.has(d.propertyId)) return;

    const date = d.scheduledDate?.toDate?.();
    if (!date) return;

    const m = date.getMonth() + 1;
    const y = date.getFullYear();
    const key = `${y}-${m}`;

    const prop = propertiesById.get(d.propertyId);
    const basePrice = d.price || prop?.cleaningPrice || 0;
    const holidayFee = typeof d.holidayFee === "number" ? d.holidayFee : 0;
    const effectivePrice =
      (typeof d.priceOverride === "number" ? d.priceOverride : basePrice) +
      holidayFee;

    cleaningsByMonth.set(key, (cleaningsByMonth.get(key) || 0) + effectivePrice);
    completedCleaningIds.add(doc.id);
  });

  // ─── 5. Inventory per pricing ordini ──────────────────
  const inventorySnap = await adminDb.collection("inventory").get();
  const inventoryById = new Map<string, { sellPrice: number; categoryName: string }>();
  inventorySnap.docs.forEach(doc => {
    const d = doc.data();
    const item = {
      sellPrice: d.sellPrice || d.price || 0,
      categoryName: d.categoryName || d.category || "",
    };
    inventoryById.set(doc.id, item);
    if (d.key) inventoryById.set(d.key, item);
    if (doc.id.startsWith("item_")) inventoryById.set(doc.id.replace("item_", ""), item);
  });

  // ─── 6. Ordini nel range (logica DELIVERED || cleaningId completato) ───
  const ordersSnap = await adminDb.collection("orders")
    .where("scheduledDate", ">=", startTs)
    .where("scheduledDate", "<=", endTs)
    .get();

  const ordersByMonth = new Map<string, number>();
  ordersSnap.docs.forEach(doc => {
    const o = doc.data();
    if (o.status === "CANCELLED") return;
    if (!propertyIdsSet.has(o.propertyId)) return;

    // Stessa logica di useOwnerDebts: DELIVERED oppure collegato a pulizia COMPLETED
    const isDelivered = o.status === "DELIVERED";
    const isLinkedToCompleted = o.cleaningId && completedCleaningIds.has(o.cleaningId);
    if (!isDelivered && !isLinkedToCompleted) return;

    const date = o.deliveredAt?.toDate?.()
      || o.scheduledDate?.toDate?.()
      || o.createdAt?.toDate?.();
    if (!date) return;

    let total = 0;
    if (Array.isArray(o.items)) {
      o.items.forEach((item: any) => {
        const itemKey = item.itemId || item.id;
        const invItem = inventoryById.get(itemKey);
        const basePrice = item.unitPrice || item.price || invItem?.sellPrice || 0;
        const unitPrice = item.priceOverride ?? basePrice;
        const quantity = item.quantity || 1;
        const itemTotal = item.totalPrice || (unitPrice * quantity);
        total += itemTotal;
      });
    }
    if (o.deliveryFee && o.deliveryFeeEnabled !== false) {
      total += o.deliveryFee;
    }
    total = o.totalPriceOverride ?? total;

    const m = date.getMonth() + 1;
    const y = date.getFullYear();
    const key = `${y}-${m}`;
    ordersByMonth.set(key, (ordersByMonth.get(key) || 0) + total);
  });

  // ─── 7. Pagamenti ──────────────────────────────────────
  const paymentsSnap = await adminDb.collection("payments")
    .where("proprietarioId", "==", userId)
    .get();

  const paymentsByMonth = new Map<string, number>();
  paymentsSnap.docs.forEach(doc => {
    const p = doc.data();
    if (typeof p.month !== "number" || typeof p.year !== "number") return;
    const key = `${p.year}-${p.month}`;
    paymentsByMonth.set(key, (paymentsByMonth.get(key) || 0) + (p.amount || 0));
  });

  // ─── 8. Override admin sui totali mese ─────────────────
  const overridesSnap = await adminDb.collection("paymentOverrides")
    .where("proprietarioId", "==", userId)
    .get();

  const overridesByMonth = new Map<string, number>();
  overridesSnap.docs.forEach(doc => {
    const o = doc.data();
    if (typeof o.month !== "number" || typeof o.year !== "number") return;
    overridesByMonth.set(`${o.year}-${o.month}`, o.overrideTotal);
  });

  // ─── 9. Calcola debiti per ogni mese (ESCLUSO mese corrente) ───
  const debts: MonthDebtServer[] = [];

  for (let i = 1; i <= 24; i++) {
    let m = currentMonth - i;
    let y = currentYear;
    while (m <= 0) { m += 12; y--; }

    const key = `${y}-${m}`;
    const cleaningsTotal = cleaningsByMonth.get(key) || 0;
    const ordersTotal = ordersByMonth.get(key) || 0;
    const calcTotal = cleaningsTotal + ordersTotal;
    if (calcTotal === 0) continue;

    const totaleServizi = overridesByMonth.has(key)
      ? overridesByMonth.get(key)!
      : calcTotal;

    const totalePagato = paymentsByMonth.get(key) || 0;
    const saldo = totaleServizi - totalePagato;

    if (saldo > SALDO_THRESHOLD) {
      debts.push({
        month: m,
        year: y,
        monthName: MONTHS_IT[m - 1] || "",
        monthKey: getMonthKey(m, y),
        totaleServizi,
        totalePagato,
        saldo,
        status: getDebtStatus(m, y, saldo),
        scadenza: getScadenzaDate(m, y),
        warningDate: getWarningDate(m, y),
      });
    }
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
 *   - utenti con paymentBlock.overriddenByAdmin === true (decisione admin)
 *   - utenti senza proprietà attive
 *   - utenti con saldo <= 0.01 €
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
      // Filtri di sicurezza (livello 1 dei 4 livelli)
      // NOTA: paymentBlockOverridden NON è più un filtro di skip. Le email di
      // sollecito vengono inviate anche ai clienti sbloccati manualmente
      // dall'admin per garantire una tracciatura formale dei solleciti.
      // Il blocco account resta gestito separatamente da check-payment-blocks.
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
