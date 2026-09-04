/**
 * DEBUG: perché un cliente è bloccato? Replica ESATTA della logica del cron.
 * GET /api/debug/why-blocked-v1?cronSecret=XXX&name=Mario   (o &ownerId=...)
 *
 * Mostra, mese per mese: servizi, pagato, saldo, se è scaduto, e il verdetto
 * finale (hasOverdueDebt). Più lo stato attuale di paymentBlock sul doc user.
 * Serve a capire se il blocco è GIUSTO o un residuo da rimuovere.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

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
  if (!name && !ownerId) {
    return NextResponse.json({ error: "Passa &name= oppure &ownerId=" }, { status: 400 });
  }

  try {
    // trova l'utente
    let userDoc: any = null;
    if (ownerId) {
      const d = await adminDb.collection("users").doc(ownerId).get();
      if (d.exists) userDoc = d;
    } else {
      const all = await adminDb.collection("users").get();
      userDoc = all.docs.find(d => (d.data().name || "").toLowerCase().includes(name!.toLowerCase()));
    }
    if (!userDoc) return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });

    const userData = userDoc.data();
    const userId = userDoc.id;

    // proprietà del cliente
    const propsSnap = await adminDb.collection("properties").where("ownerId", "==", userId).get();
    const propIds = propsSnap.docs.map(d => d.id);

    // pagamenti del cliente
    const paySnap = await adminDb.collection("payments").where("proprietarioId", "==", userId).get();
    const payments = paySnap.docs.map(d => d.data());

    // override del cliente
    const ovSnap = await adminDb.collection("paymentOverrides").where("proprietarioId", "==", userId).get();
    const overrides = new Map<string, number>();
    ovSnap.docs.forEach(d => {
      const o = d.data();
      if (o.overrideTotal != null) overrides.set(`${o.month}-${o.year}`, o.overrideTotal);
    });

    // servizi per mese (cleanings COMPLETED + orders non CANCELLED, esclusi cleaning_product)
    const now = new Date();
    const start = new Date(now.getFullYear() - 2, now.getMonth(), 1);
    const cleanSnap = await adminDb.collection("cleanings")
      .where("scheduledDate", ">=", start).get();
    const ordSnap = await adminDb.collection("orders")
      .where("scheduledDate", ">=", start).get();

    const serviziPerMese = new Map<string, number>();
    // ⚠️ CORRETTO 04/09/2026 — prima si leggeva `c.cleaningPrice`, che sulle
    // PULIZIE non esiste (sta sulla PROPRIETA'): ogni pulizia contava 0 e nella
    // colonna "servizi" finivano solo gli ordini biancheria. Risultato: saldi
    // falsamente negativi, crediti inventati di migliaia di euro e il verdetto
    // "non dovrebbe essere bloccato" anche per chi un debito ce l'ha davvero.
    // Regola canonica (src/lib/payments/debtCalculator.ts):
    //   prezzo = (priceOverride ?? price ?? property.cleaningPrice) + holidayFee
    const prezzoBaseProprieta = new Map<string, number>();
    propsSnap.docs.forEach(d => prezzoBaseProprieta.set(d.id, Number((d.data() as any).cleaningPrice) || 0));

    cleanSnap.docs.forEach(d => {
      const c = d.data();
      if (!propIds.includes(c.propertyId)) return;
      if (c.status !== "COMPLETED") return;
      if (c.excludedFromBilling === true) return;
      const dt = c.scheduledDate?.toDate?.() || new Date(c.scheduledDate);
      const k = `${dt.getMonth() + 1}-${dt.getFullYear()}`;
      const prezzo = c.priceOverride ?? c.price ?? prezzoBaseProprieta.get(c.propertyId) ?? 0;
      serviziPerMese.set(k, (serviziPerMese.get(k) || 0) + Number(prezzo || 0) + Number(c.holidayFee || 0));
    });
    ordSnap.docs.forEach(d => {
      const o = d.data();
      if (!propIds.includes(o.propertyId)) return;
      if (o.status === "CANCELLED") return;
      if (o.excludedFromBilling === true) return;
      const dt = o.scheduledDate?.toDate?.() || new Date(o.scheduledDate);
      const k = `${dt.getMonth() + 1}-${dt.getFullYear()}`;
      const tot = (o.items || []).filter((it: any) => it.type !== "cleaning_product")
        .reduce((s: number, it: any) => s + (it.totalPrice || 0), 0);
      serviziPerMese.set(k, (serviziPerMese.get(k) || 0) + tot);
    });

    // analisi mese per mese (ultimi 14 mesi)
    const analisi: any[] = [];
    for (let i = 13; i >= 0; i--) {
      let m = now.getMonth() + 1 - i, y = now.getFullYear();
      while (m <= 0) { m += 12; y--; }
      const k = `${m}-${y}`;
      let totSer = serviziPerMese.get(k) || 0;
      if (totSer === 0) continue; // null nel cron
      if (overrides.has(`${m}-${y}`)) totSer = overrides.get(`${m}-${y}`)!;
      const totPag = payments
        .filter(p => p.month === m && p.year === y && p.isCreditTransfer !== true)
        .reduce((s, p) => s + p.amount, 0);
      const saldo = totSer - totPag;

      let scadMonth = m + 1, scadYear = y;
      if (scadMonth > 12) { scadMonth = 1; scadYear++; }
      const scadenza = new Date(scadYear, scadMonth - 1, SCADENZA_GIORNO, 23, 59, 59);
      const isScaduto = now > scadenza;

      analisi.push({
        mese: `${m}/${y}`,
        servizi: Math.round(totSer * 100) / 100,
        pagato: Math.round(totPag * 100) / 100,
        saldo: Math.round(saldo * 100) / 100,
        scadenza: scadenza.toISOString().slice(0, 10),
        scaduto: isScaduto,
        contaPerBlocco: isScaduto && saldo > 0.01,
      });
    }

    const mesiCheBloccano = analisi.filter(a => a.contaPerBlocco);

    return NextResponse.json({
      success: true,
      cliente: userData.name,
      userId,
      statoBloccoAttuale: userData.paymentBlock || null,
      paymentExempt: userData.paymentExempt || false,
      numProprieta: propIds.length,
      verdetto: mesiCheBloccano.length > 0
        ? `DOVREBBE essere bloccato per: ${mesiCheBloccano.map(a => a.mese).join(", ")}`
        : "NON dovrebbe essere bloccato (nessun mese scaduto con saldo > 0). Se ha paymentBlock.active=true è un RESIDUO da rimuovere.",
      mesiCheBloccano,
      analisiMesi: analisi,
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Errore", message: error?.message, stack: error?.stack?.slice(0, 500) }, { status: 500 });
  }
}
