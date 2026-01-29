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
  success: boolean;
  noData: boolean;
  message?: string;
  totalCleanings: number;
  period: { months: number; from: string; to: string };
  overall: DurationStats;
  byServiceType: Record<string, DurationStats>;
  byProperty: Record<string, DurationStats & { name: string }>;
  byOperator: Record<string, DurationStats & { name: string; efficiency: number }>;
  byRoomCount: Record<string, DurationStats & { label: string }>;
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
  recentCleanings?: Array<{
    id: string;
    property: string;
    operator: string;
    type: string;
    duration: number;
    date: string;
  }>;
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPALE
// ═══════════════════════════════════════════════════════════════

export default function DurateAutomatichePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "details" | "operators" | "history">("overview");

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
    } catch {
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
        loadStats();
      } else {
        setError(result.error);
      }
    } catch {
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
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      {/* ─── HEADER ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <button
            onClick={() => router.push("/dashboard/impostazioni")}
            className="text-sm text-slate-500 hover:text-slate-700 mb-2 flex items-center gap-1"
          >
            ← Torna alle impostazioni
          </button>
          <h1 className="text-2xl font-bold text-slate-800">📊 Durate Automatiche</h1>
          <p className="text-slate-500 text-sm mt-1">
            Calcola automaticamente le durate stimate basandosi sulle pulizie reali completate
          </p>
        </div>
      </div>

      {/* ─── MESSAGGI ─── */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-center justify-between">
          <span>❌ {error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold text-lg">×</button>
        </div>
      )}
      {success && (
        <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm flex items-center justify-between">
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} className="text-emerald-500 hover:text-emerald-700 font-bold text-lg">×</button>
        </div>
      )}

      {/* ─── PARAMETRI ─── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
        <h2 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
          ⚙️ Parametri Analisi
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Periodo analisi
            </label>
            <select
              value={months}
              onChange={(e) => setMonths(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
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
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            >
              <option value={50}>P50 (mediana) - ottimistico</option>
              <option value={75}>P75 (consigliato) - conservativo</option>
              <option value={90}>P90 - molto sicuro</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={loadStats}
              disabled={loading}
              className="w-full py-2 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition-colors"
            >
              🔄 Ricalcola
            </button>
          </div>
        </div>
      </div>

      {/* ─── NESSUN DATO ─── */}
      {data?.noData && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center">
          <p className="text-5xl mb-4">📭</p>
          <h3 className="text-lg font-semibold text-amber-800 mb-2">Nessun dato disponibile</h3>
          <p className="text-amber-600 mb-4">
            Non ci sono pulizie completate negli ultimi {months} mesi con dati di durata validi.
          </p>
          <p className="text-sm text-amber-500">
            Per calcolare le statistiche servono pulizie con orario di inizio e fine registrati.
          </p>
        </div>
      )}

      {/* ─── DATI PRESENTI ─── */}
      {data && !data.noData && (
        <>
          {/* ─── RIEPILOGO GENERALE ─── */}
          <div className="bg-gradient-to-r from-sky-500 to-blue-600 rounded-xl p-6 mb-6 text-white">
            <h3 className="text-lg font-semibold mb-4 opacity-90">📈 Riepilogo Generale</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
              <div className="bg-white/10 rounded-lg p-3">
                <p className="text-sky-100 text-xs uppercase tracking-wide">Pulizie analizzate</p>
                <p className="text-2xl font-bold">{data.totalCleanings}</p>
              </div>
              <div className="bg-white/10 rounded-lg p-3">
                <p className="text-sky-100 text-xs uppercase tracking-wide">Durata media</p>
                <p className="text-2xl font-bold">{formatDuration(data.overall.avgMinutes)}</p>
              </div>
              <div className="bg-white/10 rounded-lg p-3">
                <p className="text-sky-100 text-xs uppercase tracking-wide">Minima</p>
                <p className="text-2xl font-bold">{formatDuration(data.overall.minMinutes)}</p>
              </div>
              <div className="bg-white/10 rounded-lg p-3">
                <p className="text-sky-100 text-xs uppercase tracking-wide">Massima</p>
                <p className="text-2xl font-bold">{formatDuration(data.overall.maxMinutes)}</p>
              </div>
              <div className="bg-white/10 rounded-lg p-3">
                <p className="text-sky-100 text-xs uppercase tracking-wide">Dev. Standard</p>
                <p className="text-2xl font-bold">±{data.overall.stdDeviation} min</p>
              </div>
              <div className="bg-white/10 rounded-lg p-3">
                <p className="text-sky-100 text-xs uppercase tracking-wide">Periodo</p>
                <p className="text-2xl font-bold">{data.period.months} mesi</p>
              </div>
            </div>
          </div>

          {/* ─── LEGENDA PERCENTILI ─── */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
            <h3 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
              ℹ️ Come leggere i percentili
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="bg-white rounded-lg p-3 border border-blue-100">
                <span className="font-mono font-bold text-blue-600">P25</span>
                <p className="text-slate-600 text-xs mt-1">Il 25% delle pulizie finisce prima di questo tempo</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-blue-100">
                <span className="font-mono font-bold text-blue-600">P50</span>
                <p className="text-slate-600 text-xs mt-1">Mediana: metà finisce prima, metà dopo</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-emerald-200 border-2">
                <span className="font-mono font-bold text-emerald-600">P75 ⭐</span>
                <p className="text-slate-600 text-xs mt-1">Il 75% finisce prima - <strong>consigliato</strong></p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-blue-100">
                <span className="font-mono font-bold text-blue-600">P90</span>
                <p className="text-slate-600 text-xs mt-1">Il 90% finisce prima - molto conservativo</p>
              </div>
            </div>
          </div>

          {/* ─── TABS ─── */}
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
            {[
              { id: "overview", label: "📊 Panoramica", icon: "📊" },
              { id: "details", label: "🏠 Per Proprietà", icon: "🏠" },
              { id: "operators", label: "👷 Operatori", icon: "👷" },
              { id: "history", label: "📜 Storico", icon: "📜" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? "bg-sky-500 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ─── TAB: PANORAMICA ─── */}
          {activeTab === "overview" && (
            <>
              {/* Statistiche per tipo servizio */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
                <h3 className="font-semibold text-slate-800 mb-4">🧹 Per Tipo Servizio</h3>
                
                {Object.keys(data.byServiceType).length === 0 ? (
                  <p className="text-slate-500 text-center py-4">Nessun dato per tipo servizio</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left px-3 py-2 rounded-tl-lg">Tipo</th>
                          <th className="text-right px-3 py-2">Campioni</th>
                          <th className="text-right px-3 py-2">Media</th>
                          <th className="text-right px-3 py-2 text-blue-600">P25</th>
                          <th className="text-right px-3 py-2 text-blue-600">P50</th>
                          <th className="text-right px-3 py-2 text-emerald-600 font-bold">P75 ⭐</th>
                          <th className="text-right px-3 py-2 text-blue-600">P90</th>
                          <th className="text-right px-3 py-2 rounded-tr-lg">Min-Max</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {Object.entries(data.byServiceType).map(([code, stats]) => (
                          <tr key={code} className="hover:bg-slate-50">
                            <td className="px-3 py-3 font-medium">
                              <span className="mr-2">
                                {code === "STANDARD" ? "🧹" : code === "APPROFONDITA" ? "✨" : "🔴"}
                              </span>
                              {code}
                            </td>
                            <td className="px-3 py-3 text-right">
                              <span className="bg-slate-100 px-2 py-1 rounded-full text-xs font-medium">
                                {stats.count}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right font-mono">{formatDuration(stats.avgMinutes)}</td>
                            <td className="px-3 py-3 text-right font-mono text-blue-600">{formatDuration(stats.p25)}</td>
                            <td className="px-3 py-3 text-right font-mono text-blue-600">{formatDuration(stats.p50)}</td>
                            <td className="px-3 py-3 text-right font-mono text-emerald-600 font-bold bg-emerald-50">{formatDuration(stats.p75)}</td>
                            <td className="px-3 py-3 text-right font-mono text-blue-600">{formatDuration(stats.p90)}</td>
                            <td className="px-3 py-3 text-right text-slate-500 text-xs">
                              {formatDuration(stats.minMinutes)} - {formatDuration(stats.maxMinutes)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Suggerimenti */}
              {data.suggestions.serviceTypes.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                    <div>
                      <h3 className="font-semibold text-amber-800">💡 Suggerimenti Aggiornamento</h3>
                      <p className="text-sm text-amber-600">Basati sul P{percentile} delle durate reali</p>
                    </div>
                    <button
                      onClick={handleApplyEstimates}
                      disabled={applying}
                      className="px-4 py-2 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
                    >
                      {applying ? "⏳ Applicando..." : "✅ Applica stime"}
                    </button>
                  </div>
                  
                  <div className="space-y-2">
                    {data.suggestions.serviceTypes.map((sug) => (
                      <div key={sug.code} className="bg-white rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">
                            {sug.code === "STANDARD" ? "🧹" : sug.code === "APPROFONDITA" ? "✨" : "🔴"}
                          </span>
                          <div>
                            <p className="font-medium text-slate-800">{sug.code}</p>
                            <p className="text-xs text-slate-500">
                              {sug.basedOnSamples} campioni • Affidabilità: <span className={
                                sug.confidence === "alta" ? "text-emerald-600" :
                                sug.confidence === "media" ? "text-amber-600" : "text-red-600"
                              }>{sug.confidence}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-center">
                            <p className="text-xs text-slate-500">Attuale</p>
                            <p className="font-mono text-lg">{sug.currentEstimate} min</p>
                          </div>
                          <span className="text-2xl text-slate-300">→</span>
                          <div className="text-center">
                            <p className="text-xs text-emerald-600">Suggerito (P{percentile})</p>
                            <p className="font-mono text-lg font-bold text-emerald-700">{sug.suggestedEstimate} min</p>
                          </div>
                          <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                            sug.suggestedEstimate > sug.currentEstimate 
                              ? "bg-red-100 text-red-700" 
                              : sug.suggestedEstimate < sug.currentEstimate
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                          }`}>
                            {sug.suggestedEstimate > sug.currentEstimate ? "+" : ""}
                            {sug.suggestedEstimate - sug.currentEstimate} min
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 pt-4 border-t border-amber-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="bg-white rounded-lg p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">🛏️</span>
                        <span className="text-slate-700">Tempo extra per camera</span>
                      </div>
                      <span className="font-mono font-bold text-sky-600">+{data.suggestions.extraTimePerRoom} min</span>
                    </div>
                    <div className="bg-white rounded-lg p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">🚿</span>
                        <span className="text-slate-700">Tempo extra per bagno</span>
                      </div>
                      <span className="font-mono font-bold text-sky-600">+{data.suggestions.extraTimePerBathroom} min</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Per numero stanze */}
              {Object.keys(data.byRoomCount).length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-800 mb-4">🏠 Per Dimensione Appartamento</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Object.entries(data.byRoomCount)
                      .sort((a, b) => a[1].avgMinutes - b[1].avgMinutes)
                      .map(([combo, stats]) => (
                        <div key={combo} className="bg-slate-50 rounded-lg p-3">
                          <div className="flex justify-between items-start mb-2">
                            <span className="font-medium text-slate-800">{stats.label}</span>
                            <span className="text-xs bg-slate-200 px-2 py-0.5 rounded-full">{stats.count} pulizie</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Media:</span>
                            <span className="font-mono">{formatDuration(stats.avgMinutes)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-emerald-600">P75:</span>
                            <span className="font-mono font-bold text-emerald-700">{formatDuration(stats.p75)}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ─── TAB: PER PROPRIETÀ ─── */}
          {activeTab === "details" && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-800 mb-4">🏠 Statistiche per Proprietà</h3>
              {Object.keys(data.byProperty).length === 0 ? (
                <p className="text-slate-500 text-center py-8">Nessun dato per proprietà</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(data.byProperty)
                    .sort((a, b) => b[1].count - a[1].count)
                    .map(([id, stats]) => (
                      <div key={id} className="bg-slate-50 rounded-lg p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-slate-800">{stats.name}</p>
                            <p className="text-xs text-slate-500">{stats.count} pulizie completate</p>
                          </div>
                          <div className="grid grid-cols-4 gap-4 text-center">
                            <div>
                              <p className="text-xs text-slate-500">Media</p>
                              <p className="font-mono">{formatDuration(stats.avgMinutes)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-blue-500">P50</p>
                              <p className="font-mono">{formatDuration(stats.p50)}</p>
                            </div>
                            <div className="bg-emerald-100 rounded p-1">
                              <p className="text-xs text-emerald-600">P75 ⭐</p>
                              <p className="font-mono font-bold text-emerald-700">{formatDuration(stats.p75)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-blue-500">P90</p>
                              <p className="font-mono">{formatDuration(stats.p90)}</p>
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-sky-400 to-sky-600 rounded-full transition-all"
                            style={{ width: `${Math.min(100, (stats.avgMinutes / 180) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* ─── TAB: OPERATORI ─── */}
          {activeTab === "operators" && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-800 mb-4">👷 Efficienza Operatori</h3>
              <p className="text-sm text-slate-500 mb-4">
                Efficienza 100 = media • &gt;100 = più veloce • &lt;100 = più lento
              </p>
              {Object.keys(data.byOperator).length === 0 ? (
                <p className="text-slate-500 text-center py-8">Nessun dato per operatori</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(data.byOperator)
                    .sort((a, b) => b[1].efficiency - a[1].efficiency)
                    .map(([id, stats]) => (
                      <div key={id} className="bg-slate-50 rounded-lg p-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold ${
                            stats.efficiency >= 110 ? "bg-emerald-100 text-emerald-700" :
                            stats.efficiency >= 90 ? "bg-sky-100 text-sky-700" :
                            "bg-amber-100 text-amber-700"
                          }`}>
                            {stats.efficiency}%
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-800 truncate">{stats.name}</p>
                            <p className="text-xs text-slate-500">{stats.count} pulizie</p>
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                          <div className="bg-white rounded p-2">
                            <p className="text-slate-500">Media</p>
                            <p className="font-mono font-medium">{formatDuration(stats.avgMinutes)}</p>
                          </div>
                          <div className="bg-emerald-50 rounded p-2">
                            <p className="text-emerald-600">P75</p>
                            <p className="font-mono font-bold text-emerald-700">{formatDuration(stats.p75)}</p>
                          </div>
                          <div className="bg-white rounded p-2">
                            <p className="text-slate-500">Dev.Std</p>
                            <p className="font-mono font-medium">±{stats.stdDeviation}m</p>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* ─── TAB: STORICO ─── */}
          {activeTab === "history" && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-800 mb-4">📜 Ultime 50 Pulizie Completate</h3>
              {!data.recentCleanings || data.recentCleanings.length === 0 ? (
                <p className="text-slate-500 text-center py-8">Nessuno storico disponibile</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-3 py-2">Data</th>
                        <th className="text-left px-3 py-2">Proprietà</th>
                        <th className="text-left px-3 py-2">Operatore</th>
                        <th className="text-left px-3 py-2">Tipo</th>
                        <th className="text-right px-3 py-2">Durata</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.recentCleanings.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-mono text-slate-600">{c.date}</td>
                          <td className="px-3 py-2 truncate max-w-[200px]">{c.property}</td>
                          <td className="px-3 py-2 truncate max-w-[150px]">{c.operator}</td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              c.type === "STANDARD" ? "bg-blue-100 text-blue-700" :
                              c.type === "APPROFONDITA" ? "bg-purple-100 text-purple-700" :
                              "bg-red-100 text-red-700"
                            }`}>
                              {c.type}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-medium">{formatDuration(c.duration)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
