/**
 * DEBUG: confronta calcolo PAGINA vs CRON per ogni servizio di un cliente in un mese.
 * GET /api/debug/saldo-diff-v1?cronSecret=XXX&name=Michela&month=4&year=2026
 *
 * Mostra ogni pulizia e ordine con il prezzo calcolato dalle DUE formule
 * affiancate, e la differenza. Serve a trovare DOVE nascono gli 8,10€ di
 * incongruenza che fanno bloccare clienti che hanno pagato il totale mostrato.
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
    const propIds: string[] = [];
    propsSnap.docs.forEach(d => {
      if (d.data().ownerId !== userId) return;
      propIds.push(d.id);
      propCleaningPrice.set(d.id, d.data().cleaningPrice || 0);
    });

    const invSnap = await adminDb.collection("inventory").get();
    const invSell = new Map<string, number>();
    const invPrice = new Map<string, number>();
    invSnap.docs.forEach(d => {
      const x = d.data() as any;
      invSell.set(d.id, x.sellPrice ?? 0); invPrice.set(d.id, x.price ?? 0);
      if (x.key) { invSell.set(x.key, x.sellPrice ?? 0); invPrice.set(x.key, x.price ?? 0); }
    });

    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);

    const cleanSnap = await adminDb.collection("cleanings")
      .where("status", "==", "COMPLETED")
      .where("scheduledDate", ">=", Timestamp.fromDate(start))
      .where("scheduledDate", "<=", Timestamp.fromDate(end))
      .get();
    const ordSnap = await adminDb.collection("orders")
      .where("scheduledDate", ">=", Timestamp.fromDate(start))
      .where("scheduledDate", "<=", Timestamp.fromDate(end))
      .get();

    const completedIds = new Set(cleanSnap.docs.map(d => d.id));

    let totPaginaClean = 0, totCronClean = 0, totPaginaOrd = 0, totCronOrd = 0;
    const pulizie: any[] = [];
    const ordini: any[] = [];

    cleanSnap.docs.forEach(d => {
      const c = d.data();
      if (!propIds.includes(c.propertyId)) return;
      const basePrice = c.price ?? propCleaningPrice.get(c.propertyId) ?? 0;
      const holiday = c.holidayFee ?? 0;
      // PAGINA: (priceOverride ?? price ?? cleaningPrice) + holidayFee
      const pagina = (c.priceOverride ?? basePrice) + holiday;
      // CRON: (priceOverride ?? price ?? propCleaningPrice) + holidayFee
      const cron = (c.priceOverride ?? c.price ?? propCleaningPrice.get(c.propertyId) ?? 0) + holiday;
      totPaginaClean += pagina; totCronClean += cron;
      if (Math.abs(pagina - cron) > 0.001) {
        pulizie.push({ id: d.id, data: c.scheduledDate?.toDate?.()?.toISOString()?.slice(0,10), pagina, cron, diff: Math.round((pagina-cron)*100)/100, campi: { price: c.price, priceOverride: c.priceOverride, cleaningPrice: propCleaningPrice.get(c.propertyId), holidayFee: c.holidayFee } });
      }
    });

    ordSnap.docs.forEach(d => {
      const o = d.data();
      if (!propIds.includes(o.propertyId)) return;
      if (o.status === "CANCELLED") return;
      const isDelivered = o.status === "DELIVERED";
      const isLinked = o.cleaningId && completedIds.has(o.cleaningId);
      if (!isDelivered && !isLinked) return;

      let pagina = 0, cron = 0;
      const itemDettagli: any[] = [];
      (o.items || []).forEach((item: any) => {
        const itemKey = item.itemId || item.id;
        const qty = item.quantity || 1;
        // PAGINA: (unitPrice||undefined) ?? (price||undefined) ?? invSell ?? invPrice
        const basePag = (item.unitPrice || undefined) ?? (item.price || undefined) ?? (itemKey ? invSell.get(itemKey) : undefined) ?? (itemKey ? invPrice.get(itemKey) : undefined) ?? 0;
        const unitPag = item.priceOverride ?? basePag;
        const totPag = (item.totalPrice || undefined) ?? unitPag * qty;
        // CRON: priceOverride ?? unitPrice ?? price ?? invSell ?? 0
        const unitCron = item.priceOverride ?? item.unitPrice ?? item.price ?? (itemKey ? invSell.get(itemKey) : undefined) ?? 0;
        const totCron = item.totalPrice || (unitCron * qty);
        pagina += totPag; cron += totCron;
        if (Math.abs(totPag - totCron) > 0.001) {
          itemDettagli.push({ name: item.name, itemKey, qty, pagina: totPag, cron: totCron, campi: { unitPrice: item.unitPrice, price: item.price, totalPrice: item.totalPrice, priceOverride: item.priceOverride, invSell: itemKey ? invSell.get(itemKey) : null, invPrice: itemKey ? invPrice.get(itemKey) : null } });
        }
      });
      if (o.deliveryFee && o.deliveryFeeEnabled !== false) { pagina += o.deliveryFee; cron += o.deliveryFee; }
      if (o.totalPriceOverride != null) { pagina = o.totalPriceOverride; cron = o.totalPriceOverride; }
      totPaginaOrd += pagina; totCronOrd += cron;
      if (Math.abs(pagina - cron) > 0.001) {
        ordini.push({ id: d.id, pagina, cron, diff: Math.round((pagina-cron)*100)/100, itemDiversi: itemDettagli });
      }
    });

    const totPagina = totPaginaClean + totPaginaOrd;
    const totCron = totCronClean + totCronOrd;

    return NextResponse.json({
      success: true,
      cliente: userDoc.data().name,
      mese: `${month}/${year}`,
      TOTALE_PAGINA: Math.round(totPagina * 100) / 100,
      TOTALE_CRON: Math.round(totCron * 100) / 100,
      DIFFERENZA: Math.round((totCron - totPagina) * 100) / 100,
      spiegazione: "TOTALE_PAGINA = quanto mostra/registra 'Incassa Totale'. TOTALE_CRON = quanto pensa il cron. La DIFFERENZA è ciò che fa bloccare il cliente.",
      pulizieDiverse: pulizie,
      ordiniDiversi: ordini,
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Errore", message: error?.message }, { status: 500 });
  }
}
