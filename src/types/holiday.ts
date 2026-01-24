import { Timestamp } from "firebase/firestore";

// ═══════════════════════════════════════════════════════════════
// HOLIDAY - Festività con maggiorazioni
// ═══════════════════════════════════════════════════════════════

export type HolidayType = 
  | "national"      // Festività nazionale (es. 25 dicembre)
  | "regional"      // Festività regionale
  | "local"         // Festività locale
  | "special"       // Evento speciale (es. ponte)
  | "custom";       // Personalizzato

export interface Holiday {
  id: string;
  
  // Info base
  name: string;                 // "Natale", "Capodanno", etc.
  date: Timestamp;              // Data festività
  type: HolidayType;
  
  // Ricorrenza
  isRecurring: boolean;         // Se si ripete ogni anno
  recurringMonth?: number;      // Mese (1-12) se ricorrente
  recurringDay?: number;        // Giorno (1-31) se ricorrente
  
  // Maggiorazione
  surchargeType: "percentage" | "fixed";
  surchargePercentage?: number; // Es. 50 per +50%
  surchargeFixed?: number;      // Es. 20 per +20€
  
  // Applicabilità
  appliesToAllServices: boolean;
  applicableServiceTypes?: string[]; // Se non tutti, lista di serviceTypeId
  
  // Stato
  isActive: boolean;
  
  // Tracking
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
  notes?: string;
}

// ═══════════════════════════════════════════════════════════════
// ITALIAN HOLIDAYS - Festività italiane predefinite
// ═══════════════════════════════════════════════════════════════

export const ITALIAN_HOLIDAYS: Omit<Holiday, "id" | "date" | "createdAt" | "updatedAt" | "createdBy">[] = [
  {
    name: "Capodanno",
    type: "national",
    isRecurring: true,
    recurringMonth: 1,
    recurringDay: 1,
    surchargeType: "percentage",
    surchargePercentage: 50,
    appliesToAllServices: true,
    isActive: true,
  },
  {
    name: "Epifania",
    type: "national",
    isRecurring: true,
    recurringMonth: 1,
    recurringDay: 6,
    surchargeType: "percentage",
    surchargePercentage: 30,
    appliesToAllServices: true,
    isActive: true,
  },
  {
    name: "Pasqua",
    type: "national",
    isRecurring: false, // Data mobile
    surchargeType: "percentage",
    surchargePercentage: 50,
    appliesToAllServices: true,
    isActive: true,
    notes: "Data mobile - aggiornare ogni anno",
  },
  {
    name: "Pasquetta",
    type: "national",
    isRecurring: false, // Data mobile
    surchargeType: "percentage",
    surchargePercentage: 50,
    appliesToAllServices: true,
    isActive: true,
    notes: "Data mobile - aggiornare ogni anno",
  },
  {
    name: "Festa della Liberazione",
    type: "national",
    isRecurring: true,
    recurringMonth: 4,
    recurringDay: 25,
    surchargeType: "percentage",
    surchargePercentage: 30,
    appliesToAllServices: true,
    isActive: true,
  },
  {
    name: "Festa dei Lavoratori",
    type: "national",
    isRecurring: true,
    recurringMonth: 5,
    recurringDay: 1,
    surchargeType: "percentage",
    surchargePercentage: 50,
    appliesToAllServices: true,
    isActive: true,
  },
  {
    name: "Festa della Repubblica",
    type: "national",
    isRecurring: true,
    recurringMonth: 6,
    recurringDay: 2,
    surchargeType: "percentage",
    surchargePercentage: 30,
    appliesToAllServices: true,
    isActive: true,
  },
  {
    name: "Ferragosto",
    type: "national",
    isRecurring: true,
    recurringMonth: 8,
    recurringDay: 15,
    surchargeType: "percentage",
    surchargePercentage: 50,
    appliesToAllServices: true,
    isActive: true,
  },
  {
    name: "Tutti i Santi",
    type: "national",
    isRecurring: true,
    recurringMonth: 11,
    recurringDay: 1,
    surchargeType: "percentage",
    surchargePercentage: 30,
    appliesToAllServices: true,
    isActive: true,
  },
  {
    name: "Immacolata Concezione",
    type: "national",
    isRecurring: true,
    recurringMonth: 12,
    recurringDay: 8,
    surchargeType: "percentage",
    surchargePercentage: 30,
    appliesToAllServices: true,
    isActive: true,
  },
  {
    name: "Natale",
    type: "national",
    isRecurring: true,
    recurringMonth: 12,
    recurringDay: 25,
    surchargeType: "percentage",
    surchargePercentage: 50,
    appliesToAllServices: true,
    isActive: true,
  },
  {
    name: "Santo Stefano",
    type: "national",
    isRecurring: true,
    recurringMonth: 12,
    recurringDay: 26,
    surchargeType: "percentage",
    surchargePercentage: 50,
    appliesToAllServices: true,
    isActive: true,
  },
  {
    name: "San Silvestro",
    type: "national",
    isRecurring: true,
    recurringMonth: 12,
    recurringDay: 31,
    surchargeType: "percentage",
    surchargePercentage: 50,
    appliesToAllServices: true,
    isActive: true,
  },
];

// ═══════════════════════════════════════════════════════════════
// WEEKEND SURCHARGE CONFIG - Configurazione weekend
// ═══════════════════════════════════════════════════════════════

export interface WeekendSurchargeConfig {
  enabled: boolean;
  saturdaySurcharge: number;    // Maggiorazione sabato (percentage)
  sundaySurcharge: number;      // Maggiorazione domenica (percentage)
  appliesToAllServices: boolean;
  applicableServiceTypes?: string[];
}

export const DEFAULT_WEEKEND_CONFIG: WeekendSurchargeConfig = {
  enabled: true,
  saturdaySurcharge: 0,         // Nessuna maggiorazione sabato
  sundaySurcharge: 20,          // +20% domenica
  appliesToAllServices: true,
};

// ═══════════════════════════════════════════════════════════════
// URGENCY SURCHARGE - Maggiorazione urgenza
// ═══════════════════════════════════════════════════════════════

export interface UrgencySurchargeConfig {
  enabled: boolean;
  // Pulizia richiesta con meno di X ore di preavviso
  lessThan24Hours: number;      // Es. +30%
  lessThan12Hours: number;      // Es. +50%
  lessThan6Hours: number;       // Es. +75%
  lessThan3Hours: number;       // Es. +100%
}

export const DEFAULT_URGENCY_CONFIG: UrgencySurchargeConfig = {
  enabled: true,
  lessThan24Hours: 20,
  lessThan12Hours: 35,
  lessThan6Hours: 50,
  lessThan3Hours: 75,
};

// ═══════════════════════════════════════════════════════════════
// PRICING CONFIG - Configurazione prezzi globale
// ═══════════════════════════════════════════════════════════════

export interface PricingConfig {
  id: string;
  
  // Weekend
  weekendConfig: WeekendSurchargeConfig;
  
  // Urgenza
  urgencyConfig: UrgencySurchargeConfig;
  
  // IVA
  vatRate: number;              // Es. 22
  vatIncluded: boolean;         // Se prezzi includono IVA
  
  // Arrotondamento
  roundToNearest: number;       // Es. 0.5 per arrotondare a 0.50€
  
  // Minimo
  minimumCharge: number;        // Addebito minimo
  
  // Tracking
  updatedAt: Timestamp;
  updatedBy: string;
}

// ═══════════════════════════════════════════════════════════════
// FORM TYPES
// ═══════════════════════════════════════════════════════════════

export interface CreateHolidayInput {
  name: string;
  date: Date;
  type: HolidayType;
  isRecurring: boolean;
  recurringMonth?: number;
  recurringDay?: number;
  surchargeType: "percentage" | "fixed";
  surchargePercentage?: number;
  surchargeFixed?: number;
  appliesToAllServices: boolean;
  applicableServiceTypes?: string[];
  notes?: string;
}

export interface UpdateHolidayInput extends Partial<CreateHolidayInput> {
  isActive?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// UTILITY TYPES
// ═══════════════════════════════════════════════════════════════

export interface PriceCalculationResult {
  basePrice: number;
  holidaySurcharge: number;
  holidayName?: string;
  weekendSurcharge: number;
  urgencySurcharge: number;
  subtotal: number;
  vat: number;
  total: number;
  breakdown: PriceBreakdownItem[];
}

export interface PriceBreakdownItem {
  label: string;
  amount: number;
  type: "base" | "surcharge" | "discount" | "tax";
  percentage?: number;
}
