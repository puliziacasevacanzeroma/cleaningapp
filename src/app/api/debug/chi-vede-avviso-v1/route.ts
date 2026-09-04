import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { computeMonthDebt } from "~/lib/payments/debtCalculator";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * CHI VEDE L'AVVISO — sola lettura, tutti i proprietari in un colpo solo.
 *
 * PERCHE' ESISTE
 * 04/09/2026: una proprietaria ha segnalato di vedere "Pagamenti scaduti!" con
 * due mesi a 0,00 €. Dal pannello admin quell'avviso NON e' visibile: lo vede
 * solo il proprietario dentro il proprio profilo. Non c'era modo di sapere chi
 * altro lo stesse vedendo se non aspettando la telefonata.
 * Questa route replica lo stesso calcolo del modale (useOwnerBalance) su TUTTI
 * i proprietari e dice, per ciascuno, cosa vede e perche'.
 *
 * NON SCRIVE NULLA.
 *
 * USO
 *   /api/debug/chi-vede-avviso-v1?cronSecret=XXX
 *   /api/debug/chi-vede-avviso-v1?cronSecret=XXX&soloProblemi=1   (solo i casi anomali)
 *
 * COSA GUARDARE
 *   RIEPILOGO.fantasma  → proprietari che vedono l'avviso SOLO per mesi il cui
 *                         saldo e' un residuo di virgola mobile (< 1 centesimo).
 *                         Sono quelli a cui l'avviso non doveva mai comparire.
 *   RIEPILOGO.reali     → proprietari con almeno un mese scaduto vero.
 *   RIEPILOGO.bloccati  → chi ha davvero paymentBlock.active = true.
 *
 * Il campo `verdetto` di ogni proprietario dice in una riga cosa sta succedendo.
 */

const MESI = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const SOGLIA = 0.01;      // un centesimo: sotto non e' un debito, e' arrotondamento
const SCADENZA_GIORNO = 10;

function scadenzaDi(month: number, year: number): Date {
  let m = month + 1, y = year;
  if (m > 12) { m = 1; y++; }
  return new Date(y, m - 1, SCADENZA_GIORNO, 23, 59, 59);
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("cronSecret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const soloProblemi = req.nextUrl.searchParams.get("soloProblemi") === "1";
  const iniziato = Date.now();

  try {
    const [usersSnap, propsSnap, cleanSnap, ordSnap, paySnap, invSnap, ovrSnap, blkSnap] = await Promise.all([
      adminDb.collection("users").where("role", "==", "PROPRIETARIO").get(),
      adminDb.collection("properties").get(),
      adminDb.collection("cleanings").get(),
      adminDb.collection("orders").get(),
      adminDb.collection("payments").get(),
      adminDb.collection("inventory").get(),
      adminDb.collection("paymentOverrides").get(),
      adminDb.collection("paymentBlocks").get().catch(() => ({ docs: [] as any[] })),
    ]);

    const inventoryById = new Map<string, any>();
    invSnap.docs.forEach(d => {
      const x = d.data();
      inventoryById.set(d.id, { id: d.id, key: x.key, sellPrice: x.sellPrice, categoryId: x.categoryId });
      if (x.key) inventoryById.set(x.key, { id: d.id, key: x.key, sellPrice: x.sellPrice, categoryId: x.categoryId });
    });

    // Raggruppa per proprietario
    const propsByOwner = new Map<string, any[]>();
    propsSnap.docs.forEach(d => {
      const p = d.data();
      const o = p.ownerId;
      if (!o) return;
      if (!propsByOwner.has(o)) propsByOwner.set(o, []);
      propsByOwner.get(o)!.push({ id: d.id, cleaningPrice: p.cleaningPrice, name: p.name, usesOwnLinen: p.usesOwnLinen });
    });

    const cleanings = cleanSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    const orders = ordSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    const payments = paySnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    const overrides = ovrSnap.docs.map(d => d.data() as any);

    const bloccoAttivo = new Set<string>();
    (blkSnap.docs || []).forEach((d: any) => {
      const b = d.data();
      if (b?.active === true) bloccoAttivo.add(b.proprietarioId || d.id);
    });

    const ora = new Date();
    const risultati: any[] = [];

    for (const uDoc of usersSnap.docs) {
      const ownerId = uDoc.id;
      const u = uDoc.data();
      const mieProps = propsByOwner.get(ownerId) || [];
      if (mieProps.length === 0) continue;

      const propertiesById = new Map(mieProps.map(p => [p.id, p]));
      const idsProp = new Set(mieProps.map(p => p.id));
      const mieCleanings = cleanings.filter(c => idsProp.has(c.propertyId));
      const mieOrders = orders.filter(o => idsProp.has(o.propertyId));
      const miePayments = payments.filter(p => p.proprietarioId === ownerId);
      const mieiOverrides = new Map<string, any>();
      overrides.filter(o => o.proprietarioId === ownerId).forEach(o => mieiOverrides.set(`${o.year}-${o.month}`, o));

      const scaduti: any[] = [];

      // Ultimi 24 mesi, escluso il corrente (come fa il modale)
      for (let i = 1; i <= 24; i++) {
        const d = new Date(ora.getFullYear(), ora.getMonth() - i, 1);
        const month = d.getMonth() + 1;
        const year = d.getFullYear();

        const calc = computeMonthDebt({
          month, year,
          propertiesById: propertiesById as any,
          cleanings: mieCleanings as any,
          orders: mieOrders as any,
          payments: miePayments as any,
          inventoryById: inventoryById as any,
          override: mieiOverrides.get(`${year}-${month}`) || null,
        });
        if (!calc) continue;

        const saldo = calc.saldo;
        // Regola VECCHIA del modale: qualsiasi saldo > 0 era un debito.
        if (saldo <= 0) continue;
        if (ora <= scadenzaDi(month, year)) continue; // non ancora scaduto

        scaduti.push({
          mese: `${MESI[month - 1]} ${year}`,
          totaleServizi: Math.round(calc.totaleServizi * 100) / 100,
          totalePagato: Math.round(calc.totalePagato * 100) / 100,
          saldo: saldo,
          saldoMostrato: `${saldo.toFixed(2)} €`,
          fantasma: saldo < SOGLIA,
        });
      }

      if (scaduti.length === 0 && !bloccoAttivo.has(ownerId)) continue;

      const veri = scaduti.filter(s => !s.fantasma);
      const fantasmi = scaduti.filter(s => s.fantasma);

      const verdetto =
        scaduti.length === 0
          ? "BLOCCO RESIDUO: nessun mese scaduto ma risulta bloccato"
          : veri.length === 0
            ? `AVVISO FANTASMA: vede ${fantasmi.length} mese/i "scaduto/i" ma il saldo e' un arrotondamento (${fantasmi.map(f => f.saldoMostrato).join(", ")}). Non doveva comparire.`
            : fantasmi.length > 0
              ? `MISTO: ${veri.length} mese/i scaduto/i VERO/I e ${fantasmi.length} fantasma/i`
              : `DEBITO REALE: ${veri.length} mese/i scaduto/i`;

      risultati.push({
        nome: `${u.name || ""} ${u.surname || ""}`.trim(),
        email: u.email ?? null,
        ownerId,
        proprieta: mieProps.map(p => p.name),
        bloccato: bloccoAttivo.has(ownerId),
        verdetto,
        totaleScadutoReale: Math.round(veri.reduce((s, v) => s + v.saldo, 0) * 100) / 100,
        mesiScaduti: scaduti,
      });
    }

    const fantasma = risultati.filter(r => r.verdetto.startsWith("AVVISO FANTASMA"));
    const reali = risultati.filter(r => r.verdetto.startsWith("DEBITO REALE") || r.verdetto.startsWith("MISTO"));
    const residui = risultati.filter(r => r.verdetto.startsWith("BLOCCO RESIDUO"));

    return NextResponse.json({
      success: true,
      eseguitoIl: new Date().toISOString(),
      RIEPILOGO: {
        proprietariEsaminati: usersSnap.docs.length,
        conAvvisoOBlocco: risultati.length,
        fantasma: fantasma.length,
        reali: reali.length,
        bloccoResiduo: residui.length,
        bloccatiDavvero: risultati.filter(r => r.bloccato).length,
        durataMs: Date.now() - iniziato,
      },
      AVVISI_FANTASMA: fantasma,
      BLOCCHI_RESIDUI: residui,
      DEBITI_REALI: soloProblemi ? `${reali.length} proprietari con debito reale (ometti &soloProblemi=1 per vederli)` : reali,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || String(err), stack: process.env.NODE_ENV !== "production" ? err?.stack : undefined },
      { status: 500 }
    );
  }
}
