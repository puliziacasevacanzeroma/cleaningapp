/**
 * DEBUG (read-only): scomposizione RIGA PER RIGA del totale di un mese per un cliente,
 * con i PREZZI calcolati ESATTAMENTE come il cron `check-payment-blocks`.
 *
 * GET /api/debug/owner-month-breakdown-v1?cronSecret=XXX&name=Ariele Maria Damiani&month=3&year=2026
 *   (oppure &ownerId=...)
 *   &changedSinceDays=7   (opzionale, default 7) → marca come "modificata di recente"
 *                           ogni pulizia/ordine con updatedAt negli ultimi N giorni
 *
 * Scopo: capire PERCHÉ un mese "saldato" torna in debito. Mostra:
 *   - ogni pulizia (prezzo come il cron) con priceOverride/price/holidayFee + timestamp
 *   - ogni ordine (totale come il cron) con il dettaglio item + timestamp
 *   - il totale del mese (deve coincidere col cron) e quanto è stato pagato
 *   - le voci modificate di recente (candidate alla variazione del totale)
 *   - le entry di auditLog collegate a quelle entità nell'ultimo periodo
 *
 * NON scrive nulla. Gated da cronSecret.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { isCleaningProductItem } from "~/lib/payments/debtCalculator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const toDate = (v: any): Date | null => v?.toDate?.() || (v ? new Date(v) : null);
const iso = (d: Date | null) => (d ? d.toISOString() : null);
const r2 = (n: number) => Math.round(n * 100) / 100;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  if (cronSecret && searchParams.get("cronSecret") !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const name = searchParams.get("name");
  const ownerId = searchParams.get("ownerId");
  const month = parseInt(searchParams.get("month") || "0");
  const year = parseInt(searchParams.get("year") || "0");
  const changedSinceDays = parseInt(searchParams.get("changedSinceDays") || "7");
  if ((!name && !ownerId) || !month || !year) {
    return NextResponse.json({ error: "Passa &name= (o &ownerId=) + &month= + &year=" }, { status: 400 });
  }

  try {
    // ── Utente ──
    let userDoc: any = null;
    const usersSnap = await adminDb.collection("users").get();
    if (ownerId) userDoc = usersSnap.docs.find(d => d.id === ownerId);
    else userDoc = usersSnap.docs.find(d => (d.data().name || "").toLowerCase().includes(name!.toLowerCase()));
    if (!userDoc) return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
    const userId = userDoc.id;
    const userData = userDoc.data();

    // ── Proprietà del cliente + prezzo pulizia ──
    const propsSnap = await adminDb.collection("properties").where("ownerId", "==", userId).get();
    const propIds = propsSnap.docs.map(d => d.id);
    const propName = new Map<string, string>();
    const propCleaningPrice = new Map<string, number>();
    propsSnap.docs.forEach(d => {
      propName.set(d.id, d.data().name || d.id);
      if (d.data().cleaningPrice) propCleaningPrice.set(d.id, d.data().cleaningPrice);
    });
    if (propIds.length === 0) {
      return NextResponse.json({ error: "Il cliente non ha proprietà attive", userId, cliente: userData.name });
    }

    // ── Inventario (fallback prezzi item, identico al cron) ──
    const inventoryById = new Map<string, number>();
    const invSnap = await adminDb.collection("inventory").get();
    invSnap.docs.forEach(d => {
      const data = d.data() as any;
      const sp = data.sellPrice ?? data.price ?? 0;
      inventoryById.set(d.id, sp);
      if (data.key) inventoryById.set(data.key, sp);
      if (d.id.startsWith("item_")) inventoryById.set(d.id.replace("item_", ""), sp);
    });

    // ── Finestra temporale generosa (per catturare ordini schedulati prima ma
    //    consegnati nel mese: il cron data gli ordini con deliveredAt||scheduledDate) ──
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 1); // esclusivo
    const winStart = new Date(year, month - 1, 1); winStart.setDate(winStart.getDate() - 90);
    const winEnd = new Date(year, month, 1); winEnd.setDate(winEnd.getDate() + 90);
    const inTargetMonth = (d: Date | null) =>
      !!d && d.getMonth() + 1 === month && d.getFullYear() === year;

    // ── Cleanings COMPLETED nella finestra ──
    const cleanSnap = await adminDb.collection("cleanings")
      .where("status", "==", "COMPLETED")
      .where("scheduledDate", ">=", Timestamp.fromDate(winStart))
      .where("scheduledDate", "<=", Timestamp.fromDate(winEnd))
      .get();
    const completedCleaningIds = new Set<string>();
    const cleaningLines: any[] = [];
    cleanSnap.docs.forEach(d => {
      const data = d.data();
      if (!propIds.includes(data.propertyId)) return;
      completedCleaningIds.add(d.id);
      const sd = toDate(data.scheduledDate);
      if (!inTargetMonth(sd)) return;
      const price = (data.priceOverride ?? data.price ?? propCleaningPrice.get(data.propertyId) ?? 0) + (data.holidayFee ?? 0);
      cleaningLines.push({
        cleaningId: d.id,
        property: propName.get(data.propertyId) || data.propertyId,
        scheduledDate: iso(sd),
        prezzoCalcolato: r2(price),
        priceOverride: data.priceOverride ?? null,
        price: data.price ?? null,
        propertyCleaningPrice: propCleaningPrice.get(data.propertyId) ?? null,
        holidayFee: data.holidayFee ?? 0,
        guestName: data.guestName || null,
        createdAt: iso(toDate(data.createdAt)),
        updatedAt: iso(toDate(data.updatedAt)),
        lastModifiedReason: data.lastModifiedReason || null,
      });
    });

    // ── Orders nella finestra (stessa regola di inclusione del cron) ──
    const ordSnap = await adminDb.collection("orders")
      .where("scheduledDate", ">=", Timestamp.fromDate(winStart))
      .where("scheduledDate", "<=", Timestamp.fromDate(winEnd))
      .get();
    const orderLines: any[] = [];
    ordSnap.docs.forEach(d => {
      const data = d.data();
      if (!propIds.includes(data.propertyId)) return;
      if (data.status === "CANCELLED") return;
      const isDelivered = data.status === "DELIVERED";
      const isLinkedToCompleted = data.cleaningId && completedCleaningIds.has(data.cleaningId);
      if (!isDelivered && !isLinkedToCompleted) return;
      const eff = toDate(data.deliveredAt) || toDate(data.scheduledDate);
      if (!inTargetMonth(eff)) return;

      const itemsDetail: any[] = [];
      let total = 0;
      if (Array.isArray(data.items)) {
        data.items.forEach((item: any) => {
          if (isCleaningProductItem(item)) {
            itemsDetail.push({ name: item.name || item.itemId || item.id, escluso: "cleaning_product", riga: 0 });
            return;
          }
          const itemKey = item.itemId || item.id;
          const invSellPrice = itemKey ? inventoryById.get(itemKey) : undefined;
          const unitPrice =
            item.priceOverride ??
            (item.unitPrice || undefined) ??
            (item.price || undefined) ??
            invSellPrice ??
            0;
          const riga = (item.totalPrice || undefined) ?? (unitPrice * (item.quantity || 1));
          total += riga;
          itemsDetail.push({
            name: item.name || itemKey,
            itemKey,
            quantity: item.quantity || 1,
            priceOverride: item.priceOverride ?? null,
            unitPrice: item.unitPrice ?? null,
            price: item.price ?? null,
            invSellPrice: invSellPrice ?? null,
            usatoUnit: r2(unitPrice),
            totalPriceSalvato: item.totalPrice ?? null,
            rigaCalcolata: r2(riga),
          });
        });
      }
      const deliveryFee = (data.deliveryFee && data.deliveryFeeEnabled !== false) ? data.deliveryFee : 0;
      total += deliveryFee;
      const totalConOverride = data.totalPriceOverride ?? total;

      orderLines.push({
        orderId: d.id,
        property: propName.get(data.propertyId) || data.propertyId,
        status: data.status,
        cleaningId: data.cleaningId || null,
        effectiveDate: iso(eff),
        scheduledDate: iso(toDate(data.scheduledDate)),
        deliveredAt: iso(toDate(data.deliveredAt)),
        totaleCalcolato: r2(totalConOverride),
        totalePrimaOverride: r2(total),
        totalPriceOverride: data.totalPriceOverride ?? null,
        deliveryFee,
        createdAt: iso(toDate(data.createdAt)),
        updatedAt: iso(toDate(data.updatedAt)),
        lastModifiedReason: data.lastModifiedReason || null,
        items: itemsDetail,
      });
    });

    const totaleServizi = r2(
      cleaningLines.reduce((s, c) => s + c.prezzoCalcolato, 0) +
      orderLines.reduce((s, o) => s + o.totaleCalcolato, 0)
    );

    // ── Pagamenti del mese ──
    const paySnap = await adminDb.collection("payments").where("proprietarioId", "==", userId).get();
    const paymentsThisMonth = paySnap.docs
      .map(d => ({ id: d.id, ...(d.data() as any) }))
      .filter(p => p.month === month && p.year === year)
      .map(p => ({ id: p.id, amount: r2(p.amount || 0), isCreditTransfer: p.isCreditTransfer === true, createdAt: iso(toDate(p.createdAt)) }));
    const totalePagato = r2(paymentsThisMonth.filter(p => !p.isCreditTransfer).reduce((s, p) => s + p.amount, 0));

    // ── Voci modificate di recente (candidate alla variazione del totale) ──
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - changedSinceDays);
    const recentlyChanged = [
      ...cleaningLines.filter(c => c.updatedAt && new Date(c.updatedAt) >= cutoff)
        .map(c => ({ tipo: "cleaning", id: c.cleaningId, updatedAt: c.updatedAt, prezzo: c.prezzoCalcolato, reason: c.lastModifiedReason })),
      ...orderLines.filter(o => o.updatedAt && new Date(o.updatedAt) >= cutoff)
        .map(o => ({ tipo: "order", id: o.orderId, updatedAt: o.updatedAt, prezzo: o.totaleCalcolato, reason: o.lastModifiedReason })),
    ].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

    // ── auditLog collegato a queste entità (ultimi changedSinceDays+ giorni) ──
    const entityIds = new Set<string>([...cleaningLines.map(c => c.cleaningId), ...orderLines.map(o => o.orderId)]);
    const auditCutoff = new Date(); auditCutoff.setDate(auditCutoff.getDate() - Math.max(changedSinceDays, 14));
    let auditEntries: any[] = [];
    try {
      const auditSnap = await adminDb.collection("auditLog")
        .where("timestamp", ">=", Timestamp.fromDate(auditCutoff))
        .get();
      auditEntries = auditSnap.docs
        .map(d => ({ id: d.id, ...(d.data() as any) }))
        .filter(a => entityIds.has(a.entityId) || propIds.includes(a.propertyId))
        .map(a => ({ action: a.action, entityType: a.entityType, entityId: a.entityId, property: a.propertyName, source: a.source, timestamp: iso(toDate(a.timestamp)), details: a.details }))
        .sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
    } catch (e: any) {
      auditEntries = [{ errore: "lettura auditLog fallita (indice?)", message: e?.message }];
    }

    return NextResponse.json({
      success: true,
      cliente: userData.name,
      userId,
      mese: `${month}/${year}`,
      numProprieta: propIds.length,
      RIEPILOGO: {
        totaleServizi_comeCron: totaleServizi,
        totalePagato: totalePagato,
        saldo: r2(totaleServizi - totalePagato),
        nPulizie: cleaningLines.length,
        nOrdini: orderLines.length,
      },
      VOCI_MODIFICATE_DI_RECENTE: recentlyChanged,
      pagamenti: paymentsThisMonth,
      pulizie: cleaningLines.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")),
      ordini: orderLines.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")),
      auditLog_collegato: auditEntries,
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Errore", message: error?.message, stack: error?.stack?.slice(0, 600) }, { status: 500 });
  }
}
