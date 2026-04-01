"use client";

import { useState, useEffect, useMemo } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  Timestamp,
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

// Re-export per comodità
export type { MonthDebt, DebtStatus };
export { 
  getStatusColor, 
  getStatusLabel, 
  getStatusIcon, 
  formatCurrency,
  MONTHS_IT,
};

// ==================== FIREBASE TYPES ====================

interface Property {
  id: string;
  name: string;
  ownerId: string;
  cleaningPrice?: number;
  status: string;
}

interface Cleaning {
  id: string;
  propertyId: string;
  scheduledDate: Timestamp;
  status: string;
  price?: number;
  priceOverride?: number;
}

interface Order {
  id: string;
  propertyId: string;
  status: string;
  createdAt?: Timestamp;
  scheduledDate?: Timestamp;
  deliveredAt?: Timestamp;
  items?: { id: string; itemId?: string; quantity: number; price?: number; priceOverride?: number; unitPrice?: number; totalPrice?: number }[];
  totalPriceOverride?: number;
  cleaningId?: string;
  deliveryFee?: number;
  deliveryFeeEnabled?: boolean;
}

interface Payment {
  id: string;
  proprietarioId: string;
  month: number;
  year: number;
  amount: number;
  method?: string;
  createdAt?: Timestamp;
}

interface InventoryItem {
  id: string;
  sellPrice: number;
}

interface PaymentOverride {
  id: string;
  proprietarioId: string;
  month: number;
  year: number;
  overrideTotal: number;
}

// ==================== RESULT TYPE ====================

export interface OwnerBalanceResult {
  debts: MonthDebt[];
  totalDebt: number;
  isLoading: boolean;
  countScaduti: number;
  countWarning: number;
  countDaPagare: number;
  hasDebts: boolean;
  oldestDebtMonth?: string;
}

// ==================== HOOK ====================

export function useOwnerBalance(userId: string | undefined): OwnerBalanceResult {
  const [properties, setProperties] = useState<Property[]>([]);
  const [cleanings, setCleanings] = useState<Cleaning[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [overrides, setOverrides] = useState<PaymentOverride[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingSteps, setLoadingSteps] = useState(0);

  // 1. Listener Proprietà
  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }
    
    const q = query(
      collection(db, "properties"),
      where("ownerId", "==", userId),
      where("status", "==", "ACTIVE")
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) })) as Property[];
      setProperties(data);
      setLoadingSteps(prev => prev + 1);
    });
    
    return () => unsubscribe();
  }, [userId]);

  // 2. Listener Pulizie
  useEffect(() => {
    if (!userId || properties.length === 0) {
      if (properties.length === 0 && userId) {
        setLoadingSteps(prev => prev + 1);
      }
      setCleanings([]);
      return;
    }
    
    const propertyIds = properties.map(p => p.id);
    
    const unsubscribe = onSnapshot(collection(db, "cleanings"), (snapshot) => {
      const allCleanings = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) })) as Cleaning[];
      const filtered = allCleanings.filter(c => propertyIds.includes(c.propertyId));
      setCleanings(filtered);
      setLoadingSteps(prev => prev + 1);
    });
    
    return () => unsubscribe();
  }, [userId, properties]);

  // 3. Listener Ordini
  useEffect(() => {
    if (!userId || properties.length === 0) {
      setOrders([]);
      return;
    }
    
    const propertyIds = properties.map(p => p.id);
    
    const unsubscribe = onSnapshot(collection(db, "orders"), (snapshot) => {
      const allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) })) as Order[];
      const filtered = allOrders.filter(o => propertyIds.includes(o.propertyId));
      setOrders(filtered);
      setLoadingSteps(prev => prev + 1);
    });
    
    return () => unsubscribe();
  }, [userId, properties]);

  // 4. Listener Pagamenti
  useEffect(() => {
    if (!userId) return;
    
    const q = query(
      collection(db, "payments"),
      where("proprietarioId", "==", userId)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) })) as Payment[];
      setPayments(data);
      setLoadingSteps(prev => prev + 1);
    });
    
    return () => unsubscribe();
  }, [userId]);

  // 5. Listener Inventario
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "inventory"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) })) as InventoryItem[];
      setInventory(data);
      setLoadingSteps(prev => prev + 1);
    });
    
    return () => unsubscribe();
  }, []);

  // 6. Listener Override
  useEffect(() => {
    if (!userId) return;
    
    const q = query(
      collection(db, "paymentOverrides"),
      where("proprietarioId", "==", userId)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) })) as PaymentOverride[];
      setOverrides(data);
      setLoadingSteps(prev => prev + 1);
    });
    
    return () => unsubscribe();
  }, [userId]);

  // Mark as loaded after initial data
  useEffect(() => {
    if (loadingSteps >= 4) {
      setIsLoading(false);
    }
  }, [loadingSteps]);

  // ==================== CALCOLO DEBITI ====================

  const result = useMemo((): OwnerBalanceResult => {
    const emptyResult: OwnerBalanceResult = {
      debts: [],
      totalDebt: 0,
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

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const inventoryById = new Map(inventory.map(i => [i.id, i]));
    const propertiesById = new Map(properties.map(p => [p.id, p]));

    // Controlla gli ultimi 24 mesi (ESCLUSO il mese corrente: il debito matura solo a mese concluso)
    const monthsToCheck: { month: number; year: number }[] = [];
    
    for (let i = 1; i <= 24; i++) {
      let checkMonth = currentMonth - i;
      let checkYear = currentYear;
      
      while (checkMonth <= 0) {
        checkMonth += 12;
        checkYear -= 1;
      }
      
      monthsToCheck.push({ month: checkMonth, year: checkYear });
    }

    const debts: MonthDebt[] = [];

    for (const { month, year } of monthsToCheck) {
      const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0);
      const endOfMonth = new Date(year, month, 0, 23, 59, 59);

      let cleaningsTotal = 0;
      let ordersTotal = 0;

      // Pulizie COMPLETED nel mese
      const completedCleaningIdsInMonth = new Set<string>();
      cleanings.forEach(cleaning => {
        if (cleaning.status !== "COMPLETED") return;
        
        const scheduledDate = cleaning.scheduledDate?.toDate?.();
        if (!scheduledDate) return;
        
        if (scheduledDate >= startOfMonth && scheduledDate <= endOfMonth) {
          const property = propertiesById.get(cleaning.propertyId);
          const originalPrice = (cleaning.price || property?.cleaningPrice || 0) + (cleaning.holidayFee ?? 0);
          const effectivePrice = (cleaning.priceOverride ?? (cleaning.price || property?.cleaningPrice || 0)) + (cleaning.holidayFee ?? 0);
          cleaningsTotal += effectivePrice;
          completedCleaningIdsInMonth.add(cleaning.id);
        }
      });

      // Ordini: DELIVERED oppure collegati a pulizia COMPLETED del mese
      orders.forEach(order => {
        if (order.status === "CANCELLED") return;
        
        const isDelivered = order.status === "DELIVERED";
        const isLinkedToCompleted = order.cleaningId && completedCleaningIdsInMonth.has(order.cleaningId);
        if (!isDelivered && !isLinkedToCompleted) return;
        
        const deliveryDate = order.deliveredAt?.toDate?.() || order.scheduledDate?.toDate?.() || order.createdAt?.toDate?.();
        if (!deliveryDate) return;
        
        if (deliveryDate >= startOfMonth && deliveryDate <= endOfMonth) {
          let calculatedTotal = 0;
          
          if (order.items && Array.isArray(order.items)) {
            order.items.forEach((item: any) => {
              const itemKey = item.itemId || item.id;
              const invItem = inventoryById.get(itemKey);
              const basePrice = item.unitPrice || item.price || invItem?.sellPrice || 0;
              const unitPrice = item.priceOverride ?? basePrice;
              const quantity = item.quantity || 1;
              const itemTotal = item.totalPrice || (unitPrice * quantity);
              calculatedTotal += itemTotal;
            });
          }

          // Includi delivery fee
          const deliveryFee = (order.deliveryFee && order.deliveryFeeEnabled !== false) ? order.deliveryFee : 0;
          calculatedTotal += deliveryFee;

          const effectivePrice = order.totalPriceOverride ?? calculatedTotal;
          ordersTotal += effectivePrice;
        }
      });

      const totaleCalcolato = cleaningsTotal + ordersTotal;
      
      // Se non ci sono servizi, salta
      if (totaleCalcolato === 0) continue;

      // Override
      const override = overrides.find(o => o.month === month && o.year === year);
      const totaleServizi = override?.overrideTotal ?? totaleCalcolato;
      
      // Pagamenti
      const paymentsThisMonth = payments.filter(p => p.month === month && p.year === year);
      const totalePagato = paymentsThisMonth.reduce((sum, p) => sum + p.amount, 0);
      
      const saldo = totaleServizi - totalePagato;
      const status = getDebtStatus(month, year, saldo);
      
      // Aggiungi solo se c'è debito
      if (saldo > 0) {
        debts.push({
          month,
          year,
          monthName: MONTHS_IT[month - 1] || "",
          monthKey: getMonthKey(month, year),
          totaleServizi,
          totalePagato,
          saldo,
          status,
          scadenza: getScadenzaDate(month, year),
          warningDate: getWarningDate(month, year),
          giorniAllaScadenza: getGiorniAllaScadenza(month, year),
        });
      }
    }

    // Ordina: prima SCADUTI, poi WARNING, poi DA_PAGARE (e per data dal più vecchio)
    const statusOrder: Record<DebtStatus, number> = {
      "SCADUTO": 0,
      "WARNING": 1,
      "DA_PAGARE": 2,
      "SALDATO": 3,
    };

    debts.sort((a, b) => {
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status];
      }
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });

    const totalDebt = debts.reduce((sum, d) => sum + d.saldo, 0);
    const countScaduti = debts.filter(d => d.status === "SCADUTO").length;
    const countWarning = debts.filter(d => d.status === "WARNING").length;
    const countDaPagare = debts.filter(d => d.status === "DA_PAGARE").length;

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
      isLoading: false,
      countScaduti,
      countWarning,
      countDaPagare,
      hasDebts: debts.length > 0,
      oldestDebtMonth: oldestDebt ? `${oldestDebt.monthName} ${oldestDebt.year}` : undefined,
    };
  }, [userId, properties, cleanings, orders, payments, inventory, overrides, isLoading]);

  return result;
}
