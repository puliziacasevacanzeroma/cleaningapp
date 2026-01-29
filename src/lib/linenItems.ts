// ============================================================
// ARTICOLI INVENTARIO - Condivisi tra Inventario, Modal e Configurazione
// Questi sono gli stessi articoli usati in PropertyServiceConfig.tsx
// ============================================================

export interface InventoryItem {
  id: string;
  key: string;
  name: string;
  icon: string;
  category: "biancheria_letto" | "biancheria_bagno" | "kit_cortesia" | "servizi_extra";
  unit: string;
  defaultPrice: number;
  defaultQty: number; // quantità default per ospite
}

// ==================== BIANCHERIA LETTO ====================
export const LINEN_BED_ITEMS: InventoryItem[] = [
  { id: "lenzuolo_sotto", key: "ls", name: "Lenzuolo Sotto", icon: "🛏️", category: "biancheria_letto", unit: "pz", defaultPrice: 6, defaultQty: 1 },
  { id: "lenzuolo_sopra", key: "lso", name: "Lenzuolo Sopra", icon: "🛏️", category: "biancheria_letto", unit: "pz", defaultPrice: 6, defaultQty: 1 },
  { id: "copripiumino", key: "cp", name: "Copripiumino", icon: "🛏️", category: "biancheria_letto", unit: "pz", defaultPrice: 12, defaultQty: 1 },
  { id: "federa", key: "fed", name: "Federa", icon: "🛏️", category: "biancheria_letto", unit: "pz", defaultPrice: 2, defaultQty: 2 },
];

// ==================== BIANCHERIA BAGNO ====================
export const LINEN_BATH_ITEMS: InventoryItem[] = [
  { id: "asciugamano_viso", key: "av", name: "Asciugamano Viso", icon: "🛁", category: "biancheria_bagno", unit: "pz", defaultPrice: 2, defaultQty: 1 },
  { id: "asciugamano_ospite", key: "ao", name: "Asciugamano Ospite", icon: "🛁", category: "biancheria_bagno", unit: "pz", defaultPrice: 1.5, defaultQty: 1 },
  { id: "telo_doccia", key: "td", name: "Telo Doccia", icon: "🛁", category: "biancheria_bagno", unit: "pz", defaultPrice: 4, defaultQty: 1 },
  { id: "accappatoio", key: "ac", name: "Accappatoio", icon: "👘", category: "biancheria_bagno", unit: "pz", defaultPrice: 6, defaultQty: 0 },
];

// ==================== KIT CORTESIA ====================
export const KIT_CORTESIA_ITEMS: InventoryItem[] = [
  { id: "shampoo", key: "sh", name: "Shampoo", icon: "🧴", category: "kit_cortesia", unit: "pz", defaultPrice: 1, defaultQty: 1 },
  { id: "bagnoschiuma", key: "bg", name: "Bagnoschiuma", icon: "🧴", category: "kit_cortesia", unit: "pz", defaultPrice: 1, defaultQty: 1 },
  { id: "saponetta", key: "sp", name: "Saponetta", icon: "🧼", category: "kit_cortesia", unit: "pz", defaultPrice: 0.5, defaultQty: 1 },
  { id: "crema_corpo", key: "cr", name: "Crema Corpo", icon: "🧴", category: "kit_cortesia", unit: "pz", defaultPrice: 1.5, defaultQty: 0 },
];

// ==================== SERVIZI EXTRA ====================
export const SERVIZI_EXTRA_ITEMS: InventoryItem[] = [
  { id: "welcome_kit", key: "welcome", name: "Welcome Kit", icon: "🎁", category: "servizi_extra", unit: "kit", defaultPrice: 15, defaultQty: 0 },
  { id: "fiori_freschi", key: "fiori", name: "Fiori Freschi", icon: "💐", category: "servizi_extra", unit: "pz", defaultPrice: 20, defaultQty: 0 },
  { id: "frigo_pieno", key: "frigo", name: "Frigo Pieno", icon: "🧊", category: "servizi_extra", unit: "kit", defaultPrice: 50, defaultQty: 0 },
];

// ==================== TUTTI GLI ARTICOLI ====================
export const ALL_INVENTORY_ITEMS: InventoryItem[] = [
  ...LINEN_BED_ITEMS,
  ...LINEN_BATH_ITEMS,
  ...KIT_CORTESIA_ITEMS,
  ...SERVIZI_EXTRA_ITEMS,
];

// ==================== CATEGORIE ====================
export const INVENTORY_CATEGORIES = [
  { id: "biancheria_letto", name: "Biancheria Letto", icon: "🛏️", color: "sky" },
  { id: "biancheria_bagno", name: "Biancheria Bagno", icon: "🛁", color: "emerald" },
  { id: "kit_cortesia", name: "Kit Cortesia", icon: "🧴", color: "violet" },
  { id: "servizi_extra", name: "Servizi Extra", icon: "🎁", color: "amber" },
];

// ==================== HELPERS ====================

// Ottieni articoli per categoria
export function getItemsByCategory(category: string): InventoryItem[] {
  return ALL_INVENTORY_ITEMS.filter(item => item.category === category);
}

// Ottieni articolo per ID
export function getItemById(id: string): InventoryItem | undefined {
  return ALL_INVENTORY_ITEMS.find(item => item.id === id);
}

// Ottieni articolo per key (compatibilità con PropertyServiceConfig)
export function getItemByKey(key: string): InventoryItem | undefined {
  return ALL_INVENTORY_ITEMS.find(item => item.key === key);
}

// Configurazione default biancheria per numero ospiti
export function getDefaultLinenConfig(guestsCount: number) {
  return {
    // Biancheria Letto (per letto, non per ospite)
    lenzuolo_sotto: Math.ceil(guestsCount / 2),
    lenzuolo_sopra: Math.ceil(guestsCount / 2),
    copripiumino: Math.ceil(guestsCount / 2),
    federa: guestsCount * 2,
    // Biancheria Bagno (per ospite)
    asciugamano_viso: guestsCount,
    asciugamano_ospite: guestsCount,
    telo_doccia: guestsCount,
    accappatoio: 0,
    // Kit Cortesia (per ospite)
    shampoo: guestsCount,
    bagnoschiuma: guestsCount,
    saponetta: guestsCount,
    crema_corpo: 0,
    // Servizi Extra (opzionali)
    welcome_kit: 0,
    fiori_freschi: 0,
    frigo_pieno: 0,
  };
}

// Calcola prezzo totale configurazione
export function calculateConfigPrice(config: Record<string, number>): number {
  let total = 0;
  Object.entries(config).forEach(([id, qty]) => {
    const item = getItemById(id);
    if (item && qty > 0) {
      total += item.defaultPrice * qty;
    }
  });
  return total;
}
