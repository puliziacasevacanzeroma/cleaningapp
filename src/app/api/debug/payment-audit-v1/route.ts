/**
 * ════════════════════════════════════════════════════════════════════
 * SCATOLA NERA — lettura log pagamenti (paymentAudit)
 * ════════════════════════════════════════════════════════════════════
 *
 * GET /api/debug/payment-audit-v1?cronSecret=XXX
 *   &month=6&year=2026     (opz: filtra mese/anno dell'incasso)
 *   &name=regina           (opz: filtra per nome proprietario)
 *   &soloSospetti=1        (opz: mostra solo gli incassi con scarto ≠ 0)
 *   &limit=50              (opz: max risultati, default 50)
 *
 * Mostra, per ogni incasso registrato:
 *   - quando, chi ha incassato, quale proprietario, che mese
 *   - pulsante cliccato (INCASSA_TOTALE / ACCONTO)
 *   - importoRegistrato vs totaleDaIncassare_mostratoDallaPagina
 *   - totaleServizi_motore (canonico) e i due SCARTI
 *   → se 'scarto_totaleMotore_meno_incassato' ≠ 0, lì nascerà un acconto.
 *
 * SOLO LETTURA.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const toDate = (d: any): Date | null => {
  if (!d) return null;
  if (typeof d.toDate === "function") { try { return d.toDate(); } catch { return null; } }
  if (d instanceof Date) return d;
  return null;
};
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace("T", " ") : null);

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  if (cronSecret && searchParams.get("cronSecret") !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const monthFilter = searchParams.get("month") ? parseInt(searchParams.get("month")!) : null;
  const yearFilter = searchParams.get("year") ? parseInt(searchParams.get("year")!) : null;
  const nameFilter = (searchParams.get("name") || "").toLowerCase().trim();
  const soloSospetti = searchParams.get("soloSospetti") === "1";
  const limit = parseInt(searchParams.get("limit") || "50");

  try {
    // ordina per timestamp desc (più recenti prima)
    const snap = await adminDb.collection("paymentAudit").orderBy("timestamp", "desc").limit(500).get();

    let righe = snap.docs.map((d) => {
      const a = d.data() as any;
      return {
        quando: iso(toDate(a.timestamp)),
        proprietario: a.proprietarioName || a.proprietarioId,
        mese: a.month && a.year ? `${String(a.month).padStart(2, "0")}/${a.year}` : null,
        pulsante: a.pulsante,
        incassatoDa: a.createdByName || a.createdBy,
        importoRegistrato: a.importoRegistrato ?? null,
        mostratoDallaPagina: a.totaleDaIncassare_mostratoDallaPagina ?? null,
        giaPagatoPrima: a.giaPagatoPrima ?? null,
        totaleServizi_motore: a.totaleServizi_motore ?? null,
        saldoDopo_motore: a.saldoDopoPagamento_motore ?? null,
        scarto_incassato_vs_mostrato: a.scarto_incassato_meno_mostrato ?? null,
        scarto_motore_vs_incassato: a.scarto_totaleMotore_meno_incassato ?? null,
        _month: a.month, _year: a.year, _name: (a.proprietarioName || "").toLowerCase(),
      };
    });

    if (monthFilter) righe = righe.filter((r) => r._month === monthFilter);
    if (yearFilter) righe = righe.filter((r) => r._year === yearFilter);
    if (nameFilter) righe = righe.filter((r) => r._name.includes(nameFilter));
    if (soloSospetti) righe = righe.filter((r) =>
      (r.scarto_motore_vs_incassato != null && Math.abs(r.scarto_motore_vs_incassato) > 0.01) ||
      (r.scarto_incassato_vs_mostrato != null && Math.abs(r.scarto_incassato_vs_mostrato) > 0.01)
    );

    righe = righe.slice(0, limit).map(({ _month, _year, _name, ...r }) => r);

    return NextResponse.json({
      success: true,
      totaleRegistrazioni: snap.size,
      mostrate: righe.length,
      filtri: { month: monthFilter, year: yearFilter, name: nameFilter || null, soloSospetti },
      comeLeggere: "Se 'scarto_motore_vs_incassato' è ≠ 0 su un incasso, è il seme di un futuro acconto: lì il totale che hai incassato non coincide col totale del motore. 'scarto_incassato_vs_mostrato' ≠ 0 significa che hai registrato un importo diverso da quello che la pagina mostrava.",
      incassi: righe,
    });
  } catch (error: any) {
    // Se la collection non esiste ancora o manca l'indice, spiega
    const msg = error?.message || "";
    return NextResponse.json({
      error: "Errore lettura audit",
      message: msg,
      hint: msg.includes("index")
        ? "Firestore chiede un indice per orderBy(timestamp). Apri il link nell'errore per crearlo, oppure rilancia: la collection potrebbe essere ancora vuota (nessun incasso dopo il deploy)."
        : "Se la collection paymentAudit è vuota, non è ancora stato registrato nessun incasso dopo il deploy della scatola nera.",
    }, { status: 500 });
  }
}
