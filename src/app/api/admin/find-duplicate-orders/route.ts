import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/find-duplicate-orders
 * 
 * Trova TUTTI gli ordini duplicati: stesso cleaningId, entrambi non-CANCELLED.
 * Per ogni duplicato mostra createdAt, items count, scheduledDate per capire
 * COME e QUANDO si è creato il duplicato.
 */
export async function GET(request: NextRequest) {
  const user = await getApiUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo admin" }, { status: 403 });
  }

  // Carica TUTTI gli ordini
  const ordersSnap = await adminDb.collection("orders").get();
  
  // Raggruppa per cleaningId
  const byCleaningId = new Map<string, any[]>();
  
  for (const doc of ordersSnap.docs) {
    const data = doc.data();
    const cleaningId = data.cleaningId;
    if (!cleaningId) continue;
    
    const orderInfo = {
      id: doc.id,
      cleaningId,
      property: data.propertyName || 'unknown',
      propertyId: data.propertyId || '',
      status: data.status || 'unknown',
      type: data.type || 'LINEN',
      itemsCount: (data.items || []).length,
      scheduledDate: data.scheduledDate?.toDate?.()?.toISOString() || null,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
      // Dati per capire ORIGINE
      hasPropertyCity: !!(data.propertyCity),
      hasPropertyFloor: !!(data.propertyFloor),
      hasNotes: !!(data.notes),
      hasPickup: data.includePickup === true,
      inventoryDeducted: data.inventoryDeducted === true,
    };
    
    if (!byCleaningId.has(cleaningId)) {
      byCleaningId.set(cleaningId, []);
    }
    byCleaningId.get(cleaningId)!.push(orderInfo);
  }

  // Trova duplicati (2+ ordini non-CANCELLED per lo stesso cleaningId)
  const duplicates: any[] = [];
  
  for (const [cleaningId, orders] of byCleaningId.entries()) {
    const nonCancelled = orders.filter(o => o.status !== 'CANCELLED');
    if (nonCancelled.length >= 2) {
      // Ordina per createdAt
      nonCancelled.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
      
      // Calcola differenza temporale tra creazione
      let timeDiffSeconds = null;
      if (nonCancelled[0].createdAt && nonCancelled[1].createdAt) {
        timeDiffSeconds = Math.abs(
          new Date(nonCancelled[1].createdAt).getTime() - new Date(nonCancelled[0].createdAt).getTime()
        ) / 1000;
      }
      
      // Cerca la pulizia per capire chi ha il laundryOrderId
      let laundryOrderId = null;
      try {
        const cleaningDoc = await adminDb.collection("cleanings").doc(cleaningId).get();
        if (cleaningDoc.exists) {
          laundryOrderId = cleaningDoc.data()?.laundryOrderId || null;
        }
      } catch {}
      
      duplicates.push({
        cleaningId,
        property: nonCancelled[0].property,
        laundryOrderId,
        timeDiffSeconds,
        orders: nonCancelled,
        // Analisi: quale è il "vero" ordine?
        likelyOriginal: laundryOrderId ? nonCancelled.find(o => o.id === laundryOrderId)?.id || nonCancelled[0].id : nonCancelled[0].id,
        likelyDuplicate: laundryOrderId 
          ? nonCancelled.find(o => o.id !== laundryOrderId)?.id 
          : nonCancelled[nonCancelled.length - 1].id,
      });
    }
  }

  // Anche ordini CANCELLED che puntano a cleaningId non esistenti
  const cancelledOrphans: any[] = [];
  for (const [cleaningId, orders] of byCleaningId.entries()) {
    const cancelled = orders.filter(o => o.status === 'CANCELLED');
    if (cancelled.length > 0) {
      try {
        const cleaningDoc = await adminDb.collection("cleanings").doc(cleaningId).get();
        if (!cleaningDoc.exists) {
          cancelledOrphans.push(...cancelled.map(o => ({
            ...o,
            reason: 'cleaningId non esiste più'
          })));
        }
      } catch {}
    }
  }

  return NextResponse.json({
    summary: {
      totalOrders: ordersSnap.docs.length,
      uniqueCleaningIds: byCleaningId.size,
      duplicateGroups: duplicates.length,
      cancelledOrphans: cancelledOrphans.length,
    },
    duplicates,
    cancelledOrphans: cancelledOrphans.slice(0, 20),
  });
}
