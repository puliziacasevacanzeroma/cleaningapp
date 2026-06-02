import { NextRequest, NextResponse } from "next/server";
import {
  createPayment,
  deletePayment,
  getClientPaymentStats,
  calculateSummaryFromStats,
  getPropertiesWithoutPrice,
  setPaymentOverride,
  deletePaymentOverride,
} from "~/lib/firebase/payments";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, PaymentActionSchema } from "~/lib/validation/schemas";

export const dynamic = 'force-dynamic';

async function notifyOwnerPaymentReceived(
  proprietarioId: string,
  amount: number,
  totalDue: number,
  totalPaid: number,
  month: number,
  year: number
) {
  try {
    const monthNames = [
      'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
      'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
    ];
    const monthName = monthNames[month - 1] || '';
    const remaining = totalDue - totalPaid;

    let message = `Abbiamo ricevuto il tuo pagamento di €${amount.toFixed(2)} per ${monthName} ${year}.`;
    if (remaining > 0) message += ` Saldo rimanente: €${remaining.toFixed(2)}`;
    else if (remaining === 0) message += ` Il tuo saldo è stato completamente saldato! ✓`;
    else message += ` Hai un credito di €${Math.abs(remaining).toFixed(2)}`;

    await adminDb.collection("notifications").add({
      title: "✅ Pagamento ricevuto",
      message,
      type: "PAYMENT_RECEIVED",
      recipientRole: "PROPRIETARIO",
      recipientId: proprietarioId,
      senderId: "system",
      senderName: "Sistema",
      status: "UNREAD",
      actionRequired: false,
      relatedEntityType: "PAYMENT",
      link: "/proprietario/pagamenti",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error("Errore invio notifica pagamento:", error);
  }
}

export async function GET(request: NextRequest) {
  const currentUser = await getApiUser();
  if (!currentUser) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  if (currentUser.role !== "ADMIN") return NextResponse.json({ error: "Solo gli amministratori" }, { status: 403 });

  try {
    const searchParams = request.nextUrl.searchParams;
    const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
    const summaryOnly = searchParams.get("summary") === "true";

    const [propertiesWithoutPrice, clientStats] = await Promise.all([
      getPropertiesWithoutPrice(),
      getClientPaymentStats(month, year),
    ]);

    const summary = calculateSummaryFromStats(clientStats);

    if (summaryOnly) {
      return NextResponse.json({ success: true, month, year, summary, propertiesWithoutPrice });
    }

    return NextResponse.json({ success: true, month, year, summary, clients: clientStats, propertiesWithoutPrice });
  } catch (error) {
    console.error("Errore GET payments:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const currentUser = await getApiUser();
  if (!currentUser) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  if (currentUser.role !== "ADMIN") return NextResponse.json({ error: "Solo gli amministratori" }, { status: 403 });

  try {
    const body = await validateBody(request, PaymentActionSchema);
    if (body instanceof Response) return body;
    const { action } = body;

    if (action === "create_payment" || !action) {
      const { proprietarioId, proprietarioName, month, year, amount, type, method, note, totalDue, totalPaid } = body;
      if (!proprietarioId || !month || !year || !amount || !type || !method) {
        return NextResponse.json({ error: "Dati mancanti" }, { status: 400 });
      }

      const paymentId = await createPayment({
        // @ts-expect-error TODO-FIX: TS2322 Type 'string | undefined' is not assignable to type 'string'.
        proprietarioId, proprietarioName, month, year,
        // @ts-expect-error TODO-FIX: TS2345 Argument of type 'string | number' is not assignable to parameter of type 'strin...
        amount: parseFloat(amount), type, method, note,
        createdBy: currentUser.id,
      });

      // @ts-expect-error TODO-FIX: TS2345 Argument of type 'string | number' is not assignable to parameter of type 'strin...
      const amountNum = parseFloat(amount);
      await notifyOwnerPaymentReceived(
        proprietarioId, amountNum,
        // @ts-expect-error TODO-FIX: TS2345 Argument of type 'string | number' is not assignable to parameter of type 'strin...
        parseFloat(totalDue || "0"),
        // @ts-expect-error TODO-FIX: TS2345 Argument of type 'string | number' is not assignable to parameter of type 'strin...
        parseFloat(totalPaid || "0") + amountNum,
        month, year
      );

      // ═══════════════════════════════════════════════════════════════════
      // 🔒 LUCCHETTO MORBIDO: congela il totale del mese quando viene saldato
      // ═══════════════════════════════════════════════════════════════════
      // PERCHÉ: dopo l'incasso, il sync iCal / ricalcolo biancheria possono
      // riportare ordini a PENDING o pulizie a SCHEDULED, facendo CALARE il
      // totale del mese. La differenza tra quanto incassato e il nuovo totale
      // più basso diventava un "acconto fantasma" il mese successivo.
      //
      // COSA FA: se questo pagamento porta il mese a saldo (pagato ≥ servizi),
      // scrive un paymentOverride = totale servizi ATTUALE. Da quel momento
      // computeMonthDebt usa quel totale fisso (override sostituisce solo
      // `totaleServizi`, riga 355 di debtCalculator) → saldo = 0 stabile,
      // qualunque cosa faccia il cron in seguito.
      //
      // REGOLA RISPETTATA: solo le AZIONI MANUALI aggiornano il totale.
      //   - "Incassa Totale" (qui) → fissa il lucchetto.
      //   - "Modifica totale" (set_override) → riscrive il lucchetto.
      //   - escludi/elimina servizio → creditTransfer al mese dopo (invariato).
      //   - cron/sync → NON tocca paymentOverrides (verificato) → nessun acconto.
      //
      // NB: non congela gli ACCONTI parziali (solo i saldi effettivi), così i
      // sovra-pagamenti reali continuano a generare il loro credito legittimo.
      try {
        const { computeOwnerDebt } = await import("~/lib/payments/computeOwnerDebt");
        const debtSummary = await computeOwnerDebt(proprietarioId);
        const monthDebt = debtSummary?.debts.find(
          (d) => d.month === Number(month) && d.year === Number(year)
        );
        if (monthDebt) {
          const totaleServizi = monthDebt.totaleServizi;
          // Congela solo se il mese risulta ORA saldato (saldo ≈ 0 o pagato in eccesso)
          // e c'è effettivamente un totale da proteggere (> 0).
          if (totaleServizi > 0.01 && monthDebt.saldo <= 0.01) {
            const { getPaymentOverride } = await import("~/lib/firebase/payments");
            const existingOverride = await getPaymentOverride(proprietarioId, Number(month), Number(year));
            // Non sovrascrivere un override impostato a mano dall'admin con motivo diverso:
            // aggiorna solo se assente o se è un lucchetto automatico precedente.
            const isManualOverride = existingOverride
              && existingOverride.reason
              && !String(existingOverride.reason).startsWith("Lucchetto automatico");
            if (!isManualOverride) {
              await setPaymentOverride({
                proprietarioId,
                month: Number(month),
                year: Number(year),
                originalTotal: totaleServizi,
                overrideTotal: totaleServizi,
                reason: "Lucchetto automatico: totale congelato all'incasso del saldo",
                createdBy: currentUser.id,
              });
            }
          }
        }
      } catch (freezeErr) {
        // Il congelamento è una protezione aggiuntiva: se fallisce, il pagamento
        // resta comunque registrato. Non blocchiamo il flusso principale.
        console.error("Errore lucchetto totale mese:", freezeErr);
      }

      // ═══ AUTO-SBLOCCO ACCOUNT: dopo pagamento, ri-verifica il blocco ═══
      // Usa la fonte di verità centralizzata `computeOwnerDebt` per evitare
      // duplicazione di logica (e bug come doppio conteggio dell'isCreditTransfer).
      try {
        const userDoc = await adminDb.collection("users").doc(proprietarioId).get();
        if (userDoc.exists) {
          const userData = userDoc.data() as Record<string, any>;
          if (userData.paymentBlock?.active === true && userData.paymentBlock?.overriddenByAdmin !== true) {
            const { computeOwnerDebt } = await import("~/lib/payments/computeOwnerDebt");
            const debtSummary = await computeOwnerDebt(proprietarioId);
            const stillHasOverdueDebt = debtSummary !== null
              && debtSummary.totalDebtNet > 0.01
              && debtSummary.debts.some(d => d.status === "SCADUTO");

            if (!stillHasOverdueDebt) {
              await adminDb.collection("users").doc(proprietarioId).update({
                paymentBlock: null,
              });
              await adminDb.collection("notifications").add({
                title: "✅ Account ripristinato",
                message: "I tuoi pagamenti risultano regolari. L'accesso completo è stato ripristinato. Grazie!",
                type: "PAYMENT_RECEIVED",
                recipientRole: "PROPRIETARIO",
                recipientId: proprietarioId,
                senderId: "system",
                senderName: "Sistema",
                status: "UNREAD",
                actionRequired: false,
                relatedEntityType: "PAYMENT",
                link: "/proprietario/pagamenti",
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
              });
            }
          }
        }
      } catch (blockErr) {
        // Non bloccare il flusso principale se l'auto-sblocco fallisce
        console.error("Errore auto-sblocco paymentBlock:", blockErr);
      }

      return NextResponse.json({ success: true, paymentId, message: `Pagamento di €${amount} registrato` });
    }

    if (action === "set_override") {
      const { proprietarioId, month, year, originalTotal, overrideTotal, reason } = body;
      if (!proprietarioId || !month || !year || overrideTotal === undefined || !reason) {
        return NextResponse.json({ error: "Dati mancanti" }, { status: 400 });
      }

      const overrideId = await setPaymentOverride({
        proprietarioId, month, year,
        // @ts-expect-error TODO-FIX: TS2345 Argument of type 'unknown' is not assignable to parameter of type 'string'.
        originalTotal: parseFloat(originalTotal),
        // @ts-expect-error TODO-FIX: TS2345 Argument of type '{} | null' is not assignable to parameter of type 'string'.
        overrideTotal: parseFloat(overrideTotal),
        // @ts-expect-error TODO-FIX: TS2322 Type '{}' is not assignable to type 'string'.
        reason, createdBy: currentUser.id,
      });

      return NextResponse.json({ success: true, overrideId, message: `Totale modificato a €${overrideTotal}` });
    }

    if (action === "reset_override") {
      const { proprietarioId, month, year } = body;
      if (!proprietarioId || !month || !year) {
        return NextResponse.json({ error: "Dati mancanti" }, { status: 400 });
      }
      await deletePaymentOverride(proprietarioId, month, year);
      return NextResponse.json({ success: true, message: "Totale ripristinato al valore calcolato" });
    }

    return NextResponse.json({ error: "Azione non valida" }, { status: 400 });
  } catch (error) {
    console.error("Errore POST payments:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const currentUser = await getApiUser();
  if (!currentUser) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  if (currentUser.role !== "ADMIN") return NextResponse.json({ error: "Solo gli amministratori" }, { status: 403 });

  try {
    const paymentId = request.nextUrl.searchParams.get("id");
    if (!paymentId) return NextResponse.json({ error: "ID pagamento richiesto" }, { status: 400 });

    await deletePayment(paymentId);
    return NextResponse.json({ success: true, message: "Pagamento eliminato" });
  } catch (error) {
    console.error("Errore DELETE payment:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
