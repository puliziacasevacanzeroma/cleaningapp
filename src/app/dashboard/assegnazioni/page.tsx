"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, query, where, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

// ═══════════════════════════════════════════════════════════════
// TIPI
// ═══════════════════════════════════════════════════════════════

interface Cleaning {
  id: string;
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
  scheduledDate: Date;
  scheduledTime?: string;
  status: string;
  operatorId?: string;
  operatorName?: string;
  checkInTime?: string;
}

interface Suggestion {
  operatorId: string;
  operatorName: string;
  totalScore: number;
  rank: number;
  medal: string | null;
  breakdown: {
    proximity: { score: number; maxScore: number; details: string; distanceKm: number | null };
    familiarity: { score: number; maxScore: number; details: string; previousCleanings: number };
    workload: { score: number; maxScore: number; details: string; todayCleanings: number };
    performance: { score: number; maxScore: number; details: string; rating: number };
  };
  warnings: string[];
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPALE
// ═══════════════════════════════════════════════════════════════

export default function AssegnazioniPage() {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [cleanings, setCleanings] = useState<Cleaning[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"pending" | "assigned">("pending");
  const [selectedCleaningId, setSelectedCleaningId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [assigningAll, setAssigningAll] = useState(false);
  const [expandedOperatorId, setExpandedOperatorId] = useState<string | null>(null);

  // Stats
  const pendingCount = cleanings.filter(c => !c.operatorId && !["COMPLETED", "CANCELLED"].includes(c.status)).length;
  const assignedCount = cleanings.filter(c => c.operatorId && !["COMPLETED", "CANCELLED"].includes(c.status)).length;

  // Carica pulizie
  useEffect(() => {
    if (!selectedDate) return;
    const date = new Date(selectedDate);
    const startOfDay = new Date(date); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date); endOfDay.setHours(23, 59, 59, 999);

    const q = query(
      collection(db, "cleanings"),
      where("scheduledDate", ">=", Timestamp.fromDate(startOfDay)),
      where("scheduledDate", "<=", Timestamp.fromDate(endOfDay))
    );

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        scheduledDate: d.data().scheduledDate?.toDate() || new Date(),
      } as Cleaning)).sort((a, b) => (a.scheduledTime || "10:00").localeCompare(b.scheduledTime || "10:00"));
      setCleanings(data);
      setLoading(false);
    });
    return () => unsub();
  }, [selectedDate]);

  // Carica suggerimenti
  const loadSuggestions = useCallback(async (cleaningId: string) => {
    if (selectedCleaningId === cleaningId) {
      setSelectedCleaningId(null);
      setSuggestions([]);
      return;
    }
    setSelectedCleaningId(cleaningId);
    setLoadingSuggestions(true);
    setExpandedOperatorId(null);
    try {
      const res = await fetch(`/api/cleanings/${cleaningId}/suggestions?limit=5`);
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSuggestions(false);
    }
  }, [selectedCleaningId]);

  // Assegna operatore
  const handleAssign = async (cleaningId: string, operatorId: string) => {
    try {
      const res = await fetch(`/api/cleanings/${cleaningId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorId }),
      });
      if (res.ok) {
        setSelectedCleaningId(null);
        setSuggestions([]);
      }
    } catch (e) {
      alert("Errore assegnazione");
    }
  };

  // Assegna tutte
  const handleAssignAll = async () => {
    const pending = cleanings.filter(c => !c.operatorId && !["COMPLETED", "CANCELLED"].includes(c.status));
    if (!pending.length || !confirm(`Assegnare ${pending.length} pulizie automaticamente?`)) return;
    
    setAssigningAll(true);
    let ok = 0, err = 0;
    for (const c of pending) {
      try {
        const res = await fetch(`/api/cleanings/${c.id}/suggestions?limit=1`);
        if (res.ok) {
          const data = await res.json();
          if (data.suggestions?.[0]) {
            await handleAssign(c.id, data.suggestions[0].operatorId);
            ok++;
          } else err++;
        } else err++;
        await new Promise(r => setTimeout(r, 200));
      } catch { err++; }
    }
    setAssigningAll(false);
    alert(`✅ ${ok} assegnate\n❌ ${err} errori`);
  };

  // Filtra
  const filtered = cleanings.filter(c => {
    if (activeTab === "pending") return !c.operatorId && !["COMPLETED", "CANCELLED"].includes(c.status);
    return c.operatorId && !["COMPLETED", "CANCELLED"].includes(c.status);
  });

  // Formatta data
  const formatDateShort = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
  };

  const changeDate = (delta: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-slate-100 pb-24">
      {/* HEADER */}
      <div className="bg-white px-4 pt-4 pb-3 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800">🎯 Assegnazioni</h1>
            <p className="text-sm text-slate-500 capitalize">{formatDateShort(selectedDate)}</p>
          </div>
        </div>

        {/* Date Navigator */}
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => changeDate(-1)} className="w-10 h-10 flex items-center justify-center bg-slate-100 rounded-xl">
            <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="flex-1 h-10 px-3 bg-slate-100 rounded-xl text-sm font-medium text-center border-0"
          />
          <button onClick={() => changeDate(1)} className="w-10 h-10 flex items-center justify-center bg-slate-100 rounded-xl">
            <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            onClick={() => setSelectedDate(new Date().toISOString().split("T")[0])}
            className="h-10 px-4 bg-blue-500 text-white rounded-xl text-sm font-semibold"
          >
            Oggi
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("pending")}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === "pending"
                ? "bg-amber-500 text-white shadow-lg shadow-amber-500/30"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            Da fare ({pendingCount})
          </button>
          <button
            onClick={() => setActiveTab("assigned")}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === "assigned"
                ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            Assegnate ({assignedCount})
          </button>
        </div>
      </div>

      {/* CONTENT */}
      <div className="p-4 space-y-3">
        {/* Auto Assign Button */}
        {activeTab === "pending" && pendingCount > 0 && (
          <button
            onClick={handleAssignAll}
            disabled={assigningAll}
            className="w-full py-3.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-2xl font-semibold shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {assigningAll ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Assegnazione...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Assegna tutte automaticamente
              </>
            )}
          </button>
        )}

        {/* Loading */}
        {loading ? (
          <div className="bg-white rounded-2xl p-8 text-center">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-slate-500 text-sm">Caricamento...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center">
            <div className="text-4xl mb-2">{activeTab === "pending" ? "🎉" : "📋"}</div>
            <p className="font-semibold text-slate-700">
              {activeTab === "pending" ? "Tutto assegnato!" : "Nessuna pulizia"}
            </p>
          </div>
        ) : (
          filtered.map((cleaning) => (
            <CleaningCard
              key={cleaning.id}
              cleaning={cleaning}
              isOpen={selectedCleaningId === cleaning.id}
              onToggle={() => loadSuggestions(cleaning.id)}
              suggestions={suggestions}
              loading={loadingSuggestions && selectedCleaningId === cleaning.id}
              onAssign={(opId) => handleAssign(cleaning.id, opId)}
              expandedOperatorId={expandedOperatorId}
              setExpandedOperatorId={setExpandedOperatorId}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CARD PULIZIA
// ═══════════════════════════════════════════════════════════════

function CleaningCard({
  cleaning,
  isOpen,
  onToggle,
  suggestions,
  loading,
  onAssign,
  expandedOperatorId,
  setExpandedOperatorId,
}: {
  cleaning: Cleaning;
  isOpen: boolean;
  onToggle: () => void;
  suggestions: Suggestion[];
  loading: boolean;
  onAssign: (operatorId: string) => void;
  expandedOperatorId: string | null;
  setExpandedOperatorId: (id: string | null) => void;
}) {
  const isPending = !cleaning.operatorId;

  return (
    <div className={`bg-white rounded-2xl overflow-hidden shadow-sm ${isPending ? "border-l-4 border-amber-400" : "border-l-4 border-emerald-400"}`}>
      {/* Header */}
      <div className="p-4" onClick={onToggle}>
        <div className="flex items-start gap-3">
          {/* Time Badge */}
          <div className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center ${isPending ? "bg-amber-50" : "bg-emerald-50"}`}>
            <span className={`text-lg font-bold ${isPending ? "text-amber-600" : "text-emerald-600"}`}>
              {cleaning.scheduledTime?.split(":")[0] || "10"}
            </span>
            <span className={`text-xs ${isPending ? "text-amber-500" : "text-emerald-500"}`}>
              :{cleaning.scheduledTime?.split(":")[1] || "00"}
            </span>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-800 truncate">{cleaning.propertyName}</h3>
            <p className="text-sm text-slate-500 truncate">{cleaning.propertyAddress}</p>
            {cleaning.checkInTime && (
              <p className="text-xs text-emerald-600 mt-1">Check-in ore {cleaning.checkInTime}</p>
            )}
            {cleaning.operatorId && (
              <div className="flex items-center gap-2 mt-2">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-xs font-bold">
                  {cleaning.operatorName?.charAt(0) || "?"}
                </div>
                <span className="text-sm font-medium text-slate-700">{cleaning.operatorName}</span>
              </div>
            )}
          </div>

          {/* Action */}
          <button className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${isPending ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
            {isPending ? "Assegna" : "Modifica"}
          </button>
        </div>
      </div>

      {/* Suggestions Panel */}
      {isOpen && (
        <div className="border-t border-slate-100 bg-slate-50">
          <div className="p-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              🎯 Operatori consigliati
            </p>

            {loading ? (
              <div className="py-6 text-center">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-sm text-slate-500">Calcolo migliori...</p>
              </div>
            ) : suggestions.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">Nessun operatore disponibile</p>
            ) : (
              <div className="space-y-2">
                {suggestions.map((sug) => (
                  <OperatorCard
                    key={sug.operatorId}
                    suggestion={sug}
                    isExpanded={expandedOperatorId === sug.operatorId}
                    onToggle={() => setExpandedOperatorId(expandedOperatorId === sug.operatorId ? null : sug.operatorId)}
                    onAssign={() => onAssign(sug.operatorId)}
                    isCurrent={cleaning.operatorId === sug.operatorId}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CARD OPERATORE
// ═══════════════════════════════════════════════════════════════

function OperatorCard({
  suggestion,
  isExpanded,
  onToggle,
  onAssign,
  isCurrent,
}: {
  suggestion: Suggestion;
  isExpanded: boolean;
  onToggle: () => void;
  onAssign: () => void;
  isCurrent: boolean;
}) {
  const { breakdown } = suggestion;
  
  const getBgColor = (rank: number) => {
    if (rank === 1) return "from-amber-400 to-orange-500";
    if (rank === 2) return "from-slate-400 to-slate-500";
    if (rank === 3) return "from-amber-600 to-amber-700";
    return "from-slate-500 to-slate-600";
  };

  const getScoreColor = (score: number) => {
    if (score >= 75) return "text-emerald-600 bg-emerald-50";
    if (score >= 50) return "text-blue-600 bg-blue-50";
    return "text-amber-600 bg-amber-50";
  };

  return (
    <div className={`bg-white rounded-xl overflow-hidden ${isCurrent ? "ring-2 ring-emerald-400" : ""}`}>
      {/* Main Row */}
      <div className="p-3 flex items-center gap-3">
        {/* Medal + Avatar */}
        <div className="relative">
          <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${getBgColor(suggestion.rank)} flex items-center justify-center text-white font-bold`}>
            {suggestion.operatorName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          {suggestion.medal && (
            <span className="absolute -top-1 -left-1 text-sm">{suggestion.medal}</span>
          )}
        </div>

        {/* Name & Info */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800 truncate">{suggestion.operatorName}</p>
          <p className="text-xs text-slate-500">
            {breakdown.workload.todayCleanings} pulizie oggi
            {breakdown.proximity.distanceKm !== null && ` • ${breakdown.proximity.distanceKm}km`}
          </p>
        </div>

        {/* Score */}
        <div className={`px-2.5 py-1 rounded-lg font-bold text-lg ${getScoreColor(suggestion.totalScore)}`}>
          {suggestion.totalScore}
        </div>

        {/* Assign Button */}
        {!isCurrent ? (
          <button
            onClick={(e) => { e.stopPropagation(); onAssign(); }}
            className="w-10 h-10 rounded-xl bg-blue-500 text-white flex items-center justify-center"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </button>
        ) : (
          <span className="text-xs text-emerald-600 font-semibold">Attuale</span>
        )}
      </div>

      {/* Toggle Details */}
      <button
        onClick={onToggle}
        className="w-full py-2 bg-slate-50 text-xs text-slate-500 font-medium flex items-center justify-center gap-1 border-t border-slate-100"
      >
        {isExpanded ? "Nascondi dettagli" : "Vedi perché"}
        <svg className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="p-3 bg-slate-50 border-t border-slate-100 space-y-3">
          <ScoreItem icon="📍" label="Prossimità" score={breakdown.proximity.score} max={breakdown.proximity.maxScore} detail={breakdown.proximity.details} color="blue" />
          <ScoreItem icon="🏠" label="Familiarità" score={breakdown.familiarity.score} max={breakdown.familiarity.maxScore} detail={breakdown.familiarity.details} color="emerald" />
          <ScoreItem icon="📋" label="Carico" score={breakdown.workload.score} max={breakdown.workload.maxScore} detail={breakdown.workload.details} color="amber" />
          <ScoreItem icon="⭐" label="Performance" score={breakdown.performance.score} max={breakdown.performance.maxScore} detail={breakdown.performance.details} color="purple" />
          
          {suggestion.warnings.length > 0 && (
            <div className="pt-2 border-t border-slate-200">
              <p className="text-xs text-amber-600">⚠️ {suggestion.warnings.join(" • ")}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SCORE ITEM
// ═══════════════════════════════════════════════════════════════

function ScoreItem({
  icon,
  label,
  score,
  max,
  detail,
  color,
}: {
  icon: string;
  label: string;
  score: number;
  max: number;
  detail: string;
  color: string;
}) {
  const pct = Math.round((score / max) * 100);
  
  const colorClasses: Record<string, string> = {
    blue: "bg-blue-500",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    purple: "bg-purple-500",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-slate-700 flex items-center gap-1">
          <span>{icon}</span> {label}
        </span>
        <span className="text-xs font-bold text-slate-800">{score}/{max}</span>
      </div>
      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mb-1">
        <div className={`h-full rounded-full ${colorClasses[color]}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-slate-500">{detail}</p>
    </div>
  );
}
