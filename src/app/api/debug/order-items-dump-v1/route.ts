/**
 * DEBUG: dump grezzo degli item di un ordine + cosa dice l'inventario.
 * GET /api/debug/order-items-dump-v1?cronSecret=XXX&orderId=XXX
 * (oppure &name=Michela&month=4&year=2026 per dumpare i primi ordini "prezzo 0")
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  if (cronSecret && searchParams.get("cronSecret") !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const orderId = searchParams.get("orderId");

  try {
    // inventario per lookup
    const invSnap = await adminDb.collection("inventory").get();
    const inv: Record<string, any> = {};
    invSnap.docs.forEach(d => {
      const x = d.data() as any;
      inv[d.id] = { name: x.name, sellPrice: x.sellPrice, price: x.price, key: x.key };
      if (x.key) inv[x.key] = { name: x.name, sellPrice: x.sellPrice, price: x.price, id: d.id };
    });

    const dumpOrder = (id: string, data: any) => ({
      orderId: id,
      status: data.status,
      totalPriceOverride: data.totalPriceOverride ?? null,
      deliveryFee: data.deliveryFee ?? null,
      items: (data.items || []).map((it: any) => {
        const key = it.itemId || it.id;
        return {
          name: it.name,
          itemId: it.itemId,
          id: it.id,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          price: it.price,
          totalPrice: it.totalPrice,
          priceOverride: it.priceOverride,
          type: it.type,
          inventarioCorrispondente: key ? (inv[key] || "NESSUN MATCH") : "NO KEY",
        };
      }),
    });

    if (orderId) {
      const d = await adminDb.collection("orders").doc(orderId).get();
      if (!d.exists) return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
      return NextResponse.json({ success: true, ordine: dumpOrder(d.id, d.data()) });
    }

    // altrimenti: primi 5 ordini "prezzo 0" del cliente nel mese
    const name = searchParams.get("name");
    const month = parseInt(searchParams.get("month") || "0");
    const year = parseInt(searchParams.get("year") || "0");
    if (!name || !month || !year) return NextResponse.json({ error: "Passa &orderId= oppure &name= &month= &year=" }, { status: 400 });

    const usersSnap = await adminDb.collection("users").get();
    const userDoc = usersSnap.docs.find(u => (u.data().name || "").toLowerCase().includes(name.toLowerCase()));
    if (!userDoc) return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
    const propsSnap = await adminDb.collection("properties").get();
    const propIds = propsSnap.docs.filter(p => p.data().ownerId === userDoc.id).map(p => p.id);

    const start = new Date(year, month - 1, 1), end = new Date(year, month, 0, 23, 59, 59);
    const ordSnap = await adminDb.collection("orders")
      .where("scheduledDate", ">=", Timestamp.fromDate(start))
      .where("scheduledDate", "<=", Timestamp.fromDate(end)).get();

    const zeroOrders = ordSnap.docs
      .filter(d => propIds.includes(d.data().propertyId) && d.data().status !== "CANCELLED")
      .map(d => dumpOrder(d.id, d.data()))
      .filter(o => {
        const tot = o.items.reduce((s: number, it: any) => s + (it.totalPrice || (it.unitPrice || 0) * (it.quantity || 1)), 0);
        return tot === 0 && o.items.length > 0;
      })
      .slice(0, 5);

    return NextResponse.json({
      success: true,
      nota: "Ordini con totale calcolato a 0 ma con item dentro. Guarda se gli item hanno unitPrice/price/totalPrice a 0/undefined e se l'inventarioCorrispondente ha un sellPrice.",
      numOrdiniZeroConItem: zeroOrders.length,
      ordini: zeroOrders,
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Errore", message: error?.message }, { status: 500 });
  }
}
