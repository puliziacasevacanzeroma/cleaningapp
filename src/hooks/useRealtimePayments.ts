"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { 
  collection, query, where, getDocs, getDocsFromCache, Timestamp, 
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
import {
  classifyItemGroup,
  resolveItemUnitPrice,
  resolveItemTotal,
  pickMainCategory,
  categoryLabel,
  parseCategoryLabel,
  splitOrderByCategory,
  isCleaningBillable,
  isOrderBillable,
  type OrderSubtotals,
  type CategorySplit,
  type ServiceCategory,
} from "~/lib/payments/paymentsCore";
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
  /**
   * 🎯 Ripartizione del prezzo effettivo sulle categorie a schermo,
   * calcolata UNA sola volta qui. La UI deve sommare questo, mai
   * ricalcolare filtrando per `type`: un ordine "BIANCHERIA" può
   * contenere anche kit cortesia, e filtrando per tipo quei soldi
   * finivano tutti su Biancheria.
   * Per le pulizie è {0,0,0} (il loro valore sta in `effectivePrice`).
   */
  catSplit?: CategorySplit;
  /**
   * 🎯 Il servizio concorre ai totali fatturati? Regola canonica
   * (COMPLETED/DELIVERED, non CANCELLED, non escluso a mano).
   * La UI deve filtrare su questo prima di sommare.
   */
  billable?: boolean;
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

// Popola staticCache dagli snapshot (stessa identica logica di prima,
// estratta per essere riusabile da cache E da server). Nessun cambiamento
// sui dati: solo riorganizzazione.
function populateStaticCache(propsSnap: any, inventorySnap: any) {
  staticCache.properties.clear();
  propsSnap.docs.forEach((doc: any) => {
    const data = doc.data() as Record<string, any>;
    staticCache.properties.set(doc.id, {
      id: doc.id, ...data,
      cleaningPrice: data.cleaningPrice || 0,
    });
  });

  staticCache.inventory.clear();
  inventorySnap.docs.forEach((doc: any) => {
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
}

// ==================== ⚡ VIEW CACHE (paint istantaneo pagina pagamenti) ====================
// Ultimo risultato GIÀ CALCOLATO (clients + summary) per mese, in localStorage.
// All'apertura dipingiamo SUBITO questo (stale-while-revalidate, stesso pattern
// della dashboard con "dashboard_cache"): i listener e il calcolo veri girano
// dietro e, appena pronti, sostituiscono silenziosamente i numeri. Se nulla è
// cambiato i numeri sono identici per costruzione; se qualcosa è cambiato, la
// vista si aggiorna da sola in 1-3s. NESSUNA logica di calcolo è alterata.
const VIEW_CACHE_PREFIX = "payments_view_cache_v1:";
const VIEW_CACHE_MAX_KEYS = 4; // tieni al massimo 4 mesi in cache

function viewCacheKey(month: number, year: number): string {
  return `${VIEW_CACHE_PREFIX}${year}-${String(month).padStart(2, "0")}`;
}

interface CachedPaymentsView {
  clients: ClientStats[];
  summary: Summary;
  propertiesWithoutPrice: PropertyWithoutPrice[];
  savedAt?: number;
}

function loadViewCache(month: number, year: number): CachedPaymentsView | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(viewCacheKey(month, year));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.clients) || !parsed?.summary) return null;
    return parsed as CachedPaymentsView;
  } catch {
    return null;
  }
}

function saveViewCache(
  month: number,
  year: number,
  data: { clients: ClientStats[]; summary: Summary; propertiesWithoutPrice: PropertyWithoutPrice[] }
) {
  if (typeof window === "undefined") return;
  try {
    const key = viewCacheKey(month, year);
    localStorage.setItem(key, JSON.stringify({ ...data, savedAt: Date.now() }));
    // Pulizia: mai più di VIEW_CACHE_MAX_KEYS mesi in localStorage
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(VIEW_CACHE_PREFIX)) keys.push(k);
    }
    if (keys.length > VIEW_CACHE_MAX_KEYS) {
      keys
        .filter(k => k !== key)
        .map(k => {
          let savedAt = 0;
          try { savedAt = JSON.parse(localStorage.getItem(k) || "{}").savedAt || 0; } catch { /* no-op */ }
          return { k, savedAt };
        })
        .sort((a, b) => a.savedAt - b.savedAt)
        .slice(0, keys.length - VIEW_CACHE_MAX_KEYS)
        .forEach(({ k }) => { try { localStorage.removeItem(k); } catch { /* no-op */ } });
    }
  } catch {
    // quota piena o modalità privata: si dipinge come prima, senza cache
  }
}

// ⚡ PERF — strategia CACHE-FIRST (sicura al 100% sui numeri).
// I dati statici (proprietà + inventario) cambiano raramente. Invece di
// aspettare SEMPRE il server (~secondi anche alla riapertura), proviamo prima
// la cache locale IndexedDB: se c'è, popoliamo e dipingiamo ISTANTANEAMENTE,
// poi aggiorniamo dal server in background. Se i dati freschi differiscono,
// `onServerRefresh` fa ricalcolare la UI. La prima volta in assoluto (cache
// vuota) il comportamento è identico a prima: blocca fino al server.
// Importante: NESSUN calcolo di credito/debito è toccato — stessi dati,
// solo letti prima da disco.
async function loadStaticData(onServerRefresh?: () => void): Promise<boolean> {
  if (staticCache.loaded) return true;

  const propsQuery = query(collection(db, "properties"), where("status", "==", "ACTIVE"));
  const invQuery = collection(db, "inventory");

  // 1) CACHE-FIRST: lettura istantanea da IndexedDB (zero rete).
  let servedFromCache = false;
  try {
    const tCache = Date.now();
    const [propsCache, invCache] = await Promise.all([
      getDocsFromCache(propsQuery),
      getDocsFromCache(invQuery),
    ]);
    if (propsCache.docs.length > 0) {
      populateStaticCache(propsCache, invCache);
      staticCache.loaded = true;
      servedFromCache = true;
      console.log(`⏱️ [PERF] → static da CACHE (istantaneo): ${Date.now() - tCache}ms, ${propsCache.docs.length} props / ${invCache.docs.length} inv`);
    }
  } catch {
    // cache vuota o non disponibile (es. modalità privata) → si prosegue col server
  }

  // 2) SERVER: aggiorna sempre con i dati freschi.
  const serverFetch = (async () => {
    try {
      const tServer = Date.now();
      const [propsSnap, inventorySnap] = await Promise.all([
        getDocs(propsQuery),
        getDocs(invQuery),
      ]);
      populateStaticCache(propsSnap, inventorySnap);
      staticCache.loaded = true;
      console.log(`⏱️ [PERF] → static da SERVER: ${Date.now() - tServer}ms, ${propsSnap.docs.length} props / ${inventorySnap.docs.length} inv`);
      // Se avevamo già dipinto dalla cache, segnala che ora i dati sono freschi
      // così la UI ricalcola (gestisce il caso raro: prezzo cambiato nel frattempo).
      if (servedFromCache) onServerRefresh?.();
      return true;
    } catch (error) {
      console.error("❌ Errore caricamento dati statici dal server:", error);
      return staticCache.loaded; // se la cache ci aveva già salvato, restiamo validi
    }
  })();

  // Se la cache ha già fornito i dati → ritorna subito (paint istantaneo),
  // il server gira in background. Altrimenti aspetta il server come prima.
  if (servedFromCache) return true;
  return await serverFetch;
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
// ⚠️ `classifyItemAdmin` RIMOSSA: la classificazione ora vive in
// `paymentsCore.classifyItemGroup`, condivisa con l'area proprietario e
// con debtCalculator. Era la copia che si era disallineata (mancava il
// riconoscimento dei prodotti pulizia per nome).

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

// ⚠️ `mapCategoryToServiceType` RIMOSSA: sostituita da
// `paymentsCore.parseCategoryLabel` / `pickMainCategory`.

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
  let extraSubtotalRaw = 0;
  let altroSubtotal = 0;

  if (order.items && Array.isArray(order.items)) {
    for (const item of order.items) {
      const itemKey = item.itemId || item.id;
      const invItem = staticCache.inventory.get(itemKey);
      const sysItem = itemKey ? SYSTEM_ITEMS_BY_KEY[itemKey] : undefined;

      // 🎯 Classificazione CANONICA (paymentsCore): include il fallback
      // per NOME sui prodotti pulizia, che qui prima mancava. Era la causa
      // per cui l'admin fatturava voci tipo "anticalcare" che il
      // proprietario (e le email) non vedevano.
      const group = classifyItemGroup(item, invItem, sysItem);

      // 🎯 Prezzi CANONICI (paymentsCore): stessa cascata di
      // calculateOrderRawPrice — uno 0 salvato è dato sporco e si ricade
      // sul listino. Prima qui e nell'area proprietario le regole
      // divergevano (`||` vs `??`).
      const quantity = item.quantity || 1;
      const unitPrice = resolveItemUnitPrice(item, invItem);
      const itemTotal = resolveItemTotal(item, invItem);

      // ⚠️ Gli item ORFANI (nessun nome risolvibile) prima venivano
      // scartati dal totale admin, ma la formula canonica li fattura.
      // Ora entrano nel totale con un nome segnaposto: restano visibili
      // e bonificabili invece di creare uno scarto invisibile.
      const resolvedName = resolveItemNameAdmin(item, invItem);
      const name = resolvedName || `⚠️ Articolo non riconosciuto (${itemKey || "senza id"})`;
      const isOrphan = !resolvedName;

      const categoryName =
        item.categoryName ||
        invItem?.categoryName ||
        sysItem?.categoryId ||
        "Altro";

      const detail: OrderItemDetail = {
        itemId: itemKey,
        name,
        quantity,
        unitPrice,
        totalPrice: itemTotal,
        categoryName,
        categoryGroup: isOrphan ? "altro" : group,
      };

      // cleaning_product: salvati a parte (visibili in admin per trasparenza)
      // ma NON sommati al totale fatturato
      if (group === "cleaning_product") {
        cleaningProductItems.push(detail);
        continue;
      }

      // Dedup per nome normalizzato (gli orfani NON si deduplicano fra loro:
      // hanno id diversi e vanno visti uno per uno)
      const dedupKey = isOrphan ? `__orphan__${itemKey}` : normNameAdmin(name);
      const existing = dedupMap.get(dedupKey);
      if (existing) {
        existing.quantity += quantity;
        existing.totalPrice += itemTotal;
      } else {
        dedupMap.set(dedupKey, detail);
      }

      calculatedTotal += itemTotal;
      if (isOrphan) altroSubtotal += itemTotal;
      else if (group === "linen") linenSubtotal += itemTotal;
      else if (group === "kit_cortesia") kitSubtotal += itemTotal;
      else if (group === "servizi_extra") extraSubtotalRaw += itemTotal;
      else altroSubtotal += itemTotal; // categoria non riconosciuta
    }
  }

  const itemDetails = Array.from(dedupMap.values());
  const linenItems = itemDetails.filter(i => i.categoryGroup === "linen");
  const kitItems = itemDetails.filter(i => i.categoryGroup === "kit_cortesia");

  // 🔢 Subtotale "servizi extra": accumulato nel loop insieme agli altri,
  // così i cinque bucket sono per costruzione una partizione esatta del
  // totale (prima veniva ricalcolato a valle da itemDetails).
  const extraSubtotal = extraSubtotalRaw;

  // Categoria dominante — regola canonica condivisa
  const mainCategoryEnum = pickMainCategory(linenSubtotal, kitSubtotal, extraSubtotal);
  const mainCategory = categoryLabel(mainCategoryEnum);

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

  // 🎯 PARTIZIONE ESATTA: i cinque bucket sommano a calculatedTotal.
  // Nessun euro può finire fuori categoria e venire poi spalmato in
  // silenzio dal riscalamento (era il bug degli item "altro").
  const subtotals: OrderSubtotals = {
    linen: linenSubtotal,
    kit: kitSubtotal,
    extra: extraSubtotal,
    altro: altroSubtotal,
    others: deliveryFee + bedMakingFee,
    total: calculatedTotal,
  };

  return {
    ...order,
    calculatedTotal,
    itemDetails,
    linenItems,
    kitItems,
    linenSubtotal,
    kitSubtotal,
    extraSubtotal,
    // Subtotale voci non categorizzabili — > 0 significa dato sporco
    altroSubtotal,
    // Subtotale servizi accessori (consegna + preparazione letti)
    othersSubtotal: deliveryFee + bedMakingFee,
    subtotals,
    mainCategory,
    mainCategoryEnum,
    deliveryFee,
    bedMakingFee,
  };
}

// ════════════════════════════════════════════════════════════════
// 🎯 COMPUTE OWNER MONTH STATS — funzione PURA condivisa
//
// Calcola tutti i numeri rilevanti per un singolo (proprietario, mese).
// È la FONTE DI VERITÀ unica usata sia dalla vista LISTA che dalla
// vista TABELLA (timeline) — così gli importi e gli status non possono
// più divergere tra le due viste.
//
// Input: monthOrders DEVE essere già stato processato con processOrder()
// (cioè ogni order deve avere calculatedTotal, mainCategory, *Subtotal).
// ════════════════════════════════════════════════════════════════
interface OwnerMonthStats {
  // Aggregati
  cleaningsCount: number;
  cleaningsTotal: number;
  ordersCount: number;
  ordersTotal: number;
  kitCortesiaCount: number;
  kitCortesiaTotal: number;
  serviziExtraCount: number;
  serviziExtraTotal: number;
  totaleCalcolato: number;
  /** Somma dei servizi PRIMA dell'eventuale override mensile admin. */
  rawCalcBeforeOverride: number;
  /** True se un override admin sul totale del mese è stato applicato. */
  hasMonthOverride: boolean;
  overrideReason?: string;
  // Pagamenti
  ownerPayments: any[];
  totalePagato: number;
  saldo: number;
  // Status calcolato (con eventuale carryover applicato)
  creditoPrecedente: number;
  saldoConCredito: number;
  stato: "SALDATO" | "PARZIALE" | "DA_PAGARE";
  // Servizi del mese (lista dettagliata, ordinata per data)
  services: ServiceDetail[];
  // Nomi proprietà coinvolte (per la timeline)
  propertyNames: string[];
}

function computeOwnerMonthStats(args: {
  ownerId: string;
  ownerProperties: any[];
  /** Cleanings COMPLETED del mese (già filtrate per status e mese) */
  monthCleanings: any[];
  /** Orders del mese (DELIVERED o linked-COMPLETED) GIÀ PROCESSATI con processOrder() */
  monthOrders: any[];
  /** Tutti i pagamenti del mese (verranno filtrati per ownerId all'interno) */
  monthPayments: any[];
  /** Credito da mesi precedenti (carryover). Default 0 = non applicato. */
  creditoPrecedente?: number;
  /**
   * Override admin sul totale del mese per questo proprietario.
   * ⚠️ Prima veniva caricato ma MAI applicato lato admin, mentre l'area
   * proprietario e le email lo applicavano (via computeMonthDebt): sui
   * mesi con override i due lati mostravano cifre diverse.
   */
  override?: { overrideTotal: number; reason?: string } | null;
}): OwnerMonthStats {
  const { ownerId, ownerProperties, monthCleanings, monthOrders, monthPayments } = args;
  const creditoPrecedente = args.creditoPrecedente ?? 0;
  const override = args.override ?? null;
  const propertyIds = ownerProperties.map((p: any) => p.id);

  let cleaningsCount = 0, cleaningsTotal = 0;
  let ordersCount = 0, ordersTotal = 0;
  let kitCortesiaCount = 0, kitCortesiaTotal = 0;
  let serviziExtraCount = 0, serviziExtraTotal = 0;
  const services: ServiceDetail[] = [];
  const propertyNamesSet = new Set<string>();

  // Pulizie COMPLETED e FATTURABILI del mese: servono a decidere quali
  // ordini "linked" sono a loro volta fatturabili (regola canonica).
  const completedCleaningIds = new Set(
    monthCleanings.filter(c => isCleaningBillable(c)).map(c => c.id),
  );

  // ───── CLEANINGS ─────
  monthCleanings.forEach(cleaning => {
    if (!propertyIds.includes(cleaning.propertyId)) return;
    const prop = staticCache.properties.get(cleaning.propertyId);
    const basePrice = cleaning.price || prop?.cleaningPrice || 0;
    const rtHFee = cleaning.holidayFee ?? 0;
    const effectivePrice = (cleaning.priceOverride ?? basePrice) + rtHFee;
    const isBillable = isCleaningBillable(cleaning);
    const isExcluded = !isBillable;
    if (isBillable) {
      cleaningsCount++;
      cleaningsTotal += effectivePrice;
    }
    propertyNamesSet.add(cleaning.propertyName || prop?.name || "Proprietà");
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
      excludedFromBilling: (cleaning as any).excludedFromBilling === true,
      excludedFromBillingReason: (cleaning as any).excludedFromBillingReason,
      catSplit: { linen: 0, kit: 0, extra: 0 },
      billable: isBillable,
    } as any);
  });

  // ───── ORDERS (con SPLIT PER CATEGORIA) ─────
  monthOrders.forEach(order => {
    if (!propertyIds.includes(order.propertyId)) return;
    const prop = staticCache.properties.get(order.propertyId);
    const effectivePrice = order.totalPriceOverride ?? order.calculatedTotal;
    const mainCat: ServiceCategory = order.mainCategoryEnum ?? parseCategoryLabel(order.mainCategory);
    const serviceType = mainCat as ServiceType;

    // 🎯 Fatturabilità CANONICA (paymentsCore): esclude anche i CANCELLED,
    // che prima passavano se collegati a una pulizia completata — finivano
    // nei riquadri per categoria ma non nel totale del proprietario.
    const isBillable = isOrderBillable(order, completedCleaningIds);
    const isExcluded = !isBillable;

    // 🎯 SPLIT unico e condiviso. `subtotals` è una partizione esatta del
    // totale, quindi senza totalPriceOverride il rapporto è 1: niente più
    // redistribuzione silenziosa delle voci non categorizzate.
    const subtotals: OrderSubtotals = order.subtotals ?? {
      linen: order.linenSubtotal ?? 0,
      kit: order.kitSubtotal ?? 0,
      extra: order.extraSubtotal ?? 0,
      altro: order.altroSubtotal ?? 0,
      others: order.othersSubtotal ?? 0,
      total: order.calculatedTotal ?? 0,
    };
    const catSplit = splitOrderByCategory(subtotals, mainCat, effectivePrice);

    if (isBillable) {
      if (catSplit.linen > 0.001) { ordersCount++;       ordersTotal       += catSplit.linen; }
      if (catSplit.kit   > 0.001) { kitCortesiaCount++;  kitCortesiaTotal  += catSplit.kit; }
      if (catSplit.extra > 0.001) { serviziExtraCount++; serviziExtraTotal += catSplit.extra; }
    }

    propertyNamesSet.add(order.propertyName || prop?.name || "Proprietà");
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
      excludedFromBilling: (order as any).excludedFromBilling === true,
      excludedFromBillingReason: (order as any).excludedFromBillingReason,
      // 🆕 Split e fatturabilità calcolati UNA volta qui e riusati dalla UI:
      // il riepilogo per-proprietà non ricalcola più per conto suo.
      catSplit,
      billable: isBillable,
    } as any);
  });

  services.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Somma grezza dei servizi fatturabili. Poiché lo split è una partizione
  // esatta dei totali ordine, questa somma coincide per costruzione con
  // (pulizie fatturabili + ordini fatturabili) di computeMonthDebt.
  const rawCalc = cleaningsTotal + ordersTotal + kitCortesiaTotal + serviziExtraTotal;

  // 🎯 Override admin del mese: stessa regola di computeMonthDebt, così
  // admin, area proprietario, estratto conto ed email dicono lo stesso numero.
  const hasMonthOverride = !!override;
  const totaleCalcolato = hasMonthOverride ? override!.overrideTotal : rawCalc;

  const ownerPayments = monthPayments.filter(p => p.proprietarioId === ownerId);
  // ⚠️ Escludo isCreditTransfer per evitare doppio conteggio col carryover
  const totalePagato = ownerPayments
    .filter(p => (p as any).isCreditTransfer !== true)
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  const saldo = totaleCalcolato - totalePagato;

  // Carryover (se passato dal chiamante): saldoConCredito = max(0, saldo - credito)
  const saldoConCredito = Math.max(0, saldo - creditoPrecedente);

  let stato: "SALDATO" | "PARZIALE" | "DA_PAGARE" = "DA_PAGARE";
  if (saldoConCredito <= 0.01) stato = "SALDATO";
  else if (totalePagato > 0 || creditoPrecedente > 0) stato = "PARZIALE";

  return {
    cleaningsCount, cleaningsTotal,
    ordersCount, ordersTotal,
    kitCortesiaCount, kitCortesiaTotal,
    serviziExtraCount, serviziExtraTotal,
    totaleCalcolato,
    rawCalcBeforeOverride: rawCalc,
    hasMonthOverride,
    overrideReason: override?.reason,
    ownerPayments, totalePagato, saldo,
    creditoPrecedente, saldoConCredito, stato,
    services,
    propertyNames: Array.from(propertyNamesSet),
  };
}

// ════════════════════════════════════════════════════════════════
// 💰 COMPUTE CREDIT BY OWNER — funzione PURA condivisa
//
// Calcola la mappa ownerId → credito accumulato dai mesi PRECEDENTI a
// (month, year). Usa la funzione canonica computeOwnerCreditFromPriorMonths
// di debtCalculator.ts, che è la stessa fonte usata da:
//   - useOwnerBalance (modal warning del proprietario)
//   - computeOwnerDebt server-side (cron email + auto-sblocco)
//
// È la FONTE DI VERITÀ unica usata sia dalla LISTA che dalla TABELLA
// per applicare l'acconto/credito carryover.
// ════════════════════════════════════════════════════════════════
function computeCreditByOwner(args: {
  month: number;
  year: number;
  propertiesByOwner: Map<string, any[]>;
  allCleanings: any[];
  allOrders: any[];
  allPayments: any[];
  allOverrides: any[];
}): Map<string, number> {
  const { month, year, propertiesByOwner, allCleanings, allOrders, allPayments, allOverrides } = args;
  const creditByOwner = new Map<string, number>();

  // Pre-conversione dati raw → tipi DebtCalc (zero loss)
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
    month: Number(p.month),
    year: Number(p.year),
    amount: p.amount || 0,
    method: p.method,
    isCreditTransfer: p.isCreditTransfer === true,
  }));

  // Mappa override globale per (ownerId + monthKey)
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

  const inventoryById = staticCache.inventory as unknown as Map<string, DebtCalcInventoryItem>;

  propertiesByOwner.forEach((ownerProps, ownerId) => {
    const ownerPropertiesById = new Map<string, DebtCalcProperty>(
      ownerProps.map((p: any) => [p.id, { id: p.id, cleaningPrice: p.cleaningPrice || 0 }])
    );
    const ownerPaymentsForCalc = paymentsForCalc.filter((p) => p.proprietarioId === ownerId);

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

  return creditByOwner;
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
  // ⚡ Bump quando i dati statici freschi arrivano dal server DOPO un paint da
  // cache: forza il ricalcolo della useMemo coi dati aggiornati.
  const [staticVersion, setStaticVersion] = useState(0);
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

  // ⏱️ [PERF] log del tempo totale fino a pagina pronta
  const perfStartRef = useRef<number>(Date.now());
  const perfLoggedRef = useRef(false);
  useEffect(() => {
    if (loading) { perfLoggedRef.current = false; if (!perfStartRef.current) perfStartRef.current = Date.now(); }
    else if (!perfLoggedRef.current) {
      perfLoggedRef.current = true;
      console.log(`⏱️ [PERF] ===== PAGINA PRONTA in ${Date.now() - perfStartRef.current}ms =====`);
    }
  }, [loading]);

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
    console.log(`⏱️ [PERF] === useEffect setup PARTITO === ${new Date().toISOString().slice(11,23)}`);

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
      // ⚡ PARALLELO: avvio loadStaticData SENZA bloccare le altre query.
      // Prima static (7,5s) girava da solo PRIMA di tutto, mettendo in coda
      // cleanings/orders. Ora parte in parallelo: lo static aggiorna il suo
      // flag quando è pronto, ma cleanings/orders/payments scaricano subito.
      const tStatic = Date.now();
      loadStaticData(() => {
        // Dati statici freschi arrivati dal server dopo il paint da cache:
        // forza il ricalcolo della UI (caso raro: prezzo cambiato nel frattempo).
        if (mounted) setStaticVersion(v => v + 1);
      }).then((ok) => {
        if (!mounted) return;
        console.log(`⏱️ [PERF] loadStaticData (properties+inventory): ${Date.now() - tStatic}ms`);
        if (!ok) { setError("Errore caricamento dati statici"); return; }
        setStaticLoaded(true);
      });

      const tFirstSnap = Date.now();

      // ⚡ CLEANINGS — intero range, filtro scheduledDate
      const unsubC = onSnapshot(
        query(
          collection(db, "cleanings"),
          where("scheduledDate", ">=", startTs),
          where("scheduledDate", "<=", endTs)
        ),
        (snap) => {
          if (!mounted) return;
          console.log(`⏱️ [PERF] cleanings: primo dato dopo ${Date.now() - tFirstSnap}ms, ${snap.docs.length} docs`);
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
          console.log(`⏱️ [PERF] orders: primo dato dopo ${Date.now() - tFirstSnap}ms, ${snap.docs.length} docs`);
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
          console.log(`⏱️ [PERF] payments: primo dato dopo ${Date.now() - tFirstSnap}ms, ${snap.docs.length} docs`);
          const data = snap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) })) as Payment[];
          setAllPayments(data);
          setPaymentsLoaded(true);
        },
        () => { if (mounted) setError("Errore caricamento pagamenti"); }
      );
      unsubscribesRef.current.push(unsubP);

      // ⚡ PAYMENT OVERRIDES — tutti (sono pochi). Servono per il calcolo carryover
      const unsubOv = onSnapshot(
        collection(db, "paymentOverrides"),
        (snap) => {
          if (!mounted) return;
          console.log(`⏱️ [PERF] overrides: primo dato dopo ${Date.now() - tFirstSnap}ms, ${snap.docs.length} docs`);
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
    // 🎯 Funzione condivisa con la timeline → impossibile divergere
    const creditByOwner = computeCreditByOwner({
      month, year,
      propertiesByOwner,
      allCleanings, allOrders, allPayments, allOverrides,
    });

    for (const [ownerId, ownerProperties] of propertiesByOwner) {
      const ownerName = ownerNames.get(ownerId) || "Sconosciuto";

      // 🎯 Fonte di verità unica: stessa funzione usata anche dalla timeline
      const creditoPrecedente = creditByOwner.get(ownerId) || 0;
      // 🎯 Override admin del mese per QUESTO proprietario (prima caricato
      // ma applicato solo al carryover, mai al totale mostrato in pagina).
      const ownerOverride = allOverrides.find(
        (o: any) =>
          o.proprietarioId === ownerId &&
          Number(o.month) === Number(month) &&
          Number(o.year) === Number(year),
      );
      const r = computeOwnerMonthStats({
        ownerId,
        ownerProperties,
        monthCleanings,
        monthOrders,
        monthPayments,
        creditoPrecedente,
        override: ownerOverride
          ? { overrideTotal: ownerOverride.overrideTotal, reason: ownerOverride.reason }
          : null,
      });

      if (r.totaleCalcolato > 0 || r.totalePagato > 0 || r.creditoPrecedente > 0) {
        stats.push({
          proprietarioId: ownerId, proprietarioName: ownerName,
          propertyCount: ownerProperties.length,
          cleaningsCount: r.cleaningsCount, cleaningsTotal: r.cleaningsTotal,
          ordersCount: r.ordersCount, ordersTotal: r.ordersTotal,
          kitCortesiaCount: r.kitCortesiaCount, kitCortesiaTotal: r.kitCortesiaTotal,
          serviziExtraCount: r.serviziExtraCount, serviziExtraTotal: r.serviziExtraTotal,
          // ⚠️ Entrambi = totale EFFETTIVO (override applicato se presente):
          // il summary somma `totaleCalcolato`, quindi tenerlo grezzo qui
          // farebbe divergere il riepilogo di testata dai saldi dei clienti.
          totaleCalcolato: r.totaleCalcolato,
          totaleEffettivo: r.totaleCalcolato,
          hasOverride: r.hasMonthOverride,
          payments: r.ownerPayments, totalePagato: r.totalePagato,
          saldo: r.saldo,
          creditoPrecedente: r.creditoPrecedente,
          saldoConCredito: r.saldoConCredito,
          stato: r.stato,
          services: r.services,
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
  }, [month, year, loading, allCleanings, allOrders, allPayments, allOverrides, staticVersion]);

  // ⚡ VIEW CACHE — paint istantaneo: mentre i dati veri caricano/calcolano,
  // serviamo l'ultima vista calcolata per questo mese (se esiste).
  const cachedView = useMemo(
    () => (loading ? loadViewCache(month, year) : null),
    [month, year, loading]
  );

  // Persisti il risultato appena il calcolo vero è completo
  useEffect(() => {
    if (!loading && summary) {
      saveViewCache(month, year, { clients, summary, propertiesWithoutPrice });
    }
  }, [loading, clients, summary, propertiesWithoutPrice, month, year]);

  const usingCachedView = loading && cachedView !== null;

  return {
    loading: usingCachedView ? false : loading,
    /** true mentre mostriamo la cache in attesa dei dati freschi (1-3s) */
    isStale: usingCachedView,
    error,
    clients: usingCachedView ? cachedView!.clients : clients,
    summary: usingCachedView ? cachedView!.summary : summary,
    propertiesWithoutPrice: usingCachedView ? cachedView!.propertiesWithoutPrice : propertiesWithoutPrice,
    refresh,
  };
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

export function useRealtimePaymentsTimeline(timelineMonths: { month: number; year: number }[], enabled: boolean = true) {
  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<TimelineClientData[]>([]);

  useEffect(() => {
    let cancelled = false;
    let unsubPayments: (() => void) | null = null;

    async function loadTimelineData() {
      // ⚡ LAZY: non caricare finché la timeline non è effettivamente visibile.
      // Evita il doppio download (lista + timeline) all'apertura della pagina,
      // che era la causa principale dei 7-10s di attesa.
      if (!enabled) {
        return;
      }
      if (timelineMonths.length === 0) {
        setTableData([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const t0 = Date.now();

      try {
        await loadStaticData();

        // Range preciso della timeline (per visualizzazione)
        const allDates = timelineMonths.map(m => new Date(m.year, m.month - 1, 1));
        const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
        const maxDate = timelineMonths.reduce((max, m) => {
          const d = new Date(m.year, m.month, 0, 23, 59, 59, 999);
          return d > max ? d : max;
        }, new Date(0));

        // 🆕 Range ESTESO per il calcolo carryover/acconti: 24 mesi prima del primo
        //    mese visibile, così computeCreditByOwner ha tutto lo storico necessario
        //    per calcolare correttamente i surplus pagati nei mesi precedenti.
        const minDateExtended = new Date(minDate.getFullYear(), minDate.getMonth() - 24, 1);

        // ⚡ Query filtrate per range esteso (cleanings/orders) + overrides.
        // 🔄 FIX TABELLA STANTIA: i payments NON sono più un getDocs one-shot ma
        // un LISTENER (sotto): registrare/modificare un pagamento dalla Lista
        // ricalcola la tabella all'istante. Prima la tabella restava congelata
        // al momento del primo caricamento → "chi ha pagato non risulta saldato".
        const [cleaningsSnap, ordersSnap, overridesSnap] = await Promise.all([
          getDocs(query(
            collection(db, "cleanings"),
            where("scheduledDate", ">=", Timestamp.fromDate(minDateExtended)),
            where("scheduledDate", "<=", Timestamp.fromDate(maxDate))
          )),
          getDocs(query(
            collection(db, "orders"),
            where("scheduledDate", ">=", Timestamp.fromDate(minDateExtended)),
            where("scheduledDate", "<=", Timestamp.fromDate(maxDate))
          )),
          getDocs(collection(db, "paymentOverrides")),
        ]);

        if (cancelled) return;

        // @ts-expect-error TODO-FIX: TS2339 Property 'status' does not exist on type '{ id: string; }'.
        const cleanings = cleaningsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) })).filter(c => c.status === "COMPLETED");
        // @ts-expect-error TODO-FIX: TS2339 Property 'status' does not exist on type '{ id: string; }'.
        const orders = ordersSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) })).filter(o => o.status !== "CANCELLED");
        const allOverrides = overridesSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));

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

        // 🔄 Ricalcolo completo della tabella dato l'elenco pagamenti corrente.
        // Richiamato dal listener payments a ogni cambiamento.
        const recompute = (allPayments: any[]) => {
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
            // ⚡ Pre-processa con processOrder così computeOwnerMonthStats può usare
            //    calculatedTotal/mainCategory/*Subtotal coerenti con la lista
            .map(processOrder);
          const monthPayments = allPayments.filter((p: any) => Number(p.month) === Number(month) && Number(p.year) === Number(year));

          // 💰 Carryover/acconto: calcolo il credito accumulato dai mesi PRECEDENTI
          //    al mese corrente. Stessa funzione condivisa con la lista → numeri identici.
          const creditByOwner = computeCreditByOwner({
            month, year,
            propertiesByOwner,
            allCleanings: cleanings,
            allOrders: orders,
            allPayments,
            allOverrides,
          });

          for (const [ownerId, ownerProperties] of propertiesByOwner) {
            const ownerName = ownerNames.get(ownerId) || "Sconosciuto";
            const creditoPrecedente = creditByOwner.get(ownerId) || 0;

            // 🎯 Stessa identica funzione usata dalla LISTA → impossibile divergere.
            //    Passo creditoPrecedente così l'acconto viene applicato anche qui.
            const ownerOverride = allOverrides.find(
              (o: any) =>
                o.proprietarioId === ownerId &&
                Number(o.month) === Number(month) &&
                Number(o.year) === Number(year),
            );
            const r = computeOwnerMonthStats({
              ownerId,
              ownerProperties,
              monthCleanings: monthCleanings as any[],
              monthOrders: monthOrders as any[],
              monthPayments,
              creditoPrecedente,
              override: ownerOverride
                ? { overrideTotal: ownerOverride.overrideTotal, reason: ownerOverride.reason }
                : null,
            });

            if (r.totaleCalcolato > 0 || r.ownerPayments.length > 0 || r.creditoPrecedente > 0) {
              // Mappa stato → status (nomi diversi per retrocompatibilità UI timeline)
              let status: "NESSUNO" | "PAGATO" | "PARZIALE" | "DA_PAGARE" = "NESSUNO";
              if (r.totaleCalcolato > 0) {
                if (r.stato === "SALDATO") status = "PAGATO";
                else if (r.stato === "PARZIALE") status = "PARZIALE";
                else status = "DA_PAGARE";
              }

              if (!clientsMap.has(ownerId)) {
                clientsMap.set(ownerId, { proprietarioId: ownerId, proprietarioName: ownerName, properties: [], months: [] });
              }
              const client = clientsMap.get(ownerId)!;
              r.propertyNames.forEach(name => { if (!client.properties.includes(name)) client.properties.push(name); });
              client.months.push({ month, year, status, saldo: r.saldoConCredito, totale: r.totaleCalcolato });
            }
          }
        }

        const result = Array.from(clientsMap.values())
          .sort((a, b) => a.proprietarioName.localeCompare(b.proprietarioName));

        setTableData(result);
        };

        // 🔄 LISTENER payments: prima emissione = primo popolamento tabella;
        // ogni pagamento registrato/modificato dopo → ricalcolo immediato.
        unsubPayments = onSnapshot(collection(db, "payments"), (snap) => {
          if (cancelled) return;
          const allPayments = snap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
          recompute(allPayments);
          setLoading(false);
        }, (error) => {
          console.error("❌ Errore listener payments timeline:", error);
          if (!cancelled) setLoading(false);
        });
      } catch (error) {
        console.error("❌ Errore timeline:", error);
        if (!cancelled) setLoading(false);
      }
    }

    loadTimelineData();
    return () => { cancelled = true; if (unsubPayments) unsubPayments(); };
  }, [timelineMonths, enabled]);

  return { loading, tableData };
}

// ==================== UTILITY ====================
export function refreshPaymentsCache() {
  staticCache.loaded = false;
  staticCache.properties.clear();
  staticCache.inventory.clear();
}
