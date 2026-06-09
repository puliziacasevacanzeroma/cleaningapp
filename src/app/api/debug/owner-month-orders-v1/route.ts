/**
 * ════════════════════════════════════════════════════════════════════
 * DEBUG: Ordini fatturati per PROPRIETARIO × MESE  (SOLO LETTURA)
 * ════════════════════════════════════════════════════════════════════
 *
 * GET /api/debug/owner-month-orders-v1?cronSecret=XXX&name=benincasa&month=3&year=2026
 *
 * A cosa serve: il tool acconto-rootcause-v1 dice CHE il totale di un mese è
 * calato dopo l'incasso (cambioDiStato), ma NON elenca quale ordine. Questo
 * tool elenca, per il mese richiesto, OGNI ordine che il motore pagamenti
 * conta (stessa regola: status DELIVERED oppure legato a una pulizia
 * COMPLETED del mese), con il dettaglio articoli e il totale ESATTO calcolato
 * con la stessa funzione del motore (calculateOrderRawPrice).
 *
 * Per ogni ordine mostra:
 *   - status ordine, type, cleaningId, STATO della pulizia collegata
 *   - scheduledDate, deliveredAt, updatedAt
 *   - flag STALE  = ordine PENDING ma pulizia COMPLETED (incoerenza nota:
 *                   l'ordine è ancora ricalcolabile da update-pending-orders
 *                   pur essendo già fatturato → sorgente di acconti)
 *   - flag itemsUpdatedFromConfig (scritto da update-pending-orders quando
 *                   ricalcola gli items dalla config)
 *   - items[]: id, nome, quantità, prezzo unitario, totale riga
 *   - totale ordine (= contributo al totaleServizi del mese)
 *
 * Parametri:
 *   cronSecret  (obbligatorio se CRON_SECRET è settato)
 *   name        (sottostringa, case-insensitive, sul nome del proprietario)
 *   ownerId     (alternativa esatta a name)
 *   month, year (default: mese/anno correnti)
 *
 * NON scrive nulla. Nessun apply. Read-only puro.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import {
  calculateOrderRawPrice,
  buildInventoryMap,
  isCleaningProductItem,
  type DebtCalcOrder,
  type DebtCalcInventoryItem,
} from "~/lib/payments/debtCalculator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const round = (n: number) => Math.round(n * 100) / 100;

const toDate = (d: any): Date | null => {
  if (!d) return null;
  if (typeof d.toDate === "function") {
    try { return d.toDate(); } catch { return null; }
  }
  if (d instanceof Date) return d;
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed;
};

const fmt = (d: Date | null): string | null =>
  d ? d.toISOString().slice(0, 10) : null;

const inMonth = (d: Date | null, m: number, y: number): boolean =>
  !!d && d.getMonth() === m - 1 && d.getFullYear() === y;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  if (cronSecret && searchParams.get("cronSecret") !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const now = new Date();
  const month = parseInt(searchParams.get("month") || String(now.getMonth() + 1));
  const year = parseInt(searchParams.get("year") || String(now.getFullYear()));
  const nameFilter = (searchParams.get("name") || "").toLowerCase().trim();
  const ownerFilter = searchParams.get("ownerId");

  if (!nameFilter && !ownerFilter) {
    return NextResponse.json(
      { error: "Specifica ?name=<parte del nome> oppure ?ownerId=<id>" },
      { status: 400 },
    );
  }

  try {
    // ─── 1. Proprietà ATTIVE del proprietario ──────────────────────────
    const [propsSnap, usersSnap, invSnap] = await Promise.all([
      adminDb.collection("properties").where("status", "==", "ACTIVE").get(),
      adminDb.collection("users").where("role", "==", "PROPRIETARIO").get(),
      adminDb.collection("inventory").get(),
    ]);

    // Risolvi ownerId target dal nome (o usa quello passato)
    const ownerNameById = new Map<string, string>();
    usersSnap.docs.forEach((u) => {
      const x = u.data() as any;
      ownerNameById.set(u.id, x.displayName || x.name || x.fullName || x.email || u.id);
    });

    // Proprietà del proprietario target
    const myProps: Array<{ id: string; name: string; ownerId: string }> = [];
    const ownerNameSeen = new Map<string, string>();
    propsSnap.docs.forEach((p) => {
      const x = p.data() as any;
      const oid = x.ownerId || "";
      const oname = (x.ownerName || ownerNameById.get(oid) || oid).toString();
      ownerNameSeen.set(oid, oname);
      const matchesOwner = ownerFilter
        ? oid === ownerFilter
        : oname.toLowerCase().includes(nameFilter);
      if (matchesOwner) {
        myProps.push({ id: p.id, name: x.name || p.id, ownerId: oid });
      }
    });

    if (myProps.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Nessuna proprietà ATTIVA trovata per quel proprietario",
        proprietariVisti: Array.from(ownerNameSeen.values()).sort(),
      });
    }

    const propIds = new Set(myProps.map((p) => p.id));
    const propNameById = new Map(myProps.map((p) => [p.id, p.name]));
    const resolvedOwnerName = ownerNameSeen.get(myProps[0].ownerId) || myProps[0].ownerId;

    // ─── 2. Inventory map (stesso pricing del motore) ──────────────────
    const inventoryById = buildInventoryMap(
      invSnap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, any> })),
    );
    const invNameById = new Map<string, string>();
    invSnap.docs.forEach((d) => {
      const x = d.data() as any;
      const nm = x.name || "";
      invNameById.set(d.id, nm);
      if (x.key) invNameById.set(x.key, nm);
      if (d.id.startsWith("item_")) invNameById.set(d.id.replace("item_", ""), nm);
    });

    // ─── 3. Range del mese ─────────────────────────────────────────────
    const startTs = new Date(year, month - 1, 1, 0, 0, 0);
    const endTs = new Date(year, month, 0, 23, 59, 59);

    // ─── 4. Pulizie COMPLETED del mese (set come fa il motore) ─────────
    const cleaningsSnap = await adminDb
      .collection("cleanings")
      .where("scheduledDate", ">=", startTs)
      .where("scheduledDate", "<=", endTs)
      .get();

    const completedInMonth = new Set<string>();
    cleaningsSnap.docs.forEach((c) => {
      const x = c.data() as any;
      if (!propIds.has(x.propertyId)) return;
      if (x.status === "COMPLETED") completedInMonth.add(c.id);
    });

    // ─── 5. Ordini candidati: per scheduledDate nel mese + per deliveredAt nel mese ─
    const ordersById = new Map<string, any>();
    const bySched = await adminDb
      .collection("orders")
      .where("scheduledDate", ">=", startTs)
      .where("scheduledDate", "<=", endTs)
      .get();
    bySched.docs.forEach((o) => ordersById.set(o.id, o.data()));
    try {
      const byDeliv = await adminDb
        .collection("orders")
        .where("deliveredAt", ">=", startTs)
        .where("deliveredAt", "<=", endTs)
        .get();
      byDeliv.docs.forEach((o) => {
        if (!ordersById.has(o.id)) ordersById.set(o.id, o.data());
      });
    } catch { /* deliveredAt non indicizzato o assente: ok */ }

    // ─── 6. Per ogni ordine del proprietario: applica regola motore + dettaglio ─
    const cleaningCache = new Map<string, any | null>();
    const getCleaning = async (cid: string) => {
      if (cleaningCache.has(cid)) return cleaningCache.get(cid);
      try {
        const cs = await adminDb.collection("cleanings").doc(cid).get();
        const v = cs.exists ? cs.data() : null;
        cleaningCache.set(cid, v);
        return v;
      } catch {
        cleaningCache.set(cid, null);
        return null;
      }
    };

    const rows: any[] = [];
    let totaleOrdiniContati = 0;

    for (const [oid, o] of ordersById.entries()) {
      if (!propIds.has(o.propertyId)) continue;

      const status = o.status;
      const excluded = o.excludedFromBilling === true;
      const cleaningId: string | undefined = o.cleaningId;

      // stato pulizia collegata (per flag STALE e per regola linked-COMPLETED)
      let cleaningStatus: string | null = null;
      if (cleaningId) {
        const c = await getCleaning(cleaningId);
        cleaningStatus = c ? (c.status ?? null) : "NON_TROVATA";
      }

      const isDelivered = status === "DELIVERED";
      const isLinkedToCompleted =
        !!cleaningId && completedInMonth.has(cleaningId);

      // data ordine come il motore: deliveredAt → scheduledDate
      const orderDate = toDate(o.deliveredAt) || toDate(o.scheduledDate);
      const dateInMonth = inMonth(orderDate, month, year);

      const counts =
        status !== "CANCELLED" &&
        !excluded &&
        (isDelivered || isLinkedToCompleted) &&
        dateInMonth;

      // dettaglio items con pricing identico al motore
      const itemsDetail: any[] = [];
      let orderTotal = 0;
      if (Array.isArray(o.items)) {
        for (const item of o.items) {
          const isCleaningProd = isCleaningProductItem(item);
          const itemKey = item.itemId || item.id;
          const invItem: DebtCalcInventoryItem | undefined = itemKey
            ? inventoryById.get(itemKey)
            : undefined;
          const basePrice =
            (item.unitPrice || undefined) ??
            (item.price || undefined) ??
            invItem?.sellPrice ??
            invItem?.price ??
            0;
          const unitPrice = item.priceOverride ?? basePrice;
          const qty = item.quantity ?? 1;
          const lineTotal = isCleaningProd ? 0 : round(unitPrice * qty);
          if (!isCleaningProd) orderTotal += unitPrice * qty;
          itemsDetail.push({
            id: itemKey ?? null,
            nome:
              invNameById.get(itemKey) ||
              (typeof item.name === "string" ? item.name : null) ||
              itemKey ||
              null,
            qty,
            prezzoUnit: round(unitPrice),
            totaleRiga: lineTotal,
            prodottoPulizia: isCleaningProd || undefined,
          });
        }
      }

      // totale "ufficiale" del motore per quest'ordine (per cross-check)
      const rawPriceMotore = round(
        calculateOrderRawPrice(o as DebtCalcOrder, inventoryById),
      );
      const effective =
        typeof o.totalPriceOverride === "number"
          ? o.totalPriceOverride
          : typeof o.calculatedTotal === "number"
            ? o.calculatedTotal
            : rawPriceMotore;

      if (counts) totaleOrdiniContati += effective;

      const stale =
        status === "PENDING" && cleaningStatus === "COMPLETED";

      rows.push({
        orderId: oid,
        proprieta: propNameById.get(o.propertyId) || o.propertyId,
        status,
        type: o.type ?? null,
        cleaningId: cleaningId ?? null,
        statoPulizia: cleaningStatus,
        CONTA_NEL_MESE: counts,
        STALE_pending_su_completed: stale || undefined,
        itemsUpdatedFromConfig: o.itemsUpdatedFromConfig === true || undefined,
        excludedFromBilling: excluded || undefined,
        scheduledDate: fmt(toDate(o.scheduledDate)),
        deliveredAt: fmt(toDate(o.deliveredAt)),
        updatedAt: fmt(toDate(o.updatedAt)),
        guestsCount: o.guestsCount ?? null,
        totaleOrdine_effettivo: round(effective),
        totaleOrdine_raricalcDaItems: rawPriceMotore,
        calculatedTotal_memorizzato:
          typeof o.calculatedTotal === "number" ? round(o.calculatedTotal) : undefined,
        totalPriceOverride:
          typeof o.totalPriceOverride === "number" ? round(o.totalPriceOverride) : undefined,
        items: itemsDetail,
      });
    }

    // ordina: prima quelli che contano, poi per totale desc
    rows.sort((a, b) => {
      if (a.CONTA_NEL_MESE !== b.CONTA_NEL_MESE) return a.CONTA_NEL_MESE ? -1 : 1;
      return (b.totaleOrdine_effettivo || 0) - (a.totaleOrdine_effettivo || 0);
    });

    const staleRows = rows.filter((r) => r.STALE_pending_su_completed);
    const configTouched = rows.filter((r) => r.itemsUpdatedFromConfig);

    return NextResponse.json({
      success: true,
      proprietario: resolvedOwnerName,
      ownerId: myProps[0].ownerId,
      mese: { month, year },
      proprietaAttive: myProps.map((p) => p.name),
      riepilogo: {
        ordiniTotaliEsaminati: rows.length,
        ordiniCheContano: rows.filter((r) => r.CONTA_NEL_MESE).length,
        totaleOrdiniContati: round(totaleOrdiniContati),
        ordiniSTALE_pending_su_completed: staleRows.length,
        ordiniConItemsRicalcolatiDaConfig: configTouched.length,
        nota:
          "Confronta 'totaleOrdiniContati' con l'incasso del mese. Gli ordini " +
          "con STALE_pending_su_completed=true e/o itemsUpdatedFromConfig=true " +
          "con updatedAt SUCCESSIVO alla data di incasso sono i candidati al calo.",
      },
      ordini: rows,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Errore server",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
