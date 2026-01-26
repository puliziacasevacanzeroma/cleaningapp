import { NextResponse } from "next/server";
import { collection, getDocs, query, where, doc, updateDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

/**
 * API per ricalcolare i pickupItems di un ordine in tempo reale
 * POST /api/orders/recalculate-pickup
 * Body: { orderId: string }
 * 
 * Ricalcola la biancheria da ritirare basandosi su TUTTI gli ordini
 * DELIVERED con pickupCompleted: false per quella proprietà
 */
export async function POST(request: Request) {
  try {
    const { orderId } = await request.json();
    
    if (!orderId) {
      return NextResponse.json({ error: "orderId richiesto" }, { status: 400 });
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log(`🔄 RICALCOLO PICKUP per ordine: ${orderId}`);
    console.log(`${"=".repeat(60)}`);

    // 1. Carica l'ordine
    const ordersRef = collection(db, "orders");
    const orderSnap = await getDocs(query(ordersRef, where("__name__", "==", orderId)));
    
    if (orderSnap.empty) {
      return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
    }
    
    const orderDoc = orderSnap.docs[0];
    const orderData = orderDoc.data();
    const propertyId = orderData.propertyId;
    
    console.log(`📦 Ordine trovato per proprietà: ${propertyId}`);

    // 2. Carica inventario
    const inventorySnap = await getDocs(collection(db, "inventory"));
    const inventoryMap = new Map<string, { name: string; categoryId: string }>();
    
    inventorySnap.docs.forEach(doc => {
      const data = doc.data();
      inventoryMap.set(doc.id, {
        name: data.name || doc.id,
        categoryId: data.categoryId || ""
      });
    });

    // Categorie da ritirare
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

    // Helper per determinare se è biancheria
    const isBiancheria = (item: any, invItem: any): boolean => {
      const categoryId = invItem?.categoryId || item.categoryId || "";
      const itemName = (invItem?.name || item.name || "").toLowerCase();
      const itemType = (item.type || "").toLowerCase();
      
      if (itemType === "cleaning_product" || itemType === "kit_cortesia") return false;
      if (EXCLUDE_CATEGORIES.includes(categoryId)) return false;
      if (EXCLUDE_KEYWORDS.some(kw => itemName.includes(kw))) return false;
      if (PICKUP_CATEGORIES.includes(categoryId)) return true;
      if (LINEN_KEYWORDS.some(kw => itemName.includes(kw))) return true;
      if (!categoryId) return true; // Default includi se non sappiamo
      return false;
    };

    // 3. Cerca TUTTI gli ordini DELIVERED con pickupCompleted: false per questa proprietà
    const deliveredQuery = query(
      ordersRef,
      where("propertyId", "==", propertyId),
      where("status", "==", "DELIVERED")
    );
    
    const deliveredSnap = await getDocs(deliveredQuery);
    console.log(`📋 Ordini DELIVERED trovati: ${deliveredSnap.size}`);
    
    // Filtra quelli con pickupCompleted !== true
    const pendingPickupOrders = deliveredSnap.docs.filter(d => {
      const data = d.data();
      return data.pickupCompleted !== true;
    });
    
    console.log(`📋 Ordini con pickup pending: ${pendingPickupOrders.length}`);

    // 4. Calcola pickupItems sommando TUTTI gli ordini pending
    const itemsMap = new Map<string, { id: string; name: string; quantity: number }>();
    const pickupFromOrders: string[] = [];
    
    for (const pDoc of pendingPickupOrders) {
      const pData = pDoc.data();
      pickupFromOrders.push(pDoc.id);
      
      console.log(`  📦 Ordine ${pDoc.id}: ${pData.items?.length || 0} items`);
      
      if (pData.items && Array.isArray(pData.items)) {
        for (const item of pData.items) {
          const invItem = inventoryMap.get(item.id);
          
          if (!isBiancheria(item, invItem)) {
            continue;
          }
          
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
    
    console.log(`\n📥 RISULTATO RICALCOLO:`);
    console.log(`   Ordini da cui ritirare: ${pickupFromOrders.length}`);
    console.log(`   Articoli totali: ${pickupItems.length}`);
    pickupItems.forEach(item => {
      console.log(`     - ${item.name}: ${item.quantity}`);
    });

    // 5. Aggiorna l'ordine con i nuovi pickupItems
    await updateDoc(doc(db, "orders", orderId), {
      pickupItems: pickupItems,
      pickupFromOrders: pickupFromOrders,
      pickupRecalculatedAt: new Date(),
    });
    
    console.log(`✅ Ordine ${orderId} aggiornato con pickupItems ricalcolati`);
    console.log(`${"=".repeat(60)}\n`);

    return NextResponse.json({
      success: true,
      orderId,
      pickupItems,
      pickupFromOrders,
      message: `Ricalcolati ${pickupItems.length} articoli da ${pickupFromOrders.length} ordini`
    });

  } catch (error) {
    console.error("❌ Errore ricalcolo pickup:", error);
    return NextResponse.json({ 
      error: "Errore durante il ricalcolo", 
      details: String(error) 
    }, { status: 500 });
  }
}
