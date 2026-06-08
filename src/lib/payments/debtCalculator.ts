/**
 * debtCalculator — UNICA FONTE DI VERITÀ per il calcolo del debito mensile.
 *
 * Funzione pura (no I/O, no hooks) usata da:
 *   - useOwnerBalance.ts          (modal Pagamenti in sospeso)
 *   - useOwnerDebts.ts            (slide pagamenti, layout, pulizie)
 *   - useOwnerRealtimePayments.ts (pagina /proprietario/pagamenti)
 *   - computeOwnerDebt.ts         (cron e API server-side)
 *
 * REGOLE DEL CALCOLO (consolidate dopo audit di divergenze):
 *   1. Pulizie: SOLO status "COMPLETED", filtro per scheduledDate nel mese.
 *      Prezzo = (priceOverride ?? price ?? property.cleaningPrice) + holidayFee
 *   2. Ordini: status "DELIVERED" oppure cleaningId di pulizia COMPLETED del mese.
 *      Status "CANCELLED" sempre escluso.
 *      Filtro data ordine: deliveredAt → scheduledDate (NO fallback createdAt
 *      perché ordini senza data significativa non vanno fatturati).
 *      Prezzo = totalPriceOverride ?? (Σ items + deliveryFee + bedMakingFee)
 *   3. Pagamenti: filtrati per (proprietarioId, month, year) — sottratti al saldo.
 *   4. Override mese (paymentOverrides): se esiste, sostituisce TOTALMENTE il
 *      totaleServizi calcolato. Pensato per concedere sconti / fissare cifre.
 *
 * IMPORTANTE: ogni modifica a queste regole deve avvenire SOLO qui.
 * I 4 consumers chiamano questa funzione e si adattano automaticamente.
 */

// ════════════════════════════════════════════════════════════════
// TYPES — minimi e indipendenti dai SDK Firebase
// ════════════════════════════════════════════════════════════════

/**
 * Date-like generico: un Timestamp Firebase ha .toDate(),
 * un Date nativo è già un Date. La funzione accetta entrambi.
 */
export type DateLike = { toDate: () => Date } | Date | undefined | null;

export interface DebtCalcProperty {
  id: string;
  cleaningPrice?: number;
}

export interface DebtCalcCleaning {
  id: string;
  propertyId: string;
  status: string;
  scheduledDate?: DateLike;
  price?: number;
  priceOverride?: number;
  holidayFee?: number;
  excludedFromBilling?: boolean;
}

export interface DebtCalcOrderItem {
  id?: string;
  itemId?: string;
  unitPrice?: number;
  price?: number;
  priceOverride?: number;
  totalPrice?: number;
  quantity?: number;
  /**
   * Tipo dell'item ("linen" o "cleaning_product"). Solo "cleaning_product"
   * va ESCLUSO dal totale del proprietario (sono prodotti pulizia richiesti
   * dagli operatori, addebitati separatamente / non al proprietario).
   */
  type?: string;
  /**
   * Categoria dell'item (es. "biancheria_letto", "biancheria_bagno",
   * "kit_cortesia", "prodotti_pulizia"). Usata in fallback se manca `type`.
   */
  categoryId?: string;
  category?: string;
}

/**
 * Pattern di nomi che indicano un prodotto pulizia operatore anche
 * quando l'item NON ha `type`/`categoryId` settati (legacy data
 * pre-introduzione del sistema product-request).
 */
const CLEANING_PRODUCT_NAME_PATTERNS: RegExp[] = [
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

/**
 * Determina se un item è un "prodotto pulizia operatore" (non addebitato
 * al proprietario). Centralizzata per coerenza tra debtCalculator e UI.
 *
 * Cascade:
 *   1. item.type === "cleaning_product" (flag esplicito)
 *   2. item.categoryId === "prodotti_pulizia" (categoria sistema)
 *   3. item.name matcha pattern noti (fallback per items legacy
 *      creati prima che type/categoryId fossero introdotti)
 */
export function isCleaningProductItem(item: DebtCalcOrderItem): boolean {
  if (item.type === "cleaning_product") return true;
  const cat = item.categoryId || item.category || "";
  if (cat === "prodotti_pulizia" || cat === "cleaning_products") return true;
  // Fallback name-based per legacy data senza flag
  const name = (item as any).name;
  if (name && typeof name === "string") {
    if (CLEANING_PRODUCT_NAME_PATTERNS.some(re => re.test(name))) return true;
  }
  return false;
}

export interface DebtCalcOrder {
  id: string;
  propertyId: string;
  status: string;
  cleaningId?: string;
  scheduledDate?: DateLike;
  deliveredAt?: DateLike;
  createdAt?: DateLike;
  items?: DebtCalcOrderItem[];
  totalPriceOverride?: number;
  /**
   * Totale memorizzato sull'ordine (scritto da processOrder). È il valore
   * mostrato nella pagina admin /dashboard/pagamenti. Quando presente è la
   * fonte di verità; il ricalcolo da items resta come fallback per ordini
   * legacy che ne sono privi. Passarlo SOLO dai consumer che devono
   * combaciare con quella pagina (dashboard proprietario).
   */
  calculatedTotal?: number;
  deliveryFee?: number;
  deliveryFeeEnabled?: boolean;
  bedMaking?: boolean;
  bedMakingFee?: number;
  excludedFromBilling?: boolean;
}

export interface DebtCalcPayment {
  proprietarioId?: string;
  month: number;
  year: number;
  amount: number;
  method?: string;
  /**
   * Se true, indica che questo pagamento è un acconto creato automaticamente
   * dal sistema in seguito a eliminazione/esclusione di un servizio in mese
   * pagato. Importante: nel calcolo carryover passivo, questo pagamento NON
   * deve contribuire al "credito accumulato" del mese sorgente (perché è
   * stato già fatto rifluire come acconto sul mese target).
   */
  isCreditTransfer?: boolean;
}

export interface DebtCalcInventoryItem {
  id?: string;
  sellPrice?: number;
  price?: number;
  /** Nome leggibile per UI (può mancare per items legacy). */
  name?: string;
  /** Categoria sistema: biancheria_letto, biancheria_bagno, kit_cortesia, prodotti_pulizia, servizi_extra, altro. */
  categoryId?: string;
}

export interface DebtCalcOverride {
  proprietarioId?: string;
  month: number;
  year: number;
  overrideTotal: number;
  reason?: string;
}

// ════════════════════════════════════════════════════════════════
// RESULT TYPE
// ════════════════════════════════════════════════════════════════

export interface MonthDebtBreakdown {
  /** Totale calcolato dalle pulizie del mese (solo COMPLETED). */
  cleaningsTotal: number;
  /** Totale calcolato dagli ordini del mese (DELIVERED o linked-COMPLETED). */
  ordersTotal: number;
  /** Numero pulizie incluse. */
  cleaningsCount: number;
  /** Numero ordini inclusi. */
  ordersCount: number;
  /** True se è stato applicato un paymentOverride per il mese. */
  hasOverride: boolean;
  /** Solo se hasOverride: il totale grezzo prima dell'override. */
  rawCalcBeforeOverride?: number;
  /** Eventuale motivo dell'override (per UI admin). */
  overrideReason?: string;
}

export interface MonthDebtCalc {
  month: number;
  year: number;
  /** Totale fattura del mese (post-override se presente). */
  totaleServizi: number;
  /** Somma dei pagamenti registrati per il mese. */
  totalePagato: number;
  /** totaleServizi - totalePagato (può essere ≤ 0 se saldato/pagato in eccesso). */
  saldo: number;
  /** Dettaglio per debug e UI. */
  breakdown: MonthDebtBreakdown;
  /**
   * Credito accumulato da pagamenti in eccesso nei mesi PRECEDENTI.
   * Solo informativo (carryover applicato). 0 se computeMonthDebt è chiamata
   * senza carryover esplicito.
   */
  creditoPrecedente?: number;
  /**
   * Saldo finale tenendo conto del credito precedente.
   * = saldo - creditoPrecedente. Se < 0, c'è ancora credito residuo.
   */
  saldoConCredito?: number;
}

// ════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════

function toDateOrNull(d: DateLike): Date | null {
  if (!d) return null;
  if (d instanceof Date) return d;
  if (typeof (d as any).toDate === "function") {
    try { return (d as any).toDate(); } catch { return null; }
  }
  return null;
}

function isDateInMonth(d: Date | null, month: number, year: number): boolean {
  if (!d) return false;
  return d.getMonth() === month - 1 && d.getFullYear() === year;
}

/**
 * Calcola il prezzo grezzo di un ordine (Σ items + deliveryFee + bedMakingFee).
 * NON applica totalPriceOverride — la decisione di farlo è del caller.
 *
 * 🔒 Esclude gli items di tipo "cleaning_product" / categoria "prodotti_pulizia":
 * questi sono prodotti richiesti dagli operatori che NON vanno addebitati
 * al proprietario (solo evasi insieme alla biancheria per comodità logistica).
 */
export function calculateOrderRawPrice(
  order: DebtCalcOrder,
  inventoryById: Map<string, DebtCalcInventoryItem>,
): number {
  let total = 0;

  if (Array.isArray(order.items)) {
    for (const item of order.items) {
      // 🔒 Skip prodotti pulizia operatore — non sono addebitati al proprietario
      if (isCleaningProductItem(item)) continue;

      const itemKey = item.itemId || item.id;
      const invItem = itemKey ? inventoryById.get(itemKey) : undefined;
      // 🔧 FIX disallineamento pagina/canonico: un prezzo salvato a 0 (o
      // mancante) sull'item NON è un prezzo valido — è un dato sporco (es.
      // articolo salvato con unitPrice/totalPrice = 0 ma con prezzo di
      // listino in inventario). Va trattato come "mancante" e si ricade sul
      // sellPrice dell'inventario, ESATTAMENTE come fa la pagina admin
      // (processOrder usa `||`). Senza questo, lo stesso ordine veniva
      // fatturato 1,50€ in meno dal carryover rispetto a quanto incassato
      // → acconto fantasma su ogni incasso. (caso reale: "Canavaccio Cucina"
      // con unitPrice:0 in Casa Galilei).
      // NB: nessun articolo è legittimamente gratis (verificato su
      // systemItems), quindi forzare il listino sullo 0 è sicuro.
      const basePrice =
        (item.unitPrice || undefined) ??
        (item.price || undefined) ??
        invItem?.sellPrice ??
        invItem?.price ??
        0;
      const unitPrice = item.priceOverride ?? basePrice;
      const quantity = item.quantity ?? 1;
      // Allo stesso modo: un totalPrice salvato a 0 viene ignorato a favore
      // del calcolo unit*qty (che ora ha il prezzo di listino corretto).
      const itemTotal = (item.totalPrice || undefined) ?? unitPrice * quantity;
      total += itemTotal;
    }
  }

  // Delivery fee — incluso solo se abilitato
  if (order.deliveryFee && order.deliveryFeeEnabled !== false) {
    total += order.deliveryFee;
  }

  // Bed making fee — incluso solo se attivo
  if (order.bedMaking && order.bedMakingFee) {
    total += order.bedMakingFee;
  }

  return total;
}

// ════════════════════════════════════════════════════════════════
// MAIN: computeMonthDebt
// ════════════════════════════════════════════════════════════════

/**
 * Calcola il debito di UN proprietario per UN mese, dato l'insieme
 * completo dei dati già caricati (questa funzione non fa I/O).
 *
 * Il chiamante può passare cleanings/orders del solo proprietario
 * o del mondo intero — il filtro per propertyId è già gestito tramite
 * la map `propertiesById` (le entry mancanti scartano automaticamente).
 *
 * @param month  Mese 1-12
 * @param year   Anno (es. 2026)
 * @returns Calcolo con breakdown, o null se il mese non ha attività
 *          E nessun override (nulla da fatturare).
 */
export function computeMonthDebt(args: {
  month: number;
  year: number;
  propertiesById: Map<string, DebtCalcProperty>;
  cleanings: DebtCalcCleaning[];
  orders: DebtCalcOrder[];
  payments: DebtCalcPayment[];
  inventoryById: Map<string, DebtCalcInventoryItem>;
  override?: DebtCalcOverride | null;
}): MonthDebtCalc | null {
  const { month, year, propertiesById, cleanings, orders, payments, inventoryById, override } = args;

  // ─── 1. Pulizie COMPLETED nel mese ────────────────────
  let cleaningsTotal = 0;
  let cleaningsCount = 0;
  const completedCleaningIdsInMonth = new Set<string>();

  for (const c of cleanings) {
    if (c.status !== "COMPLETED") continue;
    if (c.excludedFromBilling === true) continue;
    if (!propertiesById.has(c.propertyId)) continue;
    const d = toDateOrNull(c.scheduledDate);
    if (!isDateInMonth(d, month, year)) continue;

    const prop = propertiesById.get(c.propertyId);
    const basePrice = c.price ?? prop?.cleaningPrice ?? 0;
    const holidayFee = c.holidayFee ?? 0;
    const effectivePrice = (c.priceOverride ?? basePrice) + holidayFee;

    cleaningsTotal += effectivePrice;
    cleaningsCount += 1;
    completedCleaningIdsInMonth.add(c.id);
  }

  // ─── 2. Ordini DELIVERED o linked-COMPLETED ──────────
  let ordersTotal = 0;
  let ordersCount = 0;

  for (const o of orders) {
    if (o.status === "CANCELLED") continue;
    if (o.excludedFromBilling === true) continue;
    if (!propertiesById.has(o.propertyId)) continue;

    const isDelivered = o.status === "DELIVERED";
    const isLinkedToCompleted =
      !!o.cleaningId && completedCleaningIdsInMonth.has(o.cleaningId);
    if (!isDelivered && !isLinkedToCompleted) continue;

    // Data dell'ordine: deliveredAt → scheduledDate
    // (NO fallback createdAt: ordini senza data effettiva non vanno fatturati)
    const orderDate = toDateOrNull(o.deliveredAt) || toDateOrNull(o.scheduledDate);
    if (!isDateInMonth(orderDate, month, year)) continue;

    const rawPrice = calculateOrderRawPrice(o, inventoryById);
    // Allineamento alla pagina Pagamenti: se l'ordine ha `calculatedTotal`
    // memorizzato, quello è la verità (stesso numero dell'area admin). Il
    // ricalcolo da items è il fallback per ordini legacy senza il campo.
    // L'override manuale del totale ha sempre la precedenza.
    const storedTotal = typeof o.calculatedTotal === "number" ? o.calculatedTotal : undefined;
    const effectivePrice = o.totalPriceOverride ?? storedTotal ?? rawPrice;

    ordersTotal += effectivePrice;
    ordersCount += 1;
  }

  // ─── 3. Override admin sul totale mese ─────────────────
  const rawCalc = cleaningsTotal + ordersTotal;
  const hasOverride = !!override;
  const totaleServizi = hasOverride ? override!.overrideTotal : rawCalc;

  // Se il mese non ha né attività né override, non c'è nulla da restituire
  if (!hasOverride && rawCalc === 0) {
    return null;
  }

  // ─── 4. Pagamenti del mese ─────────────────────────────
  // ⚠️ ESCLUDIAMO i pagamenti `isCreditTransfer: true` dal calcolo del saldo:
  // questi rappresentano credito automatico generato dal sistema in seguito
  // a eliminazione di servizi in mese pagato. Sono "ridondanti" rispetto al
  // calcolo carryover passivo (che già rileva l'eccesso del sourceMonth e lo
  // propaga). Includerli porterebbe a doppio conteggio del credito.
  let totalePagato = 0;
  for (const p of payments) {
    if (p.month === month && p.year === year) {
      if (p.isCreditTransfer === true) continue;
      totalePagato += p.amount || 0;
    }
  }

  const saldo = totaleServizi - totalePagato;

  return {
    month,
    year,
    totaleServizi,
    totalePagato,
    saldo,
    breakdown: {
      cleaningsTotal,
      ordersTotal,
      cleaningsCount,
      ordersCount,
      hasOverride,
      rawCalcBeforeOverride: hasOverride ? rawCalc : undefined,
      overrideReason: override?.reason,
    },
  };
}

/**
 * Helper: genera la lista degli ultimi N mesi (escluso il mese corrente).
 * Default 24 mesi — usato da tutti i consumer.
 */
export function getMonthsToCheck(
  refDate: Date = new Date(),
  monthsBack: number = 24,
): Array<{ month: number; year: number }> {
  const currentMonth = refDate.getMonth() + 1;
  const currentYear = refDate.getFullYear();
  const result: Array<{ month: number; year: number }> = [];

  for (let i = 1; i <= monthsBack; i++) {
    let m = currentMonth - i;
    let y = currentYear;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    result.push({ month: m, year: y });
  }

  return result;
}

/**
 * Helper: costruisce inventoryById gestendo i 3 alias usati nel database
 * (id documento, campo `key`, prefisso `item_`).
 *
 * Popola anche `name` e `categoryId` quando disponibili, utili a chi usa
 * la map per arricchire la UI (es. classificare items per categoria).
 */
export function buildInventoryMap(
  inventoryDocs: Array<{ id: string; data: Record<string, any> }>,
): Map<string, DebtCalcInventoryItem> {
  const map = new Map<string, DebtCalcInventoryItem>();
  for (const { id, data } of inventoryDocs) {
    const item: DebtCalcInventoryItem = {
      id,
      sellPrice: data.sellPrice || data.price || 0,
      name: data.name || "",
      categoryId: data.categoryId || data.category || undefined,
    };
    map.set(id, item);
    if (data.key) map.set(data.key, item);
    if (id.startsWith("item_")) map.set(id.replace("item_", ""), item);
  }
  return map;
}

// ════════════════════════════════════════════════════════════════
// CARRYOVER: credito da mesi precedenti
// ════════════════════════════════════════════════════════════════

/**
 * Calcola il credito disponibile dai mesi PRECEDENTI a (month, year).
 *
 * Considera tutti i mesi prima del mese di riferimento, e per ognuno
 * somma i pagamenti meno i servizi. Se la somma è positiva, è credito
 * a favore del cliente. Se è zero o negativa, non c'è credito.
 *
 * Nota: NON include il mese stesso (month, year) — solo quelli precedenti.
 *
 * Esempio:
 *   - Aprile: servizi 100€, pagato 150€  → 50€ di eccesso
 *   - Maggio: servizi 80€, pagato 0€     → 80€ dovuti
 *   - Calcolo per Maggio: creditoPrecedente = 50€, saldo finale = 80 - 50 = 30€
 *
 * @returns importo del credito disponibile (≥ 0), o 0 se nessun credito
 */
export function computeOwnerCreditFromPriorMonths(args: {
  month: number;
  year: number;
  propertiesById: Map<string, DebtCalcProperty>;
  cleanings: DebtCalcCleaning[];
  orders: DebtCalcOrder[];
  payments: DebtCalcPayment[];
  inventoryById: Map<string, DebtCalcInventoryItem>;
  overridesByMonth?: Map<string, DebtCalcOverride>; // key: "YYYY-MM"
  /** Quanti mesi indietro guardare (default 24). */
  monthsBack?: number;
}): number {
  const {
    month, year, propertiesById, cleanings, orders, payments,
    inventoryById, overridesByMonth, monthsBack = 24,
  } = args;

  let runningCredit = 0;

  // Itero dai mesi più vecchi al mese precedente al riferimento
  // così il credito si propaga correttamente di mese in mese
  for (let i = monthsBack; i >= 1; i--) {
    const refDate = new Date(year, month - 1 - i, 1);
    const m = refDate.getMonth() + 1;
    const y = refDate.getFullYear();

    const monthKey = `${y}-${String(m).padStart(2, "0")}`;
    const override = overridesByMonth?.get(monthKey);

    const calc = computeMonthDebt({
      month: m, year: y,
      propertiesById, cleanings, orders, payments, inventoryById,
      override,
    });

    if (!calc) continue; // nessuna attività in quel mese

    // Saldo del singolo mese - credito già accumulato
    // Se totaleServizi=100 e totalePagato=150 → saldo = -50 → 50 di eccesso
    const monthSaldo = calc.saldo;

    if (monthSaldo < 0) {
      // Pagamento in eccesso → aggiungo al credito
      runningCredit += -monthSaldo;
    } else if (monthSaldo > 0 && runningCredit > 0) {
      // Mese in debito → consumo il credito accumulato
      const consumed = Math.min(monthSaldo, runningCredit);
      runningCredit -= consumed;
    }
    // Se saldo == 0: nulla cambia
  }

  return Math.max(0, runningCredit);
}

/**
 * Wrapper di computeMonthDebt che applica automaticamente il credito
 * dai mesi precedenti. Restituisce un MonthDebtCalc arricchito coi
 * campi creditoPrecedente e saldoConCredito.
 *
 * Comodo per i consumer che vogliono mostrare "saldo reale" senza
 * dover ricomputare manualmente.
 */
export function computeMonthDebtWithCarryover(args: {
  month: number;
  year: number;
  propertiesById: Map<string, DebtCalcProperty>;
  cleanings: DebtCalcCleaning[];
  orders: DebtCalcOrder[];
  payments: DebtCalcPayment[];
  inventoryById: Map<string, DebtCalcInventoryItem>;
  override?: DebtCalcOverride | null;
  overridesByMonth?: Map<string, DebtCalcOverride>;
  monthsBack?: number;
}): MonthDebtCalc | null {
  const calc = computeMonthDebt({
    month: args.month, year: args.year,
    propertiesById: args.propertiesById,
    cleanings: args.cleanings,
    orders: args.orders,
    payments: args.payments,
    inventoryById: args.inventoryById,
    override: args.override,
  });
  if (!calc) return null;

  const creditoPrecedente = computeOwnerCreditFromPriorMonths({
    month: args.month, year: args.year,
    propertiesById: args.propertiesById,
    cleanings: args.cleanings,
    orders: args.orders,
    payments: args.payments,
    inventoryById: args.inventoryById,
    overridesByMonth: args.overridesByMonth,
    monthsBack: args.monthsBack,
  });

  return {
    ...calc,
    creditoPrecedente,
    saldoConCredito: calc.saldo - creditoPrecedente,
  };
}
