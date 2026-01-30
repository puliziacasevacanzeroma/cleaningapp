/**
 * 🧺 LINEN SERVICE - MAIN
 * 
 * UNICA FONTE DI VERITÀ per il calcolo della biancheria.
 * Tutte le funzioni di calcolo sono centralizzate qui.
 * 
 * @author CleaningApp Team
 * @version 2.0.0
 */

import type {
  PropertyBed,
  LinenRequirement,
  BathRequirement,
  GuestLinenConfig,
  ServiceConfigs,
  InventoryItem,
  LinenItem,
  DotazioniResult,
  ValidationResult,
  CleaningForLinen,
  PropertyForLinen,
} from './types';

import {
  BED_TYPES,
  TIPI_LETTO,
  BED_LINEN_RULES,
  ITEM_KEYWORDS,
  getBedTypeInfo,
  getDbType,
} from './constants';

// ============================================================
// GENERAZIONE LETTI
// ============================================================

/**
 * Genera automaticamente la configurazione letti basandosi su maxGuests e bedrooms
 * 
 * LOGICA:
 * 1. Per ogni camera da letto → 1 letto matrimoniale (2 posti)
 * 2. Se ospiti rimanenti >= 2 → aggiungi divano letto (2 posti)
 * 3. Se ospiti rimanenti = 1 → aggiungi letto singolo
 * 4. Se ancora ospiti rimanenti → aggiungi letto a castello (2 posti)
 * 
 * @param maxGuests Numero massimo di ospiti
 * @param bedrooms Numero di camere da letto
 * @returns Array di letti generati
 */
export function generateAutoBeds(maxGuests: number, bedrooms: number): PropertyBed[] {
  const beds: PropertyBed[] = [];
  let remainingGuests = maxGuests;
  let bedId = 1;
  
  // 1. Aggiungi un matrimoniale per ogni camera
  for (let i = 0; i < bedrooms && remainingGuests > 0; i++) {
    beds.push({
      id: `b${bedId++}`,
      tipo: 'matrimoniale',
      type: 'matr',
      nome: 'Matrimoniale',
      name: 'Matrimoniale',
      stanza: `Camera ${i + 1}`,
      loc: `Camera ${i + 1}`,
      capacita: 2,
      cap: 2
    });
    remainingGuests -= 2;
  }
  
  // 2. Se rimangono ospiti >= 2, aggiungi divano letto
  if (remainingGuests >= 2) {
    beds.push({
      id: `b${bedId++}`,
      tipo: 'divano_letto',
      type: 'divano',
      nome: 'Divano Letto',
      name: 'Divano Letto',
      stanza: 'Soggiorno',
      loc: 'Soggiorno',
      capacita: 2,
      cap: 2
    });
    remainingGuests -= 2;
  }
  
  // 3. Se rimane 1 ospite, aggiungi singolo
  if (remainingGuests === 1) {
    beds.push({
      id: `b${bedId++}`,
      tipo: 'singolo',
      type: 'sing',
      nome: 'Singolo',
      name: 'Singolo',
      stanza: bedrooms > 1 ? 'Cameretta' : 'Camera',
      loc: bedrooms > 1 ? 'Cameretta' : 'Camera',
      capacita: 1,
      cap: 1
    });
    remainingGuests -= 1;
  }
  
  // 4. Se ancora rimangono ospiti, aggiungi letti a castello
  while (remainingGuests >= 2) {
    beds.push({
      id: `b${bedId++}`,
      tipo: 'castello',
      type: 'castello',
      nome: 'Letto a Castello',
      name: 'Letto a Castello',
      stanza: 'Cameretta',
      loc: 'Cameretta',
      capacita: 2,
      cap: 2
    });
    remainingGuests -= 2;
  }
  
  // Se ancora rimane 1, aggiungi un altro singolo
  if (remainingGuests === 1) {
    beds.push({
      id: `b${bedId++}`,
      tipo: 'singolo',
      type: 'sing',
      nome: 'Singolo',
      name: 'Singolo',
      stanza: 'Cameretta',
      loc: 'Cameretta',
      capacita: 1,
      cap: 1
    });
  }
  
  return beds;
}

// ============================================================
// CALCOLO BIANCHERIA LETTO
// ============================================================

/**
 * Calcola la biancheria necessaria per un tipo di letto
 * 
 * @param bedType Tipo di letto (interno o dbType)
 * @returns Requisiti biancheria
 */
export function getLinenForBedType(bedType: string): LinenRequirement {
  const tipo = (bedType || '').toLowerCase();
  
  // Cerca nelle regole
  const rule = BED_LINEN_RULES[tipo];
  if (rule) {
    return {
      lenzuolaMatrimoniali: rule.matrimoniali,
      lenzuolaSingole: rule.singole,
      federe: rule.federe
    };
  }
  
  // Pattern matching per tipi non esatti
  if (tipo.includes('matr') || tipo.includes('matrimon') || tipo.includes('divano') || tipo.includes('double')) {
    return { lenzuolaMatrimoniali: 3, lenzuolaSingole: 0, federe: 2 };
  }
  
  if (tipo.includes('castello') || tipo.includes('bunk')) {
    return { lenzuolaMatrimoniali: 0, lenzuolaSingole: 6, federe: 2 };
  }
  
  // Default: singolo
  return { lenzuolaMatrimoniali: 0, lenzuolaSingole: 3, federe: 1 };
}

/**
 * Calcola biancheria totale per una lista di letti
 */
export function calculateTotalBedLinen(beds: PropertyBed[]): LinenRequirement {
  const total: LinenRequirement = {
    lenzuolaMatrimoniali: 0,
    lenzuolaSingole: 0,
    federe: 0
  };
  
  beds.forEach(bed => {
    const tipo = bed.type || bed.tipo || 'singolo';
    const req = getLinenForBedType(tipo);
    total.lenzuolaMatrimoniali += req.lenzuolaMatrimoniali;
    total.lenzuolaSingole += req.lenzuolaSingole;
    total.federe += req.federe;
  });
  
  return total;
}

// ============================================================
// CALCOLO BIANCHERIA BAGNO
// ============================================================

/**
 * Calcola la biancheria bagno necessaria
 * 
 * REGOLE:
 * - Per OSPITE: 1 telo doccia, 1 telo viso, 1 telo bidet
 * - Per BAGNO: 1 tappetino
 * 
 * @param guestsCount Numero ospiti
 * @param bathroomsCount Numero bagni
 */
export function calculateBathLinen(guestsCount: number, bathroomsCount: number): BathRequirement {
  return {
    teliDoccia: guestsCount,
    asciugamaniViso: guestsCount,
    asciugamaniBidet: guestsCount,
    tappetini: bathroomsCount
  };
}

// ============================================================
// KEYWORD MATCHING
// ============================================================

/**
 * Trova un articolo nell'inventario usando keyword matching
 * 
 * @param items Lista articoli inventario
 * @param keywordType Tipo di keyword da cercare
 * @returns Articolo trovato o undefined
 */
export function findItemByKeywords<T extends InventoryItem | LinenItem>(
  items: T[],
  keywordType: keyof typeof ITEM_KEYWORDS
): T | undefined {
  const keywords = ITEM_KEYWORDS[keywordType];
  if (!keywords || !items?.length) return undefined;
  
  return items.find(item => {
    // Normalizza tutti i possibili campi nome
    const name = ((item as any).nome || (item as any).name || (item as any).n || '').toLowerCase();
    const id = (item.id || '').toLowerCase();
    const key = ((item as any).key || '').toLowerCase();
    
    return keywords.some(kw => 
      name.includes(kw.toLowerCase()) || 
      id.includes(kw.toLowerCase()) || 
      key.includes(kw.toLowerCase())
    );
  });
}

/**
 * Trova il prezzo di un articolo per tipo
 */
export function findItemPrice<T extends InventoryItem | LinenItem>(
  items: T[],
  keywordType: keyof typeof ITEM_KEYWORDS
): number {
  const item = findItemByKeywords(items, keywordType);
  if (!item) return 0;
  
  return (item as any).sellPrice || 
         (item as any).price || 
         (item as any).p || 
         (item as any).defaultPrice || 
         0;
}

// ============================================================
// MAPPING BIANCHERIA → INVENTARIO
// ============================================================

/**
 * Mappa i requisiti biancheria letto agli ID degli articoli dell'inventario
 */
export function mapBedLinenToInventory<T extends InventoryItem | LinenItem>(
  linenReq: LinenRequirement,
  inventoryItems: T[]
): Record<string, number> {
  const result: Record<string, number> = {};
  
  // Cerca lenzuolo matrimoniale
  if (linenReq.lenzuolaMatrimoniali > 0) {
    const item = findItemByKeywords(inventoryItems, 'lenzuolaMatrimoniali');
    if (item) result[item.id] = linenReq.lenzuolaMatrimoniali;
  }
  
  // Cerca lenzuolo singolo
  if (linenReq.lenzuolaSingole > 0) {
    const item = findItemByKeywords(inventoryItems, 'lenzuolaSingole');
    if (item) result[item.id] = linenReq.lenzuolaSingole;
  }
  
  // Cerca federa
  if (linenReq.federe > 0) {
    const item = findItemByKeywords(inventoryItems, 'federe');
    if (item) result[item.id] = linenReq.federe;
  }
  
  return result;
}

/**
 * Mappa i requisiti biancheria bagno agli ID degli articoli dell'inventario
 */
export function mapBathLinenToInventory<T extends InventoryItem | LinenItem>(
  bathReq: BathRequirement,
  inventoryItems: T[]
): Record<string, number> {
  const result: Record<string, number> = {};
  
  // Telo doccia / corpo
  if (bathReq.teliDoccia > 0) {
    const item = findItemByKeywords(inventoryItems, 'teliDoccia');
    if (item) result[item.id] = bathReq.teliDoccia;
  }
  
  // Asciugamano viso
  if (bathReq.asciugamaniViso > 0) {
    const item = findItemByKeywords(inventoryItems, 'asciugamaniViso');
    if (item) result[item.id] = bathReq.asciugamaniViso;
  }
  
  // Asciugamano bidet
  if (bathReq.asciugamaniBidet > 0) {
    const item = findItemByKeywords(inventoryItems, 'asciugamaniBidet');
    if (item) result[item.id] = bathReq.asciugamaniBidet;
  }
  
  // Tappetino
  if (bathReq.tappetini > 0) {
    const item = findItemByKeywords(inventoryItems, 'tappetini');
    if (item) result[item.id] = bathReq.tappetini;
  }
  
  return result;
}

// ============================================================
// GENERAZIONE CONFIG PER NUMERO OSPITI
// ============================================================

/**
 * Genera configurazione default per un numero specifico di ospiti
 */
export function generateConfigForGuests<T extends InventoryItem | LinenItem>(
  guestCount: number,
  allBeds: PropertyBed[],
  bathroomsCount: number,
  inventoryLinen: T[],
  inventoryBath: T[],
  inventoryKit: T[] = [],
  inventoryExtras: T[] = []
): GuestLinenConfig {
  
  // 1. Seleziona i letti necessari per coprire gli ospiti
  const selectedBeds: string[] = [];
  let remainingGuests = guestCount;
  
  for (const bed of allBeds) {
    if (remainingGuests <= 0) break;
    selectedBeds.push(bed.id);
    remainingGuests -= bed.capacita || bed.cap || 1;
  }
  
  // 2. Calcola biancheria letto PER OGNI LETTO selezionato
  const bl: Record<string, Record<string, number>> = {};
  
  for (const bedId of selectedBeds) {
    const bed = allBeds.find(b => b.id === bedId);
    if (!bed) continue;
    
    const tipo = bed.type || bed.tipo || 'singolo';
    const linenReq = getLinenForBedType(tipo);
    bl[bedId] = mapBedLinenToInventory(linenReq, inventoryLinen);
  }
  
  // 3. Calcola biancheria bagno
  const bathReq = calculateBathLinen(guestCount, bathroomsCount);
  const ba = mapBathLinenToInventory(bathReq, inventoryBath);
  
  // 4. Kit cortesia (precompilato intelligentemente)
  const ki: Record<string, number> = {};
  inventoryKit.forEach(item => {
    const name = ((item as any).nome || (item as any).name || (item as any).n || '').toLowerCase();
    // Shampoo, bagnoschiuma, sapone: 1 per ospite
    if (name.includes('shampoo') || name.includes('bagno') || name.includes('sapone')) {
      ki[item.id] = guestCount;
    } else {
      ki[item.id] = 0;
    }
  });
  
  // 5. Extra (tutti disattivati di default)
  const ex: Record<string, boolean> = {};
  inventoryExtras.forEach(item => {
    ex[item.id] = false;
  });
  
  return { beds: selectedBeds, bl, ba, ki, ex };
}

/**
 * Genera tutte le configurazioni per ogni numero di ospiti (1 a maxGuests)
 */
export function generateAllGuestConfigs<T extends InventoryItem | LinenItem>(
  maxGuests: number,
  allBeds: PropertyBed[],
  bathroomsCount: number,
  inventoryLinen: T[],
  inventoryBath: T[],
  inventoryKit: T[] = [],
  inventoryExtras: T[] = []
): ServiceConfigs {
  const configs: ServiceConfigs = {};
  
  for (let guests = 1; guests <= maxGuests; guests++) {
    configs[guests] = generateConfigForGuests(
      guests,
      allBeds,
      bathroomsCount,
      inventoryLinen,
      inventoryBath,
      inventoryKit,
      inventoryExtras
    );
  }
  
  return configs;
}

// ============================================================
// CONVERSIONE FORMATO DATABASE
// ============================================================

/**
 * Converte configurazioni per salvataggio in database
 * Accetta sia formato nuovo che legacy
 */
export function convertConfigsForDatabase(configs: ServiceConfigs | Record<number, GuestLinenConfigLegacy>): Record<number, any> {
  const result: Record<number, any> = {};
  
  for (const [gc, cfg] of Object.entries(configs)) {
    const guestCount = parseInt(gc);
    
    // Rileva formato (legacy ha selectedBeds, nuovo ha beds)
    if ('selectedBeds' in cfg) {
      // Formato legacy
      const legacyCfg = cfg as GuestLinenConfigLegacy;
      result[guestCount] = {
        beds: legacyCfg.selectedBeds,
        bl: legacyCfg.bedLinen,
        ba: legacyCfg.bathItems,
        ki: legacyCfg.kitItems,
        ex: legacyCfg.extras
      };
    } else {
      // Formato nuovo
      const newCfg = cfg as GuestLinenConfig;
      result[guestCount] = {
        beds: newCfg.beds,
        bl: newCfg.bl,
        ba: newCfg.ba,
        ki: newCfg.ki,
        ex: newCfg.ex
      };
    }
  }
  
  return result;
}

/**
 * Converte configurazione da formato vecchio (bl: 'all') a nuovo (bl: bedId)
 */
export function migrateOldConfig(
  oldConfig: any,
  allBeds: PropertyBed[],
  inventoryLinen: any[]
): GuestLinenConfig {
  // Se già nel formato nuovo, ritorna così
  if (oldConfig.bl && !oldConfig.bl['all']) {
    return oldConfig as GuestLinenConfig;
  }
  
  // Migra da bl: { 'all': {...} } a bl: { [bedId]: {...} }
  const newBl: Record<string, Record<string, number>> = {};
  
  if (oldConfig.bl?.['all']) {
    const allLinen = oldConfig.bl['all'];
    const selectedBeds = oldConfig.beds || [];
    
    // Distribuisci la biancheria ai letti selezionati
    selectedBeds.forEach((bedId: string) => {
      const bed = allBeds.find(b => b.id === bedId);
      if (bed) {
        const tipo = bed.type || bed.tipo || 'singolo';
        const linenReq = getLinenForBedType(tipo);
        newBl[bedId] = mapBedLinenToInventory(linenReq, inventoryLinen);
      }
    });
  } else {
    // Se non c'è 'all', usa i letti selezionati
    (oldConfig.beds || []).forEach((bedId: string) => {
      const bed = allBeds.find(b => b.id === bedId);
      if (bed) {
        const tipo = bed.type || bed.tipo || 'singolo';
        const linenReq = getLinenForBedType(tipo);
        newBl[bedId] = mapBedLinenToInventory(linenReq, inventoryLinen);
      }
    });
  }
  
  return {
    beds: oldConfig.beds || [],
    bl: newBl,
    ba: oldConfig.ba || {},
    ki: oldConfig.ki || {},
    ex: oldConfig.ex || {}
  };
}

// ============================================================
// CALCOLO PREZZI
// ============================================================

/**
 * Calcola il prezzo totale della biancheria letto da una config
 */
export function calculateBedLinenPrice(
  config: GuestLinenConfig,
  inventory: InventoryItem[]
): number {
  let total = 0;
  
  Object.values(config.bl || {}).forEach(bedItems => {
    Object.entries(bedItems || {}).forEach(([itemId, qty]) => {
      const item = inventory.find(i => i.id === itemId);
      if (item && qty > 0) {
        const price = item.sellPrice || (item as any).price || (item as any).p || 0;
        total += price * qty;
      }
    });
  });
  
  return total;
}

/**
 * Calcola il prezzo totale della biancheria bagno da una config
 */
export function calculateBathLinenPrice(
  config: GuestLinenConfig,
  inventory: InventoryItem[]
): number {
  let total = 0;
  
  Object.entries(config.ba || {}).forEach(([itemId, qty]) => {
    const item = inventory.find(i => i.id === itemId);
    if (item && qty > 0) {
      const price = item.sellPrice || (item as any).price || (item as any).p || 0;
      total += price * qty;
    }
  });
  
  return total;
}

/**
 * Calcola il prezzo totale del kit cortesia da una config
 */
export function calculateKitPrice(
  config: GuestLinenConfig,
  inventory: InventoryItem[]
): number {
  let total = 0;
  
  Object.entries(config.ki || {}).forEach(([itemId, qty]) => {
    const item = inventory.find(i => i.id === itemId);
    if (item && qty > 0) {
      const price = item.sellPrice || (item as any).price || (item as any).p || 0;
      total += price * qty;
    }
  });
  
  return total;
}

/**
 * Calcola il prezzo totale degli extra da una config
 */
export function calculateExtrasPrice(
  config: GuestLinenConfig,
  inventory: InventoryItem[]
): number {
  let total = 0;
  
  Object.entries(config.ex || {}).forEach(([itemId, selected]) => {
    if (selected) {
      const item = inventory.find(i => i.id === itemId);
      if (item) {
        const price = item.sellPrice || (item as any).price || (item as any).p || 0;
        total += price;
      }
    }
  });
  
  return total;
}

// ============================================================
// CALCOLO DOTAZIONI COMPLETO (per Card e Modal)
// ============================================================

// Mapping da ID salvati (inglesi/tecnici) a keywordType delle ITEM_KEYWORDS
const SAVED_ID_TO_KEYWORD: Record<string, keyof typeof ITEM_KEYWORDS> = {
  // Biancheria Letto
  'pillowcases': 'federe',
  'pillowcase': 'federe',
  'doubleSheets': 'lenzuolaMatrimoniali',
  'doubleSheet': 'lenzuolaMatrimoniali',
  'singleSheets': 'lenzuolaSingole',
  'singleSheet': 'lenzuolaSingole',
  'lenzuola_matrimoniale': 'lenzuolaMatrimoniali',
  'lenzuola_singolo': 'lenzuolaSingole',
  'federa': 'federe',
  'copripiumino': 'copripiumini',
  // Biancheria Bagno
  'towelsLarge': 'teliDoccia',
  'towelLarge': 'teliDoccia',
  'towelsSmall': 'asciugamaniBidet',
  'towelSmall': 'asciugamaniBidet',
  'towelsFace': 'asciugamaniViso',
  'towelFace': 'asciugamaniViso',
  'bathMats': 'tappetini',
  'bathMat': 'tappetini',
  'asciugamano_grande': 'teliDoccia',
  'asciugamano_piccolo': 'asciugamaniBidet',
  'asciugamano_viso': 'asciugamaniViso',
  'tappetino_bagno': 'tappetini',
  'telo_doccia': 'teliDoccia',
};

/**
 * Calcola prezzi e dotazioni per una pulizia
 * FUNZIONE PRINCIPALE usata da Card e Modal
 */
export function calculateDotazioni(
  cleaning: CleaningForLinen,
  property: PropertyForLinen | undefined,
  inventory: InventoryItem[]
): DotazioniResult {
  const guestsCount = cleaning.guestsCount || 2;
  const bedrooms = property?.bedrooms || 1;
  const bathrooms = property?.bathrooms || 1;
  
  // Prezzo pulizia base
  const cleaningPrice = cleaning.price || cleaning.contractPrice || property?.cleaningPrice || 0;
  
  // Cerca config salvata (priorità: customLinenConfig > serviceConfigs)
  const savedConfig = cleaning.customLinenConfig || property?.serviceConfigs?.[guestsCount];
  
  let dotazioniPrice = 0;
  const bedItems: { name: string; quantity: number; price?: number }[] = [];
  const bathItems: { name: string; quantity: number; price?: number }[] = [];
  
  if (savedConfig) {
    // ========== USA CONFIG SALVATA ==========
    
    // Biancheria Letto
    if (savedConfig.bl) {
      // Gestisci sia formato nuovo (bl[bedId]) che vecchio (bl['all'])
      const blEntries = savedConfig.bl['all'] 
        ? [['all', savedConfig.bl['all']]] 
        : Object.entries(savedConfig.bl);
        
      blEntries.forEach(([, items]) => {
        Object.entries(items as Record<string, number>).forEach(([itemId, qty]) => {
          if (qty > 0) {
            // 🔥 Prima prova match diretto, poi usa keywords
            let invItem = inventory.find(i => 
              i.id === itemId || 
              (i as any).key === itemId ||
              ((i as any).name || '').toLowerCase().includes(itemId.toLowerCase())
            );
            
            // 🔥 Se non trovato, usa mapping ID → keyword
            if (!invItem) {
              const kwType = SAVED_ID_TO_KEYWORD[itemId];
              if (kwType) {
                invItem = findItemByKeywords(inventory, kwType);
              }
            }
            
            const price = invItem?.sellPrice || (invItem as any)?.price || 0;
            const name = (invItem as any)?.name || itemId;
            
            // Evita duplicati - aggrega per nome
            const existing = bedItems.find(b => b.name === name);
            if (existing) {
              existing.quantity += qty;
            } else {
              bedItems.push({ name, quantity: qty, price });
            }
            dotazioniPrice += price * qty;
          }
        });
      });
    }
    
    // Biancheria Bagno
    if (savedConfig.ba) {
      Object.entries(savedConfig.ba as Record<string, number>).forEach(([itemId, qty]) => {
        if (qty > 0) {
          // 🔥 Prima prova match diretto, poi usa keywords
          let invItem = inventory.find(i => 
            i.id === itemId || 
            (i as any).key === itemId ||
            ((i as any).name || '').toLowerCase().includes(itemId.toLowerCase())
          );
          
          // 🔥 Se non trovato, usa mapping ID → keyword
          if (!invItem) {
            const kwType = SAVED_ID_TO_KEYWORD[itemId];
            if (kwType) {
              invItem = findItemByKeywords(inventory, kwType);
            }
          }
          
          const price = invItem?.sellPrice || (invItem as any)?.price || 0;
          const name = (invItem as any)?.name || itemId;
          bathItems.push({ name, quantity: qty, price });
          dotazioniPrice += price * qty;
        }
      });
    }
    
  } else {
    // ========== AUTO-GENERA (nessuna config salvata) ==========
    
    const autoBeds = generateAutoBeds(guestsCount, bedrooms);
    const selectedBeds = autoBeds.slice(0, Math.ceil(guestsCount / 2));
    const linenReq = calculateTotalBedLinen(selectedBeds);
    
    // Biancheria Letto
    if (linenReq.lenzuolaMatrimoniali > 0) {
      const item = findItemByKeywords(inventory, 'lenzuolaMatrimoniali');
      if (item) {
        const price = item.sellPrice || (item as any).price || 0;
        const name = (item as any).name || 'Lenzuola Matrimoniali';
        bedItems.push({ name, quantity: linenReq.lenzuolaMatrimoniali, price });
        dotazioniPrice += price * linenReq.lenzuolaMatrimoniali;
      }
    }
    
    if (linenReq.lenzuolaSingole > 0) {
      const item = findItemByKeywords(inventory, 'lenzuolaSingole');
      if (item) {
        const price = item.sellPrice || (item as any).price || 0;
        const name = (item as any).name || 'Lenzuola Singole';
        bedItems.push({ name, quantity: linenReq.lenzuolaSingole, price });
        dotazioniPrice += price * linenReq.lenzuolaSingole;
      }
    }
    
    if (linenReq.federe > 0) {
      const item = findItemByKeywords(inventory, 'federe');
      if (item) {
        const price = item.sellPrice || (item as any).price || 0;
        const name = (item as any).name || 'Federe';
        bedItems.push({ name, quantity: linenReq.federe, price });
        dotazioniPrice += price * linenReq.federe;
      }
    }
    
    // Biancheria Bagno (auto)
    const bathKeywords: [keyof typeof ITEM_KEYWORDS, number][] = [
      ['teliDoccia', guestsCount],
      ['asciugamaniViso', guestsCount],
      ['asciugamaniBidet', guestsCount],
      ['tappetini', bathrooms]
    ];
    
    bathKeywords.forEach(([kwType, qty]) => {
      if (qty > 0) {
        const item = findItemByKeywords(inventory, kwType);
        if (item) {
          const price = item.sellPrice || (item as any).price || 0;
          const name = (item as any).name || kwType;
          
          // Evita duplicati
          if (!bathItems.find(b => b.name === name)) {
            bathItems.push({ name, quantity: qty, price });
            dotazioniPrice += price * qty;
          }
        }
      }
    });
  }
  
  return {
    cleaningPrice,
    dotazioniPrice,
    totalPrice: cleaningPrice + dotazioniPrice,
    bedItems,
    bathItems
  };
}

// ============================================================
// VALIDAZIONE
// ============================================================

/**
 * Valida una configurazione per un numero di ospiti
 */
export function validateGuestConfig(
  config: GuestLinenConfig,
  allBeds: PropertyBed[],
  guestsCount: number
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Calcola capacità totale dei letti selezionati
  const selectedBeds = allBeds.filter(b => config.beds.includes(b.id));
  const totalCapacity = selectedBeds.reduce((sum, b) => sum + (b.capacita || b.cap || 0), 0);
  
  const valid = totalCapacity >= guestsCount;
  
  if (!valid) {
    errors.push(`Capacità insufficiente: ${totalCapacity} posti per ${guestsCount} ospiti`);
  }
  
  // Verifica che ci sia biancheria per ogni letto selezionato
  config.beds.forEach(bedId => {
    if (!config.bl[bedId] || Object.keys(config.bl[bedId]).length === 0) {
      warnings.push(`Letto ${bedId} non ha biancheria configurata`);
    }
  });
  
  // Verifica biancheria bagno
  if (Object.keys(config.ba || {}).length === 0) {
    warnings.push('Nessuna biancheria bagno configurata');
  }
  
  return {
    valid,
    capacity: totalCapacity,
    needed: guestsCount,
    missing: Math.max(0, guestsCount - totalCapacity),
    errors,
    warnings
  };
}

/**
 * Valida tutte le configurazioni di una proprietà
 */
export function validateAllConfigs(
  configs: ServiceConfigs,
  allBeds: PropertyBed[],
  maxGuests: number
): { valid: boolean; results: Record<number, ValidationResult> } {
  const results: Record<number, ValidationResult> = {};
  let allValid = true;
  
  for (let guests = 1; guests <= maxGuests; guests++) {
    const config = configs[guests];
    if (config) {
      results[guests] = validateGuestConfig(config, allBeds, guests);
      if (!results[guests].valid) allValid = false;
    } else {
      results[guests] = {
        valid: false,
        capacity: 0,
        needed: guests,
        missing: guests,
        errors: [`Configurazione mancante per ${guests} ospiti`],
        warnings: []
      };
      allValid = false;
    }
  }
  
  return { valid: allValid, results };
}

// ============================================================
// EXPORT TIPI E COSTANTI
// ============================================================

// Re-export per comodità
export { BED_TYPES, TIPI_LETTO, ITEM_KEYWORDS, getBedTypeInfo, getDbType };
export type * from './types';

// ============================================================
// FUNZIONI DI COMPATIBILITÀ (per vecchi componenti)
// ============================================================

/**
 * Interfaccia SelectedItem per NewCleaningModal
 */
export interface SelectedItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  category?: string;
}

/**
 * Converte una config (bl, ba, ki, ex) in array di SelectedItem
 * Usata da NewCleaningModal per popolare la lista di articoli selezionati
 */
export function configToSelectedItems(
  config: GuestLinenConfig | any,
  inventoryItems: any[]
): SelectedItem[] {
  const items: SelectedItem[] = [];
  
  if (!config || !inventoryItems?.length) return items;
  
  // Helper per trovare item nell'inventario
  const findItem = (id: string) => inventoryItems.find(i => 
    i.id === id || i.key === id || (i.name || '').toLowerCase().includes(id.toLowerCase())
  );
  
  // Processa biancheria letto (bl)
  if (config.bl) {
    Object.values(config.bl as Record<string, Record<string, number>>).forEach(bedItems => {
      Object.entries(bedItems || {}).forEach(([itemId, qty]) => {
        if (qty > 0) {
          const inv = findItem(itemId);
          if (inv && !items.find(i => i.id === inv.id)) {
            items.push({
              id: inv.id || inv.key || itemId,
              name: inv.name || itemId,
              quantity: qty as number,
              price: inv.sellPrice || inv.price || 0,
              category: inv.category || 'biancheria_letto'
            });
          } else if (inv) {
            // Aggrega quantità se già presente
            const existing = items.find(i => i.id === inv.id);
            if (existing) existing.quantity += qty as number;
          }
        }
      });
    });
  }
  
  // Processa biancheria bagno (ba)
  if (config.ba) {
    Object.entries(config.ba as Record<string, number>).forEach(([itemId, qty]) => {
      if (qty > 0) {
        const inv = findItem(itemId);
        if (inv) {
          items.push({
            id: inv.id || inv.key || itemId,
            name: inv.name || itemId,
            quantity: qty,
            price: inv.sellPrice || inv.price || 0,
            category: inv.category || 'biancheria_bagno'
          });
        }
      }
    });
  }
  
  // Processa kit cortesia (ki)
  if (config.ki) {
    Object.entries(config.ki as Record<string, number>).forEach(([itemId, qty]) => {
      if (qty > 0) {
        const inv = findItem(itemId);
        if (inv) {
          items.push({
            id: inv.id || inv.key || itemId,
            name: inv.name || itemId,
            quantity: qty,
            price: inv.sellPrice || inv.price || 0,
            category: inv.category || 'kit_cortesia'
          });
        }
      }
    });
  }
  
  // Processa extra (ex) - solo quelli attivi
  if (config.ex) {
    Object.entries(config.ex as Record<string, boolean>).forEach(([itemId, active]) => {
      if (active) {
        const inv = findItem(itemId);
        if (inv) {
          items.push({
            id: inv.id || inv.key || itemId,
            name: inv.name || itemId,
            quantity: 1,
            price: inv.sellPrice || inv.price || 0,
            category: inv.category || 'servizi_extra'
          });
        }
      }
    });
  }
  
  return items;
}

/**
 * Genera config nel formato LEGACY (selectedBeds, bedLinen, etc.)
 * Per compatibilità con PropertyCreationModal
 */
export interface GuestLinenConfigLegacy {
  selectedBeds: string[];
  bedLinen: Record<string, Record<string, number>>;
  bathItems: Record<string, number>;
  kitItems: Record<string, number>;
  extras: Record<string, boolean>;
}

export function generateAllGuestConfigsLegacy<T extends InventoryItem | LinenItem>(
  maxGuests: number,
  allBeds: PropertyBed[],
  bathroomsCount: number,
  inventoryLinen: T[],
  inventoryBath: T[],
  inventoryKit: T[] = [],
  inventoryExtras: T[] = []
): Record<number, GuestLinenConfigLegacy> {
  const configs: Record<number, GuestLinenConfigLegacy> = {};
  
  for (let guests = 1; guests <= maxGuests; guests++) {
    const newConfig = generateConfigForGuests(
      guests,
      allBeds,
      bathroomsCount,
      inventoryLinen,
      inventoryBath,
      inventoryKit,
      inventoryExtras
    );
    
    // Converti in formato legacy
    configs[guests] = {
      selectedBeds: newConfig.beds,
      bedLinen: newConfig.bl,
      bathItems: newConfig.ba,
      kitItems: newConfig.ki,
      extras: newConfig.ex
    };
  }
  
  return configs;
}

/**
 * Converte config da formato nuovo a legacy
 */
export function toConfigLegacy(config: GuestLinenConfig): GuestLinenConfigLegacy {
  return {
    selectedBeds: config.beds || [],
    bedLinen: config.bl || {},
    bathItems: config.ba || {},
    kitItems: config.ki || {},
    extras: config.ex || {}
  };
}

/**
 * Converte config da formato legacy a nuovo
 */
export function fromConfigLegacy(legacy: GuestLinenConfigLegacy): GuestLinenConfig {
  return {
    beds: legacy.selectedBeds || [],
    bl: legacy.bedLinen || {},
    ba: legacy.bathItems || {},
    ki: legacy.kitItems || {},
    ex: legacy.extras || {}
  };
}
