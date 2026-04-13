import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/fix-inventory-sync → diagnosi (dry-run)
 * GET /api/admin/fix-inventory-sync?fix=true → applica fix
 * 
 * 1. Trova tutti gli ordini DELIVERED senza inventoryDeducted=true
 * 2. Per ogni ordine, mappa gli item.id agli inventory doc.id
 * 3. Se fix=true, scala l'inventario e segna inventoryDeducted=true
 */

// Mappa alias per ID vecchi/malformati → key corretta dell'inventario
const ITEM_ALIAS: Record<string, string> = {
  // Biancheria bagno - vecchi ID senza prefisso
  'towelsFace': 'towelsFace',
  'towelsLarge': 'towelsLarge', 
  'towelsSmall': 'towelsSmall',
  'bathMats': 'bathMats',
  // Biancheria letto - vecchi ID senza prefisso
  'doubleSheets': 'doubleSheets',
  'singleSheets': 'singleSheets',
  'pillowcases': 'pillowcases',
  // Kit cortesia - nomi lowercase
  'bagnoschiuma': 'bagnoschiuma',
  'cremaCorpo': 'cremaCorpo',
  'saponetta': 'saponetta',
  'shampoo': 'shampoo',
  'crema': 'crema',
  // Con prefisso item_
  'item_doubleSheets': 'doubleSheets',
  'item_singleSheets': 'singleSheets',
  'item_pillowcases': 'pillowcases',
  'item_towelsFace': 'towelsFace',
  'item_towelsLarge': 'towelsLarge',
  'item_towelsSmall': 'towelsSmall',
  'item_bathMats': 'bathMats',
  'item_saponetta': 'saponetta',
  'item_shampoo': 'shampoo',
  'item_crema': 'crema',
};

export async function GET(request: NextRequest) {
  const user = await getApiUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo admin" }, { status: 403 });
  }

  const url = new URL(request.url);
  const applyFix = url.searchParams.get("fix") === "true";
  const fromDate = url.searchParams.get("from") || "2026-03-01";

  // 1. Carica inventario completo
  const inventorySnap = await adminDb.collection("inventory").get();
  const inventory: Record<string, { docId: string; key: string; name: string; quantity: number }> = {};
  
  // Mappa multipla: doc.id → info, key → info, name → info, name.toLowerCase() → info
  const resolveMap = new Map<string, string>(); // qualsiasi ID/key/nome → doc.id
  
  inventorySnap.docs.forEach(doc => {
    const data = doc.data();
    const info = { docId: doc.id, key: data.key || '', name: data.name || '', quantity: data.quantity || 0 };
    inventory[doc.id] = info;
    
    // Registra tutti i possibili match
    resolveMap.set(doc.id, doc.id);
    if (data.key) resolveMap.set(data.key, doc.id);
    if (data.name) resolveMap.set(data.name, doc.id);
    if (data.name) resolveMap.set(data.name.toLowerCase(), doc.id);
  });
  
  // Aggiungi alias
  for (const [alias, key] of Object.entries(ITEM_ALIAS)) {
    const docId = resolveMap.get(key);
    if (docId && !resolveMap.has(alias)) {
      resolveMap.set(alias, docId);
    }
  }

  // 2. Trova ordini DELIVERED — filtra per data in JS per evitare indice composito
  const [y, m, d] = fromDate.split('-').map(Number);
  const fromDateObj = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  
  const ordersSnap = await adminDb.collection("orders")
    .where("status", "==", "DELIVERED")
    .get();

  const unscaledOrders: any[] = [];
  const alreadyScaled: any[] = [];
  const skippedOld: any[] = [];
  const itemsToDeduct: Record<string, number> = {}; // docId → total qty to deduct
  const unmatchedItems: Record<string, number> = {}; // itemId → count of unmatched

  for (const orderDoc of ordersSnap.docs) {
    const order = orderDoc.data();
    
    // Filtra per data in JS
    const orderDate = order.scheduledDate?.toDate?.();
    if (orderDate && orderDate < fromDateObj) {
      skippedOld.push(orderDoc.id);
      continue;
    }
    
    if (order.inventoryDeducted === true) {
      alreadyScaled.push({ id: orderDoc.id, property: order.propertyName });
      continue;
    }

    const items = order.items || [];
    const orderInfo: any = {
      id: orderDoc.id,
      property: order.propertyName || 'unknown',
      date: order.scheduledDate?.toDate?.()?.toISOString().split('T')[0] || 'unknown',
      itemsCount: items.length,
      items: [],
      fixed: false,
    };

    for (const item of items) {
      const qty = item.quantity || 0;
      if (qty <= 0) continue;

      // Prova a risolvere l'ID
      const docId = resolveMap.get(item.id) || 
                    resolveMap.get(item.name) || 
                    resolveMap.get(item.name?.toLowerCase?.() || '') ||
                    null;

      if (docId) {
        itemsToDeduct[docId] = (itemsToDeduct[docId] || 0) + qty;
        orderInfo.items.push({
          itemId: item.id,
          name: item.name,
          qty,
          resolved: true,
          inventoryDocId: docId,
          inventoryName: inventory[docId]?.name || 'unknown',
        });
      } else {
        unmatchedItems[item.id || item.name] = (unmatchedItems[item.id || item.name] || 0) + qty;
        orderInfo.items.push({
          itemId: item.id,
          name: item.name,
          qty,
          resolved: false,
          error: 'Non trovato in inventario',
        });
      }
    }

    unscaledOrders.push(orderInfo);
  }

  // 3. Se fix=true, applica le deduzioni
  let fixResults: any = null;
  if (applyFix && Object.keys(itemsToDeduct).length > 0) {
    fixResults = { deductions: [], ordersMarked: 0, errors: [] };
    
    // Decrementa inventario
    for (const [docId, totalQty] of Object.entries(itemsToDeduct)) {
      try {
        await adminDb.collection("inventory").doc(docId).update({
          quantity: FieldValue.increment(-totalQty),
          updatedAt: Timestamp.now(),
        });
        fixResults.deductions.push({
          docId,
          name: inventory[docId]?.name || 'unknown',
          deducted: totalQty,
        });
      } catch (e: any) {
        fixResults.errors.push({ docId, error: e.message });
      }
    }
    
    // Segna ordini come scalati
    for (const order of unscaledOrders) {
      try {
        await adminDb.collection("orders").doc(order.id).update({
          inventoryDeducted: true,
          inventoryDeductedAt: Timestamp.now(),
          inventoryDeductedBy: 'fix-inventory-sync',
        });
        order.fixed = true;
        fixResults.ordersMarked++;
      } catch (e: any) {
        fixResults.errors.push({ orderId: order.id, error: e.message });
      }
    }
  }

  return NextResponse.json({
    summary: {
      totalDelivered: ordersSnap.docs.length,
      skippedOld: skippedOld.length,
      alreadyScaled: alreadyScaled.length,
      unscaledOrders: unscaledOrders.length,
      totalItemsToDeduct: Object.entries(itemsToDeduct).map(([docId, qty]) => ({
        docId,
        name: inventory[docId]?.name || 'unknown',
        currentStock: inventory[docId]?.quantity || 0,
        toDeduct: qty,
        newStock: (inventory[docId]?.quantity || 0) - qty,
      })),
      unmatchedItems: Object.entries(unmatchedItems).map(([id, qty]) => ({ id, totalQty: qty })),
    },
    fixApplied: applyFix,
    fixResults,
    unscaledOrders: unscaledOrders.slice(0, 20), // primi 20 per non esplodere
  });
}
