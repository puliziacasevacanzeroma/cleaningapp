import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

/**
 * 🔍 DIAGNOSI ORDINI — Analizza SENZA modificare nulla
 * 
 * GET /api/admin/diagnose-orders
 * 
 * Scansiona tutti gli ordini PENDING da oggi in avanti e identifica:
 * 1. PRODUCTS_ONLY: ordini con solo prodotti pulizia, senza biancheria
 * 2. MISSING_LINEN: ordini che hanno items ma nessuna biancheria letto
 * 3. BLOATED_PICKUP: ordini con pickupItems gonfiati (cross-proprietà)
 * 4. FIRESTORE_ID_NAME: ordini con nomi item = ID Firestore
 * 
 * NON modifica nulla nel database.
 */
export async function GET(request: NextRequest) {
  try {
    const _user = await getApiUser();
    if (!_user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    if (_user.role?.toUpperCase() !== "ADMIN") return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

    // Data di oggi a mezzanotte
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Carica tutti gli ordini PENDING (single field, no composite index)
    const ordersSnap = await adminDb.collection("orders")
      .where("status", "==", "PENDING")
      .get();
    
    // Filtra in JS: solo da oggi in avanti
    const futureOrders = ordersSnap.docs.filter(d => {
      const data = d.data() as Record<string, any>;
      const schedDate = data.scheduledDate?.toDate?.();
      return schedDate && schedDate >= today;
    });

    // 2. Carica proprietà per cross-check
    const propertiesSnap = await adminDb.collection("properties").get();
    const propertiesMap: Record<string, any> = {};
    propertiesSnap.docs.forEach(doc => {
      const data = doc.data() as Record<string, any>;
      propertiesMap[doc.id] = {
        id: doc.id,
        name: data.name,
        usesOwnLinen: data.usesOwnLinen || false,
        serviceConfigs: data.serviceConfigs ? Object.keys(data.serviceConfigs) : [],
      };
    });

    // 3. Carica inventario per check nomi
    const inventorySnap = await adminDb.collection("inventory").get();
    const inventoryNames = new Map<string, string>();
    inventorySnap.docs.forEach(doc => {
      const data = doc.data() as Record<string, any>;
      inventoryNames.set(doc.id, data.name || doc.id);
    });

    // 4. Per il check pickup gonfiati, conta ordini DELIVERED per proprietà
    const deliveredSnap = await adminDb.collection("orders")
      .where("status", "==", "DELIVERED")
      .get();
    
    // Conta ordini DELIVERED non-pickup-completed PER proprietà
    const deliveredByProperty = new Map<string, number>();
    deliveredSnap.docs.forEach(d => {
      const data = d.data() as Record<string, any>;
      if (data.pickupCompleted !== true) {
        const propId = data.propertyId;
        deliveredByProperty.set(propId, (deliveredByProperty.get(propId) || 0) + 1);
      }
    });

    // 5. Analisi
    const issues: any[] = [];
    let totalFuture = 0;
    let healthy = 0;

    const FIRESTORE_ID_REGEX = /^[a-zA-Z0-9]{15,}$/;

    for (const orderDoc of futureOrders) {
      const data = orderDoc.data() as Record<string, any>;
      totalFuture++;

      const propertyId = data.propertyId;
      const property = propertiesMap[propertyId];
      const propertyName = data.propertyName || property?.name || "???";
      const items = data.items || [];
      const pickupItems = data.pickupItems || [];
      const scheduledDate = data.scheduledDate?.toDate?.();
      const dateStr = scheduledDate ? scheduledDate.toISOString().split('T')[0] : '???';

      const orderIssues: string[] = [];

      // CHECK 1: Products-only (nessun item che non sia cleaning_product)
      const hasLinenItems = items.some((item: any) =>
        item.type !== 'cleaning_product' && item.categoryId !== 'prodotti_pulizia'
      );
      const hasCleaningProducts = items.some((item: any) =>
        item.type === 'cleaning_product' || item.categoryId === 'prodotti_pulizia'
      );
      const isProductsOnly = data.type === 'PRODUCTS' || data.isProductsOnly === true;

      if (isProductsOnly && !hasLinenItems) {
        orderIssues.push('PRODUCTS_ONLY');
      } else if (!hasLinenItems && items.length > 0) {
        // Ha items ma nessuno è biancheria — potrebbe essere solo kit cortesia
        orderIssues.push('MISSING_LINEN');
      } else if (items.length === 0) {
        orderIssues.push('EMPTY_ITEMS');
      }

      // CHECK 2: Pickup gonfiato — pickupFromOrders contiene ordini di ALTRE proprietà
      if (pickupItems.length > 0 && data.pickupFromOrders?.length > 0) {
        const pickupTotal = pickupItems.reduce((s: number, i: any) => s + (i.quantity || 0), 0);
        // Soglia: se il totale pickup > 50, probabilmente è gonfiato
        if (pickupTotal > 50) {
          orderIssues.push(`BLOATED_PICKUP(${pickupTotal}pz_da_${data.pickupFromOrders.length}ordini)`);
        }
      }

      // CHECK 3: Nomi item che sembrano ID Firestore
      const firestoreIdItems = items.filter((item: any) => {
        const name = item.name || '';
        const id = item.id || '';
        return FIRESTORE_ID_REGEX.test(name) || (FIRESTORE_ID_REGEX.test(id) && name === id);
      });
      if (firestoreIdItems.length > 0) {
        orderIssues.push(`FIRESTORE_ID_NAME(${firestoreIdItems.map((i: any) => i.name || i.id).join(',')})`);
      }

      // CHECK 4: Stessi check su pickupItems
      const firestoreIdPickup = pickupItems.filter((item: any) => {
        const name = item.name || '';
        return FIRESTORE_ID_REGEX.test(name);
      });
      if (firestoreIdPickup.length > 0) {
        orderIssues.push(`PICKUP_FIRESTORE_ID(${firestoreIdPickup.map((i: any) => i.name).join(',')})`);
      }

      if (orderIssues.length > 0) {
        issues.push({
          orderId: orderDoc.id,
          date: dateStr,
          property: propertyName,
          propertyId,
          status: data.status,
          type: data.type || 'N/A',
          isProductsOnly: isProductsOnly || false,
          itemsCount: items.length,
          hasLinen: hasLinenItems,
          hasProducts: hasCleaningProducts,
          pickupItemsCount: pickupItems.length,
          pickupTotal: pickupItems.reduce((s: number, i: any) => s + (i.quantity || 0), 0),
          issues: orderIssues,
          items: items.map((i: any) => `${i.name || i.id}:${i.quantity}`).slice(0, 10),
        });
      } else {
        healthy++;
      }
    }

    // Raggruppa per tipo di problema
    const byIssueType: Record<string, number> = {};
    issues.forEach(i => {
      i.issues.forEach((issue: string) => {
        const key = issue.split('(')[0]; // Rimuovi dettagli tra parentesi
        byIssueType[key] = (byIssueType[key] || 0) + 1;
      });
    });

    return NextResponse.json({
      summary: {
        totalFutureOrders: totalFuture,
        healthy,
        withIssues: issues.length,
        byIssueType,
      },
      issues: issues.sort((a, b) => a.date.localeCompare(b.date)),
    });

  } catch (error) {
    console.error("❌ Errore diagnose-orders:", error);
    return NextResponse.json({ 
      error: "Errore server", 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}
