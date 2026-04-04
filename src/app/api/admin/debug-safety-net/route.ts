import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/debug-safety-net?propertyName=aubry
 * 
 * Simula il safety net del cron sync per una proprietà e mostra
 * passo per passo perché non crea gli ordini mancanti.
 */

export async function GET(request: NextRequest) {
  const user = await getApiUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo admin" }, { status: 403 });
  }

  const url = new URL(request.url);
  const name = url.searchParams.get("propertyName")?.toLowerCase();
  if (!name) return NextResponse.json({ error: "?propertyName= richiesto" }, { status: 400 });

  // Find property
  const propsSnap = await adminDb.collection("properties").get();
  const prop = propsSnap.docs
    .map(d => ({ id: d.id, ...d.data() as Record<string, any> }))
    .find(p => (p.name || "").toLowerCase().includes(name));

  if (!prop) return NextResponse.json({ error: `Proprietà "${name}" non trovata` }, { status: 404 });

  const steps: string[] = [];
  steps.push(`Proprietà: ${prop.name} (${prop.id})`);
  steps.push(`usesOwnLinen: ${prop.usesOwnLinen || false}`);

  if (prop.usesOwnLinen) {
    steps.push("⏭️ usesOwnLinen=true → safety net skippato");
    return NextResponse.json({ property: prop.name, steps });
  }

  // Load cleanings
  const cleaningsSnap = await adminDb.collection("cleanings").where("propertyId", "==", prop.id).get();
  const cleanings = cleaningsSnap.docs.map(d => ({ id: d.id, ...d.data() as Record<string, any> }));
  steps.push(`Pulizie totali: ${cleanings.length}`);

  // Load orders
  const ordersSnap = await adminDb.collection("orders").where("propertyId", "==", prop.id).get();
  const existingOrders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() as Record<string, any> }));
  steps.push(`Ordini totali: ${existingOrders.length}`);

  // Build maps (same logic as cron)
  const ordersByCleaningId = new Map<string, any>();
  const ordersByDateStr = new Map<string, any>();
  existingOrders.forEach(o => {
    if (o.status === 'CANCELLED') return;
    if (o.cleaningId) ordersByCleaningId.set(o.cleaningId, o);
    const date = o.scheduledDate?.toDate?.();
    if (date) ordersByDateStr.set(date.toISOString().split('T')[0], o);
  });
  steps.push(`Ordini attivi (non CANCELLED): byCleaningId=${ordersByCleaningId.size}, byDateStr=${ordersByDateStr.size}`);

  // Load exclusions
  const exclSnap = await adminDb.collection("syncExclusions").where("propertyId", "==", prop.id).get();
  const excludedDates = new Set<string>();
  exclSnap.docs.forEach(d => {
    const origDate = d.data().originalDate?.toDate?.();
    if (origDate) excludedDates.add(origDate.toISOString().split('T')[0]);
  });
  steps.push(`SyncExclusions: ${excludedDates.size} date escluse`);

  const pastLimit = new Date();
  pastLimit.setDate(pastLimit.getDate() - 30);

  const missing: any[] = [];

  for (const c of cleanings) {
    const cleaningDate = c.scheduledDate?.toDate?.();
    if (!cleaningDate) {
      continue;
    }
    if (cleaningDate < pastLimit) {
      continue;
    }
    const validStatuses = ['SCHEDULED', 'ASSIGNED', 'IN_PROGRESS'];
    if (!validStatuses.includes(c.status)) {
      continue;
    }
    const dateStr = cleaningDate.toISOString().split('T')[0];
    if (excludedDates.has(dateStr)) {
      continue;
    }
    const existingOrderByCleaningId = ordersByCleaningId.get(c.id);
    const existingOrderByDate = ordersByDateStr.get(dateStr);

    if (existingOrderByCleaningId) {
      continue; // has order by cleaningId
    }
    if (existingOrderByDate) {
      // This is the suspicious case — matched by DATE but not by cleaningId
      missing.push({
        cleaningId: c.id,
        date: dateStr,
        guestName: c.guestName,
        status: c.status,
        laundryOrderId: c.laundryOrderId,
        skippedBecause: `ordersByDateStr matched ordine ${existingOrderByDate.id} (cleaningId=${existingOrderByDate.cleaningId}, status=${existingOrderByDate.status})`,
        wouldBeCreated: false,
      });
      continue;
    }

    // No order found — safety net SHOULD create one
    missing.push({
      cleaningId: c.id,
      date: dateStr,
      guestName: c.guestName,
      status: c.status,
      laundryOrderId: c.laundryOrderId,
      skippedBecause: null,
      wouldBeCreated: true,
    });
  }

  steps.push(`Pulizie senza ordine trovate dal safety net: ${missing.filter(m => m.wouldBeCreated).length}`);
  steps.push(`Pulizie skippate per match data (possibile falso positivo): ${missing.filter(m => !m.wouldBeCreated).length}`);

  return NextResponse.json({
    property: prop.name,
    propertyId: prop.id,
    steps,
    cleaningsWithoutOrder: missing,
  });
}
