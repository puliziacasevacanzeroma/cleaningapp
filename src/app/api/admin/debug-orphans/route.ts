import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Not available in production" }, { status: 403 });

  try {
    const dateParam = req.nextUrl.searchParams.get('date');

    const propertiesSnap = await adminDb.collection('properties').get();
    const properties = new Map<string, any>();
    const activePropertyIds = new Set<string>();
    const inactivePropertyIds = new Set<string>();
    propertiesSnap.docs.forEach(d => {
      const data = { id: d.id, ...(d.data() as Record<string, any>) };
      properties.set(d.id, data);
      if ((data as any).status === 'ACTIVE') activePropertyIds.add(d.id); else inactivePropertyIds.add(d.id);
    });

    const mapSnap = (snap: FirebaseFirestore.QuerySnapshot, fields: (d: FirebaseFirestore.DocumentData) => any) =>
      snap.docs.map(d => ({ id: d.id, ...fields(d.data()) }));

    const allCleanings = mapSnap(await adminDb.collection('cleanings').get(), d => ({
      propertyId: d.propertyId || '', propertyName: d.propertyName || '', status: d.status || '',
      scheduledDate: d.scheduledDate?.toDate?.()?.toISOString() || null, scheduledTime: d.scheduledTime || null,
      guestName: d.guestName || '', guestsCount: d.guestsCount || null, bookingSource: d.bookingSource || '',
      bookingId: d.bookingId || '', createdAt: d.createdAt?.toDate?.()?.toISOString() || null,
      type: d.type || '', serviceType: d.serviceType || '', hasLinenOrder: d.hasLinenOrder,
    })) as any[];

    const allOrders = mapSnap(await adminDb.collection('orders').get(), d => ({
      propertyId: d.propertyId || '', propertyName: d.propertyName || '', status: d.status || '',
      scheduledDate: d.scheduledDate?.toDate?.()?.toISOString() || null, scheduledTime: d.scheduledTime || null,
      cleaningId: d.cleaningId || null, items: (d.items || []).length,
      createdAt: d.createdAt?.toDate?.()?.toISOString() || null, riderId: d.riderId || null, riderName: d.riderName || null, type: d.type || '',
    })) as any[];

    const allBookings = mapSnap(await adminDb.collection('bookings').get(), d => ({
      propertyId: d.propertyId || '', propertyName: d.propertyName || '', guestName: d.guestName || '',
      checkIn: d.checkIn?.toDate?.()?.toISOString() || null, checkOut: d.checkOut?.toDate?.()?.toISOString() || null,
      source: d.source || '', status: d.status || '', createdAt: d.createdAt?.toDate?.()?.toISOString() || null,
    })) as any[];

    let filterDate: string | null = null;
    if (dateParam) {
      if (dateParam === 'tomorrow') { const t = new Date(); t.setDate(t.getDate() + 1); filterDate = t.toISOString().split('T')[0]; }
      else if (dateParam === 'today') filterDate = new Date().toISOString().split('T')[0];
      else filterDate = dateParam;
    }

    const isOrphan = (propId: string) => { const p = properties.get(propId); return !p || p.status !== 'ACTIVE'; };
    const addReason = (propId: string) => ({ reason: !properties.has(propId) ? '❌ PROPRIETÀ ELIMINATA' : `⚠️ PROPRIETÀ ${properties.get(propId)?.status}`, propertyExists: properties.has(propId), propertyStatus: properties.get(propId)?.status || 'DELETED', propertyCurrentName: properties.get(propId)?.name || 'N/A' });

    const orphanedCleanings = allCleanings.filter(c => isOrphan(c.propertyId) && (!filterDate || c.scheduledDate?.startsWith(filterDate))).map(c => ({ ...c, ...addReason(c.propertyId) }));
    const orphanedOrders = allOrders.filter(o => isOrphan(o.propertyId) && (!filterDate || o.scheduledDate?.startsWith(filterDate))).map(o => ({ ...o, ...addReason(o.propertyId) }));
    const orphanedBookings = allBookings.filter(b => isOrphan(b.propertyId) && (!filterDate || b.checkIn?.startsWith(filterDate))).map(b => ({ ...b, ...addReason(b.propertyId), propertyCurrentName: properties.get(b.propertyId)?.name || 'N/A' }));

    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const tomorrowCleanings = allCleanings.filter(c => c.scheduledDate?.startsWith(tomorrowStr) && c.status !== 'CANCELLED');
    const tomorrowOrders = allOrders.filter(o => o.scheduledDate?.startsWith(tomorrowStr) && o.status !== 'CANCELLED');
    const suspiciousCleanings = tomorrowCleanings.filter(c => ['airbnb','grott'].some(k => (c.propertyName||'').toLowerCase().includes(k)));

    const now = new Date();
    const inactiveWithFutureData = Array.from(inactivePropertyIds).map(propId => {
      const prop = properties.get(propId);
      const futureCleanings = allCleanings.filter(c => c.propertyId === propId && c.scheduledDate && new Date(c.scheduledDate) > now && c.status !== 'CANCELLED');
      const futureOrders = allOrders.filter(o => o.propertyId === propId && o.scheduledDate && new Date(o.scheduledDate) > now && o.status !== 'CANCELLED');
      const futureBookings = allBookings.filter(b => b.propertyId === propId && b.checkIn && new Date(b.checkIn) > now);
      if (!futureCleanings.length && !futureOrders.length && !futureBookings.length) return null;
      return { propertyId: propId, propertyName: prop?.name || 'N/A', propertyStatus: prop?.status || 'N/A', deactivatedAt: prop?.deactivatedAt || null, futureCleanings: futureCleanings.length, futureOrders: futureOrders.length, futureBookings: futureBookings.length, cleaningsDetail: futureCleanings.slice(0, 10), ordersDetail: futureOrders.slice(0, 10) };
    }).filter(Boolean);

    return NextResponse.json({
      timestamp: new Date().toISOString(), filterDate: filterDate || 'NESSUNO',
      summary: { totalProperties: properties.size, activeProperties: activePropertyIds.size, inactiveProperties: inactivePropertyIds.size, totalCleanings: allCleanings.length, totalOrders: allOrders.length, totalBookings: allBookings.length, orphanedCleanings: orphanedCleanings.length, orphanedOrders: orphanedOrders.length, orphanedBookings: orphanedBookings.length },
      tomorrow: { date: tomorrowStr, allCleanings: tomorrowCleanings.map(c => ({ id: c.id, propertyId: c.propertyId, propertyName: c.propertyName, status: c.status, time: c.scheduledTime, guestName: c.guestName, source: c.bookingSource, propertyExists: properties.has(c.propertyId), propertyActive: activePropertyIds.has(c.propertyId), propertyCurrentName: properties.get(c.propertyId)?.name || '❌ ELIMINATA', propertyCurrentStatus: properties.get(c.propertyId)?.status || 'DELETED' })), allOrders: tomorrowOrders.map(o => ({ id: o.id, propertyId: o.propertyId, propertyName: o.propertyName, status: o.status, cleaningId: o.cleaningId, items: o.items, propertyExists: properties.has(o.propertyId), propertyActive: activePropertyIds.has(o.propertyId), propertyCurrentName: properties.get(o.propertyId)?.name || '❌ ELIMINATA' })), suspicious: suspiciousCleanings },
      inactiveWithFutureData,
      orphanedCleanings: orphanedCleanings.slice(0, 50), orphanedOrders: orphanedOrders.slice(0, 50), orphanedBookings: orphanedBookings.slice(0, 50),
      inactiveProperties: Array.from(inactivePropertyIds).map(id => ({ id, name: properties.get(id)?.name || 'N/A', status: properties.get(id)?.status, deactivatedAt: properties.get(id)?.deactivatedAt || null, ownerId: properties.get(id)?.ownerId || null })),
    });
  } catch (error) {
    console.error('Errore debug-orphans:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
