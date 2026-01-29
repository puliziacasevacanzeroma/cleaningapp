/**
 * 🧺 LINEN SERVICE - INDEX
 * 
 * Export aggregato per import semplificato.
 * 
 * USO:
 * import { generateAutoBeds, calculateDotazioni } from '~/lib/linen';
 * import type { GuestLinenConfig, PropertyBed } from '~/lib/linen';
 */

// ============================================================
// FUNZIONI PRINCIPALI
// ============================================================

export {
  // Generazione letti
  generateAutoBeds,
  
  // Calcolo biancheria letto
  getLinenForBedType,
  calculateTotalBedLinen,
  
  // Calcolo biancheria bagno
  calculateBathLinen,
  
  // Mapping inventario
  findItemByKeywords,
  findItemPrice,
  mapBedLinenToInventory,
  mapBathLinenToInventory,
  
  // Generazione config
  generateConfigForGuests,
  generateAllGuestConfigs,
  
  // Conversione e migrazione
  convertConfigsForDatabase,
  migrateOldConfig,
  
  // Calcolo prezzi
  calculateBedLinenPrice,
  calculateBathLinenPrice,
  calculateKitPrice,
  calculateExtrasPrice,
  
  // Calcolo dotazioni completo
  calculateDotazioni,
  
  // Validazione
  validateGuestConfig,
  validateAllConfigs,
  
  // Funzioni di compatibilità
  configToSelectedItems,
  generateAllGuestConfigsLegacy,
  toConfigLegacy,
  fromConfigLegacy,
} from './linenService';

export type { SelectedItem, GuestLinenConfigLegacy } from './linenService';

// ============================================================
// COSTANTI
// ============================================================

export {
  BED_TYPES,
  TIPI_LETTO,
  BED_LINEN_RULES,
  ITEM_KEYWORDS,
  CATEGORY_ITEM_TYPES,
  PREDEFINED_ROOMS,
  DEFAULT_PRICES,
  getBedTypeInfo,
  getDbType,
  getInternalType,
  getBedCapacity,
} from './constants';

// ============================================================
// TIPI
// ============================================================

export type {
  PropertyBed,
  BedType,
  LinenRequirement,
  BathRequirement,
  GuestLinenConfig,
  GuestConfig,
  ServiceConfigs,
  InventoryItem,
  LinenItem,
  DotazioniResult,
  ValidationResult,
  RoomConfig,
  BedsConfig,
  CleaningForLinen,
  PropertyForLinen,
} from './types';

// ============================================================
// ALIAS PER COMPATIBILITÀ (con vecchio linenCalculator.ts)
// ============================================================

// Questi alias permettono di sostituire gli import vecchi senza modificare tutto il codice
export { 
  mapBedLinenToInventory as mapLinenToInventory,
  mapBathLinenToInventory as mapBathToInventory,
  getLinenForBedType as getLinenForBed,
} from './linenService';

export {
  getBedTypeInfo as getTipoLettoInfo,
  getDbType as getDbTypeForBed,
} from './constants';
