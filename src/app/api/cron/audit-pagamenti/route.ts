import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";

/**
 * AUDIT PAGAMENTI — Replica ESATTAMENTE la logica di:
 * 1. useOwnerRealtimePayments (pagina proprietario)
 * 2. toolGetPayments (assistente AI)
 * E mostra dove i numeri divergono.
 * 
 * URL: /api/cron/audit-pagamenti?email=...&mese=3&anno=2026
 */
export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email") || "damianiariele@gmail.com";
  const meseParam = parseInt(req.nextUrl.searchParams.get("mese") || "3");
  const annoParam = parseInt(req.nextUrl.searchParams.get("anno") || "2026");

  // ═══ 1. UTENTE ═══
  const usersSnap = await adminDb.collection("users").where("email", "==", email).get();
  if (usersSnap.empty) return NextResponse.json({ error: `Utente ${email} non trovato` });
  const userDoc = usersSnap.docs[0];
  const userId = userDoc.id;
  const userData = userDoc.data();

  // ═══ 2. PROPRIETÀ ═══
  const propsSnap = await adminDb.collection("properties").where("ownerId", "==", userId).get();
  const propertyIds = propsSnap.docs.map(d => d.id);
  const propMap = new Map(propsSnap.docs.map(d => [d.id, d.data()]));
  if (propertyIds.length === 0) return NextResponse.json({ error: "Nessuna proprietà" });

  // ═══ 3. INVENTORY (per calcolo prezzi ordini) ═══
  const invSnap = await adminDb.collection("inventory").get();
  const invById = new Map<string, any>();
  invSnap.docs.forEach(d => {
    const data = d.data() as any;
    const itemData = { id: d.id, name: data.name || "", sellPrice: data.sellPrice || data.price || 0, categoryName: data.categoryName || data.category || "Altro" };
    invById.set(d.id, itemData);
    if (data.key) invById.set(data.key, itemData);
    if (d.id.startsWith("item_")) invById.set(d.id.replace("item_", ""), itemData);
  });

  // ═══ 4. TUTTE LE PULIZIE del proprietario ═══
  const allCleanings: any[] = [];
  for (let i = 0; i < propertyIds.length; i += 10) {
    const chunk = propertyIds.slice(i, i + 10);
    const snap = await adminDb.collection("cleanings").where("propertyId", "in", chunk).get();
    snap.docs.forEach(d => allCleanings.push({ id: d.id, ...d.data() }));
  }

  // ═══ 5. TUTTI GLI ORDINI del proprietario (esclusi CANCELLED) ═══
  const allOrders: any[] = [];
  for (let i = 0; i < propertyIds.length; i += 10) {
    const chunk = propertyIds.slice(i, i + 10);
    const snap = await adminDb.collection("orders").where("propertyId", "in", chunk).get();
    snap.docs.forEach(d => {
      const data = { id: d.id, ...d.data() };
      if ((data as any).status !== "CANCELLED") allOrders.push(data);
    });
  }

  // ═══ 6. PAGAMENTI ═══
  let paymentsSnap = await adminDb.collection("payments").where("proprietarioId", "==", userId).get();
  if (paymentsSnap.empty) paymentsSnap = await adminDb.collection("payments").where("ownerId", "==", userId).get();

  // ═══════════════════════════════════════════════════════════
  // CALCOLO processOrder — IDENTICO a useOwnerRealtimePayments
  // ═══════════════════════════════════════════════════════════
  function processOrder(order: any) {
    let calculatedTotal = 0;
    const itemDetails: any[] = [];
    if (order.items && Array.isArray(order.items)) {
      order.items.forEach((item: any) => {
        const itemKey = item.itemId || item.id;
        const invItem: any = invById.get(itemKey);
        const basePrice = item.unitPrice || item.price || invItem?.sellPrice || 0;
        const unitPrice = item.priceOverride ?? basePrice;
        const quantity = item.quantity || 1;
        const itemTotal = item.totalPrice || (unitPrice * quantity);
        calculatedTotal += itemTotal;
        itemDetails.push({ name: item.name || invItem?.name || itemKey, quantity, unitPrice, itemTotal });
      });
    }
    const deliveryFee = (order.deliveryFee && order.deliveryFeeEnabled !== false) ? order.deliveryFee : 0;
    calculatedTotal += deliveryFee;
    const bedMakingFee = (order.bedMaking && order.bedMakingFee) ? order.bedMakingFee : 0;
    calculatedTotal += bedMakingFee;
    return { ...order, calculatedTotal, itemDetails, deliveryFee, bedMakingFee };
  }

  // ═══════════════════════════════════════════════════════════
  // LOGICA A: PAGINA PROPRIETARIO (per mese selezionato)
  // ═══════════════════════════════════════════════════════════
  function isInMonth(dateField: any, month: number, year: number) {
    const d = dateField?.toDate?.() || (dateField instanceof Date ? dateField : null);
    if (!d) return false;
    return d.getMonth() === month - 1 && d.getFullYear() === year;
  }

  // Pulizie COMPLETED nel mese
  const paginaCleanings = allCleanings
    .filter(c => c.status === "COMPLETED")
    .filter(c => isInMonth(c.scheduledDate, meseParam, annoParam));

  const completedCleaningIds = new Set(paginaCleanings.map(c => c.id));

  // Ordini nel mese: DELIVERED oppure annessi a pulizia COMPLETED
  const paginaOrders = allOrders
    .filter(o => isInMonth(o.deliveredAt || o.scheduledDate, meseParam, annoParam))
    .filter(o => {
      if (o.status === "DELIVERED") return true;
      if (o.cleaningId && completedCleaningIds.has(o.cleaningId)) return true;
      return false;
    })
    .map(processOrder);

  // Calcolo pulizie come pagina
  let paginaPulizieTotal = 0;
  const paginaPulizieDettaglio: any[] = [];
  paginaCleanings.forEach(c => {
    const prop: any = propMap.get(c.propertyId);
    const basePrice = c.price || prop?.cleaningPrice || 0;
    const effectivePrice = c.priceOverride ?? basePrice;
    paginaPulizieTotal += effectivePrice;
    const date = c.scheduledDate?.toDate?.();
    paginaPulizieDettaglio.push({
      id: c.id,
      data: date ? date.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }) : "?",
      property: prop?.name || "?",
      price_campo: c.price ?? "NULL",
      priceOverride_campo: c.priceOverride ?? "NULL",
      cleaningPrice_proprieta: prop?.cleaningPrice || 0,
      basePrice,
      effectivePrice,
      formula: c.priceOverride != null ? `priceOverride(${c.priceOverride})` : c.price ? `price(${c.price})` : `prop.cleaningPrice(${prop?.cleaningPrice || 0})`,
      guest: c.guestName || "-",
    });
  });

  // Calcolo ordini come pagina
  let paginaOrdiniTotal = 0;
  const paginaOrdiniDettaglio: any[] = [];
  paginaOrders.forEach(o => {
    const effectivePrice = o.totalPriceOverride ?? o.calculatedTotal;
    paginaOrdiniTotal += effectivePrice;
    const date = (o.deliveredAt?.toDate?.() || o.scheduledDate?.toDate?.());
    paginaOrdiniDettaglio.push({
      id: o.id,
      data: date ? date.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }) : "?",
      property: propMap.get(o.propertyId)?.name || "?",
      status: o.status,
      tipo: o.cleaningId ? "annesso" : "standalone",
      cleaningId: o.cleaningId || null,
      cleaningIsCompleted: o.cleaningId ? completedCleaningIds.has(o.cleaningId) : null,
      totalPriceOverride: o.totalPriceOverride ?? "NULL",
      calculatedTotal: Math.round(o.calculatedTotal * 100) / 100,
      effectivePrice: Math.round(effectivePrice * 100) / 100,
      deliveryFee: o.deliveryFee || 0,
      bedMakingFee: o.bedMakingFee || 0,
      itemCount: o.itemDetails?.length || 0,
      items: o.itemDetails?.map((i: any) => `${i.quantity}x ${i.name} @${i.unitPrice} = ${i.itemTotal}`) || [],
    });
  });

  // Pagamenti del mese
  const paginaPayments = paymentsSnap.docs.filter(d => {
    const data = d.data();
    return Number(data.month) === meseParam && Number(data.year) === annoParam;
  });
  const paginaPagato = paginaPayments.reduce((s, d) => s + (d.data().amount || 0), 0);

  const paginaTotale = Math.round((paginaPulizieTotal + paginaOrdiniTotal) * 100) / 100;
  const paginaSaldo = Math.round((paginaTotale - paginaPagato) * 100) / 100;

  // ═══════════════════════════════════════════════════════════
  // LOGICA B: ASSISTENTE AI (globale, tutti i mesi)
  // ═══════════════════════════════════════════════════════════
  const aiCleanings = allCleanings.filter(c => c.status === "COMPLETED");
  const aiPulizieTotal = aiCleanings.reduce((s, c) => s + (c.priceOverride ?? c.price ?? 0), 0);

  // AI: ordini DELIVERED di tutti i mesi
  const aiOrders = allOrders.filter(o => o.status === "DELIVERED");
  let aiOrdiniTotal = 0;
  aiOrders.forEach(o => {
    let tot = 0;
    if (o.totalPriceOverride != null) { tot = o.totalPriceOverride; }
    else if (Array.isArray(o.items)) {
      o.items.forEach((item: any) => {
        const inv: any = invById.get(item.id);
        const price = item.priceOverride ?? inv?.sellPrice ?? item.price ?? 0;
        tot += price * (item.quantity || 1);
      });
      if (o.deliveryFee && o.deliveryFeeEnabled !== false) tot += o.deliveryFee;
    }
    aiOrdiniTotal += tot;
  });

  const aiTotalePagato = paymentsSnap.docs.reduce((s, d) => s + (d.data().amount || 0), 0);
  const aiSaldo = Math.round((aiPulizieTotal + aiOrdiniTotal - aiTotalePagato) * 100) / 100;

  // ═══════════════════════════════════════════════════════════
  // DIAGNOSI DIFFERENZE
  // ═══════════════════════════════════════════════════════════
  
  // Ordini nel mese che sono PENDING ma annessi a pulizia COMPLETED (la pagina li include, l'AI no)
  const pendingAnnessi = allOrders
    .filter(o => isInMonth(o.deliveredAt || o.scheduledDate, meseParam, annoParam))
    .filter(o => o.status !== "DELIVERED" && o.status !== "CANCELLED" && o.cleaningId && completedCleaningIds.has(o.cleaningId))
    .map(processOrder);
  
  const pendingAnnessiTotal = pendingAnnessi.reduce((s, o) => s + (o.totalPriceOverride ?? o.calculatedTotal), 0);

  // Ordini standalone nel mese (DELIVERED ma senza cleaningId)
  const standaloneDelivered = paginaOrders.filter(o => !o.cleaningId && o.status === "DELIVERED");
  const standaloneTotal = standaloneDelivered.reduce((s, o) => s + (o.totalPriceOverride ?? o.calculatedTotal), 0);

  return NextResponse.json({
    _meta: {
      utente: `${userData.name} (${userData.email})`,
      userId,
      meseAnalizzato: `${meseParam}/${annoParam}`,
      proprietaAttive: propsSnap.docs.filter(d => d.data().status === "ACTIVE").length,
      proprietaTotali: propsSnap.size,
    },

    // ═══ PAGINA PROPRIETARIO ═══
    PAGINA_PROPRIETARIO: {
      mese: `${meseParam}/${annoParam}`,
      pulizieCompleted: paginaCleanings.length,
      totalePulizie: Math.round(paginaPulizieTotal * 100) / 100,
      ordiniValidi: paginaOrders.length,
      totaleOrdini: Math.round(paginaOrdiniTotal * 100) / 100,
      TOTALE_SERVIZI: paginaTotale,
      pagato: paginaPagato,
      SALDO: paginaSaldo,
    },

    // ═══ ASSISTENTE AI ═══
    ASSISTENTE_AI: {
      scope: "TUTTI i mesi, GLOBALE",
      pulizieCompleted: aiCleanings.length,
      totalePulizie: Math.round(aiPulizieTotal * 100) / 100,
      ordiniDelivered: aiOrders.length,
      totaleOrdini: Math.round(aiOrdiniTotal * 100) / 100,
      TOTALE_SERVIZI: Math.round((aiPulizieTotal + aiOrdiniTotal) * 100) / 100,
      pagato: aiTotalePagato,
      SALDO: aiSaldo,
    },

    // ═══ DIAGNOSI ═══
    DIAGNOSI: {
      differenzaTotale: Math.round((paginaTotale - aiSaldo - paginaPagato) * 100) / 100,
      nota: "La pagina mostra il TOTALE SERVIZI del mese. L'AI mostra il SALDO GLOBALE (tutti mesi - tutti pagamenti). Sono numeri DIVERSI per design.",
      ordiniPendingAnnessiACompletate: {
        descrizione: "Ordini PENDING nel mese ma annessi a pulizia COMPLETED → la pagina li include",
        conteggio: pendingAnnessi.length,
        totale: Math.round(pendingAnnessiTotal * 100) / 100,
      },
      ordiniStandaloneDelivered: {
        descrizione: "Ordini standalone DELIVERED nel mese (senza cleaningId)",
        conteggio: standaloneDelivered.length,
        totale: Math.round(standaloneTotal * 100) / 100,
      },
    },

    // ═══ DETTAGLIO PULIZIE ═══
    dettaglioPulizie: paginaPulizieDettaglio,

    // ═══ DETTAGLIO ORDINI ═══
    dettaglioOrdini: paginaOrdiniDettaglio,

    // ═══ DETTAGLIO ORDINI PENDING ANNESSI ═══
    dettaglioOrdiniPendingAnnessi: pendingAnnessi.map(o => ({
      id: o.id,
      data: (o.deliveredAt?.toDate?.() || o.scheduledDate?.toDate?.())?.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }) || "?",
      property: propMap.get(o.propertyId)?.name || "?",
      status: o.status,
      cleaningId: o.cleaningId,
      calculatedTotal: Math.round(o.calculatedTotal * 100) / 100,
      items: o.itemDetails?.map((i: any) => `${i.quantity}x ${i.name} = ${i.itemTotal}`) || [],
    })),

    // ═══ PAGAMENTI ═══
    pagamenti: paymentsSnap.docs.map(d => {
      const data = d.data();
      return {
        importo: data.amount,
        data: data.date?.toDate?.()?.toLocaleDateString("it-IT") || "?",
        metodo: data.method,
        competenza: `${data.month}/${data.year}`,
      };
    }),
  });
}
