"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  collection, query, where, getDocs, Timestamp,
  onSnapshot} from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import type { Unsubscribe } from "firebase/firestore";

// ══════════════════════════════════════════════════════════════════
// ⚡ HOOK PAGAMENTI PROPRIETARIO
//
// Stessa architettura di useRealtimePayments ma filtrato per
// il singolo proprietario. Usa onSnapshot per real-time.
// ══════════════════════════════════════════════════════════════════

// ==================== TYPES ====================
export type PaymentMethod = "BONIFICO" | "CONTANTI" | "ALTRO";
export type PaymentType = "ACCONTO" | "SALDO";
export type ServiceType = "PULIZIA" | "BIANCHERIA" | "KIT_CORTESIA" | "SERVIZI_EXTRA";

export interface Payment {
  id: string;
  proprietarioId: string;
  proprietarioName: string;
  month: number;
  year: number;
  amount: number;
  type: PaymentType;
  method: PaymentMethod;
  note?: string;
}

export interface OrderItemDetail {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  categoryName: string;
}

export interface ServiceDetail {
  id: string;
  type: ServiceType;
  date: Date;
  propertyId: string;
  propertyName: string;
  propertyImage?: string;
  description: string;
  originalPrice: number;
  effectivePrice: number;
  hasOverride: boolean;
  overrideReason?: string;
  items?: OrderItemDetail[];
  cleaningId?: string;
  laundryOrderId?: string;
}

export interface OwnerStats {
  proprietarioId: string;
  proprietarioName: string;
  propertyCount: number;
  cleaningsCount: number;
  cleaningsTotal: number;
  ordersCount: number;
  ordersTotal: number;
  kitCortesiaCount: number;
  kitCortesiaTotal: number;
  serviziExtraCount: number;
  serviziExtraTotal: number;
  totaleCalcolato: number;
  totaleEffettivo: number;
  hasOverride: boolean;
  overrideReason?: string;
  payments: Payment[];
  totalePagato: number;
  saldo: number;
  stato: "SALDATO" | "PARZIALE" | "DA_PAGARE";
  services: ServiceDetail[];
  statsByProperty: {
    propertyId: string;
    propertyName: string;
    propertyImage?: string;
    servicesCount: number;
    cleaningsCount: number;
    ordersCount: number;
    total: number;
    services: ServiceDetail[];
  }[];
}

export interface OwnerSummary {
  totaleServizi: number;
  totalePagato: number;
  totaleDovuto: number;
  totaleContanti: number;
  totaleBonifico: number;
  totaleAltro: number;
}

// ==================== CACHE DATI STATICI ====================
interface StaticCache {
  inventory: Map<string, any>;
  loaded: boolean;
}

const staticCache: StaticCache = {
  inventory: new Map(),
  loaded: false,
};

async function loadInventory(): Promise<boolean> {
  if (staticCache.loaded) return true;
  try {
    const inventorySnap = await getDocs(collection(db, "inventory"));
    staticCache.inventory.clear();
    inventorySnap.docs.forEach(doc => {
      const data = doc.data() as Record<string, any>;
      const itemData = {
        id: doc.id,
        name: data.name || "",
        sellPrice: data.sellPrice || data.price || 0,
        categoryName: data.categoryName || data.category || "Altro",
      };
      staticCache.inventory.set(doc.id, itemData);
      if (data.key) staticCache.inventory.set(data.key, itemData);
      if (doc.id.startsWith("item_")) staticCache.inventory.set(doc.id.replace("item_", ""), itemData);
    });
    staticCache.loaded = true;
    return true;
  } catch (error) {
    console.error("❌ Errore caricamento inventario:", error);
    return false;
  }
}

// ==================== UTILITÀ ====================
function mapCategoryToServiceType(category: string): ServiceType {
  const cat = category?.toLowerCase() || "";
  if (cat.includes("cortesia") || cat.includes("kit")) return "KIT_CORTESIA";
  if (cat.includes("extra") || cat.includes("serviz")) return "SERVIZI_EXTRA";
  return "BIANCHERIA";
}

function isInMonth(date: any, month: number, year: number): boolean {
  const d = date?.toDate?.() || (date instanceof Date ? date : null);
  if (!d) return false;
  return d.getMonth() === month - 1 && d.getFullYear() === year;
}

function processOrder(order: any): any {
  let calculatedTotal = 0;
  const itemDetails: OrderItemDetail[] = [];
  let mainCategory = "Biancheria";
  let maxCategoryTotal = 0;
  const categoryTotals: { [key: string]: number } = {};

  if (order.items && Array.isArray(order.items)) {
    order.items.forEach((item: any) => {
      const itemKey = item.itemId || item.id;
      const invItem = staticCache.inventory.get(itemKey);
      const basePrice = item.unitPrice || item.price || invItem?.sellPrice || 0;
      const unitPrice = item.priceOverride ?? basePrice;
      const quantity = item.quantity || 1;
      const itemTotal = item.totalPrice || (unitPrice * quantity);
      calculatedTotal += itemTotal;

      const categoryName = item.categoryName || invItem?.categoryName || "Altro";
      categoryTotals[categoryName] = (categoryTotals[categoryName] || 0) + itemTotal;
      if (categoryTotals[categoryName] > maxCategoryTotal) {
        maxCategoryTotal = categoryTotals[categoryName];
        mainCategory = categoryName;
      }

      itemDetails.push({
        itemId: itemKey,
        name: item.name || invItem?.name || "Articolo",
        quantity, unitPrice, totalPrice: itemTotal, categoryName,
      });
    });
  }

  const deliveryFee = (order.deliveryFee && order.deliveryFeeEnabled !== false) ? order.deliveryFee : 0;
  calculatedTotal += deliveryFee;

  // 🛏️ Aggiungi costo preparazione letti se presente
  const bedMakingFee = (order.bedMaking && order.bedMakingFee) ? order.bedMakingFee : 0;
  calculatedTotal += bedMakingFee;

  // Aggiungi delivery fee come voce visibile nel dettaglio
  if (deliveryFee > 0) {
    itemDetails.push({
      itemId: "_delivery_fee",
      name: "Costo consegna",
      quantity: 1,
      unitPrice: deliveryFee,
      totalPrice: deliveryFee,
      categoryName: "Consegna",
    });
  }

  // Aggiungi bed making fee come voce visibile nel dettaglio
  if (bedMakingFee > 0) {
    itemDetails.push({
      itemId: "_bed_making_fee",
      name: `Preparazione letti (${order.bedMakingCount || 0})`,
      quantity: 1,
      unitPrice: bedMakingFee,
      totalPrice: bedMakingFee,
      categoryName: "Preparazione Letti",
    });
  }

  return { ...order, calculatedTotal, itemDetails, mainCategory, deliveryFee, bedMakingFee };
}

// ════════════════════════════════════════════════════════════════
// HOOK PRINCIPALE PROPRIETARIO
// ════════════════════════════════════════════════════════════════
export function useOwnerRealtimePayments(ownerId: string | undefined, month: number, year: number) {
  const [ownerProperties, setOwnerProperties] = useState<any[]>([]);
  const [allCleanings, setAllCleanings] = useState<any[]>([]);
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [allPayments, setAllPayments] = useState<Payment[]>([]);

  const [propsLoaded, setPropsLoaded] = useState(false);
  const [inventoryLoaded, setInventoryLoaded] = useState(staticCache.loaded);
  const [cleaningsLoaded, setCleaningsLoaded] = useState(false);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [paymentsLoaded, setPaymentsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unsubscribesRef = useRef<Unsubscribe[]>([]);
  const loadedRef = useRef<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refresh = useCallback(() => {
    staticCache.loaded = false;
    setInventoryLoaded(false);
    loadedRef.current = null;
    setRefreshTrigger(t => t + 1);
  }, []);

  const loading = !propsLoaded || !inventoryLoaded || !cleaningsLoaded || !ordersLoaded || !paymentsLoaded;

  const rangeStart = useMemo(() => new Date(year - 1, 6, 1), [year]);
  const rangeEnd = useMemo(() => new Date(year, 11, 31, 23, 59, 59, 999), [year]);

  // ═══════════════════════════════════════════════════════════
  // SETUP ONSNAPSHOT
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (!ownerId) return;

    const currentKey = `${ownerId}-${year}-${refreshTrigger}`;
    if (loadedRef.current === currentKey) return;

    // Cleanup
    unsubscribesRef.current.forEach(u => { try { u(); } catch {} });
    unsubscribesRef.current = [];
    setPropsLoaded(false);
    setCleaningsLoaded(false);
    setOrdersLoaded(false);
    setPaymentsLoaded(false);
    setError(null);

    const startTs = Timestamp.fromDate(rangeStart);
    const endTs = Timestamp.fromDate(rangeEnd);
    let mounted = true;

    async function setup() {
      const ok = await loadInventory();
      if (!mounted) return;
      if (!ok) { setError("Errore caricamento inventario"); return; }
      setInventoryLoaded(true);

      // Proprietà del proprietario
      const propsSnap = await getDocs(
        query(collection(db, "properties"), where("ownerId", "==", ownerId), where("status", "==", "ACTIVE"))
      );
      if (!mounted) return;
      const props = propsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
      setOwnerProperties(props);
      setPropsLoaded(true);

      const propertyIds = props.map(p => p.id);
      if (propertyIds.length === 0) {
        setCleaningsLoaded(true);
        setOrdersLoaded(true);
        setPaymentsLoaded(true);
        loadedRef.current = currentKey;
        return;
      }

      // Cleanings
      const unsubC = onSnapshot(
        query(collection(db, "cleanings"), where("scheduledDate", ">=", startTs), where("scheduledDate", "<=", endTs)),
        (snap) => {
          if (!mounted) return;
          const data = snap.docs
            .map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }))
            .filter((c: any) => c.status === "COMPLETED" && propertyIds.includes(c.propertyId));
          setAllCleanings(data);
          setCleaningsLoaded(true);
        },
        () => { if (mounted) setError("Errore caricamento pulizie"); }
      );
      unsubscribesRef.current.push(unsubC);

      // Orders — carica tutti, il filtro status avviene nel useMemo
      // dove abbiamo accesso anche alle pulizie COMPLETED
      const unsubO = onSnapshot(
        query(collection(db, "orders"), where("scheduledDate", ">=", startTs), where("scheduledDate", "<=", endTs)),
        (snap) => {
          if (!mounted) return;
          const data = snap.docs
            .map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }))
            .filter((o: any) => propertyIds.includes(o.propertyId) && o.status !== "CANCELLED");
          setAllOrders(data);
          setOrdersLoaded(true);
        },
        () => { if (mounted) setError("Errore caricamento ordini"); }
      );
      unsubscribesRef.current.push(unsubO);

      // Payments
      const unsubP = onSnapshot(
        query(collection(db, "payments"), where("proprietarioId", "==", ownerId)),
        (snap) => {
          if (!mounted) return;
          const data = snap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) })) as Payment[];
          setAllPayments(data);
          setPaymentsLoaded(true);
        },
        () => { if (mounted) setError("Errore caricamento pagamenti"); }
      );
      unsubscribesRef.current.push(unsubP);

      loadedRef.current = currentKey;
    }

    setup();

    return () => {
      mounted = false;
      unsubscribesRef.current.forEach(u => { try { u(); } catch {} });
      unsubscribesRef.current = [];
    };
  }, [ownerId, year, refreshTrigger, rangeStart, rangeEnd]);

  // ═══════════════════════════════════════════════════════════
  // CALCOLO MESE SELEZIONATO
  // ═══════════════════════════════════════════════════════════
  const { stats, summary } = useMemo(() => {
    if (loading || !ownerId || ownerProperties.length === 0) {
      return { stats: null as OwnerStats | null, summary: null as OwnerSummary | null };
    }

    // Pulizie: solo COMPLETED
    const monthCleanings = allCleanings
      .filter(c => c.status === "COMPLETED")
      .filter(c => isInMonth(c.scheduledDate, month, year));

    // Set di cleaningId delle pulizie COMPLETED (per sapere quali ordini includere)
    const completedCleaningIds = new Set(monthCleanings.map(c => c.id));

    // Ordini: DELIVERED oppure collegati a pulizia COMPLETED
    const monthOrders = allOrders
      .filter(o => isInMonth(o.deliveredAt || o.scheduledDate, month, year))
      .filter(o => {
        // Ordine consegnato → sempre incluso
        if (o.status === "DELIVERED") return true;
        // Ordine con cleaningId di una pulizia COMPLETED → incluso (biancheria usata)
        if (o.cleaningId && completedCleaningIds.has(o.cleaningId)) return true;
        return false;
      })
      .map(processOrder);
    const monthPayments = allPayments.filter(p => p.month === month && p.year === year);

    let cleaningsCount = 0, cleaningsTotal = 0;
    let ordersCount = 0, ordersTotal = 0;
    let kitCortesiaCount = 0, kitCortesiaTotal = 0;
    let serviziExtraCount = 0, serviziExtraTotal = 0;
    const services: ServiceDetail[] = [];

    monthCleanings.forEach(cleaning => {
      const prop = ownerProperties.find(p => p.id === cleaning.propertyId);
      if (!prop) return;
      const basePrice = cleaning.price || prop.cleaningPrice || 0;
      const effectivePrice = cleaning.priceOverride ?? basePrice;
      cleaningsCount++;
      cleaningsTotal += effectivePrice;

      services.push({
        id: cleaning.id, type: "PULIZIA",
        date: cleaning.scheduledDate?.toDate?.() || new Date(),
        propertyId: cleaning.propertyId,
        propertyName: cleaning.propertyName || prop.name || "Proprietà",
        propertyImage: prop.images?.door || prop.imageUrl,
        description: cleaning.type === "deep" ? "Pulizia Approfondita" : "Pulizia Standard",
        originalPrice: basePrice, effectivePrice,
        hasOverride: cleaning.priceOverride !== undefined && cleaning.priceOverride !== null,
        overrideReason: cleaning.priceOverrideReason,
        laundryOrderId: cleaning.laundryOrderId,
      });
    });

    monthOrders.forEach(order => {
      const prop = ownerProperties.find(p => p.id === order.propertyId);
      if (!prop) return;
      const effectivePrice = order.totalPriceOverride ?? order.calculatedTotal;
      const serviceType = mapCategoryToServiceType(order.mainCategory);

      if (serviceType === "KIT_CORTESIA") { kitCortesiaCount++; kitCortesiaTotal += effectivePrice; }
      else if (serviceType === "SERVIZI_EXTRA") { serviziExtraCount++; serviziExtraTotal += effectivePrice; }
      else { ordersCount++; ordersTotal += effectivePrice; }

      services.push({
        id: order.id, type: serviceType,
        date: order.deliveredAt?.toDate?.() || order.scheduledDate?.toDate?.() || new Date(),
        propertyId: order.propertyId,
        propertyName: order.propertyName || prop.name || "Proprietà",
        propertyImage: prop.images?.door || prop.imageUrl,
        description: `${order.itemDetails.length} articoli`,
        originalPrice: order.calculatedTotal, effectivePrice,
        hasOverride: order.totalPriceOverride !== undefined && order.totalPriceOverride !== null,
        overrideReason: order.priceOverrideReason,
        items: order.itemDetails, cleaningId: order.cleaningId,
      });
    });

    services.sort((a, b) => a.date.getTime() - b.date.getTime());

    const totaleCalcolato = cleaningsTotal + ordersTotal + kitCortesiaTotal + serviziExtraTotal;
    const totalePagato = monthPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const saldo = totaleCalcolato - totalePagato;

    let stato: "SALDATO" | "PARZIALE" | "DA_PAGARE" = "DA_PAGARE";
    if (saldo <= 0) stato = "SALDATO";
    else if (totalePagato > 0) stato = "PARZIALE";

    // Stats per proprietà
    const statsByProperty = ownerProperties.map(prop => {
      const propServices = services.filter(s => s.propertyId === prop.id);
      const propTotal = propServices.reduce((sum, s) => sum + s.effectivePrice, 0);
      // Conta servizi: pulizia + biancheria collegata = 1 servizio
      const cleanings = propServices.filter(s => s.type === "PULIZIA");
      const linkedOrderIds = new Set(cleanings.map(c => c.laundryOrderId).filter(Boolean));
      const standaloneOrders = propServices.filter(s => s.type !== "PULIZIA" && !linkedOrderIds.has(s.id) && !cleanings.some(c => c.id === s.cleaningId));
      return {
        propertyId: prop.id,
        propertyName: prop.name,
        propertyImage: prop.images?.door || prop.imageUrl,
        servicesCount: cleanings.length + standaloneOrders.length,
        cleaningsCount: cleanings.length,
        ordersCount: propServices.filter(s => s.type !== "PULIZIA").length,
        total: propTotal,
        services: propServices,
      };
    }).filter(p => p.servicesCount > 0);

    const ownerStats: OwnerStats = {
      proprietarioId: ownerId,
      proprietarioName: ownerProperties[0]?.ownerName || "Proprietario",
      propertyCount: ownerProperties.length,
      cleaningsCount, cleaningsTotal, ordersCount, ordersTotal,
      kitCortesiaCount, kitCortesiaTotal, serviziExtraCount, serviziExtraTotal,
      totaleCalcolato, totaleEffettivo: totaleCalcolato, hasOverride: false,
      payments: monthPayments, totalePagato, saldo, stato, services, statsByProperty,
    };

    const ownerSummary: OwnerSummary = {
      totaleServizi: totaleCalcolato,
      totalePagato,
      totaleDovuto: Math.max(0, saldo),
      totaleContanti: monthPayments.filter(p => p.method === "CONTANTI").reduce((s, p) => s + (p.amount || 0), 0),
      totaleBonifico: monthPayments.filter(p => p.method === "BONIFICO").reduce((s, p) => s + (p.amount || 0), 0),
      totaleAltro: monthPayments.filter(p => p.method === "ALTRO").reduce((s, p) => s + (p.amount || 0), 0),
    };

    return { stats: ownerStats, summary: ownerSummary };
  }, [month, year, loading, ownerId, ownerProperties, allCleanings, allOrders, allPayments]);

  return { loading, error, stats, summary, refresh };
}
