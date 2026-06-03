/**
 * Sblocca i clienti bloccati che NON hanno debiti scaduti reali (residui).
 * GET/POST /api/debug/unblock-wrongly-blocked-v1?cronSecret=XXX&dryRun=true
 *
 * Replica il calcolo del cron per OGNI cliente con paymentBlock.active=true:
 * se non ha mesi scaduti con saldo>0, il blocco è un residuo (es. messo a mano
 * per errore col pulsante Risospendi) e va rimosso.
 *
 * dryRun:true di default (mostra solo). dryRun=false esegue.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SCADENZA_GIORNO = 10;

async function handler(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  let body: any = {};
  try { body = await request.json(); } catch {}
  const { searchParams } = new URL(request.url);
  const providedSecret = body.cronSecret || searchParams.get("cronSecret");
  if (cronSecret && providedSecret !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const dryRunRaw = body.dryRun ?? searchParams.get("dryRun");
  const dryRun = dryRunRaw === false || dryRunRaw === "false" ? false : true;

  try {
    const now = new Date();
    const start = new Date(now.getFullYear() - 2, now.getMonth(), 1);

    // pre-carico tutto una volta
    const [usersSnap, propsSnap, paySnap, ovSnap, cleanSnap, ordSnap] = await Promise.all([
      adminDb.collection("users").get(),
      adminDb.collection("properties").get(),
      adminDb.collection("payments").get(),
      adminDb.collection("paymentOverrides").get(),
      adminDb.collection("cleanings").where("scheduledDate", ">=", start).get(),
      adminDb.collection("orders").where("scheduledDate", ">=", start).get(),
    ]);

    // mappe per owner
    const propsByOwner = new Map<string, string[]>();
    propsSnap.docs.forEach(d => {
      const oid = d.data().ownerId; if (!oid) return;
      if (!propsByOwner.has(oid)) propsByOwner.set(oid, []);
      propsByOwner.get(oid)!.push(d.id);
    });
    const payByOwner = new Map<string, any[]>();
    paySnap.docs.forEach(d => {
      const oid = d.data().proprietarioId; if (!oid) return;
      if (!payByOwner.has(oid)) payByOwner.set(oid, []);
      payByOwner.get(oid)!.push(d.data());
    });
    const ovByOwner = new Map<string, Map<string, number>>();
    ovSnap.docs.forEach(d => {
      const o = d.data(); const oid = o.proprietarioId; if (!oid) return;
      if (!ovByOwner.has(oid)) ovByOwner.set(oid, new Map());
      if (o.overrideTotal != null) ovByOwner.get(oid)!.set(`${o.month}-${o.year}`, o.overrideTotal);
    });
    // servizi per prop|mese
    const serv = new Map<string, number>();
    cleanSnap.docs.forEach(d => {
      const c = d.data(); if (c.status !== "COMPLETED") return;
      const dt = c.scheduledDate?.toDate?.() || new Date(c.scheduledDate);
      serv.set(`${c.propertyId}|${dt.getMonth()+1}-${dt.getFullYear()}`, (serv.get(`${c.propertyId}|${dt.getMonth()+1}-${dt.getFullYear()}`)||0)+(c.cleaningPrice||0));
    });
    ordSnap.docs.forEach(d => {
      const o = d.data(); if (o.status === "CANCELLED") return;
      const dt = o.scheduledDate?.toDate?.() || new Date(o.scheduledDate);
      const tot = (o.items||[]).filter((it:any)=>it.type!=="cleaning_product").reduce((s:number,it:any)=>s+(it.totalPrice||0),0);
      serv.set(`${o.propertyId}|${dt.getMonth()+1}-${dt.getFullYear()}`, (serv.get(`${o.propertyId}|${dt.getMonth()+1}-${dt.getFullYear()}`)||0)+tot);
    });

    const hasOverdue = (userId: string): boolean => {
      const propIds = propsByOwner.get(userId) || [];
      if (propIds.length === 0) return false;
      const payments = payByOwner.get(userId) || [];
      const ov = ovByOwner.get(userId);
      for (let i = 1; i <= 24; i++) {
        let m = now.getMonth() + 1 - i, y = now.getFullYear();
        while (m <= 0) { m += 12; y--; }
        let totSer = 0;
        for (const pid of propIds) totSer += serv.get(`${pid}|${m}-${y}`) || 0;
        if (totSer === 0) continue;
        if (ov?.has(`${m}-${y}`)) totSer = ov.get(`${m}-${y}`)!;
        const totPag = payments.filter(p => p.month===m && p.year===y && p.isCreditTransfer!==true).reduce((s,p)=>s+p.amount,0);
        const saldo = totSer - totPag;
        let scadM = m+1, scadY = y; if (scadM>12){scadM=1;scadY++;}
        const scadenza = new Date(scadY, scadM-1, SCADENZA_GIORNO, 23,59,59);
        if (now > scadenza && saldo > 0.01) return true;
      }
      return false;
    };

    const daSbloccare: any[] = [];
    const restanoBloccati: any[] = [];
    for (const u of usersSnap.docs) {
      const data = u.data();
      if (data.paymentBlock?.active !== true) continue;
      if (hasOverdue(u.id)) {
        restanoBloccati.push({ name: data.name, reason: data.paymentBlock?.reason });
      } else {
        daSbloccare.push({ id: u.id, name: data.name, reason: data.paymentBlock?.reason });
        if (!dryRun) {
          await adminDb.collection("users").doc(u.id).update({ paymentBlock: null });
        }
      }
    }

    return NextResponse.json({
      success: true,
      modalita: dryRun ? "DRY-RUN (nessuna modifica)" : "ESEGUITO",
      sbloccati: dryRun ? 0 : daSbloccare.length,
      daSbloccare_perche_senza_debiti: daSbloccare,
      restano_bloccati_con_debiti_veri: restanoBloccati,
      istruzioni: dryRun ? "Anteprima. Per eseguire aggiungi dryRun=false" : "Fatto. I clienti senza debiti reali sono stati sbloccati.",
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Errore", message: error?.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) { return handler(request); }
export async function GET(request: NextRequest) { return handler(request); }
