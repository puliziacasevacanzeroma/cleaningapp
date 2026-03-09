import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

const ITEM_NAMES: Record<string, string> = {
  'doubleSheets': 'Lenzuola Matrimoniali', 'singleSheets': 'Lenzuola Singole', 'pillowcases': 'Federe',
  'towel_bath': 'Telo Doccia', 'towel_face': 'Asciugamano Viso', 'towel_bidet': 'Asciugamano Bidet', 'bathmat': 'Tappetino Scendibagno',
};
function getItemName(itemId: string): string { return ITEM_NAMES[itemId] || itemId; }

export async function POST(request: NextRequest) {
  try {
    const _user = await getApiUser();
    if (!_user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    if (_user.role?.toUpperCase() !== "ADMIN") return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

    const propertiesSnapshot = await adminDb.collection("properties").get();
    const propertiesMap: Record<string, any> = {};
    propertiesSnapshot.docs.forEach(doc => {
      const data = doc.data() as Record<string, any>;
      if (data.serviceConfigs && Object.keys(data.serviceConfigs).length > 0) propertiesMap[doc.id] = { id: doc.id, name: data.name, serviceConfigs: data.serviceConfigs };
    });

    const ordersSnapshot = await adminDb.collection("orders").where("status", "==", "PENDING").get();
    let updated = 0, skipped = 0, noConfig = 0;
    const errors: string[] = [];

    for (const orderDoc of ordersSnapshot.docs) {
      try {
        const orderData = orderDoc.data() as Record<string, any>;
        const propertyId = orderData.propertyId;
        const cleaningId = orderData.cleaningId;
        const property = propertiesMap[propertyId];
        if (!property) { noConfig++; continue; }

        let guestsCount = 2;
        if (cleaningId) {
          const cleaningDoc = await adminDb.collection("cleanings").doc(cleaningId).get();
          if (cleaningDoc.exists) {
            const cleaningData = cleaningDoc.data()!;
            if (cleaningData.linenConfigModified === true) { skipped++; continue; }
            guestsCount = cleaningData.guestsCount || 2;
          }
        }

        const serviceConfigs = property.serviceConfigs;
        const config = serviceConfigs[guestsCount] || serviceConfigs[String(guestsCount)];
        if (!config) { noConfig++; continue; }

        const newItems: { id: string; name: string; quantity: number }[] = [];
        if (config.bl) {
          if (config.bl['all'] && Object.keys(config.bl['all']).length > 0) {
            Object.entries(config.bl['all']).forEach(([itemId, qty]) => { if (typeof qty === 'number' && qty > 0) newItems.push({ id: itemId, name: getItemName(itemId), quantity: qty }); });
          } else {
            Object.entries(config.bl).forEach(([bedId, items]) => {
              if (bedId !== 'all' && typeof items === 'object' && items !== null) {
                Object.entries(items as Record<string, number>).forEach(([itemId, qty]) => {
                  if (typeof qty === 'number' && qty > 0) { const existing = newItems.find(i => i.id === itemId); if (existing) existing.quantity += qty; else newItems.push({ id: itemId, name: getItemName(itemId), quantity: qty }); }
                });
              }
            });
          }
        }
        if (config.ba) { Object.entries(config.ba).forEach(([itemId, qty]) => { if (typeof qty === 'number' && qty > 0) newItems.push({ id: itemId, name: getItemName(itemId), quantity: qty }); }); }
        if (config.ki) { Object.entries(config.ki).forEach(([itemId, qty]) => { if (typeof qty === 'number' && qty > 0) newItems.push({ id: itemId, name: getItemName(itemId), quantity: qty }); }); }

        const oldItemsStr = JSON.stringify(orderData.items?.sort((a: any, b: any) => a.id.localeCompare(b.id)));
        const newItemsStr = JSON.stringify(newItems.sort((a, b) => a.id.localeCompare(b.id)));
        if (oldItemsStr === newItemsStr) continue;

        await orderDoc.ref.update({ items: newItems, updatedAt: Timestamp.now(), itemsUpdatedFromConfig: true });
        updated++;
      } catch (orderError) { console.error(`❌ Errore ordine ${orderDoc.id}:`, orderError); errors.push(orderDoc.id); }
    }

    return NextResponse.json({ success: true, updated, skipped, noConfig, errors: errors.length, total: ordersSnapshot.docs.length, message: `Aggiornati ${updated} ordini su ${ordersSnapshot.docs.length} totali` });
  } catch (error) {
    console.error("❌ Errore update-all-pending-orders:", error);
    return NextResponse.json({ error: "Errore server", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function GET() {
  try {
    const ordersSnapshot = await adminDb.collection("orders").where("status", "==", "PENDING").get();
    return NextResponse.json({ pendingOrders: ordersSnapshot.docs.length, message: `Ci sono ${ordersSnapshot.docs.length} ordini PENDING. Usa POST per aggiornarli.` });
  } catch (error) { return NextResponse.json({ error: "Errore" }, { status: 500 }); }
}
