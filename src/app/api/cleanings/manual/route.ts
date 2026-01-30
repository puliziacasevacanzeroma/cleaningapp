import { NextResponse } from "next/server";
import { createCleaning, createOrder, getPropertyById } from "~/lib/firebase/firestore-data";
import { Timestamp, collection, getDocs, query, where, orderBy, doc, getDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { createNotification } from "~/lib/firebase/notifications";

/**
 * Carica gli articoli dall'inventario
 * Restituisce una mappa itemId -> { name, categoryId }
 */
async function loadInventoryData(): Promise<Map<string, { name: string; categoryId: string }>> {
  const dataMap = new Map<string, { name: string; categoryId: string }>();
  try {
    // Collezione corretta è "inventory", non "inventoryItems"
    const snapshot = await getDocs(collection(db, "inventory"));
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const itemData = {
        name: data.name || doc.id,
        categoryId: data.categoryId || ""
      };
      // 🔥 FIX: Indicizza sia per doc.id che per key
      dataMap.set(doc.id, itemData);  // es: "item_doubleSheets"
      if (data.key) {
        dataMap.set(data.key, itemData);  // es: "doubleSheets"
      }
    });
    console.log(`📦 Inventario caricato: ${dataMap.size} voci (${snapshot.docs.length} articoli)`);
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
    console.log(`\n${"=".repeat(60)}`);
    console.log(`📥 CALCOLO RITIRO per proprietà: ${propertyId}`);
    console.log(`${"=".repeat(60)}`);
    
    // 1. Carica inventario per sapere la categoria di ogni articolo
    const inventorySnap = await getDocs(collection(db, "inventory"));
    const inventoryMap = new Map<string, { name: string; categoryId: string }>();
    
    inventorySnap.docs.forEach(doc => {
      const data = doc.data();
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
    
    console.log(`📦 Inventario caricato: ${inventoryMap.size} voci`);
    
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
    const isBiancheria = (item: any, invItem: any): { result: boolean; reason: string } => {
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
    const ordersRef = collection(db, "orders");
    const ordersQuery = query(
      ordersRef,
      where("propertyId", "==", propertyId),
      where("status", "==", "DELIVERED")
    );
    
    const snapshot = await getDocs(ordersQuery);
    console.log(`📋 Ordini DELIVERED trovati: ${snapshot.size}`);
    
    // Filtra ordini con pickupCompleted !== true (include false e undefined)
    const pendingPickupOrders = snapshot.docs.filter(doc => {
      const data = doc.data();
      const isPending = data.pickupCompleted !== true;
      console.log(`   - Ordine ${doc.id}: pickupCompleted=${data.pickupCompleted} → ${isPending ? 'DA RITIRARE' : 'GIÀ RITIRATO'}`);
      return isPending;
    });
    
    console.log(`📋 Ordini con pickup pending: ${pendingPickupOrders.length}`);
    
    if (pendingPickupOrders.length === 0) {
      console.log(`⚠️ Nessun ordine da cui ritirare!`);
      return { pickupItems: [], pickupFromOrders: [] };
    }
    
    // 3. Somma tutti gli items di biancheria
    const itemsMap = new Map<string, { id: string; name: string; quantity: number }>();
    const orderIds: string[] = [];
    
    for (const doc of pendingPickupOrders) {
      const data = doc.data();
      orderIds.push(doc.id);
      
      console.log(`\n  📦 Analisi ordine ${doc.id}:`);
      console.log(`     Items: ${data.items?.length || 0}`);
      
      if (data.items && Array.isArray(data.items)) {
        for (const item of data.items) {
          const invItem = inventoryMap.get(item.id);
          const check = isBiancheria(item, invItem);
          
          if (!check.result) {
            console.log(`     ❌ ESCLUSO: ${item.name || item.id} x${item.quantity} (${check.reason})`);
            continue;
          }
          
          console.log(`     ✅ INCLUSO: ${item.name || item.id} x${item.quantity} (${check.reason})`);
          
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
    
    console.log(`\n📥 RISULTATO RITIRO:`);
    console.log(`   Ordini: ${orderIds.length} (${orderIds.join(", ")})`);
    console.log(`   Articoli: ${pickupItems.length}`);
    pickupItems.forEach(item => {
      console.log(`     - ${item.name}: ${item.quantity}`);
    });
    console.log(`${"=".repeat(60)}\n`);
    
    return { pickupItems, pickupFromOrders: orderIds };
  } catch (error) {
    console.error("❌ Errore calcolo pickupItems:", error);
    return { pickupItems: [], pickupFromOrders: [] };
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
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
      cleaningPrice,
      linenPrice,
      totalPrice,
      urgency = "normal", // normal | urgent
      includePickup = true, // Default ON - ritiro biancheria sporca
    } = body;

    console.log("📥 Richiesta creazione pulizia:", { propertyId, scheduledDate, guestsCount, type, urgency, includePickup });

    if (!propertyId) {
      return NextResponse.json({ error: "PropertyId richiesto" }, { status: 400 });
    }

    if (!scheduledDate) {
      return NextResponse.json({ error: "Data richiesta" }, { status: 400 });
    }

    if (!guestsCount || guestsCount <= 0) {
      return NextResponse.json({ error: "Numero ospiti richiesto" }, { status: 400 });
    }

    // Carica la proprietà
    const property = await getPropertyById(propertyId);
    if (!property) {
      return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    }

    // IMPORTANTE: Crea la data corretta (mezzogiorno per evitare problemi timezone)
    const [year, month, day] = scheduledDate.split("-").map(Number);
    const cleaningDate = new Date(year, month - 1, day, 12, 0, 0);
    console.log("📅 Data pulizia creata:", cleaningDate.toISOString());

    // 🔴 CHECK DUPLICATI: Verifica se esiste già pulizia/ordine per questa proprietà e data
    // Helper per verificare se una data è nello stesso giorno
    const isSameDay = (date1: Date, date2: Date) => {
      return date1.getFullYear() === date2.getFullYear() &&
             date1.getMonth() === date2.getMonth() &&
             date1.getDate() === date2.getDate();
    };
    
    // Check pulizie esistenti (solo se non è richiesta solo biancheria)
    if (!linenOnly) {
      const existingCleaningsQuery = query(
        collection(db, "cleanings"),
        where("propertyId", "==", propertyId)
      );
      const existingCleaningsSnap = await getDocs(existingCleaningsQuery);
      
      // Filtra in memoria per la data specifica
      const cleaningsOnSameDay = existingCleaningsSnap.docs.filter(doc => {
        const data = doc.data();
        const docDate = data.scheduledDate?.toDate?.();
        return docDate && isSameDay(docDate, cleaningDate);
      });
      
      if (cleaningsOnSameDay.length > 0) {
        const existingCleaning = cleaningsOnSameDay[0];
        const existingData = existingCleaning.data();
        console.log(`⚠️ Pulizia già esistente per ${property.name} il ${scheduledDate}`);
        
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
      const existingOrdersQuery = query(
        collection(db, "orders"),
        where("propertyId", "==", propertyId)
      );
      const existingOrdersSnap = await getDocs(existingOrdersQuery);
      
      // Filtra in memoria per la data specifica
      const ordersOnSameDay = existingOrdersSnap.docs.filter(doc => {
        const data = doc.data();
        const docDate = data.scheduledDate?.toDate?.();
        return docDate && isSameDay(docDate, cleaningDate);
      });
      
      if (ordersOnSameDay.length > 0) {
        const existingOrder = ordersOnSameDay[0];
        const existingData = existingOrder.data();
        console.log(`⚠️ Ordine biancheria già esistente per ${property.name} il ${scheduledDate}`);
        
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
      console.log("🏠 Proprietà usa biancheria propria - ordine biancheria NON verrà creato");
    }

    // Calcola articoli da ritirare (se ritiro attivo E proprietà NON usa biancheria propria)
    let pickupData = { pickupItems: [] as any[], pickupFromOrders: [] as string[] };
    if (includePickup && !usesOwnLinen) {
      pickupData = await calculatePickupItems(propertyId);
    }

    // Prepara gli items per l'ordine biancheria (solo se NON usa biancheria propria)
    let linenItems: { id: string; name: string; quantity: number; price?: number; categoryId?: string }[] = [];
    
    if (customLinenItems && customLinenItems.length > 0) {
      // Usa items personalizzati dal frontend - carica categorie dall'inventario
      const inventoryData = await loadInventoryData();
      linenItems = customLinenItems.map((item: any) => {
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
      const serviceConfigs = property.serviceConfigs as Record<number, any> | undefined;
      if (serviceConfigs && serviceConfigs[guestsCount]) {
        const config = serviceConfigs[guestsCount];
        
        // 📦 Carica i dati degli articoli dall'inventario (nome + categoria)
        const inventoryData = await loadInventoryData();
        
        // Helper per ottenere nome e categoria
        const getItemData = (itemId: string) => {
          const data = inventoryData.get(itemId);
          return {
            name: data?.name || itemId,
            categoryId: data?.categoryId || ""
          };
        };
        
        // Biancheria letto - cerca sia 'all' che per ogni letto
        if (config.bl) {
          Object.entries(config.bl).forEach(([bedId, items]) => {
            if (typeof items === 'object') {
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
                      categoryId: itemData.categoryId || "biancheria_letto"
                    });
                  }
                }
              });
            }
          });
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
        scheduledDate: Timestamp.fromDate(cleaningDate),
        scheduledTime: scheduledTime || "10:00", // Ora consegna indicativa
        urgency: urgency || "normal",
        items: linenItems,
        // Ritiro biancheria sporca
        includePickup: includePickup,
        pickupItems: includePickup ? pickupData.pickupItems : [],
        pickupFromOrders: includePickup ? pickupData.pickupFromOrders : [],
        pickupCompleted: false,
        notes: notes || "",
      });

      console.log("✅ Ordine biancheria creato:", orderId, includePickup ? `con ${pickupData.pickupItems.length} articoli da ritirare` : "senza ritiro");

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
    const cleaningId = await createCleaning({
      propertyId,
      propertyName: property.name,
      propertyAddress: property.address,
      scheduledDate: Timestamp.fromDate(cleaningDate),
      scheduledTime: scheduledTime || "10:00",
      guestsCount: guestsCount,
      status: "SCHEDULED",
      type: type,
      notes: notes || "",
      price: cleaningPrice || property.cleaningPrice || 0,
    });

    console.log("✅ Pulizia creata:", cleaningId);

    let orderId: string | undefined;

    // Se richiesto, crea l'ordine biancheria per il rider
    // 🔴 MA SOLO SE la proprietà NON usa biancheria propria
    if (createLinenOrder && linenItems.length > 0 && !usesOwnLinen) {
      orderId = await createOrder({
        cleaningId,
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
        scheduledDate: Timestamp.fromDate(cleaningDate),
        scheduledTime: scheduledTime || "10:00",
        urgency: urgency || "normal",
        items: linenItems,
        // Ritiro biancheria sporca
        includePickup: includePickup,
        pickupItems: includePickup ? pickupData.pickupItems : [],
        pickupFromOrders: includePickup ? pickupData.pickupFromOrders : [],
        pickupCompleted: false,
        notes: notes || "",
      });
      console.log("✅ Ordine biancheria creato:", orderId, includePickup ? `con ${pickupData.pickupItems.length} articoli da ritirare` : "senza ritiro");

      // 🔧 FIX: Salva orderId nella pulizia per collegamento bidirezionale
      if (orderId && cleaningId) {
        try {
          const cleaningRef = doc(db, "cleanings", cleaningId);
          await updateDoc(cleaningRef, { 
            laundryOrderId: orderId,
            updatedAt: Timestamp.now()
          });
          console.log("✅ Collegamento pulizia-ordine salvato:", cleaningId, "->", orderId);
        } catch (linkError) {
          console.error("⚠️ Errore collegamento pulizia-ordine:", linkError);
        }
      }

      // 🔔 Notifica tutti i rider per nuova consegna
      await notifyAllRiders(property, orderId, urgency === "urgent");
    } else if (usesOwnLinen) {
      console.log("ℹ️ Ordine biancheria NON creato - proprietà usa biancheria propria");
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
async function notifyAllRiders(property: any, orderId: string, isUrgent: boolean = false) {
  try {
    const usersRef = collection(db, "users");
    const ridersQuery = query(usersRef, where("role", "==", "RIDER"));
    const ridersSnap = await getDocs(ridersQuery);

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

    console.log(`🔔 Notifiche ${isUrgent ? 'URGENTI' : 'normali'} inviate a ${notificationsSent} rider`);
  } catch (error) {
    console.error("❌ Errore invio notifiche rider:", error);
  }
}
