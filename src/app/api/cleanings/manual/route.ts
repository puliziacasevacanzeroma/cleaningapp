import { NextResponse } from "next/server";
import { createCleaning, createOrder, getPropertyById } from "~/lib/firebase/firestore-data-admin";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { createNotification } from "~/lib/firebase/notifications-admin";
import { requireProprietario } from "~/lib/api-auth";
import { validateBody, GenericBodySchema } from "~/lib/validation/schemas";
import { resolveItemDisplayName } from "~/lib/itemNames";
import { buildExpectedItems, healCustomConfig, isDegenerateCustomConfig } from "~/lib/linen/linenCore";

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
    const ordersQuery = ordersRef.where("propertyId", "==", propertyId).where("status", "==", "DELIVERED");
    
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
              name: invItem?.name || resolveItemDisplayName(item.id, item.name),
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
      serviceType = null, // STANDARD | APPROFONDITA | SGROSSO (inviato dal modale)
      serviceTypeName = null,
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
      bedMaking = false, // 🛏️ Preparazione letti
      bedMakingCount = 0,
      bedMakingFee = 0,
      bedMakingBeds = [],
      // 🆕 Dati richiesta Sgrosso (inviati dal modale): prima la route NON li
      // leggeva → motivo perso e nessuna notifica all'admin.
      sgrossoReason = null,
      sgrossoReasonLabel = null,
      sgrossoNotes = null,
      requestedByRole = null,
      isPendingApproval = false,
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

    // 🕐 Deadline: non-admin non possono creare per data X dopo le 20:00 del giorno X-1 (ora Roma)
    if (_user.role?.toUpperCase() !== "ADMIN") {
      const todayRome = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
      const hourRome = parseInt(new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome', hour: 'numeric', hour12: false }), 10);
      const [todY, todM, todD] = todayRome.split('-').map(Number);
      const deadlineDay = new Date(year, month - 1, day - 1);
      const todayDate = new Date(todY, todM - 1, todD);
      if (todayDate > deadlineDay || (todayDate.getTime() === deadlineDay.getTime() && hourRome >= 20)) {
        return NextResponse.json(
          { error: "Il termine per questa data è scaduto (ore 20:00 del giorno precedente)" },
          { status: 400 }
        );
      }
    }

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
      
      // Filtra in memoria per la data specifica.
      // ⚠️ ESCLUDE pulizie CANCELLED: un servizio cancellato non deve bloccare
      // la creazione di un nuovo servizio per la stessa data.
      const cleaningsOnSameDay = existingCleaningsSnap.docs.filter(doc => {
        const data = doc.data() as Record<string, any>;
        const docDate = data.scheduledDate?.toDate?.();
        const status = (data.status || "").toUpperCase();
        // Esclude: CANCELLED (anche "cancelled" lowercase per compatibilità)
        if (status === "CANCELLED") return false;
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
      
      // Filtra in memoria per la data specifica.
      // ⚠️ ESCLUDE ordini CANCELLED: un ordine cancellato non deve bloccare
      // la creazione di un nuovo ordine per la stessa data.
      const ordersOnSameDay = existingOrdersSnap.docs.filter(doc => {
        const data = doc.data() as Record<string, any>;
        const docDate = data.scheduledDate?.toDate?.();
        const status = (data.status || "").toUpperCase();
        if (status === "CANCELLED") return false;
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

      // 🛡️ FIX v2 (caso Trastevere 27/07/2026): se il frontend manda
      // customLinenItems SENZA biancheria letto/bagno (es. solo kit cortesia)
      // per una proprietà a biancheria GESTITA, l'ordine nasceva senza
      // lenzuola e il rider consegnava solo saponette. Il safety-net esistente
      // stava SOLO nel ramo serviceConfigs, non qui. Ora: completo le
      // categorie mancanti (letto e/o bagno) dallo standard della proprietà.
      if (!usesOwnLinen) {
        const catsPresent = new Set(linenItems.map((i) => i.categoryId));
        // doppio check anche per keyword (categoryId può essere "" se il
        // lookup inventario fallisce per lo schema ID)
        const idHas = (kws: string[]) => linenItems.some((i) => kws.some((k) => String(i.id).toLowerCase().includes(k.toLowerCase())));
        const hasBl = catsPresent.has("biancheria_letto") || idHas(["doubleSheets", "singleSheets", "pillowcases", "lenzuol", "federa"]);
        const hasBa = catsPresent.has("biancheria_bagno") || idHas(["towels", "bathmat", "asciugaman", "telo", "tappetin"]);
        if (!hasBl || !hasBa) {
          // @ts-expect-error TODO-FIX: TS2339 Property 'serviceConfigs' does not exist on type 'Property'.
          const svcCfgs = property.serviceConfigs as Record<string | number, any> | undefined;
          const stdCfg = svcCfgs ? (svcCfgs[guestsCount] ?? svcCfgs[String(guestsCount)]) : undefined;
          if (stdCfg) {
            const already = new Set(linenItems.map((i) => i.id));
            buildExpectedItems(stdCfg).forEach((e) => {
              const isMissingCat =
                (e.categoryId === "biancheria_letto" && !hasBl) ||
                (e.categoryId === "biancheria_bagno" && !hasBa);
              if (isMissingCat && !already.has(e.itemId)) {
                const invData = inventoryData.get(e.itemId);
                linenItems.push({
                  id: e.itemId,
                  name: invData?.name || e.itemId,
                  quantity: e.quantity,
                  price: invData?.sellPrice || 0,
                  categoryId: invData?.categoryId || e.categoryId,
                });
              }
            });
            console.warn(`🛡️ [GUARDIA-BIANCHERIA] Proprietà ${propertyId}: customLinenItems senza ${!hasBl ? "letto" : ""}${!hasBl && !hasBa ? "+" : ""}${!hasBa ? "bagno" : ""} → completati dallo standard (${linenItems.length} items totali)`);
          }
        }
      }
    } else if (createLinenOrder || linenOnly) {
      // Usa serviceConfigs della proprietà se esistono
      // @ts-expect-error TODO-FIX: TS2339 Property 'serviceConfigs' does not exist on type 'Property'.
      const serviceConfigs = property.serviceConfigs as Record<string | number, any> | undefined;
      // 🔥 FIX CRITICO: Firestore salva le chiavi come STRINGHE ("2", "6") non numeri (2, 6)
      // serviceConfigs[guestsCount] fallisce sempre → linenItems vuoto → nessun ordine creato!
      const config = serviceConfigs
        ? (serviceConfigs[guestsCount] || serviceConfigs[String(guestsCount)])
        : undefined;
      if (serviceConfigs && config) {
        
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
        
        // 🎯 CENTRALIZZATO: estrazione bl/ba/ki via linenCore (UNICA fonte di verità).
        // Stesso merge di prima; nome/prezzo/categoria risolti da getItemData (invariato).
        buildExpectedItems(config).forEach((e) => {
          const itemData = getItemData(e.itemId);
          linenItems.push({
            id: e.itemId,
            name: itemData.name,
            quantity: e.quantity,
            price: itemData.sellPrice,
            categoryId: itemData.categoryId || e.categoryId,
          });
        });

        // 🛡️ SAFETY NET: Verifica biancheria letto presente quando ha senso
        const LENZ_MATR_IDS = ['doubleSheets', 'item_doubleSheets', 'lenzuola_matrimoniale'];
        const LENZ_SING_IDS = ['singleSheets', 'item_singleSheets', 'lenzuola_singolo'];
        const FEDERE_IDS_CHECK = ['pillowcases', 'item_pillowcases', 'federa'];
        const hasAnyId = (items: typeof linenItems, ids: string[]) => items.some(i => ids.some(k => i.id.toLowerCase().includes(k.toLowerCase())));
        const hasFedere = hasAnyId(linenItems, FEDERE_IDS_CHECK);
        const hasLenzMatr = hasAnyId(linenItems, LENZ_MATR_IDS);
        const hasLenzSing = hasAnyId(linenItems, LENZ_SING_IDS);
        const hasAnyBlItem = hasFedere || hasLenzMatr || hasLenzSing;
        const needsRepair = (hasFedere && !hasLenzMatr && !hasLenzSing) || (linenItems.length > 0 && !hasAnyBlItem);
        if (needsRepair) {
          console.warn(`⚠️ [SAFETY-NET] Proprietà ${propertyId}: lenzuola MANCANTI — inietto fallback`);
          // @ts-expect-error TODO-FIX: property type
          const bedrooms = property.bedrooms || 1;
          const matrimonialiNeeded = Math.min(bedrooms, Math.ceil(guestsCount / 2));
          const singolariNeeded = Math.max(0, guestsCount - matrimonialiNeeded * 2);
          if (matrimonialiNeeded > 0 && !hasLenzMatr) {
            const lenzMatrQty = matrimonialiNeeded * 2;
            const itemData = inventoryData.get('doubleSheets') || inventoryData.get('item_doubleSheets') || inventoryData.get('lenzuola_matrimoniale');
            linenItems.push({ id: 'doubleSheets', name: itemData?.name || 'Lenzuola Matrimoniali', quantity: lenzMatrQty, price: itemData?.sellPrice || 0, categoryId: 'biancheria_letto' });
          }
          if (singolariNeeded > 0 && !hasLenzSing) {
            const lenzSingQty = singolariNeeded * 2;
            const itemData = inventoryData.get('singleSheets') || inventoryData.get('item_singleSheets') || inventoryData.get('lenzuola_singolo');
            linenItems.push({ id: 'singleSheets', name: itemData?.name || 'Lenzuola Singole', quantity: lenzSingQty, price: itemData?.sellPrice || 0, categoryId: 'biancheria_letto' });
          }
          if (!hasFedere) {
            const federeQty = guestsCount; // minimo 1 per ospite
            const itemData = inventoryData.get('pillowcases') || inventoryData.get('item_pillowcases') || inventoryData.get('federa');
            linenItems.push({ id: 'pillowcases', name: itemData?.name || 'Federe', quantity: federeQty, price: itemData?.sellPrice || 0, categoryId: 'biancheria_letto' });
          }
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
        // 🛏️ Preparazione letti
        bedMaking: bedMaking || false,
        bedMakingCount: bedMakingCount || 0,
        bedMakingFee: bedMakingFee || 0,
        bedMakingBeds: bedMakingBeds || [],
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

    // 🎉 Calcola maggiorazione festività
    let holidayFee = 0;
    let holidayName: string | null = null;
    try {
      const holidaysSnap = await adminDb.collection('holidays').where('isActive', '==', true).get();
      const baseP = cleaningPrice || property.cleaningPrice || 0;
      for (const hDoc of holidaysSnap.docs) {
        const h = hDoc.data() as Record<string, any>;
        let match = false;
        if (h.isRecurring && h.recurringMonth && h.recurringDay) {
          const utcMatch = (cleaningDate.getUTCMonth() + 1) === h.recurringMonth && cleaningDate.getUTCDate() === h.recurringDay;
          const localMatch = (cleaningDate.getMonth() + 1) === h.recurringMonth && cleaningDate.getDate() === h.recurringDay;
          match = utcMatch || localMatch;
        } else if (h.date) {
          const hd = h.date.toDate?.() || new Date(h.date);
          match = hd.getFullYear() === cleaningDate.getFullYear() && hd.getMonth() === cleaningDate.getMonth() && hd.getDate() === cleaningDate.getDate();
        }
        if (match && baseP > 0) {
          holidayName = h.name;
          if (h.surchargeType === 'percentage' && h.surchargePercentage) {
            holidayFee = Math.round(baseP * (h.surchargePercentage / 100) * 100) / 100;
          } else if (h.surchargeType === 'fixed' && h.surchargeFixed) {
            holidayFee = h.surchargeFixed;
          }
          break;
        }
      }
    } catch (e) { /* non bloccante */ }

    // Crea la pulizia
    const cleaningData: Record<string, any> = {
      propertyId,
      propertyName: property.name,
      propertyAddress: property.address,
      scheduledDate: Timestamp.fromDate(cleaningDate),
      scheduledTime: scheduledTime || "10:00",
      guestsCount: guestsCount,
      guestsConfirmed: true, // Ospiti inseriti manualmente = confermati
      // 🔧 Sgrosso del proprietario → resta IN ATTESA finché l'admin non approva
      // (prima nasceva SCHEDULED = attivo, saltando l'approvazione).
      status: (type === "SGROSSO" && isPendingApproval === true) ? "PENDING_APPROVAL" : "SCHEDULED",
      type: type,
      // 🔧 FIX CRITICO: salva ANCHE serviceType. La modale, l'auto-apertura del
      // pannello approvazione e l'init del tipo leggono `serviceType` — prima
      // salvavamo solo `type` → serviceType=undefined → il pannello sgrosso non
      // si apriva e mostrava "Standard".
      serviceType: serviceType || (type === "SGROSSO" ? "SGROSSO" : "STANDARD"),
      serviceTypeName: serviceTypeName || (type === "SGROSSO" ? "Sgrosso" : null),
      notes: notes || "",
      // 🔧 Sgrosso in attesa = prezzo DA DEFINIRE (0). Prima `cleaningPrice || ...`
      // trattava lo 0 inviato dal proprietario come "mancante" e ci infilava il
      // prezzo base da contratto, applicando una tariffa senza approvazione.
      price: (type === "SGROSSO" && isPendingApproval === true) ? 0 : (cleaningPrice || property.cleaningPrice || 0),
      contractPrice: property.cleaningPrice || 0,
      ...(holidayFee > 0 ? { holidayFee, holidayName } : {}),
      // 🔥 FIX: Salva se la pulizia ha un ordine biancheria collegato
      hasLinenOrder: createLinenOrder && !usesOwnLinen,
      // 🆕 FIX: Salva flag biancheria personalizzata
      linenConfigModified: linenConfigModified,
      // 🆕 FIX: Salva i dati Sgrosso (prima persi → l'admin non vedeva il motivo)
      ...(type === "SGROSSO" ? {
        sgrossoReason: sgrossoReason || null,
        sgrossoReasonLabel: sgrossoReasonLabel || null,
        sgrossoNotes: sgrossoNotes || null,
        requestedByRole: requestedByRole || _user.role || null,
        isPendingApproval: isPendingApproval === true,
      } : {}),
    };
    
    // 🆕 Salva sempre la configurazione biancheria quando ci sono items
    // @ts-expect-error TODO-FIX: TS2339 Property 'length' does not exist on type '{}'.
    if (customLinenItems && customLinenItems.length > 0) {
      // Carica inventario per sapere la categoria di ogni item
      const inventoryData = await loadInventoryData();
      
      // Separa items per categoria
      const blAll: Record<string, number> = {};  // Biancheria letto
      const ba: Record<string, number> = {};     // Biancheria bagno
      const ki: Record<string, number> = {};     // Kit cortesia
      const ex: Record<string, boolean> = {};    // Servizi extra
      
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
          } else if (category === 'servizi_extra') {
            ex[item.id] = true;
          } else {
            // Default: biancheria letto (o categoria sconosciuta)
            // @ts-expect-error TODO-FIX: TS2322 Type 'number | undefined' is not assignable to type 'number'.
            blAll[item.id] = item.quantity;
          }
        }
      });
      
      // 🛡️ FIX v2: mai salvare un custom DEGENERE (bl+ba vuoti) per una
      // proprietà a biancheria gestita: healCustomConfig completa bl/ba dallo
      // standard conservando ki/ex (identità se il custom è già sano).
      const rawCustom = {
        beds: selectedBedIds || [],
        bl: { 'all': blAll },
        ba: ba,
        ki: ki,
        ex: ex
      };
      if (!usesOwnLinen && isDegenerateCustomConfig(rawCustom)) {
        // @ts-expect-error TODO-FIX: TS2339 Property 'serviceConfigs' does not exist on type 'Property'.
        const svcCfgsForHeal = property.serviceConfigs as Record<string | number, any> | undefined;
        const stdForHeal = svcCfgsForHeal ? (svcCfgsForHeal[guestsCount] ?? svcCfgsForHeal[String(guestsCount)]) : undefined;
        cleaningData.customLinenConfig = stdForHeal ? healCustomConfig(rawCustom, stdForHeal) : rawCustom;
      } else {
        cleaningData.customLinenConfig = rawCustom;
      }
      // 🔧 FIX: Solo se il frontend segnala modifica manuale, NON sovrascrivere sempre a true
      // (prima era sempre true quando c'erano items, causando badge "personalizzata" anche per config standard)
      if (linenConfigModified) {
        cleaningData.linenConfigModified = true;
      }
      if (process.env.NODE_ENV !== "production") console.log("📦 Salvata customLinenConfig:", JSON.stringify(cleaningData.customLinenConfig));
    }
    
    if (process.env.NODE_ENV !== "production") console.log("📝 Dati pulizia da salvare:", JSON.stringify(cleaningData, null, 2));
    
    // @ts-expect-error TODO-FIX: TS2345 Argument of type 'Record<string, any>' is not assignable to parameter of type 'O...
    const cleaningId = await createCleaning(cleaningData);

    // 🔔 NOTIFICA ADMIN per richieste Sgrosso dei proprietari.
    // Prima mancava del tutto: il proprietario inviava la richiesta e l'admin
    // non riceveva nulla. Notifica role-based (recipientRole ADMIN, nessun
    // recipientId) coerente col resto del sistema (es. auth/register).
    if (type === "SGROSSO" && (isPendingApproval === true || (requestedByRole || _user.role || "").toUpperCase() === "PROPRIETARIO")) {
      try {
        await adminDb.collection("notifications").add({
          title: "🧽 Richiesta Sgrosso da approvare",
          message: `${property.name}: richiesto uno sgrosso per il ${scheduledDate}${sgrossoReasonLabel ? ` — Motivo: ${sgrossoReasonLabel}` : ""}. Apri la pulizia per approvare e definire il prezzo.`,
          type: "SGROSSO_REQUEST",
          recipientRole: "ADMIN",
          senderId: _user.id || "system",
          senderName: _user.name || "Proprietario",
          relatedEntityId: cleaningId,
          relatedEntityType: "CLEANING",
          relatedEntityName: property.name,
          actionRequired: true,
          status: "UNREAD",
          link: `/dashboard?openCleaning=${cleaningId}`,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      } catch (notifErr) {
        console.error("⚠️ Errore notifica sgrosso admin:", notifErr);
      }
    }

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
