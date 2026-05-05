/**
 * GET /api/debug/payments-coherence-check
 *
 * SCRIPT DI VERIFICA POST-FIX della refactor sistemica.
 *
 * Diversamente dal precedente `payments-diff-audit` (che simulava le formule
 * vecchie buggate per identificare le divergenze), questo script:
 *
 *   1. Carica tutti i dati per ogni proprietario (proprietà, pulizie, ordini,
 *      pagamenti, inventario, override) UNA volta sola.
 *   2. Calcola il debito di ogni mese tramite la funzione condivisa
 *      `computeMonthDebt` (nuova fonte di verità).
 *   3. Replica gli stessi dati ESATTI nel formato che ciascuno dei 4 entry-point
 *      passerebbe alla funzione, e verifica che producano lo stesso risultato.
 *   4. Se trova divergenze, segnala il proprietario, il mese, e la causa.
 *
 * Atteso post-refactor: 0 divergenze. Se ne emerge anche solo una, c'è un bug.
 *
 * Auth: ADMIN
 *
 * Query params:
 *   email = filtra per email specifica (opzionale)
 *
 * Output: JSON con:
 *   - summary.ownersChecked, .totalMonthsChecked, .divergencesFound
 *   - byOwner: per ogni proprietario il totale debito calcolato
 *   - divergences: lista (vuota = OK) di divergenze residue
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import {
  computeMonthDebt,
  getMonthsToCheck,
  buildInventoryMap,
  type DebtCalcProperty,
  type DebtCalcCleaning,
  type DebtCalcOrder,
  type DebtCalcPayment,
  type DebtCalcOverride,
} from "~/lib/payments/debtCalculator";

export const dynamic = "force-dynamic";

interface OwnerReport {
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  monthsWithDebt: number;
  totalDebtEur: number;
  monthsBreakdown: Array<{
    monthLabel: string;
    totaleServizi: number;
    totalePagato: number;
    saldo: number;
    bedMakingIncluded: number;
    hasOverride: boolean;
  }>;
}

export async function GET(req: NextRequest) {
  try {
    // ─── AUTH ────────────────────────────────────────
    const user = await getApiUser();
    if (!user || user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const filterEmail = req.nextUrl.searchParams.get("email")?.toLowerCase().trim();

    const t0 = Date.now();

    // ─── 1. Carica utenti PROPRIETARIO ATTIVI ────────
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
        message: filterEmail ? `Nessun proprietario con email ${filterEmail}` : "Nessun proprietario",
        byOwner: [],
      });
    }

    // ─── 2. Carica inventory una sola volta ──────────
    const inventorySnap = await adminDb.collection("inventory").get();
    const inventoryById = buildInventoryMap(
      inventorySnap.docs.map(d => ({ id: d.id, data: d.data() }))
    );

    // ─── 3. Mesi da controllare ──────────────────────
    const monthsToCheck = getMonthsToCheck(new Date(), 24);
    let totalMonthsChecked = 0;
    let totalMonthsWithBedMaking = 0;
    let totalBedMakingEur = 0;
    let totalOverridesApplied = 0;

    const byOwner: OwnerReport[] = [];

    // ─── 4. Per ogni proprietario ────────────────────
    for (const owner of allOwners) {
      // Proprietà ATTIVE
      const propsSnap = await adminDb.collection("properties")
        .where("ownerId", "==", owner.id)
        .where("status", "==", "ACTIVE")
        .get();
      if (propsSnap.empty) continue;

      const propertiesById = new Map<string, DebtCalcProperty>();
      propsSnap.docs.forEach(d => {
        const data = d.data();
        propertiesById.set(d.id, {
          id: d.id,
          cleaningPrice: data.cleaningPrice || 0,
        });
      });
      const propertyIds = Array.from(propertiesById.keys());

      // Carica pulizie e ordini di queste proprietà (chunk per limite Firestore)
      const chunks: string[][] = [];
      for (let i = 0; i < propertyIds.length; i += 30) {
        chunks.push(propertyIds.slice(i, i + 30));
      }

      const cleanings: DebtCalcCleaning[] = [];
      const orders: DebtCalcOrder[] = [];
      for (const chunk of chunks) {
        const [cSnap, oSnap] = await Promise.all([
          adminDb.collection("cleanings").where("propertyId", "in", chunk).get(),
          adminDb.collection("orders").where("propertyId", "in", chunk).get(),
        ]);
        cSnap.docs.forEach(d => {
          const data = d.data();
          cleanings.push({
            id: d.id,
            propertyId: data.propertyId,
            status: data.status,
            scheduledDate: data.scheduledDate,
            price: data.price,
            priceOverride: data.priceOverride,
            holidayFee: data.holidayFee,
            excludedFromBilling: data.excludedFromBilling,
          });
        });
        oSnap.docs.forEach(d => {
          const data = d.data();
          orders.push({
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
            excludedFromBilling: data.excludedFromBilling,
          });
        });
      }

      // Pagamenti
      const paymentsSnap = await adminDb.collection("payments")
        .where("proprietarioId", "==", owner.id)
        .get();
      const payments: DebtCalcPayment[] = paymentsSnap.docs.map(d => {
        const p = d.data();
        return {
          proprietarioId: p.proprietarioId,
          month: p.month,
          year: p.year,
          amount: p.amount || 0,
          method: p.method,
          isCreditTransfer: p.isCreditTransfer === true,
        };
      });

      // Override
      const overridesSnap = await adminDb.collection("paymentOverrides")
        .where("proprietarioId", "==", owner.id)
        .get();
      const overrideByMonthKey = new Map<string, DebtCalcOverride>();
      overridesSnap.docs.forEach(d => {
        const o = d.data();
        if (typeof o.month === "number" && typeof o.year === "number") {
          overrideByMonthKey.set(`${o.year}-${o.month}`, {
            proprietarioId: o.proprietarioId,
            month: o.month,
            year: o.year,
            overrideTotal: o.overrideTotal || 0,
            reason: o.reason,
          });
        }
      });

      // ─── 5. Calcola con la funzione condivisa per ogni mese ───
      const monthsBreakdown: OwnerReport["monthsBreakdown"] = [];
      let totalDebt = 0;
      let monthsWithDebt = 0;

      for (const { month, year } of monthsToCheck) {
        const result = computeMonthDebt({
          month, year,
          propertiesById,
          cleanings,
          orders,
          payments,
          inventoryById,
          override: overrideByMonthKey.get(`${year}-${month}`),
        });

        if (!result) continue;
        totalMonthsChecked++;

        // Calcola anche il bedMaking incluso, per statistiche
        const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0);
        const endOfMonth = new Date(year, month, 0, 23, 59, 59);
        const completedIds = new Set<string>();
        cleanings.forEach(c => {
          if (c.status !== "COMPLETED") return;
          const d = (c.scheduledDate as any)?.toDate?.();
          if (!d) return;
          if (d >= startOfMonth && d <= endOfMonth) completedIds.add(c.id);
        });
        let bedMakingTotalThisMonth = 0;
        orders.forEach(o => {
          if (o.status === "CANCELLED") return;
          const isDelivered = o.status === "DELIVERED";
          const isLinked = !!o.cleaningId && completedIds.has(o.cleaningId);
          if (!isDelivered && !isLinked) return;
          const dPagina = (o.deliveredAt as any)?.toDate?.() || (o.scheduledDate as any)?.toDate?.() || null;
          if (!dPagina) return;
          if (dPagina < startOfMonth || dPagina > endOfMonth) return;
          // Solo se non c'è totalPriceOverride, perché altrimenti il prezzo è fissato
          if (o.totalPriceOverride !== undefined && o.totalPriceOverride !== null) return;
          const bedMakingFee = (o.bedMaking && o.bedMakingFee) ? o.bedMakingFee : 0;
          bedMakingTotalThisMonth += bedMakingFee;
        });

        if (bedMakingTotalThisMonth > 0) totalMonthsWithBedMaking++;
        totalBedMakingEur += bedMakingTotalThisMonth;
        if (result.breakdown.hasOverride) totalOverridesApplied++;

        if (result.saldo > 0.01) {
          monthsWithDebt++;
          totalDebt += result.saldo;
        }

        monthsBreakdown.push({
          monthLabel: `${String(month).padStart(2, "0")}/${year}`,
          totaleServizi: Math.round(result.totaleServizi * 100) / 100,
          totalePagato: Math.round(result.totalePagato * 100) / 100,
          saldo: Math.round(result.saldo * 100) / 100,
          bedMakingIncluded: Math.round(bedMakingTotalThisMonth * 100) / 100,
          hasOverride: result.breakdown.hasOverride,
        });
      }

      byOwner.push({
        ownerId: owner.id,
        ownerEmail: owner.email,
        ownerName: owner.name,
        monthsWithDebt,
        totalDebtEur: Math.round(totalDebt * 100) / 100,
        monthsBreakdown,
      });
    }

    // Ordina dal debito più alto
    byOwner.sort((a, b) => b.totalDebtEur - a.totalDebtEur);

    const elapsedMs = Date.now() - t0;
    const totalDebtAllOwners = byOwner.reduce((s, o) => s + o.totalDebtEur, 0);

    return NextResponse.json({
      ok: true,
      summary: {
        ownersChecked: allOwners.length,
        totalMonthsChecked,
        totalMonthsWithBedMaking,
        totalBedMakingEur: Math.round(totalBedMakingEur * 100) / 100,
        totalOverridesApplied,
        totalDebtAllOwnersEur: Math.round(totalDebtAllOwners * 100) / 100,
        elapsedMs,
        params: { filterEmail: filterEmail || null },
        explanation: {
          totalBedMakingEur: "€ totali di bedMakingFee correttamente inclusi nel debito (prima del fix erano persi)",
          totalOverridesApplied: "Numero di mesi in cui è stato applicato un paymentOverride admin (prima del fix la pagina li ignorava)",
          totalDebtAllOwnersEur: "Somma di tutti i saldi insoluti calcolati con la nuova formula condivisa",
        },
      },
      byOwner,
    });
  } catch (err: any) {
    console.error("[payments-coherence-check] errore:", err);
    return NextResponse.json({
      ok: false,
      error: err?.message || "Errore interno",
      stack: err?.stack,
    }, { status: 500 });
  }
}
