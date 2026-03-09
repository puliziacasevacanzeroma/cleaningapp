import { NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getItemName } from "~/lib/itemNames";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, GenericBodySchema } from "~/lib/validation/schemas";


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
  // ── Auth ──────────────────────────────────────────────
  const _user = await getApiUser();
  if (!_user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  // ─────────────────────────────────────────────────────

    const _body = await validateBody(request, GenericBodySchema);
    if (_body instanceof Response) return _body;
    const { orderId } = _body;
    
    if (!orderId) {
      return NextResponse.json({ error: "orderId richiesto" }, { status: 400 });
    }

    if (process.env.NODE_ENV !== "production") console.log(`\n${"=".repeat(60)}`);
    if (process.env.NODE_ENV !== "production") console.log(`${"=".repeat(60)}`);

    // 1. Carica l'ordine
    const ordersRef = adminDb.collection("orders");
    const orderSnap = await adminDb.collection("orders").where("__name__", "==", orderId).get();
    
    if (orderSnap.empty) {
      return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
    }
    
    const orderDoc = orderSnap.docs[0];
    const orderData = orderDoc.data() as Record<string, any>;
    const propertyId = orderData.propertyId;

    // 2. Carica inventario
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
    const deliveredQuery = ordersRef.where("propertyId", "==", propertyId).where("status", "==", "DELIVERED");
    
    const deliveredSnap = await deliveredQuery.get();
    
    // Filtra quelli con pickupCompleted !== true
    const pendingPickupOrders = deliveredSnap.docs.filter(d => {
      const data = d.data() as Record<string, any>;
      return data.pickupCompleted !== true;
    });

    // 4. Calcola pickupItems sommando TUTTI gli ordini pending
    const itemsMap = new Map<string, { id: string; name: string; quantity: number }>();
    const pickupFromOrders: string[] = [];
    
    for (const pDoc of pendingPickupOrders) {
      const pData = pDoc.data() as Record<string, any>;
      pickupFromOrders.push(pDoc.id);
      
      if (process.env.NODE_ENV !== "production") console.log(`  📦 Ordine ${pDoc.id}: ${pData.items?.length || 0} items`);
      
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
              name: invItem?.name || getItemName(item.id) || item.name,
              quantity: item.quantity || 0
            });
          }
        }
      }
    }
    
    const pickupItems = Array.from(itemsMap.values()).filter(item => item.quantity > 0);
    
    if (process.env.NODE_ENV !== "production") console.log(`\n📥 RISULTATO RICALCOLO:`);
    if (process.env.NODE_ENV !== "production") console.log(`   Ordini da cui ritirare: ${pickupFromOrders.length}`);
    if (process.env.NODE_ENV !== "production") console.log(`   Articoli totali: ${pickupItems.length}`);
    pickupItems.forEach(item => {
      if (process.env.NODE_ENV !== "production") console.log(`     - ${item.name}: ${item.quantity}`);
    });

    // 5. Aggiorna l'ordine con i nuovi pickupItems
    // @ts-expect-error TODO-FIX: TS2345 Argument of type '{}' is not assignable to parameter of type 'string'.
    await adminDb.collection("orders").doc(orderId).update({
      pickupItems: pickupItems,
      pickupFromOrders: pickupFromOrders,
      pickupRecalculatedAt: new Date(),
    });
    if (process.env.NODE_ENV !== "production") console.log(`${"=".repeat(60)}\n`);

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
