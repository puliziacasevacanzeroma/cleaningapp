import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * GET /api/cron/check-payment-blocks
 * 
 * Chiamato da cron-job.org una volta al giorno (es. alle 08:00).
 * Controlla tutti i proprietari e:
 * 1. Attiva paymentBlock se hanno debiti SCADUTI (dopo il 10 del mese)
 * 2. Rimuove paymentBlock se non hanno più debiti SCADUTI
 * 
 * NON tocca gli account con override admin attivo.
 */
export async function GET(request: NextRequest) {
  // Verifica cron secret (via query string, come gli altri cron)
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

    // Costante scadenza: 10 del mese successivo
    const SCADENZA_GIORNO = 10;

    // Carica tutti i proprietari attivi
    const usersSnap = await adminDb.collection("users")
      .where("role", "in", ["PROPRIETARIO", "CLIENTE", "OWNER"])
      .where("status", "==", "ACTIVE")
      .get();

    if (usersSnap.empty) {
      return NextResponse.json({ success: true, message: "Nessun proprietario attivo", checked: 0 });
    }

    // Carica tutte le proprietà attive
    const propsSnap = await adminDb.collection("properties")
      .where("status", "==", "ACTIVE")
      .get();
    
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

    // Carica pagamenti
    const paymentsSnap = await adminDb.collection("payments").get();
    const paymentsByOwner = new Map<string, { month: number; year: number; amount: number }[]>();
    paymentsSnap.docs.forEach(doc => {
      const data = doc.data();
      const ownerId = data.proprietarioId;
      if (!ownerId) return;
      if (!paymentsByOwner.has(ownerId)) paymentsByOwner.set(ownerId, []);
      paymentsByOwner.get(ownerId)!.push({
        month: data.month,
        year: data.year,
        amount: data.amount || 0,
      });
    });

    // Carica pulizie completate (ultimi 24 mesi)
    const rangeStart = new Date(currentYear - 2, currentMonth - 1, 1);
    const cleaningsSnap = await adminDb.collection("cleanings")
      .where("status", "==", "COMPLETED")
      .where("scheduledDate", ">=", Timestamp.fromDate(rangeStart))
      .get();
    
    const cleaningsByProp = new Map<string, { month: number; year: number; price: number }[]>();
    cleaningsSnap.docs.forEach(doc => {
      const data = doc.data();
      const propId = data.propertyId;
      const date = data.scheduledDate?.toDate?.();
      if (!propId || !date) return;
      if (!cleaningsByProp.has(propId)) cleaningsByProp.set(propId, []);
      cleaningsByProp.get(propId)!.push({
        month: date.getMonth() + 1,
        year: date.getFullYear(),
        price: (data.priceOverride ?? data.price ?? propCleaningPrice.get(propId) ?? 0) + (data.holidayFee ?? 0),
      });
    });

    // Carica ordini
    const ordersSnap = await adminDb.collection("orders")
      .where("scheduledDate", ">=", Timestamp.fromDate(rangeStart))
      .get();
    
    const ordersByProp = new Map<string, { month: number; year: number; total: number }[]>();
    // Set di cleaningId completati per verificare ordini collegati
    const completedCleaningIds = new Set<string>();
    cleaningsSnap.docs.forEach(doc => completedCleaningIds.add(doc.id));
    
    ordersSnap.docs.forEach(doc => {
      const data = doc.data();
      if (data.status === "CANCELLED") return;
      // Stessa logica di useOwnerDebts: solo DELIVERED o collegati a pulizia COMPLETED
      const isDelivered = data.status === "DELIVERED";
      const isLinkedToCompleted = data.cleaningId && completedCleaningIds.has(data.cleaningId);
      if (!isDelivered && !isLinkedToCompleted) return;
      const propId = data.propertyId;
      const date = data.deliveredAt?.toDate?.() || data.scheduledDate?.toDate?.();
      if (!propId || !date) return;
      
      let total = 0;
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item: any) => {
          const unitPrice = item.priceOverride ?? item.unitPrice ?? item.price ?? 0;
          total += (item.totalPrice || (unitPrice * (item.quantity || 1)));
        });
      }
      if (data.deliveryFee && data.deliveryFeeEnabled !== false) total += data.deliveryFee;
      total = data.totalPriceOverride ?? total;
      
      if (!ordersByProp.has(propId)) ordersByProp.set(propId, []);
      ordersByProp.get(propId)!.push({
        month: date.getMonth() + 1,
        year: date.getFullYear(),
        total,
      });
    });

    // Carica overrides
    const overridesSnap = await adminDb.collection("paymentOverrides").get();
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

    for (const userDoc of usersSnap.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      const existingBlock = userData.paymentBlock;

      // Se l'admin ha fatto override, non toccare
      if (existingBlock?.overriddenByAdmin === true) {
        skipped++;
        continue;
      }

      const propIds = propsByOwner.get(userId) || [];
      if (propIds.length === 0) {
        // Nessuna proprietà → nessun debito possibile → rimuovi blocco se presente
        if (existingBlock?.active === true) {
          await adminDb.collection("users").doc(userId).update({ paymentBlock: null });
          unblocked++;
        }
        continue;
      }

      // Controlla mesi con debiti scaduti (ESCLUSO mese corrente)
      let hasOverdueDebt = false;

      for (let i = 1; i <= 24; i++) {
        let checkMonth = currentMonth - i;
        let checkYear = currentYear;
        while (checkMonth <= 0) { checkMonth += 12; checkYear--; }

        // La scadenza è il 10 del mese successivo
        let scadMonth = checkMonth + 1;
        let scadYear = checkYear;
        if (scadMonth > 12) { scadMonth = 1; scadYear++; }
        const scadenza = new Date(scadYear, scadMonth - 1, SCADENZA_GIORNO, 23, 59, 59);
        
        // Se non ancora scaduto, skip
        if (now <= scadenza) continue;

        // Calcola totale servizi del mese
        let totaleServizi = 0;
        propIds.forEach(propId => {
          (cleaningsByProp.get(propId) || []).forEach(c => {
            if (c.month === checkMonth && c.year === checkYear) totaleServizi += c.price;
          });
          (ordersByProp.get(propId) || []).forEach(o => {
            if (o.month === checkMonth && o.year === checkYear) totaleServizi += o.total;
          });
        });

        if (totaleServizi === 0) continue;

        // Applica override se presente
        const overrideKey = `${checkMonth}-${checkYear}`;
        const ownerOverrides = overridesByOwner.get(userId);
        if (ownerOverrides?.has(overrideKey)) {
          totaleServizi = ownerOverrides.get(overrideKey)!;
        }

        // Calcola pagamenti per questo mese
        const ownerPayments = paymentsByOwner.get(userId) || [];
        const totalePagato = ownerPayments
          .filter(p => p.month === checkMonth && p.year === checkYear)
          .reduce((sum, p) => sum + p.amount, 0);

        const saldo = totaleServizi - totalePagato;

        if (saldo > 0.01) {
          hasOverdueDebt = true;
          break; // Basta un solo mese scaduto per bloccare
        }
      }

      if (hasOverdueDebt && !existingBlock?.active) {
        // Attiva blocco
        await adminDb.collection("users").doc(userId).update({
          paymentBlock: {
            active: true,
            since: Timestamp.now(),
            reason: "Pagamento scaduto non effettuato",
            overriddenByAdmin: false,
            overriddenAt: null,
          },
        });

        // Notifica al proprietario
        const ownerName = userData.name || userData.email || "Proprietario";
        await adminDb.collection("notifications").add({
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
          updatedAt: Timestamp.now(),
        });

        // Notifica admin
        await adminDb.collection("notifications").add({
          title: "💳 Account limitato per morosità",
          message: `L'account di ${ownerName} è stato limitato automaticamente per pagamenti scaduti.`,
          type: "WARNING",
          recipientRole: "ADMIN",
          senderId: "system",
          senderName: "Sistema",
          status: "UNREAD",
          actionRequired: false,
          relatedEntityType: "PAYMENT",
          relatedEntityName: ownerName,
          link: "/dashboard/pagamenti",
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });

        blocked++;
      } else if (!hasOverdueDebt && existingBlock?.active) {
        // Rimuovi blocco — debiti saldati
        await adminDb.collection("users").doc(userId).update({ paymentBlock: null });

        await adminDb.collection("notifications").add({
          title: "✅ Account ripristinato",
          message: "I tuoi pagamenti risultano regolari. L'accesso completo è stato ripristinato. Grazie!",
          type: "PAYMENT_RECEIVED",
          recipientRole: "PROPRIETARIO",
          recipientId: userId,
          senderId: "system",
          senderName: "Sistema",
          status: "UNREAD",
          actionRequired: false,
          relatedEntityType: "PAYMENT",
          link: "/proprietario/pagamenti",
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });

        unblocked++;
      }
    }

    return NextResponse.json({
      success: true,
      checked: usersSnap.size,
      blocked,
      unblocked,
      skipped,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Errore cron check-payment-blocks:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
