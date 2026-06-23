import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { isCleaningProductItem } from "~/lib/payments/debtCalculator";

export const dynamic = 'force-dynamic';
// 🚀 IMPORTANTE: cron-job.org free tier ha timeout MASSIMO 30 secondi.
//    Quindi Railway può anche permettere 60s ma cron-job.org tronca prima.
//    Il codice DEVE finire in <30s. Optimizzazioni applicate:
//    - Promise.all per parallelizzare le 6 query iniziali Firestore
//    - Pre-aggregazione mappa (propId, y-m) → totali
//    - Calcolo saldi una volta sola per ogni mese
//    - writeBatch finale (1 round-trip per 500 ops)
//    Tempo atteso: ~5-10s
export const maxDuration = 60; // cuscinetto Railway, ma cron-job.org tronca a 30s

/**
 * GET /api/cron/check-payment-blocks
 *
 * Chiamato da cron-job.org una volta al giorno (alle 08:00).
 * Controlla tutti i proprietari e:
 * 1. Attiva paymentBlock se hanno debiti SCADUTI (dopo il 10 del mese)
 * 2. Rimuove paymentBlock se non hanno più debiti SCADUTI
 *
 * NON tocca gli account con override admin attivo.
 *
 * 🚀 PERF v2 (14/05/2026):
 *   - maxDuration 30s → 60s
 *   - Pre-aggrego cleanings/orders per (propId, year-month) all'inizio
 *     → calcSaldoMese diventa O(propIds) invece di O(cleanings+orders)
 *   - Calcolo saldi UNA SOLA volta per (owner, month) invece di 2×
 *   - Update finali in writeBatch (1 round-trip invece di N)
 *   - Risultato atteso: ~5-10s invece di 30+s
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  const urlSecret = searchParams.get("secret");
  if (cronSecret && urlSecret !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const SCADENZA_GIORNO = 10;

    // 🚀 PERF: parallelizzo le 6 query iniziali Firestore con Promise.all.
    //    Prima: 6 round-trip sequenziali (~5s totali con 25.000 docs).
    //    Ora: 6 round-trip in parallelo (~1-2s, limitato dalla query più lenta).
    const rangeStart = new Date(currentYear - 2, currentMonth - 1, 1);
    const [
      usersSnap,
      propsSnap,
      paymentsSnap,
      inventorySnap,
      cleaningsSnap,
      ordersSnap,
      overridesSnap,
    ] = await Promise.all([
      adminDb.collection("users")
        .where("role", "in", ["PROPRIETARIO", "CLIENTE", "OWNER"])
        .where("status", "==", "ACTIVE")
        .get(),
      adminDb.collection("properties")
        .where("status", "==", "ACTIVE")
        .get(),
      adminDb.collection("payments").get(),
      adminDb.collection("inventory").get(),
      adminDb.collection("cleanings")
        .where("status", "==", "COMPLETED")
        .where("scheduledDate", ">=", Timestamp.fromDate(rangeStart))
        .get(),
      adminDb.collection("orders")
        .where("scheduledDate", ">=", Timestamp.fromDate(rangeStart))
        .get(),
      adminDb.collection("paymentOverrides").get(),
    ]);

    if (usersSnap.empty) {
      return NextResponse.json({ success: true, message: "Nessun proprietario attivo", checked: 0 });
    }

    // Properties → mappa per owner
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

    // Pagamenti → mappa per owner
    const paymentsByOwner = new Map<string, { month: number; year: number; amount: number; isCreditTransfer?: boolean }[]>();
    paymentsSnap.docs.forEach(doc => {
      const data = doc.data();
      const ownerId = data.proprietarioId;
      if (!ownerId) return;
      if (!paymentsByOwner.has(ownerId)) paymentsByOwner.set(ownerId, []);
      paymentsByOwner.get(ownerId)!.push({
        month: data.month,
        year: data.year,
        amount: data.amount || 0,
        isCreditTransfer: data.isCreditTransfer === true,
      });
    });

    // Inventario per fallback prezzi
    const inventoryById = new Map<string, number>();
    inventorySnap.docs.forEach(doc => {
      const data = doc.data() as any;
      const sellPrice = data.sellPrice ?? data.price ?? 0;
      inventoryById.set(doc.id, sellPrice);
      if (data.key) inventoryById.set(data.key, sellPrice);
      if (doc.id.startsWith("item_")) inventoryById.set(doc.id.replace("item_", ""), sellPrice);
    });

    // 🚀 PERF: pre-aggregazione cleanings per (propId, y-m)
    const cleaningsByPropMonth = new Map<string, number>();
    const completedCleaningIds = new Set<string>();
    cleaningsSnap.docs.forEach(doc => {
      const data = doc.data();
      // 🔧 ALLINEAMENTO PAGINA: una pulizia esclusa dalla fatturazione
      // (excludedFromBilling) NON va conteggiata né considerata "completata"
      // ai fini del collegamento ordini — esattamente come computeMonthDebt.
      // Senza questo il cron sommava servizi che la pagina non fattura →
      // falso residuo → blocco ingiusto.
      if (data.excludedFromBilling === true) return;
      completedCleaningIds.add(doc.id);
      const propId = data.propertyId;
      const date = data.scheduledDate?.toDate?.();
      if (!propId || !date) return;
      const m = date.getMonth() + 1;
      const y = date.getFullYear();
      const key = `${propId}|${y}-${m}`;
      const price = (data.priceOverride ?? data.price ?? propCleaningPrice.get(propId) ?? 0) + (data.holidayFee ?? 0);
      cleaningsByPropMonth.set(key, (cleaningsByPropMonth.get(key) || 0) + price);
    });

    // 🚀 PERF: pre-aggregazione orders per (propId, y-m)
    const ordersByPropMonth = new Map<string, number>();
    ordersSnap.docs.forEach(doc => {
      const data = doc.data();
      if (data.status === "CANCELLED") return;
      // 🔧 ALLINEAMENTO PAGINA: un ordine escluso dalla fatturazione non conta
      // (computeMonthDebt lo salta). Senza questo veniva sommato → falso debito.
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
          // 🔧 ALLINEAMENTO PAGINA: escludi i prodotti-pulizia operatore dal
          // totale addebitato al proprietario, ESATTAMENTE come fa la pagina
          // (calculateOrderRawPrice salta isCleaningProductItem). Senza questo,
          // il cron calcolava un totale più alto della pagina → falso debito
          // residuo → blocco ingiusto di clienti che avevano saldato.
          if (isCleaningProductItem(item)) return;
          const itemKey = item.itemId || item.id;
          const invSellPrice = itemKey ? inventoryById.get(itemKey) : undefined;
          // Stessa cascata della pagina: un 0 salvato sull'item è dato sporco,
          // si ricade sul listino (|| undefined tratta lo 0 come mancante).
          const unitPrice =
            item.priceOverride ??
            (item.unitPrice || undefined) ??
            (item.price || undefined) ??
            invSellPrice ??
            0;
          total += ((item.totalPrice || undefined) ?? (unitPrice * (item.quantity || 1)));
        });
      }
      if (data.deliveryFee && data.deliveryFeeEnabled !== false) total += data.deliveryFee;
      if (data.bedMaking && data.bedMakingFee) total += data.bedMakingFee;
      // 🔧 CAUSA RADICE DEI BLOCCHI FANTASMA:
      // La pagina admin (useRealtimePayments) e la fonte di verità
      // (computeMonthDebt) usano il TOTALE CONGELATO dell'ordine
      // (`calculatedTotal` = quanto è stato fatturato), NON il ricalcolo dagli
      // items coi prezzi vivi dell'inventario. Qui il cron ricalcolava dagli
      // items → numero diverso dalla pagina → falso residuo → blocco di clienti
      // che avevano saldato. Precedenza IDENTICA alla pagina:
      //   override manuale → calculatedTotal → ricalcolo items (solo fallback
      //   per ordini legacy privi del campo).
      const storedTotal = typeof data.calculatedTotal === "number" ? data.calculatedTotal : undefined;
      total = data.totalPriceOverride ?? storedTotal ?? total;

      const m = date.getMonth() + 1;
      const y = date.getFullYear();
      const key = `${propId}|${y}-${m}`;
      ordersByPropMonth.set(key, (ordersByPropMonth.get(key) || 0) + total);
    });

    // Overrides
    const overridesByOwner = new Map<string, Map<string, number>>();
    overridesSnap.docs.forEach(doc => {
      const data = doc.data();
      const ownerId = data.proprietarioId;
      if (!ownerId) return;
      if (!overridesByOwner.has(ownerId)) overridesByOwner.set(ownerId, new Map());
      overridesByOwner.get(ownerId)!.set(`${data.month}-${data.year}`, data.overrideTotal);
    });

    let blocked = 0;
    let unblocked = 0;
    let skipped = 0;

    // 🚀 PERF: raccolgo updates in coda, applico in batch alla fine
    const pendingUpdates: { userId: string; data: any }[] = [];
    const pendingNotifications: any[] = [];

    for (const userDoc of usersSnap.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      const existingBlock = userData.paymentBlock;

      // 🟢 ESENZIONE PERMANENTE: clienti con termini di pagamento diversi
      // (paymentExempt: true) non vengono MAI bloccati dal cron, qualunque
      // sia il loro ritardo. Se per qualche motivo risultano bloccati, li
      // sblocchiamo. È il sostituto stabile dello sblocco manuale ripetuto.
      if (userData.paymentExempt === true) {
        if (existingBlock?.active === true) {
          pendingUpdates.push({ userId, data: { paymentBlock: null } });
          unblocked++;
        } else {
          skipped++;
        }
        continue;
      }

      if (existingBlock?.overriddenByAdmin === true) {
        skipped++;
        continue;
      }

      const propIds = propsByOwner.get(userId) || [];
      if (propIds.length === 0) {
        if (existingBlock?.active === true) {
          pendingUpdates.push({ userId, data: { paymentBlock: null } });
          unblocked++;
        }
        continue;
      }

      const ownerPayments = paymentsByOwner.get(userId) || [];
      const ownerOv = overridesByOwner.get(userId);

      // 🚀 PERF: calcSaldoMese O(propIds) grazie alle mappe pre-aggregate
      const calcSaldoMese = (m: number, y: number): number | null => {
        let totSer = 0;
        for (const propId of propIds) {
          const monthKey = `${propId}|${y}-${m}`;
          totSer += (cleaningsByPropMonth.get(monthKey) || 0);
          totSer += (ordersByPropMonth.get(monthKey) || 0);
        }
        if (totSer === 0) return null;
        const ovKey = `${m}-${y}`;
        if (ownerOv?.has(ovKey)) totSer = ownerOv.get(ovKey)!;
        const totPag = ownerPayments
          .filter(p => p.month === m && p.year === y && p.isCreditTransfer !== true)
          .reduce((sum, p) => sum + p.amount, 0);
        return totSer - totPag;
      };

      // 🚀 PERF: calcolo saldi UNA SOLA volta per ogni mese, memorizzo
      type MonthlySaldo = { m: number; y: number; saldo: number | null };
      const monthlySaldi: MonthlySaldo[] = [];
      for (let i = 24; i >= 0; i--) {
        let m = currentMonth - i;
        let y = currentYear;
        while (m <= 0) { m += 12; y--; }
        monthlySaldi.push({ m, y, saldo: calcSaldoMese(m, y) });
      }

      // Carryover running credit
      const creditBeforeMonth = new Map<string, number>();
      let running = 0;
      for (let idx = 0; idx < monthlySaldi.length - 1; idx++) {
        const ms = monthlySaldi[idx]!;
        creditBeforeMonth.set(`${ms.y}-${ms.m}`, running);
        if (ms.saldo === null) continue;
        if (ms.saldo < 0) {
          running += -ms.saldo;
        } else if (ms.saldo > 0 && running > 0) {
          running -= Math.min(ms.saldo, running);
        }
      }

      // Cerca debito scaduto
      let hasOverdueDebt = false;
      for (let i = 1; i <= 24; i++) {
        const idx = monthlySaldi.length - 1 - i;
        if (idx < 0) break;
        const ms = monthlySaldi[idx]!;

        let scadMonth = ms.m + 1;
        let scadYear = ms.y;
        if (scadMonth > 12) { scadMonth = 1; scadYear++; }
        // 🔧 FIX scadenza: il blocco deve essere ATTIVO il giorno 10 (coerente con
        // le email di sollecito: "sospensione il 10"). Quindi l'ultimo giorno utile
        // per pagare è il 9 (fino alle 23:59:59): dal 10 alle 08:00 il cron blocca.
        // Prima: scadenza = il 10 alle 23:59:59 → il blocco scattava solo l'11.
        const scadenza = new Date(scadYear, scadMonth - 1, SCADENZA_GIORNO - 1, 23, 59, 59);

        if (now <= scadenza) continue;
        if (ms.saldo === null) continue;
        if (ms.saldo <= 0.01) continue;

        const creditoDisp = creditBeforeMonth.get(`${ms.y}-${ms.m}`) || 0;
        const saldoNetto = ms.saldo - creditoDisp;

        if (saldoNetto > 0.01) {
          hasOverdueDebt = true;
          break;
        }
      }

      if (hasOverdueDebt && !existingBlock?.active) {
        pendingUpdates.push({
          userId,
          data: {
            paymentBlock: {
              active: true,
              since: Timestamp.now(),
              reason: "Pagamento scaduto non effettuato",
              overriddenByAdmin: false,
              overriddenAt: null,
            },
          },
        });
        pendingNotifications.push({
          title: "⚠️ Account limitato",
          message: "Il tuo account è stato temporaneamente limitato per pagamenti scaduti. Regolarizza la tua posizione per ripristinare l'accesso completo.",
          type: "PAYMENT_OVERDUE",
          recipientRole: "PROPRIETARIO",
          recipientId: userId,
          senderId: "system",
          senderName: "Sistema",
          status: "UNREAD",
          actionRequired: true,
          relatedEntityType: "PAYMENT",
          link: "/proprietario/pagamenti",
          createdAt: Timestamp.now(),
        });
        blocked++;
      } else if (!hasOverdueDebt && existingBlock?.active === true) {
        pendingUpdates.push({ userId, data: { paymentBlock: null } });
        unblocked++;
      }
    }

    // 🚀 PERF: applica tutto in batch (500 ops/batch limite Firestore)
    const BATCH_SIZE = 500;
    for (let i = 0; i < pendingUpdates.length; i += BATCH_SIZE) {
      const chunk = pendingUpdates.slice(i, i + BATCH_SIZE);
      const batch = adminDb.batch();
      for (const upd of chunk) {
        batch.update(adminDb.collection("users").doc(upd.userId), upd.data);
      }
      await batch.commit();
    }

    for (let i = 0; i < pendingNotifications.length; i += BATCH_SIZE) {
      const chunk = pendingNotifications.slice(i, i + BATCH_SIZE);
      const batch = adminDb.batch();
      for (const notif of chunk) {
        batch.set(adminDb.collection("notifications").doc(), notif);
      }
      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      checked: usersSnap.size,
      blocked,
      unblocked,
      skipped,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("❌ check-payment-blocks error:", error);
    return NextResponse.json({ error: "Errore server", details: errMsg }, { status: 500 });
  }
}
