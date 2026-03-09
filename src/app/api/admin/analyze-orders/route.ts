import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = 'force-dynamic';
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  const urlSecret = req.nextUrl.searchParams.get('secret');
  if (urlSecret !== CRON_SECRET) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const ordersSnap = await adminDb.collection('orders').get();
    const orders = ordersSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
    const cleaningsSnap = await adminDb.collection('cleanings').get();
    const cleanings = cleaningsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const stats: any = { totalOrders: orders.length, totalCleanings: cleanings.length, byStatus: {}, byType: {}, ordersToday: 0, ordersFuture: 0, ordersPast: 0, ordersNoDate: 0, byMonth: {}, potentialDuplicates: 0, duplicateDetails: [], ordersWithoutCleaningId: 0, ordersWithoutItems: 0, ordersWithEmptyItems: 0, strangeOrders: [] };

    const ordersByPropertyDate = new Map<string, any[]>();
    for (const order of orders) {
      const o = order as any;
      const status = o.status || 'UNKNOWN'; stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
      const type = o.type || 'UNKNOWN'; stats.byType[type] = (stats.byType[type] || 0) + 1;
      const scheduledDate = o.scheduledDate?.toDate?.();
      if (!scheduledDate) {
        stats.ordersNoDate++;
        if (stats.strangeOrders.length < 5) stats.strangeOrders.push({ id: o.id, reason: 'No scheduledDate', propertyName: o.propertyName, createdAt: o.createdAt?.toDate?.()?.toISOString() });
      } else {
        const orderDate = new Date(scheduledDate); orderDate.setHours(0, 0, 0, 0);
        if (orderDate.getTime() === today.getTime()) stats.ordersToday++;
        else if (orderDate > today) stats.ordersFuture++;
        else stats.ordersPast++;
        const monthKey = `${scheduledDate.getFullYear()}-${String(scheduledDate.getMonth() + 1).padStart(2, '0')}`;
        stats.byMonth[monthKey] = (stats.byMonth[monthKey] || 0) + 1;
        const dateStr = scheduledDate.toISOString().split('T')[0];
        const key = `${o.propertyId}_${dateStr}`;
        if (!ordersByPropertyDate.has(key)) ordersByPropertyDate.set(key, []);
        ordersByPropertyDate.get(key)!.push({ id: o.id, propertyName: o.propertyName, status: o.status, createdAt: o.createdAt?.toDate?.()?.toISOString() });
      }
      if (!o.cleaningId) stats.ordersWithoutCleaningId++;
      if (!o.items) stats.ordersWithoutItems++;
      else if (o.items.length === 0) stats.ordersWithEmptyItems++;
    }

    for (const [key, ordersList] of ordersByPropertyDate.entries()) {
      if (ordersList.length > 1) {
        stats.potentialDuplicates += ordersList.length - 1;
        if (stats.duplicateDetails.length < 10) stats.duplicateDetails.push({ key, count: ordersList.length, orders: ordersList });
      }
    }
    stats.byMonth = Object.entries(stats.byMonth).sort(([a], [b]) => a.localeCompare(b)).reduce((acc: any, [k, v]) => ({ ...acc, [k]: v }), {});

    return NextResponse.json({ success: true, analysis: stats, summary: { message: `Trovati ${stats.totalOrders} ordini totali`, cleaningsComparison: `Ci sono ${stats.totalCleanings} pulizie vs ${stats.totalOrders} ordini`, ratio: (stats.totalOrders / stats.totalCleanings).toFixed(2), duplicatesWarning: stats.potentialDuplicates > 0 ? `⚠️ ${stats.potentialDuplicates} possibili duplicati trovati!` : '✅ Nessun duplicato evidente' } });
  } catch (error: any) {
    console.error('❌ Errore:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
