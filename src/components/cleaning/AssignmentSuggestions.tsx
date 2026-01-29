"use client";

import { useState, useEffect } from "react";
import type { AssignmentScore } from "~/lib/assignments";

interface AssignmentSuggestionsProps {
  cleaningId: string;
  onAssign: (operatorId: string, operatorName: string) => Promise<void>;
  currentOperatorId?: string;
  onClose?: () => void;
}

interface SuggestionWithRank extends AssignmentScore {
  rank: number;
  medal: string | null;
}

interface SuggestionsResponse {
  suggestions: SuggestionWithRank[];
  cleaning: {
    id: string;
    propertyName: string;
    propertyAddress: string;
    hasCoordinates: boolean;
    scheduledDate: string;
    scheduledTime?: string;
    currentOperatorId?: string;
    currentOperatorName?: string;
    status: string;
  };
  stats: {
    totalOperators: number;
    operatorsWithAssignments: number;
    averageWorkload: number;
    date: string;
  };
}

export default function AssignmentSuggestions({
  cleaningId,
  onAssign,
  currentOperatorId,
  onClose,
}: AssignmentSuggestionsProps) {
  const [data, setData] = useState<SuggestionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Carica suggerimenti
  useEffect(() => {
    const fetchSuggestions = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/cleanings/${cleaningId}/suggestions`);
        
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || "Errore caricamento suggerimenti");
        }

        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore sconosciuto");
      } finally {
        setLoading(false);
      }
    };

    fetchSuggestions();
  }, [cleaningId]);

  // Assegna operatore
  const handleAssign = async (operatorId: string, operatorName: string) => {
    try {
      setAssigning(operatorId);
      await onAssign(operatorId, operatorName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore assegnazione");
    } finally {
      setAssigning(null);
    }
  };

  // Score bar component
  const ScoreBar = ({ score, max, color }: { score: number; max: number; color: string }) => {
    const percentage = (score / max) * 100;
    return (
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    );
  };

  // Loading state
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center justify-center gap-3">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-600">Calcolo suggerimenti...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-red-200 p-6">
        <div className="flex items-center gap-3 text-red-600">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="mt-3 text-sm text-blue-600 hover:underline"
        >
          Riprova
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { suggestions, cleaning, stats } = data;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span>🎯</span> Suggerimenti Assegnazione
            </h3>
            <p className="text-blue-100 text-sm mt-1">
              {cleaning.propertyName} • {new Date(cleaning.scheduledDate).toLocaleDateString("it-IT", {
                weekday: "short",
                day: "numeric",
                month: "short"
              })}
              {cleaning.scheduledTime && ` ore ${cleaning.scheduledTime}`}
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-white/70 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="flex gap-4 mt-3">
          <div className="bg-white/10 rounded-lg px-3 py-1.5">
            <span className="text-xs text-blue-100">Operatori</span>
            <span className="block text-white font-bold">{stats.totalOperators}</span>
          </div>
          <div className="bg-white/10 rounded-lg px-3 py-1.5">
            <span className="text-xs text-blue-100">Con pulizie oggi</span>
            <span className="block text-white font-bold">{stats.operatorsWithAssignments}</span>
          </div>
          <div className="bg-white/10 rounded-lg px-3 py-1.5">
            <span className="text-xs text-blue-100">Media pulizie</span>
            <span className="block text-white font-bold">{stats.averageWorkload}</span>
          </div>
        </div>

        {/* Warning se mancano coordinate */}
        {!cleaning.hasCoordinates && (
          <div className="mt-3 bg-amber-400/20 border border-amber-400/30 rounded-lg px-3 py-2">
            <p className="text-sm text-amber-100 flex items-center gap-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Proprietà senza coordinate - il calcolo distanze non è ottimale
            </p>
          </div>
        )}
      </div>

      {/* Suggestions List */}
      {suggestions.length === 0 ? (
        <div className="p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <p className="text-slate-600 font-medium">Nessun operatore disponibile</p>
          <p className="text-sm text-slate-500 mt-1">Aggiungi operatori per vedere i suggerimenti</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {suggestions.map((suggestion) => {
            const isExpanded = expandedId === suggestion.operatorId;
            const isCurrentOperator = suggestion.operatorId === currentOperatorId;
            const isAssigning = assigning === suggestion.operatorId;

            return (
              <div
                key={suggestion.operatorId}
                className={`p-4 transition-colors ${isCurrentOperator ? "bg-emerald-50" : "hover:bg-slate-50"}`}
              >
                {/* Main Row */}
                <div className="flex items-center gap-4">
                  {/* Medal/Rank */}
                  <div className="flex-shrink-0 w-10 text-center">
                    {suggestion.medal ? (
                      <span className="text-2xl">{suggestion.medal}</span>
                    ) : (
                      <span className="text-lg font-bold text-slate-400">#{suggestion.rank}</span>
                    )}
                  </div>

                  {/* Avatar */}
                  <div className={`
                    w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold
                    ${suggestion.rank === 1 ? "bg-gradient-to-br from-amber-400 to-orange-500" :
                      suggestion.rank === 2 ? "bg-gradient-to-br from-slate-400 to-slate-500" :
                      suggestion.rank === 3 ? "bg-gradient-to-br from-amber-600 to-amber-700" :
                      "bg-gradient-to-br from-slate-500 to-slate-600"}
                  `}>
                    {suggestion.operatorName
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-800 truncate">
                        {suggestion.operatorName}
                      </p>
                      {isCurrentOperator && (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded-full">
                          Assegnato
                        </span>
                      )}
                      {suggestion.isRecommended && !isCurrentOperator && (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                          Consigliato
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500">
                      {suggestion.breakdown.workload.todayCleanings} pulizie oggi
                      {suggestion.breakdown.proximity.distanceKm !== null && (
                        <> • {suggestion.breakdown.proximity.distanceKm} km</>
                      )}
                    </p>
                  </div>

                  {/* Score */}
                  <div className="flex-shrink-0 text-right">
                    <div className={`
                      text-2xl font-bold
                      ${suggestion.totalScore >= 80 ? "text-emerald-600" :
                        suggestion.totalScore >= 60 ? "text-blue-600" :
                        suggestion.totalScore >= 40 ? "text-amber-600" :
                        "text-slate-500"}
                    `}>
                      {suggestion.totalScore}
                    </div>
                    <p className="text-xs text-slate-400">/ 100</p>
                  </div>

                  {/* Actions */}
                  <div className="flex-shrink-0 flex items-center gap-2">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : suggestion.operatorId)}
                      className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                      title="Mostra dettagli"
                    >
                      <svg
                        className={`w-5 h-5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {!isCurrentOperator && (
                      <button
                        onClick={() => handleAssign(suggestion.operatorId, suggestion.operatorName)}
                        disabled={isAssigning}
                        className={`
                          px-4 py-2 rounded-xl font-medium transition-all
                          ${isAssigning
                            ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                            : "bg-blue-500 text-white hover:bg-blue-600 hover:shadow-md"}
                        `}
                      >
                        {isAssigning ? (
                          <span className="flex items-center gap-2">
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            ...
                          </span>
                        ) : (
                          "Assegna"
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Warnings */}
                {suggestion.warnings.length > 0 && (
                  <div className="mt-2 ml-14 flex flex-wrap gap-2">
                    {suggestion.warnings.map((warning, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 bg-amber-50 text-amber-700 text-xs rounded-full flex items-center gap-1"
                      >
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92z" clipRule="evenodd" />
                        </svg>
                        {warning}
                      </span>
                    ))}
                  </div>
                )}

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="mt-4 ml-14 p-4 bg-slate-50 rounded-xl">
                    <h4 className="font-medium text-slate-700 mb-3">📊 Dettaglio Punteggio</h4>
                    
                    <div className="space-y-4">
                      {/* Prossimità */}
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-600">📍 Prossimità</span>
                          <span className="font-medium">{suggestion.breakdown.proximity.score}/{suggestion.breakdown.proximity.maxScore}</span>
                        </div>
                        <ScoreBar score={suggestion.breakdown.proximity.score} max={30} color="bg-blue-500" />
                        <p className="text-xs text-slate-500 mt-1">{suggestion.breakdown.proximity.details}</p>
                      </div>

                      {/* Familiarità */}
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-600">🏠 Familiarità</span>
                          <span className="font-medium">{suggestion.breakdown.familiarity.score}/{suggestion.breakdown.familiarity.maxScore}</span>
                        </div>
                        <ScoreBar score={suggestion.breakdown.familiarity.score} max={25} color="bg-emerald-500" />
                        <p className="text-xs text-slate-500 mt-1">{suggestion.breakdown.familiarity.details}</p>
                      </div>

                      {/* Carico Lavoro */}
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-600">📋 Carico Lavoro</span>
                          <span className="font-medium">{suggestion.breakdown.workload.score}/{suggestion.breakdown.workload.maxScore}</span>
                        </div>
                        <ScoreBar score={suggestion.breakdown.workload.score} max={25} color="bg-amber-500" />
                        <p className="text-xs text-slate-500 mt-1">{suggestion.breakdown.workload.details}</p>
                      </div>

                      {/* Performance */}
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-600">⭐ Performance</span>
                          <span className="font-medium">{suggestion.breakdown.performance.score}/{suggestion.breakdown.performance.maxScore}</span>
                        </div>
                        <ScoreBar score={suggestion.breakdown.performance.score} max={20} color="bg-purple-500" />
                        <p className="text-xs text-slate-500 mt-1">{suggestion.breakdown.performance.details}</p>
                      </div>
                    </div>

                    {/* Pulizie di oggi */}
                    {suggestion.todayAssignments.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-200">
                        <h5 className="text-sm font-medium text-slate-700 mb-2">
                          Pulizie oggi ({suggestion.todayAssignments.length})
                        </h5>
                        <div className="space-y-2">
                          {suggestion.todayAssignments.map((assignment) => (
                            <div
                              key={assignment.cleaningId}
                              className="flex items-center gap-2 text-sm"
                            >
                              <span className="text-slate-400">
                                {assignment.scheduledTime || "—"}
                              </span>
                              <span className="text-slate-600">{assignment.propertyName}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
