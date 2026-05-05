/**
 * 📧 CRON JOB - Promemoria Scadenza Pagamento (5 del mese alle 09:00 Europe/Rome)
 *
 * Per ogni proprietario ATTIVO con saldo > 0 sul mese precedente, invia email
 * di promemoria scadenza imminente (palette ambra) con PDF allegato.
 *
 * AUTENTICAZIONE: header `Authorization: Bearer <CRON_SECRET>` oppure
 * query param `?secret=<CRON_SECRET>`.
 *
 * SCHEDULING:
 * - cron-job.org: ogni 5 del mese alle 09:00 (Europe/Rome)
 * - URL: https://gestionale.puliziacasevacanze.it/api/cron/send-payment-warning?secret=<CRON_SECRET>
 *
 * COMPORTAMENTO (4 livelli di protezione anti-falso-positivo):
 *   1. getAllOwnersWithDebt() filtra solo chi ha saldo > 0 con tutti i filtri di sicurezza
 *   2. Double-check fresh debt prima dell'invio (in caso paghi mentre processiamo)
 *   3. Idempotenza Firestore via emailReminderLog (no doppi invii)
 *   4. Skip su admin override, no email, no proprietà attive
 *
 * Pattern fire-and-forget come send-monthly-reports per cron-job.org free tier (<30s).
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { resend, isResendConfigured, FROM_EMAIL } from "~/lib/email/config";
import { paymentWarningEmail } from "~/lib/email/paymentWarning";
import {
  computeOwnerDebt,
  getAllOwnersWithDebt,
  type OwnerDebtSummary,
} from "~/lib/payments/computeOwnerDebt";
import {
  MONTHS_IT,
  formatCurrency,
  formatDateFull,
  getScadenzaDate,
} from "~/lib/payments/debtManager";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min

const CRON_SECRET = process.env.CRON_SECRET;

interface UserResult {
  email: string;
  userId: string;
  status: "sent" | "skipped" | "error";
  reason?: string;
  totalDebt?: string;
  totalDebtNet?: string;
  creditoTotale?: string;
  monthsCount?: number;
}

export async function GET(req: NextRequest) {
  // ─── 1. Autenticazione ────────────────────────────────────
  const authHeader = req.headers.get("authorization");
  const urlSecret = req.nextUrl.searchParams.get("secret");
  if (authHeader !== `Bearer ${CRON_SECRET}` && urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ─── 2. Mese di riferimento (mese precedente, come send-monthly-reports) ───
  const now = new Date();
  let targetMonth = now.getMonth(); // 0-indexed → corrisponde a mese precedente in 1-indexed
  let targetYear = now.getFullYear();
  if (targetMonth === 0) {
    targetMonth = 12;
    targetYear -= 1;
  }
  const monthOverride = req.nextUrl.searchParams.get("month");
  const yearOverride = req.nextUrl.searchParams.get("year");
  if (monthOverride) targetMonth = parseInt(monthOverride, 10);
  if (yearOverride) targetYear = parseInt(yearOverride, 10);

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "true";
  const sync = req.nextUrl.searchParams.get("sync") === "true";

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get("host")}`;

  // ─── 3. SYNC: aspetta tutto (per testing) ────────────────
  if (sync) {
    const result = await processAllOwners(baseUrl, targetMonth, targetYear, dryRun);
    return NextResponse.json(result);
  }

  // ─── 4. ASYNC: fire-and-forget per cron-job.org ──────────
  processAllOwners(baseUrl, targetMonth, targetYear, dryRun)
    .then(result => {
      console.log(`📧 [send-payment-warning] ASYNC completato:`, JSON.stringify(result.summary));
    })
    .catch(err => {
      console.error(`❌ [send-payment-warning] ASYNC errore globale:`, err);
    });

  return NextResponse.json({
    success: true,
    mode: "async",
    message: "Cron warning avviato in background. Controlla i log Railway.",
    targetMonth,
    targetYear,
    dryRun,
    note: "Per modalità sincrona aggiungi &sync=true",
  });
}

async function processAllOwners(
  baseUrl: string,
  targetMonth: number,
  targetYear: number,
  dryRun: boolean
): Promise<{ success: boolean; summary: any; results: UserResult[] }> {
  const startTime = Date.now();
  const results: UserResult[] = [];

  try {
    console.log(`📧 [send-payment-warning] Inizio cron per mese=${targetMonth}/${targetYear} dryRun=${dryRun}`);

    // ─── LIVELLO 1: filtro a monte ────────────────────────
    const ownersWithDebt = await getAllOwnersWithDebt();
    console.log(`📧 [send-payment-warning] Trovati ${ownersWithDebt.length} proprietari con saldo > 0`);

    for (const summary of ownersWithDebt) {
      const result = await processOneOwner(summary, baseUrl, targetMonth, targetYear, dryRun);
      results.push(result);
      // Pausa tra invii per non saturare Resend (rate limit ~10 req/sec)
      if (result.status === "sent") {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    const sent = results.filter(r => r.status === "sent").length;
    const skipped = results.filter(r => r.status === "skipped").length;
    const errors = results.filter(r => r.status === "error").length;
    const durationMs = Date.now() - startTime;

    console.log(`📧 [send-payment-warning] Completato: sent=${sent} skipped=${skipped} errors=${errors} duration=${durationMs}ms`);

    return {
      success: true,
      summary: {
        targetMonth, targetYear, dryRun,
        totalProcessed: results.length,
        sent, skipped, errors, durationMs,
      },
      results,
    };
  } catch (err: any) {
    console.error(`❌ [send-payment-warning] Errore globale:`, err);
    return {
      success: false,
      summary: {
        targetMonth, targetYear, dryRun,
        error: err?.message || String(err),
        durationMs: Date.now() - startTime,
      },
      results,
    };
  }
}

async function processOneOwner(
  summary: OwnerDebtSummary,
  baseUrl: string,
  targetMonth: number,
  targetYear: number,
  dryRun: boolean
): Promise<UserResult> {
  const { userId, email, name } = summary;

  // ─── LIVELLO 3: idempotenza Firestore ─────────────────
  const idempotencyKey = `${userId}_WARNING_${targetMonth}_${targetYear}`;
  const logRef = adminDb.collection("emailReminderLog").doc(idempotencyKey);

  if (!dryRun) {
    const existing = await logRef.get();
    if (existing.exists) {
      console.log(`⏭️  [send-payment-warning] ${email}: già inviata (idempotenza)`);
      return {
        email, userId,
        status: "skipped",
        reason: "Già inviata oggi (idempotenza Firestore)",
      };
    }
  }

  // ─── LIVELLO 2: ricontrollo saldo "fresh" ──────────────
  // (in caso il proprietario abbia pagato mentre stiamo processando la lista)
  // ⚠️ Uso totalDebtNet (debito netto = totalDebt − creditoTotale): se l'acconto
  // copre tutto il debito, NON inviamo email anche se totalDebt > 0.
  const fresh = await computeOwnerDebt(userId);
  if (!fresh || fresh.totalDebtNet <= 0.01) {
    console.log(`⏭️  [send-payment-warning] ${email}: saldato prima dell'invio (fresh-check, netto=${fresh?.totalDebtNet ?? 0})`);
    return {
      email, userId,
      status: "skipped",
      reason: "Saldato prima dell'invio (fresh-check)",
    };
  }
  // NOTA: paymentBlockOverridden NON viene più controllato qui (decisione: tracciatura formale).
  // Le email partono anche per i clienti sbloccati manualmente dall'admin.

  // ─── 4. Costruisco URL endpoint test (per riusare logica PDF) ───
  try {
    const url = new URL(`${baseUrl}/api/debug/test-payment-warning`);
    url.searchParams.set("email", email);
    url.searchParams.set("month", String(targetMonth));
    url.searchParams.set("year", String(targetYear));
    if (CRON_SECRET) url.searchParams.set("cronSecret", CRON_SECRET);
    if (dryRun) url.searchParams.set("preview", "true");
    // Skip idempotenza nel debug endpoint (già controllata qui sopra)
    url.searchParams.set("skipIdempotency", "true");

    const response = await fetch(url.toString(), { method: "GET" });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Errore sconosciuto");
      console.error(`❌ [send-payment-warning] ${email}: HTTP ${response.status} — ${errorText.substring(0, 200)}`);
      return {
        email, userId,
        status: "error",
        reason: `HTTP ${response.status}`,
      };
    }

    if (dryRun) {
      console.log(`✅ [send-payment-warning] ${email}: dryRun OK (preview)`);
      return {
        email, userId,
        status: "sent",
        reason: "dryRun (email NON inviata, solo preview)",
        totalDebt: formatCurrency(fresh.totalDebt),
        totalDebtNet: formatCurrency(fresh.totalDebtNet),
        creditoTotale: formatCurrency(fresh.creditoTotale),
        monthsCount: fresh.debts.length,
      };
    }

    const data: any = await response.json().catch(() => null);
    if (!data) {
      return { email, userId, status: "error", reason: "Risposta non JSON" };
    }
    if (data.error) {
      console.error(`❌ [send-payment-warning] ${email}: ${data.error}`);
      return { email, userId, status: "error", reason: data.error };
    }

    // ─── 5. Successo: scrivo log idempotenza ───────────────
    await logRef.set({
      type: "WARNING",
      userId,
      email,
      month: targetMonth,
      year: targetYear,
      sentAt: Timestamp.now(),
      totalDebt: fresh.totalDebt,
      totalDebtNet: fresh.totalDebtNet,
      creditoTotale: fresh.creditoTotale,
      monthsCount: fresh.debts.length,
      messageId: data.messageId || null,
    });

    console.log(`✅ [send-payment-warning] ${email}: INVIATA (netto ${formatCurrency(fresh.totalDebtNet)} su lordo ${formatCurrency(fresh.totalDebt)}, ${fresh.debts.length} mesi)`);
    return {
      email, userId,
      status: "sent",
      totalDebt: formatCurrency(fresh.totalDebt),
      totalDebtNet: formatCurrency(fresh.totalDebtNet),
      creditoTotale: formatCurrency(fresh.creditoTotale),
      monthsCount: fresh.debts.length,
    };

  } catch (innerErr: any) {
    console.error(`❌ [send-payment-warning] ${email}: eccezione`, innerErr);
    return {
      email, userId,
      status: "error",
      reason: innerErr?.message || String(innerErr),
    };
  }
}

// Re-export di funzioni helper non usate qui (placeholder per future espansioni)
export const _helpers = { paymentWarningEmail, MONTHS_IT, formatDateFull, getScadenzaDate };
