"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, query, where, onSnapshot, Timestamp, doc, updateDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

// ═══════════════════════════════════════════════════════════════
// TIPI
// ═══════════════════════════════════════════════════════════════

interface Cleaning {
  id: string;
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
  propertyCity?: string;
  scheduledDate: Date;
  scheduledTime?: string;
  status: string;
  operatorId?: string;
  operatorName?: string;
  checkInTime?: string;
  guestsCount?: number;
  estimatedDuration?: number;
}

interface Operator {
  id: string;
  name: string;
  email: string;
  phone?: string;
  status: string;
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
  todayAssignments: Array<{ propertyName: string; scheduledTime?: string }>;
}

// ═══════════════════════════════════════════════════════════════
// ICONE SVG
// ═══════════════════════════════════════════════════════════════

const Icons = {
  calendar: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
  clock: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  users: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
  location: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  star: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>,
  home: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  briefcase: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
  check: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>,
  x: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
  chevronDown: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>,
  chevronRight: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>,
  lightning: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
  info: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  refresh: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
};

// ═══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPALE
// ═══════════════════════════════════════════════════════════════

export default function AssegnazioniPage() {
  // State
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [cleanings, setCleanings] = useState<Cleaning[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"pending" | "assigned" | "all">("pending");
  const [selectedCleaning, setSelectedCleaning] = useState<Cleaning | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [assigningAll, setAssigningAll] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Stats
  const stats = {
    total: cleanings.length,
    pending: cleanings.filter(c => !c.operatorId && !["COMPLETED", "CANCELLED"].includes(c.status)).length,
    assigned: cleanings.filter(c => c.operatorId && !["COMPLETED", "CANCELLED"].includes(c.status)).length,
    completed: cleanings.filter(c => c.status === "COMPLETED").length,
  };

  // ─── CARICA PULIZIE ───
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
      const data = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          propertyId: data.propertyId,
          propertyName: data.propertyName || "Proprietà",
          propertyAddress: data.propertyAddress || "",
          propertyCity: data.propertyCity,
          scheduledDate: data.scheduledDate?.toDate() || new Date(),
          scheduledTime: data.scheduledTime,
          status: data.status || "SCHEDULED",
          operatorId: data.operatorId,
          operatorName: data.operatorName,
          checkInTime: data.checkInTime,
          guestsCount: data.guestsCount,
          estimatedDuration: data.estimatedDuration,
        };
      }).sort((a, b) => (a.scheduledTime || "10:00").localeCompare(b.scheduledTime || "10:00"));
      setCleanings(data);
      setLoading(false);
    });

    return () => unsub();
  }, [selectedDate]);

  // ─── CARICA OPERATORI ───
  useEffect(() => {
    const q = query(collection(db, "users"), where("role", "==", "OPERATORE_PULIZIE"));
    const unsub = onSnapshot(q, (snap) => {
      setOperators(snap.docs.map(d => ({
        id: d.id,
        name: d.data().name || "Operatore",
        email: d.data().email || "",
        phone: d.data().phone,
        status: d.data().status || "ACTIVE",
      })));
    });
    return () => unsub();
  }, []);

  // ─── CARICA SUGGERIMENTI ───
  const loadSuggestions = useCallback(async (cleaning: Cleaning) => {
    setSelectedCleaning(cleaning);
    setLoadingSuggestions(true);
    setSuggestions([]);

    try {
      const res = await fetch(`/api/cleanings/${cleaning.id}/suggestions?limit=5`);
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions || []);
      }
    } catch (e) {
      console.error("Errore caricamento suggerimenti:", e);
    } finally {
      setLoadingSuggestions(false);
    }
  }, []);

  // ─── ASSEGNA OPERATORE ───
  const handleAssign = async (cleaningId: string, operatorId: string, operatorName: string) => {
    try {
      const res = await fetch(`/api/cleanings/${cleaningId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorId }),
      });
      if (!res.ok) throw new Error("Errore assegnazione");
      setSelectedCleaning(null);
      setSuggestions([]);
    } catch (e) {
      alert("Errore durante l'assegnazione");
    }
  };

  // ─── ASSEGNA TUTTE AUTOMATICAMENTE ───
  const handleAssignAll = async () => {
    const pending = cleanings.filter(c => !c.operatorId && !["COMPLETED", "CANCELLED"].includes(c.status));
    if (pending.length === 0) return;
    if (!confirm(`Assegnare automaticamente ${pending.length} pulizie al miglior operatore disponibile?`)) return;

    setAssigningAll(true);
    let success = 0, errors = 0;

    for (const cleaning of pending) {
      try {
        const res = await fetch(`/api/cleanings/${cleaning.id}/suggestions?limit=1`);
        if (res.ok) {
          const data = await res.json();
          if (data.suggestions?.[0]) {
            await handleAssign(cleaning.id, data.suggestions[0].operatorId, data.suggestions[0].operatorName);
            success++;
          } else errors++;
        } else errors++;
        await new Promise(r => setTimeout(r, 300));
      } catch { errors++; }
    }

    setAssigningAll(false);
    alert(`✅ ${success} assegnate\n❌ ${errors} errori`);
  };

  // ─── FILTRA PULIZIE ───
  const filteredCleanings = cleanings.filter(c => {
    if (activeTab === "pending") return !c.operatorId && !["COMPLETED", "CANCELLED"].includes(c.status);
    if (activeTab === "assigned") return c.operatorId && !["COMPLETED", "CANCELLED"].includes(c.status);
    return true;
  });

  // ─── CALCOLA CARICO OPERATORI ───
  const operatorWorkload = operators.map(op => ({
    ...op,
    count: cleanings.filter(c => c.operatorId === op.id).length,
  })).sort((a, b) => b.count - a.count);

  // Formatta data
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  };

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      
      {/* ════════════════════════════════════════════════════════════
          HEADER - Mobile & Desktop
      ════════════════════════════════════════════════════════════ */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 lg:py-4">
          {/* Top Row */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-lg lg:text-2xl font-bold text-slate-800 flex items-center gap-2">
                <span className="text-2xl">🎯</span>
                <span className="hidden sm:inline">Piano Assegnazioni</span>
                <span className="sm:hidden">Assegnazioni</span>
              </h1>
              <p className="text-xs lg:text-sm text-slate-500 capitalize">{formatDate(selectedDate)}</p>
            </div>
            
            {/* Help Button */}
            <button
              onClick={() => setShowHelp(!showHelp)}
              className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl"
            >
              {Icons.info}
            </button>
          </div>

          {/* Date Selector - Mobile Optimized */}
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => {
                const d = new Date(selectedDate);
                d.setDate(d.getDate() - 1);
                setSelectedDate(d.toISOString().split("T")[0]);
              }}
              className="p-2 bg-slate-100 rounded-xl hover:bg-slate-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-center"
            />
            
            <button
              onClick={() => {
                const d = new Date(selectedDate);
                d.setDate(d.getDate() + 1);
                setSelectedDate(d.toISOString().split("T")[0]);
              }}
              className="p-2 bg-slate-100 rounded-xl hover:bg-slate-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            
            <button
              onClick={() => setSelectedDate(new Date().toISOString().split("T")[0])}
              className="px-3 py-2 bg-blue-500 text-white rounded-xl text-sm font-medium"
            >
              Oggi
            </button>
          </div>

          {/* Stats Pills - Mobile Scroll */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 lg:mx-0 lg:px-0">
            <button
              onClick={() => setActiveTab("pending")}
              className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === "pending"
                  ? "bg-amber-500 text-white shadow-lg shadow-amber-500/30"
                  : "bg-amber-50 text-amber-700 hover:bg-amber-100"
              }`}
            >
              <span className="flex items-center gap-2">
                {Icons.clock}
                <span>Da fare ({stats.pending})</span>
              </span>
            </button>
            
            <button
              onClick={() => setActiveTab("assigned")}
              className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === "assigned"
                  ? "bg-blue-500 text-white shadow-lg shadow-blue-500/30"
                  : "bg-blue-50 text-blue-700 hover:bg-blue-100"
              }`}
            >
              <span className="flex items-center gap-2">
                {Icons.check}
                <span>Assegnate ({stats.assigned})</span>
              </span>
            </button>
            
            <button
              onClick={() => setActiveTab("all")}
              className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === "all"
                  ? "bg-slate-700 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Tutte ({stats.total})
            </button>
          </div>
        </div>
      </header>

      {/* ════════════════════════════════════════════════════════════
          HELP PANEL - Come funziona
      ════════════════════════════════════════════════════════════ */}
      {showHelp && (
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-bold text-lg">🧠 Come funziona l'Assegnazione Intelligente</h3>
              <button onClick={() => setShowHelp(false)} className="p-1 hover:bg-white/20 rounded">
                {Icons.x}
              </button>
            </div>
            
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
              <div className="bg-white/10 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  {Icons.location}
                  <span className="font-semibold">Prossimità</span>
                </div>
                <p className="text-white/80 text-xs">30 punti max. Operatori vicini alla proprietà o con altre pulizie nella zona.</p>
              </div>
              
              <div className="bg-white/10 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  {Icons.home}
                  <span className="font-semibold">Familiarità</span>
                </div>
                <p className="text-white/80 text-xs">25 punti max. Chi ha già pulito questa casa la conosce meglio.</p>
              </div>
              
              <div className="bg-white/10 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  {Icons.briefcase}
                  <span className="font-semibold">Carico</span>
                </div>
                <p className="text-white/80 text-xs">25 punti max. Distribuiamo il lavoro equamente tra gli operatori.</p>
              </div>
              
              <div className="bg-white/10 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  {Icons.star}
                  <span className="font-semibold">Performance</span>
                </div>
                <p className="text-white/80 text-xs">20 punti max. Rating e affidabilità dell'operatore.</p>
              </div>
            </div>
            
            <p className="text-xs text-white/60 mt-3 text-center">
              Il punteggio totale (max 100) indica quanto è adatto ogni operatore per quella specifica pulizia.
            </p>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          MAIN CONTENT
      ════════════════════════════════════════════════════════════ */}
      <main className="max-w-7xl mx-auto px-4 py-4 lg:py-6">
        
        {/* Auto-Assign Button - Mobile Fixed Bottom / Desktop Top */}
        {stats.pending > 0 && (
          <div className="mb-4 lg:mb-6">
            <button
              onClick={handleAssignAll}
              disabled={assigningAll}
              className="w-full lg:w-auto px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-2xl font-semibold shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {assigningAll ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>Assegnazione in corso...</span>
                </>
              ) : (
                <>
                  {Icons.lightning}
                  <span>Assegna tutte automaticamente ({stats.pending})</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Desktop: 2 Column Layout */}
        <div className="lg:grid lg:grid-cols-3 lg:gap-6">
          
          {/* ════════════════════════════════════════════════════════
              COLONNA SINISTRA: Lista Pulizie
          ════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-2 space-y-3">
            
            {loading ? (
              <div className="bg-white rounded-2xl p-8 text-center">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-slate-500">Caricamento pulizie...</p>
              </div>
            ) : filteredCleanings.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  {activeTab === "pending" ? Icons.check : Icons.calendar}
                </div>
                <p className="font-semibold text-slate-700">
                  {activeTab === "pending" ? "Tutte le pulizie sono assegnate! 🎉" : "Nessuna pulizia trovata"}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  {activeTab === "pending" ? "Ottimo lavoro!" : "Prova a cambiare data o filtro"}
                </p>
              </div>
            ) : (
              filteredCleanings.map((cleaning) => (
                <CleaningCard
                  key={cleaning.id}
                  cleaning={cleaning}
                  isSelected={selectedCleaning?.id === cleaning.id}
                  onSelect={() => loadSuggestions(cleaning)}
                  onAssign={handleAssign}
                  suggestions={selectedCleaning?.id === cleaning.id ? suggestions : []}
                  loadingSuggestions={selectedCleaning?.id === cleaning.id && loadingSuggestions}
                  onClose={() => { setSelectedCleaning(null); setSuggestions([]); }}
                />
              ))
            )}
          </div>

          {/* ════════════════════════════════════════════════════════
              COLONNA DESTRA: Operatori (Solo Desktop)
          ════════════════════════════════════════════════════════ */}
          <div className="hidden lg:block">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sticky top-32">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                {Icons.users}
                <span>Team Operatori</span>
              </h3>

              {operatorWorkload.filter(op => op.status === "ACTIVE").length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">Nessun operatore attivo</p>
              ) : (
                <div className="space-y-3">
                  {operatorWorkload.filter(op => op.status === "ACTIVE").map((op) => {
                    const maxLoad = 4;
                    const pct = Math.min((op.count / maxLoad) * 100, 100);
                    const color = pct >= 100 ? "red" : pct >= 75 ? "amber" : pct >= 50 ? "blue" : "emerald";

                    return (
                      <div key={op.id} className="p-3 bg-slate-50 rounded-xl">
                        <div className="flex items-center gap-3 mb-2">
                          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br from-${color}-400 to-${color}-600 flex items-center justify-center text-white font-bold text-sm`}>
                            {op.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-800 truncate">{op.name}</p>
                            <p className="text-xs text-slate-500">{op.count} pulizie oggi</p>
                          </div>
                        </div>
                        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all bg-${color}-500`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Legenda */}
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs text-slate-500 mb-2">Legenda carico giornaliero:</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-emerald-500" />
                    <span>Basso (0-1)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-blue-500" />
                    <span>Medio (2)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-amber-500" />
                    <span>Alto (3)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-red-500" />
                    <span>Max (4+)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTE: Card Pulizia
// ═══════════════════════════════════════════════════════════════

function CleaningCard({
  cleaning,
  isSelected,
  onSelect,
  onAssign,
  suggestions,
  loadingSuggestions,
  onClose,
}: {
  cleaning: Cleaning;
  isSelected: boolean;
  onSelect: () => void;
  onAssign: (cleaningId: string, operatorId: string, operatorName: string) => void;
  suggestions: Suggestion[];
  loadingSuggestions: boolean;
  onClose: () => void;
}) {
  const isPending = !cleaning.operatorId && !["COMPLETED", "CANCELLED"].includes(cleaning.status);
  const isAssigned = cleaning.operatorId && !["COMPLETED", "CANCELLED"].includes(cleaning.status);

  return (
    <div className={`bg-white rounded-2xl border-2 transition-all ${
      isPending ? "border-amber-200" : isAssigned ? "border-blue-200" : "border-slate-200"
    } ${isSelected ? "ring-2 ring-blue-500 ring-offset-2" : ""}`}>
      
      {/* Header */}
      <div 
        className="p-4 cursor-pointer"
        onClick={isPending ? onSelect : undefined}
      >
        <div className="flex items-start gap-3">
          {/* Time */}
          <div className="flex-shrink-0 text-center">
            <div className={`text-xl font-bold ${isPending ? "text-amber-600" : "text-slate-700"}`}>
              {cleaning.scheduledTime || "10:00"}
            </div>
            {cleaning.checkInTime && (
              <div className="text-xs text-emerald-600 font-medium">
                Check-in {cleaning.checkInTime}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-800 truncate">{cleaning.propertyName}</h3>
            <p className="text-sm text-slate-500 truncate">{cleaning.propertyAddress}</p>
            
            {/* Assigned Operator */}
            {cleaning.operatorId && (
              <div className="mt-2 flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                  {cleaning.operatorName?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <span className="text-sm font-medium text-slate-700">{cleaning.operatorName}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onSelect(); }}
                  className="ml-auto text-xs text-blue-600 hover:underline"
                >
                  Cambia
                </button>
              </div>
            )}
          </div>

          {/* Status Badge */}
          <div className="flex-shrink-0">
            {isPending ? (
              <span className="px-3 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
                Da assegnare
              </span>
            ) : isAssigned ? (
              <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                Assegnata
              </span>
            ) : (
              <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
                {cleaning.status}
              </span>
            )}
          </div>
        </div>

        {/* Quick Action for Pending */}
        {isPending && !isSelected && (
          <button
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
            className="mt-3 w-full py-2 bg-blue-50 text-blue-600 rounded-xl text-sm font-medium hover:bg-blue-100 transition-colors"
          >
            Scegli operatore →
          </button>
        )}
      </div>

      {/* Expanded Suggestions Panel */}
      {isSelected && (
        <div className="border-t border-slate-100">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-4 py-3 flex items-center justify-between">
            <div>
              <h4 className="text-white font-semibold">🎯 Operatori Suggeriti</h4>
              <p className="text-blue-100 text-xs">Ordinati per compatibilità</p>
            </div>
            <button onClick={onClose} className="text-white/70 hover:text-white p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Suggestions List */}
          <div className="p-3">
            {loadingSuggestions ? (
              <div className="py-6 text-center">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-sm text-slate-500">Calcolo migliori operatori...</p>
              </div>
            ) : suggestions.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-sm text-slate-500">Nessun operatore disponibile</p>
              </div>
            ) : (
              <div className="space-y-2">
                {suggestions.map((sug) => (
                  <SuggestionRow
                    key={sug.operatorId}
                    suggestion={sug}
                    onAssign={() => onAssign(cleaning.id, sug.operatorId, sug.operatorName)}
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
// COMPONENTE: Riga Suggerimento
// ═══════════════════════════════════════════════════════════════

function SuggestionRow({
  suggestion,
  onAssign,
  isCurrent,
}: {
  suggestion: Suggestion;
  onAssign: () => void;
  isCurrent: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { breakdown } = suggestion;

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-600";
    if (score >= 60) return "text-blue-600";
    if (score >= 40) return "text-amber-600";
    return "text-slate-500";
  };

  return (
    <div className={`rounded-xl border ${isCurrent ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`}>
      {/* Main Row */}
      <div className="p-3 flex items-center gap-3">
        {/* Medal */}
        <div className="flex-shrink-0 w-8 text-center">
          {suggestion.medal ? (
            <span className="text-xl">{suggestion.medal}</span>
          ) : (
            <span className="text-sm font-bold text-slate-400">#{suggestion.rank}</span>
          )}
        </div>

        {/* Avatar */}
        <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm ${
          suggestion.rank === 1 ? "bg-gradient-to-br from-amber-400 to-orange-500" :
          suggestion.rank === 2 ? "bg-gradient-to-br from-slate-400 to-slate-500" :
          suggestion.rank === 3 ? "bg-gradient-to-br from-amber-600 to-amber-700" :
          "bg-gradient-to-br from-slate-500 to-slate-600"
        }`}>
          {suggestion.operatorName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-slate-800 truncate">{suggestion.operatorName}</p>
            {isCurrent && (
              <span className="px-2 py-0.5 bg-emerald-200 text-emerald-800 text-xs rounded-full">Attuale</span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            {breakdown.workload.todayCleanings} pulizie oggi
            {breakdown.proximity.distanceKm !== null && ` • ${breakdown.proximity.distanceKm} km`}
          </p>
        </div>

        {/* Score */}
        <div className="flex-shrink-0 text-right">
          <div className={`text-xl font-bold ${getScoreColor(suggestion.totalScore)}`}>
            {suggestion.totalScore}
          </div>
          <p className="text-xs text-slate-400">/100</p>
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 flex items-center gap-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            <svg className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {!isCurrent && (
            <button
              onClick={onAssign}
              className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600"
            >
              Assegna
            </button>
          )}
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="px-3 pb-3 pt-0">
          <div className="p-3 bg-slate-50 rounded-xl space-y-3">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Dettaglio Punteggio
            </p>
            
            {/* Proximity */}
            <ScoreRow
              icon="📍"
              label="Prossimità"
              score={breakdown.proximity.score}
              max={breakdown.proximity.maxScore}
              detail={breakdown.proximity.details}
              color="blue"
            />
            
            {/* Familiarity */}
            <ScoreRow
              icon="🏠"
              label="Familiarità"
              score={breakdown.familiarity.score}
              max={breakdown.familiarity.maxScore}
              detail={breakdown.familiarity.details}
              color="emerald"
            />
            
            {/* Workload */}
            <ScoreRow
              icon="📋"
              label="Carico"
              score={breakdown.workload.score}
              max={breakdown.workload.maxScore}
              detail={breakdown.workload.details}
              color="amber"
            />
            
            {/* Performance */}
            <ScoreRow
              icon="⭐"
              label="Performance"
              score={breakdown.performance.score}
              max={breakdown.performance.maxScore}
              detail={breakdown.performance.details}
              color="purple"
            />

            {/* Warnings */}
            {suggestion.warnings.length > 0 && (
              <div className="pt-2 border-t border-slate-200">
                <p className="text-xs text-amber-600 flex items-start gap-1">
                  <span>⚠️</span>
                  <span>{suggestion.warnings.join(" • ")}</span>
                </p>
              </div>
            )}

            {/* Today's Schedule */}
            {suggestion.todayAssignments.length > 0 && (
              <div className="pt-2 border-t border-slate-200">
                <p className="text-xs font-medium text-slate-600 mb-1">Oggi lavora a:</p>
                <div className="space-y-1">
                  {suggestion.todayAssignments.map((a, i) => (
                    <p key={i} className="text-xs text-slate-500">
                      {a.scheduledTime || "—"} • {a.propertyName}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTE: Riga Punteggio
// ═══════════════════════════════════════════════════════════════

function ScoreRow({
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
  const pct = (score / max) * 100;

  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="flex items-center gap-1 text-slate-700">
          <span>{icon}</span>
          <span>{label}</span>
        </span>
        <span className="font-semibold">{score}/{max}</span>
      </div>
      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mb-1">
        <div
          className={`h-full rounded-full bg-${color}-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-slate-500">{detail}</p>
    </div>
  );
}
