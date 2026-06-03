/**
 * DEBUG: traccia QUANDO sono stati creati i servizi vs quando è stato pagato.
 * GET /api/debug/service-timeline-v1?cronSecret=XXX&name=Michela&month=4&year=2026
 *
 * Elenca ogni pulizia e ordine del mese con createdAt/updatedAt, e i pagamenti
 * con la loro data. Serve a capire se la differenza (es. 8,10€) nasce da un
 * servizio aggiunto/modificato DOPO che il pagamento era già stato registrato.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const iso = (v: any) => v?.toDate?.()?.toISOString()?.slice(0, 16) || null;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  if (cronSecret && searchParams.get("cronSecret") !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const name = searchParams.get("name");
  const month = parseInt(searchParams.get("month") || "0");
  const year = parseInt(searchParams.get("year") || "0");
  if (!name || !month || !year) return NextResponse.json({ error: "Passa &name= &month= &year=" }, { status: 400 });

  try {
    const usersSnap = await adminDb.collection("users").get();
    const userDoc = usersSnap.docs.find(d => (d.data().name || "").toLowerCase().includes(name.toLowerCase()));
    if (!userDoc) return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
    const userId = userDoc.id;

    const propsSnap = await adminDb.collection("properties").get();
    const propCleaningPrice = new Map<string, number>();
    const propName = new Map<string, string>();
    const propIds: string[] = [];
    propsSnap.docs.forEach(d => {
      if (d.data().ownerId !== userId) return;
      propIds.push(d.id);
      propCleaningPrice.set(d.id, d.data().cleaningPrice || 0);
      propName.set(d.id, d.data().name || d.id);
    });

    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);

    const cleanSnap = await adminDb.collection("cleanings")
      .where("status", "==", "COMPLETED")
      .where("scheduledDate", ">=", Timestamp.fromDate(start))
      .where("scheduledDate", "<=", Timestamp.fromDate(end)).get();
    const ordSnap = await adminDb.collection("orders")
      .where("scheduledDate", ">=", Timestamp.fromDate(start))
      .where("scheduledDate", "<=", Timestamp.fromDate(end)).get();

    const pulizie = cleanSnap.docs.filter(d => propIds.includes(d.data().propertyId)).map(d => {
      const c = d.data();
      const prezzo = (c.priceOverride ?? c.price ?? propCleaningPrice.get(c.propertyId) ?? 0) + (c.holidayFee ?? 0);
      return { id: d.id, prop: propName.get(c.propertyId), data: iso(c.scheduledDate), prezzo: Math.round(prezzo*100)/100, createdAt: iso(c.createdAt), updatedAt: iso(c.updatedAt), completedAt: iso(c.completedAt) };
    }).sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));

    const completedIds = new Set(cleanSnap.docs.map(d => d.id));
    const ordini = ordSnap.docs.filter(d => {
      const o = d.data();
      if (!propIds.includes(o.propertyId)) return false;
      if (o.status === "CANCELLED") return false;
      return o.status === "DELIVERED" || (o.cleaningId && completedIds.has(o.cleaningId));
    }).map(d => {
      const o = d.data();
      let tot = 0;
      (o.items || []).forEach((it: any) => { tot += (it.totalPrice || (it.unitPrice || 0) * (it.quantity || 1)); });
      if (o.deliveryFee && o.deliveryFeeEnabled !== false) tot += o.deliveryFee;
      if (o.totalPriceOverride != null) tot = o.totalPriceOverride;
      return { id: d.id, prop: propName.get(o.propertyId), data: iso(o.deliveredAt) || iso(o.scheduledDate), prezzo: Math.round(tot*100)/100, createdAt: iso(o.createdAt), updatedAt: iso(o.updatedAt), deliveredAt: iso(o.deliveredAt) };
    }).sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));

    const paySnap = await adminDb.collection("payments").get();
    const pagamenti = paySnap.docs.filter(d => d.data().proprietarioId === userId && d.data().month === month && d.data().year === year).map(d => {
      const p = d.data();
      return { id: d.id, amount: p.amount, createdAt: iso(p.createdAt), type: p.type };
    });

    const totServizi = pulizie.reduce((s, x) => s + x.prezzo, 0) + ordini.reduce((s, x) => s + x.prezzo, 0);
    const totPagato = pagamenti.reduce((s, x) => s + (x.amount || 0), 0);

    return NextResponse.json({
      success: true,
      cliente: userDoc.data().name,
      mese: `${month}/${year}`,
      totaleServizi: Math.round(totServizi*100)/100,
      totalePagato: Math.round(totPagato*100)/100,
      differenza: Math.round((totServizi - totPagato)*100)/100,
      pagamenti,
      nota: "Confronta createdAt/updatedAt dei servizi con createdAt dei pagamenti. Se un servizio ha createdAt/updatedAt DOPO la data del pagamento, ecco da dove viene la differenza: è stato aggiunto/modificato dopo l'incasso.",
      pulizie,
      ordini,
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Errore", message: error?.message }, { status: 500 });
  }
}
