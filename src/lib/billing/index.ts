/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BILLING MODULE - Export centralizzato
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Questo modulo contiene TUTTO il necessario per la gestione contabilità:
 * - Tipi TypeScript
 * - Funzioni di calcolo
 * - Funzioni di formattazione
 * - Costanti
 * 
 * USAGE:
 * ```typescript
 * import { 
 *   Payment, 
 *   formatCurrency, 
 *   calculateClientStats 
 * } from "~/lib/billing";
 * ```
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type {
  // Enums
  PaymentMethod,
  PaymentType,
  BillingServiceType,
  ServiceType,  // Alias per compatibilità
  PaymentStatus,
  
  // Core interfaces
  Payment,
  PaymentOverride,
  ClientBalance,
  
  // Detail interfaces
  OrderItemDetail,
  ServiceDetail,
  
  // Stats interfaces
  ClientPaymentStats,
  PaymentsSummary,
  PropertyPaymentStats,
  
  // Input interfaces
  CreatePaymentInput,
  SetOverrideInput,
  
  // Raw data interfaces (for Firebase)
  CleaningForBilling,
  OrderForBilling,
  PropertyForBilling,
  InventoryItemForBilling,
  OrderItemForBilling,
} from "./types";

export {
  // Type guards
  isPayment,
  isPaymentOverride,
  
  // Constants
  MONTHS_IT,
  MONTHS_SHORT_IT,
  PAYMENT_METHODS,
  PAYMENT_TYPES,
  CATEGORY_TO_SERVICE_TYPE,
} from "./types";

// ═══════════════════════════════════════════════════════════════════════════
// FORMATTERS
// ═══════════════════════════════════════════════════════════════════════════

export {
  // Currency
  formatCurrency,
  formatCurrencyCompact,
  
  // Dates
  toDate,
  formatDate,
  formatDateLong,
  formatDateTime,
  getMonthName,
  formatMonthYear,
  
  // Service helpers
  getServiceIcon,
  getServiceLabel,
  getServiceColor,
  mapCategoryToServiceType,
  
  // Payment status helpers
  calculatePaymentStatus,
  getPaymentStatusIcon,
  getPaymentStatusLabel,
  getPaymentStatusClasses,
  
  // Utilities
  roundToTwo,
  safeSum,
  generateKey,
} from "./formatters";

// ═══════════════════════════════════════════════════════════════════════════
// CALCULATOR
// ═══════════════════════════════════════════════════════════════════════════

export type {
  CleaningPriceResult,
  OrderPriceResult,
  CalculateClientStatsInput,
} from "./calculator";

export {
  // Price calculations
  calculateCleaningPrice,
  calculateOrderPrice,
  
  // Stats calculations
  calculateClientStats,
  groupServicesByProperty,
  calculateSummaryFromStats,
  
  // CSV export
  generatePaymentsCSV,
  downloadCSV,
} from "./calculator";
