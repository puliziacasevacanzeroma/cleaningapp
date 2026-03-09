/**
 * 🧺 LINEN ORDER SERVICE
 * 
 * Service centralizzato per la gestione degli ordini biancheria.
 * TUTTI gli endpoint che creano pulizie devono usare questo service.
 * 
 * Questo garantisce:
 * - Logica unica e consistente
 * - Controllo anti-duplicato
 * - Collegamento bidirezionale pulizia ↔ ordine
 * - Calcolo corretto items biancheria
 */

import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  getDocs, 
  query, 
  where, 
  Timestamp 
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";

// ==================== TYPES ====================

export interface LinenItem {
  id: string;
  name: string;
  quantity: number;
}

export interface CreateLinenOrderInput {
  cleaningId: string;
  property: any;
  scheduledDate: Date;
  guestsCount?: number;
  urgency?: 'normal' | 'urgent';
  notes?: string;
}

export interface CreateLinenOrderResult {
  success: boolean;
  orderId: string | null;
  skipped: boolean;
  reason: string;
}

// ==================== MAIN FUNCTIONS ====================

/**
 * Crea un ordine biancheria per una pulizia.
 * 
 * CONTROLLI AUTOMATICI:
 * - Skip se proprietà usa biancheria propria
 * - Skip se ordine già esiste per questa pulizia
 * - Skip se nessun item da ordinare
 * 
 * AZIONI AUTOMATICHE:
 * - Calcola items biancheria
 * - Crea ordine
 * - Aggiorna pulizia con laundryOrderId
 */
export async function createLinenOrderForCleaning(
  input: CreateLinenOrderInput
): Promise<CreateLinenOrderResult> {
  const { cleaningId, property, scheduledDate, guestsCount, urgency = 'normal', notes = '' } = input;
  
  try {
    // 1. Check: proprietà usa biancheria propria?
    if (property.usesOwnLinen) {
      return {
        success: true,
        orderId: null,
        skipped: true,
        reason: 'Proprietà usa biancheria propria'
      };
    }
    
    // 2. Check: ordine già esiste?
    const existingOrderId = await findExistingOrderForCleaning(cleaningId);
    if (existingOrderId) {
      // Aggiorna comunque il link sulla pulizia (potrebbe mancare)
      await updateCleaningWithOrderId(cleaningId, existingOrderId);
      
      return {
        success: true,
        orderId: existingOrderId,
        skipped: true,
        reason: 'Ordine già esistente'
      };
    }
    
    // 3. Calcola items biancheria
    const guests = guestsCount || property.maxGuests || 2;
    const linenItems = calculateLinenItemsForProperty(property, guests);
    
    if (linenItems.length === 0) {
      return {
        success: true,
        orderId: null,
        skipped: true,
        reason: 'Nessun item biancheria configurato'
      };
    }
    
    // 4. Cerca biancheria da ritirare (ordini DELIVERED con pickup non completato)
    const pickupData = await calculatePickupItems(property.id);
    
    // 5. Crea ordine
    const orderRef = await addDoc(collection(db, 'orders'), {
      cleaningId: cleaningId,
      propertyId: property.id,
      propertyName: property.name,
      propertyAddress: property.address || '',
      propertyCity: property.city || '',
      propertyPostalCode: property.postalCode || '',
      propertyFloor: property.floor || '',
      propertyApartment: property.apartment || '',
      propertyIntercom: property.intercom || '',
      propertyDoorCode: property.doorCode || '',
      propertyKeysLocation: property.keysLocation || '',
      propertyAccessNotes: property.accessNotes || '',
      status: 'PENDING',
      type: 'LINEN',
      scheduledDate: Timestamp.fromDate(scheduledDate),
      scheduledTime: property.checkOutTime || '10:00',
      urgency: urgency,
      items: linenItems,
      guestsCount: guests,
      includePickup: pickupData.pickupItems.length > 0,
      pickupItems: pickupData.pickupItems,
      pickupFromOrders: pickupData.pickupFromOrders,
      pickupCompleted: false,
      notes: notes,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    
    const orderId = orderRef.id;
    
    // 5. Aggiorna pulizia con riferimento ordine
    await updateCleaningWithOrderId(cleaningId, orderId);
    
    
    return {
      success: true,
      orderId: orderId,
      skipped: false,
      reason: 'Ordine creato con successo'
    };
    
  } catch (error: any) {
    console.error(`❌ [LinenService] Errore creazione ordine:`, error);
    return {
      success: false,
      orderId: null,
      skipped: false,
      reason: `Errore: ${error.message}`
    };
  }
}

/**
 * Verifica se una pulizia ha un ordine biancheria e lo crea se manca.
 * Utile per fix batch o recovery.
 */
export async function ensureLinenOrderExists(
  cleaningId: string,
  property: any,
  scheduledDate: Date,
  guestsCount?: number
): Promise<CreateLinenOrderResult> {
  return createLinenOrderForCleaning({
    cleaningId,
    property,
    scheduledDate,
    guestsCount
  });
}

/**
 * Crea ordini biancheria per tutte le pulizie senza ordine di una proprietà.
 * Utile per recovery dopo sync che non ha creato ordini.
 */
export async function createMissingLinenOrders(
  propertyId: string
): Promise<{ created: number; skipped: number; errors: number }> {
  const stats = { created: 0, skipped: 0, errors: 0 };
  
  try {
    // Carica proprietà
    const propsSnap = await getDocs(query(collection(db, 'properties'), where('__name__', '==', propertyId)));
    if (propsSnap.empty) {
      console.error(`Proprietà ${propertyId} non trovata`);
      return stats;
    }
    const property = { id: propsSnap.docs[0].id, ...propsSnap.docs[0].data() };
    
    if ((property as any).usesOwnLinen) {
      return stats;
    }
    
    // Carica pulizie senza ordine
    const cleaningsSnap = await getDocs(
      query(collection(db, 'cleanings'), where('propertyId', '==', propertyId))
    );
    
    for (const cleaningDoc of cleaningsSnap.docs) {
      const cleaning = cleaningDoc.data();
      
      // Skip se già ha ordine
      if (cleaning.laundryOrderId) {
        stats.skipped++;
        continue;
      }
      
      // Skip se completata o cancellata
      if (['COMPLETED', 'CANCELLED'].includes(cleaning.status)) {
        stats.skipped++;
        continue;
      }
      
      const scheduledDate = cleaning.scheduledDate?.toDate?.() || new Date();
      
      const result = await createLinenOrderForCleaning({
        cleaningId: cleaningDoc.id,
        property,
        scheduledDate,
        guestsCount: cleaning.guestsCount
      });
      
      if (result.success && !result.skipped) {
        stats.created++;
      } else if (result.skipped) {
        stats.skipped++;
      } else {
        stats.errors++;
      }
    }
    
  } catch (error) {
    console.error(`Errore in createMissingLinenOrders:`, error);
    stats.errors++;
  }
  
  return stats;
}

// ==================== HELPER FUNCTIONS ====================

/**
 * 🔥 FUNZIONE CENTRALIZZATA - Calcola articoli da ritirare per una proprietà.
 * 
 * LOGICA:
 * La biancheria da ritirare = items degli ordini DELIVERED per la stessa proprietà
 * dove pickupCompleted !== true.
 * 
 * Questo copre:
 * - Ordini consegnati dal rider (status: DELIVERED)
 * - Ordini auto-confermati dal completamento pulizia (status: DELIVERED, autoConfirmedByCleaningCompletion: true)
 * 
 * NOTA: Un ordine diventa DELIVERED anche se il rider dimentica di completarlo,
 * perché quando la pulizia viene completata, l'ordine viene auto-confermato.
 * La pulizia non può essere completata senza biancheria.
 * 
 * Filtra solo biancheria (letto + bagno), esclude kit cortesia e prodotti pulizia.
 */
export async function calculatePickupItems(
  propertyId: string
): Promise<{ pickupItems: LinenItem[], pickupFromOrders: string[] }> {
  try {
    // Categorie biancheria da ritirare
    const PICKUP_CATEGORIES = ["biancheria_letto", "biancheria_bagno"];
    const EXCLUDE_CATEGORIES = ["kit_cortesia", "prodotti_pulizia", "cleaning_products"];
    const LINEN_KEYWORDS = [
      "lenzuol", "feder", "copri", "telo", "asciugaman", 
      "accappato", "tappet", "scendi", "coperta", "cuscin",
      "singol", "matrimonial", "bagno", "viso", "bidet", "corpo"
    ];
    const EXCLUDE_KEYWORDS = [
      "sapone", "shampoo", "bagnoschiuma", "crema", "detersivo",
      "spray", "detergente", "kit", "cortesia", "amenities"
    ];

    // Carica inventario per categoria
    const inventorySnap = await getDocs(collection(db, 'inventory'));
    const inventoryMap = new Map<string, { name: string; categoryId: string }>();
    inventorySnap.docs.forEach(invDoc => {
      const data = invDoc.data() as Record<string, any>;
      const itemData = { name: data.name || invDoc.id, categoryId: data.categoryId || "" };
      inventoryMap.set(invDoc.id, itemData);
      if (data.key) inventoryMap.set(data.key, itemData);
    });

    // Helper: determina se un item è biancheria
    const isBiancheria = (item: any): boolean => {
      const invItem = inventoryMap.get(item.id);
      const categoryId = invItem?.categoryId || item.categoryId || "";
      const itemName = (invItem?.name || item.name || "").toLowerCase();
      const itemType = (item.type || "").toLowerCase();

      if (itemType === "cleaning_product" || itemType === "kit_cortesia") return false;
      if (EXCLUDE_CATEGORIES.includes(categoryId)) return false;
      if (EXCLUDE_KEYWORDS.some(kw => itemName.includes(kw))) return false;
      if (PICKUP_CATEGORIES.includes(categoryId)) return true;
      if (LINEN_KEYWORDS.some(kw => itemName.includes(kw))) return true;
      // Default: includi se non ha categoria (meglio ritirare troppo)
      return !categoryId;
    };

    // Cerca ordini DELIVERED per questa proprietà con pickupCompleted !== true
    const ordersQuery = query(
      collection(db, 'orders'),
      where('propertyId', '==', propertyId),
      where('status', '==', 'DELIVERED')
    );
    const ordersSnap = await getDocs(ordersQuery);

    // Filtra: solo ordini con pickup non completato
    const pendingOrders = ordersSnap.docs.filter(d => {
      const data = d.data() as Record<string, any>;
      return data.pickupCompleted !== true;
    });

    if (pendingOrders.length === 0) {
      return { pickupItems: [], pickupFromOrders: [] };
    }

    // Somma items di biancheria da tutti gli ordini pending
    const itemsMap = new Map<string, LinenItem>();
    const orderIds: string[] = [];

    for (const orderDoc of pendingOrders) {
      const data = orderDoc.data() as Record<string, any>;
      orderIds.push(orderDoc.id);

      if (data.items && Array.isArray(data.items)) {
        for (const item of data.items) {
          if (!isBiancheria(item)) continue;

          const itemKey = item.id || item.name;
          const existing = itemsMap.get(itemKey);
          if (existing) {
            existing.quantity += item.quantity || 0;
          } else {
            const invItem = inventoryMap.get(item.id);
            itemsMap.set(itemKey, {
              id: item.id || itemKey,
              name: invItem?.name || item.name || item.id,
              quantity: item.quantity || 0
            });
          }
        }
      }
    }

    const pickupItems = Array.from(itemsMap.values()).filter(i => i.quantity > 0);
    

    return { pickupItems, pickupFromOrders: orderIds };
  } catch (error) {
    console.error(`❌ [LinenService] Errore calcolo pickupItems:`, error);
    return { pickupItems: [], pickupFromOrders: [] };
  }
}

/**
 * Trova ordine esistente per una pulizia
 */
async function findExistingOrderForCleaning(cleaningId: string): Promise<string | null> {
  try {
    const ordersQuery = query(
      collection(db, 'orders'),
      where('cleaningId', '==', cleaningId)
    );
    const ordersSnap = await getDocs(ordersQuery);
    
    // Cerca ordine non cancellato
    for (const orderDoc of ordersSnap.docs) {
      const order = orderDoc.data() as Record<string, any>;
      if (order.status !== 'CANCELLED') {
        return orderDoc.id;
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Errore ricerca ordine esistente:`, error);
    return null;
  }
}

/**
 * Aggiorna pulizia con riferimento ordine
 */
async function updateCleaningWithOrderId(cleaningId: string, orderId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'cleanings', cleaningId), {
      laundryOrderId: orderId,
      requiresLaundry: true,
      updatedAt: Timestamp.now()
    });
  } catch (error) {
    console.error(`Errore aggiornamento pulizia ${cleaningId}:`, error);
  }
}

/**
 * Calcola items biancheria per una proprietà
 */
export function calculateLinenItemsForProperty(property: any, guestsCount: number): LinenItem[] {
  let linenItems: LinenItem[] = [];
  
  // CASO 1: Ha serviceConfigs → usa quelli
  if (property.serviceConfigs) {
    const config = property.serviceConfigs[guestsCount] || property.serviceConfigs[String(guestsCount)];
    
    if (config) {
      // Biancheria letto
      if (config.bl) {
        const hasAll = config.bl['all'] && typeof config.bl['all'] === 'object' && Object.keys(config.bl['all']).length > 0;
        
        if (hasAll) {
          // USA SOLO 'all' - contiene i totali configurati dall'utente
          Object.entries(config.bl['all']).forEach(([itemId, qty]: [string, any]) => {
            if (typeof qty === 'number' && qty > 0) {
              linenItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
            }
          });
        } else {
          // Fallback: somma da gruppi letto (escludendo 'all')
          Object.entries(config.bl).forEach(([bedId, items]: [string, any]) => {
            if (bedId !== 'all' && typeof items === 'object') {
              Object.entries(items).forEach(([itemId, qty]: [string, any]) => {
                if (typeof qty === 'number' && qty > 0) {
                  const existing = linenItems.find(i => i.id === itemId);
                  if (existing) {
                    existing.quantity += qty;
                  } else {
                    linenItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
                  }
                }
              });
            }
          });
        }
      }
      
      // Biancheria bagno
      if (config.ba) {
        Object.entries(config.ba).forEach(([itemId, qty]: [string, any]) => {
          if (typeof qty === 'number' && qty > 0) {
            linenItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
          }
        });
      }
    }
  }
  
  // CASO 2: Fallback automatico
  if (linenItems.length === 0) {
    const bedrooms = property.bedrooms || 1;
    const bathrooms = property.bathrooms || 1;
    linenItems = calculateFallbackLinen(guestsCount, bedrooms, bathrooms);
  }
  
  return linenItems;
}

/**
 * Calcolo fallback biancheria
 */
function calculateFallbackLinen(guestsCount: number, bedrooms: number, bathrooms: number): LinenItem[] {
  const items: LinenItem[] = [];
  
  // Lenzuola: 3 per letto matrimoniale
  items.push({ id: 'doubleSheets', name: 'Lenzuola Matrimoniali', quantity: bedrooms * 3 });
  items.push({ id: 'pillowcases', name: 'Federe', quantity: bedrooms * 2 });
  
  // Asciugamani: per ospite
  items.push({ id: 'towelsLarge', name: 'Telo Doccia', quantity: guestsCount });
  items.push({ id: 'towelsFace', name: 'Asciugamano Viso', quantity: guestsCount });
  items.push({ id: 'towelsSmall', name: 'Asciugamano Bidet', quantity: guestsCount });
  
  // Tappetini: per bagno
  items.push({ id: 'bathMats', name: 'Tappetino Bagno', quantity: bathrooms });
  
  return items;
}

/**
 * Mappa ID item → nome leggibile
 */
function getItemName(itemId: string): string {
  const names: Record<string, string> = {
    'doubleSheets': 'Lenzuola Matrimoniali',
    'singleSheets': 'Lenzuola Singole',
    'pillowcases': 'Federe',
    'towelsLarge': 'Telo Doccia',
    'towelsFace': 'Asciugamano Viso',
    'towelsSmall': 'Asciugamano Bidet',
    'bathMats': 'Tappetino Bagno',
    'bathrobes': 'Accappatoio',
  };
  return names[itemId] || itemId;
}
