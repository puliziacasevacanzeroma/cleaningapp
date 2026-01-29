/**
 * Utility per calcolare le dotazioni (biancheria) - CONDIVISA tra Card e Modal
 * Stessa logica di EditCleaningModal
 */

interface InventoryItem {
  id: string;
  name: string;
  sellPrice?: number;
  defaultPrice?: number;
}

interface Property {
  id: string;
  name: string;
  bedrooms?: number;
  bathrooms?: number;
  maxGuests?: number;
  cleaningPrice?: number;
  serviceConfigs?: Record<number, GuestConfig>;
}

interface GuestConfig {
  beds?: string[];
  bl?: Record<string, Record<string, number>>;
  ba?: Record<string, number>;
  ki?: Record<string, number>;
  ex?: Record<string, boolean>;
}

interface Cleaning {
  guestsCount?: number;
  customLinenConfig?: GuestConfig;
  price?: number;
  contractPrice?: number;
}

// ========== FUNZIONI DI AUTO-GENERAZIONE (copiate da EditCleaningModal) ==========

function generateAutoBeds(maxGuests: number, bedrooms: number) {
  const beds: { id: string; type: string; name: string; cap: number }[] = [];
  let rem = maxGuests, id = 1;
  for (let i = 0; i < bedrooms && rem > 0; i++) { 
    beds.push({ id: `b${id++}`, type: 'matr', name: 'Matrimoniale', cap: 2 }); 
    rem -= 2; 
  }
  if (rem >= 2) { beds.push({ id: `b${id++}`, type: 'divano', name: 'Divano Letto', cap: 2 }); rem -= 2; }
  if (rem === 1) { beds.push({ id: `b${id++}`, type: 'sing', name: 'Singolo', cap: 1 }); rem -= 1; }
  while (rem >= 2) { beds.push({ id: `b${id++}`, type: 'castello', name: 'Letto a Castello', cap: 2 }); rem -= 2; }
  if (rem === 1) { beds.push({ id: `b${id++}`, type: 'sing', name: 'Singolo', cap: 1 }); }
  return beds;
}

function getLinenForBedType(t: string) {
  switch (t) { 
    case 'matr': return { m: 3, s: 0, f: 2 }; 
    case 'sing': return { m: 0, s: 3, f: 1 }; 
    case 'divano': return { m: 3, s: 0, f: 2 }; 
    case 'castello': return { m: 0, s: 6, f: 2 }; 
    default: return { m: 0, s: 3, f: 1 }; 
  }
}

function calcLinenForBeds(beds: { type: string }[]) {
  const t = { m: 0, s: 0, f: 0 };
  beds.forEach(b => { const r = getLinenForBedType(b.type); t.m += r.m; t.s += r.s; t.f += r.f; });
  return t;
}

// ========== FUNZIONE PRINCIPALE ==========

export interface DotazioniResult {
  cleaningPrice: number;
  dotazioniPrice: number;
  totalPrice: number;
  bedItems: { name: string; quantity: number }[];
  bathItems: { name: string; quantity: number }[];
}

/**
 * Calcola prezzi e dotazioni per una pulizia
 * USA LA STESSA LOGICA DI EditCleaningModal
 */
export function calculateDotazioni(
  cleaning: Cleaning,
  property: Property | undefined,
  inventory: InventoryItem[]
): DotazioniResult {
  const guestsCount = cleaning.guestsCount || 2;
  const bedrooms = property?.bedrooms || 1;
  const bathrooms = property?.bathrooms || 1;
  
  // Prezzo pulizia
  const cleaningPrice = cleaning.price || cleaning.contractPrice || property?.cleaningPrice || 0;
  
  // Cerca config salvata (priorità: customLinenConfig > serviceConfigs)
  const savedConfig = cleaning.customLinenConfig || property?.serviceConfigs?.[guestsCount];
  
  let dotazioniPrice = 0;
  const bedItems: { name: string; quantity: number }[] = [];
  const bathItems: { name: string; quantity: number }[] = [];
  
  if (savedConfig) {
    // USA CONFIGURAZIONE SALVATA
    
    // Biancheria Letto
    if (savedConfig.bl) {
      Object.entries(savedConfig.bl).forEach(([, items]) => {
        Object.entries(items as Record<string, number>).forEach(([itemId, qty]) => {
          if (qty > 0) {
            const invItem = inventory.find(i => i.id === itemId || i.name?.toLowerCase().includes(itemId.toLowerCase()));
            const price = invItem?.sellPrice || invItem?.defaultPrice || 0;
            const name = invItem?.name || itemId;
            bedItems.push({ name, quantity: qty });
            dotazioniPrice += price * qty;
          }
        });
      });
    }
    
    // Biancheria Bagno
    if (savedConfig.ba) {
      Object.entries(savedConfig.ba as Record<string, number>).forEach(([itemId, qty]) => {
        if (qty > 0) {
          const invItem = inventory.find(i => i.id === itemId || i.name?.toLowerCase().includes(itemId.toLowerCase()));
          const price = invItem?.sellPrice || invItem?.defaultPrice || 0;
          const name = invItem?.name || itemId;
          bathItems.push({ name, quantity: qty });
          dotazioniPrice += price * qty;
        }
      });
    }
  } else {
    // AUTO-GENERA (stessa logica di EditCleaningModal)
    
    // Genera letti e calcola biancheria necessaria
    const autoBeds = generateAutoBeds(guestsCount, bedrooms);
    const selectedBeds = autoBeds.slice(0, Math.ceil(guestsCount / 2));
    const linenReq = calcLinenForBeds(selectedBeds);
    
    // Biancheria Letto
    if (linenReq.m > 0) {
      const item = inventory.find(i => i.name?.toLowerCase().includes('matrimoniale'));
      if (item) {
        bedItems.push({ name: item.name, quantity: linenReq.m });
        dotazioniPrice += (item.sellPrice || item.defaultPrice || 0) * linenReq.m;
      }
    }
    if (linenReq.s > 0) {
      const item = inventory.find(i => i.name?.toLowerCase().includes('singol'));
      if (item) {
        bedItems.push({ name: item.name, quantity: linenReq.s });
        dotazioniPrice += (item.sellPrice || item.defaultPrice || 0) * linenReq.s;
      }
    }
    if (linenReq.f > 0) {
      const item = inventory.find(i => i.name?.toLowerCase().includes('federa'));
      if (item) {
        bedItems.push({ name: item.name, quantity: linenReq.f });
        dotazioniPrice += (item.sellPrice || item.defaultPrice || 0) * linenReq.f;
      }
    }
    
    // Biancheria Bagno (auto)
    const bathKeywords = [
      { kw: ['corpo', 'telo doccia', 'telo_doccia'], qty: guestsCount },
      { kw: ['viso', 'asciugamano_viso'], qty: guestsCount },
      { kw: ['bidet', 'telo_bidet'], qty: guestsCount },
      { kw: ['ospite', 'asciugamano_ospite'], qty: guestsCount },
      { kw: ['scendi', 'tappetino'], qty: bathrooms }
    ];
    
    bathKeywords.forEach(({ kw, qty }) => {
      const item = inventory.find(i => kw.some(k => i.id?.toLowerCase().includes(k) || i.name?.toLowerCase().includes(k)));
      if (item && qty > 0) {
        // Evita duplicati
        if (!bathItems.find(b => b.name === item.name)) {
          bathItems.push({ name: item.name, quantity: qty });
          dotazioniPrice += (item.sellPrice || item.defaultPrice || 0) * qty;
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
