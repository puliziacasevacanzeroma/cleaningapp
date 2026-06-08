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
