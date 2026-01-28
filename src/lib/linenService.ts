/**
 * LINEN SERVICE - SERVIZIO CENTRALIZZATO
 * Unica fonte di verità per la gestione biancheria
 * 
 * Tutti i componenti (modal, view, API) devono usare questo servizio
 */

import { db } from "~/lib/firebase/firebase";
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  addDoc,
  query, 
  where,
  Timestamp 
} from "firebase/firestore";
import {
  getLinenForBedType,
  mapLinenToInventory,
  mapBathToInventory,
  calculateBathLinen,
  generateAllConfigs as generateAllConfigsFromCalculator,
  configToSelectedItems,
  type PropertyBed,
  type GuestLinenConfig,
} from "./linenCalculator";

// ==================== TYPES ====================

export interface Bed {
  id: string;
  type: string;
  name: string;
  loc: string;
  cap: number;
}

export interface GuestConfig {
  beds: string[];
  bl: Record<string, Record<string, number>>;
  ba: Record<string, number>;
  ki: Record<string, number>;
  ex: Record<string, boolean>;
}

export interface PropertyData {
  id: string;
  name: string;
  maxGuests: number;
  bedrooms: number;
  bathrooms: number;
  bedsConfig: Bed[];
  serviceConfigs: Record<number, GuestConfig>;
  usesOwnLinen?: boolean;
}

export interface InventoryItem {
  id: string;
  name: string;
  price: number;
  category: string;
}

export interface LinenOrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  category?: string;
}

// ==================== INVENTORY CACHE ====================

let inventoryCache: {
  linen: InventoryItem[];
  bath: InventoryItem[];
  kit: InventoryItem[];
  extras: InventoryItem[];
  all: InventoryItem[];
  loadedAt: number;
} | null = null;

const CACHE_TTL = 5 * 60 * 1000; // 5 minuti

/**
 * Carica l'inventario da Firebase con cache
 */
export async function loadInventory(forceRefresh = false): Promise<typeof inventoryCache> {
  // Usa cache se valida
  if (!forceRefresh && inventoryCache && Date.now() - inventoryCache.loadedAt < CACHE_TTL) {
    return inventoryCache;
  }

  try {
    const inventoryRef = collection(db, "inventory");
    const snapshot = await getDocs(inventoryRef);
    
    const all: InventoryItem[] = [];
    const linen: InventoryItem[] = [];
    const bath: InventoryItem[] = [];
    const kit: InventoryItem[] = [];
    const extras: InventoryItem[] = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      const item: InventoryItem = {
        id: doc.id,
        name: data.name || data.n || doc.id,
        price: data.sellPrice || data.price || data.p || 0,
        category: data.category || "altro",
      };
      
      all.push(item);
      
      if (item.category === "biancheria_letto") linen.push(item);
      else if (item.category === "biancheria_bagno") bath.push(item);
      else if (item.category === "kit_cortesia") kit.push(item);
      else if (item.category === "servizi_extra") extras.push(item);
    });

    inventoryCache = { linen, bath, kit, extras, all, loadedAt: Date.now() };
    console.log(`📦 Inventario caricato: ${all.length} items`);
    
    return inventoryCache;
  } catch (error) {
    console.error("❌ Errore caricamento inventario:", error);
    throw error;
  }
}

// ==================== PROPERTY CONFIG ====================

/**
 * Carica i dati completi di una proprietà
 */
export async function loadPropertyData(propertyId: string): Promise<PropertyData | null> {
  try {
    const propertyRef = doc(db, "properties", propertyId);
    const propertySnap = await getDoc(propertyRef);
    
    if (!propertySnap.exists()) {
      console.error(`❌ Proprietà ${propertyId} non trovata`);
      return null;
    }

    const data = propertySnap.data();
    
    // Calcola maxGuests dalla somma delle capacità dei letti
    let bedsConfig: Bed[] = [];
    let calculatedMaxGuests = data.maxGuests || 4;
    
    if (data.bedsConfig && Array.isArray(data.bedsConfig) && data.bedsConfig.length > 0) {
      bedsConfig = data.bedsConfig.map((bed: any, index: number) => ({
        id: bed.id || `bed_${index + 1}`,
        type: bed.type || "sing",
        name: bed.name || bed.type || "Letto",
        loc: bed.loc || bed.location || `Camera ${Math.floor(index / 2) + 1}`,
        cap: bed.cap || bed.capacity || (bed.type === "matr" || bed.type === "divano" ? 2 : 1),
      }));
      
      // maxGuests = somma delle capacità dei letti
      calculatedMaxGuests = bedsConfig.reduce((sum, bed) => sum + bed.cap, 0);
    }

    const propertyData: PropertyData = {
      id: propertySnap.id,
      name: data.name || "Proprietà",
      maxGuests: calculatedMaxGuests,
      bedrooms: data.bedrooms || 1,
      bathrooms: data.bathrooms || 1,
      bedsConfig,
      serviceConfigs: data.serviceConfigs || {},
      usesOwnLinen: data.usesOwnLinen || false,
    };

    console.log(`📦 Proprietà caricata: ${propertyData.name}`);
    console.log(`   - maxGuests: ${propertyData.maxGuests}`);
    console.log(`   - bedsConfig: ${propertyData.bedsConfig.length} letti`);
    console.log(`   - serviceConfigs: ${Object.keys(propertyData.serviceConfigs).length} configs`);

    return propertyData;
  } catch (error) {
    console.error("❌ Errore caricamento proprietà:", error);
    throw error;
  }
}

/**
 * Ottiene la configurazione biancheria per un numero specifico di ospiti
 * Se non esiste, la genera automaticamente
 */
export async function getConfigForGuests(
  propertyId: string, 
  guestsCount: number
): Promise<{ config: GuestConfig; items: LinenOrderItem[]; fromSaved: boolean }> {
  
  const property = await loadPropertyData(propertyId);
  if (!property) throw new Error(`Proprietà ${propertyId} non trovata`);

  const inventory = await loadInventory();
  if (!inventory) throw new Error("Impossibile caricare inventario");

  // Verifica limite ospiti
  if (guestsCount > property.maxGuests) {
    console.warn(`⚠️ Richiesti ${guestsCount} ospiti ma max è ${property.maxGuests}`);
    guestsCount = property.maxGuests;
  }

  // CASO 1: Config salvata esiste
  if (property.serviceConfigs[guestsCount]) {
    const config = property.serviceConfigs[guestsCount];
    const items = configToItemsList(config, inventory.all);
    
    console.log(`✅ Config salvata per ${guestsCount} ospiti: ${items.length} items`);
    return { config, items, fromSaved: true };
  }

  // CASO 2: Genera automaticamente
  console.log(`⚠️ Nessuna config per ${guestsCount} ospiti, genero automaticamente...`);
  
  const config = generateConfigForGuests(
    guestsCount,
    property.bedsConfig,
    property.bathrooms,
    inventory.linen,
    inventory.bath
  );
  
  const items = configToItemsList(config, inventory.all);
  
  console.log(`✅ Config generata per ${guestsCount} ospiti: ${items.length} items`);
  return { config, items, fromSaved: false };
}

/**
 * Genera una configurazione per un numero specifico di ospiti
 * Usando la logica di linenCalculator
 */
export function generateConfigForGuests(
  guestsCount: number,
  beds: Bed[],
  bathrooms: number,
  inventoryLinen: InventoryItem[],
  inventoryBath: InventoryItem[]
): GuestConfig {
  // Seleziona i letti necessari per questo numero di ospiti
  const selectedBeds: string[] = [];
  let remainingGuests = guestsCount;
  
  // Ordina letti: matrimoniali prima (più efficienti)
  const sortedBeds = [...beds].sort((a, b) => b.cap - a.cap);
  
  for (const bed of sortedBeds) {
    if (remainingGuests <= 0) break;
    selectedBeds.push(bed.id);
    remainingGuests -= bed.cap;
  }

  // Genera biancheria letto per ogni letto selezionato
  const bl: Record<string, Record<string, number>> = {};
  
  for (const bedId of selectedBeds) {
    const bed = beds.find(b => b.id === bedId);
    if (!bed) continue;
    
    const linenReq = getLinenForBedType(bed.type);
    const linenFormatted = inventoryLinen.map(i => ({ id: i.id, name: i.name, key: i.id }));
    bl[bedId] = mapLinenToInventory(linenReq, linenFormatted);
  }

  // Genera biancheria bagno
  const bathReq = calculateBathLinen(guestsCount, bathrooms);
  const bathFormatted = inventoryBath.map(i => ({ id: i.id, name: i.name, key: i.id }));
  const ba = mapBathToInventory(bathReq, bathFormatted);

  return {
    beds: selectedBeds,
    bl,
    ba,
    ki: {},
    ex: {},
  };
}

/**
 * Converte una config in lista di items con nomi e prezzi
 */
export function configToItemsList(
  config: GuestConfig,
  inventory: InventoryItem[]
): LinenOrderItem[] {
  const itemsMap = new Map<string, LinenOrderItem>();

  // Helper per trovare item in inventario
  const findItem = (id: string) => inventory.find(i => i.id === id);

  // Biancheria letto (bl)
  if (config.bl) {
    Object.values(config.bl).forEach(bedItems => {
      if (typeof bedItems === "object" && bedItems !== null) {
        Object.entries(bedItems).forEach(([itemId, qty]) => {
          if (qty > 0) {
            const invItem = findItem(itemId);
            const existing = itemsMap.get(itemId);
            if (existing) {
              existing.quantity += qty;
            } else {
              itemsMap.set(itemId, {
                id: itemId,
                name: invItem?.name || itemId,
                quantity: qty,
                price: invItem?.price || 0,
                category: "biancheria_letto",
              });
            }
          }
        });
      }
    });
  }

  // Biancheria bagno (ba)
  if (config.ba) {
    Object.entries(config.ba).forEach(([itemId, qty]) => {
      if (qty > 0) {
        const invItem = findItem(itemId);
        itemsMap.set(itemId, {
          id: itemId,
          name: invItem?.name || itemId,
          quantity: qty,
          price: invItem?.price || 0,
          category: "biancheria_bagno",
        });
      }
    });
  }

  // Kit cortesia (ki)
  if (config.ki) {
    Object.entries(config.ki).forEach(([itemId, qty]) => {
      if (qty > 0) {
        const invItem = findItem(itemId);
        itemsMap.set(itemId, {
          id: itemId,
          name: invItem?.name || itemId,
          quantity: qty,
          price: invItem?.price || 0,
          category: "kit_cortesia",
        });
      }
    });
  }

  return Array.from(itemsMap.values());
}

/**
 * Calcola il prezzo totale della biancheria
 */
export function calculateTotalPrice(items: LinenOrderItem[]): number {
  return items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
}

// ==================== PULIZIA & ORDINI ====================

/**
 * Carica i dati di una pulizia
 */
export async function loadCleaningData(cleaningId: string) {
  try {
    const cleaningRef = doc(db, "cleanings", cleaningId);
    const cleaningSnap = await getDoc(cleaningRef);
    
    if (!cleaningSnap.exists()) return null;
    
    return { id: cleaningSnap.id, ...cleaningSnap.data() };
  } catch (error) {
    console.error("❌ Errore caricamento pulizia:", error);
    return null;
  }
}

/**
 * Aggiorna una pulizia con nuova configurazione
 */
export async function updateCleaning(
  cleaningId: string,
  guestsCount: number,
  customLinenConfig?: GuestConfig
): Promise<void> {
  try {
    const updateData: any = {
      guestsCount,
      updatedAt: Timestamp.now(),
    };
    
    if (customLinenConfig) {
      updateData.customLinenConfig = customLinenConfig;
    }

    await updateDoc(doc(db, "cleanings", cleaningId), updateData);
    console.log(`✅ Pulizia ${cleaningId} aggiornata`);
  } catch (error) {
    console.error("❌ Errore aggiornamento pulizia:", error);
    throw error;
  }
}

/**
 * Crea o aggiorna l'ordine biancheria per una pulizia
 */
export async function createOrUpdateLinenOrder(
  cleaningId: string,
  propertyId: string,
  guestsCount: number
): Promise<string | null> {
  try {
    // Carica config e items
    const { items } = await getConfigForGuests(propertyId, guestsCount);
    
    if (items.length === 0) {
      console.log("⚠️ Nessun item biancheria da ordinare");
      return null;
    }

    // Carica dati pulizia
    const cleaning = await loadCleaningData(cleaningId);
    if (!cleaning) throw new Error(`Pulizia ${cleaningId} non trovata`);

    // Cerca ordine esistente
    const ordersQuery = query(
      collection(db, "orders"),
      where("cleaningId", "==", cleaningId)
    );
    const ordersSnap = await getDocs(ordersQuery);

    const orderData = {
      propertyId,
      propertyName: (cleaning as any).propertyName || "",
      cleaningId,
      guestsCount,
      type: "LINEN",
      status: "PENDING",
      items: items.map(item => ({
        itemId: item.id,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
      })),
      totalPrice: calculateTotalPrice(items),
      updatedAt: Timestamp.now(),
    };

    if (!ordersSnap.empty) {
      // Aggiorna ordine esistente
      const orderDoc = ordersSnap.docs[0];
      await updateDoc(doc(db, "orders", orderDoc.id), orderData);
      console.log(`✅ Ordine ${orderDoc.id} aggiornato`);
      return orderDoc.id;
    } else {
      // Crea nuovo ordine
      const newOrderRef = await addDoc(collection(db, "orders"), {
        ...orderData,
        createdAt: Timestamp.now(),
      });
      console.log(`✅ Nuovo ordine creato: ${newOrderRef.id}`);
      return newOrderRef.id;
    }
  } catch (error) {
    console.error("❌ Errore creazione/aggiornamento ordine:", error);
    throw error;
  }
}

// ==================== PROPAGAZIONE MODIFICHE ====================

/**
 * Quando si modificano le config di una proprietà,
 * aggiorna tutte le pulizie FUTURE (non completate)
 */
export async function propagateConfigChanges(
  propertyId: string,
  newConfigs: Record<number, GuestConfig>
): Promise<{ updated: number; errors: number }> {
  const stats = { updated: 0, errors: 0 };
  
  try {
    const now = new Date();
    
    // Trova pulizie future non completate
    const cleaningsQuery = query(
      collection(db, "cleanings"),
      where("propertyId", "==", propertyId)
    );
    const cleaningsSnap = await getDocs(cleaningsQuery);
    
    for (const cleaningDoc of cleaningsSnap.docs) {
      const cleaning = cleaningDoc.data();
      
      // Skip se completata o passata
      if (cleaning.status === "COMPLETED" || cleaning.status === "completed") continue;
      
      const cleaningDate = cleaning.scheduledDate?.toDate?.() || new Date(0);
      if (cleaningDate < now) continue;
      
      // Skip se ha customLinenConfig (override manuale)
      if (cleaning.customLinenConfig) {
        console.log(`⏩ Skip pulizia ${cleaningDoc.id} - ha config personalizzata`);
        continue;
      }
      
      try {
        const guestsCount = cleaning.guestsCount || 2;
        
        // Aggiorna ordine collegato
        await createOrUpdateLinenOrder(cleaningDoc.id, propertyId, guestsCount);
        
        stats.updated++;
        console.log(`✅ Aggiornata pulizia ${cleaningDoc.id}`);
      } catch (err) {
        stats.errors++;
        console.error(`❌ Errore pulizia ${cleaningDoc.id}:`, err);
      }
    }
    
    console.log(`📊 Propagazione completata: ${stats.updated} aggiornate, ${stats.errors} errori`);
    return stats;
  } catch (error) {
    console.error("❌ Errore propagazione:", error);
    throw error;
  }
}

// ==================== VALIDAZIONE ====================

/**
 * Valida che il numero di ospiti rispetti il limite
 */
export function validateGuestsCount(guestsCount: number, maxGuests: number): {
  valid: boolean;
  adjustedCount: number;
  message?: string;
} {
  if (guestsCount <= 0) {
    return { valid: false, adjustedCount: 1, message: "Minimo 1 ospite" };
  }
  
  if (guestsCount > maxGuests) {
    return { 
      valid: false, 
      adjustedCount: maxGuests, 
      message: `Massimo ${maxGuests} ospiti per questa proprietà` 
    };
  }
  
  return { valid: true, adjustedCount: guestsCount };
}

/**
 * Calcola maxGuests dalla configurazione letti
 */
export function calculateMaxGuestsFromBeds(beds: Bed[]): number {
  return beds.reduce((sum, bed) => sum + bed.cap, 0);
}
