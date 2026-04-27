/**
 * 📧 CRON JOB - Invio Resoconti Mensili (1° del mese alle 09:00 Europe/Rome)
 *
 * Per ogni proprietario ATTIVO che ha avuto servizi nel mese precedente,
 * invia via email il resoconto del mese con PDF allegato.
 *
 * AUTENTICAZIONE: header `Authorization: Bearer <CRON_SECRET>` oppure
 * query param `?secret=<CRON_SECRET>`.
 *
 * SCHEDULING:
 * - cron-job.org: trigger ogni 1° del mese alle 09:00 (Europe/Rome)
 * - URL: https://gestionale.puliziacasevacanze.it/api/cron/send-monthly-reports?secret=<CRON_SECRET>
 *
 * COMPORTAMENTO:
 * - Auto-detect mese precedente in base alla data di esecuzione
 *   (1 mag → resoconto APR; 1 giu → MAG; 1 gen → DIC anno precedente)
 * - Riusa l'endpoint /api/debug/test-monthly-email che fa già tutto
 *   (calcoli, PDF, invio Resend) — il cron è solo un orchestratore
 * - Il cron NON crash-a se un singolo utente fallisce: passa al successivo
 * - Risponde con riepilogo: { sent, skipped, errors, durationMs }
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min per gestire molti utenti

const CRON_SECRET = process.env.CRON_SECRET;

interface UserResult {
  email: string;
  clientId: string;
  status: "sent" | "skipped" | "error";
  reason?: string;
  servicesCount?: number;
  totalFormatted?: string;
}

export async function GET(req: NextRequest) {
  // ─── 1. Autenticazione ────────────────────────────────────
  const authHeader = req.headers.get("authorization");
  const urlSecret = req.nextUrl.searchParams.get("secret");
  if (authHeader !== `Bearer ${CRON_SECRET}` && urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const results: UserResult[] = [];

  try {
    // ─── 2. Calcolo mese precedente ──────────────────────────
    // Esecuzione il 1 mag → mese=4 (APR), anno=2026
    // Esecuzione il 1 gen → mese=12 (DIC), anno=anno-1
    const now = new Date();
    let targetMonth = now.getMonth(); // 0-indexed → corrisponde a mese precedente in 1-indexed
    let targetYear = now.getFullYear();
    if (targetMonth === 0) {
      // Gennaio → anno precedente, dicembre
      targetMonth = 12;
      targetYear -= 1;
    }
    // Override opzionale via query param per testing manuale
    const monthOverride = req.nextUrl.searchParams.get("month");
    const yearOverride = req.nextUrl.searchParams.get("year");
    if (monthOverride) targetMonth = parseInt(monthOverride, 10);
    if (yearOverride) targetYear = parseInt(yearOverride, 10);

    // Override "dryRun" per testare senza inviare email
    const dryRun = req.nextUrl.searchParams.get("dryRun") === "true";

    console.log(`📧 [send-monthly-reports] Inizio cron per mese=${targetMonth}/${targetYear} dryRun=${dryRun}`);

    // ─── 3. Carico tutti i proprietari ATTIVI ────────────────
    const usersSnap = await adminDb.collection("users")
      .where("role", "==", "PROPRIETARIO")
      .where("status", "==", "ACTIVE")
      .get();

    console.log(`📧 [send-monthly-reports] Trovati ${usersSnap.docs.length} proprietari attivi`);

    // ─── 4. Per ognuno chiamo l'endpoint test internamente ───
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get("host")}`;

    for (const userDoc of usersSnap.docs) {
      const userData: any = userDoc.data();
      const email: string | undefined = userData.email;

      if (!email) {
        results.push({
          email: "(vuota)",
          clientId: userDoc.id,
          status: "skipped",
          reason: "Email mancante",
        });
        continue;
      }

      try {
        // Costruisco URL per chiamare l'endpoint test interno
        // (riusa tutta la logica già perfettamente funzionante)
        // Passo CRON_SECRET come cronSecret per autenticare la chiamata interna
        const url = new URL(`${baseUrl}/api/debug/test-monthly-email`);
        url.searchParams.set("email", email);
        url.searchParams.set("month", String(targetMonth));
        url.searchParams.set("year", String(targetYear));
        if (CRON_SECRET) url.searchParams.set("cronSecret", CRON_SECRET);
        if (dryRun) url.searchParams.set("preview", "true"); // preview=true non invia, restituisce solo HTML

        const response = await fetch(url.toString(), {
          method: "GET",
          // Senza autenticazione: il test endpoint NON è protetto da auth (è un debug endpoint)
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "Errore sconosciuto");
          console.error(`❌ [send-monthly-reports] ${email}: HTTP ${response.status} — ${errorText.substring(0, 200)}`);
          results.push({
            email,
            clientId: userDoc.id,
            status: "error",
            reason: `HTTP ${response.status}`,
          });
          continue;
        }

        // In modalità dryRun ho solo HTML, non posso parsare JSON
        if (dryRun) {
          console.log(`✅ [send-monthly-reports] ${email}: dryRun OK (preview generato)`);
          results.push({
            email,
            clientId: userDoc.id,
            status: "sent",
            reason: "dryRun (email NON inviata, solo preview)",
          });
          continue;
        }

        // Modalità reale: parso JSON
        const data: any = await response.json().catch(() => null);

        if (!data) {
          console.error(`❌ [send-monthly-reports] ${email}: risposta non JSON`);
          results.push({
            email,
            clientId: userDoc.id,
            status: "error",
            reason: "Risposta non JSON",
          });
          continue;
        }

        // Se il test endpoint dice "Nessun servizio trovato" significa che l'utente
        // non ha avuto attività nel mese (status 200, ma con campo "error")
        const noServices = typeof data.error === "string" && data.error.startsWith("Nessun servizio");
        if (noServices) {
          console.log(`⏭️  [send-monthly-reports] ${email}: nessun servizio nel mese, skip`);
          results.push({
            email,
            clientId: userDoc.id,
            status: "skipped",
            reason: "Nessun servizio nel mese",
            servicesCount: 0,
          });
          continue;
        }

        if (data.error) {
          console.error(`❌ [send-monthly-reports] ${email}: ${data.error}`);
          results.push({
            email,
            clientId: userDoc.id,
            status: "error",
            reason: data.error,
          });
          continue;
        }

        // Successo
        const serviceCount = data?.details?.servicesCount ?? data.servicesCount ?? 0;
        const totalFormatted = data?.details?.totals?.grandTotal ?? "?";
        console.log(`✅ [send-monthly-reports] ${email}: inviata (${serviceCount} servizi, ${totalFormatted})`);
        results.push({
          email,
          clientId: userDoc.id,
          status: "sent",
          servicesCount: serviceCount,
          totalFormatted,
        });

        // Piccola pausa tra invii per non saturare Resend (rate limit ~10 req/sec)
        await new Promise(r => setTimeout(r, 200));

      } catch (innerErr: any) {
        console.error(`❌ [send-monthly-reports] ${email}: eccezione`, innerErr);
        results.push({
          email,
          clientId: userDoc.id,
          status: "error",
          reason: innerErr?.message || String(innerErr),
        });
      }
    }

    // ─── 5. Riepilogo ────────────────────────────────────────
    const sent = results.filter(r => r.status === "sent").length;
    const skipped = results.filter(r => r.status === "skipped").length;
    const errors = results.filter(r => r.status === "error").length;
    const durationMs = Date.now() - startTime;

    console.log(`📧 [send-monthly-reports] Completato: sent=${sent} skipped=${skipped} errors=${errors} duration=${durationMs}ms`);

    return NextResponse.json({
      success: true,
      summary: {
        targetMonth,
        targetYear,
        dryRun,
        totalProcessed: results.length,
        sent,
        skipped,
        errors,
        durationMs,
      },
      results,
    });

  } catch (err: any) {
    console.error(`❌ [send-monthly-reports] Errore globale:`, err);
    return NextResponse.json({
      error: "Errore globale cron",
      message: err?.message || String(err),
      partialResults: results,
      durationMs: Date.now() - startTime,
    }, { status: 500 });
  }
}
