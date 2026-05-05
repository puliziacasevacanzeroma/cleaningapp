/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BILLING TYPES - Tipi centralizzati per sistema contabilità
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Questo file contiene TUTTI i tipi usati nel sistema di pagamenti e contabilità.
 * È l'unica fonte di verità (Single Source of Truth) per i tipi.
 * 
 * USATO DA:
 * - /lib/firebase/payments.ts
 * - /app/dashboard/pagamenti/page.tsx
 * - /app/proprietario/pagamenti/page.tsx
 * - /app/operatore/pagamenti/page.tsx
 * - /app/api/payments/route.ts
 * - /app/api/proprietario/payments/route.ts
 */

import { type Timestamp } from "firebase/firestore";

// ═══════════════════════════════════════════════════════════════════════════
// ENUMS E TIPI BASE
// ═══════════════════════════════════════════════════════════════════════════

/** Metodo di pagamento */
export type PaymentMethod = "BONIFICO" | "CONTANTI" | "CARTA" | "ALTRO";

/** Tipo di pagamento */
export type PaymentType = "ACCONTO" | "SALDO" | "STORNO";

/** Tipo di servizio per categorizzazione contabilità */
export type BillingServiceType = "PULIZIA" | "BIANCHERIA" | "KIT_CORTESIA" | "SERVIZI_EXTRA";

/** Alias per compatibilità con payments.ts */
export type ServiceType = BillingServiceType;

/** Stato pagamento mensile */
export type PaymentStatus = "SALDATO" | "PARZIALE" | "DA_PAGARE";

// ═══════════════════════════════════════════════════════════════════════════
// INTERFACES - PAGAMENTI
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pagamento registrato nel sistema
 * Collection: payments
 */
export interface Payment {
  id: string;
  proprietarioId: string;
  proprietarioName: string;
  month: number;           // 1-12
  year: number;
  amount: number;
  type: PaymentType;
  method: PaymentMethod;
  note?: string;
  createdAt: Timestamp;
  createdBy: string;
  /** Pagamento auto-generato come credito da eliminazione/esclusione */
  isCreditTransfer?: boolean;
}

/**
 * Override del totale mensile per un cliente
 * Collection: paymentOverrides
 */
export interface PaymentOverride {
  id: string;
  proprietarioId: string;
  month: number;
  year: number;
  originalTotal: number;   // Totale calcolato automaticamente
  overrideTotal: number;   // Totale manuale impostato dall'admin
  reason: string;          // Motivo della modifica
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;    // Obbligatorio come in payments.ts originale
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERFACES - DETTAGLI SERVIZI
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Dettaglio di un singolo item in un ordine
 * Usato per breakdown prezzi biancheria/kit
 */
export interface OrderItemDetail {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;       // Prezzo unitario (con eventuale override)
  totalPrice: number;      // quantity × unitPrice
  categoryName: string;    // Categoria inventario
  hasOverride?: boolean;   // Se ha un prezzo override
}

/**
 * Dettaglio di un servizio (pulizia o ordine)
 * Usato per mostrare il breakdown nella UI
 */
export interface ServiceDetail {
  id: string;
  type: ServiceType;       // Usa ServiceType per compatibilità
  date: Date;
  propertyId: string;
  propertyName: string;
  description: string;
  originalPrice: number;   // Prezzo calcolato
  effectivePrice: number;  // Prezzo effettivo (con override)
  hasOverride: boolean;
  overrideReason?: string;
  // Per ordini: dettaglio items
  items?: OrderItemDetail[];
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERFACES - STATISTICHE CLIENTE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Statistiche pagamenti per un singolo cliente (proprietario)
 * Calcolate per mese/anno
 */
export interface ClientPaymentStats {
  proprietarioId: string;
  proprietarioName: string;
  proprietarioEmail?: string;
  propertyCount: number;
  
  // Conteggi per tipo servizio
  cleaningsCount: number;
  cleaningsTotal: number;
  ordersCount: number;        // Biancheria
  ordersTotal: number;
  kitCortesiaCount: number;
  kitCortesiaTotal: number;
  serviziExtraCount: number;
  serviziExtraTotal: number;
  
  // Totali
  totaleCalcolato: number;    // Somma automatica
  totaleEffettivo: number;    // Con eventuale override
  hasOverride: boolean;
  overrideReason?: string;
  
  // Pagamenti
  payments: Payment[];
  totalePagato: number;
  
  // Saldo
  saldo: number;              // totaleEffettivo - totalePagato
  stato: PaymentStatus;
  
  // Dettaglio servizi
  services: ServiceDetail[];
}

/**
 * Riepilogo globale pagamenti (tutti i clienti)
 */
export interface PaymentsSummary {
  totaleServizi: number;      // Somma tutti i servizi
  totaleIncassato: number;    // Somma tutti i pagamenti
  totaleContanti: number;
  totaleBonifico: number;
  totaleAltro: number;
  saldoTotale: number;        // Da incassare
  clientiConSaldo: number;    // Clienti con saldo > 0
  clientiSaldati: number;     // Clienti con saldo = 0
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERFACES - STATISTICHE PER PROPRIETÀ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Statistiche per singola proprietà
 * Usato nella vista proprietario
 */
export interface PropertyPaymentStats {
  propertyId: string;
  propertyName: string;
  cleaningsCount: number;
  cleaningsTotal: number;
  ordersCount: number;
  ordersTotal: number;
  kitCortesiaCount: number;
  kitCortesiaTotal: number;
  serviziExtraCount: number;
  serviziExtraTotal: number;
  totale: number;
  services: ServiceDetail[];
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERFACES - INPUT FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Input per creare un pagamento
 */
export interface CreatePaymentInput {
  proprietarioId: string;
  proprietarioName: string;
  month: number;
  year: number;
  amount: number;
  type: PaymentType;
  method: PaymentMethod;
  note?: string;
  createdBy: string;
}

/**
 * Input per impostare un override
 */
export interface SetOverrideInput {
  proprietarioId: string;
  month: number;
  year: number;
  originalTotal: number;
  overrideTotal: number;
  reason: string;
  createdBy: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERFACES - DATI RAW DA FIREBASE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pulizia raw da Firestore (campi rilevanti per contabilità)
 */
export interface CleaningForBilling {
  id: string;
  propertyId: string;
  propertyName?: string;
  status: string;
  scheduledDate: Timestamp | { toDate?: () => Date } | string;
  price?: number;
  priceOverride?: number;
  priceOverrideReason?: string;
  holidayFee?: number;
  extraChargesTotal?: number;
  finalPrice?: number;
  type?: string;
}

/**
 * Ordine raw da Firestore (campi rilevanti per contabilità)
 */
export interface OrderForBilling {
  id: string;
  propertyId: string;
  propertyName?: string;
  status: string;
  scheduledDate?: Timestamp | { toDate?: () => Date } | string;
  deliveredAt?: Timestamp | { toDate?: () => Date } | string;
  createdAt?: Timestamp | { toDate?: () => Date } | string;
  items: OrderItemForBilling[];
  totalPriceOverride?: number;
  priceOverrideReason?: string;
}

/**
 * Item ordine raw
 */
export interface OrderItemForBilling {
  id: string;
  name?: string;
  quantity: number;
  price?: number;
  priceOverride?: number;
}

/**
 * Proprietà raw da Firestore (campi rilevanti per contabilità)
 */
export interface PropertyForBilling {
  id: string;
  name: string;
  ownerId: string;
  ownerName?: string;
  ownerEmail?: string;
  cleaningPrice?: number;
  status: string;
}

/**
 * Item inventario (per prezzi)
 */
export interface InventoryItemForBilling {
  id: string;
  name: string;
  sellPrice: number;
  categoryId?: string;
  categoryName?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERFACES - SALDO CLIENTE (Collection clientBalances)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Saldo cliente persistito
 * Collection: clientBalances
 * NOTA: Attualmente usato solo per increment() al complete pulizia
 */
export interface ClientBalance {
  id?: string;
  ownerId: string;
  ownerName?: string;
  totalDue: number;
  totalPaid?: number;
  lastCleaningAt?: Timestamp;
  lastPaymentAt?: Timestamp;
  updatedAt?: Timestamp;
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE GUARDS
// ═══════════════════════════════════════════════════════════════════════════

/** Verifica se un oggetto è un Payment valido */
export function isPayment(obj: unknown): obj is Payment {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "id" in obj &&
    "proprietarioId" in obj &&
    "amount" in obj &&
    "month" in obj &&
    "year" in obj
  );
}

/** Verifica se un oggetto è un PaymentOverride valido */
export function isPaymentOverride(obj: unknown): obj is PaymentOverride {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "id" in obj &&
    "proprietarioId" in obj &&
    "originalTotal" in obj &&
    "overrideTotal" in obj
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// COSTANTI
// ═══════════════════════════════════════════════════════════════════════════

/** Nomi mesi in italiano */
export const MONTHS_IT = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", 
  "Maggio", "Giugno", "Luglio", "Agosto",
  "Settembre", "Ottobre", "Novembre", "Dicembre"
] as const;

/** Nomi mesi abbreviati */
export const MONTHS_SHORT_IT = [
  "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
  "Lug", "Ago", "Set", "Ott", "Nov", "Dic"
] as const;

/** Metodi di pagamento con etichette */
export const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: string }[] = [
  { value: "BONIFICO", label: "Bonifico", icon: "🏦" },
  { value: "CONTANTI", label: "Contanti", icon: "💵" },
  { value: "CARTA", label: "Carta", icon: "💳" },
  { value: "ALTRO", label: "Altro", icon: "📝" },
];

/** Tipi di pagamento con etichette */
export const PAYMENT_TYPES: { value: PaymentType; label: string }[] = [
  { value: "ACCONTO", label: "Acconto" },
  { value: "SALDO", label: "Saldo" },
  { value: "STORNO", label: "Storno" },
];

/** Mapping categoria inventario → tipo servizio billing */
export const CATEGORY_TO_SERVICE_TYPE: Record<string, BillingServiceType> = {
  "biancheria_letto": "BIANCHERIA",
  "biancheria_bagno": "BIANCHERIA",
  "Biancheria Letto": "BIANCHERIA",
  "Biancheria Bagno": "BIANCHERIA",
  "kit_cortesia": "KIT_CORTESIA",
  "Kit Cortesia": "KIT_CORTESIA",
  "prodotti_pulizia": "SERVIZI_EXTRA",
  "Prodotti Pulizia": "SERVIZI_EXTRA",
};
