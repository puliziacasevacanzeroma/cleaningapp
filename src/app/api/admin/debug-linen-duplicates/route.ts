import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = 'force-dynamic';

function fmtDate(d: Date | null | undefined): string {
  if (!d) return 'N/A';
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}
function dateKey(d: Date | null | undefined): string {
  if (!d) return 'N/A';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Not available in production" }, { status: 403 });

  try {
    const propertyFilter = req.nextUrl.searchParams.get('property') || '';

    const [ordersSnap, cleaningsSnap, bookingsSnap, propertiesSnap, exclusionsSnap] = await Promise.all([
      adminDb.collection('orders').get(),
      adminDb.collection('cleanings').get(),
      adminDb.collection('bookings').get(),
      adminDb.collection('properties').where('status', '==', 'ACTIVE').get(),
      adminDb.collection('syncExclusions').get(),
    ]);

    const orders = ordersSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) })) as any[];
    const cleanings = cleaningsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) })) as any[];
    const bookings = bookingsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) })) as any[];
    const properties = propertiesSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) })) as any[];
    const exclusions = exclusionsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) })) as any[];

    const filteredOrders = propertyFilter ? orders.filter(o => o.propertyName?.toLowerCase().includes(propertyFilter.toLowerCase()) || o.propertyId === propertyFilter) : orders;

    // 1. Ordini duplicati
    const ordersByPropDate = new Map<string, any[]>();
    for (const order of filteredOrders) {
      if (order.status === 'CANCELLED') continue;
      const date = order.scheduledDate?.toDate?.();
      if (!date) continue;
      const key = `${order.propertyId}|${dateKey(date)}`;
      if (!ordersByPropDate.has(key)) ordersByPropDate.set(key, []);
      ordersByPropDate.get(key)!.push(order);
    }
    const duplicateGroups: any[] = [];
    for (const [key, group] of ordersByPropDate) {
      if (group.length > 1) {
        const [propId, date] = key.split('|');
        const prop = properties.find(p => p.id === propId);
        duplicateGroups.push({ propertyName: prop?.name || propId, date, count: group.length, orders: group.map(o => ({ id: o.id, status: o.status, cleaningId: o.cleaningId, createdAt: fmtDate(o.createdAt?.toDate?.()), items: o.items?.map((i: any) => `${i.name || i.itemId} x${i.quantity}`).join(', ') || 'N/A' })) });
      }
    }

    // 2. Ordini senza pulizia
    const orphanOrders: any[] = [];
    for (const order of filteredOrders) {
      if (order.status === 'CANCELLED') continue;
      if (!order.cleaningId) { orphanOrders.push({ id: order.id, propertyName: order.propertyName || order.propertyId, date: fmtDate(order.scheduledDate?.toDate?.()), status: order.status, createdAt: fmtDate(order.createdAt?.toDate?.()) }); continue; }
      const cleaning = cleanings.find(c => c.id === order.cleaningId);
      if (!cleaning) orphanOrders.push({ id: order.id, propertyName: order.propertyName || order.propertyId, date: fmtDate(order.scheduledDate?.toDate?.()), status: order.status, cleaningId: order.cleaningId, reason: 'Pulizia non trovata nel DB', createdAt: fmtDate(order.createdAt?.toDate?.()) });
    }

    // 3. Pulizie con multipli ordini
    const ordersByCleaningId = new Map<string, any[]>();
    for (const order of filteredOrders) {
      if (order.status === 'CANCELLED' || !order.cleaningId) continue;
      if (!ordersByCleaningId.has(order.cleaningId)) ordersByCleaningId.set(order.cleaningId, []);
      ordersByCleaningId.get(order.cleaningId)!.push(order);
    }
    const multipleOrderCleanings: any[] = [];
    for (const [cleaningId, orderList] of ordersByCleaningId) {
      if (orderList.length > 1) {
        const cleaning = cleanings.find(c => c.id === cleaningId);
        multipleOrderCleanings.push({ cleaningId, propertyName: cleaning?.propertyName || 'N/A', date: fmtDate(cleaning?.scheduledDate?.toDate?.()), cleaningStatus: cleaning?.status || 'N/A', orderCount: orderList.length, orders: orderList.map(o => ({ id: o.id, status: o.status, createdAt: fmtDate(o.createdAt?.toDate?.()) })) });
      }
    }

    // 4. Pulizie duplicate
    const cleaningsByPropDate = new Map<string, any[]>();
    for (const c of cleanings) {
      if (c.status === 'CANCELLED') continue;
      const date = c.scheduledDate?.toDate?.();
      if (!date) continue;
      if (propertyFilter && !c.propertyName?.toLowerCase().includes(propertyFilter.toLowerCase()) && c.propertyId !== propertyFilter) continue;
      const key = `${c.propertyId}|${dateKey(date)}`;
      if (!cleaningsByPropDate.has(key)) cleaningsByPropDate.set(key, []);
      cleaningsByPropDate.get(key)!.push(c);
    }
    const duplicateCleanings: any[] = [];
    for (const [key, group] of cleaningsByPropDate) {
      if (group.length > 1) {
        const [propId, date] = key.split('|');
        const prop = properties.find(p => p.id === propId);
        duplicateCleanings.push({ propertyName: prop?.name || propId, date, count: group.length, cleanings: group.map(c => ({ id: c.id, status: c.status, guestName: c.guestName, bookingSource: c.bookingSource, bookingId: c.bookingId, createdAt: fmtDate(c.createdAt?.toDate?.()) })) });
      }
    }

    // 5. Timeline
    const targetProp = propertyFilter ? properties.find(p => p.name?.toLowerCase().includes(propertyFilter.toLowerCase())) : properties.find(p => p.name?.toLowerCase().includes('leopardi'));
    let timeline: any[] = [];
    if (targetProp) {
      const propCleanings = cleanings.filter(c => c.propertyId === targetProp.id).sort((a: any, b: any) => (a.createdAt?.toDate?.()?.getTime() || 0) - (b.createdAt?.toDate?.()?.getTime() || 0));
      const propOrders = orders.filter(o => o.propertyId === targetProp.id).sort((a: any, b: any) => (a.createdAt?.toDate?.()?.getTime() || 0) - (b.createdAt?.toDate?.()?.getTime() || 0));
      const propBookings = bookings.filter(b => b.propertyId === targetProp.id && b.status !== 'CANCELLED').sort((a: any, b: any) => (a.checkIn?.toDate?.()?.getTime() || 0) - (b.checkIn?.toDate?.()?.getTime() || 0));
      const propExclusions = exclusions.filter(e => e.propertyId === targetProp.id);
      timeline = [
        { section: `📅 PRENOTAZIONI per ${targetProp.name}`, items: propBookings.map(b => ({ id: b.id, guest: b.guestName, source: b.source, checkIn: fmtDate(b.checkIn?.toDate?.()), checkOut: fmtDate(b.checkOut?.toDate?.()), checkOutKey: dateKey(b.checkOut?.toDate?.()), status: b.status })) },
        { section: `🧹 PULIZIE per ${targetProp.name}`, items: propCleanings.map(c => ({ id: c.id, date: fmtDate(c.scheduledDate?.toDate?.()), dateKey: dateKey(c.scheduledDate?.toDate?.()), status: c.status, guest: c.guestName, source: c.bookingSource, bookingId: c.bookingId, createdAt: fmtDate(c.createdAt?.toDate?.()), laundryOrderId: c.laundryOrderId || 'N/A' })) },
        { section: `📦 ORDINI per ${targetProp.name}`, items: propOrders.map(o => ({ id: o.id, date: fmtDate(o.scheduledDate?.toDate?.()), dateKey: dateKey(o.scheduledDate?.toDate?.()), status: o.status, cleaningId: o.cleaningId, createdAt: fmtDate(o.createdAt?.toDate?.()), items: o.items?.length || 0 })) },
        { section: `🔒 ESCLUSIONI per ${targetProp.name}`, items: propExclusions.map(e => ({ id: e.id, originalDate: fmtDate(e.originalDate?.toDate?.()), reason: e.reason, source: e.bookingSource, createdAt: fmtDate(e.createdAt?.toDate?.()) })) },
      ];
    }

    const summary = { totalOrders: filteredOrders.filter(o => o.status !== 'CANCELLED').length, totalCleanings: cleanings.filter(c => c.status !== 'CANCELLED').length, duplicateOrderGroups: duplicateGroups.length, orphanOrders: orphanOrders.length, cleaningsWithMultipleOrders: multipleOrderCleanings.length, duplicateCleaningGroups: duplicateCleanings.length };
    return NextResponse.json({ timestamp: new Date().toISOString(), filter: propertyFilter || 'ALL', summary, duplicateOrders: duplicateGroups, duplicateCleanings, orphanOrders, cleaningsWithMultipleOrders: multipleOrderCleanings, timeline });
  } catch (error: any) {
    console.error('Debug error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
