"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { 
  collection, query, where, getDocs, Timestamp, 
  onSnapshot} from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import type { Unsubscribe } from "firebase/firestore";

// ══════════════════════════════════════════════════════════════════
// ⚡ ARCHITETTURA PERFORMANCE
//
// PRIMA: ogni cambio mese → 3 onSnapshot smontati + 3 rimontati
//        + query limit(500) senza filtro data → scarica TUTTO
//        + timeline fa altre 3 query limit(1000) → scarica TUTTO di nuovo
//        = 6 query, ~3000 doc scaricati, spinner ad ogni click
//
// ORA:   1 set di 3 onSnapshot per l'intero anno → dati in memoria
//        cambio mese = useMemo filtra in memoria → 0ms ISTANTANEO
//        timeline = stessi dati in memoria → 0 fetch extra
//        = 3 query con filtro date, ~300 doc, spinner solo al primo load
//
// CON 1000 CASE: ~4000 doc/anno caricati in ~2s una volta sola
//                poi tutto istantaneo + real-time via onSnapshot
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

export interface ClientStats {
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
}

export interface Summary {
  totaleServizi: number;
  totalePagato: number;
  totaleDovuto: number;
  clientiTotali: number;
  clientiConDebiti: number;
  totaleContanti: number;
  totaleBonifico: number;
  totaleIncassato: number;
  saldoTotale: number;
  clientiConSaldo: number;
  clientiSaldati: number;
  totaleAltro: number;
}

export interface PropertyWithoutPrice {
  id: string;
  name: string;
  ownerId: string;
  ownerName: string;
}

// ==================== CACHE DATI STATICI (proprietà + inventario) ====================
interface StaticCache {
  properties: Map<string, any>;
  inventory: Map<string, any>;
  loaded: boolean;
}

const staticCache: StaticCache = {
  properties: new Map(),
  inventory: new Map(),
  loaded: false,
};

async function loadStaticData(): Promise<boolean> {
  if (staticCache.loaded) return true;

  try {
    const startTime = Date.now();

    const [propsSnap, inventorySnap] = await Promise.all([
      getDocs(query(collection(db, "properties"), where("status", "==", "ACTIVE"))),
      getDocs(collection(db, "inventory")),
    ]);

    staticCache.properties.clear();
    propsSnap.docs.forEach(doc => {
      const data = doc.data() as Record<string, any>;
      staticCache.properties.set(doc.id, {
        id: doc.id, ...data,
        cleaningPrice: data.cleaningPrice || 0,
      });
    });

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
    console.error("❌ Errore caricamento dati statici:", error);
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

  // 💰 Aggiungi costo consegna se presente e abilitato
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
// HOOK PRINCIPALE
//
// Carica 18 MESI di dati (anno corrente + 6 mesi prima) con onSnapshot
// Cambio mese = useMemo filtra in memoria → ISTANTANEO
// ════════════════════════════════════════════════════════════════
export function useRealtimePayments(month: number, year: number) {
  // Tutti i dati del range caricato — aggiornati real-time via onSnapshot
  const [allCleanings, setAllCleanings] = useState<any[]>([]);
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [allPayments, setAllPayments] = useState<Payment[]>([]);

  // Loading states
  const [staticLoaded, setStaticLoaded] = useState(staticCache.loaded);
  const [cleaningsLoaded, setCleaningsLoaded] = useState(false);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [paymentsLoaded, setPaymentsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unsubscribesRef = useRef<Unsubscribe[]>([]);
  const loadedRangeRef = useRef<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refresh = useCallback(() => {
    staticCache.loaded = false;
    setStaticLoaded(false);
    loadedRangeRef.current = null;
    setRefreshTrigger(t => t + 1);
  }, []);

  const loading = !staticLoaded || !cleaningsLoaded || !ordersLoaded || !paymentsLoaded;

  // Calcola range: dal 1 luglio anno precedente al 31 dicembre anno corrente
  // Copre: 6 mesi timeline indietro + intero anno corrente + possibilità di navigare avanti
  const rangeKey = `${year}`;
  const rangeStart = useMemo(() => new Date(year - 1, 6, 1), [year]); // 1 luglio anno-1
  const rangeEnd = useMemo(() => new Date(year, 11, 31, 23, 59, 59, 999), [year]); // 31 dic anno

  // ═══════════════════════════════════════════════════════════
  // SETUP ONSNAPSHOT — Si attiva UNA VOLTA (o quando cambia anno)
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    const currentRange = `${rangeKey}-${refreshTrigger}`;
    if (loadedRangeRef.current === currentRange) return;

    const t0 = Date.now();

    // Cleanup
    unsubscribesRef.current.forEach(u => { try { u(); } catch {} });
    unsubscribesRef.current = [];
    setCleaningsLoaded(false);
    setOrdersLoaded(false);
    setPaymentsLoaded(false);
    setError(null);

    const startTs = Timestamp.fromDate(rangeStart);
    const endTs = Timestamp.fromDate(rangeEnd);
    let mounted = true;

    async function setup() {
      const ok = await loadStaticData();
      if (!mounted) return;
      if (!ok) { setError("Errore caricamento dati statici"); return; }
      setStaticLoaded(true);

      // ⚡ CLEANINGS — intero range, filtro scheduledDate
      const unsubC = onSnapshot(
        query(
          collection(db, "cleanings"),
          where("scheduledDate", ">=", startTs),
          where("scheduledDate", "<=", endTs)
        ),
        (snap) => {
          if (!mounted) return;
          const data = snap.docs
            .map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }))
            // @ts-expect-error TODO-FIX: TS2339 Property 'status' does not exist on type '{ id: string; }'.
            .filter(c => c.status === "COMPLETED");
          setAllCleanings(data);
          setCleaningsLoaded(true);
        },
        () => { if (mounted) setError("Errore caricamento pulizie"); }
      );
      unsubscribesRef.current.push(unsubC);

      // ⚡ ORDERS — carica tutti (non CANCELLED), filtro status nel useMemo
      const unsubO = onSnapshot(
        query(
          collection(db, "orders"),
          where("scheduledDate", ">=", startTs),
          where("scheduledDate", "<=", endTs)
        ),
        (snap) => {
          if (!mounted) return;
          const data = snap.docs
            .map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }))
            // @ts-expect-error TODO-FIX: TS2339 Property 'status' does not exist on type '{ id: string; }'.
            .filter(o => o.status !== "CANCELLED");
          setAllOrders(data);
          setOrdersLoaded(true);
        },
        () => { if (mounted) setError("Errore caricamento ordini"); }
      );
      unsubscribesRef.current.push(unsubO);

      // ⚡ PAYMENTS — tutti (sono pochi, ~100/anno max, e servono per la timeline cross-anno)
      const unsubP = onSnapshot(
        collection(db, "payments"),
        (snap) => {
          if (!mounted) return;
          const data = snap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) })) as Payment[];
          setAllPayments(data);
          setPaymentsLoaded(true);
        },
        () => { if (mounted) setError("Errore caricamento pagamenti"); }
      );
      unsubscribesRef.current.push(unsubP);

      loadedRangeRef.current = currentRange;
    }

    setup();

    return () => {
      mounted = false;
      unsubscribesRef.current.forEach(u => { try { u(); } catch {} });
      unsubscribesRef.current = [];
    };
  }, [rangeKey, refreshTrigger, rangeStart, rangeEnd]);

  // ═══════════════════════════════════════════════════════════
  // CALCOLO MESE SELEZIONATO — 0ms, solo filtro in memoria
  // ═══════════════════════════════════════════════════════════
  const { clients, summary, propertiesWithoutPrice } = useMemo(() => {
    if (loading || !staticCache.loaded) {
      return { clients: [] as ClientStats[], summary: null, propertiesWithoutPrice: [] as PropertyWithoutPrice[] };
    }

    // Pulizie: solo COMPLETED
    const monthCleanings = allCleanings
      .filter(c => c.status === "COMPLETED")
      .filter(c => isInMonth(c.scheduledDate, month, year));

    // Set di cleaningId delle pulizie COMPLETED
    const completedCleaningIds = new Set(monthCleanings.map(c => c.id));

    // Ordini: DELIVERED oppure collegati a pulizia COMPLETED
    const monthOrders = allOrders
      .filter(o => isInMonth(o.deliveredAt || o.scheduledDate, month, year))
      .filter(o => {
        if (o.status === "DELIVERED") return true;
        if (o.cleaningId && completedCleaningIds.has(o.cleaningId)) return true;
        return false;
      })
      .map(processOrder);
    const monthPayments = allPayments.filter(p => Number(p.month) === Number(month) && Number(p.year) === Number(year));

    // Raggruppa proprietà per owner
    const propertiesByOwner = new Map<string, any[]>();
    const ownerNames = new Map<string, string>();
    const propsWithoutPrice: PropertyWithoutPrice[] = [];

    staticCache.properties.forEach((prop) => {
      const ownerId = prop.ownerId || "unknown";
      const ownerName = prop.ownerName || "Proprietario sconosciuto";
      if (!propertiesByOwner.has(ownerId)) {
        propertiesByOwner.set(ownerId, []);
        ownerNames.set(ownerId, ownerName);
      }
      propertiesByOwner.get(ownerId)!.push(prop);
      if (!prop.cleaningPrice || prop.cleaningPrice <= 0) {
        propsWithoutPrice.push({ id: prop.id, name: prop.name, ownerId, ownerName });
      }
    });

    // Calcola stats per ogni proprietario
    const stats: ClientStats[] = [];

    for (const [ownerId, ownerProperties] of propertiesByOwner) {
      const ownerName = ownerNames.get(ownerId) || "Sconosciuto";
      const propertyIds = ownerProperties.map((p: any) => p.id);

      let cleaningsCount = 0, cleaningsTotal = 0;
      let ordersCount = 0, ordersTotal = 0;
      let kitCortesiaCount = 0, kitCortesiaTotal = 0;
      let serviziExtraCount = 0, serviziExtraTotal = 0;
      const services: ServiceDetail[] = [];

      // Cleanings del mese per questo proprietario
      monthCleanings.forEach(cleaning => {
        if (propertyIds.includes(cleaning.propertyId)) {
          const prop = staticCache.properties.get(cleaning.propertyId);
          const basePrice = cleaning.price || prop?.cleaningPrice || 0;
          const rtHFee = cleaning.holidayFee ?? 0;
          const effectivePrice = (cleaning.priceOverride ?? basePrice) + rtHFee;
          cleaningsCount++;
          cleaningsTotal += effectivePrice;

          services.push({
            id: cleaning.id, type: "PULIZIA",
            date: cleaning.scheduledDate?.toDate?.() || new Date(),
            propertyId: cleaning.propertyId,
            propertyName: cleaning.propertyName || prop?.name || "Proprietà",
            propertyImage: prop?.images?.door || prop?.imageUrl,
            description: cleaning.type === "deep" ? "Pulizia Approfondita" : "Pulizia Standard",
            originalPrice: basePrice, effectivePrice,
            hasOverride: cleaning.priceOverride !== undefined && cleaning.priceOverride !== null,
            overrideReason: cleaning.priceOverrideReason,
            laundryOrderId: cleaning.laundryOrderId,
          });
        }
      });

      // Orders del mese per questo proprietario
      monthOrders.forEach(order => {
        if (propertyIds.includes(order.propertyId)) {
          const prop = staticCache.properties.get(order.propertyId);
          const effectivePrice = order.totalPriceOverride ?? order.calculatedTotal;
          const serviceType = mapCategoryToServiceType(order.mainCategory);

          if (serviceType === "KIT_CORTESIA") { kitCortesiaCount++; kitCortesiaTotal += effectivePrice; }
          else if (serviceType === "SERVIZI_EXTRA") { serviziExtraCount++; serviziExtraTotal += effectivePrice; }
          else { ordersCount++; ordersTotal += effectivePrice; }

          services.push({
            id: order.id, type: serviceType,
            date: order.deliveredAt?.toDate?.() || order.scheduledDate?.toDate?.() || new Date(),
            propertyId: order.propertyId,
            propertyName: order.propertyName || prop?.name || "Proprietà",
            propertyImage: prop?.images?.door || prop?.imageUrl,
            description: `${order.itemDetails.length} articoli`,
            originalPrice: order.calculatedTotal, effectivePrice,
            hasOverride: order.totalPriceOverride !== undefined && order.totalPriceOverride !== null,
            overrideReason: order.priceOverrideReason,
            items: order.itemDetails, cleaningId: order.cleaningId,
          });
        }
      });

      services.sort((a, b) => a.date.getTime() - b.date.getTime());

      const totaleCalcolato = cleaningsTotal + ordersTotal + kitCortesiaTotal + serviziExtraTotal;
      const ownerPayments = monthPayments.filter(p => p.proprietarioId === ownerId);
      const totalePagato = ownerPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const saldo = totaleCalcolato - totalePagato;

      let stato: "SALDATO" | "PARZIALE" | "DA_PAGARE" = "DA_PAGARE";
      if (saldo <= 0) stato = "SALDATO";
      else if (totalePagato > 0) stato = "PARZIALE";

      if (totaleCalcolato > 0 || totalePagato > 0) {
        stats.push({
          proprietarioId: ownerId, proprietarioName: ownerName,
          propertyCount: ownerProperties.length,
          cleaningsCount, cleaningsTotal, ordersCount, ordersTotal,
          kitCortesiaCount, kitCortesiaTotal, serviziExtraCount, serviziExtraTotal,
          totaleCalcolato, totaleEffettivo: totaleCalcolato, hasOverride: false,
          payments: ownerPayments, totalePagato, saldo, stato, services,
        });
      }
    }

    // Ordina: DA_PAGARE > PARZIALE > SALDATO, poi per saldo
    stats.sort((a, b) => {
      const order = { DA_PAGARE: 0, PARZIALE: 1, SALDATO: 2 };
      if (a.stato !== b.stato) return order[a.stato] - order[b.stato];
      return b.saldo - a.saldo;
    });

    // Summary
    const summaryData: Summary = {
      totaleServizi: stats.reduce((s, c) => s + c.totaleCalcolato, 0),
      totalePagato: stats.reduce((s, c) => s + c.totalePagato, 0),
      totaleDovuto: stats.reduce((s, c) => s + Math.max(0, c.saldo), 0),
      clientiTotali: stats.length,
      clientiConDebiti: stats.filter(c => c.saldo > 0).length,
      totaleContanti: monthPayments.filter(p => p.method === "CONTANTI").reduce((sum, p) => sum + (p.amount || 0), 0),
      totaleBonifico: monthPayments.filter(p => p.method === "BONIFICO").reduce((sum, p) => sum + (p.amount || 0), 0),
      totaleIncassato: monthPayments.reduce((sum, p) => sum + (p.amount || 0), 0),
      saldoTotale: stats.reduce((s, c) => s + c.saldo, 0),
      clientiConSaldo: stats.filter(c => c.saldo !== 0).length,
      clientiSaldati: stats.filter(c => c.stato === "SALDATO").length,
      totaleAltro: monthPayments.filter(p => p.method === "ALTRO").reduce((sum, p) => sum + (p.amount || 0), 0),
    };

    return { clients: stats, summary: summaryData, propertiesWithoutPrice: propsWithoutPrice };
  }, [month, year, loading, allCleanings, allOrders, allPayments]);

  return { loading, error, clients, summary, propertiesWithoutPrice, refresh };
}

// ════════════════════════════════════════════════════════════════
// TIMELINE HOOK
//
// ⚡ Usa query filtrate per range date (non limit(1000))
// La timeline copre 6 mesi, i dati sono caricati in ~1 query
// ════════════════════════════════════════════════════════════════
export interface TimelineMonthData {
  month: number;
  year: number;
  status: "NESSUNO" | "PAGATO" | "PARZIALE" | "DA_PAGARE";
  saldo: number;
  totale: number;
}

export interface TimelineClientData {
  proprietarioId: string;
  proprietarioName: string;
  properties: string[];
  months: TimelineMonthData[];
}

export function useRealtimePaymentsTimeline(timelineMonths: { month: number; year: number }[]) {
  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<TimelineClientData[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadTimelineData() {
      if (timelineMonths.length === 0) {
        setTableData([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const t0 = Date.now();

      try {
        await loadStaticData();

        // Range preciso della timeline
        const allDates = timelineMonths.map(m => new Date(m.year, m.month - 1, 1));
        const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
        const maxDate = timelineMonths.reduce((max, m) => {
          const d = new Date(m.year, m.month, 0, 23, 59, 59, 999);
          return d > max ? d : max;
        }, new Date(0));

        // ⚡ Query filtrate per range (non limit(1000) che scarica tutto)
        const [cleaningsSnap, ordersSnap, paymentsSnap] = await Promise.all([
          getDocs(query(
            collection(db, "cleanings"),
            where("scheduledDate", ">=", Timestamp.fromDate(minDate)),
            where("scheduledDate", "<=", Timestamp.fromDate(maxDate))
          )),
          getDocs(query(
            collection(db, "orders"),
            where("scheduledDate", ">=", Timestamp.fromDate(minDate)),
            where("scheduledDate", "<=", Timestamp.fromDate(maxDate))
          )),
          getDocs(collection(db, "payments")),
        ]);

        if (cancelled) return;

        // @ts-expect-error TODO-FIX: TS2339 Property 'status' does not exist on type '{ id: string; }'.
        const cleanings = cleaningsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) })).filter(c => c.status === "COMPLETED");
        // @ts-expect-error TODO-FIX: TS2339 Property 'status' does not exist on type '{ id: string; }'.
        const orders = ordersSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) })).filter(o => o.status !== "CANCELLED");
        const allPayments = paymentsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));

        // Raggruppa proprietà per owner
        const propertiesByOwner = new Map<string, any[]>();
        const ownerNames = new Map<string, string>();

        staticCache.properties.forEach((prop) => {
          const ownerId = prop.ownerId || "unknown";
          const ownerName = prop.ownerName || "Proprietario sconosciuto";
          if (!propertiesByOwner.has(ownerId)) {
            propertiesByOwner.set(ownerId, []);
            ownerNames.set(ownerId, ownerName);
          }
          propertiesByOwner.get(ownerId)!.push(prop);
        });

        const clientsMap = new Map<string, TimelineClientData>();

        for (const { month, year } of timelineMonths) {
          // @ts-expect-error TODO-FIX: TS2339 Property 'status' does not exist on type '{ id: string; }'.
          const monthCleanings = cleanings.filter(c => c.status === "COMPLETED" && isInMonth(c.scheduledDate, month, year));
          const completedCleaningIds = new Set(monthCleanings.map(c => c.id));
          const monthOrders = orders
            // @ts-expect-error TODO-FIX: TS2339 Property 'deliveredAt' does not exist on type '{ id: string; }'.
            .filter(o => isInMonth(o.deliveredAt || o.scheduledDate, month, year))
            .filter(o => {
              // @ts-expect-error TODO-FIX: TS2339 Property 'status' does not exist on type '{ id: string; }'.
              if (o.status === "DELIVERED") return true;
              // @ts-expect-error TODO-FIX: TS2339 Property 'cleaningId' does not exist on type '{ id: string; }'.
              if (o.cleaningId && completedCleaningIds.has(o.cleaningId)) return true;
              return false;
            });
          const monthPayments = allPayments.filter((p: any) => Number(p.month) === Number(month) && Number(p.year) === Number(year));

          for (const [ownerId, ownerProperties] of propertiesByOwner) {
            const propertyIds = ownerProperties.map((p: any) => p.id);
            const ownerName = ownerNames.get(ownerId) || "Sconosciuto";
            const propertyNames = new Set<string>();
            let totaleServizi = 0;

            monthCleanings.forEach(cleaning => {
              // @ts-expect-error TODO-FIX: TS2339 Property 'propertyId' does not exist on type '{ id: string; }'.
              if (propertyIds.includes(cleaning.propertyId)) {
                // @ts-expect-error TODO-FIX: TS2339 Property 'propertyId' does not exist on type '{ id: string; }'.
                const prop = staticCache.properties.get(cleaning.propertyId);
                // @ts-expect-error TODO-FIX: TS2339 Property 'priceOverride' does not exist on type '{ id: string; }'.
                totaleServizi += (cleaning.priceOverride ?? cleaning.price ?? prop?.cleaningPrice ?? 0) + (cleaning.holidayFee ?? 0);
                // @ts-expect-error TODO-FIX: TS2339 Property 'propertyName' does not exist on type '{ id: string; }'.
                propertyNames.add(cleaning.propertyName || prop?.name || "Proprietà");
              }
            });

            monthOrders.forEach(order => {
              // @ts-expect-error TODO-FIX: TS2339 Property 'propertyId' does not exist on type '{ id: string; }'.
              if (propertyIds.includes(order.propertyId)) {
                // @ts-expect-error TODO-FIX: TS2339 Property 'propertyId' does not exist on type '{ id: string; }'.
                const prop = staticCache.properties.get(order.propertyId);
                // @ts-expect-error TODO-FIX: TS2339 Property 'totalPriceOverride' does not exist on type '{ id: string; }'.
                let orderTotal = order.totalPriceOverride ?? 0;
                // @ts-expect-error TODO-FIX: TS2339 Property 'items' does not exist on type '{ id: string; }'.
                if (!orderTotal && order.items) {
                  // @ts-expect-error TODO-FIX: TS2339 Property 'items' does not exist on type '{ id: string; }'.
                  order.items.forEach((item: any) => {
                    const invItem = staticCache.inventory.get(item.itemId || item.id);
                    const price = item.unitPrice ?? item.price ?? invItem?.sellPrice ?? 0;
                    orderTotal += item.totalPrice ?? (price * (item.quantity || 1));
                  });
                }
                // 💰 Aggiungi costo consegna se presente e abilitato
                // @ts-expect-error TODO-FIX: TS2339 Property 'deliveryFee' does not exist on type '{ id: string; }'.
                if (order.deliveryFee && order.deliveryFeeEnabled !== false) {
                  // @ts-expect-error TODO-FIX: TS2339 Property 'deliveryFee' does not exist on type '{ id: string; }'.
                  orderTotal += order.deliveryFee;
                }
                // 🛏️ Aggiungi costo preparazione letti se presente
                // @ts-expect-error TODO-FIX: TS2339
                if (order.bedMaking && order.bedMakingFee) {
                  // @ts-expect-error TODO-FIX: TS2339
                  orderTotal += order.bedMakingFee;
                }
                totaleServizi += orderTotal;
                // @ts-expect-error TODO-FIX: TS2339 Property 'propertyName' does not exist on type '{ id: string; }'.
                propertyNames.add(order.propertyName || prop?.name || "Proprietà");
              }
            });

            const ownerPayments = monthPayments.filter((p: any) => p.proprietarioId === ownerId);
            const totalePagato = ownerPayments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
            const saldo = totaleServizi - totalePagato;

            let status: "NESSUNO" | "PAGATO" | "PARZIALE" | "DA_PAGARE" = "NESSUNO";
            if (totaleServizi > 0) {
              if (saldo <= 0) status = "PAGATO";
              else if (totalePagato > 0) status = "PARZIALE";
              else status = "DA_PAGARE";
            }

            if (totaleServizi > 0 || ownerPayments.length > 0) {
              if (!clientsMap.has(ownerId)) {
                clientsMap.set(ownerId, { proprietarioId: ownerId, proprietarioName: ownerName, properties: [], months: [] });
              }
              const client = clientsMap.get(ownerId)!;
              propertyNames.forEach(name => { if (!client.properties.includes(name)) client.properties.push(name); });
              client.months.push({ month, year, status, saldo, totale: totaleServizi });
            }
          }
        }

        const result = Array.from(clientsMap.values())
          .sort((a, b) => a.proprietarioName.localeCompare(b.proprietarioName));

        setTableData(result);
      } catch (error) {
        console.error("❌ Errore timeline:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadTimelineData();
    return () => { cancelled = true; };
  }, [timelineMonths]);

  return { loading, tableData };
}

// ==================== UTILITY ====================
export function refreshPaymentsCache() {
  staticCache.loaded = false;
  staticCache.properties.clear();
  staticCache.inventory.clear();
}
