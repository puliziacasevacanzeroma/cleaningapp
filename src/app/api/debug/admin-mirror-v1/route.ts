/**
 * ════════════════════════════════════════════════════════════════════
 * DEBUG: Admin Mirror v1 — replica server-side del calcolo UI admin
 * ════════════════════════════════════════════════════════════════════
 *
 * GET /api/debug/admin-mirror-v1?cronSecret=XXX
 *
 * Questa API riproduce ESATTAMENTE la logica di calcolo carryover che
 * viene eseguita lato client dal hook useRealtimePayments.ts (la pagina
 * /dashboard/pagamenti). È volutamente fedele ai BUG di quella logica:
 *
 *  - Riga 528-555 useRealtimePayments.ts: gli ordini precedenti sono
 *    contati senza filtro per status DELIVERED né per linked-COMPLETED.
 *    Vengono esclusi solo CANCELLED/excluded? — vedi sotto.
 *  - Filtro excludedFromBilling=true: applicato.
 *  - Filtro CANCELLED: NON applicato (nel code admin l'unica esclusione
 *    è excludedFromBilling).
 *  - Per il MESE CORRENTE useRealtimePayments filtra invece per DELIVERED
 *    o linked-COMPLETED. Qui non ci interessa: il carryover guarda solo
 *    ai mesi PRECEDENTI.
 *
 * Lo scopo è: confrontare numericamente "quello che vede l'admin in UI"
 * vs "quello che dice il canonico" vs "quello che dice carryover-analysis".
 *
 * READ-ONLY: nessuna scrittura su Firestore.
 *
 * Query params:
 *   cronSecret    (obbligatorio se settato)
 *   ownerId       (opzionale)
 *   name          (opzionale)
 *   month         (opzionale, mese di riferimento; default = mese corrente)
 *   year          (opzionale, anno di riferimento; default = anno corrente)
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const THRESHOLD = 0.01;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  const urlSecret = searchParams.get("cronSecret");
  if (cronSecret && urlSecret !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const now = new Date();
  const refMonth = parseInt(searchParams.get("month") || String(now.getMonth() + 1));
  const refYear = parseInt(searchParams.get("year") || String(now.getFullYear()));
  const ownerFilter = searchParams.get("ownerId");
  const nameFilter = searchParams.get("name")?.toLowerCase() || null;

  try {
    // ════════════════════════════════════════════════════════════
    // 1. CARICA TUTTO
    // ════════════════════════════════════════════════════════════
    const [
      usersSnap,
      propsSnap,
      cleaningsSnap,
      ordersSnap,
      paymentsSnap,
      overridesSnap,
      inventorySnap,
    ] = await Promise.all([
      adminDb.collection("users")
        .where("role", "in", ["PROPRIETARIO", "CLIENTE", "OWNER"])
        .where("status", "==", "ACTIVE")
        .get(),
      // useRealtimePayments riga 153: filtra status==ACTIVE
      adminDb.collection("properties").where("status", "==", "ACTIVE").get(),
      // ⚠️ Lato client useRealtimePayments carica TUTTE le pulizie (no filtro status).
      // Il filtro COMPLETED viene applicato in JS. Replico fedelmente.
      adminDb.collection("cleanings").get(),
      adminDb.collection("orders").get(),
      adminDb.collection("payments").get(),
      adminDb.collection("paymentOverrides").get(),
      adminDb.collection("inventory").get(),
    ]);

    // Inventory: replico esattamente staticCache.inventory di useRealtimePayments
    // (riga 367-376 di debtCalculator buildInventoryMap, ma con sellPrice/price)
    const inventoryById = new Map<string, { sellPrice: number }>();
    inventorySnap.docs.forEach((d) => {
      const data = d.data() as any;
      const item = { sellPrice: data.sellPrice ?? data.price ?? 0 };
      inventoryById.set(d.id, item);
      if (data.key) inventoryById.set(data.key, item);
      if (d.id.startsWith("item_")) inventoryById.set(d.id.replace("item_", ""), item);
    });

    // Properties → ownerId map
    const propToOwner = new Map<string, string>();
    const propCleaningPrice = new Map<string, number>();
    propsSnap.docs.forEach((d) => {
      const data = d.data() as any;
      propToOwner.set(d.id, data.ownerId || "unknown");
      propCleaningPrice.set(d.id, data.cleaningPrice || 0);
    });

    // Helpers (replicano riga 482-494 useRealtimePayments)
    const getMonthYear = (rawDate: any): { m: number; y: number } | null => {
      if (!rawDate) return null;
      const d = rawDate?.toDate?.() || (rawDate instanceof Date ? rawDate : null);
      if (!d) return null;
      return { m: d.getMonth() + 1, y: d.getFullYear() };
    };

    const isBefore = (m: number, y: number): boolean => {
      if (y < refYear) return true;
      if (y > refYear) return false;
      return m < refMonth;
    };

    // ════════════════════════════════════════════════════════════
    // 2. COSTRUISCI byOwnerMonth REPLICANDO LA LOGICA ADMIN
    //    (useRealtimePayments.ts righe 496-578)
    // ════════════════════════════════════════════════════════════
    type Bucket = { servizi: number; pagamenti: number; cleaningsCount: number; ordersCount: number; hasOverride: boolean; rawServiziBeforeOverride?: number };
    const byOwnerMonth = new Map<string, Map<string, Bucket>>();
    const ensureBucket = (oid: string, m: number, y: number): Bucket => {
      if (!byOwnerMonth.has(oid)) byOwnerMonth.set(oid, new Map());
      const inner = byOwnerMonth.get(oid)!;
      const key = `${y}-${m}`;
      if (!inner.has(key)) inner.set(key, {
        servizi: 0, pagamenti: 0, cleaningsCount: 0, ordersCount: 0, hasOverride: false,
      });
      return inner.get(key)!;
    };

    // ─── PULIZIE PRECEDENTI (riga 508-520) ───
    cleaningsSnap.docs.forEach((d) => {
      const c = d.data() as any;
      if (c.status !== "COMPLETED") return;                   // riga 509
      if (c.excludedFromBilling === true) return;             // riga 510
      const my = getMonthYear(c.scheduledDate);               // riga 511
      if (!my || !isBefore(my.m, my.y)) return;
      const oid = propToOwner.get(c.propertyId);              // riga 513
      if (!oid) return;
      const basePrice = c.price ?? propCleaningPrice.get(c.propertyId) ?? 0;
      const holidayFee = c.holidayFee ?? 0;
      const eff = (c.priceOverride ?? basePrice) + holidayFee;
      const b = ensureBucket(oid, my.m, my.y);
      b.servizi += eff;
      b.cleaningsCount += 1;
    });

    // ─── ORDINI PRECEDENTI (riga 528-555) ───
    // ⚠️ NESSUN filtro status === DELIVERED. NESSUN filtro CANCELLED.
    // Questa è la divergenza DIV-4 che voglio dimostrare.
    ordersSnap.docs.forEach((d) => {
      const o = d.data() as any;
      if (o.excludedFromBilling === true) return;             // riga 529
      const refDate = o.deliveredAt || o.scheduledDate;       // riga 530
      const my = getMonthYear(refDate);
      if (!my || !isBefore(my.m, my.y)) return;
      const oid = propToOwner.get(o.propertyId);
      if (!oid) return;

      let orderPrice = 0;
      if (o.totalPriceOverride !== undefined && o.totalPriceOverride !== null) {
        orderPrice = o.totalPriceOverride;
      } else {
        if (Array.isArray(o.items)) {
          for (const item of o.items) {
            const itemKey = item.itemId || item.id;
            const invItem = itemKey ? inventoryById.get(itemKey) : undefined;
            const basePrice = item.unitPrice ?? item.price ?? invItem?.sellPrice ?? 0;
            const unitPrice = item.priceOverride ?? basePrice;
            const quantity = item.quantity ?? 1;
            const itemTotal = item.totalPrice ?? (unitPrice * quantity);
            orderPrice += itemTotal;
          }
        }
        if (o.deliveryFee && o.deliveryFeeEnabled !== false) orderPrice += o.deliveryFee;
        if (o.bedMaking && o.bedMakingFee) orderPrice += o.bedMakingFee;
      }

      const b = ensureBucket(oid, my.m, my.y);
      b.servizi += orderPrice;
      b.ordersCount += 1;
    });

    // ─── APPLICA PAYMENT OVERRIDES (riga 560-569) ───
    overridesSnap.docs.forEach((d) => {
      const ov = d.data() as any;
      const oM = Number(ov.month);
      const oY = Number(ov.year);
      const oOid = ov.proprietarioId;
      if (!oOid || !oM || !oY) return;
      if (!isBefore(oM, oY)) return;
      if (typeof ov.overrideTotal !== "number") return;
      const b = ensureBucket(oOid, oM, oY);
      b.rawServiziBeforeOverride = b.servizi;
      b.servizi = ov.overrideTotal;
      b.hasOverride = true;
    });

    // ─── PAGAMENTI PRECEDENTI (riga 571-578) ───
    paymentsSnap.docs.forEach((d) => {
      const p = d.data() as any;
      const pY = Number(p.year);
      const pM = Number(p.month);
      if (!pY || !pM) return;
      if (!isBefore(pM, pY)) return;
      if (p.isCreditTransfer === true) return;                // riga 576
      const oid = p.proprietarioId;
      if (!oid) return;
      const b = ensureBucket(oid, pM, pY);
      b.pagamenti += (p.amount || 0);
    });

    // ════════════════════════════════════════════════════════════
    // 3. PER OGNI OWNER, RUNNING CREDIT (riga 581-604)
    // ════════════════════════════════════════════════════════════
    const ownersById = new Map<string, any>();
    usersSnap.docs.forEach((d) => ownersById.set(d.id, { id: d.id, ...(d.data() as any) }));

    const reports: any[] = [];

    byOwnerMonth.forEach((monthMap, ownerId) => {
      const owner = ownersById.get(ownerId);
      if (!owner) return;
      const ownerName =
        owner.displayName || owner.name || owner.fullName || owner.email || "?";

      if (ownerFilter && ownerId !== ownerFilter) return;
      if (nameFilter && !ownerName.toLowerCase().includes(nameFilter)) return;

      // Ordina chiavi cronologicamente (replicando :583-588)
      const sortedKeys = Array.from(monthMap.keys()).sort((a, b) => {
        const [ay, am] = a.split("-").map(Number);
        const [by, bm] = b.split("-").map(Number);
        if (ay !== by) return ay - by;
        return am - bm;
      });

      let running = 0;
      const monthlyDetail: any[] = [];

      for (const key of sortedKeys) {
        const b = monthMap.get(key)!;
        // Replico esattamente :593: "Solo mesi con attività reale"
        if (b.servizi <= 0 && b.pagamenti <= 0) continue;
        const saldo = b.servizi - b.pagamenti;
        let creditChange = 0;
        let consumedFromCredit = 0;
        if (saldo < -0.01) {
          creditChange = -saldo;
          running += creditChange;
        } else if (saldo > 0.01 && running > 0) {
          consumedFromCredit = Math.min(saldo, running);
          running -= consumedFromCredit;
        }
        const [y, m] = key.split("-").map(Number);
        monthlyDetail.push({
          year: y, month: m,
          servizi: round(b.servizi),
          pagamenti: round(b.pagamenti),
          saldo: round(saldo),
          cleaningsCount: b.cleaningsCount,
          ordersCount: b.ordersCount,
          hasOverride: b.hasOverride,
          rawServiziBeforeOverride: b.rawServiziBeforeOverride !== undefined
            ? round(b.rawServiziBeforeOverride)
            : undefined,
          creditAccumulated: round(creditChange),
          consumedFromCredit: round(consumedFromCredit),
          runningAfter: round(running),
        });
      }

      // Replica :603 — solo se running > 0.01 finisce in stats
      if (running > THRESHOLD) {
        reports.push({
          ownerId,
          ownerName,
          email: (owner.email || "").toLowerCase(),
          admin_creditoPrecedente: round(running),
          monthlyDetail,
        });
      }
    });

    reports.sort((a, b) => b.admin_creditoPrecedente - a.admin_creditoPrecedente);

    return NextResponse.json({
      success: true,
      _source: "Replica fedele di useRealtimePayments.ts righe 465-605 (carryover lato admin)",
      _refMonth: refMonth,
      _refYear: refYear,
      summary: {
        ownersWithCredit: reports.length,
        sumAdminCreditoPrecedente: round(reports.reduce((s, r) => s + r.admin_creditoPrecedente, 0)),
      },
      reports,
    });
  } catch (error: any) {
    console.error("Errore admin-mirror-v1:", error);
    return NextResponse.json(
      {
        error: "Errore server",
        message: error?.message,
        stack: error?.stack?.split("\n").slice(0, 5).join("\n"),
      },
      { status: 500 },
    );
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
