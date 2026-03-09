import { NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { calculatePickupItems } from "~/lib/services/linenOrderService";
import { getApiUser } from "~/lib/api-auth";


export const dynamic = 'force-dynamic';

/**
 * GET /api/orders/fix-pickup
 * 
 * Ricalcola i pickupItems per tutti gli ordini che hanno pickupItems vuoto,
 * usando la funzione centralizzata calculatePickupItems.
 */
export async function GET() {
  try {
  // ── Auth ──────────────────────────────────────────────
  const _user = await getApiUser();
  if (!_user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  if (_user.role?.toUpperCase() !== "ADMIN") return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  // ─────────────────────────────────────────────────────

    // @ts-expect-error TODO-FIX: TS2339 Property 'get' does not exist on type '"orders"'.
    const ordersSnap = await adminDb.collection("orders".get());
    
    let fixed = 0;
    let skipped = 0;
    let noHistory = 0;
    const details: any[] = [];

    // Cache per evitare di ricalcolare per la stessa proprietà
    const pickupCache = new Map<string, { pickupItems: any[], pickupFromOrders: string[] }>();

    // @ts-expect-error TODO-FIX: TS2551 Property 'docs' does not exist on type 'CollectionReference<DocumentData, Docume...
    for (const orderDoc of ordersSnap.docs) {
      const o = orderDoc.data();
      
      // Skip ordini cancellati o già con pickup
      if (o.status === 'CANCELLED') { skipped++; continue; }
      if (o.pickupItems && o.pickupItems.length > 0) { skipped++; continue; }
      if (!o.propertyId) { skipped++; continue; }
      
      // Calcola pickup (con cache)
      let pickupData = pickupCache.get(o.propertyId);
      if (!pickupData) {
        pickupData = await calculatePickupItems(o.propertyId);
        pickupCache.set(o.propertyId, pickupData);
      }
      
      if (pickupData.pickupItems.length === 0) {
        noHistory++;
        details.push({ orderId: orderDoc.id, property: o.propertyName, status: 'no_previous_order' });
        continue;
      }
      
      // Escludi self-reference
      const filteredFromOrders = pickupData.pickupFromOrders.filter((id: string) => id !== orderDoc.id);
      if (filteredFromOrders.length === 0) {
        noHistory++;
        details.push({ orderId: orderDoc.id, property: o.propertyName, status: 'self_reference_only' });
        continue;
      }
      
      await adminDb.collection("orders").doc(orderDoc.id).update({
        includePickup: true,
        pickupItems: pickupData.pickupItems,
        pickupFromOrders: filteredFromOrders,
        updatedAt: Timestamp.now()
      });
      
      fixed++;
      details.push({
        orderId: orderDoc.id,
        property: o.propertyName,
        status: 'fixed',
        pickupItemsCount: pickupData.pickupItems.length,
      });
    }

    // @ts-expect-error TODO-FIX: TS2339 Property 'size' does not exist on type 'CollectionReference<DocumentData, Docume...
    return NextResponse.json({ success: true, totalOrders: ordersSnap.size, fixed, skipped, noHistory, details });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
