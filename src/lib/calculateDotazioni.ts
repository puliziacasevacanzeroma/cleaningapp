/**
 * 🧺 CALCULATE DOTAZIONI - WRAPPER
 * 
 * Questo file è mantenuto per retrocompatibilità.
 * Tutte le funzioni sono ora importate da ~/lib/linen
 */

// Re-export funzioni dal nuovo modulo centralizzato
export { 
  calculateDotazioni,
  generateAutoBeds,
  getLinenForBedType,
  calculateTotalBedLinen,
  calculateBathLinen,
  mapBedLinenToInventory,
  mapBathLinenToInventory,
  generateAllGuestConfigs,
  validateGuestConfig,
} from './linen';

// Re-export tipi
export type {
  DotazioniResult,
  GuestLinenConfig,
  PropertyBed,
  LinenRequirement,
  BathRequirement,
  InventoryItem,
  CleaningForLinen,
  PropertyForLinen,
} from './linen';

// Interfaccia locale per compatibilità
export interface GuestConfig {
  beds?: string[];
  bl?: Record<string, Record<string, number>>;
  ba?: Record<string, number>;
  ki?: Record<string, number>;
  ex?: Record<string, boolean>;
}
