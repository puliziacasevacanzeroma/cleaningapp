import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const _user = await getApiUser();
    if (!_user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    if (_user.role?.toUpperCase() !== "ADMIN") return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

    const dryRun = req.nextUrl.searchParams.get('dryRun') !== 'false';

    const propertiesSnap = await adminDb.collection('properties').get();
    const propertyMap = new Map<string, { name: string; address: string }>();
    propertiesSnap.docs.forEach(d => { const data = d.data() as Record<string, any>; propertyMap.set(d.id, { name: data.name || '', address: data.address || '' }); });

    const fixes: any[] = [];
    let fixedCleanings = 0, fixedOrders = 0, fixedBookings = 0;

    const cleaningsSnap = await adminDb.collection('cleanings').get();
    for (const docSnap of cleaningsSnap.docs) {
      const data = docSnap.data() as Record<string, any>; const prop = propertyMap.get(data.propertyId); if (!prop) continue;
      const needsNameFix = data.propertyName && data.propertyName !== prop.name;
      const needsAddrFix = prop.address && data.propertyAddress && data.propertyAddress !== prop.address;
      if (needsNameFix || needsAddrFix) {
        const updateData: any = { updatedAt: Timestamp.now() };
        if (needsNameFix) updateData.propertyName = prop.name;
        if (needsAddrFix) updateData.propertyAddress = prop.address;
        fixes.push({ type: 'CLEANING', id: docSnap.id, oldName: data.propertyName, newName: prop.name, date: data.scheduledDate?.toDate?.()?.toISOString()?.split('T')[0] || '?' });
        if (!dryRun) await docSnap.ref.update(updateData);
        fixedCleanings++;
      }
    }

    const ordersSnap = await adminDb.collection('orders').get();
    for (const docSnap of ordersSnap.docs) {
      const data = docSnap.data() as Record<string, any>; const prop = propertyMap.get(data.propertyId); if (!prop) continue;
      const needsNameFix = data.propertyName && data.propertyName !== prop.name;
      const needsAddrFix = prop.address && data.propertyAddress && data.propertyAddress !== prop.address;
      if (needsNameFix || needsAddrFix) {
        const updateData: any = { updatedAt: Timestamp.now() };
        if (needsNameFix) updateData.propertyName = prop.name;
        if (needsAddrFix) updateData.propertyAddress = prop.address;
        fixes.push({ type: 'ORDER', id: docSnap.id, oldName: data.propertyName, newName: prop.name, date: data.scheduledDate?.toDate?.()?.toISOString()?.split('T')[0] || '?' });
        if (!dryRun) await docSnap.ref.update(updateData);
        fixedOrders++;
      }
    }

    const bookingsSnap = await adminDb.collection('bookings').get();
    for (const docSnap of bookingsSnap.docs) {
      const data = docSnap.data() as Record<string, any>; const prop = propertyMap.get(data.propertyId); if (!prop) continue;
      if (data.propertyName && data.propertyName !== prop.name) {
        fixes.push({ type: 'BOOKING', id: docSnap.id, oldName: data.propertyName, newName: prop.name, checkIn: data.checkIn?.toDate?.()?.toISOString()?.split('T')[0] || '?' });
        if (!dryRun) await docSnap.ref.update({ propertyName: prop.name, updatedAt: Timestamp.now() });
        fixedBookings++;
      }
    }

    return NextResponse.json({ mode: dryRun ? '🔍 DRY RUN' : '✅ ESEGUITO', summary: { cleaningsFixed: fixedCleanings, ordersFixed: fixedOrders, bookingsFixed: fixedBookings, total: fixedCleanings + fixedOrders + fixedBookings }, fixes: fixes.slice(0, 100) });
  } catch (error) {
    console.error('Errore fix-property-names:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
