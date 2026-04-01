"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
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
  "00184": "Centro Storico", "00186": "Centro Storico", "00187": "Centro Storico",
  "00153": "Trastevere", "00154": "Testaccio",
  "00192": "Vaticano/Prati", "00193": "Vaticano/Prati",
  "00185": "Termini", "00144": "EUR", "00142": "EUR",
};

const getZoneFromCAP = (cap?: string): string => {
  if (!cap) return "Altro";
  return ZONE_FROM_CAP[cap] || "Altro";
};

const calculateScore = (cleaning: Cleaning, operator: Operator): AssignmentScore => {
  const sameZone = cleaning.propertyZona === operator.preferredZone;
  const zoneNearby = cleaning.propertyZona?.includes("Centro") && operator.preferredZone?.includes("Centro");
  let proximityPoints: number, km: string, minutes: number;
  if (sameZone) { km = "0.5"; proximityPoints = 28; }
  else if (zoneNearby) { km = "1.2"; proximityPoints = 22; }
  else { km = "3.5"; proximityPoints = 10; }
  minutes = Math.ceil(parseFloat(km) * 10);
  const familiarityPoints = 10;
  const timesCleaned = -1;
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

const OP_COLORS = [
  { bg: "bg-pink-500", hex: "#ec4899", text: "text-pink-600", light: "bg-pink-50", border: "border-pink-400", ring: "ring-pink-400" },
  { bg: "bg-blue-500", hex: "#3b82f6", text: "text-blue-600", light: "bg-blue-50", border: "border-blue-400", ring: "ring-blue-400" },
  { bg: "bg-emerald-500", hex: "#10b981", text: "text-emerald-600", light: "bg-emerald-50", border: "border-emerald-400", ring: "ring-emerald-400" },
  { bg: "bg-purple-500", hex: "#a855f7", text: "text-purple-600", light: "bg-purple-50", border: "border-purple-400", ring: "ring-purple-400" },
  { bg: "bg-amber-500", hex: "#f59e0b", text: "text-amber-600", light: "bg-amber-50", border: "border-amber-400", ring: "ring-amber-400" },
  { bg: "bg-teal-500", hex: "#14b8a6", text: "text-teal-600", light: "bg-teal-50", border: "border-teal-400", ring: "ring-teal-400" },
  { bg: "bg-rose-500", hex: "#f43f5e", text: "text-rose-600", light: "bg-rose-50", border: "border-rose-400", ring: "ring-rose-400" },
  { bg: "bg-indigo-500", hex: "#6366f1", text: "text-indigo-600", light: "bg-indigo-50", border: "border-indigo-400", ring: "ring-indigo-400" },
];
const getColor = (i: number) => OP_COLORS[i % OP_COLORS.length];

const HOURS = ["08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18"];
const TIME_OPTIONS: string[] = [];
for (let h = 8; h <= 18; h++) {
  TIME_OPTIONS.push(`${h.toString().padStart(2, "0")}:00`);
  TIME_OPTIONS.push(`${h.toString().padStart(2, "0")}:30`);
}

// ═══════════════════════════════════════════════════════════════
// PORTAL WRAPPER
// ═══════════════════════════════════════════════════════════════
function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPALE
// ═══════════════════════════════════════════════════════════════

export default function AssegnazioniPage() {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [cleanings, setCleanings] = useState<Cleaning[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"kanban" | "timeline">("kanban");
  const [filterZone, setFilterZone] = useState("Tutte");
  const [toast, setToast] = useState<string | null>(null);
  const [dragging, setDragging] = useState<Cleaning | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Mobile bottom sheet
  const [sheetCleaningId, setSheetCleaningId] = useState<string | null>(null);

  // Modals
  const [showTimePickerFor, setShowTimePickerFor] = useState<string | null>(null);

  // ── Mount & Resize ──
  useEffect(() => {
    setMounted(true);
    setIsMobile(window.innerWidth < 1024);
    const h = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  // ── Firebase: Cleanings ──
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
      const data = snap.docs.map((docSnap) => {
        const d = docSnap.data() as Record<string, any>;
        const c: Cleaning = {
          id: docSnap.id, propertyId: d.propertyId,
          propertyName: d.propertyName || "Proprietà",
          propertyAddress: d.propertyAddress || "",
          propertyZona: d.propertyZona || getZoneFromCAP(d.propertyCAP),
          propertyType: d.propertyType, propertySize: d.propertySize,
          scheduledDate: d.scheduledDate?.toDate() || new Date(),
          scheduledTime: d.scheduledTime || "10:00",
          checkoutTime: d.checkoutTime,
          checkinTime: d.checkInTime || d.checkinTime,
          status: d.status || "SCHEDULED",
          operatorId: d.operatorId, operatorName: d.operatorName,
          operators: d.operators, guestsCount: d.guestsCount,
          estimatedDuration: d.estimatedDuration || 2,
          type: d.type, notes: d.notes, urgent: false,
        };
        c.urgent = isUrgent(c);
        return c;
      });
      data.sort((a, b) => {
        if (a.urgent && !b.urgent) return -1;
        if (!a.urgent && b.urgent) return 1;
        return a.scheduledTime.localeCompare(b.scheduledTime);
      });
      setCleanings(data);
      setLoading(false);
    });
    return () => unsub();
  }, [selectedDate]);

  // ── Firebase: Operators ──
  useEffect(() => {
    const q = query(collection(db, "users"), where("role", "==", "OPERATORE_PULIZIE"));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((docSnap, index) => {
        const d = docSnap.data() as Record<string, any>;
        return {
          id: docSnap.id, name: d.name || "Operatore", email: d.email || "",
          phone: d.phone, status: d.status || "ACTIVE",
          rating: d.rating || 4.0,
          preferredZone: d.preferredZone || ["Centro Storico", "Trastevere", "Vaticano/Prati", "Termini", "EUR"][index % 5],
          speciality: d.speciality || "",
          speed: d.speed || ["Veloce", "Medio"][index % 2],
          todayCleanings: [] as Cleaning[],
          colorIndex: index,
        };
      });
      setOperators(data);
    });
    return () => unsub();
  }, []);

  // ── Sync todayCleanings ──
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

  // ── Derived data ──
  const unassigned = useMemo(() =>
    cleanings.filter((c) => !c.operatorId && c.status !== "COMPLETED" && c.status !== "CANCELLED"),
    [cleanings]
  );
  const assigned = useMemo(() =>
    cleanings.filter((c) => c.operatorId && c.status !== "COMPLETED" && c.status !== "CANCELLED"),
    [cleanings]
  );
  const zones = useMemo(() => {
    const s = new Set<string>();
    cleanings.forEach((c) => s.add(c.propertyZona || "Altro"));
    return Array.from(s);
  }, [cleanings]);
  const filtered = useMemo(() => {
    if (filterZone === "Tutte") return unassigned;
    return unassigned.filter((c) => c.propertyZona === filterZone);
  }, [unassigned, filterZone]);
  const activeOps = useMemo(() => operators.filter((op) => op.status === "ACTIVE"), [operators]);
  const progress = cleanings.length > 0 ? Math.round((assigned.length / cleanings.length) * 100) : 0;

  const getRankings = (cleaning: Cleaning) =>
    activeOps.map((op) => ({ operator: op, score: calculateScore(cleaning, op) }))
      .sort((a, b) => b.score.total - a.score.total);

  // ── Actions ──
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const handleAssign = async (cleaningId: string, operatorId: string, operatorName: string) => {
    try {
      const res = await fetch(`/api/cleanings/${cleaningId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorId }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Errore"); }
      showToast(`✓ Assegnata a ${operatorName}`);
      setSheetCleaningId(null);
    } catch (e) {
      showToast(`Errore: ${e instanceof Error ? e.message : "Errore"}`);
    }
  };

  const handleUnassign = async (cleaningId: string, operatorId?: string) => {
    const opId = operatorId || cleanings.find((c) => c.id === cleaningId)?.operatorId;
    if (!opId) { showToast("Errore: operatore non trovato"); return; }
    try {
      const res = await fetch(`/api/cleanings/${cleaningId}/assign`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorId: opId }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Errore"); }
      showToast("Pulizia rimossa");
    } catch (e) {
      showToast(`Errore: ${e instanceof Error ? e.message : "Errore"}`);
    }
  };

  const handleChangeTime = async (cleaningId: string, newTime: string) => {
    try {
      await updateDoc(doc(db, "cleanings", cleaningId), { scheduledTime: newTime });
      showToast(`Orario: ${newTime}`);
      setShowTimePickerFor(null);
    } catch { showToast("Errore cambio orario"); }
  };

  const handleAutoAssignAll = async () => {
    if (filtered.length === 0) { showToast("Nessuna pulizia da assegnare"); return; }
    if (!window.confirm(`Assegnare automaticamente ${filtered.length} pulizie?`)) return;
    let n = 0;
    for (const c of filtered) {
      const ranked = getRankings(c);
      if (ranked.length > 0) { await handleAssign(c.id, ranked[0].operator.id, ranked[0].operator.name); n++; }
    }
    showToast(`${n} pulizie assegnate!`);
  };

  // ── Drag (desktop only) ──
  const handleDragStart = (c: Cleaning) => setDragging(c);
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = async (e: React.DragEvent, opId: string, opName: string) => {
    e.preventDefault();
    if (dragging) { await handleAssign(dragging.id, opId, opName); setDragging(null); setDropTarget(null); }
  };

  if (!mounted) return <div className="flex items-center justify-center h-96"><div className="animate-spin w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full" /></div>;

  // ═══════════════════════════════════════════════════════════════
  // SHARED SUBCOMPONENTS
  // ═══════════════════════════════════════════════════════════════

  const CleaningCard = ({ c, mode }: { c: Cleaning; mode: "drag" | "tap" }) => (
    <div
      draggable={mode === "drag"}
      onDragStart={mode === "drag" ? () => handleDragStart(c) : undefined}
      onDragEnd={mode === "drag" ? () => { setDragging(null); setDropTarget(null); } : undefined}
      onClick={mode === "tap" ? () => setSheetCleaningId(c.id) : undefined}
      className={`bg-white border rounded-xl p-3 mb-2 border-l-4 transition-all select-none ${
        c.urgent ? "border-l-red-500" : "border-l-emerald-500"
      } ${mode === "drag" ? "cursor-grab active:cursor-grabbing" : "cursor-pointer active:scale-[0.98]"} ${
        dragging?.id === c.id ? "opacity-40 scale-95" : ""
      } ${mode === "tap" && sheetCleaningId === c.id ? "ring-2 ring-violet-400 bg-violet-50" : "border-slate-200"}`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          {c.urgent && <span className="bg-red-100 text-red-600 text-[10px] font-bold px-1.5 py-0.5 rounded">URGENTE</span>}
          {mode === "tap" ? (
            <button
              onClick={(e) => { e.stopPropagation(); setShowTimePickerFor(c.id); }}
              className="text-lg font-bold text-amber-600 hover:text-amber-700"
            >{c.scheduledTime}</button>
          ) : (
            <span className="text-lg font-bold text-amber-600">{c.scheduledTime}</span>
          )}
        </div>
        <span className="text-xs text-slate-400">{c.estimatedDuration}h</span>
      </div>
      <div className="font-semibold text-sm text-slate-800 truncate">{c.propertyName}</div>
      <div className="text-xs text-slate-400 truncate">{c.propertyAddress}</div>
      <div className="flex items-center gap-2 mt-1.5">
        <span className="bg-violet-100 text-violet-600 text-[11px] font-semibold px-2 py-0.5 rounded-full">{c.propertyZona || "—"}</span>
        {c.guestsCount && <span className="text-[11px] text-slate-400">{c.guestsCount} ospiti</span>}
      </div>
      {mode === "tap" && <div className="text-[10px] text-violet-500 font-medium mt-1.5">Tap per assegnare ›</div>}
      {mode === "drag" && <div className="text-[10px] text-slate-300 mt-1.5">⠿ Trascina su un operatore</div>}
    </div>
  );

  const AssignedItem = ({ c, opId, color }: { c: Cleaning; opId: string; color: typeof OP_COLORS[0] }) => (
    <div className={`flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg mb-1.5 border-l-4 ${color.border}`}>
      <button onClick={() => setShowTimePickerFor(c.id)} className="font-bold text-sm text-emerald-600 hover:text-emerald-700 min-w-[42px]">
        {c.scheduledTime}
      </button>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-xs text-slate-700 truncate">{c.propertyName}</div>
        <div className="text-[10px] text-slate-400">{c.propertyZona} · {c.estimatedDuration}h</div>
      </div>
      <button onClick={() => handleUnassign(c.id, opId)} className="w-6 h-6 rounded-md bg-red-50 text-red-400 hover:bg-red-100 flex items-center justify-center text-xs flex-shrink-0">✕</button>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════
  // HEADER (shared)
  // ═══════════════════════════════════════════════════════════════
  const Header = () => (
    <div className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-40">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-medium" />
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            {(["kanban", "timeline"] as const).map((v) => (
              <button key={v} onClick={() => setViewMode(v)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  viewMode === v ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >{v === "kanban" ? "Kanban" : "Timeline"}</button>
            ))}
          </div>
          {!isMobile && (
            <select value={filterZone} onChange={(e) => setFilterZone(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm">
              <option value="Tutte">Tutte le zone</option>
              {zones.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-4 text-sm">
            <div className="text-center"><div className="text-lg font-bold text-red-500">{unassigned.length}</div><div className="text-[10px] text-slate-400">DA FARE</div></div>
            <div className="text-center"><div className="text-lg font-bold text-emerald-500">{assigned.length}</div><div className="text-[10px] text-slate-400">FATTE</div></div>
            <div className="text-center"><div className="text-lg font-bold text-violet-500">{progress}%</div><div className="text-[10px] text-slate-400">PROGRESSO</div></div>
          </div>
          <button onClick={handleAutoAssignAll} disabled={filtered.length === 0}
            className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-40 shadow-sm">
            Auto ({filtered.length})
          </button>
        </div>
      </div>
      {/* Mobile stats + zone filter */}
      {isMobile && (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-red-50 rounded-lg px-2 py-1.5 text-center"><div className="text-base font-bold text-red-500">{unassigned.length}</div><div className="text-[9px] text-red-400">DA FARE</div></div>
            <div className="bg-orange-50 rounded-lg px-2 py-1.5 text-center"><div className="text-base font-bold text-orange-500">{filtered.filter(c=>c.urgent).length}</div><div className="text-[9px] text-orange-400">URGENTI</div></div>
            <div className="bg-emerald-50 rounded-lg px-2 py-1.5 text-center"><div className="text-base font-bold text-emerald-500">{assigned.length}</div><div className="text-[9px] text-emerald-400">ASSEGNATE</div></div>
            <div className="bg-violet-50 rounded-lg px-2 py-1.5 text-center"><div className="text-base font-bold text-violet-500">{progress}%</div><div className="text-[9px] text-violet-400">PROGRESSO</div></div>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            <button onClick={() => setFilterZone("Tutte")}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium ${filterZone === "Tutte" ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600"}`}>
              Tutte ({unassigned.length})
            </button>
            {zones.map((z) => (
              <button key={z} onClick={() => setFilterZone(z)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium ${filterZone === z ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                {z}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // ═══════════════════════════════════════════════════════════════
  // SIDEBAR (desktop - shared between kanban and timeline)
  // ═══════════════════════════════════════════════════════════════
  const Sidebar = ({ mode }: { mode: "drag" | "tap" }) => (
    <div className="w-80 min-w-[320px] flex-shrink-0 border-r border-slate-200 bg-white flex flex-col">
      <div className="p-3 border-b border-slate-200 bg-red-50/50 flex items-center gap-2">
        <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
        <span className="font-bold text-sm text-slate-700">Da Assegnare</span>
        <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">{filtered.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {filtered.length === 0 ? (
          <div className="text-center py-12"><div className="text-4xl mb-2">🎉</div><p className="text-sm text-slate-400">Tutto assegnato!</p></div>
        ) : filtered.map((c) => <CleaningCard key={c.id} c={c} mode={mode} />)}
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════
  // KANBAN VIEW
  // ═══════════════════════════════════════════════════════════════
  const KanbanDesktop = () => (
    <div className="flex" style={{ height: "calc(100vh - 120px)" }}>
      <Sidebar mode="drag" />
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(240px, 1fr))` }}>
          {activeOps.map((op) => {
            const color = getColor(op.colorIndex || 0);
            const opCl = op.todayCleanings.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
            const hours = opCl.reduce((s, c) => s + (c.estimatedDuration || 2), 0);
            return (
              <div key={op.id}
                onDragOver={handleDragOver}
                onDragEnter={() => setDropTarget(op.id)}
                onDragLeave={() => setDropTarget(null)}
                onDrop={(e) => handleDrop(e, op.id, op.name)}
                className={`bg-white border-2 rounded-xl overflow-hidden flex flex-col transition-all ${
                  dropTarget === op.id ? `${color.border} ${color.ring} ring-2` : "border-slate-200"
                }`}
              >
                <div className={`${color.bg} p-3 text-white`}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full bg-white/25 flex items-center justify-center font-bold text-sm">{op.name.charAt(0)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">{op.name}</div>
                      <div className="text-[11px] opacity-85">⭐ {op.rating?.toFixed(1)} · {op.preferredZone}</div>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <div className="flex-1 bg-white/15 rounded-lg py-1 text-center"><div className="font-bold text-sm">{opCl.length}</div><div className="text-[9px] opacity-70">pulizie</div></div>
                    <div className="flex-1 bg-white/15 rounded-lg py-1 text-center"><div className="font-bold text-sm">{hours}h</div><div className="text-[9px] opacity-70">lavoro</div></div>
                  </div>
                </div>
                <div className="flex-1 p-2 min-h-[60px]">
                  {opCl.map((c) => <AssignedItem key={c.id} c={c} opId={op.id} color={color} />)}
                  {opCl.length === 0 && (
                    <div className={`border-2 border-dashed rounded-lg p-4 text-center text-xs transition-all ${
                      dropTarget === op.id ? `${color.border} ${color.light} ${color.text}` : "border-slate-200 text-slate-300"
                    }`}>Trascina qui<br /><span className="text-[10px]">Zona: {op.preferredZone}</span></div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const KanbanMobile = () => (
    <div className="pb-4">
      {/* Unassigned section */}
      <div className="px-3 pt-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <span className="font-bold text-xs text-slate-500 uppercase">Da Assegnare ({filtered.length})</span>
        </div>
        {filtered.length === 0 ? (
          <div className="text-center py-8"><div className="text-3xl mb-1">🎉</div><p className="text-sm text-slate-400">Tutto assegnato!</p></div>
        ) : filtered.map((c) => <CleaningCard key={c.id} c={c} mode="tap" />)}
      </div>
      {/* Operators grid */}
      <div className="px-3 mt-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 bg-emerald-500 rounded-full" />
          <span className="font-bold text-xs text-slate-500 uppercase">Team ({activeOps.length})</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {activeOps.map((op) => {
            const color = getColor(op.colorIndex || 0);
            const opCl = op.todayCleanings.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
            return (
              <div key={op.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className={`${color.bg} p-2.5 text-white flex items-center gap-2`}>
                  <div className="w-7 h-7 rounded-full bg-white/25 flex items-center justify-center font-bold text-xs">{op.name.charAt(0)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-xs truncate">{op.name}</div>
                    <div className="text-[10px] opacity-80">{op.preferredZone}</div>
                  </div>
                  <div className="text-lg font-bold">{opCl.length}</div>
                </div>
                <div className="p-1.5">
                  {opCl.map((c) => (
                    <div key={c.id} className="flex items-center gap-1.5 py-1 px-1.5 text-[11px] bg-slate-50 rounded mb-1">
                      <span className="font-bold text-emerald-600">{c.scheduledTime}</span>
                      <span className="flex-1 truncate text-slate-600">{c.propertyName}</span>
                      <button onClick={() => handleUnassign(c.id, op.id)} className="text-red-400 text-[10px]">✕</button>
                    </div>
                  ))}
                  {opCl.length === 0 && <div className="text-center py-2 text-[10px] text-slate-300">Nessuna pulizia</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════
  // TIMELINE VIEW
  // ═══════════════════════════════════════════════════════════════
  const TimelineDesktop = () => (
    <div className="flex" style={{ height: "calc(100vh - 120px)" }}>
      <Sidebar mode="drag" />
      <div className="flex-1 overflow-x-auto overflow-y-auto p-4" style={{ minWidth: 0 }}>
        <div style={{ minWidth: `${176 + HOURS.length * 96 + 32}px` }}>
          {/* Hours header */}
          <div className="flex mb-1 ml-44">
            {HOURS.map((h) => (
              <div key={h} className="w-24 text-center text-xs font-medium text-slate-400">{h}:00</div>
            ))}
          </div>
          {/* Rows */}
          <div className="space-y-1.5">
            {activeOps.map((op) => {
              const color = getColor(op.colorIndex || 0);
              const opCl = op.todayCleanings;
              return (
                <div key={op.id} className="flex items-center"
                  onDragOver={handleDragOver}
                  onDragEnter={() => setDropTarget(op.id)}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={(e) => handleDrop(e, op.id, op.name)}
                >
                  <div className="w-44 flex-shrink-0 pr-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-9 h-9 ${color.bg} rounded-full flex items-center justify-center font-bold text-sm text-white shadow`}>{op.name.charAt(0)}</div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-slate-700 truncate">{op.name}</div>
                        <div className="text-[11px] text-slate-400">{opCl.length} pul · {op.rating?.toFixed(1)}</div>
                      </div>
                    </div>
                  </div>
                  <div className={`relative h-14 bg-slate-50 rounded-lg border transition-all ${
                    dropTarget === op.id ? `${color.border} ring-2 ${color.ring}` : "border-slate-200"
                  }`} style={{ width: `${HOURS.length * 96}px`, minWidth: `${HOURS.length * 96}px` }}>
                    {/* Grid lines */}
                    <div className="absolute inset-0 flex">
                      {HOURS.map((_, i) => <div key={i} className="w-24 border-l border-slate-200/60" />)}
                    </div>
                    {/* Blocks */}
                    {opCl.map((c) => {
                      const startH = parseInt(c.scheduledTime.split(":")[0]);
                      const startM = parseInt(c.scheduledTime.split(":")[1]);
                      const left = (startH - 8) * 96 + (startM / 60) * 96;
                      const width = (c.estimatedDuration || 2) * 96;
                      return (
                        <div key={c.id}
                          className={`absolute top-1 bottom-1 ${color.bg} rounded-lg shadow flex items-center px-2 text-white text-xs font-medium cursor-pointer hover:brightness-110 transition-all ${c.urgent ? "ring-2 ring-red-500" : ""}`}
                          style={{ left: `${left}px`, width: `${width}px` }}
                          onClick={() => setShowTimePickerFor(c.id)}
                          title={`${c.propertyName} - ${c.scheduledTime} (${c.estimatedDuration}h)`}
                        >
                          <span className="truncate">{c.scheduledTime} {c.propertyName}</span>
                        </div>
                      );
                    })}
                    {opCl.length === 0 && (
                      <div className={`absolute inset-1 border-2 border-dashed rounded-lg flex items-center justify-center text-xs transition-all ${
                        dropTarget === op.id ? `${color.border} ${color.text}` : "border-slate-200 text-slate-300"
                      }`}>Trascina qui</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Legend */}
          <div className="mt-4 flex items-center justify-center gap-6 text-xs text-slate-400">
            <div className="flex items-center gap-1.5"><div className="w-4 h-3 bg-gradient-to-r from-pink-500 to-blue-500 rounded" /><span>Pulizia (click per orario)</span></div>
            <div className="flex items-center gap-1.5"><div className="w-4 h-3 border-2 border-dashed border-slate-300 rounded" /><span>Slot libero (trascina)</span></div>
          </div>
        </div>
      </div>
    </div>
  );

  const TimelineMobile = () => (
    <div className="pb-4">
      {/* Unassigned */}
      <div className="px-3 pt-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <span className="font-bold text-xs text-slate-500 uppercase">Da Assegnare ({filtered.length})</span>
        </div>
        {filtered.length === 0 ? (
          <div className="text-center py-6"><div className="text-3xl mb-1">🎉</div><p className="text-sm text-slate-400">Tutto assegnato!</p></div>
        ) : filtered.map((c) => <CleaningCard key={c.id} c={c} mode="tap" />)}
      </div>
      {/* Timeline per operatore */}
      <div className="px-3 mt-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 bg-emerald-500 rounded-full" />
          <span className="font-bold text-xs text-slate-500 uppercase">Timeline Team</span>
        </div>
        <div className="space-y-2">
          {activeOps.map((op) => {
            const color = getColor(op.colorIndex || 0);
            const opCl = op.todayCleanings.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
            const hours = opCl.reduce((s, c) => s + (c.estimatedDuration || 2), 0);
            return (
              <div key={op.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className={`${color.bg} px-3 py-2 text-white flex items-center gap-2`}>
                  <div className="w-7 h-7 rounded-full bg-white/25 flex items-center justify-center font-bold text-xs">{op.name.charAt(0)}</div>
                  <div className="flex-1 min-w-0"><div className="font-bold text-xs truncate">{op.name}</div><div className="text-[10px] opacity-80">{op.preferredZone}</div></div>
                  <div className="text-xs font-bold bg-white/20 px-2 py-0.5 rounded">{opCl.length} pul · {hours}h</div>
                </div>
                {/* Mini timeline bar */}
                <div className="px-2 py-2">
                  <div className="relative h-8 bg-slate-50 rounded border border-slate-200">
                    {/* Hour markers */}
                    <div className="absolute inset-0 flex">
                      {[8,10,12,14,16,18].map((h) => (
                        <div key={h} className="flex-1 border-r border-slate-100 relative">
                          <span className="absolute -top-3.5 left-0 text-[8px] text-slate-300">{h}</span>
                        </div>
                      ))}
                    </div>
                    {/* Blocks */}
                    {opCl.map((c) => {
                      const startH = parseInt(c.scheduledTime.split(":")[0]);
                      const startM = parseInt(c.scheduledTime.split(":")[1]);
                      const leftPct = ((startH - 8 + startM / 60) / 10) * 100;
                      const widthPct = ((c.estimatedDuration || 2) / 10) * 100;
                      return (
                        <div key={c.id}
                          className={`absolute top-0.5 bottom-0.5 ${color.bg} rounded text-white text-[9px] font-medium flex items-center px-1 overflow-hidden`}
                          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                          onClick={() => setShowTimePickerFor(c.id)}
                        >
                          <span className="truncate">{c.scheduledTime}</span>
                        </div>
                      );
                    })}
                  </div>
                  {/* List below */}
                  {opCl.length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {opCl.map((c) => (
                        <div key={c.id} className="flex items-center gap-1.5 text-[11px]">
                          <span className="font-bold text-emerald-600 min-w-[36px]">{c.scheduledTime}</span>
                          <span className="flex-1 truncate text-slate-600">{c.propertyName}</span>
                          <span className="text-slate-300">{c.estimatedDuration}h</span>
                          <button onClick={() => handleUnassign(c.id, op.id)} className="text-red-400">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {opCl.length === 0 && <div className="text-center py-1 text-[10px] text-slate-300">Nessuna pulizia assegnata</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════
  // MOBILE BOTTOM SHEET (assign operator)
  // ═══════════════════════════════════════════════════════════════
  const BottomSheet = () => {
    if (!sheetCleaningId) return null;
    const cleaning = cleanings.find((c) => c.id === sheetCleaningId);
    if (!cleaning) return null;
    return (
      <Portal>
        {/* Overlay */}
        <div className="fixed inset-0 bg-black/40 z-[9998]" onClick={() => setSheetCleaningId(null)} />
        {/* Sheet */}
        <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-[9999] max-h-[80vh] flex flex-col shadow-2xl" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mt-2.5 mb-1 flex-shrink-0" />
          <div className="px-4 pb-2 pt-1 border-b border-slate-100 flex-shrink-0">
            <div className="text-center">
              <div className="font-bold text-base text-slate-800">
                <span className="text-amber-600">{cleaning.scheduledTime}</span> {cleaning.propertyName}
              </div>
              <div className="text-xs text-slate-400">{cleaning.propertyZona} · {cleaning.estimatedDuration}h</div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2" style={{ WebkitOverflowScrolling: "touch" }}>
            {activeOps.map((op) => {
              const color = getColor(op.colorIndex || 0);
              const sameZone = op.preferredZone === cleaning.propertyZona;
              const h = op.todayCleanings.reduce((s, c) => s + (c.estimatedDuration || 2), 0);
              return (
                <button key={op.id} onClick={() => handleAssign(cleaning.id, op.id, op.name)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 mb-2 text-left active:scale-[0.98] active:bg-slate-50 transition-all">
                  <div className={`w-10 h-10 ${color.bg} rounded-full flex items-center justify-center text-white font-bold text-sm`}>{op.name.charAt(0)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-slate-800">{op.name}</div>
                    <div className="text-xs text-slate-400">
                      ⭐ {op.rating?.toFixed(1)} · {op.preferredZone}
                      {sameZone && <span className="text-emerald-600 font-semibold ml-1">✓ Stessa zona</span>}
                    </div>
                    <div className="text-[11px] text-slate-300">{op.todayCleanings.length} pulizie · {h}h lavoro</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold" style={{ color: color.hex }}>{op.todayCleanings.length}</div>
                    <div className="text-[10px] text-slate-400">oggi</div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="px-3 pb-3 flex-shrink-0">
            <button onClick={() => setSheetCleaningId(null)} className="w-full py-3 rounded-xl bg-slate-100 text-slate-600 font-semibold text-sm">Annulla</button>
          </div>
        </div>
      </Portal>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // TIME PICKER MODAL
  // ═══════════════════════════════════════════════════════════════
  const TimePicker = () => {
    if (!showTimePickerFor) return null;
    const current = cleanings.find((c) => c.id === showTimePickerFor)?.scheduledTime;
    return (
      <Portal>
        <div className="fixed inset-0 bg-black/40 z-[9998] flex items-end sm:items-center justify-center" onClick={() => setShowTimePickerFor(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: isMobile ? "calc(16px + env(safe-area-inset-bottom, 0px))" : "20px" }}>
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden" />
            <h3 className="text-lg font-bold text-slate-800 text-center mb-3">Seleziona Orario</h3>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {TIME_OPTIONS.map((time) => (
                <button key={time} onClick={() => handleChangeTime(showTimePickerFor, time)}
                  className={`py-2.5 rounded-xl text-sm font-bold transition-all ${
                    current === time ? "bg-violet-600 text-white shadow-lg shadow-violet-500/30" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >{time}</button>
              ))}
            </div>
            <button onClick={() => setShowTimePickerFor(null)} className="w-full py-3 rounded-xl bg-slate-100 text-slate-600 font-semibold text-sm">Chiudi</button>
          </div>
        </div>
      </Portal>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          {isMobile ? (
            viewMode === "kanban" ? <KanbanMobile /> : <TimelineMobile />
          ) : (
            viewMode === "kanban" ? <KanbanDesktop /> : <TimelineDesktop />
          )}
        </>
      )}
      <BottomSheet />
      <TimePicker />
      {toast && (
        <Portal>
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-2xl z-[9999]">{toast}</div>
        </Portal>
      )}
    </div>
  );
}
