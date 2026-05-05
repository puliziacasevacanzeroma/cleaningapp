"use client";

import { useState, useEffect, useMemo } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import {
  type MonthDebt,
  type DebtStatus,
  MONTHS_IT,
  getDebtStatus,
  getScadenzaDate,
  getWarningDate,
  getGiorniAllaScadenza,
  getMonthKey,
  getStatusColor,
  getStatusLabel,
  getStatusIcon,
  formatCurrency,
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

// Re-export per comodità
export type { MonthDebt, DebtStatus };
export {
  getStatusColor,
  getStatusLabel,
  getStatusIcon,
  formatCurrency,
  MONTHS_IT,
};

// ==================== RESULT TYPE ====================

export interface OwnerBalanceResult {
  debts: MonthDebt[];
  /**
   * Totale dei debiti scaduti (somma saldi positivi dei mesi).
   * NON tiene conto del credito da mesi pagati in eccesso.
   * Per il valore "reale" da mostrare al cliente vedi `totalDebtNet`.
   */
  totalDebt: number;
  /**
   * Credito accumulato dai mesi pagati in eccesso (≥ 0).
   * Esempio: se Marzo è stato pagato 150€ ma il dovuto era 100€,
   * questo conta 50€ di credito.
   */
  creditoTotale: number;
  /**
   * Debito netto da mostrare al cliente.
   * = max(0, totalDebt - creditoTotale)
   * È il valore reale da pagare tenendo conto del credito.
   */
  totalDebtNet: number;
  isLoading: boolean;
  countScaduti: number;
  countWarning: number;
  countDaPagare: number;
  hasDebts: boolean;
  oldestDebtMonth?: string;
}

// ==================== HOOK ====================

/**
 * useOwnerBalance — calcolo realtime del debito di un proprietario.
 *
 * Usa la funzione condivisa `computeMonthDebt` per garantire coerenza
 * con la pagina /proprietario/pagamenti, le slide dashboard e i cron email.
 *
 * Bug-fix architetturali rispetto alla versione precedente:
 *   - bedMakingFee ora INCLUSO negli ordini (era escluso → sottostima)
 *   - Threshold di loading allineata al numero reale di listener (6 invece di 4)
 *     per evitare race condition: il calcolo non parte finché TUTTI gli stream
 *     hanno emesso almeno una volta.
 */
export function useOwnerBalance(userId: string | undefined): OwnerBalanceResult {
  const [properties, setProperties] = useState<DebtCalcProperty[]>([]);
  const [cleanings, setCleanings] = useState<DebtCalcCleaning[]>([]);
  const [orders, setOrders] = useState<DebtCalcOrder[]>([]);
  const [payments, setPayments] = useState<DebtCalcPayment[]>([]);
  const [inventoryDocs, setInventoryDocs] = useState<Array<{ id: string; data: Record<string, any> }>>([]);
  const [overrides, setOverrides] = useState<DebtCalcOverride[]>([]);

  // Flag separati per ogni stream — il calcolo parte solo quando TUTTI hanno emesso
  const [propsReady, setPropsReady] = useState(false);
  const [cleaningsReady, setCleaningsReady] = useState(false);
  const [ordersReady, setOrdersReady] = useState(false);
  const [paymentsReady, setPaymentsReady] = useState(false);
  const [inventoryReady, setInventoryReady] = useState(false);
  const [overridesReady, setOverridesReady] = useState(false);

  // 1. Listener Proprietà
  useEffect(() => {
    if (!userId) {
      setPropsReady(true);
      return;
    }

    const q = query(
      collection(db, "properties"),
      where("ownerId", "==", userId),
      where("status", "==", "ACTIVE"),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => {
        const raw = doc.data() as Record<string, any>;
        return {
          id: doc.id,
          cleaningPrice: raw.cleaningPrice || 0,
        } as DebtCalcProperty;
      });
      setProperties(data);
      setPropsReady(true);
    });

    return () => unsubscribe();
  }, [userId]);

  // 2. Listener Pulizie (filtrate per propertyIds)
  useEffect(() => {
    if (!userId) {
      setCleaningsReady(true);
      return;
    }
    if (properties.length === 0) {
      setCleanings([]);
      setCleaningsReady(true);
      return;
    }

    const propertyIds = new Set(properties.map((p) => p.id));

    const unsubscribe = onSnapshot(collection(db, "cleanings"), (snapshot) => {
      const filtered: DebtCalcCleaning[] = [];
      snapshot.docs.forEach((doc) => {
        const raw = doc.data() as Record<string, any>;
        if (!propertyIds.has(raw.propertyId)) return;
        filtered.push({
          id: doc.id,
          propertyId: raw.propertyId,
          status: raw.status,
          scheduledDate: raw.scheduledDate,
          price: raw.price,
          priceOverride: raw.priceOverride,
          holidayFee: raw.holidayFee,
          excludedFromBilling: raw.excludedFromBilling,
        });
      });
      setCleanings(filtered);
      setCleaningsReady(true);
    });

    return () => unsubscribe();
  }, [userId, properties]);

  // 3. Listener Ordini (filtrati per propertyIds)
  useEffect(() => {
    if (!userId) {
      setOrdersReady(true);
      return;
    }
    if (properties.length === 0) {
      setOrders([]);
      setOrdersReady(true);
      return;
    }

    const propertyIds = new Set(properties.map((p) => p.id));

    const unsubscribe = onSnapshot(collection(db, "orders"), (snapshot) => {
      const filtered: DebtCalcOrder[] = [];
      snapshot.docs.forEach((doc) => {
        const raw = doc.data() as Record<string, any>;
        if (!propertyIds.has(raw.propertyId)) return;
        filtered.push({
          id: doc.id,
          propertyId: raw.propertyId,
          status: raw.status,
          cleaningId: raw.cleaningId,
          scheduledDate: raw.scheduledDate,
          deliveredAt: raw.deliveredAt,
          createdAt: raw.createdAt,
          items: raw.items,
          totalPriceOverride: raw.totalPriceOverride,
          deliveryFee: raw.deliveryFee,
          deliveryFeeEnabled: raw.deliveryFeeEnabled,
          bedMaking: raw.bedMaking,
          bedMakingFee: raw.bedMakingFee,
          excludedFromBilling: raw.excludedFromBilling,
        });
      });
      setOrders(filtered);
      setOrdersReady(true);
    });

    return () => unsubscribe();
  }, [userId, properties]);

  // 4. Listener Pagamenti
  useEffect(() => {
    if (!userId) {
      setPaymentsReady(true);
      return;
    }

    const q = query(
      collection(db, "payments"),
      where("proprietarioId", "==", userId),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => {
        const raw = doc.data() as Record<string, any>;
        return {
          proprietarioId: raw.proprietarioId,
          month: raw.month,
          year: raw.year,
          amount: raw.amount || 0,
          method: raw.method,
        } as DebtCalcPayment;
      });
      setPayments(data);
      setPaymentsReady(true);
    });

    return () => unsubscribe();
  }, [userId]);

  // 5. Listener Inventario
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "inventory"), (snapshot) => {
      const docs = snapshot.docs.map((doc) => ({
        id: doc.id,
        data: doc.data() as Record<string, any>,
      }));
      setInventoryDocs(docs);
      setInventoryReady(true);
    });

    return () => unsubscribe();
  }, []);

  // 6. Listener Override
  useEffect(() => {
    if (!userId) {
      setOverridesReady(true);
      return;
    }

    const q = query(
      collection(db, "paymentOverrides"),
      where("proprietarioId", "==", userId),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => {
        const raw = doc.data() as Record<string, any>;
        return {
          proprietarioId: raw.proprietarioId,
          month: raw.month,
          year: raw.year,
          overrideTotal: raw.overrideTotal || 0,
          reason: raw.reason,
        } as DebtCalcOverride;
      });
      setOverrides(data);
      setOverridesReady(true);
    });

    return () => unsubscribe();
  }, [userId]);

  // Loading: TRUE finché anche solo uno stream non ha emesso
  // (Fix race condition: prima usava un contatore che poteva raggiungere la
  //  soglia anche se alcuni stream non avevano mai emesso il primo dato.)
  const isLoading =
    !propsReady ||
    !cleaningsReady ||
    !ordersReady ||
    !paymentsReady ||
    !inventoryReady ||
    !overridesReady;

  // ==================== CALCOLO DEBITI ====================

  const result = useMemo((): OwnerBalanceResult => {
    const emptyResult: OwnerBalanceResult = {
      debts: [],
      totalDebt: 0,
      creditoTotale: 0,
      totalDebtNet: 0,
      isLoading: true,
      countScaduti: 0,
      countWarning: 0,
      countDaPagare: 0,
      hasDebts: false,
    };

    if (!userId) {
      return { ...emptyResult, isLoading: false };
    }

    if (isLoading) {
      return emptyResult;
    }

    // Costruisci le map una sola volta
    const propertiesById = new Map(properties.map((p) => [p.id, p]));
    const inventoryById = buildInventoryMap(inventoryDocs);
    const overrideByMonthKey = new Map<string, DebtCalcOverride>();
    overrides.forEach((o) => overrideByMonthKey.set(`${o.year}-${o.month}`, o));

    // Mesi da controllare: ultimi 24 (escluso corrente)
    const monthsToCheck = getMonthsToCheck(new Date(), 24);

    const debts: MonthDebt[] = [];
    // ⚠️ Calcolo credito da mesi pagati in eccesso
    // Per ogni mese con saldo NEGATIVO, accumulo il valore assoluto
    let creditoTotale = 0;

    for (const { month, year } of monthsToCheck) {
      const calc = computeMonthDebt({
        month,
        year,
        propertiesById,
        cleanings,
        orders,
        payments,
        inventoryById,
        override: overrideByMonthKey.get(`${year}-${month}`),
      });

      // Salta se il mese non ha attività né override
      if (!calc) continue;

      // Saldo negativo = pagato in eccesso → accumula come credito
      if (calc.saldo < 0) {
        creditoTotale += -calc.saldo;
      }

      // Aggiungi solo se c'è un debito residuo
      if (calc.saldo > 0) {
        const status = getDebtStatus(month, year, calc.saldo);
        debts.push({
          month,
          year,
          monthName: MONTHS_IT[month - 1] || "",
          monthKey: getMonthKey(month, year),
          totaleServizi: calc.totaleServizi,
          totalePagato: calc.totalePagato,
          saldo: calc.saldo,
          status,
          scadenza: getScadenzaDate(month, year),
          warningDate: getWarningDate(month, year),
          giorniAllaScadenza: getGiorniAllaScadenza(month, year),
        });
      }
    }

    // Ordina: prima SCADUTI, poi WARNING, poi DA_PAGARE (e per data dal più vecchio)
    const statusOrder: Record<DebtStatus, number> = {
      SCADUTO: 0,
      WARNING: 1,
      DA_PAGARE: 2,
      SALDATO: 3,
    };

    debts.sort((a, b) => {
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status];
      }
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });

    const totalDebt = debts.reduce((sum, d) => sum + d.saldo, 0);
    const totalDebtNet = Math.max(0, totalDebt - creditoTotale);
    const countScaduti = debts.filter((d) => d.status === "SCADUTO").length;
    const countWarning = debts.filter((d) => d.status === "WARNING").length;
    const countDaPagare = debts.filter((d) => d.status === "DA_PAGARE").length;

    const oldestDebt = debts.length > 0
      ? debts.reduce((oldest, curr) => {
          if (curr.year < oldest.year) return curr;
          if (curr.year === oldest.year && curr.month < oldest.month) return curr;
          return oldest;
        })
      : undefined;

    return {
      debts,
      totalDebt,
      creditoTotale,
      totalDebtNet,
      isLoading: false,
      countScaduti,
      countWarning,
      countDaPagare,
      hasDebts: debts.length > 0,
      oldestDebtMonth: oldestDebt
        ? `${oldestDebt.monthName} ${oldestDebt.year}`
        : undefined,
    };
  }, [userId, properties, cleanings, orders, payments, inventoryDocs, overrides, isLoading]);

  return result;
}
