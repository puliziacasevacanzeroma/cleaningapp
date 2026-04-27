import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = 'force-dynamic';

/**
 * GET /api/debug/inventory-audit
 * 
 * Audit completo della collection inventory + analisi duplicati semantici e
 * confronto con i prezzi che appaiono negli ordini.
 * 
 * Query params:
 * - email     = email del cliente (opzionale, per analizzare anche i suoi ordini)
 * - month     = mese (opzionale)
 * - year      = anno (opzionale)
 */
export async function GET(req: NextRequest) {
  try {
    const email = req.nextUrl.searchParams.get('email');

    // 1. Carico TUTTO l'inventario
    const inventorySnap = await adminDb.collection("inventory").get();
    const allItems: any[] = [];
    for (const doc of inventorySnap.docs) {
      const d: any = doc.data();
      allItems.push({
        docId: doc.id,
        name: d.name || null,
        key: d.key || null,
        sellPrice: d.sellPrice ?? null,
        price: d.price ?? null,
        categoryName: d.categoryName || null,
        category: d.category || null,
        categoryId: d.categoryId || null,
        unit: d.unit || null,
        defaultQty: d.defaultQty ?? null,
        active: d.active ?? null,
        deleted: d.deleted ?? null,
      });
    }

    // 2. Analisi duplicati semantici
    // Normalizzo nome a chiave canonica e raggruppo
    const groups = new Map<string, any[]>();
    for (const item of allItems) {
      const nameKey = (item.name || item.docId || "")
        .toLowerCase()
        .replace(/[\s_-]+/g, "");
      if (!groups.has(nameKey)) groups.set(nameKey, []);
      groups.get(nameKey)!.push(item);
    }

    const duplicates: any[] = [];
    for (const [key, items] of groups.entries()) {
      if (items.length > 1) {
        duplicates.push({
          canonicalKey: key,
          count: items.length,
          items: items.map(i => ({
            docId: i.docId,
            name: i.name,
            sellPrice: i.sellPrice,
            price: i.price,
            categoryName: i.categoryName,
            category: i.category,
          })),
        });
      }
    }

    // 3. Items senza prezzo (sellPrice 0 o null)
    const itemsWithoutPrice = allItems
      .filter(i => !i.sellPrice && !i.price)
      .map(i => ({ docId: i.docId, name: i.name, categoryName: i.categoryName, category: i.category }));

    // 4. Items senza categoria
    const itemsWithoutCategory = allItems
      .filter(i => !i.categoryName && !i.category)
      .map(i => ({ docId: i.docId, name: i.name, sellPrice: i.sellPrice }));

    // 5. Distribution per categoria
    const byCategory: { [key: string]: number } = {};
    for (const item of allItems) {
      const cat = item.categoryName || item.category || "(nessuna)";
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    }

    const result: any = {
      summary: {
        totalDocuments: allItems.length,
        duplicateGroupsFound: duplicates.length,
        itemsWithoutPrice: itemsWithoutPrice.length,
        itemsWithoutCategory: itemsWithoutCategory.length,
        byCategory,
      },
      duplicates,
      itemsWithoutPrice,
      itemsWithoutCategory,
      allItems: allItems.sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    };

    // 6. Se richiesto, analizzo anche un ordine reale per capire come gli items sono salvati lì
    if (email) {
      const userQuery = await adminDb.collection("users")
        .where("email", "==", email.toLowerCase().trim())
        .limit(1)
        .get();
      if (!userQuery.empty) {
        const userDoc = userQuery.docs[0]!;
        const propsSnap = await adminDb.collection("properties")
          .where("ownerId", "==", userDoc.id)
          .where("status", "==", "ACTIVE")
          .get();
        const propertyIds = propsSnap.docs.map((d: any) => d.id);
        const propertyIdsSet = new Set(propertyIds);

        // Prendo un campione di 3 ordini con items
        const ordersSnap = await adminDb.collection("orders")
          .limit(50)
          .get();
        const sampleOrders: any[] = [];
        for (const doc of ordersSnap.docs) {
          const d: any = doc.data();
          if (!propertyIdsSet.has(d.propertyId)) continue;
          if (!d.items || !Array.isArray(d.items) || d.items.length === 0) continue;
          sampleOrders.push({
            orderId: doc.id,
            status: d.status,
            propertyId: d.propertyId,
            cleaningId: d.cleaningId || null,
            mainCategory: d.mainCategory || null,
            calculatedTotal: d.calculatedTotal,
            totalPriceOverride: d.totalPriceOverride ?? null,
            deliveryFee: d.deliveryFee ?? null,
            bedMakingFee: d.bedMakingFee ?? null,
            items: d.items.map((it: any) => ({
              itemId: it.itemId || null,
              id: it.id || null,
              name: it.name || null,
              categoryName: it.categoryName || null,
              category: it.category || null,
              quantity: it.quantity || null,
              unitPrice: it.unitPrice ?? null,
              price: it.price ?? null,
              priceOverride: it.priceOverride ?? null,
              totalPrice: it.totalPrice ?? null,
            })),
          });
          if (sampleOrders.length >= 3) break;
        }
        result.sampleOrders = sampleOrders;
      }
    }

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    console.error("[inventory-audit] errore:", err);
    return NextResponse.json({
      error: "Errore audit",
      message: err?.message || String(err),
      stack: err?.stack?.split('\n').slice(0, 6).join('\n'),
    }, { status: 500 });
  }
}
