/**
 * GET /api/debug/payments-diff-audit
 *
 * SCRIPT DI DIAGNOSI — confronta i totali calcolati da:
 *   • useOwnerBalance.ts        (usato dalla MODAL "Pagamenti in sospeso")
 *   • useOwnerRealtimePayments.ts (usato dalla PAGINA /proprietario/pagamenti)
 *
 * Per ogni proprietario × mese (ultimi 24 mesi, escluso mese corrente)
 * calcola entrambi i totali, li confronta, e attribuisce la differenza
 * a una di queste cause (o combinazione):
 *
 *   A) bedMakingFee  — la PAGINA lo somma, la MODAL no
 *   B) paymentOverride — la MODAL lo applica, la PAGINA lo ignora
 *   C) fallback createdAt per ordini senza deliveredAt né scheduledDate
 *      — la MODAL lo include, la PAGINA no (ordine "scompare" dal mese)
 *
 * Auth: ADMIN o cronSecret
 *
 * Query params:
 *   email   = filtra per email (opzionale, utile per debug singolo cliente)
 *   minDiff = differenza minima in € da riportare (default 0.01)
 *
 * Output: JSON con summary + lista divergenze ordinata dalla più grande
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET;

// ════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════

interface PropertyData {
  id: string;
  ownerId: string;
  cleaningPrice: number;
  status: string;
}

interface CleaningData {
  id: string;
  propertyId: string;
  status: string;
  scheduledDate: Timestamp | undefined;
  price?: number;
  priceOverride?: number;
  holidayFee?: number;
}

interface OrderData {
  id: string;
  propertyId: string;
  status: string;
  cleaningId?: string;
  scheduledDate?: Timestamp;
  deliveredAt?: Timestamp;
  createdAt?: Timestamp;
  items?: any[];
  totalPriceOverride?: number;
  deliveryFee?: number;
  deliveryFeeEnabled?: boolean;
  bedMaking?: boolean;
  bedMakingFee?: number;
  bedMakingCount?: number;
}

interface PaymentOverrideData {
  proprietarioId: string;
  month: number;
  year: number;
  overrideTotal: number;
  reason?: string;
}

interface MonthDiff {
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  month: number;
  year: number;
  monthLabel: string;
  totaleModal: number;            // useOwnerBalance
  totalePagina: number;           // useOwnerRealtimePayments
  diff: number;                   // pagina - modal (positivo = pagina vede di più)
  // Attribuzione
  bedMakingFeeImpact: number;     // bedMaking che spinge SU la pagina
  overrideImpact: number;         // override che tira GIÙ la modal (= calc - override quando override < calc)
  fallbackCreatedAtImpact: number;// ordini visibili solo alla modal grazie a createdAt fallback
  cause: string;                  // descrizione human-readable
  ordersInMonth: number;
  cleaningsInMonth: number;
}

// ════════════════════════════════════════════════════════════════
// HELPERS — replicano ESATTAMENTE le due formule
// ════════════════════════════════════════════════════════════════

function dateInMonth(date: Date | null, month: number, year: number): boolean {
  if (!date) return false;
  return date.getMonth() === month - 1 && date.getFullYear() === year;
}

/**
 * Replica useOwnerBalance.ts (modal):
 *   - cleanings: COMPLETED nel mese, scheduledDate
 *   - orders: DELIVERED o cleaningId in completedCleaningIds del mese
 *     → fallback date: deliveredAt → scheduledDate → createdAt
 *     → NO bedMakingFee
 *   - applica paymentOverride
 */
function computeModalTotal(args: {
  properties: Map<string, PropertyData>;
  cleanings: CleaningData[];
  orders: OrderData[];
  override: PaymentOverrideData | undefined;
  month: number;
  year: number;
  inventoryById: Map<string, { sellPrice: number }>;
}): { total: number; cleaningsTotal: number; ordersTotal: number; ordersCount: number; cleaningsCount: number; rawCalc: number; appliedOverride: boolean } {
  const { properties, cleanings, orders, override, month, year, inventoryById } = args;

  const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59);

  let cleaningsTotal = 0;
  let cleaningsCount = 0;
  let ordersTotal = 0;
  let ordersCount = 0;

  // Pulizie COMPLETED nel mese
  const completedCleaningIdsInMonth = new Set<string>();
  cleanings.forEach(c => {
    if (c.status !== "COMPLETED") return;
    const d = c.scheduledDate?.toDate?.();
    if (!d) return;
    if (d < startOfMonth || d > endOfMonth) return;

    const prop = properties.get(c.propertyId);
    const basePrice = c.price || prop?.cleaningPrice || 0;
    const hFee = c.holidayFee ?? 0;
    const effectivePrice = (c.priceOverride ?? basePrice) + hFee;
    cleaningsTotal += effectivePrice;
    cleaningsCount++;
    completedCleaningIdsInMonth.add(c.id);
  });

  // Ordini: DELIVERED o legati a pulizia COMPLETED del mese
  // → fallback createdAt PRESENTE (modal)
  // → bedMakingFee NON sommato (modal)
  orders.forEach(o => {
    if (o.status === "CANCELLED") return;
    const isDelivered = o.status === "DELIVERED";
    const isLinked = o.cleaningId && completedCleaningIdsInMonth.has(o.cleaningId);
    if (!isDelivered && !isLinked) return;

    const d = o.deliveredAt?.toDate?.()
      || o.scheduledDate?.toDate?.()
      || o.createdAt?.toDate?.();   // ← fallback createdAt (solo modal)
    if (!d) return;
    if (d < startOfMonth || d > endOfMonth) return;

    let calc = 0;
    if (Array.isArray(o.items)) {
      o.items.forEach((item: any) => {
        const itemKey = item.itemId || item.id;
        const inv = inventoryById.get(itemKey);
        const basePrice = item.unitPrice || item.price || inv?.sellPrice || 0;
        const unitPrice = item.priceOverride ?? basePrice;
        const qty = item.quantity || 1;
        const itemTotal = item.totalPrice || (unitPrice * qty);
        calc += itemTotal;
      });
    }
    const deliveryFee = (o.deliveryFee && o.deliveryFeeEnabled !== false) ? o.deliveryFee : 0;
    calc += deliveryFee;
    // ⚠️ NESSUN bedMakingFee qui — questa è la modal

    const effective = o.totalPriceOverride ?? calc;
    ordersTotal += effective;
    ordersCount++;
  });

  const rawCalc = cleaningsTotal + ordersTotal;
  const appliedOverride = override !== undefined;
  const total = appliedOverride ? override!.overrideTotal : rawCalc;

  return { total, cleaningsTotal, ordersTotal, ordersCount, cleaningsCount, rawCalc, appliedOverride };
}

/**
 * Replica useOwnerRealtimePayments.ts (pagina):
 *   - cleanings: COMPLETED nel mese, scheduledDate
 *   - orders: DELIVERED o cleaningId in completedCleaningIds del mese
 *     → fallback date: deliveredAt → scheduledDate (NO createdAt)
 *     → bedMakingFee SOMMATO
 *   - NON applica paymentOverride
 */
function computePaginaTotal(args: {
  properties: Map<string, PropertyData>;
  cleanings: CleaningData[];
  orders: OrderData[];
  month: number;
  year: number;
  inventoryById: Map<string, { sellPrice: number }>;
}): { total: number; cleaningsTotal: number; ordersTotal: number; ordersCount: number; cleaningsCount: number; bedMakingFeeTotal: number } {
  const { properties, cleanings, orders, month, year, inventoryById } = args;

  // Pulizie COMPLETED nel mese (filtro per mese, no soglia oraria)
  const monthCleanings = cleanings.filter(c => {
    if (c.status !== "COMPLETED") return false;
    const d = c.scheduledDate?.toDate?.();
    return dateInMonth(d ?? null, month, year);
  });
  const completedCleaningIds = new Set(monthCleanings.map(c => c.id));

  let cleaningsTotal = 0;
  let cleaningsCount = 0;
  monthCleanings.forEach(c => {
    const prop = properties.get(c.propertyId);
    const basePrice = c.price || prop?.cleaningPrice || 0;
    const hFee = c.holidayFee ?? 0;
    const effectivePrice = (c.priceOverride ?? basePrice) + hFee;
    cleaningsTotal += effectivePrice;
    cleaningsCount++;
  });

  // Ordini con la STESSA logica della pagina (no fallback createdAt, sì bedMakingFee)
  let ordersTotal = 0;
  let ordersCount = 0;
  let bedMakingFeeTotal = 0;
  orders.forEach(o => {
    if (o.status === "CANCELLED") return;
    // Filtro mese: SOLO deliveredAt → scheduledDate
    const dateForFilter = o.deliveredAt?.toDate?.() || o.scheduledDate?.toDate?.() || null;
    if (!dateInMonth(dateForFilter, month, year)) return;

    const isDelivered = o.status === "DELIVERED";
    const isLinked = o.cleaningId && completedCleaningIds.has(o.cleaningId);
    if (!isDelivered && !isLinked) return;

    let calc = 0;
    if (Array.isArray(o.items)) {
      o.items.forEach((item: any) => {
        const itemKey = item.itemId || item.id;
        const inv = inventoryById.get(itemKey);
        const basePrice = item.unitPrice || item.price || inv?.sellPrice || 0;
        const unitPrice = item.priceOverride ?? basePrice;
        const qty = item.quantity || 1;
        const itemTotal = item.totalPrice || (unitPrice * qty);
        calc += itemTotal;
      });
    }
    const deliveryFee = (o.deliveryFee && o.deliveryFeeEnabled !== false) ? o.deliveryFee : 0;
    calc += deliveryFee;
    const bedMakingFee = (o.bedMaking && o.bedMakingFee) ? o.bedMakingFee : 0;
    calc += bedMakingFee;
    bedMakingFeeTotal += bedMakingFee;

    const effective = o.totalPriceOverride ?? calc;
    ordersTotal += effective;
    ordersCount++;
  });

  const total = cleaningsTotal + ordersTotal;
  return { total, cleaningsTotal, ordersTotal, ordersCount, cleaningsCount, bedMakingFeeTotal };
}

/**
 * Calcola anche i contributi attribuibili a CIASCUNA delle 3 cause.
 * Servono per spiegare la differenza, non solo segnalarla.
 */
function computeImpacts(args: {
  properties: Map<string, PropertyData>;
  cleanings: CleaningData[];
  orders: OrderData[];
  month: number;
  year: number;
  inventoryById: Map<string, { sellPrice: number }>;
  override: PaymentOverrideData | undefined;
}): {
  bedMakingFeeImpact: number;
  fallbackCreatedAtImpact: number;
  overrideImpact: number;
} {
  const { properties, cleanings, orders, month, year, inventoryById, override } = args;

  // Set di pulizie COMPLETED nel mese (per criterio "isLinked")
  const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59);
  const completedInMonth = new Set<string>();
  cleanings.forEach(c => {
    if (c.status !== "COMPLETED") return;
    const d = c.scheduledDate?.toDate?.();
    if (!d) return;
    if (d >= startOfMonth && d <= endOfMonth) completedInMonth.add(c.id);
  });

  let bedMakingFeeImpact = 0;
  let fallbackCreatedAtImpact = 0;

  orders.forEach(o => {
    if (o.status === "CANCELLED") return;
    const isDelivered = o.status === "DELIVERED";
    const isLinked = o.cleaningId && completedInMonth.has(o.cleaningId);
    if (!isDelivered && !isLinked) return;

    const dPagina = o.deliveredAt?.toDate?.() || o.scheduledDate?.toDate?.() || null;
    const dModal = dPagina || o.createdAt?.toDate?.() || null;

    const inMonthPagina = dateInMonth(dPagina, month, year);
    const inMonthModal = dateInMonth(dModal, month, year);

    // Caso: ordine visibile SOLO alla modal (per fallback createdAt)
    if (!inMonthPagina && inMonthModal) {
      // Calcolo prezzo dell'ordine come fa la modal (no bedMaking)
      let calc = 0;
      if (Array.isArray(o.items)) {
        o.items.forEach((item: any) => {
          const itemKey = item.itemId || item.id;
          const inv = inventoryById.get(itemKey);
          const basePrice = item.unitPrice || item.price || inv?.sellPrice || 0;
          const unitPrice = item.priceOverride ?? basePrice;
          const qty = item.quantity || 1;
          const itemTotal = item.totalPrice || (unitPrice * qty);
          calc += itemTotal;
        });
      }
      const deliveryFee = (o.deliveryFee && o.deliveryFeeEnabled !== false) ? o.deliveryFee : 0;
      calc += deliveryFee;
      const eff = o.totalPriceOverride ?? calc;
      fallbackCreatedAtImpact += eff;
    }

    // Caso: ordine visibile a entrambi → bedMakingFee è la differenza
    if (inMonthPagina) {
      const bedMakingFee = (o.bedMaking && o.bedMakingFee) ? o.bedMakingFee : 0;
      // Solo se non c'è totalPriceOverride: con override il prezzo è fissato e bedMaking
      // non aggiunge nulla di visibile (entrambi prendono quel valore)
      if (o.totalPriceOverride === undefined || o.totalPriceOverride === null) {
        bedMakingFeeImpact += bedMakingFee;
      }
    }
  });

  // Override impact: se esiste un override, la modal usa overrideTotal
  // mentre la pagina usa il calcolo grezzo della pagina.
  // L'impatto sulla diff (pagina - modal) è (rawCalcPagina - overrideTotal)
  // ma calcoliamolo direttamente dopo aver i due totali — qui ritorniamo
  // l'informazione grezza per il caller.
  let overrideImpact = 0;
  if (override) {
    // Per misurare il "pull-down" della modal rispetto al raw, dobbiamo
    // sapere il rawCalc della modal stessa. Lo facciamo nel caller.
    overrideImpact = override.overrideTotal; // sentinella: override esiste
  }

  return { bedMakingFeeImpact, fallbackCreatedAtImpact, overrideImpact };
}

// ════════════════════════════════════════════════════════════════
// HANDLER
// ════════════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  try {
    // ─── AUTH ─────────────────────────────────────────────
    const cronSecretParam = req.nextUrl.searchParams.get("cronSecret");
    const isCronCall = CRON_SECRET && cronSecretParam === CRON_SECRET;
    if (!isCronCall) {
      const user = await getApiUser();
      if (!user || user.role?.toUpperCase() !== "ADMIN") {
        return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
      }
    }

    const filterEmail = req.nextUrl.searchParams.get("email")?.toLowerCase().trim();
    const minDiffParam = req.nextUrl.searchParams.get("minDiff");
    const minDiff = minDiffParam ? parseFloat(minDiffParam) : 0.01;

    const t0 = Date.now();

    // ─── 1. Carica utenti PROPRIETARIO ATTIVI ────────────
    const usersSnap = await adminDb.collection("users")
      .where("role", "==", "PROPRIETARIO")
      .where("status", "==", "ACTIVE")
      .get();

    const allOwners = usersSnap.docs
      .map(d => {
        const u = d.data();
        return {
          id: d.id,
          email: (u.email || "").toLowerCase().trim(),
          name: u.displayName || u.name || u.email || "(senza nome)",
        };
      })
      .filter(u => u.email && (!filterEmail || u.email === filterEmail));

    if (allOwners.length === 0) {
      return NextResponse.json({
        ok: true,
        message: filterEmail ? `Nessun proprietario con email ${filterEmail}` : "Nessun proprietario attivo",
        diffs: [],
      });
    }

    // ─── 2. Carica inventory una sola volta ───────────────
    const inventorySnap = await adminDb.collection("inventory").get();
    const inventoryById = new Map<string, { sellPrice: number }>();
    inventorySnap.docs.forEach(d => {
      const data = d.data();
      const item = { sellPrice: data.sellPrice || data.price || 0 };
      inventoryById.set(d.id, item);
      if (data.key) inventoryById.set(data.key, item);
      if (d.id.startsWith("item_")) inventoryById.set(d.id.replace("item_", ""), item);
    });

    // ─── 3. Range temporale: ultimi 24 mesi (escluso corrente) ───
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const monthsToCheck: { month: number; year: number }[] = [];
    for (let i = 1; i <= 24; i++) {
      let m = currentMonth - i;
      let y = currentYear;
      while (m <= 0) { m += 12; y -= 1; }
      monthsToCheck.push({ month: m, year: y });
    }

    const allDiffs: MonthDiff[] = [];
    let ownersChecked = 0;
    let ownersWithDiff = 0;

    // ─── 4. Per ogni proprietario, calcola entrambi i totali ───
    for (const owner of allOwners) {
      ownersChecked++;

      // Proprietà ATTIVE del proprietario
      const propsSnap = await adminDb.collection("properties")
        .where("ownerId", "==", owner.id)
        .where("status", "==", "ACTIVE")
        .get();
      if (propsSnap.empty) continue;

      const properties = new Map<string, PropertyData>();
      propsSnap.docs.forEach(d => {
        const data = d.data();
        properties.set(d.id, {
          id: d.id,
          ownerId: data.ownerId,
          cleaningPrice: data.cleaningPrice || 0,
          status: data.status,
        });
      });
      const propertyIds = Array.from(properties.keys());

      // Carica TUTTE le pulizie e gli ordini di queste proprietà
      // (un solo round-trip per proprietario; meglio di N query per mese)
      // Firestore "in" max 30 elementi → spezza in chunks
      const chunks: string[][] = [];
      for (let i = 0; i < propertyIds.length; i += 30) {
        chunks.push(propertyIds.slice(i, i + 30));
      }

      const allCleanings: CleaningData[] = [];
      const allOrders: OrderData[] = [];
      for (const chunk of chunks) {
        const [cSnap, oSnap] = await Promise.all([
          adminDb.collection("cleanings").where("propertyId", "in", chunk).get(),
          adminDb.collection("orders").where("propertyId", "in", chunk).get(),
        ]);
        cSnap.docs.forEach(d => {
          const data = d.data();
          allCleanings.push({
            id: d.id,
            propertyId: data.propertyId,
            status: data.status,
            scheduledDate: data.scheduledDate,
            price: data.price,
            priceOverride: data.priceOverride,
            holidayFee: data.holidayFee,
          });
        });
        oSnap.docs.forEach(d => {
          const data = d.data();
          allOrders.push({
            id: d.id,
            propertyId: data.propertyId,
            status: data.status,
            cleaningId: data.cleaningId,
            scheduledDate: data.scheduledDate,
            deliveredAt: data.deliveredAt,
            createdAt: data.createdAt,
            items: data.items,
            totalPriceOverride: data.totalPriceOverride,
            deliveryFee: data.deliveryFee,
            deliveryFeeEnabled: data.deliveryFeeEnabled,
            bedMaking: data.bedMaking,
            bedMakingFee: data.bedMakingFee,
            bedMakingCount: data.bedMakingCount,
          });
        });
      }

      // Override admin per questo proprietario
      const overridesSnap = await adminDb.collection("paymentOverrides")
        .where("proprietarioId", "==", owner.id)
        .get();
      const overridesByMonth = new Map<string, PaymentOverrideData>();
      overridesSnap.docs.forEach(d => {
        const data = d.data();
        if (typeof data.month === "number" && typeof data.year === "number") {
          overridesByMonth.set(`${data.year}-${data.month}`, {
            proprietarioId: data.proprietarioId,
            month: data.month,
            year: data.year,
            overrideTotal: data.overrideTotal || 0,
            reason: data.reason,
          });
        }
      });

      let ownerHasDiff = false;

      // Per ogni mese da controllare
      for (const { month, year } of monthsToCheck) {
        const override = overridesByMonth.get(`${year}-${month}`);

        const modal = computeModalTotal({
          properties, cleanings: allCleanings, orders: allOrders,
          override, month, year, inventoryById,
        });
        const pagina = computePaginaTotal({
          properties, cleanings: allCleanings, orders: allOrders,
          month, year, inventoryById,
        });

        // Se entrambi sono 0, salta (mese senza attività)
        if (modal.total === 0 && pagina.total === 0) continue;

        const diff = pagina.total - modal.total;
        if (Math.abs(diff) < minDiff) continue;

        // Calcolo impatti causa-per-causa
        const impacts = computeImpacts({
          properties, cleanings: allCleanings, orders: allOrders,
          month, year, inventoryById, override,
        });

        // Calcolo il "pull-down" effettivo dell'override sulla modal:
        //   modal.total = override?.overrideTotal ?? modal.rawCalc
        //   senza override la modal mostrerebbe modal.rawCalc
        // → la differenza che il sistema "perde" per via dell'override è:
        //   modal.rawCalc - override.overrideTotal  (positivo se override sconta)
        let overrideImpactSigned = 0;
        if (override) {
          overrideImpactSigned = modal.rawCalc - override.overrideTotal;
        }

        const causes: string[] = [];
        if (Math.abs(impacts.bedMakingFeeImpact) > 0.01) {
          causes.push(`bedMakingFee=+${impacts.bedMakingFeeImpact.toFixed(2)}€ (pagina include, modal no)`);
        }
        if (Math.abs(impacts.fallbackCreatedAtImpact) > 0.01) {
          causes.push(`fallbackCreatedAt=-${impacts.fallbackCreatedAtImpact.toFixed(2)}€ (modal include ordini senza data, pagina no)`);
        }
        if (override) {
          causes.push(`override applicato dalla modal: rawCalc=${modal.rawCalc.toFixed(2)}€ → ${override.overrideTotal.toFixed(2)}€ (differenza ${overrideImpactSigned.toFixed(2)}€${override.reason ? `, motivo: ${override.reason}` : ""})`);
        }

        allDiffs.push({
          ownerId: owner.id,
          ownerEmail: owner.email,
          ownerName: owner.name,
          month, year,
          monthLabel: `${String(month).padStart(2, "0")}/${year}`,
          totaleModal: Math.round(modal.total * 100) / 100,
          totalePagina: Math.round(pagina.total * 100) / 100,
          diff: Math.round(diff * 100) / 100,
          bedMakingFeeImpact: Math.round(impacts.bedMakingFeeImpact * 100) / 100,
          overrideImpact: Math.round(overrideImpactSigned * 100) / 100,
          fallbackCreatedAtImpact: Math.round(impacts.fallbackCreatedAtImpact * 100) / 100,
          cause: causes.length > 0 ? causes.join(" | ") : "(differenza non spiegata dalle 3 cause note — investigare)",
          ordersInMonth: pagina.ordersCount,
          cleaningsInMonth: pagina.cleaningsCount,
        });
        ownerHasDiff = true;
      }

      if (ownerHasDiff) ownersWithDiff++;
    }

    // Ordina per diff assoluta decrescente
    allDiffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    // Statistiche aggregate
    const totalAbsDiff = allDiffs.reduce((s, d) => s + Math.abs(d.diff), 0);
    const totalBedMaking = allDiffs.reduce((s, d) => s + d.bedMakingFeeImpact, 0);
    const totalOverride = allDiffs.reduce((s, d) => s + d.overrideImpact, 0);
    const totalFallback = allDiffs.reduce((s, d) => s + d.fallbackCreatedAtImpact, 0);

    // Conteggi per causa
    const countOnlyBedMaking = allDiffs.filter(d =>
      Math.abs(d.bedMakingFeeImpact) > 0.01 &&
      Math.abs(d.overrideImpact) < 0.01 &&
      Math.abs(d.fallbackCreatedAtImpact) < 0.01
    ).length;
    const countOnlyOverride = allDiffs.filter(d =>
      Math.abs(d.overrideImpact) > 0.01 &&
      Math.abs(d.bedMakingFeeImpact) < 0.01 &&
      Math.abs(d.fallbackCreatedAtImpact) < 0.01
    ).length;
    const countOnlyFallback = allDiffs.filter(d =>
      Math.abs(d.fallbackCreatedAtImpact) > 0.01 &&
      Math.abs(d.overrideImpact) < 0.01 &&
      Math.abs(d.bedMakingFeeImpact) < 0.01
    ).length;
    const countMixed = allDiffs.length - countOnlyBedMaking - countOnlyOverride - countOnlyFallback;

    const elapsedMs = Date.now() - t0;

    return NextResponse.json({
      ok: true,
      summary: {
        ownersChecked,
        ownersWithDiff,
        totalDiffsFound: allDiffs.length,
        totalAbsDiffEur: Math.round(totalAbsDiff * 100) / 100,
        causeBreakdown: {
          onlyBedMakingFee: countOnlyBedMaking,
          onlyPaymentOverride: countOnlyOverride,
          onlyFallbackCreatedAt: countOnlyFallback,
          mixedCauses: countMixed,
        },
        impactByCauseEur: {
          bedMakingFee: Math.round(totalBedMaking * 100) / 100,
          paymentOverride: Math.round(totalOverride * 100) / 100,
          fallbackCreatedAt: Math.round(totalFallback * 100) / 100,
        },
        elapsedMs,
        params: { filterEmail: filterEmail || null, minDiff },
      },
      diffs: allDiffs,
    });
  } catch (err: any) {
    console.error("[payments-diff-audit] errore:", err);
    return NextResponse.json({
      ok: false,
      error: err?.message || "Errore interno",
      stack: err?.stack,
    }, { status: 500 });
  }
}
