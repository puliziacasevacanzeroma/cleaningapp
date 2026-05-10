import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { computeOwnerDebt } from "~/lib/payments/computeOwnerDebt";

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET /api/cron/check-payment-blocks
 *
 * Chiamato da cron-job.org (es. il giorno 10 alle 06:00) e/o internamente
 * da send-payment-suspension prima dell'invio email.
 *
 * Per ogni proprietario:
 *  - Attiva paymentBlock se ha almeno un mese SCADUTO con saldo netto > 0
 *  - Rimuove paymentBlock se non ha più debiti scaduti
 *  - NON tocca chi ha override admin attivo
 *
 * 🎯 FONTE DI VERITÀ UNICA:
 *    Usa computeOwnerDebt() — la stessa funzione canonica usata da:
 *      • send-payment-suspension (email del giorno 10)
 *      • send-payment-warning (email del giorno 5)
 *      • useOwnerDebts (UI proprietario)
 *      • useOwnerBalance (modal warning login)
 *    Questo garantisce numeri identici tra UI, email e blocco.
 *    Gestisce automaticamente: excludedFromBilling, cleaning_product (esclusi),
 *    holidayFee, bedMakingFee, deliveryFee, totalPriceOverride, paymentOverrides,
 *    isCreditTransfer (no doppio conteggio carryover), filtri DELIVERED + COMPLETED.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  const urlSecret = searchParams.get("secret");
  const authHeader = request.headers.get("authorization");
  if (cronSecret && urlSecret !== cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    // Carica tutti i proprietari attivi (tutti i possibili nomi del ruolo)
    const usersSnap = await adminDb.collection("users")
      .where("role", "in", ["PROPRIETARIO", "CLIENTE", "OWNER"])
      .where("status", "==", "ACTIVE")
      .get();

    if (usersSnap.empty) {
      return NextResponse.json({
        success: true,
        message: "Nessun proprietario attivo",
        checked: 0,
        blocked: 0,
        unblocked: 0,
        skipped: 0,
        timestamp: new Date().toISOString(),
      });
    }

    let blocked = 0;
    let unblocked = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const userDoc of usersSnap.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      const existingBlock = userData.paymentBlock;

      // Skip se admin ha fatto override
      if (existingBlock?.overriddenByAdmin === true) {
        skipped++;
        continue;
      }

      try {
        // 🎯 Calcolo debito con la funzione canonica (stessa di UI ed email)
        const summary = await computeOwnerDebt(userId);

        if (!summary) {
          // Utente senza email o senza dati validi — saltalo
          if (existingBlock?.active === true) {
            await adminDb.collection("users").doc(userId).update({ paymentBlock: null });
            unblocked++;
          }
          continue;
        }

        // Nessuna proprietà → nessun debito possibile → rimuovi blocco se presente
        if (summary.propertiesCount === 0) {
          if (existingBlock?.active === true) {
            await adminDb.collection("users").doc(userId).update({ paymentBlock: null });
            unblocked++;
          }
          continue;
        }

        // ⚠️ Logica di blocco — un proprietario va bloccato se:
        //   1) Il debito netto (al netto del credito carryover) è > 1 cent E
        //   2) Almeno un mese ha status === "SCADUTO" (oltre il 10 del mese successivo)
        // Se ha solo debiti in WARNING/DA_PAGARE (es. mese precedente non ancora scaduto)
        // NON viene bloccato: li ricaverà come email warning ma mantiene l'accesso.
        const hasOverdueDebt = summary.totalDebtNet > 0.01
          && summary.debts.some(d => d.status === "SCADUTO");

        if (hasOverdueDebt && !existingBlock?.active) {
          // ─── ATTIVA BLOCCO ──────────────────────────────────────────
          await adminDb.collection("users").doc(userId).update({
            paymentBlock: {
              active: true,
              since: Timestamp.now(),
              reason: "Pagamento scaduto non effettuato",
              overriddenByAdmin: false,
              overriddenAt: null,
            },
          });

          const ownerName = userData.name || userData.email || "Proprietario";

          // Notifica al proprietario
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
        } else if (!hasOverdueDebt && existingBlock?.active === true) {
          // ─── RIMUOVI BLOCCO ─────────────────────────────────────────
          // Debiti tutti saldati o coperti dal carryover
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
        // else: stato già coerente (bloccato e con debito, oppure non bloccato e senza debito) → nulla da fare
      } catch (e: any) {
        // Non far crashare il cron per un singolo utente con dati corrotti
        const msg = `userId=${userId}: ${e?.message || e}`;
        console.error("[check-payment-blocks]", msg);
        errors.push(msg);
      }
    }

    return NextResponse.json({
      success: true,
      checked: usersSnap.size,
      blocked,
      unblocked,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("❌ Errore cron check-payment-blocks:", error);
    return NextResponse.json({
      error: "Errore server",
      details: error?.message,
    }, { status: 500 });
  }
}
