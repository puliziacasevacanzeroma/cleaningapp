"use client";

/**
 * useOwnerDebts — UNICA FONTE DI VERITÀ per i debiti del proprietario.
 * 
 * Usa la stessa logica ESATTA di useOwnerRealtimePayments (processOrder, 
 * isInMonth, deliveryFee, kitCortesia, serviziExtra) per calcolare il saldo
 * di ogni mese degli ultimi 24 mesi.
 * 
 * Usato da:
 * - Dashboard banner (slide pagamenti)
 * - Qualsiasi componente che mostri il debito totale
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

// Re-export per comodità
export type { MonthDebt, DebtStatus };

// ═══ CACHE INVENTARIO (condiviso con useOwnerRealtimePayments) ═══
interface InventoryCache { inventory: Map<string, any>; loaded: boolean; }
const inventoryCache: InventoryCache = { inventory: new Map(), loaded: false };

async function loadInventory(): Promise<boolean> {
  if (inventoryCache.loaded) return true;
  try {
    const snap = await getDocs(collection(db, "inventory"));
    inventoryCache.inventory.clear();
    snap.docs.forEach(doc => {
      const d = doc.data() as Record<string, any>;
      const item = {
        id: doc.id,
        name: d.name || "",
        sellPrice: d.sellPrice || d.price || 0,
        categoryName: d.categoryName || d.category || "Altro",
      };
      inventoryCache.inventory.set(doc.id, item);
      if (d.key) inventoryCache.inventory.set(d.key, item);
      if (doc.id.startsWith("item_")) inventoryCache.inventory.set(doc.id.replace("item_", ""), item);
    });
    inventoryCache.loaded = true;
    return true;
  } catch { return false; }
}

// ═══ UTILITY — identiche a useOwnerRealtimePayments ═══

function isInMonth(date: any, month: number, year: number): boolean {
  const d = date?.toDate?.() || (date instanceof Date ? date : null);
  if (!d) return false;
  return d.getMonth() === month - 1 && d.getFullYear() === year;
}

function processOrder(order: any) {
  let calculatedTotal = 0;
  if (order.items && Array.isArray(order.items)) {
    order.items.forEach((item: any) => {
      const itemKey = item.itemId || item.id;
      const invItem = inventoryCache.inventory.get(itemKey);
      const basePrice = item.unitPrice || item.price || invItem?.sellPrice || 0;
      const unitPrice = item.priceOverride ?? basePrice;
      const quantity = item.quantity || 1;
      const itemTotal = item.totalPrice || (unitPrice * quantity);
      calculatedTotal += itemTotal;
    });
  }
  const deliveryFee = (order.deliveryFee && order.deliveryFeeEnabled !== false) ? order.deliveryFee : 0;
  calculatedTotal += deliveryFee;

  // Determina categoria principale
  let mainCategory = "Biancheria";
  let maxCatTotal = 0;
  const catTotals: Record<string, number> = {};
  if (order.items && Array.isArray(order.items)) {
    order.items.forEach((item: any) => {
      const invItem = inventoryCache.inventory.get(item.itemId || item.id);
      const cat = item.categoryName || invItem?.categoryName || "Altro";
      const itemTotal = item.totalPrice || ((item.priceOverride ?? item.unitPrice ?? item.price ?? invItem?.sellPrice ?? 0) * (item.quantity || 1));
      catTotals[cat] = (catTotals[cat] || 0) + itemTotal;
      if (catTotals[cat] > maxCatTotal) { maxCatTotal = catTotals[cat]; mainCategory = cat; }
    });
  }

  return { ...order, calculatedTotal, mainCategory };
}

function mapCategoryToServiceType(category: string): string {
  const cat = category?.toLowerCase() || "";
  if (cat.includes("cortesia") || cat.includes("kit")) return "KIT_CORTESIA";
  if (cat.includes("extra") || cat.includes("serviz")) return "SERVIZI_EXTRA";
  return "BIANCHERIA";
}

function calcMonthTotal(
  monthCleanings: any[],
  monthOrders: any[],
  properties: any[],
): number {
  let cleaningsTotal = 0;
  monthCleanings.forEach(c => {
    const prop = properties.find(p => p.id === c.propertyId);
    if (!prop) return;
    cleaningsTotal += c.priceOverride ?? c.price ?? prop.cleaningPrice ?? 0;
  });

  let ordersTotal = 0;
  monthOrders.forEach(order => {
    const prop = properties.find(p => p.id === order.propertyId);
    if (!prop) return;
    ordersTotal += order.totalPriceOverride ?? order.calculatedTotal;
  });

  return cleaningsTotal + ordersTotal;
}

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
let cachedResult: OwnerDebtsResult | null = null;
let cachedOwnerId: string | null = null;

// ═══ HOOK ═══

export function useOwnerDebts(ownerId: string | undefined): OwnerDebtsResult {
  const [properties, setProperties] = useState<any[]>([]);
  const [allCleanings, setAllCleanings] = useState<any[]>([]);
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [allPayments, setAllPayments] = useState<any[]>([]);

  const [propsLoaded, setPropsLoaded] = useState(false);
  const [invLoaded, setInvLoaded] = useState(inventoryCache.loaded);
  const [cleaningsLoaded, setCleaningsLoaded] = useState(false);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [paymentsLoaded, setPaymentsLoaded] = useState(false);

  const unsubsRef = useRef<Unsubscribe[]>([]);
  const setupKeyRef = useRef<string | null>(null);

  const loading = !propsLoaded || !invLoaded || !cleaningsLoaded || !ordersLoaded || !paymentsLoaded;

  // Restituisci cache se disponibile durante il loading
  const [initialCache] = useState<OwnerDebtsResult | null>(() => {
    if (cachedOwnerId === ownerId && cachedResult) return cachedResult;
    return null;
  });

  // ═══ DATA LOADING (stessa architettura di useOwnerRealtimePayments) ═══
  useEffect(() => {
    if (!ownerId) { setPropsLoaded(true); setCleaningsLoaded(true); setOrdersLoaded(true); setPaymentsLoaded(true); return; }

    const key = `${ownerId}`;
    if (setupKeyRef.current === key) return;

    unsubsRef.current.forEach(u => { try { u(); } catch {} });
    unsubsRef.current = [];
    setPropsLoaded(false); setCleaningsLoaded(false); setOrdersLoaded(false); setPaymentsLoaded(false);

    // Range: ultimi 24 mesi
    const now = new Date();
    const rangeStart = new Date(now.getFullYear() - 2, now.getMonth(), 1);
    const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const startTs = Timestamp.fromDate(rangeStart);
    const endTs = Timestamp.fromDate(rangeEnd);

    let mounted = true;

    async function setup() {
      await loadInventory();
      if (!mounted) return;
      setInvLoaded(true);

      // Proprietà
      const propsSnap = await getDocs(
        query(collection(db, "properties"), where("ownerId", "==", ownerId), where("status", "==", "ACTIVE"))
      );
      if (!mounted) return;
      const props = propsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
      setProperties(props);
      setPropsLoaded(true);

      const propIds = props.map(p => p.id);
      if (propIds.length === 0) {
        setCleaningsLoaded(true); setOrdersLoaded(true); setPaymentsLoaded(true);
        setupKeyRef.current = key;
        return;
      }

      // Pulizie (COMPLETED)
      const unsubC = onSnapshot(
        query(collection(db, "cleanings"), where("scheduledDate", ">=", startTs), where("scheduledDate", "<=", endTs)),
        (snap) => {
          if (!mounted) return;
          setAllCleanings(snap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) })).filter((c: any) => c.status === "COMPLETED" && propIds.includes(c.propertyId)));
          setCleaningsLoaded(true);
        }
      );
      unsubsRef.current.push(unsubC);

      // Ordini (non CANCELLED)
      const unsubO = onSnapshot(
        query(collection(db, "orders"), where("scheduledDate", ">=", startTs), where("scheduledDate", "<=", endTs)),
        (snap) => {
          if (!mounted) return;
          setAllOrders(snap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) })).filter((o: any) => propIds.includes(o.propertyId) && o.status !== "CANCELLED"));
          setOrdersLoaded(true);
        }
      );
      unsubsRef.current.push(unsubO);

      // Pagamenti
      const unsubP = onSnapshot(
        query(collection(db, "payments"), where("proprietarioId", "==", ownerId)),
        (snap) => {
          if (!mounted) return;
          setAllPayments(snap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) })));
          setPaymentsLoaded(true);
        }
      );
      unsubsRef.current.push(unsubP);

      setupKeyRef.current = key;
    }

    setup();
    return () => { mounted = false; unsubsRef.current.forEach(u => { try { u(); } catch {} }); unsubsRef.current = []; };
  }, [ownerId]);

  // ═══ CALCOLO DEBITI — stessa logica ESATTA di useOwnerRealtimePayments ═══
  const result = useMemo((): OwnerDebtsResult => {
    const empty: OwnerDebtsResult = {
      debts: [], totalDebt: 0, isLoading: true,
      countScaduti: 0, countWarning: 0, countDaPagare: 0, hasDebts: false,
    };

    if (!ownerId) return { ...empty, isLoading: false };
    if (loading) return initialCache || empty;

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Genera lista mesi da controllare (ultimi 24 mesi, ESCLUSO mese corrente)
    const monthsToCheck: { month: number; year: number }[] = [];
    for (let i = 1; i <= 24; i++) {
      let m = currentMonth - i;
      let y = currentYear;
      while (m <= 0) { m += 12; y--; }
      monthsToCheck.push({ month: m, year: y });
    }

    const debts: MonthDebt[] = [];

    for (const { month, year } of monthsToCheck) {
      // Pulizie COMPLETED nel mese
      const monthCleanings = allCleanings.filter(c => isInMonth(c.scheduledDate, month, year));
      const completedCleaningIds = new Set(monthCleanings.map(c => c.id));

      // Ordini: DELIVERED oppure collegati a pulizia COMPLETED (stessa logica di useOwnerRealtimePayments)
      const monthOrders = allOrders
        .filter(o => isInMonth(o.deliveredAt || o.scheduledDate, month, year))
        .filter(o => {
          if (o.status === "DELIVERED") return true;
          if (o.cleaningId && completedCleaningIds.has(o.cleaningId)) return true;
          return false;
        })
        .map(processOrder);

      // Calcola totale servizi (stessa formula di useOwnerRealtimePayments)
      const totaleServizi = calcMonthTotal(monthCleanings, monthOrders, properties);

      if (totaleServizi === 0) continue;

      // Pagamenti
      const monthPayments = allPayments.filter((p: any) => p.month === month && p.year === year);
      const totalePagato = monthPayments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
      const saldo = totaleServizi - totalePagato;

      if (saldo > 0) {
        debts.push({
          month, year,
          monthName: MONTHS_IT[month - 1] || "",
          monthKey: getMonthKey(month, year),
          totaleServizi,
          totalePagato,
          saldo,
          status: getDebtStatus(month, year, saldo),
          scadenza: getScadenzaDate(month, year),
          warningDate: getWarningDate(month, year),
          giorniAllaScadenza: getGiorniAllaScadenza(month, year),
        });
      }
    }

    // Ordina: SCADUTI prima, poi WARNING, poi DA_PAGARE
    const statusOrder: Record<DebtStatus, number> = { SCADUTO: 0, WARNING: 1, DA_PAGARE: 2, SALDATO: 3 };
    debts.sort((a, b) => {
      if (statusOrder[a.status] !== statusOrder[b.status]) return statusOrder[a.status] - statusOrder[b.status];
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });

    const totalDebt = debts.reduce((s, d) => s + d.saldo, 0);
    const res: OwnerDebtsResult = {
      debts,
      totalDebt,
      isLoading: false,
      countScaduti: debts.filter(d => d.status === "SCADUTO").length,
      countWarning: debts.filter(d => d.status === "WARNING").length,
      countDaPagare: debts.filter(d => d.status === "DA_PAGARE").length,
      hasDebts: debts.length > 0,
      oldestDebtMonth: debts.length > 0
        ? `${debts.reduce((o, c) => (c.year < o.year || (c.year === o.year && c.month < o.month) ? c : o)).monthName} ${debts.reduce((o, c) => (c.year < o.year || (c.year === o.year && c.month < o.month) ? c : o)).year}`
        : undefined,
    };

    // Salva in cache module-level
    cachedResult = res;
    cachedOwnerId = ownerId;

    return res;
  }, [ownerId, loading, properties, allCleanings, allOrders, allPayments, initialCache]);

  return result;
}
