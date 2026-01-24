"use client";

import { useState, useEffect } from "react";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface PropertyDurationData {
  propertyId: string;
  propertyName: string;
  bedrooms: number;
  bathrooms: number;
  cleaningsCount: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  p75Duration: number;
  lastUpdated: string;
}

interface GlobalStats {
  key: string;
  bedrooms: number;
  bathrooms: number;
  cleaningsCount: number;
  avgDuration: number;
  p75Duration: number;
}

interface DurationData {
  property: PropertyDurationData | null;
  globalForSize: GlobalStats | null;
  comparison: { diff: number; status: "faster" | "slower" | "same" } | null;
  message: string;
}

interface Props {
  propertyId: string;
  bedrooms: number;
  bathrooms: number;
  isAdmin?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTE
// ═══════════════════════════════════════════════════════════════

export default function PropertyDurationStats({ propertyId, bedrooms, bathrooms, isAdmin = false }: Props) {
  const [data, setData] = useState<DurationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── CARICA DATI ───
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/analytics/property-duration?propertyId=${propertyId}`);
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
  };

  useEffect(() => {
    if (propertyId) {
      loadData();
    }
  }, [propertyId]);

  // ─── RICALCOLA ───
  const handleRecalculate = async () => {
    if (!isAdmin) return;
    
    try {
      setRecalculating(true);
      
      const response = await fetch("/api/analytics/property-duration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId }),
      });

      if (response.ok) {
        loadData(); // Ricarica i dati
      }
    } catch {
      setError("Errore ricalcolo");
    } finally {
      setRecalculating(false);
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
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
        <div className="h-4 bg-slate-200 rounded w-1/3 mb-3"></div>
        <div className="h-8 bg-slate-200 rounded w-1/2 mb-2"></div>
        <div className="h-3 bg-slate-200 rounded w-2/3"></div>
      </div>
    );
  }

  // ─── ERROR ───
  if (error) {
    return (
      <div className="bg-red-50 rounded-xl border border-red-200 p-4">
        <p className="text-sm text-red-700">❌ {error}</p>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
      {/* ─── HEADER ─── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
            <span className="text-lg">⏱️</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Durata Pulizie</p>
            <p className="text-[10px] text-slate-500">Statistiche tempi reali</p>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={handleRecalculate}
            disabled={recalculating}
            className="px-3 py-1.5 text-xs bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors"
          >
            {recalculating ? "⏳" : "🔄"} Ricalcola
          </button>
        )}
      </div>

      {/* ─── DURATA MEDIA PROPRIETÀ ─── */}
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-4">
        <p className="text-xs font-medium text-purple-700 mb-2">📊 Media questa proprietà</p>
        
        {data?.property ? (
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-purple-900">
                {formatDuration(data.property.avgDuration)}
              </span>
              <span className="text-sm text-purple-600">media</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div className="bg-white/60 rounded-lg p-2">
                <p className="text-lg font-semibold text-slate-800">{data.property.cleaningsCount}</p>
                <p className="text-[9px] text-slate-500 uppercase">Pulizie</p>
              </div>
              <div className="bg-white/60 rounded-lg p-2">
                <p className="text-lg font-semibold text-slate-800">{formatDuration(data.property.minDuration)}</p>
                <p className="text-[9px] text-slate-500 uppercase">Min</p>
              </div>
              <div className="bg-white/60 rounded-lg p-2">
                <p className="text-lg font-semibold text-slate-800">{formatDuration(data.property.maxDuration)}</p>
                <p className="text-[9px] text-slate-500 uppercase">Max</p>
              </div>
            </div>
            <div className="mt-2 text-center bg-purple-100 rounded-lg p-2">
              <p className="text-[10px] text-purple-600">P75 (75% finisce entro)</p>
              <p className="text-lg font-bold text-purple-800">{formatDuration(data.property.p75Duration)}</p>
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-4xl mb-2">📭</p>
            <p className="text-sm text-purple-700">Nessuna pulizia completata</p>
            <p className="text-xs text-purple-500">I dati appariranno dopo le prime pulizie</p>
          </div>
        )}
      </div>

      {/* ─── CONFRONTO CON APPARTAMENTI SIMILI ─── */}
      <div className="bg-slate-50 rounded-xl p-4">
        <p className="text-xs font-medium text-slate-700 mb-2">
          🏠 Confronto appartamenti simili ({bedrooms} cam, {bathrooms} bagn{bathrooms > 1 ? 'i' : 'o'})
        </p>
        
        {data?.globalForSize ? (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[10px] text-slate-500">Media generale</p>
                <p className="text-xl font-bold text-slate-800">{formatDuration(data.globalForSize.avgDuration)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-500">Basata su</p>
                <p className="text-sm font-semibold text-slate-600">{data.globalForSize.cleaningsCount} pulizie</p>
              </div>
            </div>

            {/* ─── CONFRONTO ─── */}
            {data?.property && data?.comparison && (
              <div className={`rounded-lg p-3 flex items-center justify-between ${
                data.comparison.status === "faster" ? "bg-emerald-100" :
                data.comparison.status === "slower" ? "bg-amber-100" :
                "bg-blue-100"
              }`}>
                <div className="flex items-center gap-2">
                  <span className="text-xl">
                    {data.comparison.status === "faster" ? "🚀" :
                     data.comparison.status === "slower" ? "🐢" : "⚖️"}
                  </span>
                  <div>
                    <p className={`text-sm font-medium ${
                      data.comparison.status === "faster" ? "text-emerald-800" :
                      data.comparison.status === "slower" ? "text-amber-800" :
                      "text-blue-800"
                    }`}>
                      {data.comparison.status === "faster" ? "Più veloce della media" :
                       data.comparison.status === "slower" ? "Più lenta della media" :
                       "Nella media"}
                    </p>
                    <p className={`text-xs ${
                      data.comparison.status === "faster" ? "text-emerald-600" :
                      data.comparison.status === "slower" ? "text-amber-600" :
                      "text-blue-600"
                    }`}>
                      {data.comparison.diff > 0 ? "+" : ""}{data.comparison.diff} min rispetto alla media
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-3">
            <p className="text-sm text-slate-500">Nessun dato per appartamenti simili</p>
          </div>
        )}
      </div>

      {/* ─── LEGENDA ─── */}
      <div className="text-[9px] text-slate-400 text-center">
        I tempi sono calcolati automaticamente dalle pulizie completate (escludendo anomalie &lt;15min o &gt;8h)
      </div>
    </div>
  );
}
