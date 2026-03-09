import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const _user = await getApiUser();
    if (!_user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    if (_user.role?.toUpperCase() !== "ADMIN") return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

    const dryRun = req.nextUrl.searchParams.get('dryRun') !== 'false';
    const onlyFuture = req.nextUrl.searchParams.get('onlyFuture') === 'true';
    const targetPropertyId = req.nextUrl.searchParams.get('propertyId');
    const now = new Date();

    const propertiesSnap = await adminDb.collection('properties').get();
    const activePropertyIds = new Set<string>();
    const allPropertyIds = new Set<string>();
    propertiesSnap.docs.forEach(d => {
      allPropertyIds.add(d.id);
      if ((d.data() as Record<string, any>).status === 'ACTIVE') activePropertyIds.add(d.id);
    });

    let deletedCleanings = 0, deletedOrders = 0, deletedBookings = 0;
    const details: any[] = [];

    const isOrphan = (propertyId: string) => targetPropertyId ? propertyId === targetPropertyId : !activePropertyIds.has(propertyId);

    const cleaningsSnap = await adminDb.collection('cleanings').get();
    for (const docSnap of cleaningsSnap.docs) {
      const data = docSnap.data() as Record<string, any>;
      if (!isOrphan(data.propertyId)) continue;
      if (data.status === 'CANCELLED') continue;
      const scheduledDate = data.scheduledDate?.toDate?.();
      if (onlyFuture && scheduledDate && scheduledDate < now) continue;
      details.push({ type: 'CLEANING', id: docSnap.id, propertyId: data.propertyId, propertyName: data.propertyName || '', scheduledDate: scheduledDate?.toISOString() || null, status: data.status, propertyExists: allPropertyIds.has(data.propertyId) });
      if (!dryRun) await docSnap.ref.delete();
      deletedCleanings++;
    }

    const ordersSnap = await adminDb.collection('orders').get();
    for (const docSnap of ordersSnap.docs) {
      const data = docSnap.data() as Record<string, any>;
      if (!isOrphan(data.propertyId)) continue;
      if (data.status === 'CANCELLED') continue;
      const scheduledDate = data.scheduledDate?.toDate?.();
      if (onlyFuture && scheduledDate && scheduledDate < now) continue;
      details.push({ type: 'ORDER', id: docSnap.id, propertyId: data.propertyId, propertyName: data.propertyName || '', scheduledDate: scheduledDate?.toISOString() || null, status: data.status, cleaningId: data.cleaningId || null, propertyExists: allPropertyIds.has(data.propertyId) });
      if (!dryRun) await docSnap.ref.delete();
      deletedOrders++;
    }

    const bookingsSnap = await adminDb.collection('bookings').get();
    for (const docSnap of bookingsSnap.docs) {
      const data = docSnap.data() as Record<string, any>;
      if (!isOrphan(data.propertyId)) continue;
      const checkIn = data.checkIn?.toDate?.();
      if (onlyFuture && checkIn && checkIn < now) continue;
      details.push({ type: 'BOOKING', id: docSnap.id, propertyId: data.propertyId, propertyName: data.propertyName || '', checkIn: checkIn?.toISOString() || null, checkOut: data.checkOut?.toDate?.()?.toISOString() || null, guestName: data.guestName || '', source: data.source || '', propertyExists: allPropertyIds.has(data.propertyId) });
      if (!dryRun) await docSnap.ref.delete();
      deletedBookings++;
    }

    return NextResponse.json({ mode: dryRun ? '🔍 DRY RUN (anteprima - nulla eliminato)' : '🗑️ ESEGUITO (dati eliminati)', onlyFuture, targetPropertyId: targetPropertyId || 'TUTTI (proprietà eliminate/disattivate)', summary: { cleaningsToDelete: deletedCleanings, ordersToDelete: deletedOrders, bookingsToDelete: deletedBookings, total: deletedCleanings + deletedOrders + deletedBookings }, details: details.slice(0, 200) });
  } catch (error) {
    console.error('Errore clean-orphans:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
