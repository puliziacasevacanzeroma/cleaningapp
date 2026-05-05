/**
 * GET /api/debug/test-payment-warning
 *
 * Genera/invia email Promemoria Scadenza per un singolo proprietario.
 * Usato sia dal cron `send-payment-warning` (chiamata interna con cronSecret)
 * sia dall'admin per testing manuale (browser, autenticato come admin).
 *
 * Query params:
 *   email             = email del proprietario (REQUIRED)
 *   month             = mese di riferimento (REQUIRED, 1-12)
 *   year              = anno di riferimento (REQUIRED, es. 2026)
 *   preview           = "true" → restituisce HTML preview, NON invia
 *   skipIdempotency   = "true" → NON controlla né scrive emailReminderLog
 *                       (usato dal cron che fa il proprio controllo a monte)
 *   cronSecret        = se valido salta auth admin (chiamata interna cron)
 *
 * STRATEGIA PDF: per evitare di duplicare la logica complessa di costruzione
 * propertiesForPdf, riusa l'endpoint /api/debug/test-monthly-email?pdf=true
 * che restituisce il PDF binario già pronto.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { resend, isResendConfigured, FROM_EMAIL } from "~/lib/email/config";
import { paymentWarningEmail } from "~/lib/email/paymentWarning";
import { generateDebtStatementPdf } from "~/lib/email/debtStatementPdf";
import { computeOwnerDebt } from "~/lib/payments/computeOwnerDebt";
import {
  MONTHS_IT,
  formatCurrency,
  getScadenzaDate,
} from "~/lib/payments/debtManager";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  try {
    // ─── AUTH: ADMIN o cronSecret ─────────────────────────
    const cronSecretParam = req.nextUrl.searchParams.get("cronSecret");
    const isCronCall = CRON_SECRET && cronSecretParam === CRON_SECRET;
    if (!isCronCall) {
      const user = await getApiUser();
      if (!user || user.role?.toUpperCase() !== "ADMIN") {
        return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
      }
    }

    const email = req.nextUrl.searchParams.get("email");
    const monthStr = req.nextUrl.searchParams.get("month");
    const yearStr = req.nextUrl.searchParams.get("year");
    const preview = req.nextUrl.searchParams.get("preview") === "true";
    const skipIdempotency = req.nextUrl.searchParams.get("skipIdempotency") === "true";

    if (!email) {
      return NextResponse.json({
        error: "Parametro richiesto: email",
        example: "/api/debug/test-payment-warning?email=mario@example.com&month=4&year=2026",
      }, { status: 400 });
    }

    const now = new Date();
    let month: number;
    let year: number;
    if (monthStr && yearStr) {
      month = parseInt(monthStr, 10);
      year = parseInt(yearStr, 10);
    } else {
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      month = prevMonth.getMonth() + 1;
      year = prevMonth.getFullYear();
    }

    if (isNaN(month) || month < 1 || month > 12 || isNaN(year) || year < 2020 || year > 2100) {
      return NextResponse.json({ error: "month deve essere 1-12, year 2020-2100" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // ─── 1. Trovo utente per email ─────────────────────────
    const userQuery = await adminDb.collection("users")
      .where("email", "==", normalizedEmail)
      .limit(1)
      .get();

    if (userQuery.empty) {
      return NextResponse.json({
        error: `Nessun utente trovato con email ${normalizedEmail}`,
      }, { status: 404 });
    }

    const userDoc = userQuery.docs[0]!;
    const userId = userDoc.id;

    // ─── 2. Calcolo debiti via helper condiviso ────────────
    const debtSummary = await computeOwnerDebt(userId);
    if (!debtSummary) {
      return NextResponse.json({
        error: "Impossibile calcolare debiti per questo utente",
      }, { status: 500 });
    }

    // ─── PROTEZIONE: zero email se non ci sono debiti ──────
    if (debtSummary.totalDebt <= 0.01) {
      return NextResponse.json({
        error: `Nessun debito insoluto per ${debtSummary.name}. Email NON inviata.`,
        clientName: debtSummary.name,
        userId,
        totalDebt: debtSummary.totalDebt,
        propertiesCount: debtSummary.propertiesCount,
      }, { status: 200 });
    }

    // NOTA: paymentBlockOverridden NON è più un blocco. Le email vengono inviate
    // anche ai clienti sbloccati manualmente dall'admin per tracciatura formale.

    // ─── 3. Idempotenza (skip se cron già controllato) ──────
    const idempotencyKey = `${userId}_WARNING_${month}_${year}`;
    const logRef = adminDb.collection("emailReminderLog").doc(idempotencyKey);

    if (!preview && !skipIdempotency) {
      const existing = await logRef.get();
      if (existing.exists) {
        return NextResponse.json({
          error: "Email warning già inviata (idempotenza)",
          idempotencyKey,
          previousSendAt: existing.data()?.sentAt?.toDate?.()?.toISOString(),
        }, { status: 200 });
      }
    }

    // ─── 4. Calcolo date e parametri ────────────────────────
    const todayFormatted = formatItalianDate(now);
    const scadenza = getScadenzaDate(month, year);
    const paymentDeadlineFormatted = formatItalianDate(scadenza);
    const daysToDeadline = Math.max(0, Math.ceil(
      (scadenza.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    ));

    const referenceMonthLabel = MONTHS_IT[month - 1] || "Mese";

    // ─── 5. Compongo HTML email ─────────────────────────────
    const hasCredit = (debtSummary.creditoTotale || 0) > 0.01;
    const html = paymentWarningEmail({
      clientName: debtSummary.name,
      referenceMonthLabel,
      referenceYear: year,
      totalDebtFormatted: formatCurrency(debtSummary.totalDebt),
      // Passa i campi credito SOLO se c'è davvero un acconto da scalare
      creditoTotaleFormatted: hasCredit ? formatCurrency(debtSummary.creditoTotale) : undefined,
      totalDebtNetFormatted: hasCredit ? formatCurrency(debtSummary.totalDebtNet) : undefined,
      debts: debtSummary.debts,
      todayFormatted,
      paymentDeadlineFormatted,
      daysToDeadline,
    });

    // ─── 6a. Preview only ───────────────────────────────────
    if (preview) {
      return new NextResponse(html, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // ─── 6b. Invio reale ───────────────────────────────────
    if (!isResendConfigured() || !resend) {
      return NextResponse.json({
        error: "Resend non configurato",
        suggestion: "Aggiungi RESEND_API_KEY nelle variabili d'ambiente Railway",
      }, { status: 500 });
    }

    // Genero il PDF Estratto Conto Debiti (NUOVO - sostituisce il vecchio resoconto mensile).
    // Il totale di copertina del PDF è ESATTAMENTE uguale al banner email (debtSummary.totalDebt).
    const pdfBuffer = await generateDebtStatementPdf({
      clientName: debtSummary.name,
      documentType: "WARNING",
      issueDate: now,
      debts: debtSummary.debts,
      totalDebt: debtSummary.totalDebt,
      paymentDeadline: scadenza,
    });

    const sendResult = await resend.emails.send({
      from: FROM_EMAIL,
      to: normalizedEmail,
      subject: `Pagamento in scadenza · ${referenceMonthLabel} ${year} · Puliziacasevacanze.it`,
      html,
      attachments: [{
        filename: `estratto-conto-${formatDateForFilename(now)}.pdf`,
        content: pdfBuffer,
      }],
    });

    if (sendResult.error) {
      return NextResponse.json({
        error: "Errore invio email",
        resendError: sendResult.error,
      }, { status: 500 });
    }

    // ─── 7. Scrivo log idempotenza (se non skipped) ─────────
    if (!skipIdempotency) {
      await logRef.set({
        type: "WARNING",
        userId,
        email: normalizedEmail,
        month,
        year,
        sentAt: Timestamp.now(),
        totalDebt: debtSummary.totalDebt,
        monthsCount: debtSummary.debts.length,
        messageId: sendResult.data?.id || null,
      });
    }

    return NextResponse.json({
      success: true,
      message: `Email warning inviata a ${normalizedEmail}`,
      messageId: sendResult.data?.id,
      details: {
        clientName: debtSummary.name,
        userId,
        referenceMonthLabel,
        year,
        totalDebt: formatCurrency(debtSummary.totalDebt),
        monthsCount: debtSummary.debts.length,
        daysToDeadline,
        paymentDeadline: paymentDeadlineFormatted,
        debts: debtSummary.debts.map(d => ({
          monthName: d.monthName,
          year: d.year,
          status: d.status,
          saldo: formatCurrency(d.saldo),
        })),
      },
    });

  } catch (err: any) {
    console.error("❌ [test-payment-warning] Errore:", err);
    return NextResponse.json({
      error: err?.message || String(err),
    }, { status: 500 });
  }
}

function formatItalianDate(date: Date): string {
  const day = date.getDate();
  const month = MONTHS_IT[date.getMonth()] || "";
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

function formatDateForFilename(date: Date): string {
  // Formato YYYY-MM-DD per nome file ordinabile cronologicamente
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
