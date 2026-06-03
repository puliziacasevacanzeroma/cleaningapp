/**
 * DEBUG: replica ESATTA del calcolo del CRON check-payment-blocks per un cliente.
 * GET /api/debug/cron-replica-v1?cronSecret=XXX&name=Michela
 *
 * Usa le STESSE identiche formule del cron (stessi campi, stessi filtri) così
 * vediamo perché il cron blocca un cliente che ha pagato. Mostra mese per mese
 * cosa "vede" il cron: servizi, pagato, saldo, scaduto, e i pagamenti grezzi.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SCADENZA_GIORNO = 10;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  if (cronSecret && searchParams.get("cronSecret") !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const name = searchParams.get("name");
  const ownerId = searchParams.get("ownerId");
  if (!name && !ownerId) return NextResponse.json({ error: "Passa &name= o &ownerId=" }, { status: 400 });

  try {
    // trova utente
    let userDoc: any = null;
    const usersSnap = await adminDb.collection("users").get();
    if (ownerId) userDoc = usersSnap.docs.find(d => d.id === ownerId);
    else userDoc = usersSnap.docs.find(d => (d.data().name || "").toLowerCase().includes(name!.toLowerCase()));
    if (!userDoc) return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });

    const userId = userDoc.id;
    const userData = userDoc.data();

    const now = new Date();
    const rangeStart = new Date(now.getFullYear() - 2, now.getMonth(), 1);

    // STESSE query del cron
    const [propsSnap, paymentsSnap, inventorySnap, cleaningsSnap, ordersSnap, overridesSnap] = await Promise.all([
      adminDb.collection("properties").where("status", "==", "ACTIVE").get(),
      adminDb.collection("payments").get(),
      adminDb.collection("inventory").get(),
      adminDb.collection("cleanings").where("status", "==", "COMPLETED").where("scheduledDate", ">=", Timestamp.fromDate(rangeStart)).get(),
      adminDb.collection("orders").where("scheduledDate", ">=", Timestamp.fromDate(rangeStart)).get(),
      adminDb.collection("paymentOverrides").get(),
    ]);

    // proprietà del cliente
    const propIds: string[] = [];
    const propCleaningPrice = new Map<string, number>();
    propsSnap.docs.forEach(d => {
      if (d.data().ownerId !== userId) return;
      propIds.push(d.id);
      if (d.data().cleaningPrice) propCleaningPrice.set(d.id, d.data().cleaningPrice);
    });

    // pagamenti grezzi del cliente (per ispezione)
    const rawPayments = paymentsSnap.docs
      .filter(d => d.data().proprietarioId === userId)
      .map(d => {
        const p = d.data();
        return { id: d.id, month: p.month, year: p.year, amount: p.amount, isCreditTransfer: p.isCreditTransfer === true, createdAt: p.createdAt?.toDate?.()?.toISOString()?.slice(0,10) };
      });

    // inventory
    const inventoryById = new Map<string, number>();
    inventorySnap.docs.forEach(d => {
      const data = d.data() as any;
      const sp = data.sellPrice ?? data.price ?? 0;
      inventoryById.set(d.id, sp);
      if (data.key) inventoryById.set(data.key, sp);
    });

    // cleanings per prop|mese (formula cron)
    const cleanByMonth = new Map<string, number>();
    const completedIds = new Set<string>();
    cleaningsSnap.docs.forEach(d => {
      completedIds.add(d.id);
      const data = d.data();
      if (data.propertyId && !propIds.includes(data.propertyId)) return;
      if (!propIds.includes(data.propertyId)) return;
      const date = data.scheduledDate?.toDate?.();
      if (!date) return;
      const k = `${date.getFullYear()}-${date.getMonth()+1}`;
      const price = (data.priceOverride ?? data.price ?? propCleaningPrice.get(data.propertyId) ?? 0) + (data.holidayFee ?? 0);
      cleanByMonth.set(k, (cleanByMonth.get(k) || 0) + price);
    });

    // orders per mese (formula cron)
    const ordByMonth = new Map<string, number>();
    ordersSnap.docs.forEach(d => {
      const data = d.data();
      if (!propIds.includes(data.propertyId)) return;
      if (data.status === "CANCELLED") return;
      const isDelivered = data.status === "DELIVERED";
      const isLinked = data.cleaningId && completedIds.has(data.cleaningId);
      if (!isDelivered && !isLinked) return;
      const date = data.deliveredAt?.toDate?.() || data.scheduledDate?.toDate?.();
      if (!date) return;
      let total = 0;
      (data.items || []).forEach((item: any) => {
        const itemKey = item.itemId || item.id;
        const inv = itemKey ? inventoryById.get(itemKey) : undefined;
        const unit = item.priceOverride ?? item.unitPrice ?? item.price ?? inv ?? 0;
        total += (item.totalPrice || (unit * (item.quantity || 1)));
      });
      if (data.deliveryFee && data.deliveryFeeEnabled !== false) total += data.deliveryFee;
      total = data.totalPriceOverride ?? total;
      const k = `${date.getFullYear()}-${date.getMonth()+1}`;
      ordByMonth.set(k, (ordByMonth.get(k) || 0) + total);
    });

    // overrides
    const ov = new Map<string, number>();
    overridesSnap.docs.forEach(d => {
      const o = d.data();
      if (o.proprietarioId !== userId) return;
      if (o.overrideTotal != null) ov.set(`${o.month}-${o.year}`, o.overrideTotal);
    });

    // analisi mese per mese (formula cron)
    const analisi: any[] = [];
    let hasOverdueDebt = false;
    for (let i = 1; i <= 24; i++) {
      let m = now.getMonth() + 1 - i, y = now.getFullYear();
      while (m <= 0) { m += 12; y--; }
      let totSer = (cleanByMonth.get(`${y}-${m}`) || 0) + (ordByMonth.get(`${y}-${m}`) || 0);
      if (totSer === 0) continue;
      if (ov.has(`${m}-${y}`)) totSer = ov.get(`${m}-${y}`)!;
      const totPag = rawPayments.filter(p => p.month === m && p.year === y && !p.isCreditTransfer).reduce((s, p) => s + p.amount, 0);
      const saldo = totSer - totPag;
      let scadM = m + 1, scadY = y; if (scadM > 12) { scadM = 1; scadY++; }
      const scadenza = new Date(scadY, scadM - 1, SCADENZA_GIORNO, 23, 59, 59);
      const scaduto = now > scadenza;
      const conta = scaduto && saldo > 0.01;
      if (conta) hasOverdueDebt = true;
      analisi.push({ mese: `${m}/${y}`, servizi: Math.round(totSer*100)/100, pagato: Math.round(totPag*100)/100, saldo: Math.round(saldo*100)/100, scaduto, contaPerBlocco: conta });
    }

    return NextResponse.json({
      success: true,
      cliente: userData.name,
      userId,
      VERDETTO_CRON: hasOverdueDebt ? "Il cron BLOCCA questo cliente" : "Il cron NON blocca questo cliente",
      statoBloccoAttuale: userData.paymentBlock || null,
      analisiMesi_comeIlCron: analisi,
      pagamentiGrezzi: rawPayments,
      nota: "Se VERDETTO_CRON dice BLOCCA ma il cliente ha pagato, guarda 'pagamentiGrezzi': probabilmente month/year sui pagamenti non corrispondono al mese dei servizi.",
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Errore", message: error?.message }, { status: 500 });
  }
}
