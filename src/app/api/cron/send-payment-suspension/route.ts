/**
 * 📧 CRON JOB - Sospensione Servizi (10 del mese alle 09:00 Europe/Rome)
 *
 * Per ogni proprietario ATTIVO ancora con saldo > 0 dopo il termine, invia email
 * di sospensione (palette rossa con percorso recupero) + PDF allegato.
 *
 * IMPORTANTE: questa email coincide temporalmente con l'attivazione automatica
 * del paymentBlock.active gestita dal cron `check-payment-blocks` (separato).
 * I due cron condividono la stessa logica di calcolo via computeOwnerDebt.
 *
 * AUTENTICAZIONE: header `Authorization: Bearer <CRON_SECRET>` oppure
 * query param `?secret=<CRON_SECRET>`.
 *
 * SCHEDULING:
 * - cron-job.org: ogni 10 del mese alle 09:00 (Europe/Rome)
 * - URL: https://gestionale.puliziacasevacanze.it/api/cron/send-payment-suspension?secret=<CRON_SECRET>
 *
 * COMPORTAMENTO (4 livelli di protezione anti-falso-positivo):
 *   1. getAllOwnersWithDebt() filtra solo chi ha saldo > 0
 *   2. Double-check fresh debt prima dell'invio
 *   3. Idempotenza Firestore via emailReminderLog (chiave SUSPENSION)
 *   4. Skip su admin override, no email, no proprietà attive
 *
 * Pattern fire-and-forget come gli altri cron del sistema.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import {
  computeOwnerDebt,
  getAllOwnersWithDebt,
  type OwnerDebtSummary,
} from "~/lib/payments/computeOwnerDebt";
import { formatCurrency } from "~/lib/payments/debtManager";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
  const authHeader = req.headers.get("authorization");
  const urlSecret = req.nextUrl.searchParams.get("secret");
  if (authHeader !== `Bearer ${CRON_SECRET}` && urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  let targetMonth = now.getMonth();
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

  // 🛡️ FAILSAFE: prima di mandare email di sospensione, attiva i paymentBlock
  //    chiamando check-payment-blocks internamente. Così i due cron sono
  //    sempre allineati anche se su cron-job.org è configurato solo questo.
  //    Idempotente: se check-payment-blocks è già girato oggi, non duplica nulla.
  try {
    const blockUrl = `${baseUrl}/api/cron/check-payment-blocks?secret=${encodeURIComponent(CRON_SECRET || "")}`;
    const blockRes = await fetch(blockUrl, { method: "GET" });
    if (blockRes.ok) {
      const blockJson = await blockRes.json();
      console.log(`🔒 [send-payment-suspension] check-payment-blocks ok:`, JSON.stringify(blockJson));
    } else {
      console.warn(`⚠️ [send-payment-suspension] check-payment-blocks HTTP ${blockRes.status} — proseguo comunque`);
    }
  } catch (e) {
    console.warn(`⚠️ [send-payment-suspension] check-payment-blocks failed (non bloccante):`, e);
  }

  if (sync) {
    const result = await processAllOwners(baseUrl, targetMonth, targetYear, dryRun);
    return NextResponse.json(result);
  }

  processAllOwners(baseUrl, targetMonth, targetYear, dryRun)
    .then(result => {
      console.log(`📧 [send-payment-suspension] ASYNC completato:`, JSON.stringify(result.summary));
    })
    .catch(err => {
      console.error(`❌ [send-payment-suspension] ASYNC errore globale:`, err);
    });

  return NextResponse.json({
    success: true,
    mode: "async",
    message: "Cron sospensione avviato in background. Controlla i log Railway.",
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
    console.log(`📧 [send-payment-suspension] Inizio cron per mese=${targetMonth}/${targetYear} dryRun=${dryRun}`);

    const ownersWithDebt = await getAllOwnersWithDebt();
    console.log(`📧 [send-payment-suspension] Trovati ${ownersWithDebt.length} proprietari con saldo > 0`);

    for (const summary of ownersWithDebt) {
      const result = await processOneOwner(summary, baseUrl, targetMonth, targetYear, dryRun);
      results.push(result);
      if (result.status === "sent") {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    const sent = results.filter(r => r.status === "sent").length;
    const skipped = results.filter(r => r.status === "skipped").length;
    const errors = results.filter(r => r.status === "error").length;
    const durationMs = Date.now() - startTime;

    console.log(`📧 [send-payment-suspension] Completato: sent=${sent} skipped=${skipped} errors=${errors} duration=${durationMs}ms`);

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
    console.error(`❌ [send-payment-suspension] Errore globale:`, err);
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
  const { userId, email } = summary;

  // ─── LIVELLO 3: idempotenza ───────────────────────────
  const idempotencyKey = `${userId}_SUSPENSION_${targetMonth}_${targetYear}`;
  const logRef = adminDb.collection("emailReminderLog").doc(idempotencyKey);

  if (!dryRun) {
    const existing = await logRef.get();
    if (existing.exists) {
      console.log(`⏭️  [send-payment-suspension] ${email}: già inviata (idempotenza)`);
      return {
        email, userId,
        status: "skipped",
        reason: "Già inviata oggi (idempotenza Firestore)",
      };
    }
  }

  // ─── LIVELLO 2: fresh check ────────────────────────────
  // ⚠️ Uso totalDebtNet (debito netto = totalDebt − creditoTotale): se l'acconto
  // copre tutto il debito, NON sospendiamo l'account.
  const fresh = await computeOwnerDebt(userId);
  if (!fresh || fresh.totalDebtNet <= 0.01) {
    console.log(`⏭️  [send-payment-suspension] ${email}: saldato prima dell'invio (fresh-check, netto=${fresh?.totalDebtNet ?? 0})`);
    return {
      email, userId,
      status: "skipped",
      reason: "Saldato prima dell'invio (fresh-check)",
    };
  }
  // NOTA: paymentBlockOverridden NON viene più controllato qui (decisione: tracciatura formale).

  try {
    const url = new URL(`${baseUrl}/api/debug/test-payment-suspension`);
    url.searchParams.set("email", email);
    url.searchParams.set("month", String(targetMonth));
    url.searchParams.set("year", String(targetYear));
    if (CRON_SECRET) url.searchParams.set("cronSecret", CRON_SECRET);
    if (dryRun) url.searchParams.set("preview", "true");
    url.searchParams.set("skipIdempotency", "true");

    const response = await fetch(url.toString(), { method: "GET" });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Errore sconosciuto");
      console.error(`❌ [send-payment-suspension] ${email}: HTTP ${response.status} — ${errorText.substring(0, 200)}`);
      return {
        email, userId,
        status: "error",
        reason: `HTTP ${response.status}`,
      };
    }

    if (dryRun) {
      console.log(`✅ [send-payment-suspension] ${email}: dryRun OK (preview)`);
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
      console.error(`❌ [send-payment-suspension] ${email}: ${data.error}`);
      return { email, userId, status: "error", reason: data.error };
    }

    await logRef.set({
      type: "SUSPENSION",
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

    console.log(`✅ [send-payment-suspension] ${email}: INVIATA (netto ${formatCurrency(fresh.totalDebtNet)} su lordo ${formatCurrency(fresh.totalDebt)}, ${fresh.debts.length} mesi)`);
    return {
      email, userId,
      status: "sent",
      totalDebt: formatCurrency(fresh.totalDebt),
      totalDebtNet: formatCurrency(fresh.totalDebtNet),
      creditoTotale: formatCurrency(fresh.creditoTotale),
      monthsCount: fresh.debts.length,
    };

  } catch (innerErr: any) {
    console.error(`❌ [send-payment-suspension] ${email}: eccezione`, innerErr);
    return {
      email, userId,
      status: "error",
      reason: innerErr?.message || String(innerErr),
    };
  }
}
