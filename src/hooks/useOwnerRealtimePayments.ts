"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  collection, query, where, getDocs, Timestamp,
  onSnapshot,
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import type { Unsubscribe } from "firebase/firestore";
import {
  computeMonthDebt,
  buildInventoryMap,
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
// ⚡ HOOK PAGAMENTI PROPRIETARIO
//
// Carica realtime i dati per il singolo proprietario su un range
// temporale, e calcola lo stato del mese selezionato.
//
// Bug-fix architetturali rispetto alla versione precedente:
//   - paymentOverrides admin ora APPLICATI al totale (era ignorato → la
//     pagina mostrava sempre il calcolo grezzo anche se l'admin aveva
//     fissato un totale diverso).
//   - Calcolo del totale finale delegato alla funzione condivisa
//     `computeMonthDebt`, garantendo coerenza con la modal warning, la
//     dashboard e i cron email.
//
// L'arricchimento UI (ServiceDetail con foto proprietà, statsByProperty,
// categorizzazione kit_cortesia/servizi_extra) resta locale a questo hook
// perché è puramente cosmetico/ad uso della pagina.
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
   * Gruppo logico per la UI: distingue biancheria (visibile in "Dettaglio
   * biancheria"), kit cortesia (sezione separata), prodotti pulizia
   * operatore ("cleaning_product" — escluso dalla vista proprietario).
   */
  categoryGroup: ItemCategoryGroup;
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
  /** Tutti gli items visibili al proprietario (NO cleaning_product). */
  items?: OrderItemDetail[];
  /** Solo articoli biancheria (lenzuola, federe, asciugamani, tappetini, ecc.). */
  linenItems?: OrderItemDetail[];
  /** Solo articoli kit cortesia (shampoo, saponetta, crema, bagnoschiuma). */
  kitItems?: OrderItemDetail[];
  /** Subtotale solo biancheria (esclude kit cortesia). */
  linenSubtotal?: number;
  /** Subtotale solo kit cortesia. */
  kitSubtotal?: number;
  cleaningId?: string;
  laundryOrderId?: string;
  holidayFee?: number;
  holidayName?: string | null;
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

// ==================== CACHE INVENTARIO ====================
interface InventoryFullEntry {
  name: string;
  sellPrice: number;
  /** Categoria leggibile (legacy, può essere "Altro" se sconosciuta). */
  categoryName: string;
  /** Categoria sistema: biancheria_letto, biancheria_bagno, kit_cortesia, prodotti_pulizia, servizi_extra. */
  categoryId?: string;
}

interface StaticCache {
  inventory: Map<string, DebtCalcInventoryItem>;
  inventoryFull: Map<string, InventoryFullEntry>;
  loaded: boolean;
}

const staticCache: StaticCache = {
  inventory: new Map(),
  inventoryFull: new Map(),
  loaded: false,
};

async function loadInventory(): Promise<boolean> {
  if (staticCache.loaded) return true;
  try {
    const inventorySnap = await getDocs(collection(db, "inventory"));
    staticCache.inventory.clear();
    staticCache.inventoryFull.clear();

    const docs = inventorySnap.docs.map(d => ({ id: d.id, data: d.data() as Record<string, any> }));
    staticCache.inventory = buildInventoryMap(docs);

    docs.forEach(({ id, data }) => {
      const item: InventoryFullEntry = {
        name: data.name || "",
        sellPrice: data.sellPrice || data.price || 0,
        categoryName: data.categoryName || data.category || data.categoryId || "Altro",
        categoryId: data.categoryId || data.category || undefined,
      };
      staticCache.inventoryFull.set(id, item);
      if (data.key) staticCache.inventoryFull.set(data.key, item);
      if (id.startsWith("item_")) staticCache.inventoryFull.set(id.replace("item_", ""), item);
    });
    staticCache.loaded = true;
    return true;
  } catch (error) {
    console.error("❌ Errore caricamento inventario:", error);
    return false;
  }
}

// ==================== UTILITÀ UI ====================

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
 * Classifica un item in uno dei gruppi UI.
 * Strategia a cascata (ferma al primo match):
 *   1. item.type === "cleaning_product" → cleaning_product
 *   2. item.categoryId/category → mappa
 *   3. inventario (cache) → categoryId
 *   4. SYSTEM_ITEMS (lookup per id/key) → categoryId
 *   5. Fallback per NOME: pattern "anticalcare", "detergente", ecc.
 *      → cleaning_product (per items legacy senza flag)
 *   6. fallback "altro"
 */
function classifyItem(item: any, invItem: InventoryFullEntry | undefined): ItemCategoryGroup {
  // 1. Tipo esplicito sull'item
  if (item.type === "cleaning_product") return "cleaning_product";
  if (item.type === "linen") {
    // Anche con type=linen possiamo essere kit_cortesia/extra in base a categoryId
  }

  // 2. categoryId/category sull'item (priorità più alta dell'inventario)
  const itemCat = (item.categoryId || item.category || "").toLowerCase();
  if (itemCat) {
    if (itemCat === "prodotti_pulizia" || itemCat === "cleaning_products") return "cleaning_product";
    if (itemCat === "kit_cortesia") return "kit_cortesia";
    if (itemCat === "servizi_extra") return "servizi_extra";
    if (itemCat === "biancheria_letto" || itemCat === "biancheria_bagno") return "linen";
  }

  // 3. Inventario cache
  const invCat = (invItem?.categoryId || invItem?.categoryName || "").toLowerCase();
  if (invCat) {
    if (invCat === "prodotti_pulizia" || invCat === "cleaning_products") return "cleaning_product";
    if (invCat === "kit_cortesia") return "kit_cortesia";
    if (invCat === "servizi_extra") return "servizi_extra";
    if (invCat === "biancheria_letto" || invCat === "biancheria_bagno") return "linen";
    // Fallback string-include per legacy
    if (invCat.includes("cortesia") || invCat.includes("kit")) return "kit_cortesia";
    if (invCat.includes("extra")) return "servizi_extra";
    if (invCat.includes("biancheria") || invCat.includes("linen")) return "linen";
  }

  // 4. SYSTEM_ITEMS lookup
  const itemKey = item.itemId || item.id;
  const sysItem = itemKey ? SYSTEM_ITEMS_BY_KEY[itemKey] : undefined;
  if (sysItem) {
    if (sysItem.categoryId === "biancheria_letto" || sysItem.categoryId === "biancheria_bagno") return "linen";
    if (sysItem.categoryId === "kit_cortesia") return "kit_cortesia";
    if (sysItem.categoryId === "servizi_extra") return "servizi_extra";
    if (sysItem.categoryId === "prodotti_pulizia") return "cleaning_product";
  }

  // 5. Fallback name-based per cleaning_product (items legacy senza flag)
  // Es. "Detergente Multiuso", "Anticalcare Bagno" creati prima che il
  // sistema introducesse type/categoryId.
  const itemName = (item.name || invItem?.name || sysItem?.name || "").toString();
  if (itemName) {
    if (CLEANING_PRODUCT_NAME_PATTERNS.some(re => re.test(itemName))) {
      return "cleaning_product";
    }
  }

  return "altro";
}

/**
 * Risolve nome leggibile e prezzo unitario dell'item, con cascade:
 * inventario cache → SYSTEM_ITEMS → item.name → null (item da scartare).
 */
/**
 * Determina se una stringa "sembra" un ID tecnico (snake_case, camelCase,
 * o ID Firestore alfanumerico) piuttosto che un nome leggibile per umani.
 *
 * Regole (ferma al primo match → restituisce true):
 *   1. snake_case: tutto minuscolo + underscore → "canavaccio_cucina"
 *   2. camelCase: lower→upper junction senza spazi → "cremaCorpo", "towelsLarge"
 *   3. ID Firestore: 12+ char misti caso casuale, ratio cifre o
 *      alternanze maiuscole/minuscole anomale → "HkWrWkdOGdAAvu0Z6TxI"
 *
 * Esclude (riconosce come nome umano):
 *   - Stringhe con spazi: "Crema Corpo", "Tappetino Scendibagno"
 *   - Stringhe con maiuscola iniziale + tutto minuscolo: "Bagnoschiuma", "Saponetta"
 *   - Stringhe con trattino: "Doccia-Shampoo", "Anticalcare-Bagno"
 */
function looksLikeRawId(s: string): boolean {
  if (!s || s.length < 4) return false;

  // Contiene spazi o trattini → nome umano
  if (/[\s-]/.test(s)) return false;

  // snake_case: tutto minuscolo + almeno un underscore → ID tecnico
  if (/^[a-z][a-z0-9_]*_[a-z0-9_]+$/.test(s)) return true;

  // camelCase: minuscola iniziale + almeno una maiuscola interna → ID tecnico
  if (/^[a-z][a-z0-9]*[A-Z]/.test(s)) return true;

  // Capitalized italiano: maiuscola iniziale + resto minuscolo → nome umano (NON id)
  if (/^[A-Z][a-z0-9]*$/.test(s)) return false;

  // Stringhe lunghe miste maiuscolo/minuscolo casuali con cifre = ID Firestore
  // (es. "HkWrWkdOGdAAvu0Z6TxI", "V1vp8PpPMrfdt9HWWqOm")
  if (s.length >= 12) {
    const hasMultipleUpper = (s.match(/[A-Z]/g) || []).length >= 2;
    const hasDigit = /[0-9]/.test(s);
    if (hasMultipleUpper && hasDigit) return true;
  }

  return false;
}

/**
 * Pattern di nomi che indicano un prodotto pulizia operatore anche
 * quando l'item NON ha `type`/`categoryId` settati (legacy data).
 * Usato come fallback in classifyItem.
 */
const CLEANING_PRODUCT_NAME_PATTERNS = [
  /\banticalcare\b/i,
  /\bsgrass/i,
  /\bdetergent[ei]\b/i,
  /\bdetersivo\b/i,
  /\bcandeggina\b/i,
  /\bamuchina\b/i,
  /\bviakal\b/i,
  /\bmuffa\b/i,
  /\bvetril\b/i,
  /\blysoform\b/i,
];

function resolveItemMeta(item: any): {
  name: string | null;
  unitPrice: number;
  invItem: InventoryFullEntry | undefined;
} {
  const itemKey = item.itemId || item.id;
  const invItem = itemKey ? staticCache.inventoryFull.get(itemKey) : undefined;
  const sysItem = itemKey ? SYSTEM_ITEMS_BY_KEY[itemKey] : undefined;

  // Cascade nome (decisione admin Ariele 2026-05):
  //   1. invItem.name (PRIORITÀ ASSOLUTA — l'inventario è la fonte di verità)
  //   2. SYSTEM_ITEMS.name (fallback se inventario non ha l'item)
  //   3. item.name MA SOLO se non sembra un id tecnico
  //   4. null → item viene scartato dall'UI
  //
  // Questa regola garantisce che se l'admin rinomina un item nell'inventario
  // (es. "bagnoschiuma" → "Doccia-Shampoo"), tutti gli ordini storici si
  // adeguano automaticamente al nome corrente.
  let name: string | null = null;

  if (invItem?.name && invItem.name.trim()) {
    name = invItem.name;
  }
  if (!name && sysItem?.name) {
    name = sysItem.name;
  }
  if (!name && item.name && typeof item.name === "string" && item.name.trim()) {
    if (!looksLikeRawId(item.name)) {
      name = item.name;
    }
  }

  const basePrice = item.unitPrice ?? item.price ?? invItem?.sellPrice ?? 0;
  const unitPrice = item.priceOverride ?? basePrice;

  return { name, unitPrice, invItem };
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
 * Normalizza una stringa per dedup: lowercase, no spazi, no underscore.
 */
function normName(s: string): string {
  return s.toLowerCase().replace(/[\s_-]+/g, "");
}

/**
 * Costruisce ItemDetails per UI con classificazione e deduplica.
 *
 * 🔒 ESCLUSIONI dalla vista proprietario:
 *   - Items "cleaning_product" / categoria "prodotti_pulizia"
 *     (richieste operatore — NON addebitate al proprietario)
 *   - Items orfani senza nome risolvibile (legacy data corrotta)
 *
 * 🔄 DEDUPLICA:
 *   Items con stesso nome normalizzato vengono fusi sommando quantity
 *   e totalPrice (mantiene unitPrice del primo). Risolve casi tipo
 *   "crema" + "cremaCorpo" creati per legacy in due record diversi.
 *
 * 🏷️ CATEGORIZZAZIONE:
 *   Ogni item ottiene `categoryGroup` (linen/kit_cortesia/servizi_extra)
 *   per permettere alla UI di mostrare sezioni separate.
 *
 * @returns rawTotal include SOLO items addebitati al proprietario (no
 *          cleaning_product) + delivery + bedMaking. Coerente con
 *          calculateOrderRawPrice in debtCalculator.ts.
 */
function buildOrderItemDetails(order: any): {
  itemDetails: OrderItemDetail[];
  linenItems: OrderItemDetail[];
  kitItems: OrderItemDetail[];
  mainCategory: string;
  rawTotal: number;
  linenSubtotal: number;
  kitSubtotal: number;
  deliveryFee: number;
  bedMakingFee: number;
} {
  // Mappa per dedup: chiave = normName(name) → entry aggregata
  const dedupMap = new Map<string, OrderItemDetail>();
  let calculatedTotal = 0;
  let linenSubtotal = 0;
  let kitSubtotal = 0;

  if (order.items && Array.isArray(order.items)) {
    for (const item of order.items) {
      // 🔒 SKIP cleaning_product / prodotti_pulizia — non addebitati al proprietario
      if (isCleaningProductItem(item as any)) continue;

      const { name, unitPrice, invItem } = resolveItemMeta(item);

      // 🔒 SKIP items orfani senza nome risolvibile
      if (!name) continue;

      const group = classifyItem(item, invItem);

      // Doppia sicurezza: classifyItem può rilevare cleaning_product anche senza type esplicito
      if (group === "cleaning_product") continue;

      const itemKey = item.itemId || item.id || name;
      const quantity = item.quantity || 1;
      const itemTotal = item.totalPrice ?? (unitPrice * quantity);

      // Categoria leggibile per la UI
      const categoryName =
        item.categoryName ||
        invItem?.categoryName ||
        SYSTEM_ITEMS_BY_KEY[itemKey]?.categoryId ||
        "Altro";

      const dedupKey = normName(name);
      const existing = dedupMap.get(dedupKey);

      if (existing) {
        // Stesso item con id diverso → somma quantità e totale, mantieni unitPrice e gruppo del primo
        existing.quantity += quantity;
        existing.totalPrice += itemTotal;
      } else {
        dedupMap.set(dedupKey, {
          itemId: itemKey,
          name,
          quantity,
          unitPrice,
          totalPrice: itemTotal,
          categoryName,
          categoryGroup: group,
        });
      }

      calculatedTotal += itemTotal;
      if (group === "linen") linenSubtotal += itemTotal;
      else if (group === "kit_cortesia") kitSubtotal += itemTotal;
    }
  }

  const itemDetails = Array.from(dedupMap.values());
  const linenItems = itemDetails.filter(i => i.categoryGroup === "linen");
  const kitItems = itemDetails.filter(i => i.categoryGroup === "kit_cortesia");

  // Determina mainCategory per il tipo dell'ordine (BIANCHERIA / KIT_CORTESIA / SERVIZI_EXTRA)
  // basato sul gruppo con totale più alto
  let mainCategory = "Biancheria";
  if (kitSubtotal > linenSubtotal) {
    mainCategory = "Kit Cortesia";
  } else {
    const extraSubtotal = itemDetails
      .filter(i => i.categoryGroup === "servizi_extra")
      .reduce((s, i) => s + i.totalPrice, 0);
    if (extraSubtotal > linenSubtotal && extraSubtotal > kitSubtotal) {
      mainCategory = "Servizi Extra";
    }
  }

  // Delivery fee — incluso solo se abilitato
  const deliveryFee = (order.deliveryFee && order.deliveryFeeEnabled !== false) ? order.deliveryFee : 0;
  calculatedTotal += deliveryFee;

  // Bed making fee — incluso solo se attivo
  const bedMakingFee = (order.bedMaking && order.bedMakingFee) ? order.bedMakingFee : 0;
  calculatedTotal += bedMakingFee;

  if (deliveryFee > 0) {
    const fee: OrderItemDetail = {
      itemId: "_delivery_fee",
      name: "Costo consegna",
      quantity: 1,
      unitPrice: deliveryFee,
      totalPrice: deliveryFee,
      categoryName: "Consegna",
      categoryGroup: "altro",
    };
    itemDetails.push(fee);
  }

  if (bedMakingFee > 0) {
    const fee: OrderItemDetail = {
      itemId: "_bed_making_fee",
      name: `Preparazione letti (${order.bedMakingCount || 0})`,
      quantity: 1,
      unitPrice: bedMakingFee,
      totalPrice: bedMakingFee,
      categoryName: "Preparazione Letti",
      categoryGroup: "altro",
    };
    itemDetails.push(fee);
  }

  return {
    itemDetails,
    linenItems,
    kitItems,
    mainCategory,
    rawTotal: calculatedTotal,
    linenSubtotal,
    kitSubtotal,
    deliveryFee,
    bedMakingFee,
  };
}

// ════════════════════════════════════════════════════════════════
// HOOK PRINCIPALE PROPRIETARIO
// ════════════════════════════════════════════════════════════════
export function useOwnerRealtimePayments(ownerId: string | undefined, month: number, year: number) {
  const [ownerProperties, setOwnerProperties] = useState<any[]>([]);
  const [allCleanings, setAllCleanings] = useState<any[]>([]);
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [allPayments, setAllPayments] = useState<Payment[]>([]);
  const [allOverrides, setAllOverrides] = useState<DebtCalcOverride[]>([]);

  const [propsLoaded, setPropsLoaded] = useState(false);
  const [inventoryLoaded, setInventoryLoaded] = useState(staticCache.loaded);
  const [cleaningsLoaded, setCleaningsLoaded] = useState(false);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [paymentsLoaded, setPaymentsLoaded] = useState(false);
  const [overridesLoaded, setOverridesLoaded] = useState(false);
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

  const loading =
    !propsLoaded ||
    !inventoryLoaded ||
    !cleaningsLoaded ||
    !ordersLoaded ||
    !paymentsLoaded ||
    !overridesLoaded;

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
    setOverridesLoaded(false);
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
        query(collection(db, "properties"), where("ownerId", "==", ownerId), where("status", "==", "ACTIVE")),
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
        setOverridesLoaded(true);
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
        () => { if (mounted) setError("Errore caricamento pulizie"); },
      );
      unsubscribesRef.current.push(unsubC);

      // Orders
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
        () => { if (mounted) setError("Errore caricamento ordini"); },
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
        () => { if (mounted) setError("Errore caricamento pagamenti"); },
      );
      unsubscribesRef.current.push(unsubP);

      // Override admin (SISTEMA UNIFICATO) — la pagina ora rispetta gli sconti
      const unsubOv = onSnapshot(
        query(collection(db, "paymentOverrides"), where("proprietarioId", "==", ownerId)),
        (snap) => {
          if (!mounted) return;
          const data: DebtCalcOverride[] = snap.docs.map(d => {
            const raw = d.data() as Record<string, any>;
            return {
              proprietarioId: raw.proprietarioId,
              month: raw.month,
              year: raw.year,
              overrideTotal: raw.overrideTotal || 0,
              reason: raw.reason,
            };
          });
          setAllOverrides(data);
          setOverridesLoaded(true);
        },
        () => { if (mounted) setError("Errore caricamento override"); },
      );
      unsubscribesRef.current.push(unsubOv);

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

    // ─── 1. Calcolo TOTALE tramite funzione condivisa ─────
    const propertiesById = new Map<string, DebtCalcProperty>(
      ownerProperties.map(p => [p.id, { id: p.id, cleaningPrice: p.cleaningPrice || 0 }]),
    );

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
      month: p.month,
      year: p.year,
      amount: p.amount || 0,
      method: p.method,
      isCreditTransfer: p.isCreditTransfer === true,
    }));

    const overrideForMonth = allOverrides.find(o => o.month === month && o.year === year);

    const calc = computeMonthDebt({
      month, year,
      propertiesById,
      cleanings: cleaningsForCalc,
      orders: ordersForCalc,
      payments: paymentsForCalc,
      inventoryById: staticCache.inventory,
      override: overrideForMonth,
    });

    // ─── 2. Costruzione UI: ServiceDetail e categorizzazione ─────
    // (Logica locale all'hook, non condivisa, perché serve solo qui)
    const monthCleanings = allCleanings
      .filter((c: any) => c.status === "COMPLETED")
      .filter((c: any) => isInMonth(c.scheduledDate, month, year));
    const completedCleaningIds = new Set(monthCleanings.map((c: any) => c.id));

    const monthOrders = allOrders
      .filter((o: any) => isInMonth(o.deliveredAt || o.scheduledDate, month, year))
      .filter((o: any) => {
        if (o.status === "DELIVERED") return true;
        if (o.cleaningId && completedCleaningIds.has(o.cleaningId)) return true;
        return false;
      });

    const monthPayments = allPayments.filter(p => p.month === month && p.year === year);

    let cleaningsCount = 0, cleaningsTotal = 0;
    let ordersCount = 0, ordersTotal = 0;
    let kitCortesiaCount = 0, kitCortesiaTotal = 0;
    let serviziExtraCount = 0, serviziExtraTotal = 0;
    const services: ServiceDetail[] = [];

    monthCleanings.forEach((cleaning: any) => {
      const prop = ownerProperties.find(p => p.id === cleaning.propertyId);
      if (!prop) return;
      const basePrice = cleaning.price || prop.cleaningPrice || 0;
      const hFee = cleaning.holidayFee ?? 0;
      const effectivePrice = (cleaning.priceOverride ?? basePrice) + hFee;
      cleaningsCount++;
      cleaningsTotal += effectivePrice;

      services.push({
        id: cleaning.id, type: "PULIZIA",
        date: cleaning.scheduledDate?.toDate?.() || new Date(),
        propertyId: cleaning.propertyId,
        propertyName: cleaning.propertyName || prop.name || "Proprietà",
        propertyImage: prop.images?.door || prop.imageUrl,
        description: cleaning.type === "deep" ? "Pulizia Approfondita" : "Pulizia Standard",
        originalPrice: basePrice + hFee, effectivePrice,
        hasOverride: cleaning.priceOverride !== undefined && cleaning.priceOverride !== null,
        overrideReason: cleaning.priceOverrideReason,
        laundryOrderId: cleaning.laundryOrderId,
        holidayFee: hFee,
        holidayName: cleaning.holidayName || null,
      });
    });

    monthOrders.forEach((order: any) => {
      const prop = ownerProperties.find(p => p.id === order.propertyId);
      if (!prop) return;
      const {
        itemDetails,
        linenItems: orderLinenItems,
        kitItems: orderKitItems,
        mainCategory,
        rawTotal,
        linenSubtotal,
        kitSubtotal,
      } = buildOrderItemDetails(order);
      const effectivePrice = order.totalPriceOverride ?? rawTotal;
      const serviceType = mapCategoryToServiceType(mainCategory);

      // 🔒 Skip ordini "vuoti" per il proprietario: se rawTotal è 0 e non
      // c'è override, significa che l'ordine conteneva SOLO cleaning_product
      // (nascosti) o items orfani. Non lo mostriamo.
      if (effectivePrice === 0 && itemDetails.length === 0) return;

      if (serviceType === "KIT_CORTESIA") { kitCortesiaCount++; kitCortesiaTotal += effectivePrice; }
      else if (serviceType === "SERVIZI_EXTRA") { serviziExtraCount++; serviziExtraTotal += effectivePrice; }
      else { ordersCount++; ordersTotal += effectivePrice; }

      // Descrizione: conta solo articoli "veri" (no fee delivery/bedmaking)
      const realItemsCount = itemDetails.filter(i => i.itemId !== "_delivery_fee" && i.itemId !== "_bed_making_fee").length;

      services.push({
        id: order.id, type: serviceType,
        date: order.deliveredAt?.toDate?.() || order.scheduledDate?.toDate?.() || new Date(),
        propertyId: order.propertyId,
        propertyName: order.propertyName || prop.name || "Proprietà",
        propertyImage: prop.images?.door || prop.imageUrl,
        description: `${realItemsCount} articoli`,
        originalPrice: rawTotal, effectivePrice,
        hasOverride: order.totalPriceOverride !== undefined && order.totalPriceOverride !== null,
        overrideReason: order.priceOverrideReason,
        items: itemDetails,
        linenItems: orderLinenItems,
        kitItems: orderKitItems,
        linenSubtotal,
        kitSubtotal,
        cleaningId: order.cleaningId,
      });
    });

    services.sort((a, b) => a.date.getTime() - b.date.getTime());

    // ─── 3. Totali finali — usano il risultato di computeMonthDebt ───
    // (totaleCalcolato/Effettivo include eventuale override admin del mese)
    const totaleCalcolato = calc?.totaleServizi ?? (cleaningsTotal + ordersTotal + kitCortesiaTotal + serviziExtraTotal);
    // ⚠️ Fallback: se calc è null, calcolo escludendo isCreditTransfer per coerenza
    const totalePagato = calc?.totalePagato ?? monthPayments
      .filter(p => (p as any).isCreditTransfer !== true)
      .reduce((sum, p) => sum + (p.amount || 0), 0);
    const saldo = calc?.saldo ?? (totaleCalcolato - totalePagato);
    const hasMonthOverride = !!overrideForMonth;

    let stato: "SALDATO" | "PARZIALE" | "DA_PAGARE" = "DA_PAGARE";
    if (saldo <= 0) stato = "SALDATO";
    else if (totalePagato > 0) stato = "PARZIALE";

    // Stats per proprietà
    const statsByProperty = ownerProperties.map(prop => {
      const propServices = services.filter(s => s.propertyId === prop.id);
      const propTotal = propServices.reduce((sum, s) => sum + s.effectivePrice, 0);
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
      totaleCalcolato, totaleEffettivo: totaleCalcolato,
      hasOverride: hasMonthOverride,
      overrideReason: overrideForMonth?.reason,
      payments: monthPayments, totalePagato, saldo, stato, services, statsByProperty,
    };

    // ⚠️ Pagamenti "reali" senza i credit-transfer automatici (per coerenza con totalePagato di computeMonthDebt)
    const realPayments = monthPayments.filter(p => (p as any).isCreditTransfer !== true);
    const ownerSummary: OwnerSummary = {
      totaleServizi: totaleCalcolato,
      totalePagato,
      totaleDovuto: Math.max(0, saldo),
      totaleContanti: realPayments.filter(p => p.method === "CONTANTI").reduce((s, p) => s + (p.amount || 0), 0),
      totaleBonifico: realPayments.filter(p => p.method === "BONIFICO").reduce((s, p) => s + (p.amount || 0), 0),
      totaleAltro: realPayments.filter(p => p.method === "ALTRO").reduce((s, p) => s + (p.amount || 0), 0),
    };

    return { stats: ownerStats, summary: ownerSummary };
  }, [month, year, loading, ownerId, ownerProperties, allCleanings, allOrders, allPayments, allOverrides]);

  return { loading, error, stats, summary, refresh };
}
