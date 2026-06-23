import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { isCleaningProductItem } from "~/lib/payments/debtCalculator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/debug/sweep-overrides-v1?secret=CRON_SECRET[&apply=true]
 *
 * DRY-RUN di default (NESSUNA scrittura). Confronta ogni paymentOverride con il
 * totale CORRETTO del mese (calcolato con la logica della pagina: calculatedTotal
 * salvato sugli ordini + skip excludedFromBilling). Serve a trovare gli override
 * scritti dal "Lucchetto automatico" con un valore divergente dalla pagina
 * (causa dei blocchi fantasma tipo Ariele marzo 2710,38 vs 2589,32).
 *
 * Classificazione per ogni override:
 *   - OK            : |override - naturale| <= 0.01  → coerente, si tiene
 *   - MANUALE       : reason NON "Lucchetto automatico" → impostato a mano,
 *                     NON si tocca (decisione admin), solo segnalato
 *   - AUTO_SBAGLIATO: reason "Lucchetto automatico" e delta > 0.01 → da rimuovere
 *                     (il calcolo naturale ora è corretto e combacia col pagato)
 *
 * Con ?apply=true CANCELLA SOLO gli AUTO_SBAGLIATO. Tutto il resto invariato.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  const urlSecret = searchParams.get("secret");
  if (cronSecret && urlSecret !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const apply = searchParams.get("apply") === "true";

  try {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const rangeStart = new Date(currentYear - 2, currentMonth - 1, 1);

    const [usersSnap, propsSnap, paymentsSnap, inventorySnap, cleaningsSnap, ordersSnap, overridesSnap] =
      await Promise.all([
        adminDb.collection("users").where("role", "in", ["PROPRIETARIO", "CLIENTE", "OWNER"]).get(),
        adminDb.collection("properties").get(),
        adminDb.collection("payments").get(),
        adminDb.collection("inventory").get(),
        adminDb.collection("cleanings").where("status", "==", "COMPLETED").where("scheduledDate", ">=", Timestamp.fromDate(rangeStart)).get(),
        adminDb.collection("orders").where("scheduledDate", ">=", Timestamp.fromDate(rangeStart)).get(),
        adminDb.collection("paymentOverrides").get(),
      ]);

    const userName = new Map<string, string>();
    usersSnap.docs.forEach(d => {
      const u = d.data();
      userName.set(d.id, u.name || u.displayName || u.email || d.id);
    });

    const propsByOwner = new Map<string, string[]>();
    const propCleaningPrice = new Map<string, number>();
    propsSnap.docs.forEach(doc => {
      const data = doc.data();
      const ownerId = data.ownerId;
      if (!ownerId) return;
      if (!propsByOwner.has(ownerId)) propsByOwner.set(ownerId, []);
      propsByOwner.get(ownerId)!.push(doc.id);
      if (data.cleaningPrice) propCleaningPrice.set(doc.id, data.cleaningPrice);
    });

    const paymentsByOwner = new Map<string, { month: number; year: number; amount: number; isCreditTransfer?: boolean }[]>();
    paymentsSnap.docs.forEach(doc => {
      const data = doc.data();
      const ownerId = data.proprietarioId;
      if (!ownerId) return;
      if (!paymentsByOwner.has(ownerId)) paymentsByOwner.set(ownerId, []);
      paymentsByOwner.get(ownerId)!.push({ month: data.month, year: data.year, amount: data.amount || 0, isCreditTransfer: data.isCreditTransfer === true });
    });

    const inventoryById = new Map<string, number>();
    inventorySnap.docs.forEach(doc => {
      const data = doc.data() as any;
      const sellPrice = data.sellPrice ?? data.price ?? 0;
      inventoryById.set(doc.id, sellPrice);
      if (data.key) inventoryById.set(data.key, sellPrice);
      if (doc.id.startsWith("item_")) inventoryById.set(doc.id.replace("item_", ""), sellPrice);
    });

    // Pulizie (logica pagina: skip excludedFromBilling)
    const cleaningsByPropMonth = new Map<string, number>();
    const completedCleaningIds = new Set<string>();
    cleaningsSnap.docs.forEach(doc => {
      const data = doc.data();
      if (data.excludedFromBilling === true) return;
      completedCleaningIds.add(doc.id);
      const propId = data.propertyId;
      const date = data.scheduledDate?.toDate?.();
      if (!propId || !date) return;
      const key = `${propId}|${date.getFullYear()}-${date.getMonth() + 1}`;
      const price = (data.priceOverride ?? data.price ?? propCleaningPrice.get(propId) ?? 0) + (data.holidayFee ?? 0);
      cleaningsByPropMonth.set(key, (cleaningsByPropMonth.get(key) || 0) + price);
    });

    // Ordini (logica pagina: calculatedTotal salvato + skip excludedFromBilling)
    const ordersByPropMonth = new Map<string, number>();
    ordersSnap.docs.forEach(doc => {
      const data = doc.data();
      if (data.status === "CANCELLED") return;
      if (data.excludedFromBilling === true) return;
      const isDelivered = data.status === "DELIVERED";
      const isLinkedToCompleted = data.cleaningId && completedCleaningIds.has(data.cleaningId);
      if (!isDelivered && !isLinkedToCompleted) return;
      const propId = data.propertyId;
      const date = data.deliveredAt?.toDate?.() || data.scheduledDate?.toDate?.();
      if (!propId || !date) return;

      let total = 0;
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item: any) => {
          if (isCleaningProductItem(item)) return;
          const itemKey = item.itemId || item.id;
          const invSellPrice = itemKey ? inventoryById.get(itemKey) : undefined;
          const unitPrice = item.priceOverride ?? (item.unitPrice || undefined) ?? (item.price || undefined) ?? invSellPrice ?? 0;
          total += (item.totalPrice || undefined) ?? (unitPrice * (item.quantity || 1));
        });
      }
      if (data.deliveryFee && data.deliveryFeeEnabled !== false) total += data.deliveryFee;
      if (data.bedMaking && data.bedMakingFee) total += data.bedMakingFee;
      const storedTotal = typeof data.calculatedTotal === "number" ? data.calculatedTotal : undefined;
      total = data.totalPriceOverride ?? storedTotal ?? total;

      const key = `${propId}|${date.getFullYear()}-${date.getMonth() + 1}`;
      ordersByPropMonth.set(key, (ordersByPropMonth.get(key) || 0) + total);
    });

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const naturalMonthTotal = (ownerId: string, m: number, y: number): number => {
      let t = 0;
      for (const propId of propsByOwner.get(ownerId) || []) {
        const k = `${propId}|${y}-${m}`;
        t += cleaningsByPropMonth.get(k) || 0;
        t += ordersByPropMonth.get(k) || 0;
      }
      return round2(t);
    };
    const paidMonth = (ownerId: string, m: number, y: number): number =>
      round2((paymentsByOwner.get(ownerId) || [])
        .filter(p => p.month === m && p.year === y && p.isCreditTransfer !== true)
        .reduce((s, p) => s + p.amount, 0));

    const rows: any[] = [];
    const toDelete: string[] = [];

    overridesSnap.docs.forEach(doc => {
      const o = doc.data();
      const ownerId = o.proprietarioId;
      const m = o.month, y = o.year;
      if (!ownerId || typeof m !== "number" || typeof y !== "number") return;
      const overrideTotal = round2(o.overrideTotal ?? 0);
      const naturale = naturalMonthTotal(ownerId, m, y);
      const pagato = paidMonth(ownerId, m, y);
      const delta = round2(overrideTotal - naturale);
      const reason = String(o.reason || "");
      const isAuto = reason.startsWith("Lucchetto automatico");

      let classe: string;
      if (Math.abs(delta) <= 0.01) classe = "OK";
      else if (!isAuto) classe = "MANUALE_nonTocco";
      else classe = "AUTO_SBAGLIATO";

      if (classe === "AUTO_SBAGLIATO") toDelete.push(doc.id);

      rows.push({
        overrideId: doc.id,
        cliente: userName.get(ownerId) || ownerId,
        proprietarioId: ownerId,
        mese: `${m}/${y}`,
        overrideTotal,
        totaleNaturale_pagina: naturale,
        pagato,
        delta_override_vs_naturale: delta,
        saldoConOverride: round2(overrideTotal - pagato),
        saldoSenzaOverride: round2(naturale - pagato),
        reason,
        classe,
        azione: classe === "AUTO_SBAGLIATO" ? (apply ? "CANCELLATO" : "DA CANCELLARE (dry-run)") : "nessuna",
      });
    });

    rows.sort((a, b) => Math.abs(b.delta_override_vs_naturale) - Math.abs(a.delta_override_vs_naturale));

    let deleted = 0;
    if (apply && toDelete.length > 0) {
      const BATCH = 400;
      for (let i = 0; i < toDelete.length; i += BATCH) {
        const chunk = toDelete.slice(i, i + BATCH);
        const batch = adminDb.batch();
        for (const id of chunk) batch.delete(adminDb.collection("paymentOverrides").doc(id));
        await batch.commit();
        deleted += chunk.length;
      }
    }

    return NextResponse.json({
      success: true,
      mode: apply ? "APPLY (scritture eseguite)" : "DRY-RUN (nessuna scrittura)",
      now: now.toISOString(),
      overridesTotali: overridesSnap.size,
      conteggi: {
        OK: rows.filter(r => r.classe === "OK").length,
        MANUALE: rows.filter(r => r.classe === "MANUALE_nonTocco").length,
        AUTO_SBAGLIATO: rows.filter(r => r.classe === "AUTO_SBAGLIATO").length,
      },
      cancellati: apply ? deleted : 0,
      daCancellareSeApply: toDelete.length,
      nota: "AUTO_SBAGLIATO = lucchetto automatico congelato su valore diverso dal calcolo pagina. saldoSenzaOverride = saldo reale dopo la cancellazione.",
      righe: rows,
    }, { status: 200 });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Errore server", details: errMsg }, { status: 500 });
  }
}
