/**
 * ════════════════════════════════════════════════════════════════════
 * AUDIT PROBE F-06 — Divergenze formule pagamenti tra superfici
 * ════════════════════════════════════════════════════════════════════
 * READ-ONLY. Nessuna scrittura. Gated da ?cronSecret=.
 *
 * Per ogni ordine FATTURABILE (DELIVERED oppure collegato a pulizia
 * COMPLETED) negli ultimi 24 mesi calcola:
 *   - engineEffective : override ?? calculatedTotal MEMORIZZATO ?? ricalcolo (semantica ||)
 *                       → è ciò che FATTURA il motore (debiti, PDF, email, blocchi)
 *   - adminPage       : override ?? ricalcolo live (semantica ||)
 *                       → è ciò che MOSTRA la pagina pagamenti admin
 *   - ownerPage       : override ?? ricalcolo live (semantica ??, tiene gli 0)
 *                       → è ciò che MOSTRA la pagina pagamenti proprietario
 * e riporta gli ordini in cui i tre numeri non coincidono (> 1 centesimo),
 * aggregati per proprietario/mese.
 *
 * Posizione: src/app/api/debug/audit-divergenze-pagamenti-v1/route.ts
 * Uso: GET /api/debug/audit-divergenze-pagamenti-v1?cronSecret=XXX
 *      parametri opzionali: &months=24  &dettagli=1 (lista completa ordini)
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import {
  calculateOrderRawPrice,
  buildInventoryMap,
  isCleaningProductItem,
  type DebtCalcOrder,
  type DebtCalcInventoryItem,
} from "~/lib/payments/debtCalculator";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const R = (n: number) => Math.round(n * 100) / 100;

function toDate(d: any): Date | null {
  if (!d) return null;
  if (d instanceof Date) return d;
  if (typeof d.toDate === "function") { try { return d.toDate(); } catch { return null; } }
  return null;
}

/** Replica ESATTA della semantica useOwnerRealtimePayments (?? — tiene gli 0). */
function ownerLiveTotal(order: any, invMap: Map<string, DebtCalcInventoryItem>): number {
  let total = 0;
  if (Array.isArray(order.items)) {
    for (const item of order.items) {
      if (isCleaningProductItem(item)) continue;
      const itemKey = item.itemId || item.id;
      const invItem = itemKey ? invMap.get(itemKey) : undefined;
      // ?? : un prezzo salvato a 0 viene TENUTO (diversamente dal motore)
      const basePrice = item.unitPrice ?? item.price ?? invItem?.sellPrice ?? 0;
      const unitPrice = item.priceOverride ?? basePrice;
      const quantity = item.quantity ?? 1;
      const itemTotal = item.totalPrice ?? unitPrice * quantity;
      total += itemTotal;
    }
  }
  if (order.deliveryFee && order.deliveryFeeEnabled !== false) total += order.deliveryFee;
  if (order.bedMaking && order.bedMakingFee) total += order.bedMakingFee;
  return total;
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("cronSecret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const monthsBack = Math.min(36, Math.max(1, Number(req.nextUrl.searchParams.get("months") || 24)));
  const wantDetails = req.nextUrl.searchParams.get("dettagli") === "1";

  const now = new Date();
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const startTs = Timestamp.fromDate(rangeStart);

  // ── Inventario (stessa mappa del motore) ──
  const invSnap = await adminDb.collection("inventory").get();
  const invMap = buildInventoryMap(invSnap.docs.map(d => ({ id: d.id, data: d.data() })));

  // ── Pulizie COMPLETED nel range (per la regola linked-COMPLETED) ──
  const cleaningsSnap = await adminDb.collection("cleanings")
    .where("status", "==", "COMPLETED")
    .where("scheduledDate", ">=", startTs)
    .select("propertyId")
    .get();
  const completedIds = new Set(cleaningsSnap.docs.map(d => d.id));

  // ── Ordini nel range ──
  const ordersSnap = await adminDb.collection("orders")
    .where("scheduledDate", ">=", startTs)
    .get();

  type Row = {
    orderId: string; owner: string; property: string; mese: string; status: string;
    stored: number | null; override: number | null;
    engineEffective: number; adminPage: number; ownerPage: number;
    deltaEngineVsAdmin: number; deltaAdminVsOwner: number;
  };
  const divergenti: Row[] = [];
  const perOwnerMese = new Map<string, { owner: string; mese: string; ordini: number; deltaEngineAdmin: number; deltaAdminOwner: number }>();

  let billable = 0, conStored = 0, conOverride = 0;

  for (const doc of ordersSnap.docs) {
    const o = doc.data() as any;
    if (o.status === "CANCELLED") continue;
    if (o.excludedFromBilling === true) continue;
    const isBillable = o.status === "DELIVERED" || (o.cleaningId && completedIds.has(o.cleaningId));
    if (!isBillable) continue;
    billable++;

    const d = toDate(o.deliveredAt) || toDate(o.scheduledDate);
    const mese = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : "senza-data";

    const stored = typeof o.calculatedTotal === "number" ? o.calculatedTotal : null;
    const override = typeof o.totalPriceOverride === "number" ? o.totalPriceOverride : null;
    if (stored !== null) conStored++;
    if (override !== null) conOverride++;

    const engineLive = calculateOrderRawPrice(o as DebtCalcOrder, invMap);
    const ownerLive = ownerLiveTotal(o, invMap);

    const engineEffective = R(override ?? stored ?? engineLive);
    const adminPage = R(override ?? engineLive);
    const ownerPage = R(override ?? ownerLive);

    const d1 = R(engineEffective - adminPage);
    const d2 = R(adminPage - ownerPage);
    if (Math.abs(d1) > 0.01 || Math.abs(d2) > 0.01) {
      divergenti.push({
        orderId: doc.id,
        owner: o.ownerName || o.ownerId || "?",
        property: o.propertyName || o.propertyId || "?",
        mese, status: o.status,
        stored, override,
        engineEffective, adminPage, ownerPage,
        deltaEngineVsAdmin: d1, deltaAdminVsOwner: d2,
      });
      const k = `${o.ownerName || o.ownerId || "?"}|${mese}`;
      const agg = perOwnerMese.get(k) || { owner: o.ownerName || o.ownerId || "?", mese, ordini: 0, deltaEngineAdmin: 0, deltaAdminOwner: 0 };
      agg.ordini++; agg.deltaEngineAdmin = R(agg.deltaEngineAdmin + d1); agg.deltaAdminOwner = R(agg.deltaAdminOwner + d2);
      perOwnerMese.set(k, agg);
    }
  }

  divergenti.sort((a, b) => Math.abs(b.deltaEngineVsAdmin) + Math.abs(b.deltaAdminVsOwner) - (Math.abs(a.deltaEngineVsAdmin) + Math.abs(a.deltaAdminVsOwner)));

  return NextResponse.json({
    probe: "audit-divergenze-pagamenti-v1",
    readOnly: true,
    finestraMesi: monthsBack,
    ordiniNelRange: ordersSnap.size,
    ordiniFatturabili: billable,
    conCalculatedTotalMemorizzato: conStored,
    conTotalPriceOverride: conOverride,
    ordiniDivergenti: divergenti.length,
    sommaAssolutaDeltaEngineVsAdmin: R(divergenti.reduce((s, r) => s + Math.abs(r.deltaEngineVsAdmin), 0)),
    sommaAssolutaDeltaAdminVsOwner: R(divergenti.reduce((s, r) => s + Math.abs(r.deltaAdminVsOwner), 0)),
    aggregatoPerProprietarioMese: Array.from(perOwnerMese.values()).sort((a, b) => b.ordini - a.ordini),
    dettaglio: wantDetails ? divergenti : divergenti.slice(0, 50),
    nota: divergenti.length > 50 && !wantDetails ? "Dettaglio troncato a 50 — aggiungi &dettagli=1 per la lista completa" : undefined,
  });
}
