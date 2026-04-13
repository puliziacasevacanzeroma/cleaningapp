import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import { loadInventoryResolver } from "~/lib/inventoryResolver";

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/recalc-inventory → diagnosi (mostra calcolo)
 * GET /api/admin/recalc-inventory?fix=true → applica stock ricalcolato
 * 
 * Ricalcola stock inventario da ZERO:
 * Stock = Σ entrate lavanderia - Σ uscite ordini DELIVERED
 * 
 * Inoltre segna tutti gli ordini DELIVERED come inventoryDeducted=true
 */

export async function GET(request: NextRequest) {
  const user = await getApiUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo admin" }, { status: 403 });
  }

  const url = new URL(request.url);
  const applyFix = url.searchParams.get("fix") === "true";

  // 1. Carica inventario e resolver
  const { resolveToDocId } = await loadInventoryResolver();
  const inventorySnap = await adminDb.collection("inventory").get();
  
  // Mappa docId → info attuale
  const inventoryInfo: Record<string, { name: string; currentQty: number; key: string }> = {};
  inventorySnap.docs.forEach(doc => {
    const data = doc.data();
    inventoryInfo[doc.id] = {
      name: data.name || doc.id,
      currentQty: data.quantity || 0,
      key: data.key || '',
    };
  });

  // 2. Calcola ENTRATE: tutte le laundryDeliveries con status=COMPLETED
  const entriesPerItem: Record<string, number> = {}; // docId → total qty entered
  let totalDeliveries = 0;
  let deliveriesWithInventory = 0;

  const laundrySnap = await adminDb.collection("laundryDeliveries")
    .where("status", "==", "COMPLETED")
    .get();

  for (const deliveryDoc of laundrySnap.docs) {
    const delivery = deliveryDoc.data();
    totalDeliveries++;
    const deliveredItems = delivery.deliveredItems || {};
    
    let hasItems = false;
    for (const [itemName, quantity] of Object.entries(deliveredItems)) {
      const qty = quantity as number;
      if (qty <= 0) continue;
      
      const docId = resolveToDocId(itemName);
      if (docId) {
        entriesPerItem[docId] = (entriesPerItem[docId] || 0) + qty;
        hasItems = true;
      }
    }
    if (hasItems) deliveriesWithInventory++;
  }

  // 3. Calcola USCITE: tutti gli ordini DELIVERED
  const exitsPerItem: Record<string, number> = {}; // docId → total qty exited
  let totalOrders = 0;
  let ordersWithItems = 0;
  const unmatchedExits: Record<string, number> = {};

  const ordersSnap = await adminDb.collection("orders")
    .where("status", "==", "DELIVERED")
    .get();

  for (const orderDoc of ordersSnap.docs) {
    const order = orderDoc.data();
    totalOrders++;
    const items = order.items || [];
    
    let hasItems = false;
    for (const item of items) {
      const qty = item.quantity || 0;
      if (qty <= 0) continue;
      
      const docId = resolveToDocId(item.id) || resolveToDocId(item.name);
      if (docId) {
        exitsPerItem[docId] = (exitsPerItem[docId] || 0) + qty;
        hasItems = true;
      } else {
        const key = item.id || item.name || 'unknown';
        unmatchedExits[key] = (unmatchedExits[key] || 0) + qty;
      }
    }
    if (hasItems) ordersWithItems++;
  }

  // 4. Calcola stock corretto per ogni articolo
  const allDocIds = new Set([
    ...Object.keys(entriesPerItem),
    ...Object.keys(exitsPerItem),
    ...Object.keys(inventoryInfo),
  ]);

  const recalculated: Array<{
    docId: string;
    name: string;
    entries: number;
    exits: number;
    calculatedStock: number;
    currentStock: number;
    difference: number;
    needsFix: boolean;
  }> = [];

  for (const docId of allDocIds) {
    if (!inventoryInfo[docId]) continue; // Solo articoli che esistono nell'inventario
    
    const entries = entriesPerItem[docId] || 0;
    const exits = exitsPerItem[docId] || 0;
    const calculatedStock = entries - exits;
    const currentStock = inventoryInfo[docId].currentQty;
    const difference = calculatedStock - currentStock;

    recalculated.push({
      docId,
      name: inventoryInfo[docId].name,
      entries,
      exits,
      calculatedStock,
      currentStock,
      difference,
      needsFix: difference !== 0,
    });
  }

  // Ordina per differenza più grande
  recalculated.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));

  const itemsNeedingFix = recalculated.filter(r => r.needsFix);

  // 5. Applica fix se richiesto
  let fixResults: any = null;
  if (applyFix) {
    fixResults = { updated: [], errors: [], ordersMarked: 0 };

    // Aggiorna stock
    for (const item of itemsNeedingFix) {
      try {
        await adminDb.collection("inventory").doc(item.docId).update({
          quantity: item.calculatedStock,
          updatedAt: Timestamp.now(),
          lastRecalcAt: Timestamp.now(),
          recalcNote: `Ricalcolato: ${item.entries} entrate - ${item.exits} uscite = ${item.calculatedStock}`,
        });
        fixResults.updated.push({
          docId: item.docId,
          name: item.name,
          oldStock: item.currentStock,
          newStock: item.calculatedStock,
        });
      } catch (e: any) {
        fixResults.errors.push({ docId: item.docId, error: e.message });
      }
    }

    // Segna TUTTI gli ordini DELIVERED come inventoryDeducted
    const batch = adminDb.batch();
    let batchCount = 0;
    
    for (const orderDoc of ordersSnap.docs) {
      const order = orderDoc.data();
      if (order.inventoryDeducted !== true) {
        batch.update(orderDoc.ref, {
          inventoryDeducted: true,
          inventoryDeductedAt: Timestamp.now(),
          inventoryDeductedBy: 'recalc-inventory',
        });
        batchCount++;
        
        // Firestore batch max 500 operazioni
        if (batchCount >= 400) {
          await batch.commit();
          batchCount = 0;
        }
      }
    }
    if (batchCount > 0) {
      await batch.commit();
    }
    fixResults.ordersMarked = ordersSnap.docs.filter(d => d.data().inventoryDeducted !== true).length;
  }

  return NextResponse.json({
    summary: {
      laundryDeliveries: totalDeliveries,
      laundryWithItems: deliveriesWithInventory,
      ordersDelivered: totalOrders,
      ordersWithItems,
      itemsRecalculated: recalculated.length,
      itemsNeedingFix: itemsNeedingFix.length,
      unmatchedExits: Object.entries(unmatchedExits).map(([id, qty]) => ({ id, qty })),
    },
    recalculated,
    fixApplied: applyFix,
    fixResults,
  });
}
