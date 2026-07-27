/**
 * SENTINELLA custom degeneri (per CRON-JOB.ORG).
 * GET /api/debug/check-degenerate-customs-v1?cronSecret=XXX
 *
 * Risponde:
 *  - HTTP 200 se NESSUNA pulizia ha customLinenConfig degenere con biancheria attiva
 *  - HTTP 500 (con elenco) se ne trova → cron-job.org segnala il fallimento via email
 *
 * Read-only, leggera (una query su cleanings + una su properties).
 * Da agganciare a CRON-JOB.ORG (es. 1 volta al giorno) con notifica sui fallimenti.
 *
 * Contesto: caso Trastevere 27/07/2026 — custom con bl/ba vuoti (solo kit)
 * generava ordini senza lenzuola. Le guardie in scrittura (EditCleaningModal v3,
 * cleanings/manual v2, PATCH cleanings/[id] v2) e in lettura (update-linen-order
 * v2) dovrebbero rendere impossibile la ricomparsa: questa route è la rete di
 * sicurezza che lo VERIFICA ogni giorno invece di presumerlo.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { isDegenerateCustomConfig } from "~/lib/linen/linenCore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  if (cronSecret && searchParams.get("cronSecret") !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const cleanSnap = await adminDb
      .collection("cleanings")
      .where("linenConfigModified", "==", true)
      .get();

    const propsSnap = await adminDb.collection("properties").get();
    const props = new Map<string, any>();
    propsSnap.docs.forEach((d) => props.set(d.id, d.data()));

    const degeneri: any[] = [];
    cleanSnap.docs.forEach((cd) => {
      const c = cd.data() as any;
      const custom = c.customLinenConfig;
      if (!custom || typeof custom !== "object") return;
      if (!isDegenerateCustomConfig(custom)) return;
      const prop = props.get(c.propertyId) || null;
      const linenActive = c.hasLinenOrder !== false && prop?.usesOwnLinen !== true;
      if (!linenActive) return;
      degeneri.push({
        cleaningId: cd.id,
        propertyName: prop?.name || c.propertyId,
        data: c.scheduledDate?.toDate?.()?.toISOString()?.slice(0, 10) || null,
        status: c.status,
        ki: custom.ki ?? null,
      });
    });

    if (degeneri.length > 0) {
      // HTTP 500 volutamente: così CRON-JOB.ORG lo marca come fallito e avvisa.
      return NextResponse.json(
        {
          ok: false,
          ALLARME: `${degeneri.length} customLinenConfig DEGENERI con biancheria attiva — rischio ordini senza lenzuola`,
          degeneri,
          rimedio:
            "Lancia /api/debug/repair-degenerate-customs-v1 (dry-run, poi &apply=1) e indaga da quale percorso è nato il custom.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      controllate: cleanSnap.size,
      degeneri: 0,
      messaggio: "Nessun custom degenere con biancheria attiva. Tutto coerente.",
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Errore", message: error?.message }, { status: 500 });
  }
}
