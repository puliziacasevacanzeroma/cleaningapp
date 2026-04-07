/**
 * GET /api/cron/repair-linen?secret=XXXX
 *   → DRY RUN: mostra cosa verrebbe riparato senza toccare nulla
 * 
 * GET /api/cron/repair-linen?secret=XXXX&execute=true
 *   → ESEGUE la riparazione: aggiunge lenzuola agli ordini PENDING/READY che ne sono privi
 * 
 * Solo lettura a meno che &execute=true non sia specificato.
 * Sicuro da eseguire più volte (idempotente).
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET;

// ID noti per le lenzuola
const LENZ_KEYWORDS = ['double', 'matr', 'lenzuol', 'single', 'singol'];

function hasLenzuola(items: any[]): boolean {
  return items.some((i: any) => {
    const id = (i.id || '').toLowerCase();
    const name = (i.name || '').toLowerCase();
    return LENZ_KEYWORDS.some(k => id.includes(k) || name.includes(k));
  });
}

function hasBiancheriaItems(items: any[]): boolean {
  return items.some((i: any) => {
    const id = (i.id || '').toLowerCase();
    const name = (i.name || '').toLowerCase();
    return id.includes('pillow') || id.includes('feder') || id.includes('towel') || 
           name.includes('feder') || name.includes('asciugaman') || name.includes('telo');
  });
}

export async function GET(req: NextRequest) {
  const urlSecret = req.nextUrl.searchParams.get("secret");
  if (urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const execute = req.nextUrl.searchParams.get("execute") === "true";

  try {
    // ── Carica inventario per i prezzi ──
    const invSnap = await adminDb.collection("inventory").get();
    const invMap = new Map<string, any>();
    invSnap.docs.forEach(d => {
      const data = d.data();
      invMap.set(d.id, data);
      if (data.key) invMap.set(data.key, data);
    });

    const lenzMatrData = invMap.get('doubleSheets') || invMap.get('item_doubleSheets');
    const lenzSingData = invMap.get('singleSheets') || invMap.get('item_singleSheets');
    const lenzMatrPrice = lenzMatrData?.sellPrice || 0;
    const lenzSingPrice = lenzSingData?.sellPrice || 0;

    // ── Carica tutte le proprietà per bedrooms ──
    const propsSnap = await adminDb.collection("properties").get();
    const propsMap = new Map<string, any>();
    propsSnap.docs.forEach(d => propsMap.set(d.id, { id: d.id, ...d.data() }));

    // ── Trova ordini PENDING/READY senza lenzuola ──
    const ordersSnap = await adminDb.collection("orders")
      .where("status", "in", ["PENDING", "READY"])
      .get();

    const toRepair: Array<{
      orderId: string;
      propertyName: string;
      propertyId: string;
      scheduledDate: string;
      guestsCount: number;
      bedrooms: number;
      currentItems: string[];
      addedItems: Array<{ id: string; name: string; quantity: number; price: number }>;
    }> = [];

    let skippedOk = 0;
    let skippedNoItems = 0;
    let skippedOwnLinen = 0;

    for (const docSnap of ordersSnap.docs) {
      const order = docSnap.data();
      const items = order.items || [];

      // Skip ordini senza items
      if (items.length === 0) { skippedNoItems++; continue; }

      // Skip se ha già lenzuola
      if (hasLenzuola(items)) { skippedOk++; continue; }

      // Skip se non ha neanche biancheria bagno/federe (potrebbe essere solo kit)
      if (!hasBiancheriaItems(items)) { skippedNoItems++; continue; }

      // Trova la proprietà
      const prop = propsMap.get(order.propertyId);
      if (!prop) continue;

      // Skip se usa biancheria propria
      if (prop.usesOwnLinen) { skippedOwnLinen++; continue; }

      // Calcola lenzuola necessarie
      const guestsCount = order.guestsCount || prop.maxGuests || 2;
      const bedrooms = prop.bedrooms || 1;
      const matrimonialiNeeded = Math.min(bedrooms, Math.ceil(guestsCount / 2));
      const postiMatr = matrimonialiNeeded * 2;
      const singolariNeeded = Math.max(0, guestsCount - postiMatr);

      const addedItems: Array<{ id: string; name: string; quantity: number; price: number }> = [];

      if (matrimonialiNeeded > 0) {
        addedItems.push({
          id: 'doubleSheets',
          name: 'Lenzuola Matrimoniali',
          quantity: matrimonialiNeeded * 3,
          price: lenzMatrPrice,
        });
      }
      if (singolariNeeded > 0) {
        addedItems.push({
          id: 'singleSheets',
          name: 'Lenzuola Singole',
          quantity: singolariNeeded * 3,
          price: lenzSingPrice,
        });
      }

      if (addedItems.length === 0) continue;

      const scheduledDate = order.scheduledDate?.toDate
        ? order.scheduledDate.toDate().toLocaleDateString('it-IT')
        : '?';

      toRepair.push({
        orderId: docSnap.id,
        propertyName: order.propertyName || prop.name || order.propertyId,
        propertyId: order.propertyId,
        scheduledDate,
        guestsCount,
        bedrooms,
        currentItems: items.map((i: any) => `${i.name || i.id} x${i.quantity}`),
        addedItems,
      });
    }

    // ── Esegui riparazione se richiesto ──
    let repaired = 0;
    let errors: string[] = [];

    if (execute && toRepair.length > 0) {
      // Batch write (max 500 per batch)
      const BATCH_SIZE = 400;
      for (let i = 0; i < toRepair.length; i += BATCH_SIZE) {
        const batch = adminDb.batch();
        const chunk = toRepair.slice(i, i + BATCH_SIZE);

        for (const repair of chunk) {
          try {
            const orderRef = adminDb.collection("orders").doc(repair.orderId);
            const orderSnap = await orderRef.get();
            if (!orderSnap.exists) { errors.push(`${repair.orderId}: ordine non trovato`); continue; }

            const currentData = orderSnap.data()!;
            const currentItems = currentData.items || [];

            // Doppio check: non aggiungere se nel frattempo qualcuno ha aggiunto lenzuola
            if (hasLenzuola(currentItems)) { continue; }

            // Aggiungi lenzuola agli items esistenti
            const newItems = [
              ...currentItems,
              ...repair.addedItems.map(a => ({
                id: a.id,
                name: a.name,
                quantity: a.quantity,
                price: a.price,
                categoryId: 'biancheria_letto',
                _addedByRepairScript: true,
              })),
            ];

            batch.update(orderRef, {
              items: newItems,
              _repairedAt: Timestamp.now(),
              _repairReason: 'lenzuola_mancanti',
            });
            repaired++;
          } catch (err: any) {
            errors.push(`${repair.orderId}: ${err.message}`);
          }
        }

        await batch.commit();
      }
    }

    // ── Riepilogo per proprietà ──
    const byProperty = new Map<string, number>();
    toRepair.forEach(r => {
      byProperty.set(r.propertyName, (byProperty.get(r.propertyName) || 0) + 1);
    });

    return NextResponse.json({
      mode: execute ? "EXECUTE" : "DRY RUN (aggiungi &execute=true per riparare)",
      timestamp: new Date().toISOString(),
      summary: {
        totalOrdersScanned: ordersSnap.docs.length,
        ordersAlreadyOk: skippedOk,
        ordersNoItems: skippedNoItems,
        ordersOwnLinen: skippedOwnLinen,
        ordersToRepair: toRepair.length,
        ...(execute ? { repaired, errors: errors.length } : {}),
      },
      byProperty: Object.fromEntries(
        Array.from(byProperty.entries()).sort((a, b) => b[1] - a[1])
      ),
      ...(execute && errors.length > 0 ? { errors } : {}),
      orders: toRepair.map(r => ({
        orderId: r.orderId,
        property: r.propertyName,
        date: r.scheduledDate,
        guests: r.guestsCount,
        bedrooms: r.bedrooms,
        currentItems: r.currentItems,
        willAdd: r.addedItems.map(a => `${a.name} x${a.quantity} (€${a.price}/pz)`),
      })),
    });
  } catch (error: any) {
    console.error("[repair-linen] Errore:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
