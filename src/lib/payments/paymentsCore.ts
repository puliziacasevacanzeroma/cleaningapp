/**
 * ════════════════════════════════════════════════════════════════════
 * paymentsCore.ts — FONTE DI VERITÀ del calcolo PAGAMENTI
 * ════════════════════════════════════════════════════════════════════
 *
 * Stesso ruolo che `linenCore.ts` ha per la biancheria: modulo PURO
 * (zero firebase, zero react) da cui DEVONO passare tutti i punti che
 * calcolano quanto un proprietario deve pagare e come quel totale si
 * ripartisce fra le categorie mostrate a schermo.
 *
 * ─── PERCHÉ ESISTE ────────────────────────────────────────────────
 * Prima di questo modulo la stessa cifra veniva calcolata in 4 posti
 * con regole leggermente diverse, e quindi divergeva:
 *
 *   1. `useRealtimePayments.processOrder`     (pagina admin)
 *   2. `useOwnerRealtimePayments.buildOrderItemDetails` (area proprietario)
 *   3. `debtCalculator.calculateOrderRawPrice` (email, estratto conto, cron)
 *   4. il riepilogo per-proprietà dentro `dashboard/pagamenti/page.tsx`
 *
 * Divergenze reali eliminate da questo modulo:
 *   - (1) non escludeva i prodotti pulizia riconosciuti PER NOME
 *     (anticalcare, sgrassatore, candeggina…) mentre (2) e (3) sì
 *     → l'admin fatturava voci che il proprietario non vedeva.
 *   - (2) usava `??` sul prezzo, (1) e (3) usavano `||`
 *     → un item con prezzo 0 sporco valeva 0 di là e listino di qua.
 *   - (1) e (2) scartavano dal TOTALE gli item senza nome risolvibile,
 *     (3) no → totale admin ≠ totale canonico su quegli ordini.
 *   - (4) non conosceva affatto lo scorporo per categoria
 *     → il kit cortesia finiva dentro la biancheria.
 *   - nessuno dei quattro trattava gli item categorizzati "altro":
 *     entravano nel totale ma in nessun sottototale, e lo scaling
 *     proporzionale li spalmava in silenzio sulle altre categorie.
 *
 * ─── INVARIANTE CENTRALE ──────────────────────────────────────────
 *   linen + kit + extra + altro + others === calculatedTotal
 *
 * Il totale è una PARTIZIONE esatta: nessun euro può nascondersi in un
 * bucket senza categoria, e nessun euro può essere contato due volte.
 * `assertPartition()` lo verifica; i test la usano su dati veri.
 *
 * ─── REGOLA DI PREZZO (canonica, allineata a debtCalculator) ──────
 * Un prezzo salvato a 0 o mancante NON è un prezzo valido: è dato
 * sporco. Si ricade sul listino di inventario. Nessun articolo è
 * legittimamente gratis (verificato su systemItems).
 * Caso reale che ha originato la regola: "Canavaccio Cucina" con
 * unitPrice:0 in Casa Galilei → 1,50€ di scarto sul carryover.
 */

import { isCleaningProductItem } from "./debtCalculator";

// ══════════════════════════════════════════════════════════════════
// TIPI
// ══════════════════════════════════════════════════════════════════

export type ItemCategoryGroup =
  | "linen"
  | "kit_cortesia"
  | "servizi_extra"
  | "cleaning_product"
  | "altro";

export type ServiceCategory = "BIANCHERIA" | "KIT_CORTESIA" | "SERVIZI_EXTRA";

/** Voce di inventario, nella forma minima che serve al calcolo. */
export interface CoreInventoryItem {
  name?: string;
  sellPrice?: number;
  price?: number;
  categoryId?: string;
  categoryName?: string;
}

/** Voce di SYSTEM_ITEMS / OPTIONAL_ITEMS. */
export interface CoreSystemItem {
  name: string;
  categoryId: string;
}

/** Sottototali di un ordine. Partizione esatta di `total`. */
export interface OrderSubtotals {
  /** Biancheria letto + bagno. */
  linen: number;
  /** Kit cortesia. */
  kit: number;
  /** Servizi extra. */
  extra: number;
  /**
   * Articoli fatturabili che NON rientrano in nessuna categoria nota
   * (categoria mancante o non riconosciuta, item orfani senza nome).
   * Entrano nel totale — perché la formula canonica li fattura — ma
   * restano visibili come bucket separato invece di essere spalmati.
   * Un valore > 0 qui è un SEGNALE DI DATO SPORCO da bonificare.
   */
  altro: number;
  /** Costo consegna + preparazione letti. */
  others: number;
  /** Somma dei cinque campi sopra. */
  total: number;
}

/** Ripartizione del prezzo effettivo di un ordine sulle 3 categorie a schermo. */
export interface CategorySplit {
  linen: number;
  kit: number;
  extra: number;
}

// ══════════════════════════════════════════════════════════════════
// PREZZI — cascata canonica (identica a calculateOrderRawPrice)
// ══════════════════════════════════════════════════════════════════

/**
 * Prezzo unitario di un item.
 *
 * Cascata: unitPrice → price → inventario.sellPrice → inventario.price → 0.
 * `|| undefined` è VOLUTO: uno 0 salvato non è un prezzo, è dato sporco,
 * quindi si scende di livello. `priceOverride` vince sempre (anche 0:
 * lì lo zero è una decisione esplicita dell'admin, non dato sporco).
 */
export function resolveItemUnitPrice(item: any, invItem?: CoreInventoryItem): number {
  const basePrice =
    (item?.unitPrice || undefined) ??
    (item?.price || undefined) ??
    (invItem?.sellPrice || undefined) ??
    (invItem?.price || undefined) ??
    0;
  return item?.priceOverride ?? basePrice;
}

/**
 * Totale riga di un item.
 * Anche qui un `totalPrice` salvato a 0 viene ignorato a favore di
 * unitPrice × quantity.
 */
export function resolveItemTotal(item: any, invItem?: CoreInventoryItem): number {
  const unitPrice = resolveItemUnitPrice(item, invItem);
  const quantity = item?.quantity ?? 1;
  return (item?.totalPrice || undefined) ?? unitPrice * quantity;
}

// ══════════════════════════════════════════════════════════════════
// CLASSIFICAZIONE
// ══════════════════════════════════════════════════════════════════

function normCat(v: unknown): string {
  return typeof v === "string" ? v.toLowerCase().trim() : "";
}

function groupFromCategoryId(cat: string): ItemCategoryGroup | null {
  if (!cat) return null;
  if (cat === "prodotti_pulizia" || cat === "cleaning_products") return "cleaning_product";
  if (cat === "kit_cortesia") return "kit_cortesia";
  if (cat === "servizi_extra") return "servizi_extra";
  if (cat === "biancheria_letto" || cat === "biancheria_bagno") return "linen";
  return null;
}

function groupFromFuzzyCategory(cat: string): ItemCategoryGroup | null {
  if (!cat) return null;
  if (cat.includes("cortesia") || cat.includes("kit")) return "kit_cortesia";
  if (cat.includes("extra")) return "servizi_extra";
  if (cat.includes("biancheria") || cat.includes("linen")) return "linen";
  return null;
}

/**
 * Classifica un item in un gruppo categoria.
 *
 * ⚠️ Il primo controllo è `isCleaningProductItem` — che include il
 * fallback PER NOME di debtCalculator. È la differenza che prima
 * mancava lato admin e faceva fatturare "anticalcare" & co.
 *
 * Cascata: prodotto pulizia → categoria sull'item → categoria da
 * inventario (esatta, poi fuzzy) → SYSTEM_ITEMS → "altro".
 */
export function classifyItemGroup(
  item: any,
  invItem?: CoreInventoryItem,
  sysItem?: CoreSystemItem,
): ItemCategoryGroup {
  if (isCleaningProductItem(item)) return "cleaning_product";

  const fromItem = groupFromCategoryId(normCat(item?.categoryId || item?.category));
  if (fromItem) return fromItem;

  const invCat = normCat(invItem?.categoryId || invItem?.categoryName);
  const fromInvExact = groupFromCategoryId(invCat);
  if (fromInvExact) return fromInvExact;
  const fromInvFuzzy = groupFromFuzzyCategory(invCat);
  if (fromInvFuzzy) return fromInvFuzzy;

  const fromSys = groupFromCategoryId(normCat(sysItem?.categoryId));
  if (fromSys) return fromSys;

  return "altro";
}

/**
 * Categoria dominante dell'ordine: quella col sottototale più alto.
 * A parità, o con tutto a zero, vince BIANCHERIA (comportamento storico).
 */
export function pickMainCategory(linen: number, kit: number, extra: number): ServiceCategory {
  if (kit > linen && kit > extra) return "KIT_CORTESIA";
  if (extra > linen && extra > kit) return "SERVIZI_EXTRA";
  return "BIANCHERIA";
}

/** Etichetta leggibile ↔ categoria. Tollerante ai valori legacy in DB. */
export function categoryLabel(cat: ServiceCategory): string {
  if (cat === "KIT_CORTESIA") return "Kit Cortesia";
  if (cat === "SERVIZI_EXTRA") return "Servizi Extra";
  return "Biancheria";
}

export function parseCategoryLabel(label: string | undefined | null): ServiceCategory {
  const c = normCat(label);
  if (c.includes("cortesia") || c.includes("kit")) return "KIT_CORTESIA";
  if (c.includes("extra")) return "SERVIZI_EXTRA";
  return "BIANCHERIA";
}

// ══════════════════════════════════════════════════════════════════
// SPLIT PER CATEGORIA
// ══════════════════════════════════════════════════════════════════

/**
 * Ripartisce il prezzo EFFETTIVO di un ordine sulle 3 categorie a schermo.
 *
 * Regole:
 *   - `others` (consegna + preparazione letti) e `altro` (voci non
 *     categorizzabili) seguono la categoria dominante dell'ordine.
 *     Convenzione esplicita, non un effetto collaterale.
 *   - Il riscalamento serve SOLO a riflettere un `totalPriceOverride`
 *     manuale. Poiché `subtotals.total` è per costruzione la somma di
 *     tutti e cinque i bucket, senza override il rapporto è 1 e non
 *     avviene nessuna redistribuzione silenziosa.
 *   - Ordine vuoto con override > 0: tutto sulla categoria dominante,
 *     così il valore non si perde.
 *
 * Garanzia: linen + kit + extra === effectivePrice (a meno di epsilon).
 */
export function splitOrderByCategory(
  subtotals: OrderSubtotals,
  mainCategory: ServiceCategory,
  effectivePrice: number,
): CategorySplit {
  const bucket = subtotals.others + subtotals.altro;

  let linen = subtotals.linen + (mainCategory === "BIANCHERIA" ? bucket : 0);
  let kit = subtotals.kit + (mainCategory === "KIT_CORTESIA" ? bucket : 0);
  let extra = subtotals.extra + (mainCategory === "SERVIZI_EXTRA" ? bucket : 0);

  const partsRaw = linen + kit + extra;

  if (partsRaw <= 0.001) {
    // Ordine senza articoli valorizzati ma con un prezzo effettivo
    // (tipicamente un override manuale): tutto sulla dominante.
    if (Math.abs(effectivePrice) <= 0.001) return { linen: 0, kit: 0, extra: 0 };
    if (mainCategory === "KIT_CORTESIA") return { linen: 0, kit: effectivePrice, extra: 0 };
    if (mainCategory === "SERVIZI_EXTRA") return { linen: 0, kit: 0, extra: effectivePrice };
    return { linen: effectivePrice, kit: 0, extra: 0 };
  }

  const ratio = effectivePrice / partsRaw;
  linen *= ratio;
  kit *= ratio;
  extra *= ratio;

  return { linen, kit, extra };
}

// ══════════════════════════════════════════════════════════════════
// FATTURABILITÀ — regole identiche a computeMonthDebt
// ══════════════════════════════════════════════════════════════════

/**
 * Una pulizia è fatturabile se è COMPLETED e non esclusa a mano.
 * Il filtro sul mese resta a carico del chiamante (usa `scheduledDate`).
 */
export function isCleaningBillable(cleaning: any): boolean {
  if (cleaning?.status !== "COMPLETED") return false;
  if (cleaning?.excludedFromBilling === true) return false;
  return true;
}

/**
 * Un ordine è fatturabile se non è annullato, non è escluso a mano, ed
 * è DELIVERED oppure collegato a una pulizia COMPLETED del mese.
 *
 * ⚠️ `status === "CANCELLED"` prima veniva controllato solo da
 * computeMonthDebt: un ordine annullato ma collegato a una pulizia
 * completata finiva nei riquadri per categoria e non nel totale.
 */
export function isOrderBillable(order: any, completedCleaningIds: Set<string>): boolean {
  if (order?.status === "CANCELLED") return false;
  if (order?.excludedFromBilling === true) return false;
  if (order?.status === "DELIVERED") return true;
  if (order?.cleaningId && completedCleaningIds.has(order.cleaningId)) return true;
  return false;
}

// ══════════════════════════════════════════════════════════════════
// VERIFICA INVARIANTE
// ══════════════════════════════════════════════════════════════════

/**
 * Verifica che i sottototali siano una partizione esatta del totale.
 * Ritorna lo scarto (0 = perfetto). Usata dai test e dalle route di audit.
 */
export function partitionDelta(s: OrderSubtotals): number {
  return s.total - (s.linen + s.kit + s.extra + s.altro + s.others);
}

export function assertPartition(s: OrderSubtotals, epsilon = 0.01): boolean {
  return Math.abs(partitionDelta(s)) <= epsilon;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export { isCleaningProductItem };
