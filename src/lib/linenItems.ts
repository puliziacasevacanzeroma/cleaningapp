// ============================================================
// ARTICOLI BIANCHERIA - Condivisi tra Inventario, Modal e Configurazione
// ============================================================

export interface LinenItem {
  id: string;
  key: string;
  name: string;
  icon: string;
  category: "biancheria_letto" | "biancheria_bagno" | "kit_cortesia";
  unit: string;
}

// Articoli standard di biancheria
export const LINEN_ITEMS: LinenItem[] = [
  // Biancheria Letto
  { id: "singleSheets", key: "singleSheets", name: "Lenzuola Singole", icon: "🛏️", category: "biancheria_letto", unit: "set" },
  { id: "doubleSheets", key: "doubleSheets", name: "Lenzuola Matrimoniali", icon: "🛏️", category: "biancheria_letto", unit: "set" },
  { id: "pillowcases", key: "pillowcases", name: "Federe", icon: "🛏️", category: "biancheria_letto", unit: "pz" },
  
  // Biancheria Bagno
  { id: "towelsLarge", key: "towelsLarge", name: "Asciugamani Grandi", icon: "🛁", category: "biancheria_bagno", unit: "pz" },
  { id: "towelsSmall", key: "towelsSmall", name: "Asciugamani Piccoli", icon: "🛁", category: "biancheria_bagno", unit: "pz" },
  { id: "towelsFace", key: "towelsFace", name: "Asciugamani Viso", icon: "🛁", category: "biancheria_bagno", unit: "pz" },
  { id: "bathMats", key: "bathMats", name: "Tappetini Bagno", icon: "🛁", category: "biancheria_bagno", unit: "pz" },
  { id: "bathrobe", key: "bathrobe", name: "Accappatoi", icon: "👘", category: "biancheria_bagno", unit: "pz" },
];

// Categorie
export const LINEN_CATEGORIES = [
  { id: "biancheria_letto", name: "Biancheria Letto", icon: "🛏️", color: "sky" },
  { id: "biancheria_bagno", name: "Biancheria Bagno", icon: "🛁", color: "emerald" },
  { id: "kit_cortesia", name: "Kit Cortesia", icon: "🎁", color: "violet" },
];

// Helper per ottenere items per categoria
export function getLinenItemsByCategory(category: string): LinenItem[] {
  return LINEN_ITEMS.filter(item => item.category === category);
}

// Helper per ottenere item per key
export function getLinenItemByKey(key: string): LinenItem | undefined {
  return LINEN_ITEMS.find(item => item.key === key);
}

// Configurazione default per numero ospiti
export function getDefaultLinenConfig(guestsCount: number) {
  return {
    singleSheets: guestsCount <= 2 ? 0 : Math.floor(guestsCount / 2),
    doubleSheets: Math.ceil(guestsCount / 2),
    pillowcases: guestsCount * 2,
    towelsLarge: guestsCount,
    towelsSmall: guestsCount,
    towelsFace: guestsCount,
    bathMats: Math.ceil(guestsCount / 2),
    bathrobe: 0,
  };
}
