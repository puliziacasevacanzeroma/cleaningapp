import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const propertyName = url.searchParams.get("property") || "Pellegrino";
    
    // 1. Trova TUTTI gli ordini per questa proprietà
    const ordersSnap = await adminDb.collection("orders").get();
    const matchingOrders = ordersSnap.docs
      .filter(d => {
        const data = d.data();
        return (data.propertyName || "").toLowerCase().includes(propertyName.toLowerCase());
      })
      .map(d => {
        const data = d.data();
        return {
          id: d.id,
          propertyName: data.propertyName,
          propertyId: data.propertyId,
          status: data.status,
          cleaningId: data.cleaningId || null,
          scheduledDate: data.scheduledDate?.toDate?.()?.toISOString() || null,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
          items: (data.items || []).length,
          bedMaking: data.bedMaking || false,
          bedMakingFee: data.bedMakingFee || 0,
          deliveryFee: data.deliveryFee || 0,
          riderId: data.riderId || null,
          riderName: data.riderName || null,
          type: data.type || null,
          linenOnly: data.linenOnly || false,
          notes: data.notes || "",
          // Chi l'ha creato e quando
          createdBy: data.createdBy || data.requestedByRole || null,
          lastModifiedBy: data.lastModifiedBy || null,
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
        };
      })
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    // 2. Trova TUTTE le pulizie per questa proprietà
    const cleaningsSnap = await adminDb.collection("cleanings").get();
    const matchingCleanings = cleaningsSnap.docs
      .filter(d => {
        const data = d.data();
        return (data.propertyName || "").toLowerCase().includes(propertyName.toLowerCase());
      })
      .map(d => {
        const data = d.data();
        return {
          id: d.id,
          propertyName: data.propertyName,
          propertyId: data.propertyId,
          status: data.status,
          scheduledDate: data.scheduledDate?.toDate?.()?.toISOString() || null,
          hasLinenOrder: data.hasLinenOrder || false,
          laundryOrderId: data.laundryOrderId || null,
          serviceType: data.serviceType || null,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        };
      })
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    // 3. Analisi: ordini orfani (cleaningId che non esiste)
    const cleaningIds = new Set(matchingCleanings.map(c => c.id));
    const orphanOrders = matchingOrders.filter(o => o.cleaningId && !cleaningIds.has(o.cleaningId));

    // 4. Analisi: ordini duplicati per stessa data
    const ordersByDate: Record<string, typeof matchingOrders> = {};
    matchingOrders.forEach(o => {
      const date = o.scheduledDate?.split("T")[0] || "unknown";
      if (!ordersByDate[date]) ordersByDate[date] = [];
      ordersByDate[date].push(o);
    });
    const duplicateDates = Object.entries(ordersByDate)
      .filter(([_, orders]) => orders.length > 1)
      .map(([date, orders]) => ({ date, count: orders.length, orderIds: orders.map(o => o.id) }));

    return NextResponse.json({
      summary: {
        totalOrders: matchingOrders.length,
        totalCleanings: matchingCleanings.length,
        orphanOrders: orphanOrders.length,
        duplicateDates: duplicateDates.length,
      },
      orphanOrders,
      duplicateDates,
      orders: matchingOrders,
      cleanings: matchingCleanings,
    }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
