import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Nessun auth - URL temporaneo per debug
  const email = req.nextUrl.searchParams.get("email") || "damianiariele@gmail.com";

  // 1. Trova utente
  const usersSnap = await adminDb.collection("users").where("email", "==", email).get();
  if (usersSnap.empty) return NextResponse.json({ error: `Utente ${email} non trovato` });
  const userDoc = usersSnap.docs[0];
  const userId = userDoc.id;
  const userData = userDoc.data();

  // 2. Proprietà
  const propsSnap = await adminDb.collection("properties").where("ownerId", "==", userId).get();
  const propertyIds = propsSnap.docs.map(d => d.id);
  const propNames = new Map(propsSnap.docs.map(d => [d.id, d.data().name || "?"]));
  const propList = propsSnap.docs.map(d => ({
    id: d.id, name: d.data().name, status: d.data().status, cleaningPrice: d.data().cleaningPrice || 0,
  }));

  if (propertyIds.length === 0) return NextResponse.json({ error: "Nessuna proprietà" });

  // 3. Pulizie
  const allCleanings: any[] = [];
  for (let i = 0; i < propertyIds.length; i += 10) {
    const chunk = propertyIds.slice(i, i + 10);
    const snap = await adminDb.collection("cleanings").where("propertyId", "in", chunk).get();
    snap.docs.forEach(d => allCleanings.push({ id: d.id, ...d.data() }));
  }
  allCleanings.sort((a, b) => (a.scheduledDate?.toDate?.()?.getTime() || 0) - (b.scheduledDate?.toDate?.()?.getTime() || 0));

  // 4. Ordini + inventory
  const allOrders: any[] = [];
  for (let i = 0; i < propertyIds.length; i += 10) {
    const chunk = propertyIds.slice(i, i + 10);
    const snap = await adminDb.collection("orders").where("propertyId", "in", chunk).get();
    snap.docs.forEach(d => allOrders.push({ id: d.id, ...d.data() }));
  }
  const invSnap = await adminDb.collection("inventory").get();
  const invById = new Map(invSnap.docs.map(d => [d.id, d.data() as any]));

  // Calcola totale ordini
  allOrders.forEach(o => {
    let tot = 0;
    if (o.totalPriceOverride != null) { tot = o.totalPriceOverride; }
    else if (Array.isArray(o.items)) {
      o.items.forEach((item: any) => {
        const inv = invById.get(item.id);
        tot += (item.priceOverride ?? item.unitPrice ?? item.price ?? inv?.sellPrice ?? 0) * (item.quantity || 1);
      });
      if (o.deliveryFee && o.deliveryFeeEnabled !== false) tot += o.deliveryFee;
    }
    o._total = Math.round(tot * 100) / 100;
  });

  // 5. Pagamenti
  let paymentsSnap = await adminDb.collection("payments").where("proprietarioId", "==", userId).get();
  if (paymentsSnap.empty) paymentsSnap = await adminDb.collection("payments").where("ownerId", "==", userId).get();

  // ══════ AGGREGAZIONE ══════
  const cleaningsByMonth: Record<string, any[]> = {};
  const statusCount: Record<string, number> = {};
  let totalePulizieCompleted = 0;

  allCleanings.forEach(c => {
    statusCount[c.status] = (statusCount[c.status] || 0) + 1;
    const date = c.scheduledDate?.toDate?.();
    if (!date) return;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!cleaningsByMonth[key]) cleaningsByMonth[key] = [];
    const price = c.priceOverride ?? c.price ?? 0;
    cleaningsByMonth[key].push({
      date: date.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }),
      status: c.status,
      price,
      property: propNames.get(c.propertyId) || "?",
      guest: c.guestName || "-",
    });
    if (c.status === "COMPLETED") totalePulizieCompleted += price;
  });

  const ordersByMonth: Record<string, any[]> = {};
  let totaleOrdiniDelivered = 0;

  allOrders.forEach(o => {
    const date = o.deliveredAt?.toDate?.() || o.scheduledDate?.toDate?.();
    if (!date) return;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!ordersByMonth[key]) ordersByMonth[key] = [];
    ordersByMonth[key].push({
      date: date.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }),
      status: o.status,
      total: o._total,
      property: propNames.get(o.propertyId) || "?",
      tipo: o.cleaningId ? "annesso" : "standalone",
      cleaningId: o.cleaningId || null,
    });
    if (o.status === "DELIVERED") totaleOrdiniDelivered += o._total;
  });

  const payments: any[] = [];
  let totalePagato = 0;
  const paymentsByMonth: Record<string, number> = {};

  paymentsSnap.docs.forEach(d => {
    const data = d.data();
    const amount = data.amount || 0;
    totalePagato += amount;
    const date = data.date?.toDate?.() || data.createdAt?.toDate?.();
    const mk = data.month && data.year ? `${data.year}-${String(data.month).padStart(2, "0")}` : "no-mese";
    paymentsByMonth[mk] = (paymentsByMonth[mk] || 0) + amount;
    payments.push({
      date: date ? date.toLocaleDateString("it-IT") : "??",
      amount,
      method: data.method || "?",
      competenza: mk,
      note: data.note || "",
    });
  });

  // Per mese come pagina pagamenti
  const allMonths = new Set<string>();
  Object.keys(cleaningsByMonth).forEach(k => allMonths.add(k));
  Object.keys(ordersByMonth).forEach(k => allMonths.add(k));

  const perMese: any[] = [];
  [...allMonths].sort().forEach(month => {
    const mC = cleaningsByMonth[month] || [];
    const mO = ordersByMonth[month] || [];
    const completedCleanings = mC.filter((c: any) => c.status === "COMPLETED");
    const pulTot = completedCleanings.reduce((s: number, c: any) => s + c.price, 0);
    
    // Ordini validi: DELIVERED o annessi a pulizia COMPLETED
    // Per gli annessi, dovremmo cercare il cleaningId tra le pulizie COMPLETED del mese
    const completedCleaningIds = new Set(
      allCleanings
        .filter(c => c.status === "COMPLETED" && c.scheduledDate?.toDate?.())
        .filter(c => {
          const d = c.scheduledDate.toDate();
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` === month;
        })
        .map(c => c.id)
    );
    
    const ordValidi = mO.filter((o: any) => o.status === "DELIVERED" || (o.cleaningId && completedCleaningIds.has(o.cleaningId)));
    const ordTot = ordValidi.reduce((s: number, o: any) => s + o.total, 0);
    const pagato = paymentsByMonth[month] || 0;
    const totale = Math.round((pulTot + ordTot) * 100) / 100;

    if (totale > 0 || pagato > 0) {
      perMese.push({
        mese: month,
        pulizieCompleted: completedCleanings.length,
        totalePulizie: Math.round(pulTot * 100) / 100,
        ordiniValidi: ordValidi.length,
        totaleOrdini: Math.round(ordTot * 100) / 100,
        totaleServizi: totale,
        pagato,
        saldo: Math.round((totale - pagato) * 100) / 100,
      });
    }
  });

  return NextResponse.json({
    utente: { name: userData.name, email: userData.email, id: userId, role: userData.role },
    proprieta: propList,
    riepilogoPulizie: {
      totale: allCleanings.length,
      perStatus: statusCount,
      totalePulizieCompleted: Math.round(totalePulizieCompleted * 100) / 100,
    },
    riepilogoOrdini: {
      totale: allOrders.length,
      totaleOrdiniDelivered: Math.round(totaleOrdiniDelivered * 100) / 100,
    },
    riepilogoPagamenti: {
      totale: paymentsSnap.size,
      totalePagato: Math.round(totalePagato * 100) / 100,
      dettaglio: payments,
      perMese: paymentsByMonth,
    },
    calcoloGlobaleAI: {
      pulizieCompleted: Math.round(totalePulizieCompleted * 100) / 100,
      ordiniDelivered: Math.round(totaleOrdiniDelivered * 100) / 100,
      totaleServizi: Math.round((totalePulizieCompleted + totaleOrdiniDelivered) * 100) / 100,
      totalePagato: Math.round(totalePagato * 100) / 100,
      saldoGlobale: Math.round((totalePulizieCompleted + totaleOrdiniDelivered - totalePagato) * 100) / 100,
    },
    calcoloPerMese: perMese,
    dettaglioPulizie: cleaningsByMonth,
    dettaglioOrdini: ordersByMonth,
  }, { status: 200 });
}
