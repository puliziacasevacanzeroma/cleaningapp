"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { useRouter } from "next/navigation";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface DurationStats {
  count: number;
  totalMinutes: number;
  avgMinutes: number;
  minMinutes: number;
  maxMinutes: number;
  stdDeviation: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

interface AnalyticsData {
  totalCleanings: number;
  period: { months: number; from: string; to: string };
  overall: DurationStats;
  byServiceType: Record<string, DurationStats>;
  byProperty: Record<string, DurationStats & { name: string }>;
  byOperator: Record<string, DurationStats & { efficiency: number }>;
  byRoomCount: Record<string, DurationStats>;
  suggestions: {
    serviceTypes: Array<{
      code: string;
      currentEstimate: number;
      suggestedEstimate: number;
      basedOnSamples: number;
      confidence: string;
    }>;
    extraTimePerRoom: number;
    extraTimePerBathroom: number;
  };
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPALE
// ═══════════════════════════════════════════════════════════════

export default function DurateAutomatichePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // Stati
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Parametri
  const [months, setMonths] = useState(6);
  const [percentile, setPercentile] = useState(75);

  // ─── CARICA STATISTICHE ───
  const loadStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/analytics/cleaning-duration?months=${months}`);
      const result = await response.json();

      if (response.ok) {
        setData(result);
      } else {
        setError(result.error || "Errore caricamento");
      }
    } catch (err) {
      setError("Errore di connessione");
    } finally {
      setLoading(false);
    }
  }, [months]);

  useEffect(() => {
    if (!authLoading && user?.role === "ADMIN") {
      loadStats();
    }
  }, [authLoading, user, loadStats]);

  // ─── REDIRECT SE NON ADMIN ───
  useEffect(() => {
    if (!authLoading && (!user || user.role !== "ADMIN")) {
      router.push("/dashboard");
    }
  }, [authLoading, user, router]);

  // ─── APPLICA STIME ───
  const handleApplyEstimates = async () => {
    if (!confirm(
      `Vuoi aggiornare automaticamente le durate stimate?\n\n` +
      `Verrà usato il ${percentile}° percentile delle durate reali.`
    )) return;

    try {
      setApplying(true);
      setError(null);
      
      const response = await fetch("/api/analytics/cleaning-duration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applyToServiceTypes: true,
          applyToProperties: false,
          usePercentile: percentile,
          minSamples: 10,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setSuccess(`✅ Aggiornate ${result.updatesApplied} stime automaticamente!`);
        loadStats(); // Ricarica per vedere i nuovi valori
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError("Errore applicazione stime");
    } finally {
      setApplying(false);
    }
  };

  // ─── FORMATTA MINUTI ───
  const formatDuration = (minutes: number) => {
    if (!minutes) return "-";
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  // ─── LOADING ───
  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500 mx-auto mb-4"></div>
          <p className="text-slate-500">Analizzando i dati delle pulizie...</p>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      {/* ─── HEADER ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <button
            onClick={() => router.push("/dashboard/impostazioni")}
            className="text-sm text-slate-500 hover:text-slate-700 mb-2"
          >
            ← Torna alle impostazioni
          </button>
          <h1 className="text-2xl font-bold text-slate-800">📊 Durate Automatiche</h1>
          <p className="text-slate-500 text-sm mt-1">
            Calcola automaticamente le durate stimate basandosi sulle pulizie reali
          </p>
        </div>
      </div>

      {/* ─── MESSAGGI ─── */}
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">
          ❌ {error}
          <button onClick={() => setError(null)} className="ml-2 font-bold">×</button>
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-emerald-100 text-emerald-700 rounded-lg text-sm">
          {success}
          <button onClick={() => setSuccess(null)} className="ml-2 font-bold">×</button>
        </div>
      )}

      {/* ─── PARAMETRI ─── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
        <h2 className="font-semibold text-slate-800 mb-3">⚙️ Parametri Analisi</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Periodo analisi
            </label>
            <select
              value={months}
              onChange={(e) => setMonths(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            >
              <option value={1}>Ultimo mese</option>
              <option value={3}>Ultimi 3 mesi</option>
              <option value={6}>Ultimi 6 mesi</option>
              <option value={12}>Ultimo anno</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Percentile per stima
            </label>
            <select
              value={percentile}
              onChange={(e) => setPercentile(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            >
              <option value={50}>50° (mediana)</option>
              <option value={75}>75° (conservativo)</option>
              <option value={90}>90° (molto sicuro)</option>
            </select>
            <p className="text-xs text-slate-500 mt-1">
              75° = il 75% delle pulizie finisce in questo tempo
            </p>
          </div>
          <div className="flex items-end">
            <button
              onClick={loadStats}
              disabled={loading}
              className="w-full py-2 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200"
            >
              🔄 Ricalcola
            </button>
          </div>
        </div>
      </div>

      {data && (
        <>
          {/* ─── RIEPILOGO GENERALE ─── */}
          <div className="bg-gradient-to-r from-sky-500 to-blue-600 rounded-xl p-6 mb-6 text-white">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-sky-100 text-sm">Pulizie analizzate</p>
                <p className="text-3xl font-bold">{data.totalCleanings}</p>
              </div>
              <div>
                <p className="text-sky-100 text-sm">Durata media</p>
                <p className="text-3xl font-bold">{formatDuration(data.overall.avgMinutes)}</p>
              </div>
              <div>
                <p className="text-sky-100 text-sm">Minima</p>
                <p className="text-3xl font-bold">{formatDuration(data.overall.minMinutes)}</p>
              </div>
              <div>
                <p className="text-sky-100 text-sm">Massima</p>
                <p className="text-3xl font-bold">{formatDuration(data.overall.maxMinutes)}</p>
              </div>
            </div>
          </div>

          {/* ─── SUGGERIMENTI ─── */}
          {data.suggestions.serviceTypes.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="font-semibold text-amber-800">💡 Suggerimenti Aggiornamento</h2>
                  <p className="text-sm text-amber-600">Basati sul {percentile}° percentile delle durate reali</p>
                </div>
                <button
                  onClick={handleApplyEstimates}
                  disabled={applying}
                  className="px-4 py-2 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 disabled:opacity-50"
                >
                  {applying ? "Applicando..." : "✅ Applica tutte le stime"}
                </button>
              </div>
              
              <div className="space-y-3">
                {data.suggestions.serviceTypes.map((sug) => (
                  <div key={sug.code} className="bg-white rounded-lg p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">
                        {sug.code === "STANDARD" ? "🧹" : sug.code === "APPROFONDITA" ? "✨" : "🔴"}
                      </span>
                      <div>
                        <p className="font-medium text-slate-800">{sug.code}</p>
                        <p className="text-xs text-slate-500">
                          Basato su {sug.basedOnSamples} pulizie • Affidabilità: {sug.confidence}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm text-slate-500">Attuale</p>
                        <p className="font-mono">{sug.currentEstimate} min</p>
                      </div>
                      <span className="text-slate-400">→</span>
                      <div className="text-right">
                        <p className="text-sm text-emerald-600">Suggerito</p>
                        <p className="font-mono font-bold text-emerald-700">{sug.suggestedEstimate} min</p>
                      </div>
                      <div className={`px-2 py-1 rounded text-xs font-medium ${
                        sug.suggestedEstimate > sug.currentEstimate 
                          ? "bg-red-100 text-red-700" 
                          : sug.suggestedEstimate < sug.currentEstimate
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}>
                        {sug.suggestedEstimate > sug.currentEstimate 
                          ? `+${sug.suggestedEstimate - sug.currentEstimate}` 
                          : sug.suggestedEstimate - sug.currentEstimate}
                      </div>
                    </div>
                  </div>
                ))}
                
                <div className="bg-white rounded-lg p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🛏️</span>
                    <div>
                      <p className="font-medium text-slate-800">Tempo extra per camera</p>
                      <p className="text-xs text-slate-500">Oltre la prima camera</p>
                    </div>
                  </div>
                  <p className="font-mono font-bold text-sky-600">+{data.suggestions.extraTimePerRoom} min</p>
                </div>
                
                <div className="bg-white rounded-lg p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🚿</span>
                    <div>
                      <p className="font-medium text-slate-800">Tempo extra per bagno</p>
                      <p className="text-xs text-slate-500">Oltre il primo bagno</p>
                    </div>
                  </div>
                  <p className="font-mono font-bold text-sky-600">+{data.suggestions.extraTimePerBathroom} min</p>
                </div>
              </div>
            </div>
          )}

          {/* ─── DETTAGLIO PER TIPO SERVIZIO ─── */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
            <h2 className="font-semibold text-slate-800 mb-4">📈 Statistiche per Tipo Servizio</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-3 py-2">Tipo</th>
                    <th className="text-right px-3 py-2">Campioni</th>
                    <th className="text-right px-3 py-2">Media</th>
                    <th className="text-right px-3 py-2">Min</th>
                    <th className="text-right px-3 py-2">Max</th>
                    <th className="text-right px-3 py-2">P50</th>
                    <th className="text-right px-3 py-2">P75</th>
                    <th className="text-right px-3 py-2">P90</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Object.entries(data.byServiceType).map(([code, stats]) => (
                    <tr key={code}>
                      <td className="px-3 py-2 font-medium">
                        {code === "STANDARD" ? "🧹" : code === "APPROFONDITA" ? "✨" : "🔴"} {code}
                      </td>
                      <td className="px-3 py-2 text-right">{stats.count}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatDuration(stats.avgMinutes)}</td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-600">{formatDuration(stats.minMinutes)}</td>
                      <td className="px-3 py-2 text-right font-mono text-red-600">{formatDuration(stats.maxMinutes)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatDuration(stats.p50)}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold">{formatDuration(stats.p75)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatDuration(stats.p90)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ─── TOP PROPRIETÀ ─── */}
          {Object.keys(data.byProperty).length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
              <h2 className="font-semibold text-slate-800 mb-4">🏠 Per Proprietà (top 10)</h2>
              <div className="space-y-2">
                {Object.entries(data.byProperty)
                  .sort((a, b) => b[1].count - a[1].count)
                  .slice(0, 10)
                  .map(([id, stats]) => (
                    <div key={id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                      <div>
                        <p className="font-medium text-slate-800">{stats.name}</p>
                        <p className="text-xs text-slate-500">{stats.count} pulizie</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-xs text-slate-500">Media</p>
                          <p className="font-mono">{formatDuration(stats.avgMinutes)}</p>
                        </div>
                        <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-sky-500 rounded-full"
                            style={{ width: `${Math.min(100, (stats.avgMinutes / 180) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* ─── EFFICIENZA OPERATORI ─── */}
          {Object.keys(data.byOperator).length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h2 className="font-semibold text-slate-800 mb-4">👷 Efficienza Operatori</h2>
              <p className="text-sm text-slate-500 mb-4">
                100 = media, &gt;100 = più veloce della media, &lt;100 = più lento
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Object.entries(data.byOperator)
                  .sort((a, b) => b[1].efficiency - a[1].efficiency)
                  .map(([id, stats]) => (
                    <div key={id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold ${
                        stats.efficiency >= 110 ? "bg-emerald-100 text-emerald-700" :
                        stats.efficiency >= 90 ? "bg-sky-100 text-sky-700" :
                        "bg-amber-100 text-amber-700"
                      }`}>
                        {stats.efficiency}%
                      </div>
                      <div>
                        <p className="font-medium text-slate-800 text-sm truncate" style={{ maxWidth: "150px" }}>
                          {id.substring(0, 8)}...
                        </p>
                        <p className="text-xs text-slate-500">
                          {stats.count} pulizie • Media: {formatDuration(stats.avgMinutes)}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── NESSUN DATO ─── */}
      {data && data.totalCleanings === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <p className="text-4xl mb-4">📭</p>
          <p className="text-slate-500">
            Nessuna pulizia completata negli ultimi {months} mesi.<br />
            Completa alcune pulizie per vedere le statistiche.
          </p>
        </div>
      )}
    </div>
  );
}
