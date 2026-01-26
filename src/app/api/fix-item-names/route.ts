import { NextResponse } from "next/server";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

/**
 * API per fixare i nomi degli articoli negli ordini
 * GET /api/fix-item-names
 */
export async function GET() {
  try {
    console.log("🔧 Inizio fix item names...");

    // 1. Carica inventario (collezione "inventory", non "inventoryItems")
    const inventorySnap = await getDocs(collection(db, "inventory"));
    const names: Record<string, string> = {};
    
    inventorySnap.docs.forEach(d => {
      const data = d.data();
      names[d.id] = data.name;
    });
    
    console.log(`📦 Inventario: ${Object.keys(names).length} articoli`);

    // 2. Trova e fixa ordini
    const ordersSnap = await getDocs(collection(db, "orders"));
    
    let fixedOrders = 0;
    let fixedItems = 0;
    let fixedPickupItems = 0;
    const details: string[] = [];

    for (const orderDoc of ordersSnap.docs) {
      const data = orderDoc.data();
      const updates: any = {};
      
      // Fix items (DA PORTARE)
      if (data.items && Array.isArray(data.items)) {
        let itemsNeedFix = false;
        const newItems = data.items.map((item: any) => {
          if (item.name && item.name.length > 15 && !item.name.includes(" ")) {
            const realName = names[item.name] || names[item.id];
            if (realName) {
              itemsNeedFix = true;
              fixedItems++;
              return { ...item, name: realName };
            }
          }
          return item;
        });
        
        if (itemsNeedFix) {
          updates.items = newItems;
        }
      }
      
      // Fix pickupItems (DA RITIRARE)
      if (data.pickupItems && Array.isArray(data.pickupItems)) {
        let pickupNeedFix = false;
        const newPickupItems = data.pickupItems.map((item: any) => {
          if (item.name && item.name.length > 15 && !item.name.includes(" ")) {
            const realName = names[item.name] || names[item.id];
            if (realName) {
              pickupNeedFix = true;
              fixedPickupItems++;
              return { ...item, name: realName };
            }
          }
          return item;
        });
        
        if (pickupNeedFix) {
          updates.pickupItems = newPickupItems;
        }
      }
      
      // Applica aggiornamenti
      if (Object.keys(updates).length > 0) {
        await updateDoc(doc(db, "orders", orderDoc.id), updates);
        details.push(`${orderDoc.id}: ${data.propertyName || 'N/A'}`);
        fixedOrders++;
      }
    }

    return NextResponse.json({
      success: true,
      message: "Fix completato!",
      stats: {
        inventoryItems: Object.keys(names).length,
        totalOrders: ordersSnap.size,
        fixedOrders,
        fixedItems,
        fixedPickupItems,
      },
      fixedOrderDetails: details,
    });

  } catch (error) {
    console.error("Errore fix:", error);
    return NextResponse.json({ 
      error: "Errore durante il fix", 
      details: String(error) 
    }, { status: 500 });
  }
}
