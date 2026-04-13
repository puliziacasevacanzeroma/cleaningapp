import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";
import { loadInventoryResolver } from "~/lib/inventoryResolver";

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/inventory-report
 * GET /api/admin/inventory-report?date=2026-04-13
 * 
 * Report inventario giornaliero:
 * - Stock attuale di ogni articolo
 * - Carico lavanderia del giorno (entrate)
 * - Ordini consegnati del giorno (uscite)
 * - Pulizie completate del giorno (uscite auto)
 * - Saldo netto del giorno
 */

export async function GET(request: NextRequest) {
  const user = await getApiUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo admin" }, { status: 403 });
  }

  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date");
  
  // Data di oggi in timezone Roma
  const todayRome = dateParam || new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });

  // 1. Stock attuale inventario
  const inventorySnap = await adminDb.collection("inventory").get();
  const { resolveToDocId } = await loadInventoryResolver();
  
  const stock: Record<string, { name: string; category: string; quantity: number; sellPrice: number }> = {};
  inventorySnap.docs.forEach(doc => {
    const data = doc.data();
    stock[doc.id] = {
      name: data.name || doc.id,
      category: data.categoryId || 'altro',
      quantity: data.quantity || 0,
      sellPrice: data.sellPrice || 0,
    };
  });

  // 2. Carico lavanderia del giorno
  const laundrySnap = await adminDb.collection("laundryDeliveries")
    .where("dateKey", "==", todayRome)
    .where("status", "==", "COMPLETED")
    .get();

  const laundryEntries: Array<{ itemName: string; docId: string | null; inventoryName: string; qty: number }> = [];
  const laundryTotals: Record<string, number> = {};

  for (const deliveryDoc of laundrySnap.docs) {
    const delivery = deliveryDoc.data();
    const deliveredItems = delivery.deliveredItems || {};
    
    for (const [itemName, quantity] of Object.entries(deliveredItems)) {
      const qty = quantity as number;
      if (qty <= 0) continue;
      const docId = resolveToDocId(itemName);
      laundryEntries.push({
        itemName,
        docId,
        inventoryName: docId ? (stock[docId]?.name || 'unknown') : 'NON TROVATO',
        qty,
      });
      if (docId) {
        laundryTotals[docId] = (laundryTotals[docId] || 0) + qty;
      }
    }
  }

  // 3. Ordini consegnati oggi (uscite rider)
  const allOrders = await adminDb.collection("orders").where("status", "==", "DELIVERED").get();
  
  const todayDeliveries: Array<{ orderId: string; property: string; items: Array<{ name: string; qty: number; docId: string | null }> }> = [];
  const deliveryTotals: Record<string, number> = {};

  for (const orderDoc of allOrders.docs) {
    const order = orderDoc.data();
    // Filtra per data di oggi
    const deliveredAt = order.deliveredAt?.toDate?.();
    const scheduledDate = order.scheduledDate?.toDate?.();
    
    const deliveredDateStr = deliveredAt ? deliveredAt.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' }) : null;
    const scheduledDateStr = scheduledDate ? scheduledDate.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' }) : null;
    
    // Considera "oggi" se consegnato oggi O programmato per oggi
    if (deliveredDateStr !== todayRome && scheduledDateStr !== todayRome) continue;
    
    const items = order.items || [];
    const orderItems: Array<{ name: string; qty: number; docId: string | null }> = [];
    
    for (const item of items) {
      const qty = item.quantity || 0;
      if (qty <= 0) continue;
      const docId = resolveToDocId(item.id) || resolveToDocId(item.name);
      orderItems.push({ name: item.name || item.id, qty, docId });
      if (docId) {
        deliveryTotals[docId] = (deliveryTotals[docId] || 0) + qty;
      }
    }
    
    if (orderItems.length > 0) {
      todayDeliveries.push({
        orderId: orderDoc.id,
        property: order.propertyName || 'unknown',
        items: orderItems,
      });
    }
  }

  // 4. Riepilogo per articolo
  const allDocIds = new Set([
    ...Object.keys(stock),
    ...Object.keys(laundryTotals),
    ...Object.keys(deliveryTotals),
  ]);

  const riepilogo: Array<{
    name: string;
    category: string;
    stockAttuale: number;
    caricoLavanderia: number;
    scaricoConsegne: number;
    saldoGiorno: number;
  }> = [];

  for (const docId of allDocIds) {
    if (!stock[docId]) continue;
    const carico = laundryTotals[docId] || 0;
    const scarico = deliveryTotals[docId] || 0;
    
    // Mostra solo articoli con movimenti oggi O con stock non zero
    if (carico === 0 && scarico === 0 && stock[docId].quantity === 0) continue;
    
    riepilogo.push({
      name: stock[docId].name,
      category: stock[docId].category,
      stockAttuale: stock[docId].quantity,
      caricoLavanderia: carico,
      scaricoConsegne: scarico,
      saldoGiorno: carico - scarico,
    });
  }

  // Ordina: prima biancheria letto, poi bagno, poi kit, poi il resto
  const categoryOrder: Record<string, number> = { biancheria_letto: 1, biancheria_bagno: 2, kit_cortesia: 3, prodotti_pulizia: 4 };
  riepilogo.sort((a, b) => (categoryOrder[a.category] || 99) - (categoryOrder[b.category] || 99));

  return NextResponse.json({
    data: todayRome,
    riepilogo,
    dettaglio: {
      caricoLavanderia: {
        consegne: laundrySnap.docs.length,
        items: laundryEntries,
      },
      scaricoConsegne: {
        ordiniConsegnati: todayDeliveries.length,
        ordini: todayDeliveries,
      },
    },
  });
}
