/**
 * 🧺 LINEN SERVICE - CONSTANTS
 * 
 * Costanti unificate per tutto il sistema biancheria.
 * Include tipi letto, keyword matching ampliato, regole di calcolo.
 */

import type { BedType } from './types';

// ============================================================
// TIPI LETTO
// ============================================================

/**
 * Definizioni complete dei tipi di letto
 */
export const BED_TYPES: BedType[] = [
  { 
    tipo: 'matrimoniale', 
    nome: 'Matrimoniale', 
    capacita: 2, 
    icon: '🛏️', 
    dbType: 'matr' 
  },
  { 
    tipo: 'singolo', 
    nome: 'Singolo', 
    capacita: 1, 
    icon: '🛏️', 
    dbType: 'sing' 
  },
  { 
    tipo: 'piazza_mezza', 
    nome: 'Piazza e Mezza', 
    capacita: 1, 
    icon: '🛏️', 
    dbType: 'sing'  // Trattato come singolo per biancheria
  },
  { 
    tipo: 'divano_letto', 
    nome: 'Divano Letto', 
    capacita: 2, 
    icon: '🛋️', 
    dbType: 'divano' 
  },
  { 
    tipo: 'castello', 
    nome: 'Letto a Castello', 
    capacita: 2, 
    icon: '🛏️', 
    dbType: 'castello' 
  },
];

/**
 * Alias per compatibilità
 */
export const TIPI_LETTO = BED_TYPES;

// ============================================================
// REGOLE BIANCHERIA LETTO
// ============================================================

/**
 * Biancheria necessaria per ogni tipo di letto
 * 
 * REGOLE CONFERMATE:
 * - Matrimoniale: 3 pezzi (lenzuolo sotto + sopra + copripiumino) + 2 federe
 * - Singolo: 3 pezzi + 1 federa
 * - Divano Letto: come matrimoniale
 * - Castello: 2 letti singoli = 6 pezzi + 2 federe
 */
export const BED_LINEN_RULES: Record<string, { matrimoniali: number; singole: number; federe: number }> = {
  // Tipo interno
  'matrimoniale': { matrimoniali: 3, singole: 0, federe: 2 },
  'singolo': { matrimoniali: 0, singole: 3, federe: 1 },
  'piazza_mezza': { matrimoniali: 0, singole: 3, federe: 1 },
  'divano_letto': { matrimoniali: 3, singole: 0, federe: 2 },
  'castello': { matrimoniali: 0, singole: 6, federe: 2 },
  
  // Tipo database (alias)
  'matr': { matrimoniali: 3, singole: 0, federe: 2 },
  'sing': { matrimoniali: 0, singole: 3, federe: 1 },
  'divano': { matrimoniali: 3, singole: 0, federe: 2 },
};

// ============================================================
// KEYWORD MATCHING (ESPANSO)
// ============================================================

/**
 * Keyword per trovare articoli nell'inventario
 * Ogni tipo di articolo ha multiple keyword per matching flessibile
 */
export const ITEM_KEYWORDS = {
  // BIANCHERIA LETTO
  lenzuolaMatrimoniali: [
    'matrimoniale', 'matrimoniali', 'matr', 'lenz_matr', 'lenzuolo_matr',
    'doppio', 'double', 'doublesheets', 'doublesheet',
    'queen', 'king', 'matrimon'
  ],
  
  lenzuolaSingole: [
    'singolo', 'singola', 'singole', 'singoli', 'sing', 'lenz_sing', 'lenzuolo_sing',
    'single', 'singlesheets', 'singlesheet',
    'twin', '1 piazza', 'una piazza'
  ],
  
  federe: [
    'federa', 'federe', 'fed', 
    'pillowcase', 'pillowcases', 'pillow',
    'cuscino', 'guanciale', 'cuscinetto'
  ],
  
  copripiumini: [
    'copripiumino', 'copripiumini', 'piumino', 'piumone',
    'duvet', 'duvet cover', 'comforter'
  ],
  
  // BIANCHERIA BAGNO
  teliDoccia: [
    'telo doccia', 'telo_doccia', 'telodoccia', 'telo corpo', 'telo_corpo', 'telocorpo',
    'asciugamano grande', 'asciugamano_grande', 'grande',
    'bath towel', 'shower towel', 'body towel',
    'telo bagno', 'towel large', 'towelslarge'
  ],
  
  asciugamaniViso: [
    'viso', 'asciugamano viso', 'asciugamano_viso', 'asciugamanoviso',
    'face towel', 'face', 'towelsface', 'towelface',
    'asciugamano medio', 'medio'
  ],
  
  asciugamaniBidet: [
    'bidet', 'telo bidet', 'telo_bidet', 'telobidet',
    'ospite', 'asciugamano ospite', 'asciugamano_ospite',
    'piccolo', 'asciugamano piccolo', 'asciugamano_piccolo',
    'guest towel', 'hand towel', 'small towel',
    'towelssmall', 'towelsmall'
  ],
  
  tappetini: [
    'tappetino', 'tappetini', 'tappeto',
    'scendi', 'scendibagno', 'scendi_bagno', 'scendidoccia', 'scendi_doccia',
    'bath mat', 'bathmat', 'bathmats', 'mat',
    'pedana', 'pediluvio'
  ],
  
  accappatoi: [
    'accappatoio', 'accappatoi', 'accapp',
    'bathrobe', 'robe'
  ],
  
  // KIT CORTESIA
  shampoo: [
    'shampoo', 'shampo', 'sciampo'
  ],
  
  bagnoschiuma: [
    'bagnoschiuma', 'bagno schiuma', 'docciaschiuma', 'doccia schiuma',
    'shower gel', 'body wash', 'gel doccia'
  ],
  
  sapone: [
    'sapone', 'saponetta', 'saponette', 'saponcino',
    'soap', 'hand soap'
  ],
  
  crema: [
    'crema', 'crema corpo', 'lozione', 'body lotion', 'moisturizer'
  ],
};

/**
 * Mapping categoria inventario → tipo articoli
 */
export const CATEGORY_ITEM_TYPES: Record<string, string[]> = {
  'biancheria_letto': ['lenzuolaMatrimoniali', 'lenzuolaSingole', 'federe', 'copripiumini'],
  'biancheria_bagno': ['teliDoccia', 'asciugamaniViso', 'asciugamaniBidet', 'tappetini', 'accappatoi'],
  'kit_cortesia': ['shampoo', 'bagnoschiuma', 'sapone', 'crema'],
  'servizi_extra': [],
};

// ============================================================
// STANZE PREDEFINITE
// ============================================================

export const PREDEFINED_ROOMS = [
  'Camera Matrimoniale',
  'Camera Singola', 
  'Camera Doppia',
  'Cameretta',
  'Soggiorno',
  'Studio',
  'Mansarda',
  'Taverna'
];

// ============================================================
// PREZZI DEFAULT (fallback se inventario non disponibile)
// ============================================================

export const DEFAULT_PRICES = {
  lenzuolaMatrimoniali: 6.00,
  lenzuolaSingole: 5.00,
  federe: 2.00,
  teliDoccia: 4.00,
  asciugamaniViso: 2.00,
  asciugamaniBidet: 1.50,
  tappetini: 2.00,
  shampoo: 1.00,
  bagnoschiuma: 1.00,
  sapone: 0.50,
};

// ============================================================
// HELPERS
// ============================================================

/**
 * Ottiene info su un tipo di letto
 */
export function getBedTypeInfo(tipo: string): BedType {
  const found = BED_TYPES.find(t => 
    t.tipo === tipo || 
    t.dbType === tipo ||
    t.tipo.toLowerCase() === tipo.toLowerCase() ||
    t.dbType.toLowerCase() === tipo.toLowerCase()
  );
  
  return found || BED_TYPES[1]; // Default: singolo
}

/**
 * Converte tipo interno in dbType
 */
export function getDbType(tipo: string): string {
  return getBedTypeInfo(tipo).dbType;
}

/**
 * Converte dbType in tipo interno
 */
export function getInternalType(dbType: string): string {
  return getBedTypeInfo(dbType).tipo;
}

/**
 * Ottiene capacità di un tipo di letto
 */
export function getBedCapacity(tipo: string): number {
  return getBedTypeInfo(tipo).capacita;
}
