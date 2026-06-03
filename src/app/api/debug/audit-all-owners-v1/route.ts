/**
 * AUDIT: verifica i conti di TUTTI i proprietari col motore corretto.
 * GET /api/debug/audit-all-owners-v1?cronSecret=XXX
 *
 * Per ogni proprietario calcola, mese per mese (mesi scaduti), servizi vs
 * pagato col calcolo CORRETTO (prodotti-pulizia esclusi, come pagina/cron).
 * Segnala chi ha un saldo != 0 su mesi scaduti = debito reale o anomalia.
 *
 * Tre liste in output:
 *  - inRegola: saldo 0 ovunque sui mesi scaduti
 *  - debitiReali: hanno saldo > soglia su un mese scaduto (debito vero)
 *  - microScarti: saldo piccolo (< 1€) → possibile arrotondamento residuo
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { isCleaningProductItem } from "~/lib/payments/debtCalculator";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SCADENZA_GIORNO = 10;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  if (cronSecret && searchParams.get("cronSecret") !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const now = new Date();
    const rangeStart = new Date(now.getFullYear() - 2, now.getMonth(), 1);
    const startTs = Timestamp.fromDate(rangeStart);

    const [usersSnap, propsSnap, paymentsSnap, inventorySnap, cleaningsSnap, ordersSnap, overridesSnap] = await Promise.all([
      adminDb.collection("users").where("role", "in", ["PROPRIETARIO", "CLIENTE", "OWNER"]).where("status", "==", "ACTIVE").get(),
      adminDb.collection("properties").where("status", "==", "ACTIVE").get(),
      adminDb.collection("payments").get(),
      adminDb.collection("inventory").get(),
      adminDb.collection("cleanings").where("status", "==", "COMPLETED").where("scheduledDate", ">=", startTs).get(),
      adminDb.collection("orders").where("scheduledDate", ">=", startTs).get(),
      adminDb.collection("paymentOverrides").get(),
    ]);

    // mappe owner
    const propsByOwner = new Map<string, string[]>();
    const propCleanPrice = new Map<string, number>();
    propsSnap.docs.forEach(d => {
      const oid = d.data().ownerId; if (!oid) return;
      if (!propsByOwner.has(oid)) propsByOwner.set(oid, []);
      propsByOwner.get(oid)!.push(d.id);
      propCleanPrice.set(d.id, d.data().cleaningPrice || 0);
    });
    const payByOwner = new Map<string, any[]>();
    paymentsSnap.docs.forEach(d => {
      const oid = d.data().proprietarioId; if (!oid) return;
      if (!payByOwner.has(oid)) payByOwner.set(oid, []);
      payByOwner.get(oid)!.push(d.data());
    });
    const ovByOwner = new Map<string, Map<string, number>>();
    overridesSnap.docs.forEach(d => {
      const o = d.data(); const oid = o.proprietarioId; if (!oid) return;
      if (!ovByOwner.has(oid)) ovByOwner.set(oid, new Map());
      if (o.overrideTotal != null) ovByOwner.get(oid)!.set(`${o.month}-${o.year}`, o.overrideTotal);
    });

    const inv = new Map<string, number>();
    inventorySnap.docs.forEach(d => {
      const x = d.data() as any; const sp = x.sellPrice ?? x.price ?? 0;
      inv.set(d.id, sp); if (x.key) inv.set(x.key, sp);
      if (d.id.startsWith("item_")) inv.set(d.id.replace("item_", ""), sp);
    });

    // servizi per prop|mese (formula CORRETTA)
    const cleanByPM = new Map<string, number>();
    const completedIds = new Set(cleaningsSnap.docs.map(d => d.id));
    cleaningsSnap.docs.forEach(d => {
      const c = d.data(); const date = c.scheduledDate?.toDate?.(); if (!c.propertyId || !date) return;
      const price = (c.priceOverride ?? c.price ?? propCleanPrice.get(c.propertyId) ?? 0) + (c.holidayFee ?? 0);
      const k = `${c.propertyId}|${date.getFullYear()}-${date.getMonth()+1}`;
      cleanByPM.set(k, (cleanByPM.get(k) || 0) + price);
    });
    const ordByPM = new Map<string, number>();
    ordersSnap.docs.forEach(d => {
      const o = d.data(); if (o.status === "CANCELLED") return;
      const isDelivered = o.status === "DELIVERED";
      const isLinked = o.cleaningId && completedIds.has(o.cleaningId);
      if (!isDelivered && !isLinked) return;
      const date = o.deliveredAt?.toDate?.() || o.scheduledDate?.toDate?.(); if (!o.propertyId || !date) return;
      let total = 0;
      (o.items || []).forEach((item: any) => {
        if (isCleaningProductItem(item)) return;
        const key = item.itemId || item.id;
        const unit = item.priceOverride ?? (item.unitPrice || undefined) ?? (item.price || undefined) ?? (key ? inv.get(key) : undefined) ?? 0;
        total += ((item.totalPrice || undefined) ?? (unit * (item.quantity || 1)));
      });
      if (o.deliveryFee && o.deliveryFeeEnabled !== false) total += o.deliveryFee;
      total = o.totalPriceOverride ?? total;
      const k = `${o.propertyId}|${date.getFullYear()}-${date.getMonth()+1}`;
      ordByPM.set(k, (ordByPM.get(k) || 0) + total);
    });

    const inRegola: any[] = [];
    const debitiReali: any[] = [];
    const microScarti: any[] = [];

    for (const u of usersSnap.docs) {
      const userId = u.id;
      const propIds = propsByOwner.get(userId) || [];
      if (propIds.length === 0) continue;
      const payments = payByOwner.get(userId) || [];
      const ov = ovByOwner.get(userId);

      let maxDebitoScaduto = 0;
      let meseDebito = "";
      for (let i = 1; i <= 24; i++) {
        let m = now.getMonth() + 1 - i, y = now.getFullYear();
        while (m <= 0) { m += 12; y--; }
        let totSer = 0;
        for (const pid of propIds) totSer += (cleanByPM.get(`${pid}|${y}-${m}`) || 0) + (ordByPM.get(`${pid}|${y}-${m}`) || 0);
        if (totSer === 0) continue;
        if (ov?.has(`${m}-${y}`)) totSer = ov.get(`${m}-${y}`)!;
        const totPag = payments.filter(p => p.month===m && p.year===y && p.isCreditTransfer!==true).reduce((s,p)=>s+p.amount,0);
        const saldo = totSer - totPag;
        let scadM = m+1, scadY = y; if (scadM>12){scadM=1;scadY++;}
        const scadenza = new Date(scadY, scadM-1, SCADENZA_GIORNO, 23,59,59);
        if (now > scadenza && saldo > maxDebitoScaduto) { maxDebitoScaduto = saldo; meseDebito = `${m}/${y}`; }
      }

      const nome = u.data().name || u.data().email;
      if (maxDebitoScaduto <= 0.01) inRegola.push({ nome });
      else if (maxDebitoScaduto < 1) microScarti.push({ nome, scarto: Math.round(maxDebitoScaduto*100)/100, mese: meseDebito });
      else debitiReali.push({ nome, debito: Math.round(maxDebitoScaduto*100)/100, mese: meseDebito });
    }

    debitiReali.sort((a, b) => b.debito - a.debito);

    return NextResponse.json({
      success: true,
      totaleProprietari: usersSnap.size,
      riepilogo: {
        inRegola: inRegola.length,
        debitiReali: debitiReali.length,
        microScarti: microScarti.length,
      },
      debitiReali,
      microScarti,
      nota: "microScarti = saldi sotto 1€ (arrotondamenti residui da verificare). debitiReali = debiti veri scaduti (giusto che il cron li blocchi). inRegola = tutto a posto.",
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Errore", message: error?.message }, { status: 500 });
  }
}
