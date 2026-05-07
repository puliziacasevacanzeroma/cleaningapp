"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { 
  collection, query, where, getDocs, Timestamp, 
  onSnapshot} from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import type { Unsubscribe } from "firebase/firestore";
import {
  computeOwnerCreditFromPriorMonths,
  isCleaningProductItem,
  type DebtCalcProperty,
  type DebtCalcCleaning,
  type DebtCalcOrder,
  type DebtCalcPayment,
  type DebtCalcOverride,
  type DebtCalcInventoryItem,
} from "~/lib/payments/debtCalculator";
import { SYSTEM_ITEMS, OPTIONAL_ITEMS } from "~/lib/inventory/systemItems";

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
  /** Flag per pagamenti auto-generati come credito da eliminazione/esclusione */
  isCreditTransfer?: boolean;
}

export type ItemCategoryGroup = "linen" | "kit_cortesia" | "servizi_extra" | "cleaning_product" | "altro";

export interface OrderItemDetail {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  categoryName: string;
  /**
   * Gruppo logico per la UI: distingue biancheria, kit cortesia,
   * prodotti pulizia operatore (visibili nei dettagli admin per
   * trasparenza interna ma esclusi dai TOTALI fatturati).
   */
  categoryGroup?: ItemCategoryGroup;
}

export interface ServiceDetail {
  id: string;
  type: ServiceType;
  date: Date;
  propertyId: string;
  propertyName: string;
  propertyImage?: string;
  propertyAddress?: string;
  description: string;
  originalPrice: number;
  effectivePrice: number;
  hasOverride: boolean;
  overrideReason?: string;
  items?: OrderItemDetail[];
  /** Solo articoli biancheria (lenzuola, federe, asciugamani, tappetini, ecc.). */
  linenItems?: OrderItemDetail[];
  /** Solo articoli kit cortesia (shampoo, saponetta, crema, bagnoschiuma). */
  kitItems?: OrderItemDetail[];
  /** Subtotale solo biancheria. */
  linenSubtotal?: number;
  /** Subtotale solo kit cortesia. */
  kitSubtotal?: number;
  cleaningId?: string;
  laundryOrderId?: string;
  holidayFee?: number;
  holidayName?: string | null;
  // Esclusione dal billing (opzionale)
  excludedFromBilling?: boolean;
  excludedFromBillingReason?: string;
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
  /**
   * Credito accumulato da pagamenti in eccesso nei mesi PRECEDENTI a quello selezionato.
   * 0 se il cliente non ha mai sovra-pagato. Sempre ≥ 0.
   */
  creditoPrecedente: number;
  /**
   * Saldo del mese tenendo conto del credito precedente.
   * = max(0, saldo - creditoPrecedente). È quello da mostrare al cliente.
   */
  saldoConCredito: number;
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
        categoryName: data.categoryName || data.category || data.categoryId || "Altro",
        categoryId: data.categoryId || data.category || undefined,
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

/**
 * Mappa rapida ID/key → SystemItem (include OPTIONAL_ITEMS) per fallback
 * quando l'inventario in DB non ha registrato un articolo (legacy data).
 */
const SYSTEM_ITEMS_BY_KEY: Record<string, { name: string; categoryId: string }> = (() => {
  const map: Record<string, { name: string; categoryId: string }> = {};
  const all: Array<{ id: string; key: string; name: string; categoryId: string }> = [
    ...SYSTEM_ITEMS.map(i => ({ id: i.id, key: i.key, name: i.name, categoryId: i.categoryId })),
    ...OPTIONAL_ITEMS.map(i => ({ id: i.id, key: i.key, name: i.name, categoryId: i.categoryId })),
  ];
  all.forEach(({ id, key, name, categoryId }) => {
    map[id] = { name, categoryId };
    map[key] = { name, categoryId };
    if (id.startsWith("item_")) map[id.replace("item_", "")] = { name, categoryId };
  });
  return map;
})();

/**
 * Determina se una stringa "sembra" un ID tecnico (snake_case, camelCase,
 * o ID Firestore alfanumerico) piuttosto che un nome leggibile.
 */
function looksLikeRawId(s: string): boolean {
  if (!s || s.length < 4) return false;
  if (/[\s-]/.test(s)) return false;
  if (/^[a-z][a-z0-9_]*_[a-z0-9_]+$/.test(s)) return true;
  if (/^[a-z][a-z0-9]*[A-Z]/.test(s)) return true;
  if (/^[A-Z][a-z0-9]*$/.test(s)) return false;
  if (s.length >= 12) {
    const hasMultipleUpper = (s.match(/[A-Z]/g) || []).length >= 2;
    const hasDigit = /[0-9]/.test(s);
    if (hasMultipleUpper && hasDigit) return true;
  }
  return false;
}

/**
 * Classifica un item in uno dei gruppi UI.
 */
function classifyItemAdmin(item: any, invItem: any): ItemCategoryGroup {
  if (item.type === "cleaning_product") return "cleaning_product";

  const itemCat = (item.categoryId || item.category || "").toLowerCase();
  if (itemCat) {
    if (itemCat === "prodotti_pulizia" || itemCat === "cleaning_products") return "cleaning_product";
    if (itemCat === "kit_cortesia") return "kit_cortesia";
    if (itemCat === "servizi_extra") return "servizi_extra";
    if (itemCat === "biancheria_letto" || itemCat === "biancheria_bagno") return "linen";
  }

  const invCat = (invItem?.categoryId || invItem?.categoryName || "").toLowerCase();
  if (invCat) {
    if (invCat === "prodotti_pulizia" || invCat === "cleaning_products") return "cleaning_product";
    if (invCat === "kit_cortesia") return "kit_cortesia";
    if (invCat === "servizi_extra") return "servizi_extra";
    if (invCat === "biancheria_letto" || invCat === "biancheria_bagno") return "linen";
    if (invCat.includes("cortesia") || invCat.includes("kit")) return "kit_cortesia";
    if (invCat.includes("extra")) return "servizi_extra";
    if (invCat.includes("biancheria") || invCat.includes("linen")) return "linen";
  }

  const itemKey = item.itemId || item.id;
  const sysItem = itemKey ? SYSTEM_ITEMS_BY_KEY[itemKey] : undefined;
  if (sysItem) {
    if (sysItem.categoryId === "biancheria_letto" || sysItem.categoryId === "biancheria_bagno") return "linen";
    if (sysItem.categoryId === "kit_cortesia") return "kit_cortesia";
    if (sysItem.categoryId === "servizi_extra") return "servizi_extra";
    if (sysItem.categoryId === "prodotti_pulizia") return "cleaning_product";
  }

  return "altro";
}

/**
 * Risolve nome leggibile dell'item (PRIORITÀ: inventario, poi
 * SYSTEM_ITEMS, poi item.name solo se non sembra un id).
 */
function resolveItemNameAdmin(item: any, invItem: any): string | null {
  const itemKey = item.itemId || item.id;
  const sysItem = itemKey ? SYSTEM_ITEMS_BY_KEY[itemKey] : undefined;

  if (invItem?.name && invItem.name.trim()) return invItem.name;
  if (sysItem?.name) return sysItem.name;
  if (item.name && typeof item.name === "string" && item.name.trim()) {
    if (!looksLikeRawId(item.name)) return item.name;
  }
  return null;
}

function normNameAdmin(s: string): string {
  return s.toLowerCase().replace(/[\s_-]+/g, "");
}

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

/**
 * Processa un ordine biancheria/kit per la vista admin.
 *
 * 🔒 ESCLUSIONI dai TOTALI fatturati al proprietario:
 *   - Items "cleaning_product" / categoria "prodotti_pulizia"
 *   - Items orfani senza nome risolvibile
 *
 * 🏷️ CATEGORIZZAZIONE:
 *   Ogni item ottiene `categoryGroup` (linen/kit_cortesia/cleaning_product/etc)
 *   per permettere alla UI di mostrare sezioni separate.
 *
 * 🔄 DEDUPLICA: items con stesso nome normalizzato vengono fusi.
 *
 * Nota: a differenza della vista proprietario, l'admin VEDE i cleaning_product
 * nei dettagli (sotto sezione separata) per trasparenza interna, ma il
 * `calculatedTotal` (che è il totale fatturato) li ESCLUDE comunque.
 */
function processOrder(order: any): any {
  const dedupMap = new Map<string, OrderItemDetail>();
  const cleaningProductItems: OrderItemDetail[] = [];
  let calculatedTotal = 0;
  let linenSubtotal = 0;
  let kitSubtotal = 0;
  let mainCategory = "Biancheria";

  if (order.items && Array.isArray(order.items)) {
    for (const item of order.items) {
      const itemKey = item.itemId || item.id;
      const invItem = staticCache.inventory.get(itemKey);

      const name = resolveItemNameAdmin(item, invItem);
      // Skip items orfani (no nome risolvibile)
      if (!name) continue;

      const group = classifyItemAdmin(item, invItem);

      const basePrice = item.unitPrice || item.price || invItem?.sellPrice || 0;
      const unitPrice = item.priceOverride ?? basePrice;
      const quantity = item.quantity || 1;
      const itemTotal = item.totalPrice || (unitPrice * quantity);

      const categoryName =
        item.categoryName ||
        invItem?.categoryName ||
        SYSTEM_ITEMS_BY_KEY[itemKey]?.categoryId ||
        "Altro";

      const detail: OrderItemDetail = {
        itemId: itemKey,
        name,
        quantity,
        unitPrice,
        totalPrice: itemTotal,
        categoryName,
        categoryGroup: group,
      };

      // cleaning_product: salvati a parte (visibili in admin per trasparenza)
      // ma NON sommati al totale fatturato
      if (group === "cleaning_product") {
        cleaningProductItems.push(detail);
        continue;
      }

      // Dedup per nome normalizzato
      const dedupKey = normNameAdmin(name);
      const existing = dedupMap.get(dedupKey);
      if (existing) {
        existing.quantity += quantity;
        existing.totalPrice += itemTotal;
      } else {
        dedupMap.set(dedupKey, detail);
      }

      calculatedTotal += itemTotal;
      if (group === "linen") linenSubtotal += itemTotal;
      else if (group === "kit_cortesia") kitSubtotal += itemTotal;
    }
  }

  const itemDetails = Array.from(dedupMap.values());
  const linenItems = itemDetails.filter(i => i.categoryGroup === "linen");
  const kitItems = itemDetails.filter(i => i.categoryGroup === "kit_cortesia");

  // 🔢 Subtotale "servizi extra" (sempre calcolato, serve per lo split categoria)
  const extraSubtotal = itemDetails
    .filter(i => i.categoryGroup === "servizi_extra")
    .reduce((s, i) => s + i.totalPrice, 0);

  // Determina mainCategory in base al gruppo dominante
  if (kitSubtotal > linenSubtotal && kitSubtotal > extraSubtotal) {
    mainCategory = "Kit Cortesia";
  } else if (extraSubtotal > linenSubtotal && extraSubtotal > kitSubtotal) {
    mainCategory = "Servizi Extra";
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
      categoryGroup: "altro",
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
      categoryGroup: "altro",
    });
  }

  // Aggiungi cleaning_product items in coda (visibili admin, ma NON nel totale)
  // Sono mantenuti separati così l'UI può decidere se mostrarli o no.
  // Per ora li includiamo in itemDetails con categoryGroup="cleaning_product"
  // così l'admin può vederli se serve.
  itemDetails.push(...cleaningProductItems);

  return {
    ...order,
    calculatedTotal,
    itemDetails,
    linenItems,
    kitItems,
    linenSubtotal,
    kitSubtotal,
    // 🆕 Subtotale "servizi extra" (per split corretto nel riepilogo categoria)
    extraSubtotal,
    // 🆕 Subtotale "altro" (delivery + preparazione letti) — segue la mainCategory
    othersSubtotal: deliveryFee + bedMakingFee,
    mainCategory,
    deliveryFee,
    bedMakingFee,
  };
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
  const [allOverrides, setAllOverrides] = useState<any[]>([]);

  // Loading states
  const [staticLoaded, setStaticLoaded] = useState(staticCache.loaded);
  const [cleaningsLoaded, setCleaningsLoaded] = useState(false);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [paymentsLoaded, setPaymentsLoaded] = useState(false);
  const [overridesLoaded, setOverridesLoaded] = useState(false);
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

  const loading = !staticLoaded || !cleaningsLoaded || !ordersLoaded || !paymentsLoaded || !overridesLoaded;

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
    setOverridesLoaded(false);
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

      // ⚡ PAYMENT OVERRIDES — tutti (sono pochi). Servono per il calcolo carryover
      // dei mesi precedenti: se admin ha modificato il totale di un mese passato,
      // il carryover deve usare l'override come "servizi del mese", non la somma raw.
      const unsubOv = onSnapshot(
        collection(db, "paymentOverrides"),
        (snap) => {
          if (!mounted) return;
          const data = snap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
          setAllOverrides(data);
          setOverridesLoaded(true);
        },
        () => { if (mounted) setError("Errore caricamento override"); }
      );
      unsubscribesRef.current.push(unsubOv);

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

    // ════════════════════════════════════════════════════════════════
    // ═══ CARRYOVER: usa la funzione canonica di debtCalculator.ts ═══
    // ════════════════════════════════════════════════════════════════
    // Per ogni proprietario, calcoliamo il credito accumulato dai mesi
    // PRECEDENTI a (month, year) usando ESATTAMENTE la stessa funzione
    // che alimenta:
    //   - useOwnerBalance (modal warning del proprietario)
    //   - computeOwnerDebt server-side (cron email + auto-sblocco)
    //
    // Questo garantisce che la pagina /dashboard/pagamenti mostri lo
    // stesso identico numero di credito che il proprietario riceve via
    // email e vede nel suo modal. Niente più divergenze tra UI admin
    // e fonte di verità canonica.
    //
    // SOSTITUISCE la vecchia logica custom (era ~140 righe inline) che
    // aveva 2 bug noti:
    //   1) Non filtrava ordini per status DELIVERED né per linked-COMPLETED
    //      → conteggiava ordini PENDING/IN_PRODUCTION come servizi del
    //        mese precedente, mascherando crediti reali.
    //   2) Doppia gestione paymentOverrides asimmetrica vs canonical.
    //
    // Ref: debtCalculator.ts → computeOwnerCreditFromPriorMonths
    // ════════════════════════════════════════════════════════════════
    const creditByOwner = new Map<string, number>();
    {
      // Pre-conversione dati raw → tipi DebtCalc (zero loss)
      // Pulizie: passiamo le COMPLETED del range (allCleanings è già filtrato)
      const cleaningsForCalc: DebtCalcCleaning[] = allCleanings.map((c: any) => ({
        id: c.id,
        propertyId: c.propertyId,
        status: c.status,
        scheduledDate: c.scheduledDate,
        price: c.price,
        priceOverride: c.priceOverride,
        holidayFee: c.holidayFee,
        excludedFromBilling: c.excludedFromBilling,
      }));

      // Ordini: il canonical filtra internamente per DELIVERED ∨ linked-COMPLETED
      // e per excludedFromBilling. Passiamo tutto allOrders (già escluso CANCELLED).
      const ordersForCalc: DebtCalcOrder[] = allOrders.map((o: any) => ({
        id: o.id,
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
      }));

      const paymentsForCalc: DebtCalcPayment[] = allPayments.map((p: any) => ({
        proprietarioId: p.proprietarioId,
        month: Number(p.month),
        year: Number(p.year),
        amount: p.amount || 0,
        method: p.method,
        // ⚠️ Cruciale: passare il flag isCreditTransfer per evitare doppio
        // conteggio col carryover passivo (vedi commento debtCalculator.ts:86-91)
        isCreditTransfer: p.isCreditTransfer === true,
      }));

      // Mappa override globale per (ownerId + monthKey) — usata sotto
      const overridesByOwnerMonth = new Map<string, Map<string, DebtCalcOverride>>();
      for (const ov of allOverrides) {
        const oOid = ov.proprietarioId;
        const oM = Number(ov.month);
        const oY = Number(ov.year);
        if (!oOid || !oM || !oY) continue;
        if (typeof ov.overrideTotal !== "number") continue;
        if (!overridesByOwnerMonth.has(oOid)) {
          overridesByOwnerMonth.set(oOid, new Map());
        }
        overridesByOwnerMonth.get(oOid)!.set(`${oY}-${String(oM).padStart(2, "0")}`, {
          proprietarioId: oOid,
          month: oM,
          year: oY,
          overrideTotal: ov.overrideTotal,
          reason: ov.reason,
        });
      }

      // staticCache.inventory ha già la shape giusta (sellPrice/price),
      // compatibile con DebtCalcInventoryItem. Cast diretto.
      const inventoryById = staticCache.inventory as unknown as Map<string, DebtCalcInventoryItem>;

      // Per ogni proprietario, costruisco propertiesById (solo SUE proprietà)
      // e chiamo computeOwnerCreditFromPriorMonths (canonical).
      // Il filtro per propertyId è già gestito internamente dal canonical
      // tramite propertiesById.has(...) — cleanings/orders di altre proprietà
      // vengono scartati automaticamente.
      propertiesByOwner.forEach((ownerProps, ownerId) => {
        const ownerPropertiesById = new Map<string, DebtCalcProperty>(
          ownerProps.map((p: any) => [p.id, { id: p.id, cleaningPrice: p.cleaningPrice || 0 }])
        );

        // Filtro pagamenti del SOLO proprietario (per efficienza, e perché
        // la funzione canonica riceve già un payment list filtrato in
        // useOwnerBalance — manteniamo lo stesso pattern)
        const ownerPaymentsForCalc = paymentsForCalc.filter(
          (p) => p.proprietarioId === ownerId
        );

        const credit = computeOwnerCreditFromPriorMonths({
          month, year,
          propertiesById: ownerPropertiesById,
          cleanings: cleaningsForCalc,
          orders: ordersForCalc,
          payments: ownerPaymentsForCalc,
          inventoryById,
          overridesByMonth: overridesByOwnerMonth.get(ownerId),
          monthsBack: 24,
        });

        if (credit > 0.01) creditByOwner.set(ownerId, credit);
      });
    }

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
          // Se è escluso dal billing, non lo conto nel totale ma lo mostro
          // comunque nella lista servizi (per consentire riinclusione/rimozione)
          const isExcluded = (cleaning as any).excludedFromBilling === true;
          if (!isExcluded) {
            cleaningsCount++;
            cleaningsTotal += effectivePrice;
          }

          services.push({
            id: cleaning.id, type: "PULIZIA",
            date: cleaning.scheduledDate?.toDate?.() || new Date(),
            propertyId: cleaning.propertyId,
            propertyName: cleaning.propertyName || prop?.name || "Proprietà",
            propertyImage: prop?.images?.door || prop?.imageUrl,
            propertyAddress: prop?.address || undefined,
            description: cleaning.type === "deep" ? "Pulizia Approfondita" : "Pulizia Standard",
            originalPrice: basePrice, effectivePrice,
            hasOverride: cleaning.priceOverride !== undefined && cleaning.priceOverride !== null,
            overrideReason: cleaning.priceOverrideReason,
            laundryOrderId: cleaning.laundryOrderId,
            holidayFee: rtHFee,
            holidayName: cleaning.holidayName || null,
            // ⚠️ Propaga flag esclusione per UI (badge, gestione re-inclusione)
            excludedFromBilling: isExcluded,
            excludedFromBillingReason: (cleaning as any).excludedFromBillingReason,
          } as any);
        }
      });

      // Orders del mese per questo proprietario
      monthOrders.forEach(order => {
        if (propertyIds.includes(order.propertyId)) {
          const prop = staticCache.properties.get(order.propertyId);
          const effectivePrice = order.totalPriceOverride ?? order.calculatedTotal;
          const serviceType = mapCategoryToServiceType(order.mainCategory);

          // Se è escluso dal billing, non lo conto nel totale ma lo mostro
          const isExcluded = (order as any).excludedFromBilling === true;
          if (!isExcluded) {
            // 🔄 SPLIT PER CATEGORIA: un singolo ordine può contenere
            // biancheria + kit + servizi extra + delivery/bedmaking.
            // Lo scorporo per categoria così il riepilogo mostra correttamente
            // ogni voce, anche quando l'ordine ha mainCategory=BIANCHERIA ma
            // contiene anche kit cortesia (caso più frequente).
            const linenSub  = order.linenSubtotal  ?? 0;
            const kitSub    = order.kitSubtotal    ?? 0;
            const extraSub  = order.extraSubtotal  ?? 0;
            const othersSub = order.othersSubtotal ?? 0;
            // Le voci "altro" (delivery + bedmaking) seguono la mainCategory dell'ordine
            const linenPart = linenSub + (serviceType === "BIANCHERIA"     ? othersSub : 0);
            const kitPart   = kitSub   + (serviceType === "KIT_CORTESIA"   ? othersSub : 0);
            const extraPart = extraSub + (serviceType === "SERVIZI_EXTRA"  ? othersSub : 0);
            const rawTotal  = linenPart + kitPart + extraPart;
            // Scaling proporzionale per riflettere eventuale totalPriceOverride
            const ratio = rawTotal > 0 ? effectivePrice / rawTotal : 1;
            const linenScaled = linenPart * ratio;
            const kitScaled   = kitPart   * ratio;
            const extraScaled = extraPart * ratio;

            if (linenScaled > 0.001) { ordersCount++;       ordersTotal       += linenScaled; }
            if (kitScaled   > 0.001) { kitCortesiaCount++;  kitCortesiaTotal  += kitScaled; }
            if (extraScaled > 0.001) { serviziExtraCount++; serviziExtraTotal += extraScaled; }

            // Edge case: ordine con rawTotal=0 ma effectivePrice>0 (override su ordine vuoto):
            // ricado sulla categoria nominale per non perdere il valore
            if (rawTotal <= 0.001 && effectivePrice > 0.001) {
              if (serviceType === "KIT_CORTESIA")      { kitCortesiaCount++;  kitCortesiaTotal  += effectivePrice; }
              else if (serviceType === "SERVIZI_EXTRA"){ serviziExtraCount++; serviziExtraTotal += effectivePrice; }
              else                                     { ordersCount++;       ordersTotal       += effectivePrice; }
            }
          }

          services.push({
            id: order.id, type: serviceType,
            date: order.deliveredAt?.toDate?.() || order.scheduledDate?.toDate?.() || new Date(),
            propertyId: order.propertyId,
            propertyName: order.propertyName || prop?.name || "Proprietà",
            propertyImage: prop?.images?.door || prop?.imageUrl,
            propertyAddress: prop?.address || undefined,
            description: `${order.itemDetails.length} articoli`,
            originalPrice: order.calculatedTotal, effectivePrice,
            hasOverride: order.totalPriceOverride !== undefined && order.totalPriceOverride !== null,
            overrideReason: order.priceOverrideReason,
            items: order.itemDetails,
            linenItems: order.linenItems,
            kitItems: order.kitItems,
            linenSubtotal: order.linenSubtotal,
            kitSubtotal: order.kitSubtotal,
            cleaningId: order.cleaningId,
            // ⚠️ Propaga flag esclusione per UI
            excludedFromBilling: isExcluded,
            excludedFromBillingReason: (order as any).excludedFromBillingReason,
          } as any);
        }
      });

      services.sort((a, b) => a.date.getTime() - b.date.getTime());

      const totaleCalcolato = cleaningsTotal + ordersTotal + kitCortesiaTotal + serviziExtraTotal;
      const ownerPayments = monthPayments.filter(p => p.proprietarioId === ownerId);
      // ⚠️ Escludo isCreditTransfer per evitare doppio conteggio col carryover
      const totalePagato = ownerPayments
        .filter(p => (p as any).isCreditTransfer !== true)
        .reduce((sum, p) => sum + (p.amount || 0), 0);
      const saldo = totaleCalcolato - totalePagato;

      // ═══ CARRYOVER: applica credito da mesi precedenti se disponibile ═══
      const creditoPrecedente = creditByOwner.get(ownerId) || 0;
      const saldoConCredito = Math.max(0, saldo - creditoPrecedente);

      let stato: "SALDATO" | "PARZIALE" | "DA_PAGARE" = "DA_PAGARE";
      if (saldoConCredito <= 0.01) stato = "SALDATO";
      else if (totalePagato > 0 || creditoPrecedente > 0) stato = "PARZIALE";

      if (totaleCalcolato > 0 || totalePagato > 0 || creditoPrecedente > 0) {
        stats.push({
          proprietarioId: ownerId, proprietarioName: ownerName,
          propertyCount: ownerProperties.length,
          cleaningsCount, cleaningsTotal, ordersCount, ordersTotal,
          kitCortesiaCount, kitCortesiaTotal, serviziExtraCount, serviziExtraTotal,
          totaleCalcolato, totaleEffettivo: totaleCalcolato, hasOverride: false,
          payments: ownerPayments, totalePagato, saldo, creditoPrecedente, saldoConCredito, stato, services,
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
    // ⚠️ Per i totali metodo-pagamento, escludo isCreditTransfer (non sono cash flow nuovi,
    // sono solo spostamenti contabili interni del sistema dal mese sorgente al target)
    const realPayments = monthPayments.filter(p => (p as any).isCreditTransfer !== true);
    const summaryData: Summary = {
      totaleServizi: stats.reduce((s, c) => s + c.totaleCalcolato, 0),
      totalePagato: stats.reduce((s, c) => s + c.totalePagato, 0),
      totaleDovuto: stats.reduce((s, c) => s + Math.max(0, c.saldo), 0),
      clientiTotali: stats.length,
      clientiConDebiti: stats.filter(c => c.saldo > 0).length,
      totaleContanti: realPayments.filter(p => p.method === "CONTANTI").reduce((sum, p) => sum + (p.amount || 0), 0),
      totaleBonifico: realPayments.filter(p => p.method === "BONIFICO").reduce((sum, p) => sum + (p.amount || 0), 0),
      totaleIncassato: realPayments.reduce((sum, p) => sum + (p.amount || 0), 0),
      saldoTotale: stats.reduce((s, c) => s + c.saldo, 0),
      clientiConSaldo: stats.filter(c => c.saldo !== 0).length,
      clientiSaldati: stats.filter(c => c.stato === "SALDATO").length,
      totaleAltro: realPayments.filter(p => p.method === "ALTRO").reduce((sum, p) => sum + (p.amount || 0), 0),
    };

    return { clients: stats, summary: summaryData, propertiesWithoutPrice: propsWithoutPrice };
  }, [month, year, loading, allCleanings, allOrders, allPayments, allOverrides]);

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
            })
            // ⚡ Allinea calcolo a quello della lista (esclude cleaning_product,
            //    items orfani, somma delivery+bedmaking dentro calculatedTotal,
            //    rispetta priceOverride per item).
            .map(processOrder);
          const monthPayments = allPayments.filter((p: any) => Number(p.month) === Number(month) && Number(p.year) === Number(year));

          for (const [ownerId, ownerProperties] of propertiesByOwner) {
            const propertyIds = ownerProperties.map((p: any) => p.id);
            const ownerName = ownerNames.get(ownerId) || "Sconosciuto";
            const propertyNames = new Set<string>();
            let totaleServizi = 0;

            monthCleanings.forEach(cleaning => {
              // @ts-expect-error TODO-FIX: TS2339 Property 'propertyId' does not exist on type '{ id: string; }'.
              if (propertyIds.includes(cleaning.propertyId)) {
                // ⚠️ FIX: salta se escluso dal billing
                // @ts-expect-error TODO-FIX: excludedFromBilling on Cleaning
                if (cleaning.excludedFromBilling === true) return;
                // @ts-expect-error TODO-FIX: TS2339 Property 'propertyId' does not exist on type '{ id: string; }'.
                const prop = staticCache.properties.get(cleaning.propertyId);
                // ⚡ Stesso identico calcolo della lista:
                //    basePrice = cleaning.price || prop.cleaningPrice (|| così se 0 fa fallback)
                //    effectivePrice = (priceOverride ?? basePrice) + holidayFee
                // @ts-expect-error TODO-FIX: TS2339 Property 'price' does not exist on type '{ id: string; }'.
                const basePrice = cleaning.price || prop?.cleaningPrice || 0;
                // @ts-expect-error TODO-FIX: TS2339 Property 'priceOverride' does not exist on type '{ id: string; }'.
                totaleServizi += (cleaning.priceOverride ?? basePrice) + (cleaning.holidayFee ?? 0);
                // @ts-expect-error TODO-FIX: TS2339 Property 'propertyName' does not exist on type '{ id: string; }'.
                propertyNames.add(cleaning.propertyName || prop?.name || "Proprietà");
              }
            });

            monthOrders.forEach(order => {
              // @ts-expect-error TODO-FIX: TS2339 Property 'propertyId' does not exist on type '{ id: string; }'.
              if (propertyIds.includes(order.propertyId)) {
                // ⚠️ FIX: salta se escluso dal billing
                // @ts-expect-error TODO-FIX: excludedFromBilling on Order
                if (order.excludedFromBilling === true) return;
                // @ts-expect-error TODO-FIX: TS2339 Property 'propertyId' does not exist on type '{ id: string; }'.
                const prop = staticCache.properties.get(order.propertyId);
                // ⚡ Stesso identico calcolo della lista: processOrder ha già
                //    incluso delivery+bedmaking dentro calculatedTotal e
                //    escluso cleaning_product/orfani. L'override sostituisce tutto.
                // @ts-expect-error TODO-FIX: TS2339 Property 'totalPriceOverride' does not exist on type '{ id: string; }'.
                const effectivePrice = order.totalPriceOverride ?? order.calculatedTotal ?? 0;
                totaleServizi += effectivePrice;
                // @ts-expect-error TODO-FIX: TS2339 Property 'propertyName' does not exist on type '{ id: string; }'.
                propertyNames.add(order.propertyName || prop?.name || "Proprietà");
              }
            });

            const ownerPayments = monthPayments.filter((p: any) => p.proprietarioId === ownerId);
            // ⚠️ Escludo isCreditTransfer per coerenza col calcolo del saldo
            const totalePagato = ownerPayments
              .filter((p: any) => p.isCreditTransfer !== true)
              .reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
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
