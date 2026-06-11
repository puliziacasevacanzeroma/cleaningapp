/**
 * ════════════════════════════════════════════════════════════════════
 * AUDIT PROBE F-25 — Extra charges registrati ma mai fatturati
 * ════════════════════════════════════════════════════════════════════
 * READ-ONLY. Nessuna scrittura. Gated da ?cronSecret=.
 *
 * Somma extraChargesTotal sulle pulizie COMPLETED: questi importi sono
 * registrati dagli operatori al completamento ma NESSUNA superficie di
 * fatturazione (motore debiti, pagine pagamenti, PDF, email) li conteggia.
 * Output: totale complessivo + dettaglio per proprietario/mese.
 *
 * Posizione: src/app/api/debug/audit-extracharges-v1/route.ts
 * Uso: GET /api/debug/audit-extracharges-v1?cronSecret=XXX
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const R = (n: number) => Math.round(n * 100) / 100;

function toDate(d: any): Date | null {
  if (!d) return null;
  if (typeof d.toDate === "function") { try { return d.toDate(); } catch { return null; } }
  return d instanceof Date ? d : null;
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("cronSecret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const snap = await adminDb.collection("cleanings")
    .where("status", "==", "COMPLETED")
    .select("extraChargesTotal", "extraChargeIds", "ownerName", "ownerId", "propertyName", "scheduledDate", "completedAt")
    .get();

  let totale = 0;
  let pulizieConExtra = 0;
  const perOwnerMese = new Map<string, { owner: string; mese: string; pulizie: number; importo: number }>();
  const dettaglio: any[] = [];

  for (const doc of snap.docs) {
    const c = doc.data() as any;
    const amount = typeof c.extraChargesTotal === "number" ? c.extraChargesTotal : 0;
    if (amount <= 0) continue;
    pulizieConExtra++;
    totale = R(totale + amount);

    const d = toDate(c.scheduledDate) || toDate(c.completedAt);
    const mese = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : "senza-data";
    const owner = c.ownerName || c.ownerId || c.propertyName || "?";

    const k = `${owner}|${mese}`;
    const agg = perOwnerMese.get(k) || { owner, mese, pulizie: 0, importo: 0 };
    agg.pulizie++; agg.importo = R(agg.importo + amount);
    perOwnerMese.set(k, agg);

    dettaglio.push({
      cleaningId: doc.id,
      property: c.propertyName || "?",
      owner,
      mese,
      data: d ? d.toISOString().slice(0, 10) : null,
      importo: amount,
      numAddebiti: Array.isArray(c.extraChargeIds) ? c.extraChargeIds.length : null,
    });
  }

  dettaglio.sort((a, b) => b.importo - a.importo);

  return NextResponse.json({
    probe: "audit-extracharges-v1",
    readOnly: true,
    pulizieCompletedScansionate: snap.size,
    pulizieConExtraCharges: pulizieConExtra,
    importoTotaleMaiFatturato: totale,
    perProprietarioMese: Array.from(perOwnerMese.values()).sort((a, b) => b.importo - a.importo),
    dettaglio: dettaglio.slice(0, 100),
    troncato: dettaglio.length > 100,
  });
}
