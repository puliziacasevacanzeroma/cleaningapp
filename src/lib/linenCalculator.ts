/**
 * LINEN CALCULATOR
 * Funzioni condivise per calcolare la biancheria in base a letti e ospiti
 * Usato da: NewCleaningModal, PropertyServiceConfig
 */

// ==================== TYPES ====================
export interface Bed {
  id: string;
  type: string;  // 'matr' | 'sing' | 'divano' | 'castello'
  name: string;
  loc: string;
  cap: number;   // Capacità (posti letto)
}

export interface LinenItem {
  id: string;
  n: string;     // Nome
  p: number;     // Prezzo
  d: number;     // Default quantity
}

export interface InventoryItem {
  id: string;
  name: string;
  key?: string;
  sellPrice: number;
  category?: string;
}

export interface GuestConfig {
  beds: string[];
  bl: Record<string, Record<string, number>>;  // Biancheria letto per letto
  ba: Record<string, number>;                   // Biancheria bagno
  ki: Record<string, number>;                   // Kit cortesia
  ex: Record<string, boolean>;                  // Extra
}

interface LinenRequirementByType {
  lenzuoloMatrimoniale: number;
  lenzuoloSingolo: number;
  federa: number;
}

interface BathRequirement {
  teloCorpo: number;
  teloViso: number;
  teloBidet: number;
  scendiBagno: number;
}

// ==================== CALCOLO BIANCHERIA LETTO ====================
/**
 * Calcola la biancheria necessaria per ogni tipo di letto
 * 
 * REGOLE:
 * - Matrimoniale: 3 lenzuola matrimoniali + 2 federe
 * - Singolo: 3 lenzuola singole + 1 federa
 * - Divano Letto: come matrimoniale
 * - Castello: 2 × singolo (6 lenz sing + 2 federe)
 */
export function getLinenForBedType(bedType: string): LinenRequirementByType {
  switch (bedType) {
    case 'matr':
      return { lenzuoloMatrimoniale: 3, lenzuoloSingolo: 0, federa: 2 };
    case 'sing':
      return { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 3, federa: 1 };
    case 'divano':
      return { lenzuoloMatrimoniale: 3, lenzuoloSingolo: 0, federa: 2 };
    case 'castello':
      return { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 6, federa: 2 };
    default:
      return { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 3, federa: 1 };
  }
}

// ==================== CALCOLO BIANCHERIA BAGNO ====================
/**
 * Calcola la biancheria bagno necessaria
 * 
 * REGOLE:
 * - Per OSPITE: 1 telo corpo, 1 telo viso, 1 telo bidet
 * - Per BAGNO: 1 scendi bagno
 */
export function calculateBathLinen(guestsCount: number, bathroomsCount: number): BathRequirement {
  return {
    teloCorpo: guestsCount,
    teloViso: guestsCount,
    teloBidet: guestsCount,
    scendiBagno: bathroomsCount
  };
}

/**
 * Mappa i requisiti biancheria bagno agli ID degli articoli dell'inventario
 */
export function mapBathToInventoryItems(
  bathReq: BathRequirement,
  inventoryItems: LinenItem[] | InventoryItem[]
): Record<string, number> {
  const result: Record<string, number> = {};
  
  const findItem = (keywords: string[]): any | undefined => {
    return inventoryItems.find(item => {
      const name = ((item as any).n || (item as any).name || '').toLowerCase();
      const id = (item.id || '').toLowerCase();
      const key = ((item as any).key || '').toLowerCase();
      return keywords.some(kw => 
        name.includes(kw.toLowerCase()) || 
        id.includes(kw.toLowerCase()) ||
        key.includes(kw.toLowerCase())
      );
    });
  };
  
  // Telo corpo / doccia / asciugamano grande
  const teloCorpo = findItem(['telo corpo', 'telo_corpo', 'telocorpo', 'telo doccia', 'asciugamano grande', 'asciugamano_grande']);
  if (teloCorpo && bathReq.teloCorpo > 0) {
    result[teloCorpo.id] = bathReq.teloCorpo;
  }
  
  // Telo viso / asciugamano piccolo
  const teloViso = findItem(['telo viso', 'telo_viso', 'teloviso', 'asciugamano viso', 'asciugamano piccolo']);
  if (teloViso && bathReq.teloViso > 0) {
    result[teloViso.id] = bathReq.teloViso;
  }
  
  // Telo bidet
  const teloBidet = findItem(['telo bidet', 'telo_bidet', 'telobidet', 'bidet']);
  if (teloBidet && bathReq.teloBidet > 0) {
    result[teloBidet.id] = bathReq.teloBidet;
  }
  
  // Scendi bagno / tappetino
  const scendiBagno = findItem(['scendi bagno', 'scendi_bagno', 'scendibagno', 'tappetino', 'tappeto bagno']);
  if (scendiBagno && bathReq.scendiBagno > 0) {
    result[scendiBagno.id] = bathReq.scendiBagno;
  }
  
  return result;
}

// ==================== GENERAZIONE CONFIGURAZIONE ====================
/**
 * Genera la configurazione di default per un numero di ospiti
 * basandosi sui letti della proprietà e numero bagni
 */
export function generateDefaultConfig(
  guestsCount: number, 
  propertyBeds: Bed[], 
  bathroomsCount: number = 1,
  inventoryLinen: LinenItem[] | InventoryItem[] = [],
  inventoryBath: LinenItem[] | InventoryItem[] = []
): GuestConfig {
  // Seleziona i letti necessari per coprire gli ospiti
  const selectedBeds: string[] = [];
  let remainingGuests = guestsCount;
  
  for (const bed of propertyBeds) {
    if (remainingGuests <= 0) break;
    selectedBeds.push(bed.id);
    remainingGuests -= bed.cap;
  }
  
  // Crea la configurazione biancheria letto PER OGNI LETTO SELEZIONATO
  const bl: Record<string, Record<string, number>> = {};
  
  const selectedBedsData = propertyBeds.filter(b => selectedBeds.includes(b.id));
  selectedBedsData.forEach(bed => {
    const linenReq = getLinenForBedType(bed.type);
    const bedLinen: Record<string, number> = {};
    
    inventoryLinen.forEach(item => {
      const itemName = ((item as any).n || (item as any).name || '').toLowerCase();
      if (itemName.includes('matrimoniale') || itemName.includes('matr')) {
        if (linenReq.lenzuoloMatrimoniale > 0) {
          bedLinen[item.id] = linenReq.lenzuoloMatrimoniale;
        }
      } else if (itemName.includes('singolo') || itemName.includes('sing')) {
        if (linenReq.lenzuoloSingolo > 0) {
          bedLinen[item.id] = linenReq.lenzuoloSingolo;
        }
      } else if (itemName.includes('federa')) {
        if (linenReq.federa > 0) {
          bedLinen[item.id] = linenReq.federa;
        }
      }
    });
    
    bl[bed.id] = bedLinen;
  });
  
  // Calcola biancheria BAGNO
  const bathReq = calculateBathLinen(guestsCount, bathroomsCount);
  const mappedBath = mapBathToInventoryItems(bathReq, inventoryBath as LinenItem[]);
  
  // Kit cortesia e Extra: vuoti
  const ki: Record<string, number> = {};
  const ex: Record<string, boolean> = {};
  
  return { beds: selectedBeds, bl, ba: mappedBath, ki, ex };
}

/**
 * Genera tutte le configurazioni per ogni numero di ospiti (1 a maxGuests)
 */
export function generateAllConfigs(
  maxGuests: number, 
  propertyBeds: Bed[], 
  bathroomsCount: number = 1,
  inventoryLinen: LinenItem[] | InventoryItem[] = [],
  inventoryBath: LinenItem[] | InventoryItem[] = []
): Record<number, GuestConfig> {
  const configs: Record<number, GuestConfig> = {};
  
  for (let i = 1; i <= maxGuests; i++) {
    configs[i] = generateDefaultConfig(i, propertyBeds, bathroomsCount, inventoryLinen, inventoryBath);
  }
  
  console.log(`✅ Generate ${maxGuests} configurazioni di default`);
  return configs;
}

/**
 * Converte una GuestConfig in array di SelectedItem per il modal
 */
export interface SelectedItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  category?: string;
}

export function configToSelectedItems(
  config: GuestConfig,
  inventoryItems: InventoryItem[]
): SelectedItem[] {
  const items: SelectedItem[] = [];
  const inventoryMap = new Map(inventoryItems.map(i => [i.id, i]));
  
  // Biancheria letto - può essere 'all' o per singolo letto
  if (config.bl) {
    // Controlla se esiste 'all' (formato vecchio)
    if (config.bl['all']) {
      Object.entries(config.bl['all']).forEach(([itemId, qty]) => {
        if (qty > 0) {
          const invItem = inventoryMap.get(itemId);
          if (invItem) {
            items.push({
              id: invItem.id,
              name: invItem.name,
              quantity: qty as number,
              price: invItem.sellPrice,
              category: 'biancheria_letto'
            });
          }
        }
      });
    } else {
      // Formato nuovo: per ogni letto
      // Aggrega le quantità per articolo
      const aggregated: Record<string, number> = {};
      Object.values(config.bl).forEach(bedLinen => {
        Object.entries(bedLinen).forEach(([itemId, qty]) => {
          aggregated[itemId] = (aggregated[itemId] || 0) + (qty as number);
        });
      });
      
      Object.entries(aggregated).forEach(([itemId, qty]) => {
        if (qty > 0) {
          const invItem = inventoryMap.get(itemId);
          if (invItem) {
            items.push({
              id: invItem.id,
              name: invItem.name,
              quantity: qty,
              price: invItem.sellPrice,
              category: 'biancheria_letto'
            });
          }
        }
      });
    }
  }
  
  // Biancheria bagno
  if (config.ba) {
    Object.entries(config.ba).forEach(([itemId, qty]) => {
      if (qty > 0) {
        const invItem = inventoryMap.get(itemId);
        if (invItem) {
          items.push({
            id: invItem.id,
            name: invItem.name,
            quantity: qty as number,
            price: invItem.sellPrice,
            category: 'biancheria_bagno'
          });
        }
      }
    });
  }
  
  // Kit cortesia
  if (config.ki) {
    Object.entries(config.ki).forEach(([itemId, qty]) => {
      if (qty > 0) {
        const invItem = inventoryMap.get(itemId);
        if (invItem) {
          items.push({
            id: invItem.id,
            name: invItem.name,
            quantity: qty as number,
            price: invItem.sellPrice,
            category: 'kit_cortesia'
          });
        }
      }
    });
  }
  
  return items;
}
