import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * FORENSE PAGAMENTI PROPRIETARIO — sola lettura.
 *
 * PERCHE' ESISTE
 * 02/09/2026: incassando LUGLIO per un proprietario risultavano saldati anche
 * agosto e settembre. Il backup su disco e' fermo al 31/08 e non contiene i
 * movimenti odierni, quindi non era possibile capire cosa fosse successo senza
 * leggere i dati veri. Questa route li mette tutti in fila.
 *
 * NON SCRIVE NULLA.
 *
 * USO
 *   /api/debug/pagamenti-forense-v1?cronSecret=XXX&nome=ricci
 *   /api/debug/pagamenti-forense-v1?cronSecret=XXX&ownerId=ApiRBil7...
 *
 * COSA RESTITUISCE
 *   - proprietario: chi e', quante proprieta'
 *   - pagamenti: OGNI pagamento registrato, con mese/anno/importo/tipo/metodo,
 *     chi l'ha creato e quando. Ordinati per data di creazione.
 *   - sospetti: pagamenti dello stesso mese/anno con lo stesso importo
 *     (i doppioni sfuggiti alla guardia dei 60 secondi)
 *   - mesi: per ogni mese, quanto e' dovuto, quanto e' stato pagato, il saldo,
 *     il credito riportato dai mesi precedenti e lo stato risultante.
 *     E' qui che si vede se un mese risulta saldato per un pagamento suo
 *     oppure perche' coperto da un credito arrivato da prima.
 *   - audit: le voci di paymentAudit, cioe' cosa mostrava la pagina al momento
 *     del click e cosa diceva il motore nello stesso istante.
 */

function iso(t: any): string | null {
  try {
    if (!t) return null;
    if (typeof t?.toDate === "function") return t.toDate().toISOString();
    if (typeof t === "string") return t;
    if (typeof t?._seconds === "number") return new Date(t._seconds * 1000).toISOString();
    if (typeof t?.seconds === "number") return new Date(t.seconds * 1000).toISOString();
    return null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("cronSecret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const nome = (req.nextUrl.searchParams.get("nome") || "").toLowerCase().trim();
  let ownerId = req.nextUrl.searchParams.get("ownerId") || "";

  try {
    // ─── Individua il proprietario ────────────────────────────────────────
    let ownerData: any = null;
    if (!ownerId) {
      if (!nome) {
        return NextResponse.json({ error: "Serve ?nome= oppure ?ownerId=" }, { status: 400 });
      }
      const usersSnap = await adminDb.collection("users").where("role", "==", "PROPRIETARIO").get();
      const match = usersSnap.docs.filter((d) => {
        const u = d.data();
        const testo = `${u.name || ""} ${u.surname || ""} ${u.email || ""}`.toLowerCase();
        return testo.includes(nome);
      });
      if (match.length === 0) {
        return NextResponse.json({ error: `Nessun proprietario trovato per "${nome}"` }, { status: 404 });
      }
      if (match.length > 1) {
        return NextResponse.json({
          error: "Piu' proprietari corrispondono: specifica ?ownerId=",
          candidati: match.map((d) => ({ id: d.id, nome: `${d.data().name || ""} ${d.data().surname || ""}`.trim(), email: d.data().email })),
        }, { status: 400 });
      }
      ownerId = match[0].id;
      ownerData = match[0].data();
    } else {
      const snap = await adminDb.collection("users").doc(ownerId).get();
      if (!snap.exists) return NextResponse.json({ error: "ownerId inesistente" }, { status: 404 });
      ownerData = snap.data();
    }

    // ─── Pagamenti ────────────────────────────────────────────────────────
    const paySnap = await adminDb.collection("payments").where("proprietarioId", "==", ownerId).get();
    const pagamenti = paySnap.docs
      .map((d) => {
        const p = d.data();
        return {
          id: d.id,
          mese: `${p.year}-${String(p.month).padStart(2, "0")}`,
          importo: p.amount ?? null,
          tipo: p.type ?? null,
          metodo: p.method ?? null,
          note: p.note || null,
          isCreditTransfer: p.isCreditTransfer === true,
          creatoIl: iso(p.createdAt),
          creatoDa: p.createdBy ?? null,
        };
      })
      .sort((a, b) => String(a.creatoIl).localeCompare(String(b.creatoIl)));

    // ─── Doppioni sospetti: stesso mese + stesso importo ──────────────────
    const perChiave = new Map<string, typeof pagamenti>();
    pagamenti.forEach((p) => {
      const k = `${p.mese}|${Number(p.importo).toFixed(2)}`;
      if (!perChiave.has(k)) perChiave.set(k, []);
      perChiave.get(k)!.push(p);
    });
    const sospetti = Array.from(perChiave.entries())
      .filter(([, v]) => v.length > 1)
      .map(([k, v]) => ({
        chiave: k,
        quante: v.length,
        totaleDuplicato: Math.round(v.slice(1).reduce((s, p) => s + (p.importo || 0), 0) * 100) / 100,
        pagamenti: v,
      }));

    // ─── Situazione mese per mese (motore canonico) ───────────────────────
    const { computeOwnerDebt } = await import("~/lib/payments/computeOwnerDebt");
    const debt = await computeOwnerDebt(ownerId);
    const mesi = (debt?.debts || []).map((d: any) => ({
      mese: `${d.year}-${String(d.month).padStart(2, "0")}`,
      totaleServizi: d.totaleServizi ?? null,
      totalePagato: d.totalePagato ?? null,
      saldo: d.saldo ?? null,
      creditoPrecedente: d.creditoPrecedente ?? null,
      saldoConCredito: d.saldoConCredito ?? null,
      stato: d.stato ?? null,
      // Perche' questo mese risulta saldato?
      spiegazione:
        (d.saldoConCredito ?? 1) <= 0.01
          ? (d.totalePagato ?? 0) > 0
            ? "saldato da un pagamento registrato su questo mese"
            : (d.creditoPrecedente ?? 0) > 0.01
              ? "SALDATO DA CREDITO ARRIVATO DAI MESI PRECEDENTI (nessun pagamento suo)"
              : "nessun servizio da pagare"
          : "ancora da pagare",
    }));

    // ─── Scatola nera: cosa e' stato cliccato ─────────────────────────────
    let audit: any[] = [];
    try {
      const aSnap = await adminDb.collection("paymentAudit").where("proprietarioId", "==", ownerId).get();
      audit = aSnap.docs
        .map((d) => {
          const a = d.data();
          return {
            id: d.id,
            mese: `${a.year}-${String(a.month).padStart(2, "0")}`,
            quando: iso(a.timestamp) || iso(a.createdAt),
            pulsante: a.pulsante ?? null,
            importoRegistrato: a.importoRegistrato ?? null,
            mostratoDallaPagina: a.totaleDaIncassare_mostratoDallaPagina ?? null,
            giaPagatoPrima: a.giaPagatoPrima ?? null,
            totaleServizi_motore: a.totaleServizi_motore ?? null,
            saldoDopoPagamento_motore: a.saldoDopoPagamento_motore ?? null,
            metodo: a.method ?? null,
          };
        })
        .sort((a, b) => String(a.quando).localeCompare(String(b.quando)));
    } catch (e: any) {
      audit = [{ errore: `paymentAudit non leggibile: ${e?.message || e}` }];
    }

    const propsSnap = await adminDb.collection("properties").where("ownerId", "==", ownerId).get();

    return NextResponse.json({
      success: true,
      proprietario: {
        id: ownerId,
        nome: `${ownerData?.name || ""} ${ownerData?.surname || ""}`.trim(),
        email: ownerData?.email ?? null,
        proprieta: propsSnap.docs.map((d) => ({ id: d.id, nome: d.data().name, stato: d.data().status })),
      },
      RIEPILOGO: {
        pagamentiTotali: pagamenti.length,
        gruppiDuplicatiSospetti: sospetti.length,
        creditoTotaleAttuale: debt?.creditoTotale ?? null,
        debitoTotale: debt?.totalDebt ?? null,
        debitoTotaleNetto: debt?.totalDebtNet ?? null,
      },
      DUPLICATI_SOSPETTI: sospetti,
      MESI: mesi,
      PAGAMENTI: pagamenti,
      AUDIT_CLICK: audit,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || String(err), stack: process.env.NODE_ENV !== "production" ? err?.stack : undefined },
      { status: 500 }
    );
  }
}
