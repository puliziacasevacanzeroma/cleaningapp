/**
 * ════════════════════════════════════════════════════════════════════
 * PULIZIA BLOCCHI OBSOLETI — rimuove paymentBlock per chi è in regola
 * ════════════════════════════════════════════════════════════════════
 *
 * GET/POST /api/debug/cleanup-blocks-v1?cronSecret=XXX&dryRun=true
 *   &ownerId=...   (opz: un solo proprietario)
 *
 * Problema risolto: account sbloccati a mano (overriddenByAdmin:true)
 * restavano per sempre col banner "Sbloccato manualmente" + "Risospendi"
 * anche dopo aver saldato. Questo endpoint, per ogni proprietario con
 * paymentBlock.active === true, ricalcola il debito con computeOwnerDebt:
 * se NON ci sono più debiti scaduti → azzera paymentBlock (stato pulito).
 *
 * SICUREZZA: dryRun:true di DEFAULT (mostra solo). dryRun=false esegue.
 * Non tocca chi ha ancora debiti scaduti. Reversibile (il cron/sblocco
 * ricreano lo stato se servisse).
 *
 * SOLO LETTURA salvo dryRun=false.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handler(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  let body: any = {};
  try { body = await request.json(); } catch { /* vuoto/GET */ }
  const { searchParams } = new URL(request.url);
  const providedSecret = body.cronSecret || searchParams.get("cronSecret");
  if (cronSecret && providedSecret !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const qp = (k: string) => searchParams.get(k);
  const dryRunRaw = body.dryRun ?? qp("dryRun");
  const dryRun = dryRunRaw === false || dryRunRaw === "false" ? false : true; // default true
  const ownerFilter = body.ownerId || qp("ownerId") || null;

  try {
    const { computeOwnerDebt } = await import("~/lib/payments/computeOwnerDebt");

    // proprietari con un blocco attivo (filtro in memoria per evitare
    // dipendenze da indici Firestore su campi annidati)
    const usersSnap = await adminDb.collection("users").get();

    const azioni: any[] = [];
    for (const d of usersSnap.docs) {
      if (ownerFilter && d.id !== ownerFilter) continue;
      const u = d.data() as any;
      if (!u.paymentBlock || u.paymentBlock.active !== true) continue;
      const block = u.paymentBlock || {};
      const debt = await computeOwnerDebt(d.id);
      const stillOverdue = debt !== null && debt.totalDebtNet > 0.01 && debt.debts.some((x: any) => x.status === "SCADUTO");

      const azione = {
        ownerId: d.id,
        nome: u.displayName || u.name || u.email || d.id,
        sbloccatoManualmente: block.overriddenByAdmin === true,
        debitoNettoOra: debt ? Math.round(debt.totalDebtNet * 100) / 100 : null,
        haDebitiScaduti: stillOverdue,
        azione: stillOverdue ? "LASCIATO (ha ancora scaduti)" : "BLOCCO RIMOSSO (in regola)",
        eseguito: false,
      };

      if (!stillOverdue && !dryRun) {
        await adminDb.collection("users").doc(d.id).update({ paymentBlock: null });
        azione.eseguito = true;
      }
      azioni.push(azione);
    }

    const daRimuovere = azioni.filter((a) => !a.haDebitiScaduti);
    return NextResponse.json({
      success: true,
      modalita: dryRun ? "DRY-RUN (nessuna modifica)" : "ESEGUITO",
      riepilogo: {
        proprietariConBlocco: azioni.length,
        blocchiDaRimuovere: daRimuovere.length,
        lasciati: azioni.length - daRimuovere.length,
      },
      azioni,
      istruzioni: dryRun
        ? "Anteprima. Per eseguire: aggiungi dryRun=false all'URL."
        : "Blocchi rimossi per chi è in regola. I banner 'Sbloccato manualmente'/'Risospendi' spariranno.",
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Errore server", message: error?.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) { return handler(request); }
export async function GET(request: NextRequest) { return handler(request); }
