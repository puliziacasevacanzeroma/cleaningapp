/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BILLING FORMATTERS - Funzioni di formattazione centralizzate
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Funzioni pure per formattazione valute, date, e helper vari.
 * Usate in tutte le pagine di contabilità.
 */

import { Timestamp } from "firebase/firestore";
import { 
  type BillingServiceType, 
  type PaymentStatus,
  MONTHS_IT,
  MONTHS_SHORT_IT,
} from "./types";

// ═══════════════════════════════════════════════════════════════════════════
// FORMATTAZIONE VALUTA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Formatta un numero come valuta EUR
 * @param amount - Importo da formattare
 * @param showSign - Se mostrare il segno + per valori positivi
 * @returns Stringa formattata (es. "€ 123,45")
 */
export function formatCurrency(amount: number, showSign = false): string {
  const formatted = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  
  if (showSign && amount > 0) {
    return `+${formatted}`;
  }
  if (amount < 0) {
    return `-${formatted}`;
  }
  return formatted;
}

/**
 * Formatta un numero come valuta compatta (senza decimali se .00)
 * @param amount - Importo da formattare
 * @returns Stringa formattata (es. "€123" o "€123,50")
 */
export function formatCurrencyCompact(amount: number): string {
  if (amount % 1 === 0) {
    return `€${Math.round(amount)}`;
  }
  return formatCurrency(amount);
}

// ═══════════════════════════════════════════════════════════════════════════
// FORMATTAZIONE DATE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Converte vari formati data in Date
 * Gestisce: Timestamp Firebase, oggetti serializzati, stringhe ISO, Date
 */
export function toDate(value: unknown): Date | null {
  if (!value) return null;
  
  // Già una Date
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  
  // Timestamp Firebase
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  
  // Oggetto con toDate() (Timestamp)
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const obj = value as { toDate: () => Date };
    if (typeof obj.toDate === "function") {
      return obj.toDate();
    }
  }
  
  // Oggetto con seconds (Timestamp serializzato)
  if (typeof value === "object" && value !== null && "seconds" in value) {
    const obj = value as { seconds: number; nanoseconds?: number };
    return new Date(obj.seconds * 1000);
  }
  
  // Stringa ISO
  if (typeof value === "string") {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
  
  // Numero (timestamp milliseconds)
  if (typeof value === "number") {
    return new Date(value);
  }
  
  return null;
}

/**
 * Formatta una data in formato italiano breve
 * @returns "01/12/2024"
 */
export function formatDate(value: unknown): string {
  const date = toDate(value);
  if (!date) return "-";
  
  return date.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Formatta una data in formato esteso
 * @returns "1 Dicembre 2024"
 */
export function formatDateLong(value: unknown): string {
  const date = toDate(value);
  if (!date) return "-";
  
  return date.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Formatta data e ora
 * @returns "01/12/2024 14:30"
 */
export function formatDateTime(value: unknown): string {
  const date = toDate(value);
  if (!date) return "-";
  
  return date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Ottiene il nome del mese
 * @param month - Numero mese (1-12)
 * @param short - Se usare abbreviazione
 */
export function getMonthName(month: number, short = false): string {
  const index = month - 1;
  if (index < 0 || index > 11) return "";
  return short ? MONTHS_SHORT_IT[index] : MONTHS_IT[index];
}

/**
 * Formatta mese e anno
 * @returns "Dicembre 2024"
 */
export function formatMonthYear(month: number, year: number): string {
  return `${getMonthName(month)} ${year}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER SERVIZI
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ottiene l'icona per un tipo di servizio
 */
export function getServiceIcon(type: BillingServiceType): string {
  switch (type) {
    case "PULIZIA": return "🧹";
    case "BIANCHERIA": return "🛏️";
    case "KIT_CORTESIA": return "🧴";
    case "SERVIZI_EXTRA": return "✨";
    default: return "📦";
  }
}

/**
 * Ottiene l'etichetta per un tipo di servizio
 */
export function getServiceLabel(type: BillingServiceType): string {
  switch (type) {
    case "PULIZIA": return "Pulizia";
    case "BIANCHERIA": return "Biancheria";
    case "KIT_CORTESIA": return "Kit Cortesia";
    case "SERVIZI_EXTRA": return "Servizi Extra";
    default: return "Altro";
  }
}

/**
 * Ottiene il colore per un tipo di servizio (Tailwind classes)
 */
export function getServiceColor(type: BillingServiceType): string {
  switch (type) {
    case "PULIZIA": return "blue";
    case "BIANCHERIA": return "purple";
    case "KIT_CORTESIA": return "pink";
    case "SERVIZI_EXTRA": return "orange";
    default: return "gray";
  }
}

/**
 * Mappa una categoria inventario al tipo servizio billing
 * NOTA: Questa funzione è identica a quella in payments.ts per compatibilità
 */
export function mapCategoryToServiceType(categoryName: string): BillingServiceType {
  const lower = categoryName.toLowerCase();
  if (lower.includes("cortesia")) return "KIT_CORTESIA";
  if (lower.includes("extra") || lower.includes("servizi")) return "SERVIZI_EXTRA";
  return "BIANCHERIA";
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER STATO PAGAMENTO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calcola lo stato pagamento dato totale e pagato
 */
export function calculatePaymentStatus(totaleDovuto: number, totalePagato: number): PaymentStatus {
  const saldo = totaleDovuto - totalePagato;
  if (saldo <= 0) return "SALDATO";
  if (totalePagato > 0) return "PARZIALE";
  return "DA_PAGARE";
}

/**
 * Ottiene l'icona per uno stato pagamento
 */
export function getPaymentStatusIcon(status: PaymentStatus): string {
  switch (status) {
    case "SALDATO": return "✅";
    case "PARZIALE": return "🟡";
    case "DA_PAGARE": return "🔴";
    default: return "❓";
  }
}

/**
 * Ottiene l'etichetta per uno stato pagamento
 */
export function getPaymentStatusLabel(status: PaymentStatus): string {
  switch (status) {
    case "SALDATO": return "Saldato";
    case "PARZIALE": return "Parziale";
    case "DA_PAGARE": return "Da pagare";
    default: return "Sconosciuto";
  }
}

/**
 * Ottiene le classi Tailwind per uno stato pagamento
 */
export function getPaymentStatusClasses(status: PaymentStatus): string {
  switch (status) {
    case "SALDATO": 
      return "bg-green-100 text-green-800 border-green-200";
    case "PARZIALE": 
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "DA_PAGARE": 
      return "bg-red-100 text-red-800 border-red-200";
    default: 
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY GENERICHE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Arrotonda a 2 decimali
 */
export function roundToTwo(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Somma sicura di un array di numeri
 */
export function safeSum(numbers: (number | undefined | null)[]): number {
  // @ts-expect-error TODO-FIX: TS2322 Type 'number | null | undefined' is not assignable to type 'number'.
  return numbers.reduce((sum, n) => sum + (n ?? 0), 0);
}

/**
 * Genera un ID univoco per chiavi React
 */
export function generateKey(prefix = "key"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
