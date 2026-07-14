"use client";

/**
 * /dashboard/preventivi — Gestione preventivi + configurazione calcolatore
 * v1 — 08/07/2026
 *
 * Tab "Preventivi": pipeline lead (nuovo → ricontatto → trattativa → sopralluogo
 *   → convertito/perso), data ricontatto con evidenza "da richiamare oggi",
 *   note, motivo esito, riscarica PDF e reinvio email.
 * Tab "Calcolatore": TUTTI i parametri del motore editabili. Il salvataggio
 *   scrive su Firestore (config/preventivatore): dal preventivo successivo
 *   il motore usa i numeri nuovi, senza deploy. Simulatore live incluso.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { calcolaCasa, calcolaBnbV2, formatEuro } from "~/lib/quote/quoteEngine";
import type { EngineParams, DatiCasa, Taglio, TipoCucina, TipoEsterno, AreaComune, FrequenzaBnb } from "~/lib/quote/quoteEngine";

// ─────────────────────────── Tipi ───────────────────────────

interface Lead {
  id: string;
  tipo: "casa" | "case" | "bnb" | "hotel";
  zona: string;
  indirizzo?: string;
  cap: string;
  copertura: string;
  contatti: { nome: string; email: string; telefono: string };
  quote: {
    suMisura: boolean; min: number; max: number;
    biancheria: number; kit: number;
    scontoPercento?: number;
    unitaDettaglio?: { nome: string; min: number; max: number; suMisura: boolean }[] | null;
    camereDettaglio?: { persone: number; etichetta: string; prezzo: number }[] | null;
    rifacimentoGiornaliero?: number;
    areaComuneImporto?: number;
    areaComuneTipo?: string;
    passaggio?: { totale: number } | null;
  };
  datiStruttura?: Record<string, unknown>;
  stato: string;
  note: string;
  followUpAt: string | null;
  motivoEsito?: string;
  numeroPreventivo?: string;
  foto?: string[];
  createdAt: string | null;
  consensoNewsletter?: boolean;
}

type EngineCfg = Record<string, unknown>;

interface HistoryEntry { at: string | null; updatedBy: string; reset: boolean; prima: EngineCfg; dopo: EngineCfg }
interface Zona { cap: string; attivo: boolean; note: string }

// ─────────────────────────── Costanti UI ───────────────────────────

const STATI: { id: string; label: string; badge: string }[] = [
  { id: "nuovo", label: "Nuovo", badge: "bg-sky-100 text-sky-700" },
  { id: "da_ricontattare", label: "Da ricontattare", badge: "bg-amber-100 text-amber-700" },
  { id: "contattato", label: "Contattato", badge: "bg-indigo-100 text-indigo-700" },
  { id: "in_trattativa", label: "In trattativa", badge: "bg-violet-100 text-violet-700" },
  { id: "sopralluogo", label: "Sopralluogo fissato", badge: "bg-cyan-100 text-cyan-700" },
  { id: "convertito", label: "Accettato", badge: "bg-emerald-100 text-emerald-700" },
  { id: "perso", label: "Perso", badge: "bg-rose-100 text-rose-700" },
];
const statoInfo = (id: string) => STATI.find((s) => s.id === id) ?? STATI[0];

const TIPI: Record<string, { label: string; badge: string }> = {
  casa: { label: "Casa vacanze", badge: "bg-sky-50 text-sky-700 border border-sky-200" },
  case: { label: "Multi struttura", badge: "bg-violet-50 text-violet-700 border border-violet-200" },
  bnb: { label: "B&B", badge: "bg-amber-50 text-amber-700 border border-amber-200" },
  hotel: { label: "Hotel", badge: "bg-slate-100 text-slate-700 border border-slate-200" },
};

const oggiISO = () => new Date().toISOString().slice(0, 10);

/** Numero in formato wa.me: solo cifre, prefisso incluso; default Italia se manca. */
function waNumero(tel: string | undefined): string {
  let n = (tel || "").replace(/[^0-9]/g, "");
  if (!n) return "";
  if (n.startsWith("00")) n = n.slice(2);
  else if (!n.startsWith("39") && (n.length === 9 || n.length === 10)) n = "39" + n; // cellulare IT senza prefisso
  return n;
}
function waLink(tel: string | undefined, nome?: string, numeroPrev?: string): string {
  const n = waNumero(tel);
  if (!n) return "";
  const saluto = nome ? `Buongiorno ${nome.split(" ")[0]}` : "Buongiorno";
  const rif = numeroPrev ? ` in merito al preventivo N°${numeroPrev}` : " in merito alla sua richiesta di preventivo";
  const testo = encodeURIComponent(`${saluto}, la contatto da Puliziacasevacanze.it${rif}.`);
  return `https://wa.me/${n}?text=${testo}`;
}

// Icona WhatsApp (glyph ufficiale semplificato)
function IconaWhatsApp({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="currentColor" aria-hidden="true">
      <path d="M16.001 3C9.373 3 4 8.373 4 15c0 2.106.55 4.086 1.514 5.807L4 29l8.4-1.48A11.93 11.93 0 0016.001 27C22.628 27 28 21.627 28 15S22.628 3 16.001 3zm0 21.75c-1.86 0-3.6-.51-5.09-1.397l-.365-.216-4.985.878.888-4.86-.238-.377A9.7 9.7 0 016.25 15c0-5.385 4.366-9.75 9.751-9.75 5.384 0 9.749 4.365 9.749 9.75s-4.365 9.75-9.749 9.75zm5.355-7.29c-.293-.147-1.735-.856-2.003-.954-.269-.098-.464-.147-.66.147-.195.293-.756.954-.927 1.15-.171.195-.342.22-.635.073-.293-.147-1.238-.456-2.358-1.454-.872-.777-1.46-1.737-1.631-2.03-.171-.293-.018-.451.128-.598.132-.131.293-.342.44-.513.146-.171.195-.293.293-.489.098-.195.049-.366-.025-.513-.073-.147-.66-1.59-.904-2.178-.238-.572-.48-.494-.66-.503l-.562-.01c-.195 0-.513.073-.782.366-.269.293-1.025 1.002-1.025 2.444 0 1.441 1.05 2.834 1.196 3.03.146.195 2.065 3.153 5.004 4.42.699.302 1.244.482 1.669.617.701.223 1.339.192 1.843.116.562-.084 1.735-.709 1.98-1.394.244-.685.244-1.271.171-1.394-.073-.122-.269-.195-.562-.342z"/>
    </svg>
  );
}

function fmtData(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" }) +
    " " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function quoteLabel(l: Lead): string {
  if (l.tipo === "hotel") return "Su sopralluogo";
  if (l.quote?.suMisura) return "SU MISURA";
  if (l.tipo === "bnb" && l.quote?.camereDettaglio?.length) {
    return `${l.quote.camereDettaglio.length} camere · da €${Math.min(...l.quote.camereDettaglio.map((c) => c.prezzo))}/cam`;
  }
  if (l.tipo === "case" && l.quote?.unitaDettaglio?.length) {
    return `${l.quote.unitaDettaglio.length} case · per struttura`;
  }
  return `€${l.quote?.min ?? "-"} - €${l.quote?.max ?? "-"}`;
}

// ─────────────────────────── Pagina ───────────────────────────

export default function PreventiviPage() {
  const [tab, setTab] = useState<"leads" | "config">("leads");

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Hero in stile gestionale */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-600 p-5 md:p-6 mb-5 shadow-lg">
        <div className="absolute -right-8 -top-8 w-40 h-40 bg-white/10 rounded-full" />
        <div className="absolute -right-16 top-12 w-32 h-32 bg-white/5 rounded-full" />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center text-white shadow-md">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Preventivi</h1>
              <p className="text-sm text-white/80">Lead dal preventivatore e configurazione del calcolatore</p>
            </div>
          </div>
          <div className="flex bg-white/15 backdrop-blur rounded-xl p-1 w-fit">
            <button
              onClick={() => setTab("leads")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === "leads" ? "bg-white text-blue-700 shadow" : "text-white/90 hover:bg-white/10"}`}
            >
              Preventivi
            </button>
            <button
              onClick={() => setTab("config")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === "config" ? "bg-white text-blue-700 shadow" : "text-white/90 hover:bg-white/10"}`}
            >
              Calcolatore
            </button>
          </div>
        </div>
      </div>

      {tab === "leads" ? <TabLeads /> : <TabConfig />}
    </div>
  );
}

// ═══════════════════════════ TAB PREVENTIVI ═══════════════════════════

function TabLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState("");
  const [filtroStato, setFiltroStato] = useState<string>("tutti");
  const [filtroTipo, setFiltroTipo] = useState<string>("tutti");
  const [search, setSearch] = useState("");
  const [espanso, setEspanso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [inviando, setInviando] = useState<string | null>(null);
  const noteDraft = useRef<Record<string, string>>({});

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore("");
    try {
      const res = await fetch("/api/leads");
      const data = await res.json();
      if (!data.ok) throw new Error(data.errore || "Errore caricamento");
      setLeads(data.leads as Lead[]);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore di rete");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carica(); }, [carica]);

  const patch = useCallback(async (id: string, campi: Record<string, unknown>) => {
    setSalvando(id);
    // ottimistico
    setLeads((prev) => prev.map((l) => (l.id === id ? ({ ...l, ...campi } as Lead) : l)));
    try {
      const res = await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...campi }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.errore);
    } catch (e) {
      alert("Salvataggio fallito: " + (e instanceof Error ? e.message : "errore"));
      carica();
    } finally {
      setSalvando(null);
    }
  }, [carica]);

  const reinvia = useCallback(async (l: Lead) => {
    if (!confirm(`Reinviare il preventivo ${l.numeroPreventivo || ""} a ${l.contatti.email}?`)) return;
    setInviando(l.id);
    try {
      const res = await fetch("/api/leads/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: l.id }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.errore);
      alert("Email reinviata ✓");
    } catch (e) {
      alert("Reinvio fallito: " + (e instanceof Error ? e.message : "errore"));
    } finally {
      setInviando(null);
    }
  }, []);

  // ── statistiche testata ──
  const stats = useMemo(() => {
    const now = new Date();
    const mese = leads.filter((l) => {
      if (!l.createdAt) return false;
      const d = new Date(l.createdAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    const chiusi = leads.filter((l) => l.stato === "convertito" || l.stato === "perso");
    const convertiti = chiusi.filter((l) => l.stato === "convertito").length;
    const tasso = chiusi.length ? Math.round((convertiti / chiusi.length) * 100) : null;
    const conPrezzo = leads.filter((l) => !l.quote?.suMisura && l.quote?.min > 0);
    const medio = conPrezzo.length
      ? Math.round(conPrezzo.reduce((a, l) => a + (l.quote.min + l.quote.max) / 2, 0) / conPrezzo.length)
      : null;
    return { mese, tasso, convertiti, medio, totale: leads.length };
  }, [leads]);

  const daRichiamare = useMemo(() =>
    leads.filter((l) =>
      l.followUpAt && l.followUpAt <= oggiISO() &&
      l.stato !== "convertito" && l.stato !== "perso"
    ), [leads]);

  const filtrati = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (filtroStato !== "tutti" && l.stato !== filtroStato) return false;
      if (filtroTipo !== "tutti" && l.tipo !== filtroTipo) return false;
      if (q) {
        const blob = `${l.contatti?.nome} ${l.contatti?.email} ${l.contatti?.telefono} ${l.zona} ${l.cap} ${l.numeroPreventivo || ""}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [leads, filtroStato, filtroTipo, search]);

  const contaStato = useCallback((id: string) => leads.filter((l) => l.stato === id).length, [leads]);

  return (
    <div className="space-y-4">
      {/* Statistiche */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Preventivi questo mese" value={String(stats.mese)} accent="from-sky-500 to-blue-600" />
        <StatCard label="Totale lead" value={String(stats.totale)} accent="from-slate-500 to-slate-600" />
        <StatCard label="Tasso di accettazione" value={stats.tasso !== null ? stats.tasso + "%" : "—"} accent="from-emerald-500 to-teal-600" />
        <StatCard label="Valore medio" value={stats.medio !== null ? "€" + stats.medio : "—"} accent="from-violet-500 to-purple-600" />
      </div>

      {/* Da richiamare oggi */}
      {daRichiamare.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <div className="font-semibold text-amber-800 mb-2">📞 Da richiamare oggi ({daRichiamare.length})</div>
          <div className="flex flex-wrap gap-2">
            {daRichiamare.map((l) => (
              <div key={l.id} className="inline-flex items-center gap-1 bg-white border border-amber-300 rounded-lg overflow-hidden">
                <button
                  onClick={() => { setFiltroStato("tutti"); setSearch(l.contatti.nome); setEspanso(l.id); }}
                  className="px-3 py-1.5 text-sm text-amber-900 hover:bg-amber-100 transition-colors"
                >
                  {l.contatti.nome} · {l.contatti.telefono}
                </button>
                {waNumero(l.contatti?.telefono) && (
                  <a
                    href={waLink(l.contatti?.telefono, l.contatti?.nome, l.numeroPreventivo)}
                    target="_blank" rel="noreferrer" title="Scrivi su WhatsApp"
                    className="flex items-center justify-center w-8 h-8 bg-gradient-to-r from-emerald-500 to-green-600 text-white hover:from-emerald-600 hover:to-green-700 transition-all"
                  >
                    <IconaWhatsApp className="w-4 h-4" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtri */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 space-y-3">
        <div className="flex flex-wrap gap-2">
          <FiltroPill attivo={filtroStato === "tutti"} onClick={() => setFiltroStato("tutti")} label={`Tutti (${leads.length})`} />
          {STATI.map((s) => (
            <FiltroPill key={s.id} attivo={filtroStato === s.id} onClick={() => setFiltroStato(s.id)} label={`${s.label} (${contaStato(s.id)})`} />
          ))}
        </div>
        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" /></svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca nome, telefono, email, zona, n° preventivo…"
              className="w-full pl-9 pr-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 transition-all"
            />
          </div>
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-sky-500 transition-all">
            <option value="tutti">Tutti i tipi</option>
            <option value="casa">Casa vacanze</option>
            <option value="case">Multi struttura</option>
            <option value="bnb">B&B</option>
            <option value="hotel">Hotel</option>
          </select>
          <button onClick={carica} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-slate-600 to-slate-700 text-white hover:from-slate-700 hover:to-slate-800 shadow-sm transition-all">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            Aggiorna
          </button>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="text-center py-16 text-slate-400">Caricamento…</div>
      ) : errore ? (
        <div className="text-center py-16 text-rose-500">{errore}</div>
      ) : filtrati.length === 0 ? (
        <div className="text-center py-16 text-slate-400">Nessun preventivo trovato</div>
      ) : (
        <div className="space-y-3">
          {filtrati.map((l) => (
            <LeadCard
              key={l.id}
              lead={l}
              espanso={espanso === l.id}
              onToggle={() => setEspanso(espanso === l.id ? null : l.id)}
              onPatch={(campi) => patch(l.id, campi)}
              onReinvia={() => reinvia(l)}
              salvando={salvando === l.id}
              inviando={inviando === l.id}
              noteDraft={noteDraft}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="relative bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${accent}`} />
      <div className={`text-2xl font-bold bg-gradient-to-r ${accent} bg-clip-text text-transparent`}>{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}

function FiltroPill({ attivo, onClick, label }: { attivo: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
        attivo ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {label}
    </button>
  );
}

// ─────────────────────────── Card lead ───────────────────────────

function LeadCard({ lead: l, espanso, onToggle, onPatch, onReinvia, salvando, inviando, noteDraft }: {
  lead: Lead;
  espanso: boolean;
  onToggle: () => void;
  onPatch: (campi: Record<string, unknown>) => void;
  onReinvia: () => void;
  salvando: boolean;
  inviando: boolean;
  noteDraft: React.MutableRefObject<Record<string, string>>;
}) {
  const info = statoInfo(l.stato);
  const tipo = TIPI[l.tipo] ?? TIPI.casa;
  const scaduto = l.followUpAt && l.followUpAt <= oggiISO() && l.stato !== "convertito" && l.stato !== "perso";
  const [note, setNote] = useState(noteDraft.current[l.id] ?? l.note ?? "");
  const [motivo, setMotivo] = useState(l.motivoEsito ?? "");

  return (
    <div className={`bg-white rounded-2xl border p-4 shadow-sm hover:shadow-md transition-all ${scaduto ? "border-amber-300 ring-1 ring-amber-200" : "border-slate-200 hover:border-slate-300"}`}>
      {/* riga principale */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <button onClick={onToggle} className="flex-1 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-800">{l.contatti?.nome || "—"}</span>
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${tipo.badge}`}>{tipo.label}</span>
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${info.badge}`}>{info.label}</span>
            {l.copertura === "in_valutazione" && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-50 text-orange-600 border border-orange-200">Zona da valutare</span>
            )}
            {scaduto && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700">📞 Richiama</span>}
          </div>
          <div className="text-sm text-slate-500 mt-1">
            {l.zona || "—"} {l.cap ? `(${l.cap})` : ""} · <span className="font-medium text-slate-700">{quoteLabel(l)}</span>
            {l.numeroPreventivo ? ` · N°${l.numeroPreventivo}` : ""} · {fmtData(l.createdAt)}
          </div>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`tel:${l.contatti?.telefono}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
            {l.contatti?.telefono}
          </a>
          {waNumero(l.contatti?.telefono) && (
            <a
              href={waLink(l.contatti?.telefono, l.contatti?.nome, l.numeroPreventivo)}
              target="_blank"
              rel="noreferrer"
              title="Scrivi su WhatsApp"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white text-sm font-semibold shadow-sm transition-all"
            >
              <IconaWhatsApp className="w-4 h-4" />
              WhatsApp
            </a>
          )}
          <select
            value={l.stato}
            disabled={salvando}
            onChange={(e) => onPatch({ stato: e.target.value })}
            className="px-2.5 py-1.5 border-2 border-slate-200 rounded-lg text-sm bg-white font-medium focus:outline-none focus:border-sky-500 transition-all"
          >
            {STATI.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <input
            type="date"
            value={l.followUpAt ?? ""}
            disabled={salvando}
            onChange={(e) => onPatch({ followUpAt: e.target.value || null })}
            title="Data ricontatto"
            className="px-2.5 py-1.5 border-2 border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:border-sky-500 transition-all"
          />
        </div>
      </div>

      {/* dettaglio */}
      {espanso && (
        <div className="mt-4 pt-4 border-t border-slate-100 grid md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="text-xs font-semibold text-slate-400 uppercase">Contatti</div>
            <div className="text-sm text-slate-700">
              <a className="text-sky-600 hover:underline" href={`mailto:${l.contatti?.email}`}>{l.contatti?.email}</a>
              {l.consensoNewsletter ? <span className="ml-2 text-[11px] text-emerald-600">✓ newsletter</span> : null}
            </div>

            <IndirizzoLead lead={l} />

            <div className="text-xs font-semibold text-slate-400 uppercase mt-3">Preventivo</div>
            <DettaglioQuote lead={l} />

            <FotoLead lead={l} />
          </div>

          <div className="space-y-3">
            <div className="text-xs font-semibold text-slate-400 uppercase">Note</div>
            <textarea
              value={note}
              onChange={(e) => { setNote(e.target.value); noteDraft.current[l.id] = e.target.value; }}
              rows={3}
              placeholder="Note sul lead, esito telefonate…"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
            />
            {(l.stato === "perso" || l.stato === "convertito") && (
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder={l.stato === "perso" ? "Motivo (prezzo / zona / tempi / altro)…" : "Note conversione…"}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
            )}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => onPatch({ note, motivoEsito: motivo })}
                disabled={salvando}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-sky-500 to-blue-600 shadow hover:shadow-md transition-all disabled:opacity-50"
              >
                {salvando ? "Salvo…" : "💾 Salva note"}
              </button>
              <a
                href={`/api/leads/pdf?id=${l.id}`}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
              >
                📄 Scarica PDF
              </a>
              <button
                onClick={onReinvia}
                disabled={inviando}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors disabled:opacity-50"
              >
                {inviando ? "Invio…" : "✉️ Reinvia email"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IndirizzoLead({ lead: l }: { lead: Lead }) {
  const maps = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  const unita = (l.datiStruttura?.unita as { nome?: string; zona?: string; indirizzo?: string; cap?: string }[] | undefined);

  if (l.tipo === "case" && Array.isArray(unita) && unita.some((u) => u?.indirizzo)) {
    return (
      <>
        <div className="text-xs font-semibold text-slate-400 uppercase mt-3">Indirizzi</div>
        <div className="space-y-1.5 mt-1">
          {unita.map((u, i) => {
            const full = [u?.indirizzo, u?.cap, u?.zona].filter(Boolean).join(", ");
            if (!full) return null;
            return (
              <div key={i} className="text-sm">
                <span className="font-semibold text-slate-600">{u?.nome?.trim() || `Unità ${i + 1}`}:</span>{" "}
                <a href={maps(full)} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline">{u?.indirizzo}{u?.cap ? ` — ${u.cap}` : ""}</a>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  if (l.indirizzo) {
    const full = [l.indirizzo, l.cap, l.zona].filter(Boolean).join(", ");
    return (
      <>
        <div className="text-xs font-semibold text-slate-400 uppercase mt-3">Indirizzo</div>
        <a href={maps(full)} target="_blank" rel="noreferrer" className="text-sm text-sky-600 hover:underline inline-flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          {l.indirizzo}{l.cap ? ` — ${l.cap}` : ""}
        </a>
      </>
    );
  }
  return null;
}

function FotoLead({ lead: l }: { lead: Lead }) {
  // Multi-struttura: le foto sono salvate per appartamento in datiStruttura.unita[i].foto
  const unita = (l.datiStruttura?.unita as { nome?: string; foto?: string[] }[] | undefined);
  const perUnita =
    l.tipo === "case" && Array.isArray(unita)
      ? unita
          .map((u, i) => ({ nome: u?.nome?.trim() || `Unità ${i + 1}`, foto: Array.isArray(u?.foto) ? u.foto : [] }))
          .filter((u) => u.foto.length > 0)
      : [];

  if (perUnita.length > 0) {
    return (
      <>
        <div className="text-xs font-semibold text-slate-400 uppercase mt-3">Foto per appartamento</div>
        <div className="space-y-3 mt-1">
          {perUnita.map((u, i) => (
            <div key={i}>
              <div className="text-[13px] font-semibold text-slate-600 mb-1">
                {u.nome} <span className="text-slate-400 font-normal">({u.foto.length})</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {u.foto.map((f, j) => (
                  <a key={j} href={f} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f} alt="" className="w-16 h-16 object-cover rounded-lg border border-slate-200" />
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (l.foto && l.foto.length > 0) {
    return (
      <>
        <div className="text-xs font-semibold text-slate-400 uppercase mt-3">Foto ({l.foto.length})</div>
        <div className="flex gap-2 flex-wrap">
          {l.foto.map((f, i) => (
            <a key={i} href={f} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f} alt="" className="w-16 h-16 object-cover rounded-lg border border-slate-200" />
            </a>
          ))}
        </div>
      </>
    );
  }
  return null;
}

function DettaglioQuote({ lead: l }: { lead: Lead }) {
  const q = l.quote;
  if (!q) return <div className="text-sm text-slate-500">—</div>;
  return (
    <div className="text-sm text-slate-700 space-y-1">
      {l.tipo === "hotel" ? (
        <div>Preventivo su sopralluogo</div>
      ) : q.suMisura ? (
        <div className="font-semibold">SU MISURA (fuori parametri)</div>
      ) : (
        <div>Pulizia: <b>€{q.min} - €{q.max}</b>{q.scontoPercento ? ` (sconto multi -${q.scontoPercento}% applicato)` : ""}</div>
      )}
      {q.unitaDettaglio?.map((u, i) => (
        <div key={i} className="pl-3 text-slate-600">· {u.nome}: {u.suMisura ? "su misura" : `€${u.min}-${u.max}`}</div>
      ))}
      {q.camereDettaglio?.map((c, i) => (
        <div key={i} className="pl-3 text-slate-600">· {c.etichetta} ({c.persone}p): €{c.prezzo}/checkout</div>
      ))}
      {q.rifacimentoGiornaliero ? <div>Riassetto giornaliero: €{q.rifacimentoGiornaliero}/uscita</div> : null}
      {q.areaComuneImporto ? <div>Aree comuni ({q.areaComuneTipo}): €{q.areaComuneImporto}</div> : null}
      {q.biancheria ? <div>Biancheria a cambio: €{q.biancheria.toFixed(2)}</div> : null}
      {q.kit ? <div>Kit cortesia: €{q.kit.toFixed(2)}</div> : null}
      {q.passaggio?.totale ? <div>Passaggio in soggiorno: €{q.passaggio.totale}</div> : null}
    </div>
  );
}

// ═══════════════════════════ TAB CALCOLATORE ═══════════════════════════

/** Etichette leggibili per ogni sezione/campo del motore. */
const SEZIONI: { key: string; titolo: string; nota?: string; icona?: string; campi: { path: string[]; label: string; unit: string; step?: number; help?: string }[] }[] = [
  {
    key: "basi", titolo: "Prezzo base per taglio", icona: "home",
    nota: "Il punto di partenza del calcolo. In base ai mq, l'appartamento viene classificato in un taglio e parte da questo prezzo.",
    campi: [
      { path: ["basi", "mono"], label: "Monolocale", unit: "€", help: "Prezzo di partenza per un monolocale. Es: se metti 40, un monolocale standard parte da 40€ e poi si aggiungono eventuali extra (letti in più, bagni, esterni)." },
      { path: ["basi", "bilo"], label: "Bilocale", unit: "€", help: "Prezzo di partenza per un bilocale (una camera + soggiorno). Es: 45€ è la base, a cui si sommano i correttivi." },
      { path: ["basi", "trilo"], label: "Trilocale", unit: "€", help: "Prezzo di partenza per un trilocale (due camere + soggiorno). Es: 52€." },
      { path: ["basi", "quadri"], label: "Quadrilocale", unit: "€", help: "Prezzo di partenza per un quadrilocale (tre o più camere). Es: 60€." },
      { path: ["basi", "grande"], label: "Casa grande (4+ camere)", unit: "€", help: "Prezzo di partenza per una casa grande, oltre il quadrilocale. Es: 60€, poi i mq oltre soglia fanno crescere il prezzo." },
    ],
  },
  {
    key: "lettiInclusi", titolo: "Letti inclusi nel prezzo base", icona: "bed",
    nota: "Quanti posti letto sono già compresi nel prezzo base di ogni taglio. Ogni letto in più fa scattare il correttivo \"Letto extra\".",
    campi: [
      { path: ["lettiInclusi", "mono"], label: "Monolocale", unit: "letti", step: 1, help: "Letti già inclusi nel prezzo base di un monolocale. Es: se metti 1, il 2° letto viene conteggiato come extra e costa in più." },
      { path: ["lettiInclusi", "bilo"], label: "Bilocale", unit: "letti", step: 1, help: "Letti inclusi nel bilocale. Es: 2 letti inclusi; dal 3° si paga il correttivo letto extra." },
      { path: ["lettiInclusi", "trilo"], label: "Trilocale", unit: "letti", step: 1, help: "Letti inclusi nel trilocale. Es: 3. Dal 4° scatta l'extra." },
      { path: ["lettiInclusi", "quadri"], label: "Quadrilocale", unit: "letti", step: 1, help: "Letti inclusi nel quadrilocale. Es: 4. Dal 5° si paga l'extra." },
      { path: ["lettiInclusi", "grande"], label: "Casa grande", unit: "letti", step: 1, help: "Letti inclusi nella casa grande. Es: 4." },
    ],
  },
  {
    key: "corrP", titolo: "Correttivi — appartamenti piccoli (mono/bilo)", icona: "plus",
    nota: "Quanto si aggiunge al prezzo base per ogni caratteristica extra, negli appartamenti piccoli (mono e bilocali).",
    campi: [
      { path: ["corr", "piccolo", "letto"], label: "Letto extra", unit: "€", help: "Costo per ogni letto oltre quelli inclusi. Es: 3€ a letto. Un bilocale con 3 letti (2 inclusi) paga +3€." },
      { path: ["corr", "piccolo", "bagno"], label: "Bagno extra", unit: "€", help: "Costo per ogni bagno oltre il primo. Es: 7€. Un bilocale con 2 bagni paga +7€." },
      { path: ["corr", "piccolo", "cucinaSep"], label: "Cucina separata", unit: "€", help: "Supplemento se la cucina è una stanza separata (più superficie da pulire). Es: 4€." },
      { path: ["corr", "piccolo", "cucinaAbit"], label: "Cucina abitabile", unit: "€", help: "Supplemento per cucina abitabile (con tavolo da pranzo). Es: 3€." },
      { path: ["corr", "piccolo", "balcone"], label: "Balcone", unit: "€", help: "Supplemento se c'è un balcone da pulire. Es: 2€." },
      { path: ["corr", "piccolo", "terrazzo"], label: "Terrazzo", unit: "€", help: "Supplemento per un terrazzo. Es: 4€." },
      { path: ["corr", "piccolo", "terrazzoGrande"], label: "Terrazzo grande", unit: "€", help: "Supplemento per un terrazzo grande (oltre 20mq). Es: 6€." },
    ],
  },
  {
    key: "corrG", titolo: "Correttivi — appartamenti grandi (trilo+)", icona: "plus",
    nota: "Stessi correttivi, ma applicati agli appartamenti grandi (trilocali e quadrilocali). Di solito un po' più alti, perché le superfici sono maggiori.",
    campi: [
      { path: ["corr", "grande", "letto"], label: "Letto extra", unit: "€", help: "Costo per ogni letto oltre quelli inclusi, nei grandi. Es: 4€ a letto." },
      { path: ["corr", "grande", "bagno"], label: "Bagno extra", unit: "€", help: "Costo per ogni bagno oltre il primo, nei grandi. Es: 8€." },
      { path: ["corr", "grande", "cucinaSep"], label: "Cucina separata", unit: "€", help: "Supplemento cucina separata nei grandi. Es: 5€." },
      { path: ["corr", "grande", "cucinaAbit"], label: "Cucina abitabile", unit: "€", help: "Supplemento cucina abitabile nei grandi. Es: 4€." },
      { path: ["corr", "grande", "balcone"], label: "Balcone", unit: "€", help: "Supplemento balcone nei grandi. Es: 3€." },
      { path: ["corr", "grande", "terrazzo"], label: "Terrazzo", unit: "€", help: "Supplemento terrazzo nei grandi. Es: 5€." },
      { path: ["corr", "grande", "terrazzoGrande"], label: "Terrazzo grande", unit: "€", help: "Supplemento terrazzo grande nei grandi. Es: 7€." },
    ],
  },
  {
    key: "biancheria", titolo: "Biancheria (a cambio)", icona: "linen",
    nota: "Prezzi del noleggio biancheria, conteggiati a ogni cambio. Vengono mostrati a parte, non sono inclusi nel prezzo di pulizia.",
    campi: [
      { path: ["biancheria", "matrimoniale"], label: "Set matrimoniale", unit: "€", step: 0.1, help: "Prezzo di un set completo per letto matrimoniale (lenzuola + federe). Es: 8€." },
      { path: ["biancheria", "singolo"], label: "Set singolo", unit: "€", step: 0.1, help: "Prezzo di un set per letto singolo. Es: 6€." },
      { path: ["biancheria", "setOspite"], label: "Set bagno per ospite", unit: "€", step: 0.1, help: "Asciugamani per ogni ospite (viso + corpo). Es: 4€ a persona." },
      { path: ["biancheria", "tappetino"], label: "Tappetino (per bagno)", unit: "€", step: 0.1, help: "Tappetino da bagno, conteggiato per ogni bagno. Es: 1€." },
      { path: ["biancheria", "canavaccio"], label: "Canovaccio", unit: "€", step: 0.1, help: "Canovaccio da cucina. Es: 1€." },
    ],
  },
  {
    key: "kit", titolo: "Kit di cortesia", icona: "kit",
    nota: "Prezzo del kit cortesia per ospite (saponcini, cuffia, ecc.), se richiesto. Mostrato come opzione a parte.",
    campi: [{ path: ["kitCortesia"], label: "Kit per ospite", unit: "€", step: 0.01, help: "Costo di un kit cortesia completo per un ospite. Es: 2,50€ a persona." }],
  },
  {
    key: "bnb", titolo: "B&B / Affittacamere", icona: "bnb",
    nota: "Prezzi specifici per B&B e affittacamere, calcolati a camera invece che ad appartamento.",
    campi: [
      { path: ["bnb", "singola"], label: "Camera singola (1p)", unit: "€", help: "Prezzo pulizia di una camera singola. Es: 22€." },
      { path: ["bnb", "doppia"], label: "Camera doppia (2p)", unit: "€", help: "Prezzo pulizia di una camera doppia. Es: 28€." },
      { path: ["bnb", "personaExtra"], label: "Per persona oltre la 2ª", unit: "€", help: "Aggiunta per ogni ospite oltre il secondo nella stessa camera (es. tripla). Es: +6€ a persona." },
      { path: ["bnb", "rifacimentoLetto"], label: "Rifacimento letto (giornaliero)", unit: "€", help: "Costo del solo rifacimento letto quando il servizio è giornaliero. Es: 5€." },
      { path: ["bnb", "uscita"], label: "Uscita (riassetto giornaliero)", unit: "€", help: "Costo fisso di uscita per il riassetto giornaliero della camera. Es: 10€." },
    ],
  },
  {
    key: "aree", titolo: "Aree comuni", icona: "sofa",
    nota: "Come si calcola la pulizia degli spazi comuni (ingressi, saloni) nei B&B e nelle strutture con più camere.",
    campi: [
      { path: ["areaComune", "sogliaMq"], label: "Mq inclusi nella base", unit: "mq", step: 1, help: "Fino a questi mq, l'area comune è coperta dal prezzo base. Es: 20mq inclusi; oltre si paga al mq." },
      { path: ["areaComune", "inLocoBase"], label: "In loco — base", unit: "€", help: "Prezzo base per pulire le aree comuni quando l'operatore è già lì per le camere. Es: 15€." },
      { path: ["areaComune", "inLocoMqExtra"], label: "In loco — €/mq extra", unit: "€", step: 0.1, help: "Costo per ogni mq oltre la soglia, quando si è già in loco. Es: 0,5€/mq. Un salone di 30mq (10 oltre soglia) = +5€." },
      { path: ["areaComune", "dedicataBase"], label: "Uscita dedicata — base", unit: "€", help: "Prezzo base se serve un'uscita apposta solo per le aree comuni (l'operatore va lì solo per quello). Es: 25€." },
      { path: ["areaComune", "dedicataMqExtra"], label: "Uscita dedicata — €/mq extra", unit: "€", step: 0.1, help: "Costo al mq oltre soglia, per l'uscita dedicata. Es: 0,7€/mq." },
    ],
  },
  {
    key: "sconto", titolo: "Sconto multi-struttura", icona: "percent",
    nota: "Sconto automatico quando un cliente affida più case insieme.",
    campi: [
      { path: ["scontoMultiUnita", "daUnita"], label: "A partire da (n° case)", unit: "case", step: 1, help: "Da quante case in su scatta lo sconto. Es: 2 → chi ne affida 2 o più riceve lo sconto." },
      { path: ["scontoMultiUnita", "percento"], label: "Sconto", unit: "%", step: 1, help: "Percentuale di sconto applicata a ogni casa. Es: 5% su tutte le strutture." },
    ],
  },
  {
    key: "mq", titolo: "Metri quadri nel prezzo", icona: "ruler",
    nota: "Ogni taglio include un certo numero di mq nel prezzo base. I mq OLTRE la soglia si pagano al prezzo al mq. È questo che fa costare di più un trilocale da 100mq rispetto a uno da 60mq.",
    campi: [
      { path: ["mqInclusi", "mono"], label: "Mq inclusi — Monolocale", unit: "mq", step: 5, help: "Fino a questi mq il monolocale costa solo il prezzo base. Es: 40mq. Un mono da 50mq paga 10mq extra." },
      { path: ["mqInclusi", "bilo"], label: "Mq inclusi — Bilocale", unit: "mq", step: 5, help: "Es: 55mq inclusi nel bilocale." },
      { path: ["mqInclusi", "trilo"], label: "Mq inclusi — Trilocale", unit: "mq", step: 5, help: "Es: 75mq inclusi nel trilocale. Un trilo da 100mq paga 25mq extra." },
      { path: ["mqInclusi", "quadri"], label: "Mq inclusi — Quadrilocale", unit: "mq", step: 5, help: "Es: 100mq inclusi nel quadrilocale." },
      { path: ["mqInclusi", "grande"], label: "Mq inclusi — Casa grande", unit: "mq", step: 5, help: "Es: 120mq inclusi nella casa grande." },
      { path: ["euroMq"], label: "Prezzo al mq extra", unit: "€", step: 0.05, help: "Quanto costa ogni mq oltre la soglia del taglio. Es: 0,30€/mq → 25mq extra = +7,50€." },
      { path: ["mqMax"], label: "MQ massimi (oltre: su misura)", unit: "mq", step: 10, help: "Sopra questi mq il calcolo automatico si ferma: lead salvato e email \"ti contattiamo\". Es: 400mq." },
    ],
  },
  {
    key: "giardino", titolo: "Giardino", icona: "sofa",
    nota: "Supplemento a fasce quando la casa ha un giardino di cui prenderci cura (step Spazi esterni).",
    campi: [
      { path: ["giardino", "piccoloMaxMq"], label: "Piccolo fino a", unit: "mq", step: 5, help: "Fino a questi mq il giardino è in fascia \"piccolo\". Es: 20mq." },
      { path: ["giardino", "medioMaxMq"], label: "Medio fino a", unit: "mq", step: 5, help: "Fino a questi mq è fascia \"medio\"; oltre è \"grande\". Es: 60mq." },
      { path: ["giardino", "piccolo"], label: "Supplemento piccolo", unit: "€", help: "Es: 15€ per un giardino fino a 20mq." },
      { path: ["giardino", "medio"], label: "Supplemento medio", unit: "€", help: "Es: 25€ per un giardino 20–60mq." },
      { path: ["giardino", "grande"], label: "Supplemento grande", unit: "€", help: "Es: 50€ oltre i 60mq." },
    ],
  },
];


// ─────────────────────── Simulatore prezzi (client, zero API) ───────────────────────
// Riproduce le scelte del wizard e calcola col motore PURO importato qui:
// nessuna richiesta, nessun lead, nessuna email. Usa i parametri in editing (cfg),
// quindi mostra i prezzi come sarebbero DOPO il salvataggio.

const SIM_TAGLI: { v: Taglio; t: string }[] = [
  { v: "mono", t: "Monolocale" }, { v: "bilo", t: "Bilocale" }, { v: "trilo", t: "Trilocale" },
  { v: "quadri", t: "Quadrilocale" }, { v: "grande", t: "Casa grande" }, { v: "villa", t: "Villa" },
];
const SIM_CUCINE: { v: TipoCucina; t: string }[] = [
  { v: "angolo", t: "Angolo cottura" }, { v: "sep", t: "Cucina separata" }, { v: "abit", t: "Cucina abitabile" },
];
const SIM_ESTERNI: { v: TipoEsterno; t: string }[] = [
  { v: "no", t: "Nessuno" }, { v: "balcone", t: "Balcone" }, { v: "terrazzo", t: "Terrazzo" },
  { v: "terrazzoGrande", t: "Grande terrazzo" }, { v: "giardino", t: "Giardino" },
];

function SimNum({ label, v, set, min = 0, max = 20 }: { label: string; v: number; set: (n: number) => void; min?: number; max?: number }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
      <span>{label}</span>
      <input type="number" value={v} min={min} max={max}
        onChange={(e) => set(Math.max(min, Math.min(max, parseInt(e.target.value) || min)))}
        className="w-16 px-2 py-1 rounded-lg bg-white/10 border border-white/10 text-white text-right text-xs" />
    </label>
  );
}

function SimulatorePrezzi({ cfg }: { cfg: EngineParams | null }) {
  const [modo, setModo] = useState<"casa" | "bnb">("casa");
  // casa
  const [taglio, setTaglio] = useState<Taglio>("bilo");
  const [mq, setMq] = useState(55);
  const [matr, setMatr] = useState(1);
  const [sing, setSing] = useState(1);
  const [div, setDiv] = useState(0);
  const [bagni, setBagni] = useState(1);
  const [cucina, setCucina] = useState<TipoCucina>("angolo");
  const [esterno, setEsterno] = useState<TipoEsterno>("no");
  const [giardinoMq, setGiardinoMq] = useState(30);
  const [ospiti, setOspiti] = useState(4);
  const [bianch, setBianch] = useState(false);
  const [kit, setKit] = useState(false);
  const [nCase, setNCase] = useState(1);
  // bnb
  const [camere, setCamere] = useState<number[]>([2, 2]);
  const [frequenza, setFrequenza] = useState<FrequenzaBnb>("checkout");
  const [area, setArea] = useState<AreaComune>("no");
  const [areaMq, setAreaMq] = useState(25);
  const [kitBnb, setKitBnb] = useState(false);

  const casa = useMemo(() => {
    if (!cfg) return null;
    const d: DatiCasa = {
      taglio, mq, matrimoniali: matr, singoli: sing, divani: div, bagni, cucina, esterno,
      giardinoMq: esterno === "giardino" ? giardinoMq : 0,
      vuoleBiancheria: bianch, vuoleKit: kit, ospiti,
    };
    const r = calcolaCasa(d, cfg);
    // sconto multi-casa applicato al prezzo della singola casa (stessa logica del wizard)
    const sc = nCase >= (cfg.scontoMultiUnita?.daUnita ?? 2) ? (cfg.scontoMultiUnita?.percento ?? 0) : 0;
    if (r.suMisura || sc === 0) return { ...r, sconto: sc };
    const f = 1 - sc / 100;
    return { ...r, min: Math.floor((r.puntuale * f) / 5) * 5, max: Math.round((r.puntuale * f * 1.15) / 5) * 5, sconto: sc };
  }, [cfg, taglio, mq, matr, sing, div, bagni, cucina, esterno, giardinoMq, ospiti, bianch, kit, nCase]);

  const bnb = useMemo(() => {
    if (!cfg) return null;
    return calcolaBnbV2({
      camere: camere.map((p) => ({ persone: p })),
      frequenza, areaComune: area, areaComuneMq: area === "no" ? 0 : areaMq, vuoleKit: kitBnb,
    }, cfg);
  }, [cfg, camere, frequenza, area, areaMq, kitBnb]);

  const sel = "w-full px-2 py-1.5 rounded-lg bg-white/10 border border-white/10 text-white text-xs";
  const chip = (on: boolean) => `px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${on ? "bg-white text-slate-900" : "bg-white/10 text-slate-300 hover:bg-white/20"}`;

  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-4 text-white">
      <div className="font-semibold">Prova i prezzi</div>
      <div className="text-xs text-slate-300 mt-0.5">Scegli come farebbe il cliente: il prezzo usa i numeri che stai editando, prima di salvare. Niente lead, niente email.</div>

      <div className="flex gap-1.5 mt-3">
        <button type="button" className={chip(modo === "casa")} onClick={() => setModo("casa")}>Casa</button>
        <button type="button" className={chip(modo === "bnb")} onClick={() => setModo("bnb")}>B&amp;B</button>
      </div>

      {modo === "casa" ? (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select className={sel} value={taglio} onChange={(e) => setTaglio(e.target.value as Taglio)}>
              {SIM_TAGLI.map((t) => <option key={t.v} value={t.v} className="text-slate-900">{t.t}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-slate-300">
              <input type="number" value={mq} min={15} max={2000}
                onChange={(e) => setMq(Math.max(15, Math.min(2000, parseInt(e.target.value) || 15)))}
                className="w-full px-2 py-1.5 rounded-lg bg-white/10 border border-white/10 text-white text-right text-xs" />
              <span className="flex-none">mq</span>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <SimNum label="Matrimoniali" v={matr} set={setMatr} />
            <SimNum label="Singoli" v={sing} set={setSing} />
            <SimNum label="Divani letto" v={div} set={setDiv} />
            <SimNum label="Bagni" v={bagni} set={setBagni} min={1} />
            <SimNum label="Ospiti max" v={ospiti} set={setOspiti} min={1} max={30} />
            <SimNum label="N. case (sconto)" v={nCase} set={setNCase} min={1} max={8} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select className={sel} value={cucina} onChange={(e) => setCucina(e.target.value as TipoCucina)}>
              {SIM_CUCINE.map((c) => <option key={c.v} value={c.v} className="text-slate-900">{c.t}</option>)}
            </select>
            <select className={sel} value={esterno} onChange={(e) => setEsterno(e.target.value as TipoEsterno)}>
              {SIM_ESTERNI.map((c) => <option key={c.v} value={c.v} className="text-slate-900">{c.t}</option>)}
            </select>
          </div>
          {esterno === "giardino" && <SimNum label="Mq giardino" v={giardinoMq} set={setGiardinoMq} min={1} max={5000} />}
          <div className="flex gap-3">
            <label className="flex items-center gap-1.5 text-xs text-slate-300"><input type="checkbox" checked={bianch} onChange={(e) => setBianch(e.target.checked)} />Biancheria</label>
            <label className="flex items-center gap-1.5 text-xs text-slate-300"><input type="checkbox" checked={kit} onChange={(e) => setKit(e.target.checked)} />Kit cortesia</label>
          </div>

          <div className="bg-white/10 rounded-xl p-3 mt-1">
            {!casa ? "…" : casa.suMisura ? (
              <div>
                <div className="text-xl font-bold">SU MISURA</div>
                <div className="text-xs text-slate-300 mt-0.5">{taglio === "villa" ? "Le ville vanno sempre a preventivo dedicato." : `Oltre ${cfg?.mqMax ?? 400} mq: lead salvato + email “ti contattiamo”.`}</div>
              </div>
            ) : (
              <div>
                <div className="text-xl font-bold">€{casa.min} - €{casa.max}</div>
                <div className="text-xs text-slate-300 mt-0.5">
                  puntuale interno {formatEuro(casa.puntuale)}{casa.sconto ? ` · sconto multi-casa -${casa.sconto}% incluso` : ""}
                </div>
                {(casa.biancheria > 0 || casa.kit > 0) && (
                  <div className="text-xs text-slate-300 mt-1">
                    {casa.biancheria > 0 && <span>biancheria +{formatEuro(casa.biancheria)} </span>}
                    {casa.kit > 0 && <span>kit +{formatEuro(casa.kit)}</span>}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="space-y-1.5">
            {camere.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-slate-300 w-16 flex-none">Camera {i + 1}</span>
                <input type="number" value={p} min={1} max={6}
                  onChange={(e) => setCamere(camere.map((x, j) => j === i ? Math.max(1, Math.min(6, parseInt(e.target.value) || 1)) : x))}
                  className="w-14 px-2 py-1 rounded-lg bg-white/10 border border-white/10 text-white text-right text-xs" />
                <span className="text-xs text-slate-400">pers.</span>
                {camere.length > 1 && (
                  <button type="button" className="text-slate-400 hover:text-white text-sm" onClick={() => setCamere(camere.filter((_, j) => j !== i))}>×</button>
                )}
              </div>
            ))}
            <button type="button" className="text-xs font-semibold text-slate-300 hover:text-white"
              onClick={() => camere.length < 15 && setCamere([...camere, 2])}>+ Aggiungi camera</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select className={sel} value={frequenza} onChange={(e) => setFrequenza(e.target.value as FrequenzaBnb)}>
              <option value="checkout" className="text-slate-900">Solo checkout</option>
              <option value="giornaliera" className="text-slate-900">Anche giornaliera</option>
            </select>
            <select className={sel} value={area} onChange={(e) => setArea(e.target.value as AreaComune)}>
              <option value="no" className="text-slate-900">No aree comuni</option>
              <option value="inloco" className="text-slate-900">Aree: in loco</option>
              <option value="dedicata" className="text-slate-900">Aree: dedicata</option>
            </select>
          </div>
          {area !== "no" && <SimNum label="Mq area comune" v={areaMq} set={setAreaMq} min={1} max={500} />}
          <label className="flex items-center gap-1.5 text-xs text-slate-300"><input type="checkbox" checked={kitBnb} onChange={(e) => setKitBnb(e.target.checked)} />Kit cortesia</label>

          <div className="bg-white/10 rounded-xl p-3 mt-1">
            {!bnb ? "…" : (
              <div className="space-y-0.5 text-sm font-semibold">
                {bnb.camereDettaglio.map((c, i) => <div key={i}>{c.etichetta}: €{c.prezzo}</div>)}
                {bnb.rifacimentoPerCamera > 0 && <div className="text-xs font-normal text-slate-300">rifacimento €{bnb.rifacimentoPerCamera}/camera + €{bnb.rifacimentoUscita} uscita</div>}
                {bnb.areaComuneImporto > 0 && <div className="text-xs font-normal text-slate-300">aree comuni {formatEuro(bnb.areaComuneImporto)}</div>}
                {bnb.kit > 0 && <div className="text-xs font-normal text-slate-300">kit +{formatEuro(bnb.kit)}</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function getPath(obj: unknown, path: string[]): number {
  let cur: unknown = obj;
  for (const k of path) cur = (cur as Record<string, unknown> | undefined)?.[k];
  return typeof cur === "number" ? cur : 0;
}
function setPath(obj: EngineCfg, path: string[], value: number): EngineCfg {
  const out = JSON.parse(JSON.stringify(obj)) as EngineCfg;
  let cur: Record<string, unknown> = out;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]] as Record<string, unknown>;
  cur[path[path.length - 1]] = value;
  return out;
}
function contaDiff(a: EngineCfg, b: EngineCfg): number {
  let n = 0;
  const walk = (x: unknown, y: unknown) => {
    if (typeof x === "number" || typeof x === "string") { if (x !== y) n++; return; }
    if (typeof x === "object" && x && typeof y === "object" && y) {
      for (const k of Object.keys(x as Record<string, unknown>)) walk((x as Record<string, unknown>)[k], (y as Record<string, unknown>)[k]);
    }
  };
  walk(a, b);
  return n;
}

// Icona informativa con tooltip (hover su desktop, tap su mobile)
function InfoTip({ testo }: { testo: string }) {
  const [aperto, setAperto] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); setAperto((v) => !v); }}
        onMouseEnter={() => setAperto(true)}
        onMouseLeave={() => setAperto(false)}
        className="w-4 h-4 rounded-full bg-slate-200 hover:bg-sky-500 hover:text-white text-slate-500 text-[10px] font-bold flex items-center justify-center transition-colors"
        aria-label="Spiegazione"
      >
        i
      </button>
      {aperto && (
        <span className="absolute z-20 left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 p-2.5 rounded-xl bg-slate-800 text-white text-xs leading-snug shadow-xl">
          {testo}
          <span className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-slate-800 rotate-45 -mt-1" />
        </span>
      )}
    </span>
  );
}

// Piccola icona colorata per intestazione sezione
function IconaSezione({ tipo }: { tipo?: string }) {
  const paths: Record<string, React.ReactNode> = {
    home: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l9-9 9 9M5 10v10h14V10" />,
    bed: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 18v-6a2 2 0 012-2h14a2 2 0 012 2v6M3 14h18M6 10V8a2 2 0 012-2h8a2 2 0 012 2v2" />,
    plus: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />,
    linen: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" />,
    kit: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3h6v4l3 3v11H6V10l3-3V3z" />,
    bnb: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 21V9l8-6 8 6v12M9 21v-6h6v6" />,
    sofa: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12V9a2 2 0 012-2h12a2 2 0 012 2v3M3 12a2 2 0 012 2v3h14v-3a2 2 0 012-2M6 20v-3M18 20v-3" />,
    percent: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 5L5 19M6.5 6.5h.01M17.5 17.5h.01" />,
    ruler: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7l14 14 4-4L7 3zM8 8l2 2M11 5l2 2M5 11l2 2" />,
  };
  return (
    <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">{paths[tipo || "home"] || paths.home}</svg>
    </span>
  );
}

function TabConfig() {
  const [cfg, setCfg] = useState<EngineCfg | null>(null);
  const [defaults, setDefaults] = useState<EngineCfg | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [zone, setZone] = useState<Zona[]>([]);
  const [nuovoCap, setNuovoCap] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "err"; testo: string } | null>(null);


  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const [rc, rz] = await Promise.all([
        fetch("/api/admin/engine-config").then((r) => r.json()),
        fetch("/api/admin/coverage-zones").then((r) => r.json()),
      ]);
      if (rc.ok) { setCfg(rc.params); setDefaults(rc.defaults); setHistory(rc.history || []); }
      if (rz.ok) setZone(rz.zone || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carica(); }, [carica]);


  const salva = useCallback(async () => {
    if (!cfg) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/engine-config", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ params: cfg }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.errore);
      setCfg(data.params);
      setMsg({ tipo: "ok", testo: "Parametri salvati: da adesso ogni nuovo preventivo usa questi numeri." });
      carica();
    } catch (e) {
      setMsg({ tipo: "err", testo: "Salvataggio fallito: " + (e instanceof Error ? e.message : "errore") });
    } finally {
      setSaving(false);
    }
  }, [cfg, carica]);

  const ripristina = useCallback(async () => {
    if (!confirm("Ripristinare TUTTI i parametri ai valori di default? (lo storico resta)")) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/engine-config", { method: "DELETE" });
      const data = await res.json();
      if (data.ok) { setCfg(data.params); setMsg({ tipo: "ok", testo: "Parametri ripristinati ai default." }); carica(); }
    } finally {
      setSaving(false);
    }
  }, [carica]);

  // zone coperte
  const aggiungiCap = useCallback(async () => {
    const cap = nuovoCap.trim();
    if (!/^\d{5}$/.test(cap)) { setMsg({ tipo: "err", testo: "CAP non valido (5 cifre)" }); return; }
    const res = await fetch("/api/admin/coverage-zones", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cap }),
    });
    if ((await res.json()).ok) { setNuovoCap(""); carica(); }
  }, [nuovoCap, carica]);

  const toggleCap = useCallback(async (cap: string, attivo: boolean) => {
    setZone((z) => z.map((x) => (x.cap === cap ? { ...x, attivo } : x)));
    await fetch("/api/admin/coverage-zones", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cap, attivo }),
    });
  }, []);

  const modifiche = useMemo(() => (cfg && defaults ? contaDiff(defaults, cfg) : 0), [cfg, defaults]);

  if (loading || !cfg) return <div className="text-center py-16 text-slate-400">Caricamento configurazione…</div>;

  return (
    <div className="grid lg:grid-cols-3 gap-4 items-start">
      {/* colonna parametri */}
      <div className="lg:col-span-2 space-y-4">
        {/* Banner spiegazione */}
        <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 p-4">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shrink-0 shadow-sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </span>
            <div>
              <div className="font-semibold text-slate-800">Come funziona il calcolatore</div>
              <div className="text-sm text-slate-600 mt-0.5 leading-snug">
                Questi sono i prezzi che il preventivatore usa per calcolare ogni preventivo automaticamente. Modifica un numero, guarda l'<b>Anteprima live</b> a lato che si aggiorna subito, e quando sei soddisfatto premi <b>Salva</b>. Passa il mouse (o tocca) la <span className="inline-flex w-4 h-4 rounded-full bg-slate-300 text-slate-600 text-[10px] font-bold items-center justify-center align-middle">i</span> accanto a ogni campo per una spiegazione con esempio.
              </div>
            </div>
          </div>
        </div>

        {msg && (
          <div className={`rounded-2xl p-3 text-sm font-medium ${msg.tipo === "ok" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"}`}>
            {msg.testo}
          </div>
        )}

        {SEZIONI.map((sez) => (
          <div key={sez.key} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-4">
            <div className="flex items-start gap-3">
              <IconaSezione tipo={sez.icona} />
              <div className="flex-1">
                <div className="font-semibold text-slate-800">{sez.titolo}</div>
                {sez.nota && <div className="text-xs text-slate-500 mt-0.5 leading-snug">{sez.nota}</div>}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
              {sez.campi.map((c) => {
                const val = getPath(cfg, c.path);
                const def = defaults ? getPath(defaults, c.path) : val;
                const cambiato = val !== def;
                return (
                  <div key={c.path.join(".")} className="block">
                    <span className={`text-xs flex items-center gap-1 ${cambiato ? "text-violet-600 font-semibold" : "text-slate-600"}`}>
                      {c.label}{cambiato ? ` (def. ${def})` : ""}
                      {c.help && <InfoTip testo={c.help} />}
                    </span>
                    <div className="flex items-center gap-1 mt-1">
                      <input
                        type="number"
                        step={c.step ?? 1}
                        min={0}
                        value={val}
                        onChange={(e) => setCfg(setPath(cfg, c.path, Math.max(0, Number(e.target.value))))}
                        className={`w-full px-2.5 py-2 border-2 rounded-lg text-sm focus:outline-none focus:border-sky-500 transition-all ${cambiato ? "border-violet-300 bg-violet-50/50" : "border-slate-200"}`}
                      />
                      <span className="text-xs text-slate-400 w-8">{c.unit}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Zone coperte */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="font-semibold text-slate-800">Zone coperte (CAP)</div>
          <div className="text-xs text-slate-400 mt-0.5">CAP fuori lista → il preventivo esce come &quot;zona in valutazione&quot;.</div>
          <div className="flex gap-2 mt-3">
            <input
              value={nuovoCap}
              onChange={(e) => setNuovoCap(e.target.value.replace(/\D/g, "").slice(0, 5))}
              placeholder="Nuovo CAP (es. 00165)"
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm w-44 focus:outline-none focus:ring-2 focus:ring-sky-300"
            />
            <button onClick={aggiungiCap} className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-sky-500 to-blue-600 shadow">+ Aggiungi</button>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {zone.length === 0 && <span className="text-sm text-slate-400">Nessun CAP configurato</span>}
            {zone.map((z) => (
              <button
                key={z.cap}
                onClick={() => toggleCap(z.cap, !z.attivo)}
                title={z.attivo ? "Attivo — clicca per disattivare" : "Disattivato — clicca per riattivare"}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${z.attivo ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400 line-through"}`}
              >
                {z.cap}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* colonna simulatore + azioni (sticky) */}
      <div className="space-y-4 lg:sticky lg:top-4">
        <SimulatorePrezzi cfg={cfg as unknown as EngineParams} />

        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
          <div className="text-sm text-slate-600">
            {modifiche > 0 ? <><b>{modifiche}</b> parametri diversi dai default</> : "Parametri = default"}
          </div>
          <button
            onClick={salva}
            disabled={saving}
            className="w-full px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-600 shadow hover:shadow-md transition-all disabled:opacity-50"
          >
            {saving ? "Salvo…" : "💾 Salva — attivo da subito"}
          </button>
          <button
            onClick={ripristina}
            disabled={saving}
            className="w-full px-4 py-2 rounded-xl text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors disabled:opacity-50"
          >
            ↩ Ripristina default
          </button>
        </div>

        {history.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="font-semibold text-slate-800 text-sm mb-2">Storico modifiche</div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {history.map((h, i) => (
                <div key={i} className="text-xs text-slate-500 border-b border-slate-100 pb-1.5">
                  <b className="text-slate-700">{h.at ? fmtData(h.at) : "-"}</b> · {h.updatedBy}
                  {h.reset ? " · ripristino default" : ` · ${contaDiff(h.prima, h.dopo)} parametri cambiati`}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
