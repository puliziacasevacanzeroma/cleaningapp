"use client";

/**
 * /dashboard/controllo-sistema — Cruscotto di monitoraggio (READ-ONLY).
 *
 * Mostra lo stato di tutti i controlli automatici del gestionale. Chiama
 * /api/debug/health-check (autenticata via sessione admin) e colora ogni
 * controllo: verde = ok, giallo = attenzione, rosso = critico. Nessuna
 * scrittura: la pagina osserva soltanto.
 */

import { useState, useEffect, useCallback } from "react";

interface CheckResult {
  id: string;
  titolo: string;
  severity: "critico" | "attenzione" | "info";
  ok: boolean;
  count: number;
  messaggio: string;
  esempi?: any[];
  errore?: string;
}

interface HealthPayload {
  success: boolean;
  generatoIl: string;
  riepilogo: {
    totaleControlli: number;
    ok: number;
    problemi: number;
    critici: number;
    statoGenerale: "VERDE" | "GIALLO" | "ROSSO";
  };
  controlli: CheckResult[];
}

export default function ControlloSistemaPage() {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // La route risponde 500 quando trova problemi: NON è un errore di rete,
      // è lo stato "rosso". Leggiamo comunque il body.
      const res = await fetch("/api/debug/health-check", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (json && json.controlli) {
        setData(json as HealthPayload);
      } else if (res.status === 401) {
        setError("Accesso non autorizzato. Serve un account amministratore.");
      } else {
        setError(json?.message || "Impossibile caricare il controllo.");
      }
    } catch (e: any) {
      setError(e?.message || "Errore di rete.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const statoColor = (s?: string) =>
    s === "VERDE" ? "bg-emerald-500" : s === "GIALLO" ? "bg-amber-500" : "bg-red-500";
  const statoLabel = (s?: string) =>
    s === "VERDE" ? "Tutto in ordine" : s === "GIALLO" ? "Attenzione" : "Problemi critici";

  const sevBadge = (sev: string, ok: boolean) => {
    if (ok) return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (sev === "critico") return "bg-red-50 text-red-700 border-red-200";
    return "bg-amber-50 text-amber-700 border-amber-200";
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold text-slate-800">🩺 Controllo Sistema</h1>
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-1.5 text-[13px] font-semibold rounded-lg bg-slate-800 text-white active:scale-95 transition-transform disabled:opacity-50"
        >
          {loading ? "Controllo…" : "Aggiorna"}
        </button>
      </div>
      <p className="text-[13px] text-slate-500 mb-5">
        Controlli automatici sui dati del gestionale. Solo lettura: questa pagina osserva, non modifica nulla.
      </p>

      {loading && !data && (
        <div className="text-center py-16 text-slate-400 text-[14px]">Eseguo i controlli…</div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-[13px] text-red-700">{error}</div>
      )}

      {data && (
        <>
          {/* Riepilogo */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 mb-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${statoColor(data.riepilogo.statoGenerale)}`} />
              <span className="text-[15px] font-bold text-slate-800">{statoLabel(data.riepilogo.statoGenerale)}</span>
            </div>
            <div className="flex gap-4 mt-3 text-[13px] text-slate-600">
              <span>✅ {data.riepilogo.ok} ok</span>
              {data.riepilogo.problemi > 0 && <span>🟠 {data.riepilogo.problemi - data.riepilogo.critici} attenzione</span>}
              {data.riepilogo.critici > 0 && <span>🔴 {data.riepilogo.critici} critici</span>}
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Ultimo controllo: {new Date(data.generatoIl).toLocaleString("it-IT")}
            </p>
          </div>

          {/* Lista controlli */}
          <div className="space-y-2.5">
            {data.controlli.map((c) => (
              <div key={c.id} className={`bg-white rounded-xl border ${c.ok ? "border-slate-100" : c.severity === "critico" ? "border-red-200" : "border-amber-200"} overflow-hidden`}>
                <button
                  onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                  className="w-full px-4 py-3.5 flex items-center gap-3 text-left active:bg-slate-50 transition-colors"
                  disabled={c.ok || !(c.esempi && c.esempi.length)}
                >
                  <span className="text-[18px] flex-shrink-0">
                    {c.errore ? "⚫" : c.ok ? "✅" : c.severity === "critico" ? "🔴" : "🟠"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-slate-800">{c.titolo}</p>
                    <p className="text-[12px] text-slate-500 mt-0.5">{c.messaggio}</p>
                    {c.errore && <p className="text-[11px] text-slate-400 mt-1">Controllo non eseguito: {c.errore}</p>}
                  </div>
                  {!c.ok && (
                    <span className={`text-[12px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${sevBadge(c.severity, c.ok)}`}>
                      {c.count}
                    </span>
                  )}
                </button>

                {/* Dettaglio esempi */}
                {expanded === c.id && c.esempi && c.esempi.length > 0 && (
                  <div className="px-4 pb-4 pt-1 border-t border-slate-100">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2 mt-2">
                      Primi {c.esempi.length} casi
                    </p>
                    <div className="space-y-1.5">
                      {c.esempi.map((ex, i) => (
                        <div key={i} className="bg-slate-50 rounded-lg px-3 py-2 text-[12px] text-slate-600 font-mono break-all">
                          {Object.entries(ex).map(([k, v]) => (
                            <span key={k} className="mr-3"><span className="text-slate-400">{k}:</span> {String(v)}</span>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <p className="text-[11px] text-slate-400 mt-5 text-center">
            Il controllo gira anche in automatico ogni giorno. Se trova problemi ricevi email e notifica.
          </p>
        </>
      )}
    </div>
  );
}
