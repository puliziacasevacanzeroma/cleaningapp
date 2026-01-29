// ═══════════════════════════════════════════════════════════════
// CLEANING PRICE CALCULATOR
// ═══════════════════════════════════════════════════════════════
//
// Calcola il prezzo di una pulizia considerando:
// 1. Prezzo base del tipo di servizio
// 2. Maggiorazione per numero stanze/bagni
// 3. Maggiorazione festività
// 4. Maggiorazione weekend
// 5. Maggiorazione urgenza
//
// ═══════════════════════════════════════════════════════════════

import { Timestamp } from "firebase/firestore";
import { ServiceType } from "~/types/serviceType";
import { 
  Holiday, 
  PricingConfig, 
  PriceCalculationResult, 
  PriceBreakdownItem,
  DEFAULT_WEEKEND_CONFIG,
  DEFAULT_URGENCY_CONFIG,
} from "~/types/holiday";

// ═══════════════════════════════════════════════════════════════
// MAIN CALCULATION FUNCTION
// ═══════════════════════════════════════════════════════════════

// Tipo esteso per il calcolo del prezzo
// Il prezzo base viene dal contratto della proprietà, non dal ServiceType
export interface ServiceTypeWithPricing extends Partial<ServiceType> {
  name: string;
  basePrice: number;           // Prezzo base (da contratto proprietà + baseSurcharge)
  pricePerRoom?: number;       // Prezzo extra per camera
  pricePerBathroom?: number;   // Prezzo extra per bagno
  pricePerGuest?: number;      // Prezzo extra per ospite
  minPrice?: number;           // Prezzo minimo
  maxPrice?: number;           // Prezzo massimo
  durationPerRoom?: number;    // Minuti extra per camera
  durationPerBathroom?: number;// Minuti extra per bagno
  estimatedDuration?: number;  // Durata stimata base
}

export interface CalculatePriceInput {
  serviceType: ServiceTypeWithPricing;
  date: Date;
  property?: {
    bedrooms: number;
    bathrooms: number;
  };
  guestsCount?: number;
  holidays?: Holiday[];
  pricingConfig?: Partial<PricingConfig>;
  createdAt?: Date;              // Per calcolo urgenza
  isUrgent?: boolean;
}

export function calculateCleaningPrice(input: CalculatePriceInput): PriceCalculationResult {
  const {
    serviceType,
    date,
    property,
    guestsCount,
    holidays = [],
    pricingConfig,
    createdAt,
    isUrgent,
  } = input;
  
  const breakdown: PriceBreakdownItem[] = [];
  
  // ─── 1. PREZZO BASE ───
  let basePrice = serviceType.basePrice;
  breakdown.push({
    label: `${serviceType.name} - Base`,
    amount: basePrice,
    type: "base",
  });
  
  // ─── 2. MAGGIORAZIONE STANZE ───
  if (property && serviceType.pricePerRoom && property.bedrooms > 1) {
    const roomsExtra = (property.bedrooms - 1) * serviceType.pricePerRoom;
    basePrice += roomsExtra;
    breakdown.push({
      label: `Camere extra (${property.bedrooms - 1})`,
      amount: roomsExtra,
      type: "surcharge",
    });
  }
  
  // ─── 3. MAGGIORAZIONE BAGNI ───
  if (property && serviceType.pricePerBathroom && property.bathrooms > 1) {
    const bathroomsExtra = (property.bathrooms - 1) * serviceType.pricePerBathroom;
    basePrice += bathroomsExtra;
    breakdown.push({
      label: `Bagni extra (${property.bathrooms - 1})`,
      amount: bathroomsExtra,
      type: "surcharge",
    });
  }
  
  // ─── 4. MAGGIORAZIONE OSPITI ───
  if (guestsCount && serviceType.pricePerGuest && guestsCount > 2) {
    const guestsExtra = (guestsCount - 2) * serviceType.pricePerGuest;
    basePrice += guestsExtra;
    breakdown.push({
      label: `Ospiti extra (${guestsCount - 2})`,
      amount: guestsExtra,
      type: "surcharge",
    });
  }
  
  // Applica min/max
  if (serviceType.minPrice && basePrice < serviceType.minPrice) {
    basePrice = serviceType.minPrice;
  }
  if (serviceType.maxPrice && basePrice > serviceType.maxPrice) {
    basePrice = serviceType.maxPrice;
  }
  
  // ─── 5. MAGGIORAZIONE FESTIVITÀ ───
  let holidaySurcharge = 0;
  let holidayName: string | undefined;
  
  const holiday = findApplicableHoliday(date, holidays, serviceType.id);
  if (holiday) {
    holidayName = holiday.name;
    if (holiday.surchargeType === "percentage" && holiday.surchargePercentage) {
      holidaySurcharge = basePrice * (holiday.surchargePercentage / 100);
      breakdown.push({
        label: `Festività: ${holiday.name}`,
        amount: holidaySurcharge,
        type: "surcharge",
        percentage: holiday.surchargePercentage,
      });
    } else if (holiday.surchargeType === "fixed" && holiday.surchargeFixed) {
      holidaySurcharge = holiday.surchargeFixed;
      breakdown.push({
        label: `Festività: ${holiday.name}`,
        amount: holidaySurcharge,
        type: "surcharge",
      });
    }
  }
  
  // ─── 6. MAGGIORAZIONE WEEKEND ───
  let weekendSurcharge = 0;
  const weekendConfig = pricingConfig?.weekendConfig || DEFAULT_WEEKEND_CONFIG;
  
  if (weekendConfig.enabled && !holiday) { // Non cumulare con festività
    const dayOfWeek = date.getDay();
    
    if (dayOfWeek === 6 && weekendConfig.saturdaySurcharge > 0) { // Sabato
      weekendSurcharge = basePrice * (weekendConfig.saturdaySurcharge / 100);
      breakdown.push({
        label: "Maggiorazione Sabato",
        amount: weekendSurcharge,
        type: "surcharge",
        percentage: weekendConfig.saturdaySurcharge,
      });
    } else if (dayOfWeek === 0 && weekendConfig.sundaySurcharge > 0) { // Domenica
      weekendSurcharge = basePrice * (weekendConfig.sundaySurcharge / 100);
      breakdown.push({
        label: "Maggiorazione Domenica",
        amount: weekendSurcharge,
        type: "surcharge",
        percentage: weekendConfig.sundaySurcharge,
      });
    }
  }
  
  // ─── 7. MAGGIORAZIONE URGENZA ───
  let urgencySurcharge = 0;
  const urgencyConfig = pricingConfig?.urgencyConfig || DEFAULT_URGENCY_CONFIG;
  
  if (urgencyConfig.enabled && (isUrgent || createdAt)) {
    const hoursUntilCleaning = createdAt 
      ? (date.getTime() - createdAt.getTime()) / (1000 * 60 * 60)
      : 0;
    
    let urgencyPercentage = 0;
    let urgencyLabel = "";
    
    if (hoursUntilCleaning < 3 || isUrgent) {
      urgencyPercentage = urgencyConfig.lessThan3Hours;
      urgencyLabel = "Urgenza (< 3 ore)";
    } else if (hoursUntilCleaning < 6) {
      urgencyPercentage = urgencyConfig.lessThan6Hours;
      urgencyLabel = "Urgenza (< 6 ore)";
    } else if (hoursUntilCleaning < 12) {
      urgencyPercentage = urgencyConfig.lessThan12Hours;
      urgencyLabel = "Urgenza (< 12 ore)";
    } else if (hoursUntilCleaning < 24) {
      urgencyPercentage = urgencyConfig.lessThan24Hours;
      urgencyLabel = "Urgenza (< 24 ore)";
    }
    
    if (urgencyPercentage > 0) {
      urgencySurcharge = basePrice * (urgencyPercentage / 100);
      breakdown.push({
        label: urgencyLabel,
        amount: urgencySurcharge,
        type: "surcharge",
        percentage: urgencyPercentage,
      });
    }
  }
  
  // ─── CALCOLO TOTALE ───
  const subtotal = basePrice + holidaySurcharge + weekendSurcharge + urgencySurcharge;
  
  // IVA (se configurata)
  let vat = 0;
  const vatRate = pricingConfig?.vatRate || 0;
  const vatIncluded = pricingConfig?.vatIncluded ?? true;
  
  if (vatRate > 0 && !vatIncluded) {
    vat = subtotal * (vatRate / 100);
    breakdown.push({
      label: `IVA ${vatRate}%`,
      amount: vat,
      type: "tax",
      percentage: vatRate,
    });
  }
  
  let total = subtotal + vat;
  
  // Arrotondamento
  const roundTo = pricingConfig?.roundToNearest || 0.5;
  if (roundTo > 0) {
    total = Math.round(total / roundTo) * roundTo;
  }
  
  // Minimo
  const minimumCharge = pricingConfig?.minimumCharge || 0;
  if (minimumCharge > 0 && total < minimumCharge) {
    total = minimumCharge;
    breakdown.push({
      label: "Addebito minimo",
      amount: minimumCharge - (subtotal + vat),
      type: "surcharge",
    });
  }
  
  return {
    basePrice,
    holidaySurcharge,
    holidayName,
    weekendSurcharge,
    urgencySurcharge,
    subtotal,
    vat,
    total,
    breakdown,
  };
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function findApplicableHoliday(
  date: Date,
  holidays: Holiday[],
  serviceTypeId?: string
): Holiday | undefined {
  const dateStr = formatDateForComparison(date);
  
  return holidays.find(holiday => {
    if (!holiday.isActive) return false;
    
    // Controlla se applicabile a questo servizio
    if (!holiday.appliesToAllServices && holiday.applicableServiceTypes) {
      if (serviceTypeId && !holiday.applicableServiceTypes.includes(serviceTypeId)) {
        return false;
      }
    }
    
    // Controlla data
    if (holiday.isRecurring && holiday.recurringMonth && holiday.recurringDay) {
      const month = date.getMonth() + 1;
      const day = date.getDate();
      return month === holiday.recurringMonth && day === holiday.recurringDay;
    } else if (holiday.date) {
      const holidayDate = holiday.date instanceof Timestamp 
        ? holiday.date.toDate() 
        : new Date(holiday.date);
      return formatDateForComparison(holidayDate) === dateStr;
    }
    
    return false;
  });
}

function formatDateForComparison(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════════
// ESTIMATED DURATION CALCULATOR
// ═══════════════════════════════════════════════════════════════

export interface CalculateDurationInput {
  serviceType: ServiceTypeWithPricing;
  property?: {
    bedrooms: number;
    bathrooms: number;
  };
}

export function calculateEstimatedDuration(input: CalculateDurationInput): number {
  const { serviceType, property } = input;
  
  let duration = serviceType.estimatedDuration;
  
  if (property) {
    if (serviceType.durationPerRoom && property.bedrooms > 1) {
      duration += (property.bedrooms - 1) * serviceType.durationPerRoom;
    }
    
    if (serviceType.durationPerBathroom && property.bathrooms > 1) {
      duration += (property.bathrooms - 1) * serviceType.durationPerBathroom;
    }
  }
  
  return duration;
}

// ═══════════════════════════════════════════════════════════════
// PRICE FORMATTING
// ═══════════════════════════════════════════════════════════════

export function formatPrice(amount: number, currency: string = "EUR"): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency,
  }).format(amount);
}

export function formatPriceBreakdown(result: PriceCalculationResult): string[] {
  return result.breakdown.map(item => {
    const prefix = item.type === "discount" ? "-" : "";
    const percentage = item.percentage ? ` (${item.percentage}%)` : "";
    return `${item.label}${percentage}: ${prefix}${formatPrice(item.amount)}`;
  });
}

// ═══════════════════════════════════════════════════════════════
// QUICK PRICE CHECK
// ═══════════════════════════════════════════════════════════════

export function isHolidayDate(date: Date, holidays: Holiday[]): boolean {
  return findApplicableHoliday(date, holidays) !== undefined;
}

export function isWeekendDate(date: Date): boolean {
  const dayOfWeek = date.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
}

export function getHolidayName(date: Date, holidays: Holiday[]): string | null {
  const holiday = findApplicableHoliday(date, holidays);
  return holiday?.name || null;
}
