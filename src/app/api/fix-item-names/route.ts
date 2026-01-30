import { NextResponse } from "next/server";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { ITEM_NAMES } from "~/lib/itemNames";

export const dynamic = 'force-dynamic';

/**
 * API per fixare i nomi degli articoli negli ordini esistenti
 * GET /api/fix-item-names
 * 
 * Esegui UNA VOLTA per correggere gli ordini già nel database.
 */
export async function GET() {
  try {
    console.log("🔧 Fix nomi articoli...");

    const ordersSnap = await getDocs(collection(db, "orders"));
    
    let fixedOrders = 0;
    let fixedItems = 0;
    let fixedPickupItems = 0;

    for (const orderDoc of ordersSnap.docs) {
      const data = orderDoc.data();
      const updates: Record<string, unknown> = {};
      
      // Fix items
      if (data.items?.length) {
        let needsFix = false;
        const newItems = data.items.map((item: any) => {
          const correctName = ITEM_NAMES[item.id] || ITEM_NAMES[item.name];
          if (correctName && correctName !== item.name) {
            needsFix = true;
            fixedItems++;
            return { ...item, name: correctName };
          }
          return item;
        });
        if (needsFix) updates.items = newItems;
      }
      
      // Fix pickupItems
      if (data.pickupItems?.length) {
        let needsFix = false;
        const newPickup = data.pickupItems.map((item: any) => {
          const correctName = ITEM_NAMES[item.id] || ITEM_NAMES[item.name];
          if (correctName && correctName !== item.name) {
            needsFix = true;
            fixedPickupItems++;
            return { ...item, name: correctName };
          }
          return item;
        });
        if (needsFix) updates.pickupItems = newPickup;
      }
      
      if (Object.keys(updates).length > 0) {
        await updateDoc(doc(db, "orders", orderDoc.id), updates);
        fixedOrders++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Fixati ${fixedOrders} ordini, ${fixedItems} items, ${fixedPickupItems} pickupItems`
    });

  } catch (error) {
    console.error("Errore:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
