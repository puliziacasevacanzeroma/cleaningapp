import { NextResponse } from "next/server";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

/**
 * API di DEBUG per analizzare il calcolo del ritiro biancheria
 * GET /api/debug-pickup?propertyId=XXX
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");
    
    if (!propertyId) {
      // Se non c'è propertyId, mostra tutte le proprietà con ordini
      const ordersSnap = await getDocs(collection(db, "orders"));
      const propertyIds = new Set<string>();
      ordersSnap.docs.forEach(d => {
        const data = d.data();
        if (data.propertyId) propertyIds.add(data.propertyId);
      });
      
      // Carica nomi proprietà
      const propsSnap = await getDocs(collection(db, "properties"));
      const propsMap = new Map<string, string>();
      propsSnap.docs.forEach(d => {
        propsMap.set(d.id, d.data().name || d.id);
      });
      
      const properties = Array.from(propertyIds).map(id => ({
        id,
        name: propsMap.get(id) || "Sconosciuto",
        debugUrl: `/api/debug-pickup?propertyId=${id}`
      }));
      
      return NextResponse.json({
        message: "Specifica propertyId per debug dettagliato",
        properties: properties.slice(0, 20),
        total: properties.length
      });
    }

    // 1. Carica inventario
    const inventorySnap = await getDocs(collection(db, "inventory"));
    const inventory: Record<string, any> = {};
    inventorySnap.docs.forEach(doc => {
      inventory[doc.id] = {
        id: doc.id,
        name: doc.data().name,
        categoryId: doc.data().categoryId
      };
    });

    // 2. Carica tutti gli ordini per questa proprietà
    const ordersQuery = query(
      collection(db, "orders"),
      where("propertyId", "==", propertyId)
    );
    const ordersSnap = await getDocs(ordersQuery);
    
    // 3. Analizza ogni ordine
    const ordersAnalysis = ordersSnap.docs.map(doc => {
      const data = doc.data();
      
      // Analizza items
      const itemsAnalysis = (data.items || []).map((item: any) => {
        const invItem = inventory[item.id];
        return {
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          categoryId: item.categoryId || "NON SALVATO",
          inventoryName: invItem?.name || "NON TROVATO IN INVENTARIO",
          inventoryCategoryId: invItem?.categoryId || "NON TROVATO",
          isBiancheria: ["biancheria_letto", "biancheria_bagno"].includes(invItem?.categoryId || item.categoryId || "")
        };
      });
      
      return {
        orderId: doc.id,
        status: data.status,
        pickupCompleted: data.pickupCompleted,
        pickupFromOrders: data.pickupFromOrders || [],
        deliveredAt: data.deliveredAt?.toDate?.()?.toISOString() || null,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        itemsCount: data.items?.length || 0,
        items: itemsAnalysis,
        pickupItems: data.pickupItems || [],
        // Evidenzia problemi
        problems: []
      };
    });
    
    // Ordina per data
    ordersAnalysis.sort((a, b) => {
      const dateA = a.createdAt || "";
      const dateB = b.createdAt || "";
      return dateB.localeCompare(dateA);
    });
    
    // 4. Calcola cosa DOVREBBE essere il ritiro
    const pendingPickupOrders = ordersAnalysis.filter(o => 
      o.status === "DELIVERED" && o.pickupCompleted !== true
    );
    
    // Somma biancheria da ritirare
    const expectedPickup: Record<string, { name: string; quantity: number; fromOrders: string[] }> = {};
    
    for (const order of pendingPickupOrders) {
      for (const item of order.items) {
        if (item.isBiancheria) {
          if (!expectedPickup[item.id]) {
            expectedPickup[item.id] = {
              name: item.inventoryName || item.name,
              quantity: 0,
              fromOrders: []
            };
          }
          expectedPickup[item.id].quantity += item.quantity;
          expectedPickup[item.id].fromOrders.push(order.orderId);
        }
      }
    }
    
    // 5. Carica proprietà
    const propSnap = await getDocs(query(collection(db, "properties"), where("__name__", "==", propertyId)));
    const propertyName = propSnap.docs[0]?.data()?.name || "Sconosciuto";
    
    return NextResponse.json({
      propertyId,
      propertyName,
      inventoryItemsCount: Object.keys(inventory).length,
      
      // Ordini analizzati
      ordersCount: ordersAnalysis.length,
      orders: ordersAnalysis,
      
      // Calcolo ritiro
      pendingPickupOrdersCount: pendingPickupOrders.length,
      pendingPickupOrderIds: pendingPickupOrders.map(o => o.orderId),
      
      expectedPickupItems: Object.entries(expectedPickup).map(([id, data]) => ({
        id,
        name: data.name,
        quantity: data.quantity,
        fromOrders: data.fromOrders
      })),
      
      // Statistiche inventario
      inventorySample: Object.values(inventory).slice(0, 10)
    });

  } catch (error) {
    console.error("Errore debug:", error);
    return NextResponse.json({ 
      error: "Errore durante il debug", 
      details: String(error) 
    }, { status: 500 });
  }
}
