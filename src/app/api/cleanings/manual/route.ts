import { NextResponse } from "next/server";
import { createCleaning, createOrder, getPropertyById } from "~/lib/firebase/firestore-data";
import { Timestamp, collection, getDocs, query, where, orderBy, doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { createNotification } from "~/lib/firebase/notifications";
import { cookies } from "next/headers";

// ═══════════════════════════════════════════════════════════════
// HELPER: Get current user from cookie
// ═══════════════════════════════════════════════════════════════
async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) {
      return JSON.parse(decodeURIComponent(userCookie.value));
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Carica gli articoli dall'inventario
 * Restituisce una mappa itemId -> { name, categoryId }
 */
async function loadInventoryData(): Promise<Map<string, { name: string; categoryId: string }>> {
  const dataMap = new Map<string, { name: string; categoryId: string }>();
  try {
    const snapshot = await getDocs(collection(db, "inventory"));
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const itemData = {
        name: data.name || doc.id,
        categoryId: data.categoryId || ""
      };
      dataMap.set(doc.id, itemData);
      if (data.key) {
        dataMap.set(data.key, itemData);
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
 */
async function calculatePickupItems(propertyId: string): Promise<{
  pickupItems: { id: string; name: string; quantity: number }[];
  pickupFromOrders: string[];
}> {
  try {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`📥 CALCOLO RITIRO per proprietà: ${propertyId}`);
    console.log(`${"=".repeat(60)}`);
    
    const inventorySnap = await getDocs(collection(db, "inventory"));
    const inventoryMap = new Map<string, { name: string; categoryId: string }>();
    
    inventorySnap.docs.forEach(doc => {
      const data = doc.data();
      const itemData = {
        name: data.name || doc.id,
        categoryId: data.categoryId || ""
      };
      inventoryMap.set(doc.id, itemData);
      if (data.key) {
        inventoryMap.set(data.key, itemData);
      }
    });
    
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
    
    const isBiancheria = (item: any, invItem: any): { result: boolean; reason: string } => {
      const categoryId = invItem?.categoryId || item.categoryId || "";
      const itemName = (invItem?.name || item.name || "").toLowerCase();
      const itemType = (item.type || "").toLowerCase();
      
      if (itemType === "cleaning_product" || itemType === "kit_cortesia") {
        return { result: false, reason: `tipo escluso: ${itemType}` };
      }
      if (EXCLUDE_CATEGORIES.includes(categoryId)) {
        return { result: false, reason: `categoria esclusa: ${categoryId}` };
      }
      if (EXCLUDE_KEYWORDS.some(kw => itemName.includes(kw))) {
        return { result: false, reason: `nome escluso: ${itemName}` };
      }
      if (PICKUP_CATEGORIES.includes(categoryId)) {
        return { result: true, reason: `categoria biancheria: ${categoryId}` };
      }
      if (LINEN_KEYWORDS.some(kw => itemName.includes(kw))) {
        return { result: true, reason: `nome biancheria: ${itemName}` };
      }
      if (!categoryId) {
        return { result: true, reason: `default incluso (no categoria): ${itemName}` };
      }
      return { result: false, reason: `categoria non biancheria: ${categoryId}` };
    };
    
    const ordersRef = collection(db, "orders");
    const ordersQuery = query(
      ordersRef,
      where("propertyId", "==", propertyId),
      where("status", "==", "DELIVERED")
    );
    
    const snapshot = await getDocs(ordersQuery);
    const pendingPickupOrders = snapshot.docs.filter(doc => {
      const data = doc.data();
      return data.pickupCompleted !== true;
    });
    
    if (pendingPickupOrders.length === 0) {
      return { pickupItems: [], pickupFromOrders: [] };
    }
    
    const itemsMap = new Map<string, { id: string; name: string; quantity: number }>();
    const orderIds: string[] = [];
    
    for (const doc of pendingPickupOrders) {
      const data = doc.data();
      orderIds.push(doc.id);
      
      if (data.items && Array.isArray(data.items)) {
        for (const item of data.items) {
          const invItem = inventoryMap.get(item.id);
          const check = isBiancheria(item, invItem);
          
          if (!check.result) continue;
          
          const itemKey = item.id || item.name;
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
    
    console.log(`📥 RISULTATO RITIRO: ${pickupItems.length} articoli da ${orderIds.length} ordini`);
    
    return { pickupItems, pickupFromOrders: orderIds };
  } catch (error) {
    console.error("❌ Errore calcolo pickupItems:", error);
    return { pickupItems: [], pickupFromOrders: [] };
  }
}

// ═══════════════════════════════════════════════════════════════
// POST - Crea pulizia manuale
// ═══════════════════════════════════════════════════════════════
export async function POST(request: Request) {
  try {
    const currentUser = await getFirebaseUser();
    const body = await request.json();
    const { 
      propertyId, 
      scheduledDate, 
      scheduledTime,
      guestsCount,
      notes,
      type = "MANUAL",
      createLinenOrder = true,
      linenOnly = false,
      customLinenItems,
      cleaningPrice,
      linenPrice,
      totalPrice,
      urgency = "normal",
      includePickup = true,
      // ═══════════════════════════════════════════════════════════════
      // NUOVI CAMPI PER TIPO SERVIZIO
      // ═══════════════════════════════════════════════════════════════
      serviceType = "STANDARD",
      serviceTypeName = "Pulizia Standard",
      sgrossoReason = null,
      sgrossoReasonLabel = null,
      sgrossoNotes = null,
      priceModified = false,
      requestedByRole = "ADMIN",
      isPendingApproval = false,
    } = body;

    console.log("📥 Richiesta creazione pulizia:", { 
      propertyId, 
      scheduledDate, 
      guestsCount, 
      type,
      serviceType,
      isPendingApproval,
      requestedByRole,
      urgency, 
      includePickup 
    });

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

    // Crea la data corretta
    const [year, month, day] = scheduledDate.split("-").map(Number);
    const cleaningDate = new Date(year, month - 1, day, 12, 0, 0);
    console.log("📅 Data pulizia creata:", cleaningDate.toISOString());

    // Helper per verificare se una data è nello stesso giorno
    const isSameDay = (date1: Date, date2: Date) => {
      return date1.getFullYear() === date2.getFullYear() &&
             date1.getMonth() === date2.getMonth() &&
             date1.getDate() === date2.getDate();
    };
    
    // Check pulizie esistenti
    if (!linenOnly) {
      const existingCleaningsQuery = query(
        collection(db, "cleanings"),
        where("propertyId", "==", propertyId)
      );
      const existingCleaningsSnap = await getDocs(existingCleaningsQuery);
      
      const cleaningsOnSameDay = existingCleaningsSnap.docs.filter(doc => {
        const data = doc.data();
        const docDate = data.scheduledDate?.toDate?.();
        return docDate && isSameDay(docDate, cleaningDate);
      });
      
      if (cleaningsOnSameDay.length > 0) {
        const existingCleaning = cleaningsOnSameDay[0];
        const existingData = existingCleaning.data();
        
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
    
    // Check ordini biancheria esistenti
    if (linenOnly) {
      const existingOrdersQuery = query(
        collection(db, "orders"),
        where("propertyId", "==", propertyId)
      );
      const existingOrdersSnap = await getDocs(existingOrdersQuery);
      
      const ordersOnSameDay = existingOrdersSnap.docs.filter(doc => {
        const data = doc.data();
        const docDate = data.scheduledDate?.toDate?.();
        return docDate && isSameDay(docDate, cleaningDate);
      });
      
      if (ordersOnSameDay.length > 0) {
        const existingOrder = ordersOnSameDay[0];
        const existingData = existingOrder.data();
        
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

    const usesOwnLinen = property.usesOwnLinen === true;
    if (usesOwnLinen) {
      console.log("🏠 Proprietà usa biancheria propria - ordine biancheria NON verrà creato");
    }

    // Calcola articoli da ritirare (se non è pending approval)
    let pickupData = { pickupItems: [] as any[], pickupFromOrders: [] as string[] };
    if (includePickup && !usesOwnLinen && !isPendingApproval) {
      pickupData = await calculatePickupItems(propertyId);
    }

    // Prepara gli items per l'ordine biancheria
    let linenItems: { id: string; name: string; quantity: number; price?: number; categoryId?: string }[] = [];
    
    if (customLinenItems && customLinenItems.length > 0) {
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
    } else if ((createLinenOrder || linenOnly) && !isPendingApproval) {
      const serviceConfigs = property.serviceConfigs as Record<number, any> | undefined;
      if (serviceConfigs && serviceConfigs[guestsCount]) {
        const config = serviceConfigs[guestsCount];
        const inventoryData = await loadInventoryData();
        
        const getItemData = (itemId: string) => {
          const data = inventoryData.get(itemId);
          return {
            name: data?.name || itemId,
            categoryId: data?.categoryId || ""
          };
        };
        
        if (config.bl) {
          Object.entries(config.bl).forEach(([bedId, items]) => {
            if (typeof items === 'object') {
              Object.entries(items as Record<string, number>).forEach(([itemId, qty]) => {
                if (qty > 0) {
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
        scheduledTime: scheduledTime || "10:00",
        urgency: urgency || "normal",
        items: linenItems,
        includePickup: includePickup,
        pickupItems: includePickup ? pickupData.pickupItems : [],
        pickupFromOrders: includePickup ? pickupData.pickupFromOrders : [],
        pickupCompleted: false,
        notes: notes || "",
      });

      console.log("✅ Ordine biancheria creato:", orderId);

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

    // ═══════════════════════════════════════════════════════════════
    // CREA LA PULIZIA CON LOGICA TIPO SERVIZIO
    // ═══════════════════════════════════════════════════════════════
    
    // Determina lo stato in base al tipo servizio e chi richiede
    // - Sgrosso da Proprietario → PENDING_APPROVAL
    // - Tutto il resto → SCHEDULED
    const cleaningStatus = isPendingApproval ? "PENDING_APPROVAL" : "SCHEDULED";
    
    // Prezzo effettivo
    // - Se pending approval, prezzo = 0 (verrà definito dall'admin)
    // - Altrimenti usa il prezzo fornito
    const effectivePrice = isPendingApproval ? 0 : (cleaningPrice || property.cleaningPrice || 0);
    
    const cleaningData: any = {
      propertyId,
      propertyName: property.name,
      propertyAddress: property.address,
      scheduledDate: Timestamp.fromDate(cleaningDate),
      scheduledTime: scheduledTime || "10:00",
      guestsCount: guestsCount,
      status: cleaningStatus,
      type: type,
      notes: notes || "",
      price: effectivePrice,
      // ⭐ NUOVI CAMPI TIPO SERVIZIO
      serviceType: serviceType,
      serviceTypeName: serviceTypeName,
      priceModified: priceModified,
      // Campi per tracking richiesta
      requestedByRole: requestedByRole,
      requestedById: currentUser?.id || null,
      requestedByName: currentUser?.name || currentUser?.email || "Sistema",
      createdAt: Timestamp.now(),
    };
    
    // Aggiungi campi sgrosso se presenti
    if (serviceType === "SGROSSO") {
      cleaningData.sgrossoReason = sgrossoReason;
      cleaningData.sgrossoReasonLabel = sgrossoReasonLabel;
      cleaningData.sgrossoNotes = sgrossoNotes || "";
    }
    
    // Se è pending approval, aggiungi campi specifici
    if (isPendingApproval) {
      cleaningData.pendingApprovalAt = Timestamp.now();
      cleaningData.pendingApprovalReason = `Richiesta ${serviceTypeName} da ${requestedByRole}`;
    }
    
    const cleaningId = await createCleaning(cleaningData);

    console.log(`✅ Pulizia creata: ${cleaningId} (status: ${cleaningStatus}, tipo: ${serviceType})`);

    let orderId: string | undefined;

    // Crea ordine biancheria SOLO se:
    // - Non è una richiesta pending approval
    // - createLinenOrder è true
    // - Ci sono items
    // - La proprietà non usa biancheria propria
    if (!isPendingApproval && createLinenOrder && linenItems.length > 0 && !usesOwnLinen) {
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
        includePickup: includePickup,
        pickupItems: includePickup ? pickupData.pickupItems : [],
        pickupFromOrders: includePickup ? pickupData.pickupFromOrders : [],
        pickupCompleted: false,
        notes: notes || "",
      });
      console.log("✅ Ordine biancheria creato:", orderId);

      // Collega ordine alla pulizia
      if (orderId && cleaningId) {
        try {
          const cleaningRef = doc(db, "cleanings", cleaningId);
          await updateDoc(cleaningRef, { 
            laundryOrderId: orderId,
            updatedAt: Timestamp.now()
          });
        } catch (linkError) {
          console.error("⚠️ Errore collegamento pulizia-ordine:", linkError);
        }
      }

      await notifyAllRiders(property, orderId, urgency === "urgent");
    } else if (usesOwnLinen) {
      console.log("ℹ️ Ordine biancheria NON creato - proprietà usa biancheria propria");
    }

    // ═══════════════════════════════════════════════════════════════
    // NOTIFICHE
    // ═══════════════════════════════════════════════════════════════
    
    // Se è una richiesta pending approval, notifica gli admin
    if (isPendingApproval) {
      await notifyAdminsForApproval(property, cleaningId, serviceTypeName, sgrossoReasonLabel || sgrossoReason);
    }

    // Messaggio di risposta
    let message = "";
    if (isPendingApproval) {
      message = `Richiesta ${serviceTypeName} inviata - In attesa di approvazione admin`;
    } else if (usesOwnLinen) {
      message = "Pulizia creata (biancheria propria - nessun ordine)";
    } else if (orderId) {
      message = urgency === "urgent" 
        ? "Pulizia e ordine biancheria URGENTE creati - Notifica inviata ai rider"
        : "Pulizia e ordine biancheria creati con successo";
    } else {
      message = "Pulizia creata con successo";
    }

    return NextResponse.json({
      success: true,
      cleaningId,
      orderId,
      usesOwnLinen,
      isPendingApproval,
      pickupItemsCount: pickupData.pickupItems.length,
      message,
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

/**
 * ⭐ NUOVO: Notifica tutti gli admin per richiesta approvazione
 */
async function notifyAdminsForApproval(property: any, cleaningId: string, serviceTypeName: string, reason: string | null) {
  try {
    const usersRef = collection(db, "users");
    const adminsQuery = query(usersRef, where("role", "==", "ADMIN"));
    const adminsSnap = await getDocs(adminsQuery);

    let notificationsSent = 0;

    for (const adminDoc of adminsSnap.docs) {
      try {
        await createNotification({
          title: "🔔 Richiesta Approvazione",
          message: `Nuova richiesta ${serviceTypeName} per "${property.name}"${reason ? ` - Motivo: ${reason}` : ""}`,
          type: "APPROVAL_REQUEST",
          recipientRole: "ADMIN",
          recipientId: adminDoc.id,
          senderId: "system",
          senderName: "Sistema",
          relatedEntityId: cleaningId,
          relatedEntityType: "CLEANING",
          relatedEntityName: property.name,
          link: `/dashboard?highlight=${cleaningId}&tab=pending`,
        });
        notificationsSent++;
      } catch (e) {
        console.error(`Errore notifica admin ${adminDoc.id}:`, e);
      }
    }

    console.log(`🔔 Notifiche approvazione inviate a ${notificationsSent} admin`);
  } catch (error) {
    console.error("❌ Errore invio notifiche admin:", error);
  }
}
