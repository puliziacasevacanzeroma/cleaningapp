/**
 * DEBUG: confronta gli items di una PULIZIA con quelli del suo ORDINE rider.
 * GET /api/debug/cleaning-vs-order-v1?cronSecret=XXX&property=Santa Cecilia&date=2026-06-03
 *
 * Trova la pulizia per proprietà+data e il suo ordine collegato, e mostra:
 *  - cosa contiene la pulizia (customLinenItems / servizi extra)
 *  - cosa contiene l'ordine del rider (items)
 *  - cosa MANCA nell'ordine (es. Prosecco dry presente in pulizia ma non in ordine)
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  if (cronSecret && searchParams.get("cronSecret") !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const propertyQ = searchParams.get("property");
  const dateQ = searchParams.get("date"); // YYYY-MM-DD opzionale
  if (!propertyQ) return NextResponse.json({ error: "Passa &property= (parte del nome)" }, { status: 400 });

  try {
    // trova la proprietà
    const propsSnap = await adminDb.collection("properties").get();
    const prop = propsSnap.docs.find(d => (d.data().name || "").toLowerCase().includes(propertyQ.toLowerCase()));
    if (!prop) return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    const propId = prop.id;

    // range data
    let start: Date, end: Date;
    if (dateQ) {
      start = new Date(dateQ + "T00:00:00");
      end = new Date(dateQ + "T23:59:59");
    } else {
      start = new Date(); start.setDate(start.getDate() - 3); start.setHours(0,0,0,0);
      end = new Date(); end.setDate(end.getDate() + 3); end.setHours(23,59,59,999);
    }

    // pulizie della proprietà nel range
    const cleanSnap = await adminDb.collection("cleanings")
      .where("propertyId", "==", propId)
      .where("scheduledDate", ">=", Timestamp.fromDate(start))
      .where("scheduledDate", "<=", Timestamp.fromDate(end))
      .get();

    // ordini della proprietà nel range
    const ordSnap = await adminDb.collection("orders")
      .where("propertyId", "==", propId)
      .where("scheduledDate", ">=", Timestamp.fromDate(start))
      .where("scheduledDate", "<=", Timestamp.fromDate(end))
      .get();

    const pulizie = cleanSnap.docs.map(d => {
      const c = d.data();
      return {
        cleaningId: d.id,
        data: c.scheduledDate?.toDate?.()?.toISOString()?.slice(0,16),
        status: c.status,
        customLinenItems: (c.customLinenItems || []).map((it: any) => ({ id: it.id, name: it.name, qty: it.quantity, categoryId: it.categoryId })),
        createLinenOrder: c.createLinenOrder,
      };
    });

    const ordini = ordSnap.docs.map(d => {
      const o = d.data();
      return {
        orderId: d.id,
        data: o.scheduledDate?.toDate?.()?.toISOString()?.slice(0,16),
        status: o.status,
        cleaningId: o.cleaningId || null,
        items: (o.items || []).map((it: any) => ({ id: it.itemId || it.id, name: it.name, qty: it.quantity, categoryId: it.categoryId, type: it.type })),
      };
    });

    // confronto: per ogni pulizia, cosa c'è nella pulizia ma NON nell'ordine collegato
    const confronto = pulizie.map(pul => {
      const ord = ordini.find(o => o.cleaningId === pul.cleaningId);
      const idsInOrder = new Set((ord?.items || []).map((i: any) => i.id));
      const mancantiNelloOrdine = pul.customLinenItems.filter((ci: any) => !idsInOrder.has(ci.id));
      return {
        cleaningId: pul.cleaningId,
        ordineCollegato: ord?.orderId || "NESSUN ORDINE COLLEGATO",
        itemsInPulizia: pul.customLinenItems.length,
        itemsInOrdine: ord?.items.length || 0,
        MANCANTI_NELLO_ORDINE: mancantiNelloOrdine,
      };
    });

    return NextResponse.json({
      success: true,
      proprieta: prop.data().name,
      pulizie,
      ordini,
      confronto,
      nota: "MANCANTI_NELLO_ORDINE = item presenti nella pulizia (es. Prosecco dry) ma assenti nell'ordine del rider. Se non è vuoto, ecco perché il rider non li vede.",
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Errore", message: error?.message }, { status: 500 });
  }
}
