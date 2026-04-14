import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import { getItemName } from "~/lib/itemNames";

export const dynamic = 'force-dynamic';

/**
 * GET  /api/admin/fix-missing-orders         → Dry run (mostra cosa farebbe)
 * POST /api/admin/fix-missing-orders         → Crea gli ordini mancanti
 * 
 * Trova tutte le pulizie SCHEDULED/ASSIGNED/IN_PROGRESS senza ordine biancheria,
 * calcola gli items dalla serviceConfig della proprietà, e crea l'ordine.
 * 
 * Query params:
 *   ?days=14            (default 14 — quanti giorni avanti)
 *   ?propertyName=X     (opzionale — filtra)
 */

function calculateLinenItemsForProperty(prop: any, guestsCount: number): { id: string; name: string; quantity: number }[] {
  let items: { id: string; name: string; quantity: number }[] = [];
  if (prop.serviceConfigs) {
    const config = prop.serviceConfigs[guestsCount] || prop.serviceConfigs[String(guestsCount)];
    if (config) {
      if (config.bl) {
        const hasAll = config.bl['all'] && typeof config.bl['all'] === 'object' && Object.keys(config.bl['all']).length > 0;
        if (hasAll) {
          // 🔥 FIX: usa 'all' come base + integra articoli mancanti dai gruppi letto
          const mergedItems: Record<string, number> = {};
          Object.entries(config.bl).forEach(([key, val]: [string, any]) => {
            if (key !== 'all' && typeof val === 'object') {
              Object.entries(val).forEach(([itemId, qty]: [string, any]) => {
                if (typeof qty === 'number' && qty > 0) mergedItems[itemId] = (mergedItems[itemId] || 0) + qty;
              });
            }
          });
          Object.entries(config.bl['all']).forEach(([itemId, qty]: [string, any]) => {
            if (typeof qty === 'number' && qty > 0) mergedItems[itemId] = qty;
          });
          Object.entries(mergedItems).forEach(([itemId, qty]) => {
            if (qty > 0) items.push({ id: itemId, name: getItemName(itemId), quantity: qty });
          });
        } else {
          Object.entries(config.bl).forEach(([bedId, bedItems]: [string, any]) => {
            if (bedId !== 'all' && typeof bedItems === 'object') {
              Object.entries(bedItems).forEach(([itemId, qty]: [string, any]) => {
                if (typeof qty === 'number' && qty > 0) {
                  const existing = items.find(i => i.id === itemId);
                  if (existing) existing.quantity += qty;
                  else items.push({ id: itemId, name: getItemName(itemId), quantity: qty });
                }
              });
            }
          });
        }
      }
      if (config.ba) Object.entries(config.ba).forEach(([itemId, qty]: [string, any]) => {
        if (typeof qty === 'number' && qty > 0) items.push({ id: itemId, name: getItemName(itemId), quantity: qty });
      });
      if (config.ki) Object.entries(config.ki).forEach(([itemId, qty]: [string, any]) => {
        if (typeof qty === 'number' && qty > 0) items.push({ id: itemId, name: getItemName(itemId), quantity: qty });
      });
    }
  }
  return items;
}

async function findMissingOrders(days: number, filterPropertyName?: string, includeCompleted: boolean = false) {
  const since = new Date();
  since.setDate(since.getDate() - 2);
  const until = new Date();
  until.setDate(until.getDate() + days);

  const cleaningsSnap = await adminDb.collection("cleanings")
    .where("scheduledDate", ">=", Timestamp.fromDate(since))
    .where("scheduledDate", "<=", Timestamp.fromDate(until))
    .get();

  let cleanings = cleaningsSnap.docs
    .map(d => ({ id: d.id, ...d.data() as Record<string, any> }))
    .filter(c => {
      const statuses = ["SCHEDULED", "ASSIGNED", "IN_PROGRESS"];
      if (includeCompleted) statuses.push("COMPLETED");
      return statuses.includes(c.status);
    });

  if (filterPropertyName) {
    cleanings = cleanings.filter(c =>
      (c.propertyName || "").toLowerCase().includes(filterPropertyName.toLowerCase())
    );
  }

  // Load all orders in range
  const ordersSnap = await adminDb.collection("orders")
    .where("scheduledDate", ">=", Timestamp.fromDate(since))
    .where("scheduledDate", "<=", Timestamp.fromDate(until))
    .get();
  const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() as Record<string, any> }));

  const orderByCleaningId = new Map<string, any>();
  const orderByPropDate = new Map<string, any>();
  for (const o of orders) {
    if (o.status === "CANCELLED") continue;
    if (o.cleaningId) orderByCleaningId.set(o.cleaningId, o);
    if (o.propertyId && o.scheduledDate) {
      const d = o.scheduledDate?.toDate?.();
      if (d) orderByPropDate.set(`${o.propertyId}_${d.toISOString().split("T")[0]}`, o);
    }
  }

  // Load properties
  const propertyIds = new Set(cleanings.map(c => c.propertyId).filter(Boolean));
  const propertiesMap = new Map<string, any>();
  for (const pid of propertyIds) {
    try {
      const doc = await adminDb.collection("properties").doc(pid).get();
      if (doc.exists) propertiesMap.set(pid, { id: doc.id, ...doc.data() as Record<string, any> });
    } catch { /* ignore */ }
  }

  const missing: {
    cleaning: any;
    prop: any;
    dateStr: string;
    items: { id: string; name: string; quantity: number }[];
  }[] = [];

  for (const cleaning of cleanings) {
    const dateStr = cleaning.scheduledDate?.toDate?.()?.toISOString()?.split("T")[0] || "";
    const prop = propertiesMap.get(cleaning.propertyId);

    // Skip if property uses own linen
    if (prop?.usesOwnLinen === true) continue;

    // Check if order exists
    const hasOrder =
      orderByCleaningId.has(cleaning.id) ||
      (cleaning.laundryOrderId && orders.find(o => o.id === cleaning.laundryOrderId && o.status !== "CANCELLED")) ||
      orderByPropDate.has(`${cleaning.propertyId}_${dateStr}`);

    if (hasOrder) continue;

    // Also check directly on Firestore for laundryOrderId
    if (cleaning.laundryOrderId) {
      try {
        const directCheck = await adminDb.collection("orders").doc(cleaning.laundryOrderId).get();
        if (directCheck.exists && (directCheck.data() as any)?.status !== "CANCELLED") continue;
      } catch { /* ignore */ }
    }

    // Calculate items
    if (!prop) continue;
    const items = calculateLinenItemsForProperty(prop, cleaning.guestsCount || 2);
    if (items.length === 0) continue;

    missing.push({ cleaning, prop, dateStr, items });
  }

  return missing;
}

// GET = dry run
export async function GET(request: NextRequest) {
  const user = await getApiUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo admin" }, { status: 403 });
  }

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "14");
  const filterPropertyName = url.searchParams.get("propertyName") || undefined;
  const includeCompleted = url.searchParams.has("includeCompleted");

  const missing = await findMissingOrders(days, filterPropertyName, includeCompleted);

  return NextResponse.json({
    mode: "DRY_RUN — nessuna modifica",
    total: missing.length,
    willCreate: missing.map(m => ({
      cleaningId: m.cleaning.id,
      propertyName: m.cleaning.propertyName,
      scheduledDate: m.dateStr,
      guestsCount: m.cleaning.guestsCount,
      items: m.items.map(i => `${i.name} x${i.quantity}`),
    })),
  });
}

// POST = fix
export async function POST(request: NextRequest) {
  const user = await getApiUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo admin" }, { status: 403 });
  }

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "14");
  const filterPropertyName = url.searchParams.get("propertyName") || undefined;
  const includeCompleted = url.searchParams.has("includeCompleted");

  const missing = await findMissingOrders(days, filterPropertyName, includeCompleted);
  const created: any[] = [];
  const errors: any[] = [];

  for (const m of missing) {
    try {
      // Double check: order not already created by another process
      const checkSnap = await adminDb.collection("orders")
        .where("cleaningId", "==", m.cleaning.id)
        .limit(1)
        .get();
      if (!checkSnap.empty && (checkSnap.docs[0].data() as any).status !== "CANCELLED") {
        created.push({
          cleaningId: m.cleaning.id,
          propertyName: m.cleaning.propertyName,
          orderId: checkSnap.docs[0].id,
          note: "Ordine già esistente (creato nel frattempo)",
        });
        continue;
      }

      // Calculate pickup items
      let pickupItems: { id: string; name: string; quantity: number }[] = [];
      let pickupFromOrders: string[] = [];
      try {
        const LINEN_KEYWORDS = ['lenzuol', 'feder', 'copri', 'telo', 'asciugaman', 'accappato', 'tappet', 'scendi', 'coperta', 'cuscin', 'singol', 'matrimonial', 'bagno', 'viso', 'bidet'];
        const EXCLUDE_KEYWORDS = ['sapone', 'shampoo', 'bagnoschiuma', 'crema', 'detersivo', 'spray', 'detergente', 'kit', 'cortesia'];
        const deliveredSnap = await adminDb.collection('orders')
          .where('propertyId', '==', m.prop.id)
          .where('status', '==', 'DELIVERED')
          .get();
        const pending = deliveredSnap.docs.filter(d => d.data().pickupCompleted !== true);
        if (pending.length > 0) {
          const itemMap = new Map<string, { id: string; name: string; quantity: number }>();
          pending.forEach(d => {
            pickupFromOrders.push(d.id);
            const data = d.data() as Record<string, any>;
            (data.items || []).forEach((item: any) => {
              const name = (item.name || '').toLowerCase();
              const isLinen = LINEN_KEYWORDS.some(k => name.includes(k)) && !EXCLUDE_KEYWORDS.some(k => name.includes(k));
              if (isLinen && item.quantity > 0) {
                const existing = itemMap.get(item.id);
                if (existing) existing.quantity += item.quantity;
                else itemMap.set(item.id, { id: item.id, name: item.name, quantity: item.quantity });
              }
            });
          });
          pickupItems = Array.from(itemMap.values());
        }
      } catch { /* non bloccare */ }

      const scheduledDate = m.cleaning.scheduledDate?.toDate?.() || new Date(m.dateStr);

      const orderRef = await adminDb.collection("orders").add({
        cleaningId: m.cleaning.id,
        propertyId: m.prop.id,
        propertyName: m.prop.name,
        propertyAddress: m.prop.address || "",
        propertyCity: m.prop.city || "",
        propertyPostalCode: m.prop.postalCode || "",
        propertyFloor: m.prop.floor || "",
        propertyApartment: m.prop.apartment || "",
        propertyIntercom: m.prop.intercom || "",
        propertyDoorCode: m.prop.doorCode || "",
        propertyKeysLocation: m.prop.keysLocation || "",
        propertyAccessNotes: m.prop.accessNotes || "",
        status: "PENDING",
        type: "LINEN",
        scheduledDate: Timestamp.fromDate(scheduledDate),
        scheduledTime: m.prop.checkOutTime || "10:00",
        urgency: "normal",
        items: m.items,
        includePickup: pickupItems.length > 0,
        pickupItems,
        pickupFromOrders,
        pickupCompleted: false,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        createdByFix: true,
      });

      // Update cleaning
      await adminDb.collection("cleanings").doc(m.cleaning.id).update({
        laundryOrderId: orderRef.id,
        requiresLaundry: true,
        updatedAt: Timestamp.now(),
      });

      created.push({
        cleaningId: m.cleaning.id,
        propertyName: m.cleaning.propertyName,
        scheduledDate: m.dateStr,
        orderId: orderRef.id,
        itemsCount: m.items.length,
      });
    } catch (err: any) {
      errors.push({
        cleaningId: m.cleaning.id,
        propertyName: m.cleaning.propertyName,
        error: err?.message || "Errore sconosciuto",
      });
    }
  }

  return NextResponse.json({
    mode: "FIX ESEGUITO",
    created: created.length,
    errors: errors.length,
    createdDetails: created,
    errorDetails: errors,
  });
}
