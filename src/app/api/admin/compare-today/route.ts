import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/compare-today
 * GET /api/admin/compare-today?date=2026-04-14
 * 
 * Confronta pulizie vs ordini biancheria per una data.
 * Mostra: pulizie senza ordine, ordini senza pulizia, match corretti.
 */
export async function GET(request: NextRequest) {
  const user = await getApiUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo admin" }, { status: 403 });
  }

  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date") || new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
  
  const [y, m, d] = dateParam.split('-').map(Number);
  const dayStart = Timestamp.fromDate(new Date(Date.UTC(y, m - 1, d, 0, 0, 0)));
  const dayEnd = Timestamp.fromDate(new Date(Date.UTC(y, m - 1, d, 23, 59, 59)));

  // Pulizie del giorno
  const cleaningsSnap = await adminDb.collection("cleanings")
    .where("scheduledDate", ">=", dayStart)
    .where("scheduledDate", "<=", dayEnd)
    .get();

  // Ordini del giorno
  const ordersSnap = await adminDb.collection("orders")
    .where("scheduledDate", ">=", dayStart)
    .where("scheduledDate", "<=", dayEnd)
    .get();

  const cleanings = cleaningsSnap.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      property: data.propertyName || 'unknown',
      propertyId: data.propertyId || '',
      status: data.status || 'unknown',
      laundryOrderId: data.laundryOrderId || null,
      hasLinenOrder: data.hasLinenOrder,
      bookingSource: data.bookingSource || '',
      date: data.scheduledDate?.toDate?.()?.toISOString().split('T')[0] || '',
    };
  });

  const orders = ordersSnap.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      property: data.propertyName || 'unknown',
      propertyId: data.propertyId || '',
      status: data.status || 'unknown',
      cleaningId: data.cleaningId || null,
      type: data.type || 'LINEN',
      itemsCount: (data.items || []).length,
      date: data.scheduledDate?.toDate?.()?.toISOString().split('T')[0] || '',
    };
  });

  // Match: ordini con cleaningId che corrisponde a una pulizia
  const cleaningIds = new Set(cleanings.map(c => c.id));
  const orderCleaningIds = new Set(orders.filter(o => o.cleaningId).map(o => o.cleaningId));

  // Ordini senza pulizia corrispondente oggi
  const ordiniOrfani = orders.filter(o => {
    if (!o.cleaningId) return true; // nessun cleaningId → orfano
    return !cleaningIds.has(o.cleaningId); // cleaningId non tra le pulizie di oggi
  });

  // Pulizie senza ordine corrispondente
  const pulizieSenzaOrdine = cleanings.filter(c => {
    // Ha laundryOrderId che punta a un ordine di oggi?
    const hasOrderToday = orders.some(o => o.cleaningId === c.id);
    return !hasOrderToday && c.hasLinenOrder !== false;
  });

  // Match corretti
  const match = orders.filter(o => o.cleaningId && cleaningIds.has(o.cleaningId));

  return NextResponse.json({
    data: dateParam,
    conteggi: {
      pulizie: cleanings.length,
      ordini: orders.length,
      differenza: orders.length - cleanings.length,
      matchCorretti: match.length,
      ordiniOrfani: ordiniOrfani.length,
      pulizieSenzaOrdine: pulizieSenzaOrdine.length,
    },
    ordiniOrfani,
    pulizieSenzaOrdine,
    tutteLePulizie: cleanings,
    tuttiGliOrdini: orders,
  });
}
