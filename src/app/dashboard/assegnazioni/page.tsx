"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, query, where, onSnapshot, Timestamp, doc, getDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import AssignmentSuggestions from "~/components/cleaning/AssignmentSuggestions";

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
  operators?: Array<{ id: string; name: string }>;
  guestsCount?: number;
  checkInTime?: string;
  type?: string;
}

interface Operator {
  id: string;
  name: string;
  email: string;
  status: string;
  todayCount: number;
}

interface DayStats {
  total: number;
  unassigned: number;
  assigned: number;
  inProgress: number;
  completed: number;
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPALE
// ═══════════════════════════════════════════════════════════════

export default function AssegnazioniPage() {
  // State
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [cleanings, setCleanings] = useState<Cleaning[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unassigned" | "assigned">("all");
  const [selectedCleaningId, setSelectedCleaningId] = useState<string | null>(null);
  const [assigningAll, setAssigningAll] = useState(false);

  // Calcola statistiche
  const stats: DayStats = {
    total: cleanings.length,
    unassigned: cleanings.filter(c => !c.operatorId && c.status !== "COMPLETED" && c.status !== "CANCELLED").length,
    assigned: cleanings.filter(c => c.operatorId && c.status !== "COMPLETED" && c.status !== "CANCELLED").length,
    inProgress: cleanings.filter(c => c.status === "IN_PROGRESS").length,
    completed: cleanings.filter(c => c.status === "COMPLETED").length,
  };

  // ─── LISTENER PULIZIE ───
  useEffect(() => {
    if (!selectedDate) return;

    const date = new Date(selectedDate);
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const cleaningsQuery = query(
      collection(db, "cleanings"),
      where("scheduledDate", ">=", Timestamp.fromDate(startOfDay)),
      where("scheduledDate", "<=", Timestamp.fromDate(endOfDay))
    );

    const unsubscribe = onSnapshot(cleaningsQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          propertyId: d.propertyId,
          propertyName: d.propertyName || "Proprietà",
          propertyAddress: d.propertyAddress || "",
          scheduledDate: d.scheduledDate?.toDate() || new Date(),
          scheduledTime: d.scheduledTime,
          status: d.status || "SCHEDULED",
          operatorId: d.operatorId,
          operatorName: d.operatorName,
          operators: d.operators,
          guestsCount: d.guestsCount,
          checkInTime: d.checkInTime,
          type: d.type,
        };
      });

      // Ordina per orario
      data.sort((a, b) => {
        const timeA = a.scheduledTime || "10:00";
        const timeB = b.scheduledTime || "10:00";
        return timeA.localeCompare(timeB);
      });

      setCleanings(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [selectedDate]);

  // ─── LISTENER OPERATORI ───
  useEffect(() => {
    const operatorsQuery = query(
      collection(db, "users"),
      where("role", "==", "OPERATORE_PULIZIE")
    );

    const unsubscribe = onSnapshot(operatorsQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          name: d.name || "Operatore",
          email: d.email || "",
          status: d.status || "ACTIVE",
          todayCount: 0, // Calcolato dopo
        };
      });
      setOperators(data);
    });

    return () => unsubscribe();
  }, []);

  // ─── CALCOLA CARICO OPERATORI ───
  useEffect(() => {
    if (operators.length === 0 || cleanings.length === 0) return;

    const workload = new Map<string, number>();
    cleanings.forEach(c => {
      if (c.operatorId) {
        workload.set(c.operatorId, (workload.get(c.operatorId) || 0) + 1);
      }
    });

    setOperators(prev => prev.map(op => ({
      ...op,
      todayCount: workload.get(op.id) || 0,
    })));
  }, [cleanings]);

  // ─── ASSEGNA OPERATORE ───
  const handleAssign = useCallback(async (cleaningId: string, operatorId: string, operatorName: string) => {
    try {
      const response = await fetch(`/api/cleanings/${cleaningId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorId }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Errore assegnazione");
      }

      // Chiudi modal se aperto
      if (selectedCleaningId === cleaningId) {
        setSelectedCleaningId(null);
      }
    } catch (error) {
      console.error("Errore assegnazione:", error);
      alert(error instanceof Error ? error.message : "Errore assegnazione");
    }
  }, [selectedCleaningId]);

  // ─── ASSEGNA AUTOMATICAMENTE TUTTE ───
  const handleAssignAll = async () => {
    const unassigned = cleanings.filter(c => !c.operatorId && c.status !== "COMPLETED" && c.status !== "CANCELLED");
    
    if (unassigned.length === 0) {
      alert("Tutte le pulizie sono già assegnate!");
      return;
    }

    if (!confirm(`Vuoi assegnare automaticamente ${unassigned.length} pulizie?`)) {
      return;
    }

    setAssigningAll(true);
    let assigned = 0;
    let errors = 0;

    for (const cleaning of unassigned) {
      try {
        // Ottieni suggerimenti
        const suggestionsRes = await fetch(`/api/cleanings/${cleaning.id}/suggestions?limit=1`);
        
        if (!suggestionsRes.ok) {
          errors++;
          continue;
        }

        const suggestionsData = await suggestionsRes.json();
        
        if (suggestionsData.suggestions && suggestionsData.suggestions.length > 0) {
          const bestOperator = suggestionsData.suggestions[0];
          await handleAssign(cleaning.id, bestOperator.operatorId, bestOperator.operatorName);
          assigned++;
        } else {
          errors++;
        }

        // Piccola pausa per non sovraccaricare
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (e) {
        errors++;
      }
    }

    setAssigningAll(false);
    alert(`Assegnazione completata!\n✅ ${assigned} assegnate\n❌ ${errors} errori`);
  };

  // ─── FILTRA PULIZIE ───
  const filteredCleanings = cleanings.filter(c => {
    if (filter === "unassigned") return !c.operatorId && c.status !== "COMPLETED" && c.status !== "CANCELLED";
    if (filter === "assigned") return c.operatorId && c.status !== "COMPLETED" && c.status !== "CANCELLED";
    return true;
  });

  // ─── RAGGRUPPA PER STATO ───
  const unassignedCleanings = filteredCleanings.filter(c => !c.operatorId && c.status !== "COMPLETED" && c.status !== "CANCELLED");
  const assignedCleanings = filteredCleanings.filter(c => c.operatorId && c.status !== "COMPLETED" && c.status !== "CANCELLED");
  const completedCleanings = filteredCleanings.filter(c => c.status === "COMPLETED");

  // Status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "SCHEDULED":
        return <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-full">Programmata</span>;
      case "ASSIGNED":
        return <span className="px-2 py-1 bg-blue-100 text-blue-600 text-xs rounded-full">Assegnata</span>;
      case "IN_PROGRESS":
        return <span className="px-2 py-1 bg-amber-100 text-amber-600 text-xs rounded-full">In corso</span>;
      case "COMPLETED":
        return <span className="px-2 py-1 bg-emerald-100 text-emerald-600 text-xs rounded-full">Completata</span>;
      case "CANCELLED":
        return <span className="px-2 py-1 bg-red-100 text-red-600 text-xs rounded-full">Annullata</span>;
      default:
        return <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-full">{status}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto p-4 lg:p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">
            🎯 Assegnazione Pulizie
          </h1>
          <p className="text-slate-500 mt-1">
            Assegna le pulizie agli operatori in modo intelligente
          </p>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            {/* Date Picker */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-700">Data:</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              <button
                onClick={() => setSelectedDate(new Date().toISOString().split("T")[0])}
                className="px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                Oggi
              </button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 lg:ml-auto">
              <button
                onClick={() => setFilter("all")}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  filter === "all" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Tutte ({stats.total})
              </button>
              <button
                onClick={() => setFilter("unassigned")}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  filter === "unassigned" ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-600 hover:bg-amber-100"
                }`}
              >
                Da assegnare ({stats.unassigned})
              </button>
              <button
                onClick={() => setFilter("assigned")}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  filter === "assigned" ? "bg-blue-500 text-white" : "bg-blue-50 text-blue-600 hover:bg-blue-100"
                }`}
              >
                Assegnate ({stats.assigned})
              </button>
            </div>

            {/* Auto-assign button */}
            {stats.unassigned > 0 && (
              <button
                onClick={handleAssignAll}
                disabled={assigningAll}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                  assigningAll
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:shadow-lg hover:shadow-emerald-500/30"
                }`}
              >
                {assigningAll ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Assegnazione in corso...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Assegna tutte ({stats.unassigned})
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Cleanings List */}
          <div className="lg:col-span-2 space-y-6">
            {loading ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-slate-500 mt-3">Caricamento pulizie...</p>
              </div>
            ) : cleanings.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-slate-600 font-medium">Nessuna pulizia per questa data</p>
                <p className="text-sm text-slate-500 mt-1">Seleziona un'altra data o crea nuove pulizie</p>
              </div>
            ) : (
              <>
                {/* Unassigned Section */}
                {(filter === "all" || filter === "unassigned") && unassignedCleanings.length > 0 && (
                  <div>
                    <h2 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
                      <span className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                        <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </span>
                      Da assegnare ({unassignedCleanings.length})
                    </h2>
                    <div className="space-y-3">
                      {unassignedCleanings.map((cleaning) => (
                        <div
                          key={cleaning.id}
                          className="bg-white rounded-xl border border-amber-200 p-4 hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-center gap-4">
                            {/* Time */}
                            <div className="flex-shrink-0 w-16 text-center">
                              <div className="text-lg font-bold text-slate-800">
                                {cleaning.scheduledTime || "10:00"}
                              </div>
                              {cleaning.checkInTime && (
                                <div className="text-xs text-emerald-600">
                                  Check-in {cleaning.checkInTime}
                                </div>
                              )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-slate-800 truncate">
                                {cleaning.propertyName}
                              </p>
                              <p className="text-sm text-slate-500 truncate">
                                {cleaning.propertyAddress}
                              </p>
                            </div>

                            {/* Status */}
                            <div className="flex-shrink-0">
                              {getStatusBadge(cleaning.status)}
                            </div>

                            {/* Action */}
                            <button
                              onClick={() => setSelectedCleaningId(
                                selectedCleaningId === cleaning.id ? null : cleaning.id
                              )}
                              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                                selectedCleaningId === cleaning.id
                                  ? "bg-blue-500 text-white"
                                  : "bg-blue-50 text-blue-600 hover:bg-blue-100"
                              }`}
                            >
                              {selectedCleaningId === cleaning.id ? "Chiudi" : "Assegna"}
                            </button>
                          </div>

                          {/* Suggestions Panel */}
                          {selectedCleaningId === cleaning.id && (
                            <div className="mt-4 pt-4 border-t border-slate-100">
                              <AssignmentSuggestions
                                cleaningId={cleaning.id}
                                onAssign={(operatorId, operatorName) => 
                                  handleAssign(cleaning.id, operatorId, operatorName)
                                }
                                onClose={() => setSelectedCleaningId(null)}
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Assigned Section */}
                {(filter === "all" || filter === "assigned") && assignedCleanings.length > 0 && (
                  <div>
                    <h2 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
                      <span className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </span>
                      Assegnate ({assignedCleanings.length})
                    </h2>
                    <div className="space-y-3">
                      {assignedCleanings.map((cleaning) => (
                        <div
                          key={cleaning.id}
                          className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-center gap-4">
                            {/* Time */}
                            <div className="flex-shrink-0 w-16 text-center">
                              <div className="text-lg font-bold text-slate-800">
                                {cleaning.scheduledTime || "10:00"}
                              </div>
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-slate-800 truncate">
                                {cleaning.propertyName}
                              </p>
                              <p className="text-sm text-slate-500 truncate">
                                {cleaning.propertyAddress}
                              </p>
                            </div>

                            {/* Operator */}
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                                {cleaning.operatorName
                                  ?.split(" ")
                                  .map(n => n[0])
                                  .join("")
                                  .slice(0, 2)
                                  .toUpperCase() || "??"}
                              </div>
                              <span className="text-sm font-medium text-slate-700">
                                {cleaning.operatorName}
                              </span>
                            </div>

                            {/* Status */}
                            <div className="flex-shrink-0">
                              {getStatusBadge(cleaning.status)}
                            </div>

                            {/* Change button */}
                            <button
                              onClick={() => setSelectedCleaningId(
                                selectedCleaningId === cleaning.id ? null : cleaning.id
                              )}
                              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                              title="Cambia operatore"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                              </svg>
                            </button>
                          </div>

                          {/* Suggestions Panel for changing */}
                          {selectedCleaningId === cleaning.id && (
                            <div className="mt-4 pt-4 border-t border-slate-100">
                              <AssignmentSuggestions
                                cleaningId={cleaning.id}
                                currentOperatorId={cleaning.operatorId}
                                onAssign={(operatorId, operatorName) => 
                                  handleAssign(cleaning.id, operatorId, operatorName)
                                }
                                onClose={() => setSelectedCleaningId(null)}
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Completed Section */}
                {filter === "all" && completedCleanings.length > 0 && (
                  <div>
                    <h2 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
                      <span className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                        <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                      Completate ({completedCleanings.length})
                    </h2>
                    <div className="space-y-3">
                      {completedCleanings.map((cleaning) => (
                        <div
                          key={cleaning.id}
                          className="bg-white rounded-xl border border-emerald-200 p-4 opacity-75"
                        >
                          <div className="flex items-center gap-4">
                            <div className="flex-shrink-0 w-16 text-center">
                              <div className="text-lg font-bold text-slate-600">
                                {cleaning.scheduledTime || "10:00"}
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-slate-700 truncate">
                                {cleaning.propertyName}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-xs font-bold">
                                {cleaning.operatorName
                                  ?.split(" ")
                                  .map(n => n[0])
                                  .join("")
                                  .slice(0, 2)
                                  .toUpperCase() || "??"}
                              </div>
                              <span className="text-sm text-slate-600">
                                {cleaning.operatorName}
                              </span>
                            </div>
                            {getStatusBadge(cleaning.status)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Operators Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sticky top-4">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Carico Operatori
              </h3>

              {operators.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">
                  Nessun operatore trovato
                </p>
              ) : (
                <div className="space-y-3">
                  {operators
                    .filter(op => op.status === "ACTIVE")
                    .sort((a, b) => b.todayCount - a.todayCount)
                    .map((operator) => {
                      const maxCleanings = 4;
                      const percentage = Math.min((operator.todayCount / maxCleanings) * 100, 100);
                      const isOverloaded = operator.todayCount >= maxCleanings;

                      return (
                        <div key={operator.id} className="p-3 bg-slate-50 rounded-xl">
                          <div className="flex items-center gap-3 mb-2">
                            <div className={`
                              w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-bold
                              ${isOverloaded 
                                ? "bg-gradient-to-br from-red-500 to-rose-600" 
                                : "bg-gradient-to-br from-blue-500 to-indigo-600"}
                            `}>
                              {operator.name
                                .split(" ")
                                .map(n => n[0])
                                .join("")
                                .slice(0, 2)
                                .toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-slate-800 truncate">
                                {operator.name}
                              </p>
                              <p className="text-sm text-slate-500">
                                {operator.todayCount} pulizie oggi
                              </p>
                            </div>
                          </div>
                          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                isOverloaded ? "bg-red-500" :
                                percentage > 75 ? "bg-amber-500" :
                                percentage > 50 ? "bg-blue-500" :
                                "bg-emerald-500"
                              }`}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}

              {/* Legend */}
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs text-slate-500 mb-2">Legenda carico:</p>
                <div className="flex flex-wrap gap-2">
                  <span className="flex items-center gap-1 text-xs">
                    <span className="w-3 h-3 rounded bg-emerald-500" />
                    Basso
                  </span>
                  <span className="flex items-center gap-1 text-xs">
                    <span className="w-3 h-3 rounded bg-blue-500" />
                    Medio
                  </span>
                  <span className="flex items-center gap-1 text-xs">
                    <span className="w-3 h-3 rounded bg-amber-500" />
                    Alto
                  </span>
                  <span className="flex items-center gap-1 text-xs">
                    <span className="w-3 h-3 rounded bg-red-500" />
                    Sovraccarico
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
