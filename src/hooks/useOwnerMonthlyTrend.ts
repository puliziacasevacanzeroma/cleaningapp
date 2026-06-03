"use client";

/**
 * useOwnerMonthlyTrend — totali di spesa MESE PER MESE per un proprietario,
 * usati dal grafico "Andamento spesa" della dashboard.
 *
 * Sottoscrive UNA volta i dati su una finestra di N mesi e calcola, per ogni
 * mese, il totale con la funzione condivisa `computeMonthDebt` — la STESSA che
 * alimenta la pagina /proprietario/pagamenti, la modal pagamenti e i cron.
 * Quindi i numeri del grafico combaciano al centesimo con il resto dell'app.
 *
 * Restituisce anche activeCount/pendingCount (conteggio proprietà attive e in
 * attesa) perché la query proprietà è già qui: evita un listener in più.
 */

import { useState, useEffect, useMemo, useRef } from "react";
import { collection, query, where, getDocs, Timestamp, onSnapshot } from "firebase/firestore";
import type { Unsubscribe } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import {
  computeMonthDebt,
  buildInventoryMap,
  type DebtCalcProperty,
  type DebtCalcCleaning,
  type DebtCalcOrder,
  type DebtCalcPayment,
  type DebtCalcOverride,
} from "~/lib/payments/debtCalculator";

export interface MonthlyTrendPoint { month: number; year: number; total: number; }

export interface OwnerMonthlyTrendResult {
  trend: MonthlyTrendPoint[];   // ascendente, ultimi `months` mesi (incluso il corrente)
  activeCount: number;
  pendingCount: number;
  loading: boolean;
}

function lastNMonths(refDate: Date, months: number): MonthlyTrendPoint[] {
  const cm = refDate.getMonth() + 1;
  const cy = refDate.getFullYear();
  const out: MonthlyTrendPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    let m = cm - i, y = cy;
    while (m <= 0) { m += 12; y -= 1; }
    out.push({ month: m, year: y, total: 0 });
  }
  return out;
}

export function useOwnerMonthlyTrend(ownerId: string | undefined, months = 12): OwnerMonthlyTrendResult {
  const [properties, setProperties] = useState<DebtCalcProperty[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
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

  const loading = !propsReady || !cleaningsReady || !ordersReady || !paymentsReady || !overridesReady || !inventoryReady;

  useEffect(() => {
    if (!ownerId) {
      setPropsReady(true); setCleaningsReady(true); setOrdersReady(true);
      setPaymentsReady(true); setOverridesReady(true); setInventoryReady(true);
      return;
    }
    const key = ownerId;
    if (setupKeyRef.current === key) return;

    unsubsRef.current.forEach(u => { try { u(); } catch {} });
    unsubsRef.current = [];
    setPropsReady(false); setCleaningsReady(false); setOrdersReady(false);
    setPaymentsReady(false); setOverridesReady(false);

    // Finestra dati: dall'inizio di `months` mesi fa alla fine del mese corrente.
    const now = new Date();
    const rangeStart = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const startTs = Timestamp.fromDate(rangeStart);
    const endTs = Timestamp.fromDate(rangeEnd);

    let mounted = true;

    async function setup() {
      // Inventario (una volta)
      try {
        const invSnap = await getDocs(collection(db, "inventory"));
        if (!mounted) return;
        setInventoryDocs(invSnap.docs.map(d => ({ id: d.id, data: d.data() as Record<string, any> })));
        setInventoryReady(true);
      } catch { if (mounted) setInventoryReady(true); }

      // Proprietà (TUTTE le proprietà del proprietario → active per il calcolo, pending per il KPI)
      const propsSnap = await getDocs(query(collection(db, "properties"), where("ownerId", "==", ownerId)));
      if (!mounted) return;
      const active: DebtCalcProperty[] = [];
      let pending = 0;
      propsSnap.docs.forEach(d => {
        const raw = d.data() as Record<string, any>;
        if (raw.status === "ACTIVE") active.push({ id: d.id, cleaningPrice: raw.cleaningPrice || 0 });
        else if (raw.status === "PENDING") pending += 1;
      });
      setProperties(active);
      setPendingCount(pending);
      setPropsReady(true);

      const propIds = new Set(active.map(p => p.id));
      if (propIds.size === 0) {
        setCleaningsReady(true); setOrdersReady(true); setPaymentsReady(true); setOverridesReady(true);
        setupKeyRef.current = key;
        return;
      }

      const unsubC = onSnapshot(
        query(collection(db, "cleanings"), where("scheduledDate", ">=", startTs), where("scheduledDate", "<=", endTs)),
        (snap) => {
          if (!mounted) return;
          const list: DebtCalcCleaning[] = [];
          snap.docs.forEach(d => {
            const raw = d.data() as Record<string, any>;
            if (!propIds.has(raw.propertyId)) return;
            list.push({ id: d.id, propertyId: raw.propertyId, status: raw.status, scheduledDate: raw.scheduledDate, price: raw.price, priceOverride: raw.priceOverride, holidayFee: raw.holidayFee, excludedFromBilling: raw.excludedFromBilling });
          });
          setCleanings(list); setCleaningsReady(true);
        },
      );
      unsubsRef.current.push(unsubC);

      const unsubO = onSnapshot(
        query(collection(db, "orders"), where("scheduledDate", ">=", startTs), where("scheduledDate", "<=", endTs)),
        (snap) => {
          if (!mounted) return;
          const list: DebtCalcOrder[] = [];
          snap.docs.forEach(d => {
            const raw = d.data() as Record<string, any>;
            if (!propIds.has(raw.propertyId)) return;
            list.push({ id: d.id, propertyId: raw.propertyId, status: raw.status, cleaningId: raw.cleaningId, scheduledDate: raw.scheduledDate, deliveredAt: raw.deliveredAt, createdAt: raw.createdAt, items: raw.items, totalPriceOverride: raw.totalPriceOverride, deliveryFee: raw.deliveryFee, deliveryFeeEnabled: raw.deliveryFeeEnabled, bedMaking: raw.bedMaking, bedMakingFee: raw.bedMakingFee, excludedFromBilling: raw.excludedFromBilling });
          });
          setOrders(list); setOrdersReady(true);
        },
      );
      unsubsRef.current.push(unsubO);

      const unsubP = onSnapshot(
        query(collection(db, "payments"), where("proprietarioId", "==", ownerId)),
        (snap) => {
          if (!mounted) return;
          const list: DebtCalcPayment[] = snap.docs.map(d => {
            const raw = d.data() as Record<string, any>;
            return { proprietarioId: raw.proprietarioId, month: raw.month, year: raw.year, amount: raw.amount || 0, method: raw.method, isCreditTransfer: raw.isCreditTransfer === true };
          });
          setPayments(list); setPaymentsReady(true);
        },
      );
      unsubsRef.current.push(unsubP);

      const unsubOv = onSnapshot(
        query(collection(db, "paymentOverrides"), where("proprietarioId", "==", ownerId)),
        (snap) => {
          if (!mounted) return;
          const list: DebtCalcOverride[] = snap.docs.map(d => {
            const raw = d.data() as Record<string, any>;
            return { proprietarioId: raw.proprietarioId, month: raw.month, year: raw.year, overrideTotal: raw.overrideTotal || 0, reason: raw.reason };
          });
          setOverrides(list); setOverridesReady(true);
        },
      );
      unsubsRef.current.push(unsubOv);

      setupKeyRef.current = key;
    }

    setup();
    return () => { mounted = false; unsubsRef.current.forEach(u => { try { u(); } catch {} }); unsubsRef.current = []; };
  }, [ownerId, months]);

  const trend = useMemo<MonthlyTrendPoint[]>(() => {
    const base = lastNMonths(new Date(), months);
    if (loading || !ownerId || properties.length === 0) return base;
    const propertiesById = new Map(properties.map(p => [p.id, p]));
    const inventoryById = buildInventoryMap(inventoryDocs);
    const overrideByKey = new Map<string, DebtCalcOverride>();
    overrides.forEach(o => overrideByKey.set(`${o.year}-${o.month}`, o));
    return base.map(({ month, year }) => {
      const calc = computeMonthDebt({ month, year, propertiesById, cleanings, orders, payments, inventoryById, override: overrideByKey.get(`${year}-${month}`) });
      return { month, year, total: calc?.totaleServizi ?? 0 };
    });
  }, [loading, ownerId, properties, cleanings, orders, payments, overrides, inventoryDocs, months]);

  return { trend, activeCount: properties.length, pendingCount, loading };
}
