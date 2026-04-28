/**
 * GET /api/debug/test-payment-suspension
 *
 * Genera/invia email Sospensione Servizi per un singolo proprietario.
 * Usato sia dal cron `send-payment-suspension` (chiamata interna con cronSecret)
 * sia dall'admin per testing manuale (browser, autenticato come admin).
 *
 * Query params identici a test-payment-warning.
 *
 * SUBJECT: "Urgente · Sospensione servizi · {Mese} {Anno} · Puliziacasevacanze.it"
 * Note: "Urgente" con U maiuscola (NON tutto maiuscolo) per evitare filtri spam
 * mantenendo l'enfasi richiesta dal cliente.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { resend, isResendConfigured, FROM_EMAIL } from "~/lib/email/config";
import { paymentSuspensionEmail } from "~/lib/email/paymentSuspension";
import { computeOwnerDebt } from "~/lib/payments/computeOwnerDebt";
import { MONTHS_IT, formatCurrency } from "~/lib/payments/debtManager";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  try {
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
        example: "/api/debug/test-payment-suspension?email=mario@example.com&month=4&year=2026",
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

    const debtSummary = await computeOwnerDebt(userId);
    if (!debtSummary) {
      return NextResponse.json({
        error: "Impossibile calcolare debiti per questo utente",
      }, { status: 500 });
    }

    if (debtSummary.totalDebt <= 0.01) {
      return NextResponse.json({
        error: `Nessun debito insoluto per ${debtSummary.name}. Email NON inviata.`,
        clientName: debtSummary.name,
        userId,
        totalDebt: debtSummary.totalDebt,
      }, { status: 200 });
    }

    if (debtSummary.paymentBlockOverridden) {
      return NextResponse.json({
        error: `Admin override paymentBlock attivo per ${debtSummary.name}. Email NON inviata.`,
      }, { status: 200 });
    }

    const idempotencyKey = `${userId}_SUSPENSION_${month}_${year}`;
    const logRef = adminDb.collection("emailReminderLog").doc(idempotencyKey);

    if (!preview && !skipIdempotency) {
      const existing = await logRef.get();
      if (existing.exists) {
        return NextResponse.json({
          error: "Email sospensione già inviata (idempotenza)",
          idempotencyKey,
          previousSendAt: existing.data()?.sentAt?.toDate?.()?.toISOString(),
        }, { status: 200 });
      }
    }

    const todayFormatted = formatItalianDate(now);
    const referenceMonthLabel = MONTHS_IT[month - 1] || "Mese";

    const html = paymentSuspensionEmail({
      clientName: debtSummary.name,
      referenceMonthLabel,
      referenceYear: year,
      totalDebtFormatted: formatCurrency(debtSummary.totalDebt),
      debts: debtSummary.debts,
      todayFormatted,
    });

    if (preview) {
      return new NextResponse(html, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (!isResendConfigured() || !resend) {
      return NextResponse.json({
        error: "Resend non configurato",
      }, { status: 500 });
    }

    // Recupero PDF da test-monthly-email
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
      subject: `Urgente · Sospensione servizi · ${referenceMonthLabel} ${year} · Puliziacasevacanze.it`,
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

    if (!skipIdempotency) {
      await logRef.set({
        type: "SUSPENSION",
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
      message: `Email sospensione inviata a ${normalizedEmail}`,
      messageId: sendResult.data?.id,
      details: {
        clientName: debtSummary.name,
        userId,
        referenceMonthLabel,
        year,
        totalDebt: formatCurrency(debtSummary.totalDebt),
        monthsCount: debtSummary.debts.length,
        debts: debtSummary.debts.map(d => ({
          monthName: d.monthName,
          year: d.year,
          status: d.status,
          saldo: formatCurrency(d.saldo),
        })),
      },
    });

  } catch (err: any) {
    console.error("❌ [test-payment-suspension] Errore:", err);
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
