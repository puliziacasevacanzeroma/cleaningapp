/**
 * 🧺 LINEN CORE — UNICA FONTE DI VERITÀ per il calcolo della biancheria/kit.
 *
 * Questo modulo è PURO (zero dipendenze da Firebase/Next/React) e DETERMINISTICO:
 * stesso input → stesso output, sempre. È pensato per essere chiamato da TUTTI i
 * punti che creano/aggiornano ordini (sync-ical, bookings, cron, manuale, ecc.)
 * e dalla card, così esiste un solo calcolo e un solo vocabolario.
 *
 * La logica di estrazione config (extractBed/extractFlat/buildExpectedItems) è
 * IDENTICA a quella già verificata su 13 ordini reali di produzione (Arya),
 * scan finale = 0 incoerenze.
 */

// ──────────────────────────────────────────────────────────────────────────
// TIPI
// ──────────────────────────────────────────────────────────────────────────

export type Category = "biancheria_letto" | "biancheria_bagno" | "kit_cortesia";

export interface ExpectedItem {
  itemId: string;
  quantity: number;
  categoryId: Category;
}

export interface InventoryItem {
  id: string;
  key?: string | null;
  name?: string;
  sellPrice?: number;
  categoryId?: string | null;
}

export interface RichItem {
  id: string;
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  categoryId: string;
}

export interface PriceWarning {
  itemId: string;
  reason: "not_in_inventory";
}

export interface BuildResult {
  items: RichItem[];
  priceWarnings: PriceWarning[];
}

// Categorie "gestite" dal ricalcolo della config. Tutto ciò che NON è in queste
// categorie (prodotti pulizia, servizi extra, fee, orfani) viene preservato.
export const MANAGED_CATS = new Set<string>([
  "biancheria_letto",
  "biancheria_bagno",
  "kit_cortesia",
]);

// ──────────────────────────────────────────────────────────────────────────
// 1) ESTRAZIONE CONFIG → quantità canoniche  (logica verificata in produzione)
// ──────────────────────────────────────────────────────────────────────────

/** Biancheria letto: gestisce bl['all'], gruppi-letto, o la combinazione dei due. */
export function extractBed(config: any): Record<string, number> {
  const out: Record<string, number> = {};
  if (!config?.bl || typeof config.bl !== "object") return out;

  const blKeys = Object.keys(config.bl);
  const hasAll =
    config.bl["all"] &&
    typeof config.bl["all"] === "object" &&
    Object.keys(config.bl["all"]).length > 0;
  const bedGroupKeys = blKeys.filter((k) => k !== "all");
  const hasBedGroups =
    bedGroupKeys.length > 0 &&
    bedGroupKeys.some((k: string) => {
      const items = config.bl[k];
      return items && typeof items === "object" && Object.keys(items).length > 0;
    });

  if (hasAll && hasBedGroups) {
    // 1) somma dai gruppi letto
    bedGroupKeys.forEach((k: string) => {
      const items = config.bl[k];
      if (items && typeof items === "object") {
        Object.entries(items).forEach(([itemId, qty]: [string, any]) => {
          if (typeof qty === "number" && qty > 0) out[itemId] = (out[itemId] || 0) + qty;
        });
      }
    });
    // 2) bl['all'] SOVRASCRIVE (è la verità per le voci che contiene)
    Object.entries(config.bl["all"]).forEach(([itemId, qty]: [string, any]) => {
      if (typeof qty === "number" && qty > 0) out[itemId] = qty;
    });
  } else if (hasAll) {
    Object.entries(config.bl["all"]).forEach(([itemId, qty]: [string, any]) => {
      if (typeof qty === "number" && qty > 0) out[itemId] = qty;
    });
  } else {
    Object.entries(config.bl).forEach(([bedId, items]: [string, any]) => {
      if (bedId === "all") return;
      if (items && typeof items === "object") {
        Object.entries(items).forEach(([itemId, qty]: [string, any]) => {
          if (typeof qty === "number" && qty > 0) out[itemId] = (out[itemId] || 0) + qty;
        });
      }
    });
  }
  return out;
}

/** Mappa piatta (bagno/kit): {itemId: qty}, scarta qty <= 0. */
export function extractFlat(obj: any): Record<string, number> {
  const out: Record<string, number> = {};
  if (!obj || typeof obj !== "object") return out;
  Object.entries(obj).forEach(([itemId, qty]: [string, any]) => {
    if (typeof qty === "number" && qty > 0) out[itemId] = (out[itemId] || 0) + qty;
  });
  return out;
}

/** Config → lista canonica {itemId, quantity, categoryId}. */
export function buildExpectedItems(config: any): ExpectedItem[] {
  const items: ExpectedItem[] = [];
  const bed = extractBed(config);
  Object.entries(bed).forEach(([itemId, quantity]) =>
    items.push({ itemId, quantity, categoryId: "biancheria_letto" }),
  );
  const bath = extractFlat(config?.ba);
  Object.entries(bath).forEach(([itemId, quantity]) =>
    items.push({ itemId, quantity, categoryId: "biancheria_bagno" }),
  );
  const kit = extractFlat(config?.ki);
  Object.entries(kit).forEach(([itemId, quantity]) =>
    items.push({ itemId, quantity, categoryId: "kit_cortesia" }),
  );
  return items;
}

// ──────────────────────────────────────────────────────────────────────────
// 2) RISOLUZIONE INVENTORY → nome + prezzo  (un solo dizionario, 3 schemi ID)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Costruisce una mappa che risolve un itemId verso il documento inventory,
 * coprendo i 3 schemi ID coesistenti: doc.id casuale, key nuda, prefisso item_.
 */
export function buildInvMap(inventory: InventoryItem[]): Map<string, InventoryItem> {
  const m = new Map<string, InventoryItem>();
  for (const inv of inventory) {
    if (!inv || !inv.id) continue;
    m.set(inv.id, inv); // doc.id (casuale o item_*)
    if (inv.key) m.set(inv.key, inv); // key nuda (es. doubleSheets, canavaccio_cucina)
    if (inv.id.startsWith("item_")) m.set(inv.id.replace("item_", ""), inv); // item_x → x
  }
  return m;
}

export function resolveInv(
  itemId: string,
  invMap: Map<string, InventoryItem>,
): InventoryItem | undefined {
  return invMap.get(itemId) || invMap.get(`item_${itemId}`);
}

// ──────────────────────────────────────────────────────────────────────────
// 3) BUILDER UNICO: config + inventory → order.items "ricchi"
//    Questa è LA funzione che tutti i punti di creazione devono chiamare.
// ──────────────────────────────────────────────────────────────────────────

export function buildOrderItems(
  config: any,
  inventory: InventoryItem[],
  nameFallback: (itemId: string) => string = (id) => id,
): BuildResult {
  const invMap = buildInvMap(inventory);
  const expected = buildExpectedItems(config);
  const priceWarnings: PriceWarning[] = [];

  const items: RichItem[] = expected.map((e) => {
    const inv = resolveInv(e.itemId, invMap);
    const unitPrice = inv?.sellPrice ?? 0;
    const name = inv?.name?.trim() || nameFallback(e.itemId);
    if (!inv) priceWarnings.push({ itemId: e.itemId, reason: "not_in_inventory" });
    return {
      id: e.itemId,
      itemId: e.itemId,
      name,
      quantity: e.quantity,
      unitPrice,
      totalPrice: Math.round(unitPrice * e.quantity * 100) / 100,
      categoryId: e.categoryId,
    };
  });

  return { items, priceWarnings };
}

// ──────────────────────────────────────────────────────────────────────────
// 4) RICONCILIAZIONE CONSERVATIVA (per update/realign di ordini esistenti)
//    Ricalcola SOLO biancheria/bagno/kit; preserva intatto tutto il resto.
// ──────────────────────────────────────────────────────────────────────────

function categoryOf(it: any, invMap: Map<string, InventoryItem>): string {
  const id = it.itemId || it.id;
  const inv = id ? resolveInv(id, invMap) : undefined;
  return String(it.categoryId || it.category || inv?.categoryId || "").toLowerCase();
}

/** True se l'articolo è "gestito dal ricalcolo" (biancheria/bagno/kit). */
export function isManagedByRecompute(it: any, invMap: Map<string, InventoryItem>): boolean {
  const id = it.itemId || it.id;
  if (!id) return false; // niente id → preserva
  if (id === "_delivery_fee" || id === "_bed_making_fee") return false; // fee → preserva
  if (it.type === "cleaning_product") return false; // prodotto pulizia → preserva
  return MANAGED_CATS.has(categoryOf(it, invMap)); // sconosciuto → preserva
}

export interface ReconcileResult {
  finalItems: any[];
  recomputed: RichItem[];
  preserved: any[];
  priceWarnings: PriceWarning[];
}

export function reconcileOrderItems(
  config: any,
  inventory: InventoryItem[],
  existingItems: any[],
  nameFallback: (itemId: string) => string = (id) => id,
): ReconcileResult {
  const invMap = buildInvMap(inventory);
  const { items: recomputed, priceWarnings } = buildOrderItems(config, inventory, nameFallback);
  const existing = Array.isArray(existingItems) ? existingItems : [];
  const preserved = existing.filter((it) => !isManagedByRecompute(it, invMap));
  return {
    finalItems: [...recomputed, ...preserved],
    recomputed,
    preserved,
    priceWarnings,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// 5) REGOLA UNICA "QUALE CONFIG VALE" + GUARIGIONE CUSTOM DEGENERI
//    (v2 — fix split-brain card≠modal, caso Trastevere 27/07/2026)
//
//    PROBLEMA RADICE: la regola "usa customLinenConfig se linenConfigModified
//    === true" esisteva in DUE varianti: i percorsi server la applicavano
//    sempre, il modal aggiungeva "e bl non vuoto". Con un custom DEGENERE
//    (bl/ba vuoti, solo kit) l'ordine veniva costruito dal custom (solo kit)
//    mentre il modal mostrava lo standard (biancheria piena) → card ≠ modal,
//    e il rider consegnava senza lenzuola.
//
//    SOLUZIONE: la regola vive QUI, in un posto solo.
//    - un custom è DEGENERE se non ha né biancheria letto né bagno con qty>0
//      (copre bl:{}, bl:{all:{}}, gruppi vuoti);
//    - se la biancheria è ATTIVA (hasLinenOrder!==false e proprietà non a
//      biancheria propria) un custom degenere viene GUARITO: bl+ba dallo
//      standard, ki+ex dal custom (l'intento dell'utente — es. kit aggiunto —
//      si conserva; le lenzuola non spariscono mai);
//    - per custom SANI la guarigione è IDENTITÀ (nessun cambiamento);
//    - se la biancheria è disattivata o manca lo standard, il custom resta
//      com'è (niente da guarire / niente con cui guarire).
// ──────────────────────────────────────────────────────────────────────────

/** True se la config ha almeno un articolo letto con quantità > 0. */
export function hasBedContent(config: any): boolean {
  return Object.keys(extractBed(config)).length > 0;
}

/** True se la config ha almeno un articolo bagno con quantità > 0. */
export function hasBathContent(config: any): boolean {
  return Object.keys(extractFlat(config?.ba)).length > 0;
}

/** True se la config ha almeno un articolo kit con quantità > 0. */
export function hasKitContent(config: any): boolean {
  return Object.keys(extractFlat(config?.ki)).length > 0;
}

/**
 * Custom DEGENERE = niente biancheria letto E niente bagno (qty>0).
 * (Il kit può esserci o meno: "solo kit" è il caso Trastevere.)
 */
export function isDegenerateCustomConfig(custom: any): boolean {
  if (!custom || typeof custom !== "object") return true;
  return !hasBedContent(custom) && !hasBathContent(custom);
}

/**
 * Guarigione: bl+ba dallo standard, ki+ex dal custom.
 * IDENTITÀ per custom sani o senza standard utilizzabile.
 * Non muta gli input (ritorna un oggetto nuovo in caso di heal).
 */
export function healCustomConfig(custom: any, standardConfig: any): any {
  if (!custom || typeof custom !== "object") return standardConfig ?? custom;
  if (!isDegenerateCustomConfig(custom)) return custom; // sano → identità
  if (!standardConfig || typeof standardConfig !== "object") return custom; // niente cura possibile
  if (!hasBedContent(standardConfig) && !hasBathContent(standardConfig)) return custom; // standard vuoto → inutile
  return {
    ...custom,
    bl: standardConfig.bl ?? {},
    ba: standardConfig.ba ?? {},
    ki: custom.ki ?? {},
    ex: custom.ex ?? {},
    beds:
      Array.isArray(custom.beds) && custom.beds.length > 0
        ? custom.beds
        : (standardConfig.beds ?? []),
  };
}

export interface EffectiveConfigInput {
  linenConfigModified?: boolean | null;
  customLinenConfig?: any;
  hasLinenOrder?: boolean | null;
}

export interface EffectiveConfigResult {
  config: any;
  source: "standard" | "custom" | "custom_healed" | "none";
}

/**
 * LA regola, unica per modal / card / server:
 *  - linenConfigModified !== true → standard;
 *  - custom sano → custom;
 *  - custom degenere + biancheria attiva → custom GUARITO;
 *  - custom degenere + biancheria non attiva → custom com'è (kit-only legittimo:
 *    l'ordine biancheria non esiste comunque).
 */
export function resolveEffectiveConfig(
  cleaning: EffectiveConfigInput,
  standardConfig: any,
  usesOwnLinen?: boolean | null,
): EffectiveConfigResult {
  const custom = cleaning?.customLinenConfig;
  const flag = cleaning?.linenConfigModified === true;

  if (!flag || !custom || typeof custom !== "object") {
    return standardConfig
      ? { config: standardConfig, source: "standard" }
      : { config: custom ?? null, source: custom ? "custom" : "none" };
  }

  if (!isDegenerateCustomConfig(custom)) return { config: custom, source: "custom" };

  const linenActive =
    cleaning?.hasLinenOrder !== false && usesOwnLinen !== true;
  if (!linenActive) return { config: custom, source: "custom" };

  const healed = healCustomConfig(custom, standardConfig);
  return healed === custom
    ? { config: custom, source: "custom" }
    : { config: healed, source: "custom_healed" };
}
