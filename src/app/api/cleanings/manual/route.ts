import { NextResponse } from "next/server";
import { createCleaning, createOrder, getPropertyById } from "~/lib/firebase/firestore-data-admin";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { createNotification } from "~/lib/firebase/notifications-admin";
import { requireProprietario } from "~/lib/api-auth";
import { validateBody, GenericBodySchema } from "~/lib/validation/schemas";

// ── Tipi locali ──────────────────────────────────────────────────────────────
type LinenItem = {
  id?: string;
  name?: string;
  categoryId?: string;
  type?: string;
  quantity?: number;
  price?: number;
};
type InvItem = {
  name?: string;
  categoryId?: string;
  sellPrice?: number;
};
type PropertyRef = { id: string; name: string; address?: string };


/**
 * Carica gli articoli dall'inventario
 * Restituisce una mappa itemId -> { name, categoryId, sellPrice }
 */
async function loadInventoryData(): Promise<Map<string, { name: string; categoryId: string; sellPrice: number }>> {
  const dataMap = new Map<string, { name: string; categoryId: string; sellPrice: number }>();
  try {
    // Collezione corretta è "inventory", non "inventoryItems"
    const snapshot = await adminDb.collection("inventory").get();
    snapshot.docs.forEach(doc => {
      const data = doc.data() as Record<string, any>;
      const itemData = {
        name: data.name || doc.id,
        categoryId: data.categoryId || "",
        sellPrice: data.sellPrice || 0  // 🔥 AGGIUNTO: prezzo di vendita
      };
      // 🔥 FIX: Indicizza sia per doc.id che per key
      dataMap.set(doc.id, itemData);  // es: "item_doubleSheets"
      if (data.key) {
        dataMap.set(data.key, itemData);  // es: "doubleSheets"
      }
    });
    if (process.env.NODE_ENV !== "production") console.log(`📦 Inventario caricato: ${dataMap.size} voci (${snapshot.docs.length} articoli)`);
  } catch (e) {
    console.error("Errore caricamento inventario:", e);
  }
  return dataMap;
}

// Alias per retrocompatibilità
async function loadInventoryNames(): Promise<Map<string, string>> {
  const dataMap = await loadInventoryData();
  const namesMap = new Map<string, string>();
  dataMap.forEach((value, key) => {
    namesMap.set(key, value.name);
  });
  return namesMap;
}


/**
 * Calcola gli articoli da ritirare sommando tutte le consegne precedenti
 * non ancora ritirate per questa proprietà.
 * 
 * IMPORTANTE: Solo biancheria letto e bagno vanno ritirate!
 * Kit cortesia e prodotti pulizia sono beni di consumo e restano in casa.
 */
async function calculatePickupItems(propertyId: string): Promise<{
  pickupItems: { id: string; name: string; quantity: number }[];
  pickupFromOrders: string[];
}> {
  try {
    if (process.env.NODE_ENV !== "production") console.log(`\n${"=".repeat(60)}`);
    if (process.env.NODE_ENV !== "production") console.log(`${"=".repeat(60)}`);
    
    // 1. Carica inventario per sapere la categoria di ogni articolo
    const inventorySnap = await adminDb.collection("inventory").get();
    const inventoryMap = new Map<string, { name: string; categoryId: string }>();
    
    inventorySnap.docs.forEach(doc => {
      const data = doc.data() as Record<string, any>;
      const itemData = {
        name: data.name || doc.id,
        categoryId: data.categoryId || ""
      };
      // 🔥 FIX: Indicizza sia per doc.id che per key
      inventoryMap.set(doc.id, itemData);
      if (data.key) {
        inventoryMap.set(data.key, itemData);
      }
    });
    
    // Categorie da ritirare (biancheria che va lavata)
    const PICKUP_CATEGORIES = ["biancheria_letto", "biancheria_bagno"];
    
    // Categorie da ESCLUDERE sempre
    const EXCLUDE_CATEGORIES = ["kit_cortesia", "prodotti_pulizia", "cleaning_products"];
    
    // Nomi articoli che indicano biancheria (fallback se categoria non trovata)
    const LINEN_KEYWORDS = [
      "lenzuol", "feder", "copri", "telo", "asciugaman", 
      "accappato", "tappet", "scendi", "coperta", "cuscin",
      "singol", "matrimonial", "bagno", "viso", "bidet", "corpo"
    ];
    
    // Nomi da escludere (kit cortesia, prodotti pulizia)
    const EXCLUDE_KEYWORDS = [
      "sapone", "shampoo", "bagnoschiuma", "crema", "detersivo",
      "spray", "detergente", "kit", "cortesia", "amenities"
    ];
    
    // Helper: determina se un item è biancheria da ritirare
    const isBiancheria = (item: LinenItem, invItem: InvItem | null): { result: boolean; reason: string } => {
      const categoryId = invItem?.categoryId || item.categoryId || "";
      const itemName = (invItem?.name || item.name || "").toLowerCase();
      const itemType = (item.type || "").toLowerCase();
      
      // 1. Se ha un type esplicito che esclude, salta
      if (itemType === "cleaning_product" || itemType === "kit_cortesia") {
        return { result: false, reason: `tipo escluso: ${itemType}` };
      }
      
      // 2. Se ha una categoria esclusa, salta
      if (EXCLUDE_CATEGORIES.includes(categoryId)) {
        return { result: false, reason: `categoria esclusa: ${categoryId}` };
      }
      
      // 3. Se il nome contiene parole da escludere, salta
      if (EXCLUDE_KEYWORDS.some(kw => itemName.includes(kw))) {
        return { result: false, reason: `nome escluso: ${itemName}` };
      }
      
      // 4. Se ha una categoria di biancheria, includi
      if (PICKUP_CATEGORIES.includes(categoryId)) {
        return { result: true, reason: `categoria biancheria: ${categoryId}` };
      }
      
      // 5. Se il nome contiene parole di biancheria, includi
      if (LINEN_KEYWORDS.some(kw => itemName.includes(kw))) {
        return { result: true, reason: `nome biancheria: ${itemName}` };
      }
      
      // 6. Default: se non sappiamo, INCLUDI (meglio ritirare troppo che troppo poco)
      // Ma solo se non ha categoria (se ha categoria diversa da biancheria, escludiamo)
      if (!categoryId) {
        return { result: true, reason: `default incluso (no categoria): ${itemName}` };
      }
      
      return { result: false, reason: `categoria non biancheria: ${categoryId}` };
    };
    
    // 2. Cerca tutti gli ordini DELIVERED di questa proprietà
    const ordersRef = adminDb.collection("orders");
    const ordersQuery = ordersRef.where("status", "==", "DELIVERED");
    
    const snapshot = await ordersQuery.get();
    
    // Filtra ordini con pickupCompleted !== true (include false e undefined)
    const pendingPickupOrders = snapshot.docs.filter(doc => {
      const data = doc.data() as Record<string, any>;
      const isPending = data.pickupCompleted !== true;
      if (process.env.NODE_ENV !== "production") console.log(`   - Ordine ${doc.id}: pickupCompleted=${data.pickupCompleted} → ${isPending ? 'DA RITIRARE' : 'GIÀ RITIRATO'}`);
      return isPending;
    });
    
    if (pendingPickupOrders.length === 0) {
      return { pickupItems: [], pickupFromOrders: [] };
    }
    
    // 3. Somma tutti gli items di biancheria
    const itemsMap = new Map<string, { id: string; name: string; quantity: number }>();
    const orderIds: string[] = [];
    
    for (const doc of pendingPickupOrders) {
      const data = doc.data() as Record<string, any>;
      orderIds.push(doc.id);
      
      if (process.env.NODE_ENV !== "production") console.log(`\n  📦 Analisi ordine ${doc.id}:`);
      if (process.env.NODE_ENV !== "production") console.log(`     Items: ${data.items?.length || 0}`);
      
      if (data.items && Array.isArray(data.items)) {
        for (const item of data.items) {
          const invItem = inventoryMap.get(item.id);
          // @ts-expect-error TODO-FIX: TS2345 Argument of type '{ name: string; categoryId: string; } | undefined' is not assi...
          const check = isBiancheria(item, invItem);
          
          if (!check.result) {
            if (process.env.NODE_ENV !== "production") console.log(`     ❌ ESCLUSO: ${item.name || item.id} x${item.quantity} (${check.reason})`);
            continue;
          }
          
          if (process.env.NODE_ENV !== "production") console.log(`     ✅ INCLUSO: ${item.name || item.id} x${item.quantity} (${check.reason})`);
          
          const itemKey = item.id || item.name; // Usa id o nome come chiave
          const existing = itemsMap.get(itemKey);
          if (existing) {
            existing.quantity += item.quantity || 0;
          } else {
            itemsMap.set(itemKey, {
              id: item.id || itemKey,
              name: invItem?.name || item.name || item.id,
              quantity: item.quantity || 0
            });
          }
        }
      }
    }
    
    const pickupItems = Array.from(itemsMap.values()).filter(item => item.quantity > 0);
    
    if (process.env.NODE_ENV !== "production") console.log(`\n📥 RISULTATO RITIRO:`);
    if (process.env.NODE_ENV !== "production") console.log(`   Ordini: ${orderIds.length} (${orderIds.join(", ")})`);
    if (process.env.NODE_ENV !== "production") console.log(`   Articoli: ${pickupItems.length}`);
    pickupItems.forEach(item => {
      if (process.env.NODE_ENV !== "production") console.log(`     - ${item.name}: ${item.quantity}`);
    });
    if (process.env.NODE_ENV !== "production") console.log(`${"=".repeat(60)}\n`);
    
    return { pickupItems, pickupFromOrders: orderIds };
  } catch (error) {
    console.error("❌ Errore calcolo pickupItems:", error);
    return { pickupItems: [], pickupFromOrders: [] };
  }
}

export async function POST(request: Request) {
  try {
  // ── Auth ──────────────────────────────────────────────
  const authResult = await requireProprietario();
  if ('error' in authResult) return authResult.error;
  const _user = authResult.user;
  // ─────────────────────────────────────────────────────

    const body = await validateBody(request, GenericBodySchema);
    if (body instanceof Response) return body;
    const { 
      propertyId, 
      scheduledDate, 
      scheduledTime,
      guestsCount,
      notes,
      type = "MANUAL", // MANUAL, CHECKOUT, CHECKIN, DEEP_CLEAN
      createLinenOrder = true, // Se creare ordine biancheria
      linenOnly = false, // Se creare SOLO ordine biancheria (senza pulizia)
      customLinenItems, // Items personalizzati per biancheria
      selectedBedIds, // 🆕 Letti selezionati dal frontend
      linenConfigModified = false, // 🆕 Flag biancheria personalizzata
      cleaningPrice,
      linenPrice,
      totalPrice,
      urgency = "normal", // normal | urgent
      includePickup = true, // Default ON - ritiro biancheria sporca
      applyDeliveryFee = true, // 💰 Costo consegna €10 (admin può disattivare)
    } = body;

    if (!propertyId) {
      return NextResponse.json({ error: "PropertyId richiesto" }, { status: 400 });
    }

    if (!scheduledDate) {
      return NextResponse.json({ error: "Data richiesta" }, { status: 400 });
    }

    // @ts-expect-error TODO-FIX: TS2365 Operator '<=' cannot be applied to types '{}' and 'number'.
    if (!guestsCount || guestsCount <= 0) {
      return NextResponse.json({ error: "Numero ospiti richiesto" }, { status: 400 });
    }

    // Carica la proprietà
    // @ts-expect-error TODO-FIX: TS2345 Argument of type '{}' is not assignable to parameter of type 'string'.
    const property = await getPropertyById(propertyId);
    if (!property) {
      return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    }

    // IMPORTANTE: Crea la data corretta (mezzogiorno per evitare problemi timezone)
    // @ts-expect-error TODO-FIX: TS2339 Property 'split' does not exist on type '{}'.
    const [year, month, day] = scheduledDate.split("-").map(Number);
    const cleaningDate = new Date(year, month - 1, day, 12, 0, 0);
    if (process.env.NODE_ENV !== "production") console.log("📅 Data pulizia creata:", cleaningDate.toISOString());

    // 🔴 CHECK DUPLICATI: Verifica se esiste già pulizia/ordine per questa proprietà e data
    // Helper per verificare se una data è nello stesso giorno
    const isSameDay = (date1: Date, date2: Date) => {
      return date1.getFullYear() === date2.getFullYear() &&
             date1.getMonth() === date2.getMonth() &&
             date1.getDate() === date2.getDate();
    };
    
    // Check pulizie esistenti (solo se non è richiesta solo biancheria)
    if (!linenOnly) {
      const existingCleaningsQuery = adminDb.collection("cleanings").where("propertyId", "==", propertyId);
      const existingCleaningsSnap = await existingCleaningsQuery.get();
      
      // Filtra in memoria per la data specifica
      const cleaningsOnSameDay = existingCleaningsSnap.docs.filter(doc => {
        const data = doc.data() as Record<string, any>;
        const docDate = data.scheduledDate?.toDate?.();
        return docDate && isSameDay(docDate, cleaningDate);
      });
      
      if (cleaningsOnSameDay.length > 0) {
        const existingCleaning = cleaningsOnSameDay[0];
        const existingData = existingCleaning.data() as Record<string, any>;
        
        return NextResponse.json({
          error: "DUPLICATE_CLEANING",
          message: `Esiste già una pulizia programmata per "${property.name}" in questa data.`,
          existingId: existingCleaning.id,
          existingType: "cleaning",
          existingStatus: existingData.status,
          existingTime: existingData.scheduledTime,
          propertyName: property.name,
          date: scheduledDate,
        }, { status: 409 });
      }
    }
    
    // Check ordini biancheria esistenti (se si sta creando solo biancheria)
    if (linenOnly) {
      const existingOrdersQuery = adminDb.collection("orders").where("propertyId", "==", propertyId);
      const existingOrdersSnap = await existingOrdersQuery.get();
      
      // Filtra in memoria per la data specifica
      const ordersOnSameDay = existingOrdersSnap.docs.filter(doc => {
        const data = doc.data() as Record<string, any>;
        const docDate = data.scheduledDate?.toDate?.();
        return docDate && isSameDay(docDate, cleaningDate);
      });
      
      if (ordersOnSameDay.length > 0) {
        const existingOrder = ordersOnSameDay[0];
        const existingData = existingOrder.data() as Record<string, any>;
        
        return NextResponse.json({
          error: "DUPLICATE_ORDER",
          message: `Esiste già un ordine biancheria per "${property.name}" in questa data.`,
          existingId: existingOrder.id,
          existingType: "order",
          existingStatus: existingData.status,
          propertyName: property.name,
          date: scheduledDate,
        }, { status: 409 });
      }
    }

    // 🔴 CONTROLLO CRITICO: Se la proprietà usa biancheria propria, non creare ordini biancheria
    const usesOwnLinen = property.usesOwnLinen === true;
    if (usesOwnLinen) {
    }

    // Calcola articoli da ritirare (se ritiro attivo E proprietà NON usa biancheria propria)
    let pickupData = { pickupItems: [] as unknown[], pickupFromOrders: [] as string[] };
    if (includePickup && !usesOwnLinen) {
      // @ts-expect-error TODO-FIX: TS2345 Argument of type '{}' is not assignable to parameter of type 'string'.
      pickupData = await calculatePickupItems(propertyId);
    }

    // Prepara gli items per l'ordine biancheria (solo se NON usa biancheria propria)
    let linenItems: { id: string; name: string; quantity: number; price?: number; categoryId?: string }[] = [];
    
    // 🔥 FIX: Usa customLinenItems SOLO se createLinenOrder è true (o linenOnly)
    // @ts-expect-error TODO-FIX: TS2339 Property 'length' does not exist on type '{}'.
    if ((createLinenOrder || linenOnly) && customLinenItems && customLinenItems.length > 0) {
      // Usa items personalizzati dal frontend - carica categorie dall'inventario
      const inventoryData = await loadInventoryData();
      // @ts-expect-error TODO-FIX: TS2339 Property 'map' does not exist on type '{}'.
      linenItems = customLinenItems.map((item: LinenItem) => {
        // @ts-expect-error TODO-FIX: TS2345 Argument of type 'string | undefined' is not assignable to parameter of type 'st...
        const invData = inventoryData.get(item.id);
        return {
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          price: item.price || 0,
          categoryId: invData?.categoryId || item.categoryId || "",
        };
      });
    } else if (createLinenOrder || linenOnly) {
      // Usa serviceConfigs della proprietà se esistono
      // @ts-expect-error TODO-FIX: TS2339 Property 'serviceConfigs' does not exist on type 'Property'.
      const serviceConfigs = property.serviceConfigs as Record<number, any> | undefined;
      // @ts-expect-error TODO-FIX: TS2538 Type '{}' cannot be used as an index type.
      if (serviceConfigs && serviceConfigs[guestsCount]) {
        // @ts-expect-error TODO-FIX: TS2538 Type '{}' cannot be used as an index type.
        const config = serviceConfigs[guestsCount];
        
        // 📦 Carica i dati degli articoli dall'inventario (nome + categoria + prezzo)
        const inventoryData = await loadInventoryData();
        
        // Helper per ottenere nome, categoria e prezzo
        const getItemData = (itemId: string) => {
          const data = inventoryData.get(itemId);
          return {
            name: data?.name || itemId,
            categoryId: data?.categoryId || "",
            sellPrice: data?.sellPrice || 0  // 🔥 AGGIUNTO: prezzo
          };
        };
        
        // 🔧 FIX: Biancheria letto - USA SEMPRE 'all' SE PRESENTE
        if (config.bl) {
          const hasAll = config.bl['all'] && typeof config.bl['all'] === 'object' && Object.keys(config.bl['all']).length > 0;
          
          if (hasAll) {
            // USA SOLO 'all' - contiene i totali configurati dall'utente
            Object.entries(config.bl['all'] as Record<string, number>).forEach(([itemId, qty]) => {
              if (qty > 0) {
                const itemData = getItemData(itemId);
                linenItems.push({ 
                  id: itemId, 
                  name: itemData.name, 
                  quantity: qty,
                  price: itemData.sellPrice,
                  categoryId: itemData.categoryId || "biancheria_letto"
                });
              }
            });
          } else {
            // Fallback: somma da gruppi letto (escludendo 'all')
            Object.entries(config.bl).forEach(([bedId, items]) => {
              if (bedId !== 'all' && typeof items === 'object') {
                Object.entries(items as Record<string, number>).forEach(([itemId, qty]) => {
                  if (qty > 0) {
                    // Evita duplicati sommando quantità
                    const existing = linenItems.find(i => i.id === itemId);
                    if (existing) {
                      existing.quantity += qty;
                    } else {
                      const itemData = getItemData(itemId);
                      linenItems.push({ 
                        id: itemId, 
                        name: itemData.name, 
                        quantity: qty,
                        price: itemData.sellPrice,
                        categoryId: itemData.categoryId || "biancheria_letto"
                      });
                    }
                  }
                });
              }
            });
          }
        }
        
        // Biancheria bagno
        if (config.ba) {
          Object.entries(config.ba).forEach(([itemId, qty]) => {
            if ((qty as number) > 0) {
              const itemData = getItemData(itemId);
              linenItems.push({ 
                id: itemId, 
                name: itemData.name, 
                quantity: qty as number,
                price: itemData.sellPrice,  // 🔥 AGGIUNTO: prezzo
                categoryId: itemData.categoryId || "biancheria_bagno"
              });
            }
          });
        }
        
        // Kit cortesia
        if (config.ki) {
          Object.entries(config.ki).forEach(([itemId, qty]) => {
            if ((qty as number) > 0) {
              const itemData = getItemData(itemId);
              linenItems.push({ 
                id: itemId, 
                name: itemData.name, 
                quantity: qty as number,
                price: itemData.sellPrice,  // 🔥 AGGIUNTO: prezzo
                categoryId: itemData.categoryId || "kit_cortesia"
              });
            }
          });
        }
      }
    }

    // Se richiesta solo biancheria (senza pulizia)
    if (linenOnly) {
      // 🔴 BLOCCO: Se usa biancheria propria, non permettere ordini solo biancheria
      if (usesOwnLinen) {
        return NextResponse.json({ 
          error: "Questa proprietà usa biancheria propria. Non è possibile creare ordini biancheria.",
          usesOwnLinen: true 
        }, { status: 400 });
      }
      
      if (linenItems.length === 0) {
        return NextResponse.json({ error: "Nessun articolo selezionato" }, { status: 400 });
      }

      const orderId = await createOrder({
        // @ts-expect-error TODO-FIX: TS2322 Type '{}' is not assignable to type 'string'.
        propertyId,
        propertyName: property.name,
        propertyAddress: property.address,
        propertyCity: property.city || "",
        propertyPostalCode: property.postalCode || "",
        propertyFloor: property.floor || "",
        propertyApartment: property.apartment || "",
        propertyIntercom: property.intercom || "",
        propertyDoorCode: property.doorCode || "",
        propertyKeysLocation: property.keysLocation || "",
        propertyAccessNotes: property.accessNotes || "",
        ...(property.images ? { propertyImages: property.images } : {}),
        status: "PENDING",
        type: "LINEN",
        // @ts-expect-error TODO-FIX: TS2741 Property 'toJSON' is missing in type 'FirebaseFirestore.Timestamp' but required ...
        scheduledDate: Timestamp.fromDate(cleaningDate),
        // @ts-expect-error TODO-FIX: TS2322 Type '{}' is not assignable to type 'string'.
        scheduledTime: scheduledTime || "10:00", // Ora consegna indicativa
        // @ts-expect-error TODO-FIX: TS2322 Type '{}' is not assignable to type '"normal" | "urgent" | undefined'.
        urgency: urgency || "normal",
        items: linenItems,
        // 💰 Costo consegna biancheria standalone (€10)
        deliveryFee: applyDeliveryFee ? 10 : 0,
        // @ts-expect-error TODO-FIX: TS2322 Type 'unknown' is not assignable to type 'boolean | undefined'.
        deliveryFeeEnabled: applyDeliveryFee,
        // Ritiro biancheria sporca
        // @ts-expect-error TODO-FIX: TS2322 Type 'unknown' is not assignable to type 'boolean | undefined'.
        includePickup: includePickup,
        // @ts-expect-error TODO-FIX: TS2322 Type 'unknown[]' is not assignable to type '{ id: string; name: string; quantity...
        pickupItems: includePickup ? pickupData.pickupItems : [],
        pickupFromOrders: includePickup ? pickupData.pickupFromOrders : [],
        pickupCompleted: false,
        // @ts-expect-error TODO-FIX: TS2322 Type '{}' is not assignable to type 'string'.
        notes: notes || "",
      });

      // 🔔 Notifica tutti i rider per nuova consegna
      await notifyAllRiders(property, orderId, urgency === "urgent");

      return NextResponse.json({
        success: true,
        orderId,
        pickupItemsCount: pickupData.pickupItems.length,
        message: urgency === "urgent" 
          ? "Ordine biancheria URGENTE creato - Notifica inviata ai rider"
          : "Ordine biancheria creato con successo",
      });
    }

    // Crea la pulizia
    const cleaningData: Record<string, any> = {
      propertyId,
      propertyName: property.name,
      propertyAddress: property.address,
      scheduledDate: Timestamp.fromDate(cleaningDate),
      scheduledTime: scheduledTime || "10:00",
      guestsCount: guestsCount,
      guestsConfirmed: true, // Ospiti inseriti manualmente = confermati
      status: "SCHEDULED",
      type: type,
      notes: notes || "",
      price: cleaningPrice || property.cleaningPrice || 0,
      // 🔥 FIX: Salva se la pulizia ha un ordine biancheria collegato
      hasLinenOrder: createLinenOrder && !usesOwnLinen,
      // 🆕 FIX: Salva flag biancheria personalizzata
      linenConfigModified: linenConfigModified,
    };
    
    // 🆕 Se biancheria personalizzata, salva anche la configurazione
    // @ts-expect-error TODO-FIX: TS2339 Property 'length' does not exist on type '{}'.
    if (linenConfigModified && customLinenItems && customLinenItems.length > 0) {
      // Carica inventario per sapere la categoria di ogni item
      const inventoryData = await loadInventoryData();
      
      // Separa items per categoria
      const blAll: Record<string, number> = {};  // Biancheria letto
      const ba: Record<string, number> = {};     // Biancheria bagno
      const ki: Record<string, number> = {};     // Kit cortesia
      
      // @ts-expect-error TODO-FIX: TS2339 Property 'forEach' does not exist on type '{}'.
      customLinenItems.forEach((item: LinenItem) => {
        // @ts-expect-error TODO-FIX: TS18048 'item.quantity' is possibly 'undefined'.
        if (item.id && item.quantity > 0) {
          const invItem = inventoryData.get(item.id);
          const category = invItem?.categoryId || '';
          
          if (category === 'biancheria_bagno') {
            // @ts-expect-error TODO-FIX: TS2322 Type 'number | undefined' is not assignable to type 'number'.
            ba[item.id] = item.quantity;
          } else if (category === 'kit_cortesia') {
            // @ts-expect-error TODO-FIX: TS2322 Type 'number | undefined' is not assignable to type 'number'.
            ki[item.id] = item.quantity;
          } else {
            // Default: biancheria letto (o categoria sconosciuta)
            // @ts-expect-error TODO-FIX: TS2322 Type 'number | undefined' is not assignable to type 'number'.
            blAll[item.id] = item.quantity;
          }
        }
      });
      
      cleaningData.customLinenConfig = {
        beds: selectedBedIds || [],  // 🆕 Usa i letti selezionati dal frontend
        bl: { 'all': blAll },
        ba: ba,
        ki: ki,
        ex: {}
      };
      if (process.env.NODE_ENV !== "production") console.log("📦 Salvata customLinenConfig:", JSON.stringify(cleaningData.customLinenConfig));
    }
    
    if (process.env.NODE_ENV !== "production") console.log("📝 Dati pulizia da salvare:", JSON.stringify(cleaningData, null, 2));
    
    // @ts-expect-error TODO-FIX: TS2345 Argument of type 'Record<string, any>' is not assignable to parameter of type 'O...
    const cleaningId = await createCleaning(cleaningData);

    let orderId: string | undefined;

    // Se richiesto, crea l'ordine biancheria per il rider
    // 🔴 MA SOLO SE la proprietà NON usa biancheria propria
    if (createLinenOrder && linenItems.length > 0 && !usesOwnLinen) {
      orderId = await createOrder({
        cleaningId,
        // @ts-expect-error TODO-FIX: TS2322 Type '{}' is not assignable to type 'string'.
        propertyId,
        propertyName: property.name,
        propertyAddress: property.address,
        propertyCity: property.city || "",
        propertyPostalCode: property.postalCode || "",
        propertyFloor: property.floor || "",
        propertyApartment: property.apartment || "",
        propertyIntercom: property.intercom || "",
        propertyDoorCode: property.doorCode || "",
        propertyKeysLocation: property.keysLocation || "",
        propertyAccessNotes: property.accessNotes || "",
        ...(property.images ? { propertyImages: property.images } : {}),
        status: "PENDING",
        type: "LINEN",
        // @ts-expect-error TODO-FIX: TS2741 Property 'toJSON' is missing in type 'FirebaseFirestore.Timestamp' but required ...
        scheduledDate: Timestamp.fromDate(cleaningDate),
        // @ts-expect-error TODO-FIX: TS2322 Type '{}' is not assignable to type 'string'.
        scheduledTime: scheduledTime || "10:00",
        // @ts-expect-error TODO-FIX: TS2322 Type '{}' is not assignable to type '"normal" | "urgent" | undefined'.
        urgency: urgency || "normal",
        items: linenItems,
        // Ritiro biancheria sporca
        // @ts-expect-error TODO-FIX: TS2322 Type 'unknown' is not assignable to type 'boolean | undefined'.
        includePickup: includePickup,
        // @ts-expect-error TODO-FIX: TS2322 Type 'unknown[]' is not assignable to type '{ id: string; name: string; quantity...
        pickupItems: includePickup ? pickupData.pickupItems : [],
        pickupFromOrders: includePickup ? pickupData.pickupFromOrders : [],
        pickupCompleted: false,
        // @ts-expect-error TODO-FIX: TS2322 Type '{}' is not assignable to type 'string'.
        notes: notes || "",
      });

      // 🔧 FIX: Salva orderId nella pulizia per collegamento bidirezionale
      if (orderId && cleaningId) {
        try {
          const cleaningRef = adminDb.collection("cleanings").doc(cleaningId);
          await cleaningRef.update({ 
            laundryOrderId: orderId,
            updatedAt: Timestamp.now()
          });
        } catch (linkError) {
          console.error("⚠️ Errore collegamento pulizia-ordine:", linkError);
        }
      }

      // 🔔 Notifica tutti i rider per nuova consegna
      await notifyAllRiders(property, orderId, urgency === "urgent");
    } else if (usesOwnLinen) {
      if (process.env.NODE_ENV !== "production") console.log("ℹ️ Ordine biancheria NON creato - proprietà usa biancheria propria");
    }

    return NextResponse.json({
      success: true,
      cleaningId,
      orderId,
      usesOwnLinen, // 🔴 Informa il frontend
      pickupItemsCount: pickupData.pickupItems.length,
      message: usesOwnLinen 
        ? "Pulizia creata (biancheria propria - nessun ordine)"
        : (orderId 
          ? (urgency === "urgent" 
              ? "Pulizia e ordine biancheria URGENTE creati - Notifica inviata ai rider"
              : "Pulizia e ordine biancheria creati con successo")
          : "Pulizia creata con successo"),
    });

  } catch (error) {
    console.error("❌ Errore creazione pulizia manuale:", error);
    return NextResponse.json(
      { error: "Errore nella creazione" },
      { status: 500 }
    );
  }
}

/**
 * Invia notifica a tutti i rider attivi
 */
async function notifyAllRiders(property: PropertyRef, orderId: string, isUrgent: boolean = false) {
  try {
    const usersRef = adminDb.collection("users");
    const ridersQuery = usersRef.where("role", "==", "RIDER");
    const ridersSnap = await ridersQuery.get();

    let notificationsSent = 0;

    for (const riderDoc of ridersSnap.docs) {
      try {
        await createNotification({
          title: isUrgent ? "🚨 ORDINE URGENTE" : "📦 Nuova Consegna",
          message: isUrgent 
            ? `Consegna urgente: ${property.name}${property.address ? ` - ${property.address}` : ""}`
            : `Nuova consegna: ${property.name}${property.address ? ` - ${property.address}` : ""}`,
          type: isUrgent ? "WARNING" : "LAUNDRY_NEW",
          recipientRole: "RIDER",
          recipientId: riderDoc.id,
          senderId: "system",
          senderName: "Sistema",
          relatedEntityId: orderId,
          relatedEntityType: "CLEANING",
          relatedEntityName: property.name,
          link: `/rider`,
        });
        notificationsSent++;
      } catch (e) {
        console.error(`Errore notifica rider ${riderDoc.id}:`, e);
      }
    }
  } catch (error) {
    console.error("❌ Errore invio notifiche rider:", error);
  }
}
