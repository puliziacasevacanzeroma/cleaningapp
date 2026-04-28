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
    // force=true bypassa SOLO il check paymentBlockOverridden (livello 4 protezione).
    // NON è disponibile via cronSecret per design: è un'utility solo per admin loggato
    // che vuole testare l'invio su un proprio account di test marcato come "override".
    const force = req.nextUrl.searchParams.get("force") === "true" && !isCronCall;

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

    if (debtSummary.paymentBlockOverridden && !force) {
      return NextResponse.json({
        error: `Admin override paymentBlock attivo per ${debtSummary.name}. Email NON inviata.`,
        hint: "Se vuoi forzare l'invio per testing aggiungi &force=true (solo admin loggato).",
      }, { status: 200 });
    }

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
    const html = paymentWarningEmail({
      clientName: debtSummary.name,
      referenceMonthLabel,
      referenceYear: year,
      totalDebtFormatted: formatCurrency(debtSummary.totalDebt),
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

    // Recupero il PDF dall'endpoint test-monthly-email (riuso logica esistente)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get("host")}`;
    const pdfUrl = new URL(`${baseUrl}/api/debug/test-monthly-email`);
    pdfUrl.searchParams.set("email", normalizedEmail);
    pdfUrl.searchParams.set("month", String(month));
    pdfUrl.searchParams.set("year", String(year));
    pdfUrl.searchParams.set("pdf", "true");
    if (CRON_SECRET) pdfUrl.searchParams.set("cronSecret", CRON_SECRET);

    const pdfResponse = await fetch(pdfUrl.toString(), { method: "GET" });
    if (!pdfResponse.ok) {
      return NextResponse.json({
        error: `Errore generazione PDF (HTTP ${pdfResponse.status})`,
      }, { status: 500 });
    }
    const pdfArrayBuffer = await pdfResponse.arrayBuffer();
    const pdfBuffer = Buffer.from(pdfArrayBuffer);

    const sendResult = await resend.emails.send({
      from: FROM_EMAIL,
      to: normalizedEmail,
      subject: `Pagamento in scadenza · ${referenceMonthLabel} ${year} · Puliziacasevacanze.it`,
      html,
      attachments: [{
        filename: `resoconto-${referenceMonthLabel.toLowerCase()}-${year}.pdf`,
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
