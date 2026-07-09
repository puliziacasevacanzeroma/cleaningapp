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

// ─────────────────────────── Tipi ───────────────────────────

interface Lead {
  id: string;
  tipo: "casa" | "case" | "bnb" | "hotel";
  zona: string;
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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Preventivi</h1>
          <p className="text-sm text-slate-500">Lead dal preventivatore e configurazione del calcolatore</p>
        </div>
        <div className="flex bg-slate-100 rounded-xl p-1 w-fit">
          <button
            onClick={() => setTab("leads")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === "leads" ? "bg-white text-slate-800 shadow" : "text-slate-500"}`}
          >
            📋 Preventivi
          </button>
          <button
            onClick={() => setTab("config")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === "config" ? "bg-white text-slate-800 shadow" : "text-slate-500"}`}
          >
            🧮 Calcolatore
          </button>
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
              <button
                key={l.id}
                onClick={() => { setFiltroStato("tutti"); setSearch(l.contatti.nome); setEspanso(l.id); }}
                className="px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-sm text-amber-900 hover:bg-amber-100 transition-colors"
              >
                {l.contatti.nome} · {l.contatti.telefono}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filtri */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 space-y-3">
        <div className="flex flex-wrap gap-2">
          <FiltroPill attivo={filtroStato === "tutti"} onClick={() => setFiltroStato("tutti")} label={`Tutti (${leads.length})`} />
          {STATI.map((s) => (
            <FiltroPill key={s.id} attivo={filtroStato === s.id} onClick={() => setFiltroStato(s.id)} label={`${s.label} (${contaStato(s.id)})`} />
          ))}
        </div>
        <div className="flex flex-col md:flex-row gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca nome, telefono, email, zona, n° preventivo…"
            className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
          />
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white">
            <option value="tutti">Tutti i tipi</option>
            <option value="casa">Casa vacanze</option>
            <option value="case">Multi struttura</option>
            <option value="bnb">B&B</option>
            <option value="hotel">Hotel</option>
          </select>
          <button onClick={carica} className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">↻ Aggiorna</button>
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
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
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
    <div className={`bg-white rounded-2xl border p-4 transition-all ${scaduto ? "border-amber-300 ring-1 ring-amber-200" : "border-slate-200"}`}>
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
          <a href={`tel:${l.contatti?.telefono}`} className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm transition-colors">📞 {l.contatti?.telefono}</a>
          <select
            value={l.stato}
            disabled={salvando}
            onChange={(e) => onPatch({ stato: e.target.value })}
            className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
          >
            {STATI.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <input
            type="date"
            value={l.followUpAt ?? ""}
            disabled={salvando}
            onChange={(e) => onPatch({ followUpAt: e.target.value || null })}
            title="Data ricontatto"
            className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
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
const SEZIONI: { key: string; titolo: string; nota?: string; campi: { path: string[]; label: string; unit: string; step?: number }[] }[] = [
  {
    key: "basi", titolo: "Prezzo base per taglio", nota: "Il punto di partenza del calcolo, per taglio effettivo.",
    campi: [
      { path: ["basi", "mono"], label: "Monolocale", unit: "€" },
      { path: ["basi", "bilo"], label: "Bilocale", unit: "€" },
      { path: ["basi", "trilo"], label: "Trilocale", unit: "€" },
      { path: ["basi", "triloGrande"], label: "Trilocale grande (>75mq)", unit: "€" },
      { path: ["basi", "quadri"], label: "Quadrilocale", unit: "€" },
    ],
  },
  {
    key: "lettiInclusi", titolo: "Letti inclusi nel prezzo base", nota: "Oltre questi, scatta il correttivo per letto.",
    campi: [
      { path: ["lettiInclusi", "mono"], label: "Monolocale", unit: "letti", step: 1 },
      { path: ["lettiInclusi", "bilo"], label: "Bilocale", unit: "letti", step: 1 },
      { path: ["lettiInclusi", "trilo"], label: "Trilocale", unit: "letti", step: 1 },
      { path: ["lettiInclusi", "triloGrande"], label: "Trilocale grande", unit: "letti", step: 1 },
      { path: ["lettiInclusi", "quadri"], label: "Quadrilocale", unit: "letti", step: 1 },
    ],
  },
  {
    key: "corrP", titolo: "Correttivi — appartamenti piccoli (mono/bilo)",
    campi: [
      { path: ["corr", "piccolo", "letto"], label: "Letto extra", unit: "€" },
      { path: ["corr", "piccolo", "bagno"], label: "Bagno extra", unit: "€" },
      { path: ["corr", "piccolo", "cucinaSep"], label: "Cucina separata", unit: "€" },
      { path: ["corr", "piccolo", "cucinaAbit"], label: "Cucina abitabile", unit: "€" },
      { path: ["corr", "piccolo", "balcone"], label: "Balcone", unit: "€" },
      { path: ["corr", "piccolo", "terrazzo"], label: "Terrazzo", unit: "€" },
      { path: ["corr", "piccolo", "terrazzoGrande"], label: "Terrazzo grande", unit: "€" },
    ],
  },
  {
    key: "corrG", titolo: "Correttivi — appartamenti grandi (trilo+)",
    campi: [
      { path: ["corr", "grande", "letto"], label: "Letto extra", unit: "€" },
      { path: ["corr", "grande", "bagno"], label: "Bagno extra", unit: "€" },
      { path: ["corr", "grande", "cucinaSep"], label: "Cucina separata", unit: "€" },
      { path: ["corr", "grande", "cucinaAbit"], label: "Cucina abitabile", unit: "€" },
      { path: ["corr", "grande", "balcone"], label: "Balcone", unit: "€" },
      { path: ["corr", "grande", "terrazzo"], label: "Terrazzo", unit: "€" },
      { path: ["corr", "grande", "terrazzoGrande"], label: "Terrazzo grande", unit: "€" },
    ],
  },
  {
    key: "biancheria", titolo: "Biancheria (a cambio)",
    campi: [
      { path: ["biancheria", "matrimoniale"], label: "Set matrimoniale", unit: "€", step: 0.1 },
      { path: ["biancheria", "singolo"], label: "Set singolo", unit: "€", step: 0.1 },
      { path: ["biancheria", "setOspite"], label: "Set bagno per ospite", unit: "€", step: 0.1 },
      { path: ["biancheria", "tappetino"], label: "Tappetino (per bagno)", unit: "€", step: 0.1 },
      { path: ["biancheria", "canavaccio"], label: "Canovaccio", unit: "€", step: 0.1 },
    ],
  },
  {
    key: "kit", titolo: "Kit di cortesia",
    campi: [{ path: ["kitCortesia"], label: "Kit per ospite", unit: "€", step: 0.01 }],
  },
  {
    key: "bnb", titolo: "B&B / Affittacamere",
    campi: [
      { path: ["bnb", "singola"], label: "Camera singola (1p)", unit: "€" },
      { path: ["bnb", "doppia"], label: "Camera doppia (2p)", unit: "€" },
      { path: ["bnb", "personaExtra"], label: "Per persona oltre la 2ª", unit: "€" },
      { path: ["bnb", "rifacimentoLetto"], label: "Rifacimento letto (giornaliero)", unit: "€" },
      { path: ["bnb", "uscita"], label: "Uscita (riassetto giornaliero)", unit: "€" },
    ],
  },
  {
    key: "aree", titolo: "Aree comuni",
    campi: [
      { path: ["areaComune", "sogliaMq"], label: "Mq inclusi nella base", unit: "mq", step: 1 },
      { path: ["areaComune", "inLocoBase"], label: "In loco — base", unit: "€" },
      { path: ["areaComune", "inLocoMqExtra"], label: "In loco — €/mq extra", unit: "€", step: 0.1 },
      { path: ["areaComune", "dedicataBase"], label: "Uscita dedicata — base", unit: "€" },
      { path: ["areaComune", "dedicataMqExtra"], label: "Uscita dedicata — €/mq extra", unit: "€", step: 0.1 },
    ],
  },
  {
    key: "passaggio", titolo: "Passaggio in soggiorno (case)",
    campi: [
      { path: ["passaggio", "uscita"], label: "Uscita", unit: "€" },
      { path: ["passaggio", "perLetto"], label: "Per letto", unit: "€" },
    ],
  },
  {
    key: "sconto", titolo: "Sconto multi-struttura",
    campi: [
      { path: ["scontoMultiUnita", "daUnita"], label: "A partire da (n° case)", unit: "case", step: 1 },
      { path: ["scontoMultiUnita", "percento"], label: "Sconto", unit: "%", step: 1 },
    ],
  },
  {
    key: "soglie", titolo: "Soglie mq", nota: "Sopra MQ MAX il preventivo diventa \"su misura\". Le soglie promuovono il taglio dichiarato al superiore.",
    campi: [
      { path: ["MQ_MAX"], label: "MQ massimi (oltre: su misura)", unit: "mq", step: 5 },
      { path: ["MQ_TRILO_GRANDE"], label: "Trilo diventa \"grande\" oltre", unit: "mq", step: 5 },
      { path: ["soglieMqPromozione", "mono"], label: "Mono → Bilo oltre", unit: "mq", step: 5 },
      { path: ["soglieMqPromozione", "bilo"], label: "Bilo → Trilo oltre", unit: "mq", step: 5 },
      { path: ["soglieMqPromozione", "trilo"], label: "Trilo → Quadri oltre", unit: "mq", step: 5 },
      { path: ["soglieMqPromozione", "triloGrande"], label: "Trilo grande → Quadri oltre", unit: "mq", step: 5 },
    ],
  },
];

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

function TabConfig() {
  const [cfg, setCfg] = useState<EngineCfg | null>(null);
  const [defaults, setDefaults] = useState<EngineCfg | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [zone, setZone] = useState<Zona[]>([]);
  const [nuovoCap, setNuovoCap] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "err"; testo: string } | null>(null);

  // simulatore
  const [sim, setSim] = useState<{ casa: { min: number; max: number; suMisura: boolean } | null; bnb: { camere: { etichetta: string; prezzo: number }[] } | null }>({ casa: null, bnb: null });
  const simTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // simulatore live: ricalcola (debounced) a ogni modifica dei parametri
  useEffect(() => {
    if (!cfg) return;
    if (simTimer.current) clearTimeout(simTimer.current);
    simTimer.current = setTimeout(async () => {
      try {
        const [casa, bnb] = await Promise.all([
          fetch("/api/admin/engine-config", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ params: cfg, caso: { tipo: "casa", casa: { taglio: "bilo", mq: 55, matrimoniali: 1, singoli: 1, bagni: 1, cucina: "abit", esterno: "balcone", ospiti: 4 } } }),
          }).then((r) => r.json()),
          fetch("/api/admin/engine-config", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ params: cfg, caso: { tipo: "bnb", camere: [{ persone: 1 }, { persone: 2 }, { persone: 3 }] } }),
          }).then((r) => r.json()),
        ]);
        setSim({
          casa: casa.ok ? { min: casa.quote.min, max: casa.quote.max, suMisura: casa.quote.suMisura } : null,
          bnb: bnb.ok ? { camere: bnb.quote.camereDettaglio || [] } : null,
        });
      } catch { /* silenzioso: il simulatore è solo un aiuto */ }
    }, 450);
    return () => { if (simTimer.current) clearTimeout(simTimer.current); };
  }, [cfg]);

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
        {msg && (
          <div className={`rounded-2xl p-3 text-sm font-medium ${msg.tipo === "ok" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"}`}>
            {msg.testo}
          </div>
        )}

        {SEZIONI.map((sez) => (
          <div key={sez.key} className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="font-semibold text-slate-800">{sez.titolo}</div>
            {sez.nota && <div className="text-xs text-slate-400 mt-0.5">{sez.nota}</div>}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
              {sez.campi.map((c) => {
                const val = getPath(cfg, c.path);
                const def = defaults ? getPath(defaults, c.path) : val;
                const cambiato = val !== def;
                return (
                  <label key={c.path.join(".")} className="block">
                    <span className={`text-xs ${cambiato ? "text-violet-600 font-semibold" : "text-slate-500"}`}>
                      {c.label}{cambiato ? ` (default ${def})` : ""}
                    </span>
                    <div className="flex items-center gap-1 mt-1">
                      <input
                        type="number"
                        step={c.step ?? 1}
                        min={0}
                        value={val}
                        onChange={(e) => setCfg(setPath(cfg, c.path, Math.max(0, Number(e.target.value))))}
                        className={`w-full px-2 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 ${cambiato ? "border-violet-300 bg-violet-50/50" : "border-slate-200"}`}
                      />
                      <span className="text-xs text-slate-400 w-8">{c.unit}</span>
                    </div>
                  </label>
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
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-4 text-white">
          <div className="font-semibold">Anteprima live</div>
          <div className="text-xs text-slate-300 mt-0.5">Ricalcolata con i numeri che stai editando, prima di salvare.</div>

          <div className="mt-3 bg-white/10 rounded-xl p-3">
            <div className="text-xs text-slate-300">Bilocale 55mq · 2 letti · 1 bagno · cucina abitabile · balcone</div>
            <div className="text-xl font-bold mt-1">
              {sim.casa ? (sim.casa.suMisura ? "SU MISURA" : `€${sim.casa.min} - €${sim.casa.max}`) : "…"}
            </div>
          </div>
          <div className="mt-2 bg-white/10 rounded-xl p-3">
            <div className="text-xs text-slate-300">B&amp;B: singola + doppia + tripla (a checkout)</div>
            <div className="text-sm font-semibold mt-1 space-y-0.5">
              {sim.bnb ? sim.bnb.camere.map((c, i) => <div key={i}>{c.etichetta}: €{c.prezzo}</div>) : "…"}
            </div>
          </div>
        </div>

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
