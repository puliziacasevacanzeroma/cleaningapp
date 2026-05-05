"use client";

/**
 * useOwnerDebts — hook per debiti di un proprietario, usato da:
 *   - Dashboard banner (slide pagamenti)
 *   - PulizieContent (visibile in pagina pulizie)
 *   - ProprietarioLayoutClient (countScaduti per icona warning)
 *
 * Internamente usa la funzione condivisa `computeMonthDebt` per garantire
 * coerenza con la modal Pagamenti in sospeso, la pagina /proprietario/pagamenti
 * e i cron di sollecito email.
 *
 * Bug-fix architetturali rispetto alla versione precedente:
 *   - bedMakingFee ora INCLUSO negli ordini (era escluso → sottostima)
 *   - paymentOverrides admin ora APPLICATI (erano ignorati)
 */

import { useState, useEffect, useMemo, useRef } from "react";
import {
  collection, query, where, getDocs, Timestamp, onSnapshot,
} from "firebase/firestore";
import type { Unsubscribe } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import {
  type MonthDebt, type DebtStatus,
  MONTHS_IT, getDebtStatus, getScadenzaDate, getWarningDate,
  getGiorniAllaScadenza, getMonthKey,
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

// ═══ RESULT TYPE ═══

export interface OwnerDebtsResult {
  debts: MonthDebt[];
  totalDebt: number;
  isLoading: boolean;
  countScaduti: number;
  countWarning: number;
  countDaPagare: number;
  hasDebts: boolean;
  oldestDebtMonth?: string;
}

// ═══ MODULE-LEVEL CACHE ═══
// Mantiene il risultato dell'ultimo calcolo per evitare flicker durante
// il loading iniziale di un secondo componente che monta lo stesso hook.
let cachedResult: OwnerDebtsResult | null = null;
let cachedOwnerId: string | null = null;

// ═══ HOOK ═══

export function useOwnerDebts(ownerId: string | undefined): OwnerDebtsResult {
  const [properties, setProperties] = useState<DebtCalcProperty[]>([]);
  const [cleanings, setCleanings] = useState<DebtCalcCleaning[]>([]);
  const [orders, setOrders] = useState<DebtCalcOrder[]>([]);
  const [payments, setPayments] = useState<DebtCalcPayment[]>([]);
  const [overrides, setOverrides] = useState<DebtCalcOverride[]>([]);
  const [inventoryDocs, setInventoryDocs] = useState<Array<{ id: string; data: Record<string, any> }>>([]);

  const [propsReady, setPropsReady] = useState(false);
  const [cleaningsReady, setCleaningsReady] = useState(false);
  const [ordersReady, setOrdersReady] = useState(false);
  const [paymentsReady, setPaymentsReady] = useState(false);
  const [overridesReady, setOverridesReady] = useState(false);
  const [inventoryReady, setInventoryReady] = useState(false);

  const unsubsRef = useRef<Unsubscribe[]>([]);
  const setupKeyRef = useRef<string | null>(null);

  const loading =
    !propsReady ||
    !cleaningsReady ||
    !ordersReady ||
    !paymentsReady ||
    !overridesReady ||
    !inventoryReady;

  // Cache iniziale per smoothing
  const [initialCache] = useState<OwnerDebtsResult | null>(() => {
    if (cachedOwnerId === ownerId && cachedResult) return cachedResult;
    return null;
  });

  // ═══ DATA LOADING ═══
  useEffect(() => {
    if (!ownerId) {
      setPropsReady(true);
      setCleaningsReady(true);
      setOrdersReady(true);
      setPaymentsReady(true);
      setOverridesReady(true);
      setInventoryReady(true);
      return;
    }

    const key = `${ownerId}`;
    if (setupKeyRef.current === key) return;

    // Cleanup precedente
    unsubsRef.current.forEach(u => { try { u(); } catch {} });
    unsubsRef.current = [];
    setPropsReady(false);
    setCleaningsReady(false);
    setOrdersReady(false);
    setPaymentsReady(false);
    setOverridesReady(false);
    // L'inventory NON dipende dall'ownerId — non serve resettarlo

    // Range: ultimi 24 mesi
    const now = new Date();
    const rangeStart = new Date(now.getFullYear() - 2, now.getMonth(), 1);
    const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const startTs = Timestamp.fromDate(rangeStart);
    const endTs = Timestamp.fromDate(rangeEnd);

    let mounted = true;

    async function setup() {
      // ─── Inventario (caricato una volta) ─────────────
      try {
        const invSnap = await getDocs(collection(db, "inventory"));
        if (!mounted) return;
        setInventoryDocs(
          invSnap.docs.map(d => ({ id: d.id, data: d.data() as Record<string, any> })),
        );
        setInventoryReady(true);
      } catch {
        if (mounted) setInventoryReady(true); // fallisce gracefully
      }

      // ─── Proprietà ────────────────────────────────────
      const propsSnap = await getDocs(
        query(collection(db, "properties"), where("ownerId", "==", ownerId), where("status", "==", "ACTIVE")),
      );
      if (!mounted) return;
      const props: DebtCalcProperty[] = propsSnap.docs.map(d => {
        const raw = d.data() as Record<string, any>;
        return { id: d.id, cleaningPrice: raw.cleaningPrice || 0 };
      });
      setProperties(props);
      setPropsReady(true);

      const propIds = new Set(props.map(p => p.id));
      if (propIds.size === 0) {
        setCleaningsReady(true);
        setOrdersReady(true);
        setPaymentsReady(true);
        setOverridesReady(true);
        setupKeyRef.current = key;
        return;
      }

      // ─── Pulizie (range 24 mesi, filtrate per propertyId) ─
      const unsubC = onSnapshot(
        query(collection(db, "cleanings"), where("scheduledDate", ">=", startTs), where("scheduledDate", "<=", endTs)),
        (snap) => {
          if (!mounted) return;
          const list: DebtCalcCleaning[] = [];
          snap.docs.forEach(d => {
            const raw = d.data() as Record<string, any>;
            if (!propIds.has(raw.propertyId)) return;
            list.push({
              id: d.id,
              propertyId: raw.propertyId,
              status: raw.status,
              scheduledDate: raw.scheduledDate,
              price: raw.price,
              priceOverride: raw.priceOverride,
              holidayFee: raw.holidayFee,
              excludedFromBilling: raw.excludedFromBilling,
            });
          });
          setCleanings(list);
          setCleaningsReady(true);
        },
      );
      unsubsRef.current.push(unsubC);

      // ─── Ordini (range 24 mesi, filtrati per propertyId) ─
      const unsubO = onSnapshot(
        query(collection(db, "orders"), where("scheduledDate", ">=", startTs), where("scheduledDate", "<=", endTs)),
        (snap) => {
          if (!mounted) return;
          const list: DebtCalcOrder[] = [];
          snap.docs.forEach(d => {
            const raw = d.data() as Record<string, any>;
            if (!propIds.has(raw.propertyId)) return;
            list.push({
              id: d.id,
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
          setOrders(list);
          setOrdersReady(true);
        },
      );
      unsubsRef.current.push(unsubO);

      // ─── Pagamenti ────────────────────────────────────
      const unsubP = onSnapshot(
        query(collection(db, "payments"), where("proprietarioId", "==", ownerId)),
        (snap) => {
          if (!mounted) return;
          const list: DebtCalcPayment[] = snap.docs.map(d => {
            const raw = d.data() as Record<string, any>;
            return {
              proprietarioId: raw.proprietarioId,
              month: raw.month,
              year: raw.year,
              amount: raw.amount || 0,
              method: raw.method,
            };
          });
          setPayments(list);
          setPaymentsReady(true);
        },
      );
      unsubsRef.current.push(unsubP);

      // ─── Override admin ───────────────────────────────
      const unsubOv = onSnapshot(
        query(collection(db, "paymentOverrides"), where("proprietarioId", "==", ownerId)),
        (snap) => {
          if (!mounted) return;
          const list: DebtCalcOverride[] = snap.docs.map(d => {
            const raw = d.data() as Record<string, any>;
            return {
              proprietarioId: raw.proprietarioId,
              month: raw.month,
              year: raw.year,
              overrideTotal: raw.overrideTotal || 0,
              reason: raw.reason,
            };
          });
          setOverrides(list);
          setOverridesReady(true);
        },
      );
      unsubsRef.current.push(unsubOv);

      setupKeyRef.current = key;
    }

    setup();
    return () => {
      mounted = false;
      unsubsRef.current.forEach(u => { try { u(); } catch {} });
      unsubsRef.current = [];
    };
  }, [ownerId]);

  // ═══ CALCOLO DEBITI tramite computeMonthDebt condivisa ═══
  const result = useMemo((): OwnerDebtsResult => {
    const empty: OwnerDebtsResult = {
      debts: [], totalDebt: 0, isLoading: true,
      countScaduti: 0, countWarning: 0, countDaPagare: 0, hasDebts: false,
    };

    if (!ownerId) return { ...empty, isLoading: false };
    if (loading) return initialCache || empty;

    const propertiesById = new Map(properties.map(p => [p.id, p]));
    const inventoryById = buildInventoryMap(inventoryDocs);
    const overrideByMonthKey = new Map<string, DebtCalcOverride>();
    overrides.forEach(o => overrideByMonthKey.set(`${o.year}-${o.month}`, o));

    const monthsToCheck = getMonthsToCheck(new Date(), 24);
    const debts: MonthDebt[] = [];

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
      if (calc.saldo <= 0) continue;

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
        giorniAllaScadenza: getGiorniAllaScadenza(month, year),
      });
    }

    // Ordina: SCADUTI prima, poi WARNING, poi DA_PAGARE
    const statusOrder: Record<DebtStatus, number> = {
      SCADUTO: 0, WARNING: 1, DA_PAGARE: 2, SALDATO: 3,
    };
    debts.sort((a, b) => {
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status];
      }
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });

    const totalDebt = debts.reduce((s, d) => s + d.saldo, 0);
    const oldest = debts.length > 0
      ? debts.reduce((o, c) =>
          (c.year < o.year || (c.year === o.year && c.month < o.month) ? c : o))
      : undefined;

    const res: OwnerDebtsResult = {
      debts,
      totalDebt,
      isLoading: false,
      countScaduti: debts.filter(d => d.status === "SCADUTO").length,
      countWarning: debts.filter(d => d.status === "WARNING").length,
      countDaPagare: debts.filter(d => d.status === "DA_PAGARE").length,
      hasDebts: debts.length > 0,
      oldestDebtMonth: oldest ? `${oldest.monthName} ${oldest.year}` : undefined,
    };

    // Cache module-level
    cachedResult = res;
    cachedOwnerId = ownerId;

    return res;
  }, [ownerId, loading, properties, cleanings, orders, payments, overrides, inventoryDocs, initialCache]);

  return result;
}
