/**
 * 🔒 ARTICOLI DI SISTEMA - NON MODIFICABILI / NON CANCELLABILI
 * 
 * Questo file definisce gli articoli CORE del sistema biancheria.
 * Questi articoli sono BLINDATI:
 * - NON possono essere cancellati
 * - NON possono essere rinominati
 * - Il prezzo può essere modificato SOLO dall'admin
 * - La quantità può essere aggiornata
 * 
 * TUTTI i calcoli del sistema si basano su questi articoli.
 * Se vengono rimossi o rinominati, il sistema smette di funzionare.
 */

export interface SystemItem {
  id: string;
  key: string;
  name: string;
  categoryId: string;
  defaultPrice: number;
  unit: string;
  isForLinen: boolean;
  description: string;
  // Mapping alle keyword per i calcoli
  calculationKey: string;
}

/**
 * 🔒 ARTICOLI CORE DI SISTEMA
 * 
 * Questi sono gli articoli su cui si basa TUTTO il sistema di calcolo biancheria.
 * NON MODIFICARE questa lista senza aggiornare anche:
 * - BED_LINEN_RULES in constants.ts
 * - ITEM_KEYWORDS in constants.ts
 * - Le funzioni di calcolo in linenService.ts
 */
export const SYSTEM_ITEMS: SystemItem[] = [
  // ============================================================
  // BIANCHERIA LETTO - Usati in BED_LINEN_RULES
  // ============================================================
  {
    id: "item_doubleSheets",
    key: "doubleSheets",
    name: "Lenzuola Matrimoniali",
    categoryId: "biancheria_letto",
    defaultPrice: 8.00,
    unit: "set",
    isForLinen: true,
    description: "Set completo lenzuola per letto matrimoniale (sotto + sopra + copripiumino)",
    calculationKey: "lenzuolaMatrimoniali"
  },
  {
    id: "item_singleSheets",
    key: "singleSheets",
    name: "Lenzuola Singole",
    categoryId: "biancheria_letto",
    defaultPrice: 5.00,
    unit: "set",
    isForLinen: true,
    description: "Set completo lenzuola per letto singolo (sotto + sopra + copripiumino)",
    calculationKey: "lenzuolaSingole"
  },
  {
    id: "item_pillowcases",
    key: "pillowcases",
    name: "Federe",
    categoryId: "biancheria_letto",
    defaultPrice: 2.00,
    unit: "pz",
    isForLinen: true,
    description: "Federa per cuscino",
    calculationKey: "federe"
  },

  // ============================================================
  // BIANCHERIA BAGNO - Usati nei calcoli bagno
  // ============================================================
  {
    id: "item_towelsLarge",
    key: "towelsLarge",
    name: "Asciugamani Grandi",
    categoryId: "biancheria_bagno",
    defaultPrice: 4.00,
    unit: "pz",
    isForLinen: true,
    description: "Telo doccia/corpo grande",
    calculationKey: "teliDoccia"
  },
  {
    id: "item_towelsFace",
    key: "towelsFace",
    name: "Asciugamani Viso",
    categoryId: "biancheria_bagno",
    defaultPrice: 2.00,
    unit: "pz",
    isForLinen: true,
    description: "Asciugamano medio per viso",
    calculationKey: "asciugamaniViso"
  },
  {
    id: "item_towelsSmall",
    key: "towelsSmall",
    name: "Asciugamani Piccoli",
    categoryId: "biancheria_bagno",
    defaultPrice: 1.50,
    unit: "pz",
    isForLinen: true,
    description: "Asciugamano piccolo per bidet/ospite",
    calculationKey: "asciugamaniBidet"
  },
  {
    id: "item_bathMats",
    key: "bathMats",
    name: "Tappetini Bagno",
    categoryId: "biancheria_bagno",
    defaultPrice: 3.00,
    unit: "pz",
    isForLinen: true,
    description: "Tappetino/scendidoccia per bagno",
    calculationKey: "tappetini"
  },
];

/**
 * 🔒 ARTICOLI OPZIONALI (possono essere modificati/cancellati)
 * 
 * Questi articoli NON sono critici per il sistema.
 * Possono essere aggiunti, modificati o rimossi senza rompere i calcoli.
 */
export const OPTIONAL_ITEMS: Omit<SystemItem, 'calculationKey'>[] = [
  // Biancheria Bagno opzionale
  {
    id: "item_bathrobe",
    key: "bathrobe",
    name: "Accappatoi",
    categoryId: "biancheria_bagno",
    defaultPrice: 6.00,
    unit: "pz",
    isForLinen: true,
    description: "Accappatoio per ospiti (opzionale)"
  },
  
  // Kit Cortesia
  {
    id: "item_shampoo",
    key: "shampoo",
    name: "Shampoo",
    categoryId: "kit_cortesia",
    defaultPrice: 1.00,
    unit: "pz",
    isForLinen: false,
    description: "Shampoo monouso"
  },
  {
    id: "item_bagnoschiuma",
    key: "bagnoschiuma",
    name: "Bagnoschiuma",
    categoryId: "kit_cortesia",
    defaultPrice: 1.00,
    unit: "pz",
    isForLinen: false,
    description: "Bagnoschiuma/docciaschiuma monouso"
  },
  {
    id: "item_saponetta",
    key: "saponetta",
    name: "Saponetta",
    categoryId: "kit_cortesia",
    defaultPrice: 0.50,
    unit: "pz",
    isForLinen: false,
    description: "Saponetta per mani"
  },
  {
    id: "item_crema",
    key: "crema",
    name: "Crema Corpo",
    categoryId: "kit_cortesia",
    defaultPrice: 1.50,
    unit: "pz",
    isForLinen: false,
    description: "Crema/lozione corpo"
  },
  
  // Servizi Extra
  {
    id: "item_welcome",
    key: "welcome",
    name: "Welcome Kit",
    categoryId: "servizi_extra",
    defaultPrice: 15.00,
    unit: "kit",
    isForLinen: false,
    description: "Kit di benvenuto con prodotti locali"
  },
  {
    id: "item_fiori",
    key: "fiori",
    name: "Fiori Freschi",
    categoryId: "servizi_extra",
    defaultPrice: 20.00,
    unit: "pz",
    isForLinen: false,
    description: "Bouquet di fiori freschi"
  },
  {
    id: "item_frigo",
    key: "frigo",
    name: "Frigo Pieno",
    categoryId: "servizi_extra",
    defaultPrice: 50.00,
    unit: "kit",
    isForLinen: false,
    description: "Frigo fornito con prodotti base"
  },
];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Set degli ID degli articoli di sistema (per lookup veloce)
 */
export const SYSTEM_ITEM_IDS = new Set(SYSTEM_ITEMS.map(item => item.id));

/**
 * Set delle KEY degli articoli di sistema (per lookup veloce)
 */
export const SYSTEM_ITEM_KEYS = new Set(SYSTEM_ITEMS.map(item => item.key));

/**
 * Verifica se un articolo è di sistema (non modificabile/cancellabile)
 */
export function isSystemItem(idOrKey: string): boolean {
  return SYSTEM_ITEM_IDS.has(idOrKey) || 
         SYSTEM_ITEM_IDS.has(`item_${idOrKey}`) ||
         SYSTEM_ITEM_KEYS.has(idOrKey);
}

/**
 * Ottiene un articolo di sistema per ID o key
 */
export function getSystemItem(idOrKey: string): SystemItem | undefined {
  return SYSTEM_ITEMS.find(item => 
    item.id === idOrKey || 
    item.key === idOrKey ||
    item.id === `item_${idOrKey}`
  );
}

/**
 * Ottiene tutti gli articoli (sistema + opzionali) nel formato per il database
 */
export function getAllDefaultItems() {
  return [
    ...SYSTEM_ITEMS.map(item => ({
      id: item.id,
      key: item.key,
      name: item.name,
      categoryId: item.categoryId,
      sellPrice: item.defaultPrice,
      unit: item.unit,
      isForLinen: item.isForLinen,
      isSystemItem: true, // 🔒 Marcato come di sistema
      quantity: 100,
      minQuantity: 10,
    })),
    ...OPTIONAL_ITEMS.map(item => ({
      id: item.id,
      key: item.key,
      name: item.name,
      categoryId: item.categoryId,
      sellPrice: item.defaultPrice,
      unit: item.unit,
      isForLinen: item.isForLinen,
      isSystemItem: false, // Non di sistema
      quantity: 100,
      minQuantity: item.categoryId === 'kit_cortesia' ? 20 : 10,
    })),
  ];
}

/**
 * Categorie di sistema
 */
export const SYSTEM_CATEGORIES = [
  { id: 'biancheria_letto', name: 'Biancheria Letto', icon: '🛏️', order: 1 },
  { id: 'biancheria_bagno', name: 'Biancheria Bagno', icon: '🛁', order: 2 },
  { id: 'kit_cortesia', name: 'Kit Cortesia', icon: '🧴', order: 3 },
  { id: 'servizi_extra', name: 'Servizi Extra', icon: '✨', order: 4 },
];

/**
 * Mapping da calculationKey a ID articolo
 * Usato dal sistema di calcolo per trovare gli articoli corretti
 */
export const CALCULATION_KEY_TO_ITEM_ID: Record<string, string> = Object.fromEntries(
  SYSTEM_ITEMS.map(item => [item.calculationKey, item.id])
);

/**
 * Mapping da KEY a ID articolo
 */
export const KEY_TO_ITEM_ID: Record<string, string> = Object.fromEntries(
  [...SYSTEM_ITEMS, ...OPTIONAL_ITEMS].map(item => [item.key, item.id])
);
