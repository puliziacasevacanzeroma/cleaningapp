/**
 * 🧺 LINEN CALCULATOR - REDIRECT
 * 
 * ⚠️ DEPRECATO: Questo file è mantenuto per retrocompatibilità.
 * Tutte le funzioni sono ora in ~/lib/linen
 */

// Re-export funzioni
export {
  // Costanti
  BED_TYPES,
  TIPI_LETTO,
  ITEM_KEYWORDS,
  getBedTypeInfo,
  getDbType,
  
  // Funzioni
  generateAutoBeds,
  getLinenForBedType,
  calculateTotalBedLinen,
  calculateBathLinen,
  findItemByKeywords,
  mapBedLinenToInventory,
  mapBathLinenToInventory,
  generateConfigForGuests,
  generateAllGuestConfigs,
  convertConfigsForDatabase,
  migrateOldConfig,
  calculateDotazioni,
  validateGuestConfig,
  validateAllConfigs,
  
  // Alias per compatibilità
  mapLinenToInventory,
  mapBathToInventory,
  getTipoLettoInfo,
  getDbTypeForBed,
  
  // Funzioni di compatibilità per vecchi componenti
  configToSelectedItems,
  generateAllGuestConfigsLegacy,
  toConfigLegacy,
  fromConfigLegacy,
} from './linen';

// Re-export tipi
export type {
  PropertyBed,
  GuestLinenConfig,
  LinenRequirement,
  BathRequirement,
  BedType,
  ServiceConfigs,
  InventoryItem,
  LinenItem,
  DotazioniResult,
  ValidationResult,
  SelectedItem,
  GuestLinenConfigLegacy,
} from './linen';

// Tipo per compatibilità
export type TipoLetto = 'matrimoniale' | 'singolo' | 'piazza_mezza' | 'divano_letto' | 'castello';
