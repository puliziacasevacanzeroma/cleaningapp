"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface Cleaning {
  id: string;
  scheduledDate: string;
  scheduledTime: string | null;
  status: string;
  type: string;
  price: number;
  property: {
    id: string;
    name: string;
    address: string;
    maxGuests: number;
    imageUrl?: string;
  };
  operator: {
    id: string;
    name: string;
  } | null;
  booking: {
    guestName: string | null;
    guestsCount: number;
  } | null;
}

interface Operator {
  id: string;
  name: string;
  email: string;
}

interface DashboardMobileClientProps {
  userName: string;
  userEmail: string;
}

const propertyImages = [
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=200&h=200&fit=crop",
  "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=200&h=200&fit=crop",
  "https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?w=200&h=200&fit=crop",
  "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=200&h=200&fit=crop",
  "https://images.unsplash.com/photo-1560185893-a55cbc8c57e8?w=200&h=200&fit=crop",
  "https://images.unsplash.com/photo-1536376072261-38c75010e6c9?w=200&h=200&fit=crop",
  "https://images.unsplash.com/photo-1554995207-c18c203602cb?w=200&h=200&fit=crop",
];

export function DashboardMobileClient({ userName }: DashboardMobileClientProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [cleanings, setCleanings] = useState<Cleaning[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [dateAnimation, setDateAnimation] = useState<string>("");
  
  const [showOverlay, setShowOverlay] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showOperatorPicker, setShowOperatorPicker] = useState(false);
  const [showGuestsPicker, setShowGuestsPicker] = useState(false);
  const [currentCardId, setCurrentCardId] = useState<string | null>(null);
  
  const [selectedHour, setSelectedHour] = useState(10);
  const [selectedMin, setSelectedMin] = useState(0);
  
  const [adultsCount, setAdultsCount] = useState(2);
  const [infantsCount, setInfantsCount] = useState(0);
  
  const [operatorSearch, setOperatorSearch] = useState("");
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  
  const [flashCardId, setFlashCardId] = useState<string | null>(null);
  
  const cardsContainerRef = useRef<HTMLDivElement>(null);

  const fetchCleanings = useCallback(async () => {
    setLoading(true);
    try {
      const dateStr = currentDate.toISOString().split("T")[0];
      const res = await fetch(`/api/dashboard/cleanings?date=${dateStr}`);
      const data = await res.json();
      const sortedCleanings = sortCleanings(data.cleanings || []);
      setCleanings(sortedCleanings);
    } catch (error) {
      console.error("Error fetching cleanings:", error);
    } finally {
      setLoading(false);
    }
  }, [currentDate]);

  const fetchOperators = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/utenti?role=operatore");
      const data = await res.json();
      if (Array.isArray(data)) setOperators(data);
    } catch (error) {
      console.error("Error fetching operators:", error);
    }
  }, []);

  useEffect(() => {
    fetchCleanings();
    fetchOperators();
  }, [fetchCleanings, fetchOperators]);

  // Sort cleanings by status and time
  const sortCleanings = (items: Cleaning[]) => {
    const statusOrder: Record<string, number> = { todo: 0, pending: 0, assigned: 0, in_progress: 1, completed: 2 };
    return [...items].sort((a, b) => {
      const statusA = statusOrder[a.status] ?? 0;
      const statusB = statusOrder[b.status] ?? 0;
      if (statusA !== statusB) return statusA - statusB;
      const timeA = a.scheduledTime || "00:00";
      const timeB = b.scheduledTime || "00:00";
      return timeA.localeCompare(timeB);
    });
  };

  const changeDate = (days: number) => {
    setDateAnimation(days > 0 ? "slide-left" : "slide-right");
    setTimeout(() => setDateAnimation(""), 300);
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + days);
    setCurrentDate(newDate);
  };

  const displaySuccess = (message: string) => {
    setSuccessMessage(message);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 1100);
  };

  const closeAll = () => {
    setShowOverlay(false);
    setShowTimePicker(false);
    setShowOperatorPicker(false);
    setShowGuestsPicker(false);
    setCurrentCardId(null);
    setOperatorSearch("");
    setKeyboardOpen(false);
  };

  const openTimePicker = (cleaning: Cleaning) => {
    setCurrentCardId(cleaning.id);
    const time = cleaning.scheduledTime || "10:00";
    const [h, m] = time.split(":");
    setSelectedHour(parseInt(h || "10"));
    setSelectedMin(parseInt(m || "0"));
    setShowOverlay(true);
    setShowTimePicker(true);
  };

  const confirmTime = async () => {
    if (!currentCardId) return;
    const timeStr = `${selectedHour.toString().padStart(2, "0")}:${selectedMin.toString().padStart(2, "0")}`;
    
    try {
      await fetch(`/api/dashboard/cleanings/${currentCardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledTime: timeStr }),
      });
      
      // Update and reorder with animation
      setCleanings(prev => {
        const updated = prev.map(c => c.id === currentCardId ? { ...c, scheduledTime: timeStr } : c);
        return sortCleanings(updated);
      });
      
      // Flash effect on the changed card
      setFlashCardId(currentCardId);
      setTimeout(() => setFlashCardId(null), 600);
      
      displaySuccess(`Orario: ${timeStr}`);
    } catch (error) {
      console.error("Error:", error);
    }
    closeAll();
  };

  const openOperatorPicker = (cleaning: Cleaning) => {
    setCurrentCardId(cleaning.id);
    setOperatorSearch("");
    setShowOverlay(true);
    setShowOperatorPicker(true);
  };

  const selectOperator = async (operator: Operator) => {
    if (!currentCardId) return;
    try {
      await fetch(`/api/dashboard/cleanings/${currentCardId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorId: operator.id }),
      });
      setCleanings(prev => {
        const updated = prev.map(c => c.id === currentCardId ? { ...c, operator: { id: operator.id, name: operator.name || "" }, status: "assigned" } : c);
        return sortCleanings(updated);
      });
      displaySuccess(`${operator.name} assegnato`);
    } catch (error) {
      console.error("Error:", error);
    }
    closeAll();
  };

  const openGuestsPicker = (cleaning: Cleaning) => {
    setCurrentCardId(cleaning.id);
    setAdultsCount(cleaning.booking?.guestsCount || 2);
    setInfantsCount(0);
    setShowOverlay(true);
    setShowGuestsPicker(true);
  };

  const confirmGuests = async () => {
    if (!currentCardId) return;
    const total = adultsCount + infantsCount;
    try {
      await fetch(`/api/dashboard/cleanings/${currentCardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestsCount: total }),
      });
      setCleanings(prev => prev.map(c => c.id === currentCardId && c.booking ? { ...c, booking: { ...c.booking, guestsCount: total } } : c));
      let msg = `${total} ospiti`;
      if (infantsCount > 0) msg += ` (+${infantsCount} neonati)`;
      displaySuccess(msg);
    } catch (error) {
      console.error("Error:", error);
    }
    closeAll();
  };

  const getStatus = (c: Cleaning) => {
    if (c.status === "completed") return "done";
    if (c.status === "in_progress") return "inprogress";
    return "todo";
  };

  const filteredCleanings = cleanings.filter(c => !activeFilter || getStatus(c) === activeFilter);
  const filteredOperators = operators.filter(op => op.name?.toLowerCase().includes(operatorSearch.toLowerCase()));
  
  const stats = {
    todo: cleanings.filter(c => getStatus(c) === "todo").length,
    inprogress: cleanings.filter(c => getStatus(c) === "inprogress").length,
    done: cleanings.filter(c => getStatus(c) === "done").length,
  };

  const totalEarnings = cleanings.reduce((sum, c) => sum + (c.price || 60), 0);
  
  const getInitials = (name: string | null) => name ? name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "?";
  const getShortName = (name: string | null) => {
    if (!name) return "";
    const p = name.split(" ");
    return p.length >= 2 ? `${p[0]} ${p[1]?.charAt(0)}.` : p[0] || "";
  };
  const getPropertyImage = (i: number) => propertyImages[i % propertyImages.length];
  
  const setFilter = (f: string) => setActiveFilter(activeFilter === f ? null : f);
  
  const getFilterTitle = () => {
    if (activeFilter === "todo") return "Da fare";
    if (activeFilter === "inprogress") return "In corso";
    if (activeFilter === "done") return "Completate";
    return "Tutte le pulizie";
  };

  return (
    <div className="min-h-screen bg-slate-100 pb-24">
      <style jsx global>{`
        * { font-family: 'Inter', -apple-system, sans-serif; -webkit-tap-highlight-color: transparent; }
        body { background: #f1f5f9; }
        
        .hero-gradient { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%); }
        
        .picker-modal {
          position: fixed; bottom: 0; left: 0; right: 0;
          background: white; border-radius: 24px 24px 0 0;
          transform: translateY(100%);
          transition: transform 0.3s ease;
          z-index: 60;
        }
        .picker-modal.active { transform: translateY(0); }
        
        .success-toast {
          position: fixed; top: 80px; left: 50%;
          transform: translateX(-50%) translateY(-20px) scale(0.9);
          opacity: 0; visibility: hidden;
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          z-index: 200; pointer-events: none;
        }
        .success-toast.active {
          transform: translateX(-50%) translateY(0) scale(1);
          opacity: 1; visibility: visible;
        }
        .success-toast.active .success-icon { animation: iconPop 0.5s ease forwards; }
        .success-toast.active .check-draw { animation: checkDraw 0.3s ease forwards 0.2s; }
        
        @keyframes iconPop { 0% { transform: scale(0) rotate(-180deg); } 100% { transform: scale(1) rotate(0deg); } }
        @keyframes checkDraw { 0% { stroke-dashoffset: 50; } 100% { stroke-dashoffset: 0; } }
        
        .check-draw { stroke-dasharray: 50; stroke-dashoffset: 50; }
        
        .date-navigator {
          background: linear-gradient(135deg, #fff 0%, #f8fafc 100%);
          box-shadow: 0 4px 20px rgba(0,0,0,0.08);
        }
        .date-btn {
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
          box-shadow: 0 2px 8px rgba(0,0,0,0.06);
          transition: all 0.2s ease;
        }
        .date-btn:active { transform: scale(0.92); }
        
        .date-display.slide-left { animation: slideLeft 0.3s ease; }
        .date-display.slide-right { animation: slideRight 0.3s ease; }
        @keyframes slideLeft { 0% { opacity: 0; transform: translateX(15px); } 100% { opacity: 1; transform: translateX(0); } }
        @keyframes slideRight { 0% { opacity: 0; transform: translateX(-15px); } 100% { opacity: 1; transform: translateX(0); } }
        
        .card-item { transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.3s ease; }
        .card-flash { animation: cardFlash 0.6s ease; }
        @keyframes cardFlash { 0%,100% { background: white; } 40% { background: #d1fae5; } }
        
        .filter-btn { transition: all 0.2s ease; }
        .filter-btn.active { background: rgba(255,255,255,0.35); transform: scale(1.02); box-shadow: 0 4px 15px rgba(0,0,0,0.15); }
        
        .card-alert { border-left: 4px solid #f59e0b; }
        .hidden-filter { display: none !important; }
        .bottom-nav { padding-bottom: max(12px, env(safe-area-inset-bottom)); }
        
        .operator-modal { max-height: 50vh; height: 50vh; }
        .operator-modal.keyboard-open { height: 380px; max-height: 380px; }
        
        .stepper-btn { transition: all 0.15s ease; }
        .stepper-btn:active { transform: scale(0.9); }
        .stepper-btn:disabled { opacity: 0.3; pointer-events: none; }
        
        .btn-plus-adults {
          background: linear-gradient(135deg, #a5b4fc 0%, #818cf8 100%);
          box-shadow: 0 4px 12px rgba(129, 140, 248, 0.3);
        }
        .btn-plus-infants {
          background: linear-gradient(135deg, #fda4af 0%, #fb7185 100%);
          box-shadow: 0 4px 12px rgba(251, 113, 133, 0.3);
        }
        
        .time-scroll {
          height: 180px;
          overflow-y: auto;
          scroll-snap-type: y mandatory;
          -webkit-overflow-scrolling: touch;
          mask-image: linear-gradient(to bottom, transparent, black 25%, black 75%, transparent);
          -webkit-mask-image: linear-gradient(to bottom, transparent, black 25%, black 75%, transparent);
        }
        .time-scroll::-webkit-scrollbar { display: none; }
        
        .time-item {
          height: 60px;
          scroll-snap-align: center;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
          font-weight: 500;
          color: #cbd5e1;
          transition: all 0.15s ease;
          cursor: pointer;
        }
        .time-item.active {
          font-size: 34px;
          font-weight: 700;
          color: #0f172a;
        }
        
        .time-display.bump { animation: bump 0.3s ease; }
        @keyframes bump { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        
        @keyframes scaleIn {
          0% { transform: scale(0.8); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .scale-in { animation: scaleIn 0.2s ease forwards; }
      `}</style>

      {/* Header */}
      <header className="bg-white/80 backdrop-blur-lg sticky top-0 z-50 border-b border-slate-200/50 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
              <span className="text-white text-lg">🏠</span>
            </div>
            <div>
              <h1 className="font-bold text-slate-800">CleanMaster</h1>
              <p className="text-[10px] text-slate-400">Gestione Pulizie</p>
            </div>
          </div>
          <button className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center relative">
            <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
            </svg>
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>
        </div>
      </header>

      <main className="px-4 py-4">
        {/* HERO */}
        <div className="hero-gradient rounded-3xl p-4 mb-4 shadow-xl shadow-indigo-500/20">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-white/70 text-xs font-medium mb-1">Guadagno di oggi</p>
              <p className="text-4xl font-black text-white">€ {totalEarnings}</p>
            </div>
            <div className="text-right">
              <div className="inline-flex items-center gap-1 bg-white/20 rounded-full px-2.5 py-1">
                <svg className="w-3.5 h-3.5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7-7v18"/>
                </svg>
                <span className="text-xs font-bold text-white">+15%</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4 mb-4 pb-4 border-b border-white/20">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan-300"></div>
              <span className="text-xs text-white/80">Pulizie: <span className="font-bold text-white">€{Math.round(totalEarnings * 0.7)}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-violet-300"></div>
              <span className="text-xs text-white/80">Biancheria: <span className="font-bold text-white">€{Math.round(totalEarnings * 0.3)}</span></span>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => setFilter("todo")} className={`filter-btn bg-white/20 rounded-2xl p-3 text-center ${activeFilter === "todo" ? "active" : ""}`}>
              <p className="text-2xl font-black text-white mb-0.5">{stats.todo}</p>
              <p className="text-[10px] font-medium text-white/80">Da fare</p>
            </button>
            <button onClick={() => setFilter("inprogress")} className={`filter-btn bg-white/20 rounded-2xl p-3 text-center ${activeFilter === "inprogress" ? "active" : ""}`}>
              <p className="text-2xl font-black text-white mb-0.5">{stats.inprogress}</p>
              <p className="text-[10px] font-medium text-white/80">In corso</p>
            </button>
            <button onClick={() => setFilter("done")} className={`filter-btn bg-white/20 rounded-2xl p-3 text-center ${activeFilter === "done" ? "active" : ""}`}>
              <p className="text-2xl font-black text-emerald-300 mb-0.5">{stats.done}</p>
              <p className="text-[10px] font-medium text-white/80">Completate</p>
            </button>
          </div>
        </div>

        {/* DATE NAVIGATOR */}
        <div className="date-navigator rounded-xl px-3 py-2 mb-3 flex items-center justify-between border border-slate-100">
          <button onClick={() => changeDate(-1)} className="date-btn w-9 h-9 rounded-lg flex items-center justify-center border border-slate-100">
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <div className={`date-display text-center flex items-center gap-2 ${dateAnimation}`}>
            <p className="text-base font-black text-slate-800">{currentDate.getDate()}</p>
            <p className="text-xs font-medium text-slate-400">{currentDate.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}</p>
          </div>
          <button onClick={() => changeDate(1)} className="date-btn w-9 h-9 rounded-lg flex items-center justify-center border border-slate-100">
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7"/>
            </svg>
          </button>
        </div>

        {/* Header lista */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-800">{getFilterTitle()}</h2>
          <span className="text-xs text-slate-400">{filteredCleanings.length} attività</span>
        </div>

        {/* Cards */}
        <div className="space-y-3" ref={cardsContainerRef}>
          {loading ? (
            [...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm animate-pulse">
                <div className="flex items-center">
                  <div className="w-28 h-32 bg-slate-200 flex-shrink-0"></div>
                  <div className="flex-1 p-3">
                    <div className="h-4 bg-slate-200 rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-slate-200 rounded w-1/2 mb-3"></div>
                    <div className="flex gap-2">
                      <div className="h-8 bg-slate-200 rounded-full w-20"></div>
                      <div className="h-8 bg-slate-200 rounded-full w-12"></div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : filteredCleanings.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-500">Nessuna pulizia per questa data</p>
            </div>
          ) : (
            filteredCleanings.map((cleaning, index) => {
              const status = getStatus(cleaning);
              const isDone = status === "done";
              const isInProgress = status === "inprogress";
              const isFlashing = flashCardId === cleaning.id;
              
              return (
                <div
                  key={cleaning.id}
                  data-id={cleaning.id}
                  data-status={status}
                  data-time={cleaning.scheduledTime || "10:00"}
                  className={`card-item bg-white rounded-2xl border overflow-hidden shadow-sm ${
                    isDone ? "border-emerald-200 opacity-70" :
                    isInProgress ? "border-2 border-sky-300" :
                    "border-slate-200"
                  } ${isFlashing ? "card-flash" : ""}`}
                >
                  <div className="flex items-center">
                    {/* Image - h-32 come nell'HTML originale */}
                    <div className="w-28 h-32 flex-shrink-0 relative">
                      <img
                        src={cleaning.property.imageUrl || getPropertyImage(index)}
                        className="w-full h-full object-cover"
                        alt={cleaning.property.name}
                      />
                      {isDone && <div className="absolute inset-0 bg-emerald-500/20"></div>}
                      <div className={`absolute top-2 left-2 px-2 py-1 text-white text-[10px] font-bold rounded-lg flex items-center gap-1 ${
                        isDone ? "bg-emerald-500" :
                        isInProgress ? "bg-sky-500" :
                        "bg-amber-500"
                      }`}>
                        {isInProgress && <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>}
                        {isDone ? "✓ FATTO" : isInProgress ? "IN CORSO" : "IN ATTESA"}
                      </div>
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 p-3">
                      <h3 className="font-bold text-slate-800 text-base mb-0.5">{cleaning.property.name}</h3>
                      <p className="text-xs text-slate-400 mb-3">{cleaning.property.address} • Max {cleaning.property.maxGuests || 4} ospiti</p>
                      
                      {/* Time & Guests buttons */}
                      <div className="flex items-center gap-2 mb-2">
                        {isDone ? (
                          <div className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full">
                            <span className="text-sm font-semibold card-time">{cleaning.scheduledTime || "10:00"}</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => openTimePicker(cleaning)}
                            className="flex items-center gap-1.5 text-sky-600 bg-sky-50 border border-sky-100 px-3 py-1.5 rounded-full"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                            </svg>
                            <span className="text-sm font-semibold card-time">{cleaning.scheduledTime || "10:00"}</span>
                          </button>
                        )}
                        
                        {isDone ? (
                          <div className="flex items-center gap-1.5 text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
                            <span className="text-sm font-semibold">{cleaning.booking?.guestsCount || 2}</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => openGuestsPicker(cleaning)}
                            className="flex items-center gap-1.5 text-violet-600 bg-violet-50 border border-violet-100 px-3 py-1.5 rounded-full"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                            </svg>
                            <span className="text-sm font-semibold">{cleaning.booking?.guestsCount || 2}</span>
                          </button>
                        )}
                      </div>
                      
                      {/* Operators */}
                      <div className="flex items-center gap-2">
                        {cleaning.operator ? (
                          <button
                            onClick={() => !isDone && openOperatorPicker(cleaning)}
                            className={`flex items-center gap-1 text-white pl-2 pr-1.5 py-1 rounded-full ${isDone ? "bg-slate-400" : "bg-emerald-500"}`}
                          >
                            <span className="text-xs font-bold">{getInitials(cleaning.operator.name)}</span>
                            <span className="text-xs font-semibold">{getShortName(cleaning.operator.name)}</span>
                            {!isDone && (
                              <svg className="w-4 h-4 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>
                              </svg>
                            )}
                          </button>
                        ) : null}
                        {!isDone && !isInProgress && (
                          <button
                            onClick={() => openOperatorPicker(cleaning)}
                            className="w-8 h-8 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                    
                    {/* Arrow */}
                    <div className="pr-3">
                      <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/>
                      </svg>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 bottom-nav z-50">
        <div className="flex items-center justify-around py-2">
          <button className="flex flex-col items-center gap-0.5 px-4 py-1 text-violet-600">
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 13h1v7c0 1.103.897 2 2 2h12c1.103 0 2-.897 2-2v-7h1a1 1 0 00.707-1.707l-9-9a.999.999 0 00-1.414 0l-9 9A1 1 0 003 13zm7 7v-5h4v5h-4zm2-15.586l6 6V20h-3v-5c0-1.103-.897-2-2-2h-4c-1.103 0-2 .897-2 2v5H6v-8.586l6-6z"/>
            </svg>
            <span className="text-[10px] font-semibold">Home</span>
          </button>
          <button className="flex flex-col items-center gap-0.5 px-4 py-1 text-slate-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
            <span className="text-[10px] font-medium">Calendario</span>
          </button>
          <button className="flex flex-col items-center gap-0.5 px-4 py-1 text-slate-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
            <span className="text-[10px] font-medium">Team</span>
          </button>
          <button className="flex flex-col items-center gap-0.5 px-4 py-1 text-slate-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
            <span className="text-[10px] font-medium">Settings</span>
          </button>
        </div>
      </nav>

      {/* Overlay */}
      {showOverlay && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={closeAll}></div>
      )}

      {/* Success Toast */}
      <div className={`success-toast ${showSuccess ? "active" : ""}`}>
        <div className="flex items-center gap-2.5 bg-white px-4 py-3 rounded-full shadow-xl">
          <div className="success-icon w-8 h-8 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path className="check-draw" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/>
            </svg>
          </div>
          <span className="text-sm font-semibold text-slate-700">{successMessage}</span>
        </div>
      </div>

      {/* TIME PICKER */}
      <div className={`picker-modal shadow-2xl ${showTimePicker ? "active" : ""}`}>
        <div className="p-6 pb-8">
          <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-6"></div>
          <p className="text-center text-sm text-slate-400 mb-2">Seleziona orario</p>
          <div className="text-center mb-8">
            <span className="time-display text-6xl font-extrabold text-slate-800 tracking-tight">
              {selectedHour.toString().padStart(2, "0")}:{selectedMin.toString().padStart(2, "0")}
            </span>
          </div>
          
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="relative w-24">
              <div className="absolute top-1/2 left-0 right-0 h-[60px] -translate-y-1/2 border-t-2 border-b-2 border-sky-400 bg-sky-50/50 rounded-xl pointer-events-none z-10"></div>
              <div className="time-scroll">
                <div className="h-[60px]"></div>
                {[...Array(18)].map((_, i) => {
                  const hour = i + 6;
                  return (
                    <div
                      key={hour}
                      className={`time-item ${selectedHour === hour ? "active" : ""}`}
                      onClick={() => setSelectedHour(hour)}
                    >
                      {hour.toString().padStart(2, "0")}
                    </div>
                  );
                })}
                <div className="h-[60px]"></div>
              </div>
            </div>
            <span className="text-4xl font-bold text-slate-300 mx-2">:</span>
            <div className="relative w-24">
              <div className="absolute top-1/2 left-0 right-0 h-[60px] -translate-y-1/2 border-t-2 border-b-2 border-sky-400 bg-sky-50/50 rounded-xl pointer-events-none z-10"></div>
              <div className="time-scroll">
                <div className="h-[60px]"></div>
                {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((min) => (
                  <div
                    key={min}
                    className={`time-item ${selectedMin === min ? "active" : ""}`}
                    onClick={() => setSelectedMin(min)}
                  >
                    {min.toString().padStart(2, "0")}
                  </div>
                ))}
                <div className="h-[60px]"></div>
              </div>
            </div>
          </div>
          
          <button
            onClick={confirmTime}
            className="w-full py-4 bg-gradient-to-r from-sky-500 to-sky-600 text-white rounded-2xl font-bold text-lg active:scale-[0.98] transition-transform shadow-lg shadow-sky-500/30"
          >
            Conferma
          </button>
        </div>
      </div>

      {/* OPERATOR PICKER */}
      <div className={`picker-modal operator-modal shadow-2xl ${showOperatorPicker ? "active" : ""} ${keyboardOpen ? "keyboard-open" : ""}`}>
        <div className="p-5 pb-6">
          <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4"></div>
          <h3 className="text-base font-bold text-slate-800 mb-4">Seleziona operatore</h3>
          
          <div className="relative mb-4">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input
              type="text"
              placeholder="Cerca operatore..."
              value={operatorSearch}
              onChange={(e) => setOperatorSearch(e.target.value)}
              onFocus={() => setKeyboardOpen(true)}
              onBlur={() => setTimeout(() => setKeyboardOpen(false), 150)}
              className="w-full pl-10 pr-4 py-3 bg-slate-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition-all"
            />
          </div>
          
          <div className="overflow-y-auto space-y-2" style={{ height: "calc(50vh - 160px)" }}>
            {filteredOperators.length === 0 ? (
              <p className="text-center text-slate-400 py-8">Nessun operatore trovato</p>
            ) : (
              filteredOperators.map((operator, index) => {
                const colors = [
                  "from-blue-400 to-blue-600",
                  "from-pink-400 to-rose-600",
                  "from-violet-400 to-purple-600",
                  "from-emerald-400 to-teal-600",
                  "from-amber-400 to-orange-600",
                  "from-cyan-400 to-sky-600",
                ];
                return (
                  <button
                    key={operator.id}
                    onClick={() => selectOperator(operator)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-50 active:bg-slate-100"
                  >
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${colors[index % colors.length]} flex items-center justify-center text-white font-bold`}>
                      {operator.name?.charAt(0) || "?"}
                    </div>
                    <div className="text-left flex-1">
                      <p className="font-semibold text-slate-800">{operator.name}</p>
                      <p className="text-xs text-slate-400">{operator.email}</p>
                    </div>
                    <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* GUESTS PICKER */}
      <div className={`picker-modal shadow-2xl ${showGuestsPicker ? "active" : ""}`}>
        <div className="p-5 pb-6">
          <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5"></div>
          
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-800">Numero ospiti</h3>
            <button onClick={() => { setAdultsCount(1); setInfantsCount(0); }} className="text-sm text-slate-400">Reset</button>
          </div>
          
          {/* Adulti */}
          <div className="flex items-center justify-between py-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-indigo-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              </div>
              <p className="font-semibold text-slate-800">Adulti</p>
            </div>
            
            <div className="flex items-center gap-4">
              <button
                onClick={() => setAdultsCount(Math.max(1, adultsCount - 1))}
                disabled={adultsCount <= 1}
                className="stepper-btn w-10 h-10 rounded-full border-2 border-slate-200 flex items-center justify-center text-slate-400"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" d="M20 12H4"/>
                </svg>
              </button>
              <span className="text-xl font-bold text-slate-800 w-8 text-center">{adultsCount}</span>
              <button
                onClick={() => setAdultsCount(Math.min(10, adultsCount + 1))}
                className="stepper-btn btn-plus-adults w-10 h-10 rounded-full flex items-center justify-center text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" d="M12 4v16m8-8H4"/>
                </svg>
              </button>
            </div>
          </div>
          
          {/* Neonati */}
          <div className="flex items-center justify-between py-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-rose-300" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="6" r="3"/>
                  <path d="M12 11c-2 0-4 1.5-4 3v4h8v-4c0-1.5-2-3-4-3z"/>
                </svg>
              </div>
              <div>
                <p className="font-semibold text-slate-800">Neonati</p>
                <p className="text-xs text-slate-400">0-2 anni</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <button
                onClick={() => setInfantsCount(Math.max(0, infantsCount - 1))}
                disabled={infantsCount <= 0}
                className="stepper-btn w-10 h-10 rounded-full border-2 border-slate-200 flex items-center justify-center text-slate-400"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" d="M20 12H4"/>
                </svg>
              </button>
              <span className="text-xl font-bold text-slate-800 w-8 text-center">{infantsCount}</span>
              <button
                onClick={() => setInfantsCount(Math.min(5, infantsCount + 1))}
                className="stepper-btn btn-plus-infants w-10 h-10 rounded-full flex items-center justify-center text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" d="M12 4v16m8-8H4"/>
                </svg>
              </button>
            </div>
          </div>
          
          {/* Preview visivo */}
          <div className="bg-slate-50 rounded-2xl p-4 mb-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-slate-500">Anteprima</span>
              <span className="text-sm font-semibold text-slate-700">
                {infantsCount > 0 ? `${adultsCount} adulti + ${infantsCount} neonati` : `${adultsCount + infantsCount} ospiti`}
              </span>
            </div>
            <div className="flex items-end justify-center gap-1.5 min-h-[50px]">
              {[...Array(adultsCount)].map((_, i) => (
                <div key={`a${i}`} className="scale-in flex flex-col items-center" style={{ animationDelay: `${i * 0.03}s` }}>
                  <div className="w-5 h-5 rounded-full bg-indigo-200"></div>
                  <div className="w-7 h-9 bg-indigo-300 rounded-t-xl rounded-b-lg mt-0.5"></div>
                </div>
              ))}
              {[...Array(infantsCount)].map((_, i) => (
                <div key={`i${i}`} className="scale-in flex flex-col items-center" style={{ animationDelay: `${(adultsCount + i) * 0.03}s` }}>
                  <div className="w-4 h-4 rounded-full bg-rose-200"></div>
                  <div className="w-5 h-6 bg-rose-300 rounded-t-lg rounded-b-md mt-0.5"></div>
                </div>
              ))}
            </div>
          </div>
          
          <button
            onClick={confirmGuests}
            className="w-full py-4 bg-slate-800 text-white rounded-2xl font-semibold text-base active:scale-[0.98] transition-transform"
          >
            Conferma
          </button>
        </div>
      </div>
    </div>
  );
}
