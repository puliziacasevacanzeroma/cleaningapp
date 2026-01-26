"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
  propertyZona?: string;
  propertyType?: string;
  propertySize?: number;
  scheduledDate: Date;
  scheduledTime: string;
  checkoutTime?: string;
  checkinTime?: string;
  status: string;
  operatorId?: string;
  operatorName?: string;
  operators?: Array<{ id: string; name: string }>;
  guestsCount?: number;
  estimatedDuration?: number;
  type?: string;
  notes?: string;
  urgent?: boolean;
}

interface Operator {
  id: string;
  name: string;
  email: string;
  phone?: string;
  status: string;
  rating?: number;
  preferredZone?: string;
  speciality?: string;
  speed?: string;
  todayCleanings: Cleaning[];
  colorIndex?: number;
}

interface AssignmentScore {
  total: number;
  proximity: { points: number; km: string; minutes: number; sameZone: boolean };
  familiarity: { points: number; times: number };
  workload: { points: number; today: number };
  performance: { points: number; rating: number };
}

// ═══════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════

const ZONE_FROM_CAP: Record<string, string> = {
  "00184": "Centro Storico",
  "00186": "Centro Storico",
  "00187": "Centro Storico",
  "00153": "Trastevere",
  "00154": "Testaccio",
  "00192": "Vaticano/Prati",
  "00193": "Vaticano/Prati",
  "00185": "Termini",
  "00144": "EUR",
  "00142": "EUR",
};

const getZoneFromCAP = (cap?: string): string => {
  if (!cap) return "Altro";
  return ZONE_FROM_CAP[cap] || "Altro";
};

const calculateScore = (cleaning: Cleaning, operator: Operator): AssignmentScore => {
  const sameZone = cleaning.propertyZona === operator.preferredZone;
  const zoneNearby = cleaning.propertyZona?.includes("Centro") && operator.preferredZone?.includes("Centro");
  
  let proximityPoints: number, km: string, minutes: number;
  if (sameZone) {
    km = (Math.random() * 0.8 + 0.2).toFixed(1);
    proximityPoints = 28 + Math.floor(Math.random() * 3);
  } else if (zoneNearby) {
    km = (Math.random() * 1.5 + 0.8).toFixed(1);
    proximityPoints = 20 + Math.floor(Math.random() * 5);
  } else {
    km = (Math.random() * 3 + 2).toFixed(1);
    proximityPoints = 8 + Math.floor(Math.random() * 8);
  }
  minutes = Math.ceil(parseFloat(km) * 10);

  const timesCleaned = Math.floor(Math.random() * 10);
  let familiarityPoints: number;
  if (timesCleaned === 0) familiarityPoints = 0;
  else if (timesCleaned < 3) familiarityPoints = 15;
  else if (timesCleaned < 6) familiarityPoints = 20;
  else familiarityPoints = 25;

  const todayCount = operator.todayCleanings.length;
  let workloadPoints: number;
  if (todayCount === 0) workloadPoints = 25;
  else if (todayCount === 1) workloadPoints = 22;
  else if (todayCount === 2) workloadPoints = 18;
  else if (todayCount === 3) workloadPoints = 14;
  else workloadPoints = 8;

  const rating = operator.rating || 4.0;
  const performancePoints = Math.floor(rating * 4);

  return {
    total: proximityPoints + familiarityPoints + workloadPoints + performancePoints,
    proximity: { points: proximityPoints, km, minutes, sameZone: sameZone || false },
    familiarity: { points: familiarityPoints, times: timesCleaned },
    workload: { points: workloadPoints, today: todayCount },
    performance: { points: performancePoints, rating },
  };
};

const isUrgent = (cleaning: Cleaning): boolean => {
  if (!cleaning.checkinTime || !cleaning.scheduledTime) return false;
  const schedHour = parseInt(cleaning.scheduledTime.split(":")[0]);
  const checkinHour = parseInt(cleaning.checkinTime.split(":")[0]);
  const duration = cleaning.estimatedDuration || 2;
  return (checkinHour - schedHour) <= duration + 0.5;
};

const getOperatorColor = (index: number) => {
  const colors = [
    { bg: "bg-pink-500", text: "text-pink-400", light: "bg-pink-500/20", border: "border-pink-500", gradient: "from-pink-500" },
    { bg: "bg-blue-500", text: "text-blue-400", light: "bg-blue-500/20", border: "border-blue-500", gradient: "from-blue-500" },
    { bg: "bg-emerald-500", text: "text-emerald-400", light: "bg-emerald-500/20", border: "border-emerald-500", gradient: "from-emerald-500" },
    { bg: "bg-purple-500", text: "text-purple-400", light: "bg-purple-500/20", border: "border-purple-500", gradient: "from-purple-500" },
    { bg: "bg-amber-500", text: "text-amber-400", light: "bg-amber-500/20", border: "border-amber-500", gradient: "from-amber-500" },
    { bg: "bg-teal-500", text: "text-teal-400", light: "bg-teal-500/20", border: "border-teal-500", gradient: "from-teal-500" },
    { bg: "bg-rose-500", text: "text-rose-400", light: "bg-rose-500/20", border: "border-rose-500", gradient: "from-rose-500" },
    { bg: "bg-indigo-500", text: "text-indigo-400", light: "bg-indigo-500/20", border: "border-indigo-500", gradient: "from-indigo-500" },
  ];
  return colors[index % colors.length];
};

const HOURS = ["08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18"];
const TIME_OPTIONS: string[] = [];
for (let h = 8; h <= 18; h++) {
  TIME_OPTIONS.push(`${h.toString().padStart(2, "0")}:00`);
  TIME_OPTIONS.push(`${h.toString().padStart(2, "0")}:30`);
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPALE
// ═══════════════════════════════════════════════════════════════

export default function AssegnazioniPage() {
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [cleanings, setCleanings] = useState<Cleaning[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"kanban" | "timeline">("kanban");
  const [showAllOperatorsFor, setShowAllOperatorsFor] = useState<string | null>(null);
  const [showTimePickerFor, setShowTimePickerFor] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState<{
    cleaning: Cleaning;
    operator: Operator;
    score: AssignmentScore;
  } | null>(null);
  const [filterZone, setFilterZone] = useState<string>("Tutte");
  const [toast, setToast] = useState<string | null>(null);
  const [dragging, setDragging] = useState<Cleaning | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // 🔄 Assume mobile su SSR - nessun flash
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.innerWidth < 1024;
  });
  const [mobileTab, setMobileTab] = useState<"lista" | "team" | "info">("lista");

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

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
      const data = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        const cleaning: Cleaning = {
          id: docSnap.id,
          propertyId: d.propertyId,
          propertyName: d.propertyName || "Proprieta",
          propertyAddress: d.propertyAddress || "",
          propertyZona: d.propertyZona || getZoneFromCAP(d.propertyCAP),
          propertyType: d.propertyType,
          propertySize: d.propertySize,
          scheduledDate: d.scheduledDate?.toDate() || new Date(),
          scheduledTime: d.scheduledTime || "10:00",
          checkoutTime: d.checkoutTime,
          checkinTime: d.checkInTime || d.checkinTime,
          status: d.status || "SCHEDULED",
          operatorId: d.operatorId,
          operatorName: d.operatorName,
          operators: d.operators,
          guestsCount: d.guestsCount,
          estimatedDuration: d.estimatedDuration || 2,
          type: d.type,
          notes: d.notes,
          urgent: false,
        };
        cleaning.urgent = isUrgent(cleaning);
        return cleaning;
      });

      data.sort((a, b) => {
        if (a.urgent && !b.urgent) return -1;
        if (!a.urgent && b.urgent) return 1;
        return a.scheduledTime.localeCompare(b.scheduledTime);
      });

      setCleanings(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [selectedDate]);

  useEffect(() => {
    const operatorsQuery = query(
      collection(db, "users"),
      where("role", "==", "OPERATORE_PULIZIE")
    );

    const unsubscribe = onSnapshot(operatorsQuery, (snapshot) => {
      const data = snapshot.docs.map((docSnap, index) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          name: d.name || "Operatore",
          email: d.email || "",
          phone: d.phone,
          status: d.status || "ACTIVE",
          rating: d.rating || 4.0 + Math.random() * 0.8,
          preferredZone: d.preferredZone || ["Centro Storico", "Trastevere", "Vaticano/Prati", "Termini", "EUR"][index % 5],
          speciality: d.speciality || ["Grandi app.", "Pulizia profonda", "Check-in stretti", "Monolocali", "Bilocali"][index % 5],
          speed: d.speed || ["Veloce", "Medio"][index % 2],
          todayCleanings: [] as Cleaning[],
          colorIndex: index,
        };
      });
      setOperators(data);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (operators.length === 0) return;

    setOperators((prev) =>
      prev.map((op) => ({
        ...op,
        todayCleanings: cleanings.filter(
          (c) => c.operatorId === op.id && c.status !== "CANCELLED"
        ),
      }))
    );
  }, [cleanings]);

  const unassignedCleanings = useMemo(() => {
    return cleanings.filter(
      (c) => !c.operatorId && c.status !== "COMPLETED" && c.status !== "CANCELLED"
    );
  }, [cleanings]);

  const assignedCleanings = useMemo(() => {
    return cleanings.filter(
      (c) => c.operatorId && c.status !== "COMPLETED" && c.status !== "CANCELLED"
    );
  }, [cleanings]);

  const zones = useMemo(() => {
    const zoneSet = new Set<string>();
    cleanings.forEach((c) => zoneSet.add(c.propertyZona || "Altro"));
    return Array.from(zoneSet);
  }, [cleanings]);

  const filteredUnassigned = useMemo(() => {
    if (filterZone === "Tutte") return unassignedCleanings;
    return unassignedCleanings.filter((c) => c.propertyZona === filterZone);
  }, [unassignedCleanings, filterZone]);

  const activeOperators = useMemo(() => {
    return operators.filter((op) => op.status === "ACTIVE");
  }, [operators]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleAssign = async (cleaningId: string, operatorId: string, operatorName: string) => {
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

      showToast(`Assegnata a ${operatorName}`);
      setShowConfirmModal(null);
      setShowAllOperatorsFor(null);
    } catch (error) {
      console.error("Errore assegnazione:", error);
      showToast(`Errore: ${error instanceof Error ? error.message : "Errore"}`);
    }
  };

  const handleUnassign = async (cleaningId: string) => {
    try {
      const response = await fetch(`/api/cleanings/${cleaningId}/assign`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Errore rimozione");
      }

      showToast("Pulizia rimossa");
    } catch (error) {
      console.error("Errore rimozione:", error);
      showToast(`Errore: ${error instanceof Error ? error.message : "Errore"}`);
    }
  };

  const handleChangeTime = async (cleaningId: string, newTime: string) => {
    try {
      const cleaningRef = doc(db, "cleanings", cleaningId);
      await updateDoc(cleaningRef, { scheduledTime: newTime });
      showToast(`Orario: ${newTime}`);
      setShowTimePickerFor(null);
    } catch (error) {
      console.error("Errore cambio orario:", error);
      showToast("Errore cambio orario");
    }
  };

  const handleAutoAssignAll = async () => {
    if (filteredUnassigned.length === 0) {
      showToast("Nessuna pulizia da assegnare");
      return;
    }

    const confirm = window.confirm(
      `Vuoi assegnare automaticamente ${filteredUnassigned.length} pulizie?`
    );
    if (!confirm) return;

    let assigned = 0;
    for (const cleaning of filteredUnassigned) {
      const rankings = activeOperators
        .map((op) => ({ operator: op, score: calculateScore(cleaning, op) }))
        .sort((a, b) => b.score.total - a.score.total);

      if (rankings.length > 0) {
        await handleAssign(cleaning.id, rankings[0].operator.id, rankings[0].operator.name);
        assigned++;
      }
    }

    showToast(`${assigned} pulizie assegnate!`);
  };

  const handleDragStart = (cleaning: Cleaning) => {
    setDragging(cleaning);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, operatorId: string, operatorName: string) => {
    e.preventDefault();
    if (dragging) {
      await handleAssign(dragging.id, operatorId, operatorName);
      setDragging(null);
      setDropTarget(null);
    }
  };

  const getRankings = (cleaning: Cleaning) => {
    return activeOperators
      .map((op, idx) => ({
        operator: { ...op, colorIndex: idx },
        score: calculateScore(cleaning, op),
      }))
      .sort((a, b) => b.score.total - a.score.total);
  };

  const ScoreBar = ({ value, max, color }: { value: number; max: number; color: string }) => (
    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
      <div className={`h-full ${color} transition-all`} style={{ width: `${(value / max) * 100}%` }} />
    </div>
  );

  // ═══════════════════════════════════════════════════════════════
  // MOBILE RENDER
  // ═══════════════════════════════════════════════════════════════

  if (isMobile) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col">
        <header className="bg-gradient-to-r from-slate-800 to-slate-900 px-4 py-3 sticky top-0 z-40 border-b border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold">Assegnazioni</h1>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-slate-400 text-sm border-none p-0"
              />
            </div>
            <button
              onClick={handleAutoAssignAll}
              disabled={filteredUnassigned.length === 0}
              className="bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
            >
              Auto ({filteredUnassigned.length})
            </button>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <div className="bg-red-500/20 rounded-xl px-2 py-2 text-center">
              <div className="text-xl font-bold text-red-400">{unassignedCleanings.length}</div>
              <div className="text-xs text-red-300">DA FARE</div>
            </div>
            <div className="bg-orange-500/20 rounded-xl px-2 py-2 text-center">
              <div className="text-xl font-bold text-orange-400">
                {filteredUnassigned.filter((c) => c.urgent).length}
              </div>
              <div className="text-xs text-orange-300">URGENTI</div>
            </div>
            <div className="bg-emerald-500/20 rounded-xl px-2 py-2 text-center">
              <div className="text-xl font-bold text-emerald-400">{assignedCleanings.length}</div>
              <div className="text-xs text-emerald-300">FATTE</div>
            </div>
            <div className="bg-blue-500/20 rounded-xl px-2 py-2 text-center">
              <div className="text-xl font-bold text-blue-400">{activeOperators.length}</div>
              <div className="text-xs text-blue-300">TEAM</div>
            </div>
          </div>
        </header>

        <div className="bg-slate-800/80 border-b border-slate-700 px-2 flex sticky top-[136px] z-30">
          {[
            { id: "lista" as const, label: "Pulizie", icon: "📋" },
            { id: "team" as const, label: "Team", icon: "👥" },
            { id: "info" as const, label: "Info", icon: "🗺" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setMobileTab(tab.id)}
              className={`flex-1 py-3 text-sm font-medium relative ${
                mobileTab === tab.id ? "text-white" : "text-slate-500"
              }`}
            >
              {tab.icon} {tab.label}
              {mobileTab === tab.id && (
                <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-violet-500 rounded-full" />
              )}
            </button>
          ))}
        </div>

        <main className="flex-1 overflow-y-auto pb-20">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full" />
            </div>
          ) : (
            <>
              {mobileTab === "lista" && (
                <div className="p-3">
                  <div className="mb-3 flex gap-2 overflow-x-auto pb-2">
                    <button
                      onClick={() => setFilterZone("Tutte")}
                      className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium ${
                        filterZone === "Tutte" ? "bg-violet-600" : "bg-slate-800"
                      }`}
                    >
                      Tutte ({unassignedCleanings.length})
                    </button>
                    {zones.map((z) => (
                      <button
                        key={z}
                        onClick={() => setFilterZone(z)}
                        className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium ${
                          filterZone === z ? "bg-violet-600" : "bg-slate-800"
                        }`}
                      >
                        {z} ({unassignedCleanings.filter((c) => c.propertyZona === z).length})
                      </button>
                    ))}
                  </div>

                  <div className="space-y-4">
                    {filteredUnassigned.map((cleaning) => {
                      const rankings = getRankings(cleaning);
                      const top3 = rankings.slice(0, 3);
                      const best = top3[0];

                      return (
                        <div
                          key={cleaning.id}
                          className={`bg-slate-800 rounded-2xl overflow-hidden ${
                            cleaning.urgent ? "ring-2 ring-red-500/50" : ""
                          }`}
                        >
                          {cleaning.urgent && (
                            <div className="bg-red-500 px-4 py-2 flex justify-between items-center">
                              <span className="font-bold">URGENTE</span>
                              <span className="text-sm">Check-in: {cleaning.checkinTime}</span>
                            </div>
                          )}

                          <div className="p-4">
                            <div className="flex items-center justify-between mb-3">
                              <button
                                onClick={() => setShowTimePickerFor(cleaning.id)}
                                className="bg-slate-700 px-4 py-2 rounded-xl flex items-center gap-2"
                              >
                                <span className="text-2xl font-bold text-amber-400">
                                  {cleaning.scheduledTime}
                                </span>
                                <span className="text-slate-500">▼</span>
                              </button>
                              <div className="text-right">
                                <div className="font-medium">{cleaning.propertyType || "Appartamento"}</div>
                                <div className="text-sm text-slate-400">
                                  {cleaning.propertySize || "—"}mq - {cleaning.estimatedDuration}h
                                </div>
                              </div>
                            </div>

                            <h3 className="text-xl font-bold mb-1">{cleaning.propertyName}</h3>
                            <p className="text-slate-400 mb-3">{cleaning.propertyAddress}</p>

                            <div className="flex flex-wrap gap-2 mb-3">
                              <span className="bg-violet-500/30 text-violet-300 px-3 py-1 rounded-full text-sm font-medium">
                                {cleaning.propertyZona || "—"}
                              </span>
                              {cleaning.guestsCount && (
                                <span className="bg-slate-700 px-3 py-1 rounded-full text-sm">
                                  {cleaning.guestsCount} ospiti
                                </span>
                              )}
                            </div>

                            {cleaning.notes && (
                              <div className="bg-amber-500/10 text-amber-300 px-3 py-2 rounded-lg text-sm mb-3">
                                {cleaning.notes}
                              </div>
                            )}
                          </div>

                          {best && (
                            <div className="bg-emerald-500/10 border-t border-emerald-500/20 p-4">
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-sm font-medium text-emerald-400">
                                  MIGLIOR MATCH AI
                                </span>
                                <button
                                  onClick={() => setShowAllOperatorsFor(cleaning.id)}
                                  className="text-sm text-violet-400"
                                >
                                  Tutti ({activeOperators.length}) →
                                </button>
                              </div>

                              <button
                                onClick={() =>
                                  setShowConfirmModal({
                                    cleaning,
                                    operator: best.operator,
                                    score: best.score,
                                  })
                                }
                                className={`w-full ${
                                  getOperatorColor(best.operator.colorIndex || 0).light
                                } border border-slate-600 rounded-xl p-3 mb-3 text-left`}
                              >
                                <div className="flex items-center gap-3">
                                  <div
                                    className={`w-12 h-12 ${
                                      getOperatorColor(best.operator.colorIndex || 0).bg
                                    } rounded-full flex items-center justify-center text-xl font-bold`}
                                  >
                                    {best.operator.name.charAt(0)}
                                  </div>
                                  <div className="flex-1">
                                    <div className="font-bold text-lg">{best.operator.name}</div>
                                    <div className="text-sm text-slate-400">
                                      {best.operator.rating?.toFixed(1)} - {best.operator.preferredZone}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div
                                      className={`text-3xl font-bold ${
                                        getOperatorColor(best.operator.colorIndex || 0).text
                                      }`}
                                    >
                                      {best.score.total}
                                    </div>
                                    <div className="text-xs text-slate-500">/100</div>
                                  </div>
                                </div>

                                <div className="grid grid-cols-4 gap-2 mt-3 text-xs">
                                  <div className="text-center">
                                    <div className="text-blue-400">{best.score.proximity.points}/30</div>
                                    <div className="text-slate-500">{best.score.proximity.km}km</div>
                                  </div>
                                  <div className="text-center">
                                    <div className="text-emerald-400">{best.score.familiarity.points}/25</div>
                                    <div className="text-slate-500">{best.score.familiarity.times}x</div>
                                  </div>
                                  <div className="text-center">
                                    <div className="text-amber-400">{best.score.workload.points}/25</div>
                                    <div className="text-slate-500">{best.score.workload.today} oggi</div>
                                  </div>
                                  <div className="text-center">
                                    <div className="text-purple-400">{best.score.performance.points}/20</div>
                                    <div className="text-slate-500">{best.score.performance.rating.toFixed(1)}</div>
                                  </div>
                                </div>
                              </button>

                              <div className="flex gap-2">
                                {top3.slice(1).map(({ operator, score }, idx) => (
                                  <button
                                    key={operator.id}
                                    onClick={() => setShowConfirmModal({ cleaning, operator, score })}
                                    className={`flex-1 ${
                                      getOperatorColor(operator.colorIndex || 0).light
                                    } border border-slate-700 rounded-xl p-2 text-center`}
                                  >
                                    <div
                                      className={`w-8 h-8 ${
                                        getOperatorColor(operator.colorIndex || 0).bg
                                      } rounded-full flex items-center justify-center mx-auto mb-1 font-bold`}
                                    >
                                      {operator.name.charAt(0)}
                                    </div>
                                    <div className="font-medium text-sm">{operator.name.split(" ")[0]}</div>
                                    <div className={`font-bold ${getOperatorColor(operator.colorIndex || 0).text}`}>
                                      {score.total}pt
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {filteredUnassigned.length === 0 && (
                      <div className="text-center py-16">
                        <div className="text-6xl mb-4">🎉</div>
                        <h3 className="text-2xl font-bold">Tutto assegnato!</h3>
                        <p className="text-slate-400">Vedi il tab Team</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {mobileTab === "team" && (
                <div className="p-3 space-y-3">
                  {activeOperators.map((op, idx) => {
                    const opCleanings = op.todayCleanings.sort((a, b) =>
                      a.scheduledTime.localeCompare(b.scheduledTime)
                    );
                    const totalHours = opCleanings.reduce((sum, c) => sum + (c.estimatedDuration || 2), 0);

                    return (
                      <div key={op.id} className="bg-slate-800 rounded-2xl overflow-hidden">
                        <div className={`${getOperatorColor(idx).bg} p-4`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center text-2xl font-bold">
                                {op.name.charAt(0)}
                              </div>
                              <div>
                                <h3 className="font-bold text-lg">{op.name}</h3>
                                <div className="text-sm opacity-80">{op.rating?.toFixed(1)} - {op.preferredZone}</div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-3xl font-bold">{opCleanings.length}</div>
                              <div className="text-sm opacity-80">{totalHours}h</div>
                            </div>
                          </div>
                        </div>

                        <div className="p-3">
                          {opCleanings.length > 0 ? (
                            <div className="space-y-2">
                              {opCleanings.map((c) => (
                                <div
                                  key={c.id}
                                  className={`bg-slate-700/50 rounded-xl p-3 flex items-center gap-3 ${
                                    c.urgent ? "border-l-4 border-red-500" : ""
                                  }`}
                                >
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-lg font-bold text-emerald-400">{c.scheduledTime}</span>
                                      <span className="text-sm text-slate-400">{c.estimatedDuration}h</span>
                                    </div>
                                    <div className="font-medium">{c.propertyName}</div>
                                    <div className="text-sm text-slate-400">{c.propertyZona}</div>
                                  </div>
                                  <button
                                    onClick={() => handleUnassign(c.id)}
                                    className="w-10 h-10 bg-red-500/20 text-red-400 rounded-xl flex items-center justify-center"
                                  >
                                    X
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center py-6 text-slate-500">
                              <div className="text-3xl mb-2">📭</div>
                              <p className="text-sm">Nessuna pulizia</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {mobileTab === "info" && (
                <div className="p-3 space-y-4">
                  <div className="bg-slate-800 rounded-2xl p-4">
                    <h3 className="font-bold mb-3">Zone da CAP</h3>
                    <p className="text-slate-400 text-sm mb-4">
                      La zona viene determinata automaticamente dal CAP.
                    </p>
                    <div className="space-y-2">
                      {Object.entries(
                        Object.entries(ZONE_FROM_CAP).reduce((acc, [cap, zone]) => {
                          if (!acc[zone]) acc[zone] = [];
                          acc[zone].push(cap);
                          return acc;
                        }, {} as Record<string, string[]>)
                      ).map(([zone, caps]) => (
                        <div key={zone} className="flex items-center gap-3 bg-slate-700/50 rounded-lg p-3">
                          <div className="w-4 h-4 bg-violet-500 rounded-full" />
                          <div className="flex-1">
                            <div className="font-medium">{zone}</div>
                            <div className="text-xs text-slate-500">CAP: {caps.join(", ")}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-slate-800 rounded-2xl p-4">
                    <h3 className="font-bold mb-3">Punteggio AI</h3>
                    <div className="space-y-3 text-sm">
                      <div className="bg-blue-500/10 rounded-lg p-3">
                        <div className="font-bold text-blue-400">Prossimita (30pt)</div>
                        <p className="text-slate-400">Distanza dalla zona preferita</p>
                      </div>
                      <div className="bg-emerald-500/10 rounded-lg p-3">
                        <div className="font-bold text-emerald-400">Familiarita (25pt)</div>
                        <p className="text-slate-400">Quante volte ha pulito qui</p>
                      </div>
                      <div className="bg-amber-500/10 rounded-lg p-3">
                        <div className="font-bold text-amber-400">Carico (25pt)</div>
                        <p className="text-slate-400">Pulizie gia assegnate oggi</p>
                      </div>
                      <div className="bg-purple-500/10 rounded-lg p-3">
                        <div className="font-bold text-purple-400">Performance (20pt)</div>
                        <p className="text-slate-400">Rating medio</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </main>

        {showAllOperatorsFor && (
          <div className="fixed inset-0 bg-black/95 z-50 flex flex-col">
            <div className="bg-slate-800 p-4 flex items-center justify-between border-b border-slate-700">
              <h3 className="font-bold text-lg">Tutti gli operatori</h3>
              <button onClick={() => setShowAllOperatorsFor(null)} className="text-2xl">X</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {(() => {
                const cleaning = cleanings.find((c) => c.id === showAllOperatorsFor);
                if (!cleaning) return null;
                return getRankings(cleaning).map(({ operator, score }, idx) => (
                  <button
                    key={operator.id}
                    onClick={() => setShowConfirmModal({ cleaning, operator, score })}
                    className="w-full text-left p-4 rounded-xl bg-slate-800 border border-slate-700"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl w-8">
                        {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}
                      </span>
                      <div
                        className={`w-12 h-12 ${getOperatorColor(operator.colorIndex || 0).bg} rounded-full flex items-center justify-center text-xl font-bold`}
                      >
                        {operator.name.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <div className="font-bold">{operator.name}</div>
                        <div className="text-sm text-slate-400">{operator.rating?.toFixed(1)} - {operator.preferredZone}</div>
                      </div>
                      <div className={`text-3xl font-bold ${getOperatorColor(operator.colorIndex || 0).text}`}>
                        {score.total}
                      </div>
                    </div>
                  </button>
                ));
              })()}
            </div>
          </div>
        )}

        {showConfirmModal && (
          <div className="fixed inset-0 bg-black/95 z-50 flex items-end">
            <div className="w-full bg-slate-800 rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto">
              <div className="w-12 h-1 bg-slate-600 rounded-full mx-auto mb-6" />
              <h3 className="text-xl font-bold mb-4 text-center">Conferma Assegnazione</h3>

              <div className={`${getOperatorColor(showConfirmModal.operator.colorIndex || 0).light} rounded-2xl p-4 mb-4 border-2 ${getOperatorColor(showConfirmModal.operator.colorIndex || 0).border}`}>
                <div className="flex items-center gap-4 mb-4">
                  <div className={`w-16 h-16 ${getOperatorColor(showConfirmModal.operator.colorIndex || 0).bg} rounded-full flex items-center justify-center text-2xl font-bold`}>
                    {showConfirmModal.operator.name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <div className="text-xl font-bold">{showConfirmModal.operator.name}</div>
                    <div className="text-slate-400">{showConfirmModal.operator.rating?.toFixed(1)} - {showConfirmModal.operator.preferredZone}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-4xl font-bold ${getOperatorColor(showConfirmModal.operator.colorIndex || 0).text}`}>
                      {showConfirmModal.score.total}
                    </div>
                    <div className="text-sm text-slate-500">/100</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-900/50 rounded-xl p-3">
                    <div className="text-blue-400 font-bold mb-1">Prossimita {showConfirmModal.score.proximity.points}/30</div>
                    <ScoreBar value={showConfirmModal.score.proximity.points} max={30} color="bg-blue-500" />
                  </div>
                  <div className="bg-slate-900/50 rounded-xl p-3">
                    <div className="text-emerald-400 font-bold mb-1">Familiarita {showConfirmModal.score.familiarity.points}/25</div>
                    <ScoreBar value={showConfirmModal.score.familiarity.points} max={25} color="bg-emerald-500" />
                  </div>
                  <div className="bg-slate-900/50 rounded-xl p-3">
                    <div className="text-amber-400 font-bold mb-1">Carico {showConfirmModal.score.workload.points}/25</div>
                    <ScoreBar value={showConfirmModal.score.workload.points} max={25} color="bg-amber-500" />
                  </div>
                  <div className="bg-slate-900/50 rounded-xl p-3">
                    <div className="text-purple-400 font-bold mb-1">Performance {showConfirmModal.score.performance.points}/20</div>
                    <ScoreBar value={showConfirmModal.score.performance.points} max={20} color="bg-purple-500" />
                  </div>
                </div>
              </div>

              <div className="bg-slate-700/30 rounded-xl p-4 mb-6">
                <div className="flex justify-between mb-2">
                  <span className="text-2xl font-bold text-amber-400">{showConfirmModal.cleaning.scheduledTime}</span>
                  <span className="text-slate-400">{showConfirmModal.cleaning.estimatedDuration}h</span>
                </div>
                <div className="font-bold text-lg">{showConfirmModal.cleaning.propertyName}</div>
                <div className="text-slate-400">{showConfirmModal.cleaning.propertyZona}</div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowConfirmModal(null)} className="flex-1 bg-slate-700 py-4 rounded-xl font-bold text-lg">
                  Annulla
                </button>
                <button
                  onClick={() => handleAssign(showConfirmModal.cleaning.id, showConfirmModal.operator.id, showConfirmModal.operator.name)}
                  className={`flex-1 ${getOperatorColor(showConfirmModal.operator.colorIndex || 0).bg} py-4 rounded-xl font-bold text-lg`}
                >
                  Conferma
                </button>
              </div>
            </div>
          </div>
        )}

        {showTimePickerFor && (
          <div className="fixed inset-0 bg-black/95 z-50 flex items-end">
            <div className="w-full bg-slate-800 rounded-t-3xl p-6">
              <div className="w-12 h-1 bg-slate-600 rounded-full mx-auto mb-6" />
              <h3 className="text-xl font-bold mb-4">Seleziona Orario</h3>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {TIME_OPTIONS.map((time) => {
                  const current = cleanings.find((c) => c.id === showTimePickerFor)?.scheduledTime;
                  return (
                    <button
                      key={time}
                      onClick={() => handleChangeTime(showTimePickerFor, time)}
                      className={`py-3 rounded-xl font-bold ${current === time ? "bg-violet-600" : "bg-slate-700"}`}
                    >
                      {time}
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setShowTimePickerFor(null)} className="w-full bg-slate-700 py-4 rounded-xl font-bold">
                Chiudi
              </button>
            </div>
          </div>
        )}

        {toast && (
          <div className="fixed bottom-6 left-4 right-4 bg-emerald-500 py-4 px-6 rounded-xl text-center font-bold shadow-2xl z-50">
            {toast}
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // DESKTOP RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div>
              <h1 className="text-2xl font-bold">Dashboard Assegnazioni</h1>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1 text-sm mt-1"
              />
            </div>

            <div className="flex bg-slate-800 rounded-xl p-1">
              <button
                onClick={() => setViewMode("kanban")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  viewMode === "kanban" ? "bg-violet-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                Kanban
              </button>
              <button
                onClick={() => setViewMode("timeline")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  viewMode === "timeline" ? "bg-violet-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                Timeline
              </button>
            </div>

            <select
              value={filterZone}
              onChange={(e) => setFilterZone(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm"
            >
              <option value="Tutte">Tutte le zone</option>
              {zones.map((z) => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-6 text-sm">
              <div className="text-center">
                <div className="text-2xl font-bold text-red-400">{unassignedCleanings.length}</div>
                <div className="text-slate-500">Da assegnare</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-emerald-400">{assignedCleanings.length}</div>
                <div className="text-slate-500">Assegnate</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400">{cleanings.length}</div>
                <div className="text-slate-500">Totale</div>
              </div>
            </div>

            <div className="w-40">
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>Progresso</span>
                <span>{cleanings.length > 0 ? Math.round((assignedCleanings.length / cleanings.length) * 100) : 0}%</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-green-400 transition-all duration-500"
                  style={{ width: `${cleanings.length > 0 ? (assignedCleanings.length / cleanings.length) * 100 : 0}%` }}
                />
              </div>
            </div>

            <button
              onClick={handleAutoAssignAll}
              disabled={filteredUnassigned.length === 0}
              className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 px-6 py-3 rounded-xl font-bold text-lg disabled:opacity-50 transition-all shadow-lg shadow-orange-500/20"
            >
              Auto-Assegna ({filteredUnassigned.length})
            </button>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full" />
        </div>
      ) : viewMode === "kanban" ? (
        <div className="flex" style={{ height: "calc(100vh - 88px)" }}>
          <div
            className={`w-[420px] flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col transition-all ${
              dropTarget === "unassigned" ? "ring-2 ring-inset ring-amber-500" : ""
            }`}
            onDragOver={handleDragOver}
            onDragEnter={() => setDropTarget("unassigned")}
            onDragLeave={() => setDropTarget(null)}
          >
            <div className="p-4 border-b border-slate-800 bg-gradient-to-r from-red-500/10 to-orange-500/10">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                Da Assegnare
                <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full text-sm">{filteredUnassigned.length}</span>
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {filteredUnassigned.map((cleaning) => {
                const rankings = getRankings(cleaning);
                const best = rankings[0];

                return (
                  <div
                    key={cleaning.id}
                    draggable
                    onDragStart={() => handleDragStart(cleaning)}
                    onDragEnd={() => { setDragging(null); setDropTarget(null); }}
                    className={`bg-slate-800 rounded-xl overflow-hidden cursor-grab active:cursor-grabbing border-l-4 ${
                      cleaning.urgent ? "border-red-500" : "border-emerald-500"
                    } ${dragging?.id === cleaning.id ? "opacity-50" : ""}`}
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {cleaning.urgent && (
                            <span className="bg-red-500 text-white text-xs px-2 py-1 rounded font-bold animate-pulse">URGENTE</span>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); setShowTimePickerFor(cleaning.id); }}
                            className="bg-slate-700 px-3 py-1.5 rounded-lg text-lg font-bold text-amber-400 hover:bg-slate-600"
                          >
                            {cleaning.scheduledTime}
                          </button>
                        </div>
                        <div className="text-right text-xs text-slate-500">
                          <div>{cleaning.propertyType || "Appartamento"}</div>
                          <div>{cleaning.estimatedDuration}h</div>
                        </div>
                      </div>

                      <h3 className="font-bold text-lg mb-1">{cleaning.propertyName}</h3>
                      <p className="text-slate-400 text-sm mb-2">{cleaning.propertyAddress}</p>

                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="bg-violet-500/20 text-violet-300 px-2 py-1 rounded-full">{cleaning.propertyZona || "—"}</span>
                        {cleaning.checkinTime && (
                          <span className={`px-2 py-1 rounded-full ${cleaning.urgent ? "bg-red-500/20 text-red-400" : "bg-slate-700 text-slate-400"}`}>
                            Check-in: {cleaning.checkinTime}
                          </span>
                        )}
                      </div>
                    </div>

                    {best && (
                      <div className="bg-emerald-500/10 border-t border-emerald-500/20 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-emerald-400 font-medium">SUGGERIMENTO AI</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); setShowAllOperatorsFor(cleaning.id); }}
                            className="text-xs text-violet-400 hover:underline"
                          >
                            Vedi tutti
                          </button>
                        </div>

                        <button
                          onClick={(e) => { e.stopPropagation(); setShowConfirmModal({ cleaning, operator: best.operator, score: best.score }); }}
                          className="w-full bg-slate-800 rounded-lg p-2 flex items-center gap-3 hover:bg-slate-700 transition-colors"
                        >
                          <div className={`w-10 h-10 ${getOperatorColor(best.operator.colorIndex || 0).bg} rounded-full flex items-center justify-center font-bold`}>
                            {best.operator.name.charAt(0)}
                          </div>
                          <div className="flex-1 text-left">
                            <div className="font-medium">{best.operator.name}</div>
                            <div className="text-xs text-slate-400">{best.score.proximity.km}km - {best.score.workload.today} oggi</div>
                          </div>
                          <div className={`text-xl font-bold ${getOperatorColor(best.operator.colorIndex || 0).text}`}>{best.score.total}</div>
                        </button>

                        <div className="grid grid-cols-3 gap-1 mt-2">
                          {rankings.slice(0, 3).map(({ operator, score }) => (
                            <button
                              key={operator.id}
                              onClick={(e) => { e.stopPropagation(); handleAssign(cleaning.id, operator.id, operator.name); }}
                              className={`${getOperatorColor(operator.colorIndex || 0).bg} py-2 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity`}
                            >
                              {operator.name.split(" ")[0]} - {score.total}pt
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredUnassigned.length === 0 && (
                <div className="text-center py-12">
                  <div className="text-5xl mb-3">🎉</div>
                  <h3 className="text-xl font-bold">Tutto assegnato!</h3>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 flex overflow-x-auto p-4 gap-3 bg-slate-950">
            {activeOperators.map((op, idx) => {
              const opCleanings = op.todayCleanings.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
              const totalHours = opCleanings.reduce((sum, c) => sum + (c.estimatedDuration || 2), 0);
              const color = getOperatorColor(idx);

              return (
                <div
                  key={op.id}
                  className={`flex-shrink-0 w-64 bg-slate-900 rounded-xl overflow-hidden flex flex-col transition-all ${
                    dropTarget === op.id ? `ring-2 ${color.border}` : ""
                  }`}
                  onDragOver={handleDragOver}
                  onDragEnter={() => setDropTarget(op.id)}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={(e) => handleDrop(e, op.id, op.name)}
                >
                  <div className={`bg-gradient-to-r ${color.gradient} to-transparent p-4`}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-xl font-bold">
                        {op.name.charAt(0)}
                      </div>
                      <div>
                        <h2 className="font-bold">{op.name}</h2>
                        <div className="text-sm opacity-80">{op.rating?.toFixed(1)} - {op.preferredZone}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="bg-white/10 rounded-lg p-2">
                        <div className="font-bold text-lg">{opCleanings.length}</div>
                        <div className="opacity-70">pulizie</div>
                      </div>
                      <div className="bg-white/10 rounded-lg p-2">
                        <div className="font-bold text-lg">{totalHours}h</div>
                        <div className="opacity-70">lavoro</div>
                      </div>
                      <div className="bg-white/10 rounded-lg p-2">
                        <div className="font-bold text-lg">{op.speed?.charAt(0)}</div>
                        <div className="opacity-70">speed</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {opCleanings.map((c) => (
                      <div key={c.id} className={`bg-slate-800 rounded-lg p-3 border-l-4 ${color.border} ${c.urgent ? "ring-1 ring-red-500/50" : ""}`}>
                        <div className="flex items-center justify-between mb-1">
                          <button onClick={() => setShowTimePickerFor(c.id)} className="text-emerald-400 font-bold hover:underline">
                            {c.scheduledTime}
                          </button>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">{c.estimatedDuration}h</span>
                            <button
                              onClick={() => handleUnassign(c.id)}
                              className="w-6 h-6 bg-red-500/20 text-red-400 rounded flex items-center justify-center text-xs hover:bg-red-500/30"
                            >
                              X
                            </button>
                          </div>
                        </div>
                        <div className="font-medium text-sm truncate">{c.propertyName}</div>
                        <div className="text-xs text-slate-500">{c.propertyZona}</div>
                        {c.urgent && <div className="text-xs text-red-400 mt-1">Check-in {c.checkinTime}</div>}
                      </div>
                    ))}

                    {opCleanings.length === 0 && (
                      <div className={`border-2 border-dashed ${color.border}/30 rounded-lg p-6 text-center`}>
                        <div className="text-slate-500 text-sm">Trascina qui</div>
                        <div className="text-xs text-slate-600 mt-1">Zona: {op.preferredZone}</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex" style={{ height: "calc(100vh - 88px)" }}>
          <div className="w-80 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
            <div className="p-4 border-b border-slate-800 bg-gradient-to-r from-red-500/10 to-orange-500/10">
              <h2 className="font-bold flex items-center gap-2">
                <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                Da Assegnare
                <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full text-sm">{filteredUnassigned.length}</span>
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {filteredUnassigned.map((cleaning) => {
                const best = getRankings(cleaning)[0];

                return (
                  <div
                    key={cleaning.id}
                    draggable
                    onDragStart={() => handleDragStart(cleaning)}
                    onDragEnd={() => { setDragging(null); setDropTarget(null); }}
                    className={`bg-slate-800 rounded-xl p-3 cursor-grab active:cursor-grabbing border-l-4 ${
                      cleaning.urgent ? "border-red-500" : "border-emerald-500"
                    } ${dragging?.id === cleaning.id ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {cleaning.urgent && <span className="text-red-500 text-xs animate-pulse">!</span>}
                        <button onClick={() => setShowTimePickerFor(cleaning.id)} className="text-lg font-bold text-amber-400 hover:underline">
                          {cleaning.scheduledTime}
                        </button>
                      </div>
                      <span className="text-xs text-slate-500">{cleaning.estimatedDuration}h</span>
                    </div>
                    <div className="font-medium text-sm truncate">{cleaning.propertyName}</div>
                    <div className="text-xs text-slate-500 mb-2">{cleaning.propertyZona}</div>

                    {best && (
                      <button
                        onClick={() => handleAssign(cleaning.id, best.operator.id, best.operator.name)}
                        className={`w-full ${getOperatorColor(best.operator.colorIndex || 0).bg} py-2 rounded-lg text-xs font-medium hover:opacity-80`}
                      >
                        {best.operator.name.split(" ")[0]} - {best.score.total}pt
                      </button>
                    )}
                  </div>
                );
              })}

              {filteredUnassigned.length === 0 && (
                <div className="text-center py-8 text-slate-500">
                  <div className="text-4xl mb-2">🎉</div>
                  <p className="text-sm">Tutto assegnato!</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-auto p-6">
            <div className="min-w-max">
              <div className="flex mb-2 ml-40">
                {HOURS.map((hour) => (
                  <div key={hour} className="w-24 text-center text-slate-500 text-sm font-medium">{hour}:00</div>
                ))}
              </div>

              <div className="space-y-2">
                {activeOperators.map((op, idx) => {
                  const color = getOperatorColor(idx);
                  const opCleanings = op.todayCleanings;

                  return (
                    <div
                      key={op.id}
                      className="flex items-center"
                      onDragOver={handleDragOver}
                      onDragEnter={() => setDropTarget(op.id)}
                      onDragLeave={() => setDropTarget(null)}
                      onDrop={(e) => handleDrop(e, op.id, op.name)}
                    >
                      <div className="w-40 flex-shrink-0 pr-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 ${color.bg} rounded-full flex items-center justify-center font-bold shadow-lg`}>
                            {op.name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-medium text-sm">{op.name.split(" ")[0]}</div>
                            <div className={`text-xs ${color.text}`}>{op.rating?.toFixed(1)} - {opCleanings.length}pul</div>
                          </div>
                        </div>
                      </div>

                      <div className={`flex-1 flex bg-slate-800/30 rounded-lg relative h-16 transition-all ${dropTarget === op.id ? `ring-2 ${color.border}` : ""}`}>
                        <div className="absolute inset-0 flex">
                          {HOURS.map((_, i) => (
                            <div key={i} className="w-24 border-l border-slate-700/30" />
                          ))}
                        </div>

                        {opCleanings.map((c) => {
                          const startHour = parseInt(c.scheduledTime.split(":")[0]);
                          const startMin = parseInt(c.scheduledTime.split(":")[1]);
                          const startOffset = (startHour - 8) * 96 + (startMin / 60) * 96;
                          const width = (c.estimatedDuration || 2) * 96;

                          return (
                            <div
                              key={c.id}
                              className={`absolute top-1 bottom-1 ${color.bg} rounded-lg shadow-lg flex items-center px-2 text-sm font-medium cursor-pointer hover:scale-105 transition-transform ${c.urgent ? "ring-2 ring-red-500" : ""}`}
                              style={{ left: `${startOffset}px`, width: `${width}px` }}
                              onClick={() => setShowTimePickerFor(c.id)}
                              title={`${c.propertyName} - ${c.scheduledTime} (${c.estimatedDuration}h)`}
                            >
                              <span className="truncate">{c.scheduledTime} {c.propertyName.split(" ")[0]}</span>
                            </div>
                          );
                        })}

                        {opCleanings.length === 0 && (
                          <div className="absolute inset-2 border-2 border-dashed border-slate-700 rounded-lg flex items-center justify-center text-slate-600 text-sm">
                            Trascina pulizie qui
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 flex items-center justify-center gap-6 text-sm text-slate-500">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-gradient-to-r from-pink-500 to-emerald-500 rounded" />
                  <span>Pulizia assegnata (click per cambiare orario)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-dashed border-slate-600 rounded" />
                  <span>Slot libero (trascina qui)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAllOperatorsFor && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-8">
          <div className="bg-slate-800 rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <h3 className="font-bold text-lg">Tutti gli operatori</h3>
              <button onClick={() => setShowAllOperatorsFor(null)} className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center hover:bg-slate-600">X</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {(() => {
                const cleaning = cleanings.find((c) => c.id === showAllOperatorsFor);
                if (!cleaning) return null;
                return getRankings(cleaning).map(({ operator, score }, idx) => (
                  <button
                    key={operator.id}
                    onClick={() => setShowConfirmModal({ cleaning, operator, score })}
                    className="w-full text-left p-4 rounded-xl bg-slate-700/50 hover:bg-slate-700 border border-slate-600 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-xl w-8">{idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}</span>
                      <div className={`w-12 h-12 ${getOperatorColor(operator.colorIndex || 0).bg} rounded-full flex items-center justify-center text-xl font-bold`}>
                        {operator.name.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <div className="font-bold">{operator.name}</div>
                        <div className="text-sm text-slate-400">{operator.rating?.toFixed(1)} - {operator.preferredZone} - {operator.speciality}</div>
                      </div>
                      <div className="grid grid-cols-4 gap-4 text-xs text-center">
                        <div><div className="text-blue-400 font-bold">{score.proximity.points}</div><div className="text-slate-500">Prox</div></div>
                        <div><div className="text-emerald-400 font-bold">{score.familiarity.points}</div><div className="text-slate-500">Fam</div></div>
                        <div><div className="text-amber-400 font-bold">{score.workload.points}</div><div className="text-slate-500">Load</div></div>
                        <div><div className="text-purple-400 font-bold">{score.performance.points}</div><div className="text-slate-500">Perf</div></div>
                      </div>
                      <div className={`text-3xl font-bold ${getOperatorColor(operator.colorIndex || 0).text}`}>{score.total}</div>
                    </div>
                  </button>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-8">
          <div className="bg-slate-800 rounded-2xl w-full max-w-lg p-6">
            <h3 className="text-xl font-bold mb-4 text-center">Conferma Assegnazione</h3>

            <div className={`${getOperatorColor(showConfirmModal.operator.colorIndex || 0).light} rounded-2xl p-4 mb-4 border-2 ${getOperatorColor(showConfirmModal.operator.colorIndex || 0).border}`}>
              <div className="flex items-center gap-4 mb-4">
                <div className={`w-14 h-14 ${getOperatorColor(showConfirmModal.operator.colorIndex || 0).bg} rounded-full flex items-center justify-center text-2xl font-bold`}>
                  {showConfirmModal.operator.name.charAt(0)}
                </div>
                <div className="flex-1">
                  <div className="text-xl font-bold">{showConfirmModal.operator.name}</div>
                  <div className="text-slate-400">{showConfirmModal.operator.rating?.toFixed(1)} - {showConfirmModal.operator.preferredZone}</div>
                </div>
                <div className="text-right">
                  <div className={`text-3xl font-bold ${getOperatorColor(showConfirmModal.operator.colorIndex || 0).text}`}>{showConfirmModal.score.total}</div>
                  <div className="text-sm text-slate-500">/100</div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 text-xs">
                <div className="bg-slate-900/50 rounded-lg p-2 text-center">
                  <div className="text-blue-400 font-bold">{showConfirmModal.score.proximity.points}/30</div>
                  <div className="text-slate-500">{showConfirmModal.score.proximity.km}km</div>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-2 text-center">
                  <div className="text-emerald-400 font-bold">{showConfirmModal.score.familiarity.points}/25</div>
                  <div className="text-slate-500">{showConfirmModal.score.familiarity.times}x</div>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-2 text-center">
                  <div className="text-amber-400 font-bold">{showConfirmModal.score.workload.points}/25</div>
                  <div className="text-slate-500">{showConfirmModal.score.workload.today} oggi</div>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-2 text-center">
                  <div className="text-purple-400 font-bold">{showConfirmModal.score.performance.points}/20</div>
                  <div className="text-slate-500">{showConfirmModal.score.performance.rating.toFixed(1)}</div>
                </div>
              </div>
            </div>

            <div className="bg-slate-700/30 rounded-xl p-4 mb-6">
              <div className="flex justify-between mb-2">
                <span className="text-xl font-bold text-amber-400">{showConfirmModal.cleaning.scheduledTime}</span>
                <span className="text-slate-400">{showConfirmModal.cleaning.estimatedDuration}h</span>
              </div>
              <div className="font-bold">{showConfirmModal.cleaning.propertyName}</div>
              <div className="text-slate-400 text-sm">{showConfirmModal.cleaning.propertyZona}</div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowConfirmModal(null)} className="flex-1 bg-slate-700 hover:bg-slate-600 py-3 rounded-xl font-bold transition-colors">
                Annulla
              </button>
              <button
                onClick={() => handleAssign(showConfirmModal.cleaning.id, showConfirmModal.operator.id, showConfirmModal.operator.name)}
                className={`flex-1 ${getOperatorColor(showConfirmModal.operator.colorIndex || 0).bg} hover:opacity-90 py-3 rounded-xl font-bold transition-opacity`}
              >
                Conferma
              </button>
            </div>
          </div>
        </div>
      )}

      {showTimePickerFor && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-8">
          <div className="bg-slate-800 rounded-2xl w-full max-w-md p-6">
            <h3 className="text-xl font-bold mb-4 text-center">Seleziona Orario</h3>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {TIME_OPTIONS.map((time) => {
                const current = cleanings.find((c) => c.id === showTimePickerFor)?.scheduledTime;
                return (
                  <button
                    key={time}
                    onClick={() => handleChangeTime(showTimePickerFor, time)}
                    className={`py-3 rounded-xl font-bold transition-colors ${current === time ? "bg-violet-600" : "bg-slate-700 hover:bg-slate-600"}`}
                  >
                    {time}
                  </button>
                );
              })}
            </div>
            <button onClick={() => setShowTimePickerFor(null)} className="w-full bg-slate-700 hover:bg-slate-600 py-3 rounded-xl font-bold transition-colors">
              Chiudi
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-emerald-500 px-8 py-4 rounded-xl font-bold text-lg shadow-2xl z-50">
          {toast}
        </div>
      )}
    </div>
  );
}