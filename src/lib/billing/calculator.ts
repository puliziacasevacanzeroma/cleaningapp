/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BILLING CALCULATOR - Logica di calcolo centralizzata
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Contiene TUTTA la logica per calcolare:
 * - Totali mensili per cliente
 * - Breakdown per tipo servizio
 * - Statistiche globali
 * 
 * IMPORTANTE: Questa è l'UNICA fonte di verità per i calcoli.
 * Tutti i consumer devono usare queste funzioni.
 */

import {
  type BillingServiceType,
  type Payment,
  type PaymentOverride,
  type ServiceDetail,
  type OrderItemDetail,
  type ClientPaymentStats,
  type PaymentsSummary,
  type PropertyPaymentStats,
  type CleaningForBilling,
  type OrderForBilling,
  type PropertyForBilling,
  type InventoryItemForBilling,
} from "./types";

import {
  toDate,
  mapCategoryToServiceType,
  calculatePaymentStatus,
  roundToTwo,
  safeSum,
} from "./formatters";

// ═══════════════════════════════════════════════════════════════════════════
// CALCOLO PREZZO PULIZIA
// ═══════════════════════════════════════════════════════════════════════════

export interface CleaningPriceResult {
  originalPrice: number;
  effectivePrice: number;
  hasOverride: boolean;
  overrideReason?: string;
}

/**
 * Calcola il prezzo di una pulizia
 * 
 * Logica:
 * 1. Se ha priceOverride → usa quello
 * 2. Se ha finalPrice → usa quello
 * 3. Altrimenti: (price || cleaningPrice) + holidayFee + extraChargesTotal
 */
export function calculateCleaningPrice(
  cleaning: CleaningForBilling,
  propertyCleaningPrice = 0
): CleaningPriceResult {
  // Prezzo base
  const basePrice = cleaning.price ?? propertyCleaningPrice ?? 0;
  const holidayFee = cleaning.holidayFee ?? 0;
  const extraCharges = cleaning.extraChargesTotal ?? 0;
  
  // Prezzo originale (calcolato)
  const originalPrice = cleaning.finalPrice ?? (basePrice + holidayFee + extraCharges);
  
  // Prezzo effettivo (con eventuale override)
  const hasOverride = cleaning.priceOverride !== undefined && cleaning.priceOverride !== null;
  const effectivePrice = hasOverride ? cleaning.priceOverride! : originalPrice;
  
  return {
    originalPrice: roundToTwo(originalPrice),
    effectivePrice: roundToTwo(effectivePrice),
    hasOverride,
    overrideReason: cleaning.priceOverrideReason,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CALCOLO PREZZO ORDINE
// ═══════════════════════════════════════════════════════════════════════════

export interface OrderPriceResult {
  calculatedTotal: number;
  effectivePrice: number;
  hasOverride: boolean;
  overrideReason?: string;
  itemDetails: OrderItemDetail[];
  mainCategory: BillingServiceType;
}

/**
 * Calcola il prezzo di un ordine biancheria/kit
 * 
 * Logica:
 * 1. Per ogni item: (priceOverride || inventoryPrice || item.price) × quantity
 * 2. Se ha totalPriceOverride → usa quello come totale finale
 * 3. Determina la categoria principale in base al valore
 */
export function calculateOrderPrice(
  order: OrderForBilling,
  inventoryMap: Map<string, InventoryItemForBilling>
): OrderPriceResult {
  let calculatedTotal = 0;
  const itemDetails: OrderItemDetail[] = [];
  const categoryTotals: Record<string, number> = {};
  let maxCategoryTotal = 0;
  let mainCategory: BillingServiceType = "BIANCHERIA";
  
  if (order.items && Array.isArray(order.items)) {
    for (const item of order.items) {
      const invItem = inventoryMap.get(item.id);
      
      // Prezzo unitario: priceOverride > sellPrice > item.price > 0
      const basePrice = invItem?.sellPrice ?? item.price ?? 0;
      const unitPrice = item.priceOverride ?? basePrice;
      const quantity = item.quantity ?? 1;
      const itemTotal = unitPrice * quantity;
      
      calculatedTotal += itemTotal;
      
      // Categoria
      const categoryName = invItem?.categoryName ?? "Altro";
      categoryTotals[categoryName] = (categoryTotals[categoryName] ?? 0) + itemTotal;
      
      if (categoryTotals[categoryName] > maxCategoryTotal) {
        maxCategoryTotal = categoryTotals[categoryName];
        mainCategory = mapCategoryToServiceType(categoryName);
      }
      
      itemDetails.push({
        itemId: item.id,
        name: invItem?.name ?? item.name ?? "Articolo",
        quantity,
        unitPrice: roundToTwo(unitPrice),
        totalPrice: roundToTwo(itemTotal),
        categoryName,
        hasOverride: item.priceOverride !== undefined && item.priceOverride !== null,
      });
    }
  }
  
  // Override totale ordine
  const hasOverride = order.totalPriceOverride !== undefined && order.totalPriceOverride !== null;
  const effectivePrice = hasOverride ? order.totalPriceOverride! : calculatedTotal;
  
  return {
    calculatedTotal: roundToTwo(calculatedTotal),
    effectivePrice: roundToTwo(effectivePrice),
    hasOverride,
    overrideReason: order.priceOverrideReason,
    itemDetails,
    mainCategory,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CALCOLO STATISTICHE CLIENTE
// ═══════════════════════════════════════════════════════════════════════════

export interface CalculateClientStatsInput {
  proprietarioId: string;
  proprietarioName: string;
  proprietarioEmail?: string;
  properties: PropertyForBilling[];
  cleanings: CleaningForBilling[];
  orders: OrderForBilling[];
  payments: Payment[];
  override: PaymentOverride | null;
  inventoryMap: Map<string, InventoryItemForBilling>;
  month: number;
  year: number;
}

/**
 * Calcola le statistiche complete per un cliente
 * 
 * Questa è la funzione PRINCIPALE che calcola tutto per un proprietario.
 * Deve essere usata sia dal backend che dal frontend.
 */
export function calculateClientStats(input: CalculateClientStatsInput): ClientPaymentStats {
  const {
    proprietarioId,
    proprietarioName,
    proprietarioEmail,
    properties,
    cleanings,
    orders,
    payments,
    override,
    inventoryMap,
    month,
    year,
  } = input;
  
  // Range date per il mese
  const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59);
  
  // Mappa proprietà per lookup veloce
  const propertiesById = new Map(properties.map(p => [p.id, p]));
  const propertyIds = new Set(properties.map(p => p.id));
  
  // Risultati
  const services: ServiceDetail[] = [];
  let cleaningsCount = 0;
  let cleaningsTotal = 0;
  let ordersCount = 0;
  let ordersTotal = 0;
  let kitCortesiaCount = 0;
  let kitCortesiaTotal = 0;
  let serviziExtraCount = 0;
  let serviziExtraTotal = 0;
  
  // ─── PROCESSA PULIZIE ───
  for (const cleaning of cleanings) {
    // Solo pulizie COMPLETED delle proprietà del cliente
    if (cleaning.status !== "COMPLETED") continue;
    if (!propertyIds.has(cleaning.propertyId)) continue;
    
    const scheduledDate = toDate(cleaning.scheduledDate);
    if (!scheduledDate) continue;
    if (scheduledDate < startOfMonth || scheduledDate > endOfMonth) continue;
    
    const property = propertiesById.get(cleaning.propertyId);
    const priceResult = calculateCleaningPrice(cleaning, property?.cleaningPrice);
    
    cleaningsCount++;
    cleaningsTotal += priceResult.effectivePrice;
    
    services.push({
      id: cleaning.id,
      type: "PULIZIA",
      date: scheduledDate,
      propertyId: cleaning.propertyId,
      propertyName: cleaning.propertyName ?? property?.name ?? "Proprietà",
      description: `Pulizia ${cleaning.type ?? "checkout"}`,
      originalPrice: priceResult.originalPrice,
      effectivePrice: priceResult.effectivePrice,
      hasOverride: priceResult.hasOverride,
      overrideReason: priceResult.overrideReason,
    });
  }
  
  // ─── PROCESSA ORDINI ───
  for (const order of orders) {
    // Solo ordini DELIVERED delle proprietà del cliente
    if (order.status !== "DELIVERED") continue;
    if (!propertyIds.has(order.propertyId)) continue;
    
    // Data: deliveredAt > scheduledDate > createdAt
    const deliveryDate = toDate(order.deliveredAt) ?? toDate(order.scheduledDate) ?? toDate(order.createdAt);
    if (!deliveryDate) continue;
    if (deliveryDate < startOfMonth || deliveryDate > endOfMonth) continue;
    
    const priceResult = calculateOrderPrice(order, inventoryMap);
    const serviceType = priceResult.mainCategory;
    
    // Aggiungi al contatore appropriato
    switch (serviceType) {
      case "KIT_CORTESIA":
        kitCortesiaCount++;
        kitCortesiaTotal += priceResult.effectivePrice;
        break;
      case "SERVIZI_EXTRA":
        serviziExtraCount++;
        serviziExtraTotal += priceResult.effectivePrice;
        break;
      default: // BIANCHERIA
        ordersCount++;
        ordersTotal += priceResult.effectivePrice;
    }
    
    services.push({
      id: order.id,
      type: serviceType,
      date: deliveryDate,
      propertyId: order.propertyId,
      propertyName: order.propertyName ?? "Proprietà",
      description: `${priceResult.itemDetails.length} articoli`,
      originalPrice: priceResult.calculatedTotal,
      effectivePrice: priceResult.effectivePrice,
      hasOverride: priceResult.hasOverride,
      overrideReason: priceResult.overrideReason,
      items: priceResult.itemDetails,
    });
  }
  
  // Ordina servizi per data
  services.sort((a, b) => a.date.getTime() - b.date.getTime());
  
  // ─── CALCOLA TOTALI ───
  const totaleCalcolato = roundToTwo(
    cleaningsTotal + ordersTotal + kitCortesiaTotal + serviziExtraTotal
  );
  
  const hasOverride = override !== null;
  const totaleEffettivo = hasOverride ? override.overrideTotal : totaleCalcolato;
  
  // ─── PROCESSA PAGAMENTI ───
  const monthPayments = payments.filter(p => p.month === month && p.year === year);
  const totalePagato = roundToTwo(safeSum(monthPayments.map(p => p.amount)));
  
  // ─── CALCOLA SALDO ───
  const saldo = roundToTwo(totaleEffettivo - totalePagato);
  const stato = calculatePaymentStatus(totaleEffettivo, totalePagato);
  
  return {
    proprietarioId,
    proprietarioName,
    proprietarioEmail,
    propertyCount: properties.length,
    cleaningsCount,
    cleaningsTotal: roundToTwo(cleaningsTotal),
    ordersCount,
    ordersTotal: roundToTwo(ordersTotal),
    kitCortesiaCount,
    kitCortesiaTotal: roundToTwo(kitCortesiaTotal),
    serviziExtraCount,
    serviziExtraTotal: roundToTwo(serviziExtraTotal),
    totaleCalcolato,
    totaleEffettivo,
    hasOverride,
    overrideReason: override?.reason,
    payments: monthPayments,
    totalePagato,
    saldo,
    stato,
    services,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CALCOLO STATISTICHE PER PROPRIETÀ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Raggruppa i servizi per proprietà
 */
export function groupServicesByProperty(
  services: ServiceDetail[],
  properties: PropertyForBilling[]
): PropertyPaymentStats[] {
  const statsByProperty = new Map<string, PropertyPaymentStats>();
  
  // Inizializza tutte le proprietà
  for (const property of properties) {
    statsByProperty.set(property.id, {
      propertyId: property.id,
      propertyName: property.name,
      cleaningsCount: 0,
      cleaningsTotal: 0,
      ordersCount: 0,
      ordersTotal: 0,
      kitCortesiaCount: 0,
      kitCortesiaTotal: 0,
      serviziExtraCount: 0,
      serviziExtraTotal: 0,
      totale: 0,
      services: [],
    });
  }
  
  // Aggiungi servizi
  for (const service of services) {
    const stats = statsByProperty.get(service.propertyId);
    if (!stats) continue;
    
    stats.services.push(service);
    
    switch (service.type) {
      case "PULIZIA":
        stats.cleaningsCount++;
        stats.cleaningsTotal += service.effectivePrice;
        break;
      case "BIANCHERIA":
        stats.ordersCount++;
        stats.ordersTotal += service.effectivePrice;
        break;
      case "KIT_CORTESIA":
        stats.kitCortesiaCount++;
        stats.kitCortesiaTotal += service.effectivePrice;
        break;
      case "SERVIZI_EXTRA":
        stats.serviziExtraCount++;
        stats.serviziExtraTotal += service.effectivePrice;
        break;
    }
    
    stats.totale += service.effectivePrice;
  }
  
  // Arrotonda e ordina
  const result = Array.from(statsByProperty.values());
  for (const stats of result) {
    stats.cleaningsTotal = roundToTwo(stats.cleaningsTotal);
    stats.ordersTotal = roundToTwo(stats.ordersTotal);
    stats.kitCortesiaTotal = roundToTwo(stats.kitCortesiaTotal);
    stats.serviziExtraTotal = roundToTwo(stats.serviziExtraTotal);
    stats.totale = roundToTwo(stats.totale);
  }
  
  return result.sort((a, b) => a.propertyName.localeCompare(b.propertyName));
}

// ═══════════════════════════════════════════════════════════════════════════
// CALCOLO RIEPILOGO GLOBALE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calcola il riepilogo globale da un array di statistiche cliente
 */
export function calculateSummaryFromStats(clientStats: ClientPaymentStats[]): PaymentsSummary {
  let totaleServizi = 0;
  let totaleIncassato = 0;
  let totaleContanti = 0;
  let totaleBonifico = 0;
  let totaleAltro = 0;
  let clientiConSaldo = 0;
  let clientiSaldati = 0;
  
  for (const client of clientStats) {
    totaleServizi += client.totaleEffettivo;
    totaleIncassato += client.totalePagato;
    
    if (client.saldo > 0) {
      clientiConSaldo++;
    } else {
      clientiSaldati++;
    }
    
    // Breakdown per metodo pagamento
    for (const payment of client.payments) {
      switch (payment.method) {
        case "CONTANTI":
          totaleContanti += payment.amount;
          break;
        case "BONIFICO":
          totaleBonifico += payment.amount;
          break;
        default:
          totaleAltro += payment.amount;
      }
    }
  }
  
  return {
    totaleServizi: roundToTwo(totaleServizi),
    totaleIncassato: roundToTwo(totaleIncassato),
    totaleContanti: roundToTwo(totaleContanti),
    totaleBonifico: roundToTwo(totaleBonifico),
    totaleAltro: roundToTwo(totaleAltro),
    saldoTotale: roundToTwo(totaleServizi - totaleIncassato),
    clientiConSaldo,
    clientiSaldati,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT CSV
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Genera CSV dei pagamenti per export
 */
export function generatePaymentsCSV(
  clientStats: ClientPaymentStats[],
  month: number,
  year: number
): string {
  // Header con periodo
  const periodHeader = `Riepilogo Pagamenti - ${month}/${year}`;
  
  const headers = [
    "Proprietario",
    "Proprietà",
    "Pulizie (n)",
    "Pulizie (€)",
    "Biancheria (n)",
    "Biancheria (€)",
    "Kit Cortesia (€)",
    "Extra (€)",
    "Totale (€)",
    "Pagato (€)",
    "Saldo (€)",
    "Stato",
  ];
  
  const rows: string[][] = [];
  
  for (const client of clientStats) {
    rows.push([
      client.proprietarioName,
      String(client.propertyCount),
      String(client.cleaningsCount),
      client.cleaningsTotal.toFixed(2),
      String(client.ordersCount),
      client.ordersTotal.toFixed(2),
      client.kitCortesiaTotal.toFixed(2),
      client.serviziExtraTotal.toFixed(2),
      client.totaleEffettivo.toFixed(2),
      client.totalePagato.toFixed(2),
      client.saldo.toFixed(2),
      client.stato,
    ]);
  }
  
  // Riga totali
  const summary = calculateSummaryFromStats(clientStats);
  rows.push([
    "TOTALE",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    summary.totaleServizi.toFixed(2),
    summary.totaleIncassato.toFixed(2),
    summary.saldoTotale.toFixed(2),
    "",
  ]);
  
  // Genera CSV
  const csvContent = [
    periodHeader,
    "",
    headers.join(";"),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(";")),
  ].join("\n");
  
  return csvContent;
}

/**
 * Scarica il CSV (per uso nel browser)
 */
export function downloadCSV(
  clientStats: ClientPaymentStats[],
  month: number,
  year: number
): void {
  const csv = generatePaymentsCSV(clientStats, month, year);
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.href = url;
  link.download = `pagamenti_${month}_${year}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
