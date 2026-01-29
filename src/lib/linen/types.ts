/**
 * 🧺 LINEN SERVICE - TYPES
 * 
 * Definizioni TypeScript unificate per tutto il sistema biancheria.
 * UNICA FONTE DI VERITÀ per i tipi.
 */

// ============================================================
// TIPI BASE
// ============================================================

/**
 * Configurazione di un letto nella proprietà
 */
export interface PropertyBed {
  id: string;           // ID univoco: "stanza_123_matrimoniale_0"
  tipo: string;         // Tipo interno: "matrimoniale" | "singolo" | etc
  type?: string;        // Alias per compatibilità (dbType): "matr" | "sing" | etc
  nome: string;         // Nome display: "Matrimoniale"
  name?: string;        // Alias per compatibilità
  stanza: string;       // Nome stanza: "Camera 1"
  loc?: string;         // Alias per compatibilità
  capacita: number;     // Posti letto: 2
  cap?: number;         // Alias per compatibilità
}

/**
 * Tipo di letto con tutte le informazioni
 */
export interface BedType {
  tipo: string;         // "matrimoniale"
  nome: string;         // "Matrimoniale"
  capacita: number;     // 2
  icon: string;         // "🛏️"
  dbType: string;       // "matr" (per database)
}

/**
 * Requisiti biancheria letto per un tipo di letto
 */
export interface LinenRequirement {
  lenzuolaMatrimoniali: number;
  lenzuolaSingole: number;
  federe: number;
}

/**
 * Requisiti biancheria bagno
 */
export interface BathRequirement {
  teliDoccia: number;       // 1 per ospite
  asciugamaniViso: number;  // 1 per ospite
  asciugamaniBidet: number; // 1 per ospite
  tappetini: number;        // 1 per bagno
}

// ============================================================
// CONFIGURAZIONI PER NUMERO OSPITI
// ============================================================

/**
 * Configurazione biancheria per un numero specifico di ospiti
 * Questa è la struttura salvata in Firestore in property.serviceConfigs[N]
 */
export interface GuestLinenConfig {
  /** ID dei letti selezionati per questo numero di ospiti */
  beds: string[];
  
  /** 
   * Biancheria letto PER OGNI LETTO selezionato
   * Struttura: { [bedId]: { [itemId]: quantity } }
   * Esempio: { "b1": { "lenz_matr": 3, "federa": 2 } }
   */
  bl: Record<string, Record<string, number>>;
  
  /** 
   * Biancheria bagno
   * Struttura: { [itemId]: quantity }
   */
  ba: Record<string, number>;
  
  /** 
   * Kit cortesia
   * Struttura: { [itemId]: quantity }
   */
  ki: Record<string, number>;
  
  /** 
   * Servizi extra (checkbox)
   * Struttura: { [itemId]: boolean }
   */
  ex: Record<string, boolean>;
}

/**
 * Alias per compatibilità con vecchio codice
 */
export type GuestConfig = GuestLinenConfig;

/**
 * Tutte le configurazioni per una proprietà
 * Chiave = numero ospiti, Valore = config per quel numero
 */
export type ServiceConfigs = Record<number, GuestLinenConfig>;

// ============================================================
// ARTICOLI INVENTARIO
// ============================================================

/**
 * Articolo dell'inventario
 */
export interface InventoryItem {
  id: string;
  key?: string;
  name: string;
  nome?: string;        // Alias italiano
  categoryId: string;
  sellPrice: number;
  price?: number;       // Alias
  p?: number;           // Alias compatto
  unit?: string;
  quantity?: number;
  minQuantity?: number;
  isForLinen?: boolean;
}

/**
 * Articolo formattato per UI (LinenItem)
 */
export interface LinenItem {
  id: string;
  n: string;            // nome
  p: number;            // prezzo
  d?: number;           // default quantity
}

// ============================================================
// RISULTATI CALCOLO
// ============================================================

/**
 * Risultato del calcolo dotazioni per una pulizia
 */
export interface DotazioniResult {
  /** Prezzo base pulizia */
  cleaningPrice: number;
  
  /** Prezzo totale biancheria */
  dotazioniPrice: number;
  
  /** Prezzo totale (pulizia + biancheria) */
  totalPrice: number;
  
  /** Lista articoli biancheria letto con quantità */
  bedItems: { name: string; quantity: number; price?: number }[];
  
  /** Lista articoli biancheria bagno con quantità */
  bathItems: { name: string; quantity: number; price?: number }[];
  
  /** Lista kit cortesia (opzionale) */
  kitItems?: { name: string; quantity: number; price?: number }[];
}

/**
 * Risultato validazione configurazione
 */
export interface ValidationResult {
  valid: boolean;
  capacity: number;
  needed: number;
  missing: number;
  errors: string[];
  warnings: string[];
}

// ============================================================
// STANZE E FORM
// ============================================================

/**
 * Stanza nel form di creazione proprietà
 */
export interface RoomConfig {
  id: string;
  nome: string;
  letti: {
    id: string;
    tipo: string;
    quantita: number;
  }[];
}

/**
 * Configurazione letti salvata in proprietà
 */
export interface BedsConfig {
  beds: PropertyBed[];
  bedConfiguration: RoomConfig[];
}

// ============================================================
// CLEANING & PROPERTY (per compatibilità)
// ============================================================

export interface CleaningForLinen {
  guestsCount?: number;
  customLinenConfig?: GuestLinenConfig;
  price?: number;
  contractPrice?: number;
}

export interface PropertyForLinen {
  id: string;
  name?: string;
  bedrooms?: number;
  bathrooms?: number;
  maxGuests?: number;
  cleaningPrice?: number;
  beds?: PropertyBed[];
  bedsConfig?: PropertyBed[];
  serviceConfigs?: ServiceConfigs;
  usesOwnLinen?: boolean;
}
