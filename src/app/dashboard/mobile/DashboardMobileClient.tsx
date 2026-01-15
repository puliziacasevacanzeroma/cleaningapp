"use client";

import { useState, useEffect, useCallback } from "react";

interface Cleaning {
  id: string;
  propertyId: string;
  scheduledDate: string;
  scheduledTime: string | null;
  status: string;
  type: string;
  property: {
    id: string;
    name: string;
    address: string;
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

export function DashboardMobileClient({ userName }: DashboardMobileClientProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [cleanings, setCleanings] = useState<Cleaning[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("all");
  
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

  const fetchCleanings = useCallback(async () => {
    setLoading(true);
    try {
      const dateStr = currentDate.toISOString().split("T")[0];
      const res = await fetch(`/api/dashboard/cleanings?date=${dateStr}`);
      const data = await res.json();
      setCleanings(data.cleanings || []);
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
      setOperators(data || []);
    } catch (error) {
      console.error("Error fetching operators:", error);
    }
  }, []);

  useEffect(() => {
    fetchCleanings();
    fetchOperators();
  }, [fetchCleanings, fetchOperators]);

  const changeDate = (days: number) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + days);
    setCurrentDate(newDate);
  };

  const formatDate = (date: Date) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return "Oggi";
    if (date.toDateString() === tomorrow.toDateString()) return "Domani";
    if (date.toDateString() === yesterday.toDateString()) return "Ieri";
    
    return date.toLocaleDateString("it-IT", { 
      weekday: "short", 
      day: "numeric", 
      month: "short" 
    });
  };

  const displaySuccess = (message: string) => {
    setSuccessMessage(message);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 1500);
  };

  const closeAll = () => {
    setShowOverlay(false);
    setShowTimePicker(false);
    setShowOperatorPicker(false);
    setShowGuestsPicker(false);
    setCurrentCardId(null);
    setOperatorSearch("");
    setKeyboardOpen(false);
    document.body.classList.remove("modal-open");
  };

  const openTimePicker = (cleaning: Cleaning) => {
    setCurrentCardId(cleaning.id);
    const time = cleaning.scheduledTime || "10:00";
    const [h, m] = time.split(":");
    setSelectedHour(parseInt(h || "10"));
    setSelectedMin(parseInt(m || "0"));
    setShowOverlay(true);
    setShowTimePicker(true);
    document.body.classList.add("modal-open");
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
      
      setCleanings(prev => prev.map(c => 
        c.id === currentCardId ? { ...c, scheduledTime: timeStr } : c
      ));
      
      displaySuccess(`Orario: ${timeStr}`);
    } catch (error) {
      console.error("Error updating time:", error);
    }
    
    closeAll();
  };

  const openOperatorPicker = (cleaning: Cleaning) => {
    setCurrentCardId(cleaning.id);
    setOperatorSearch("");
    setShowOverlay(true);
    setShowOperatorPicker(true);
    document.body.classList.add("modal-open");
  };

  const selectOperator = async (operator: Operator) => {
    if (!currentCardId) return;
    
    try {
      await fetch(`/api/dashboard/cleanings/${currentCardId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorId: operator.id }),
      });
      
      setCleanings(prev => prev.map(c => 
        c.id === currentCardId ? { ...c, operator: { id: operator.id, name: operator.name || "" }, status: "assigned" } : c
      ));
      
      displaySuccess(`Assegnato a ${operator.name}`);
    } catch (error) {
      console.error("Error assigning operator:", error);
    }
    
    closeAll();
  };

  const openGuestsPicker = (cleaning: Cleaning) => {
    setCurrentCardId(cleaning.id);
    const guests = cleaning.booking?.guestsCount || 2;
    setAdultsCount(guests);
    setInfantsCount(0);
    setShowOverlay(true);
    setShowGuestsPicker(true);
    document.body.classList.add("modal-open");
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
      
      setCleanings(prev => prev.map(c => 
        c.id === currentCardId && c.booking ? { 
          ...c, 
          booking: { ...c.booking, guestsCount: total } 
        } : c
      ));
      
      displaySuccess(`${total} ospiti`);
    } catch (error) {
      console.error("Error updating guests:", error);
    }
    
    closeAll();
  };

  const filteredCleanings = cleanings.filter(c => {
    if (activeFilter === "all") return true;
    if (activeFilter === "pending") return c.status === "SCHEDULED" || !c.operator;
    if (activeFilter === "assigned") return c.status === "assigned" && c.operator;
    if (activeFilter === "completed") return c.status === "completed";
    return true;
  });

  const filteredOperators = operators.filter(op => 
    op.name?.toLowerCase().includes(operatorSearch.toLowerCase())
  );

  const stats = {
    pending: cleanings.filter(c => c.status === "SCHEDULED" || !c.operator).length,
    inProgress: cleanings.filter(c => c.status === "in_progress").length,
    completed: cleanings.filter(c => c.status === "completed").length,
  };

  const getInitials = (name: string | null) => {
    if (!name) return "?";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const getStatusColor = (status: string, hasOperator: boolean) => {
    if (status === "completed") return "bg-emerald-400";
    if (status === "in_progress") return "bg-blue-400";
    if (hasOperator) return "bg-amber-400";
    return "bg-red-400";
  };

  return (
    <div className="min-h-screen bg-slate-100 pb-24">
      <style jsx global>{`
        .hero-gradient { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%); }
        .picker-modal {
          position: fixed; bottom: 0; left: 0; right: 0;
          background: white; border-radius: 24px 24px 0 0;
          transform: translateY(100%);
          transition: transform 0.3s ease;
          z-index: 60;
        }
        .picker-modal.active { transform: translateY(0); }
        .operator-modal { max-height: 50vh; height: 50vh; }
        .operator-modal.keyboard-open { height: 380px; max-height: 380px; }
        .operator-modal #operatorsList { height: calc(50vh - 140px); max-height: calc(50vh - 140px); }
        .operator-modal.keyboard-open #operatorsList { height: 220px !important; max-height: 220px !important; }
        .time-scroll {
          height: 180px; overflow-y: auto; scroll-snap-type: y mandatory;
          -webkit-overflow-scrolling: touch;
          mask-image: linear-gradient(to bottom, transparent, black 25%, black 75%, transparent);
          -webkit-mask-image: linear-gradient(to bottom, transparent, black 25%, black 75%, transparent);
        }
        .time-scroll::-webkit-scrollbar { display: none; }
        .time-item { scroll-snap-align: center; }
        .filter-btn.active { background: rgba(255,255,255,0.35); transform: scale(1.02); box-shadow: 0 4px 15px rgba(0,0,0,0.15); }
        .stepper-btn:disabled { opacity: 0.3; pointer-events: none; }
        .btn-plus-adults { background: linear-gradient(135deg, #a5b4fc 0%, #818cf8 100%); }
        .btn-plus-infants { background: linear-gradient(135deg, #fda4af 0%, #fb7185 100%); }
        .success-toast {
          position: fixed; top: 80px; left: 50%;
          transform: translateX(-50%) translateY(-20px) scale(0.9);
          opacity: 0; visibility: hidden;
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          z-index: 200;
        }
        .success-toast.active { transform: translateX(-50%) translateY(0) scale(1); opacity: 1; visibility: visible; }
        .card-alert { border-left: 4px solid #f59e0b; }
        .bottom-nav { padding-bottom: max(12px, env(safe-area-inset-bottom)); }
        body.modal-open { overflow: hidden; position: fixed; width: 100%; }
      `}</style>

      {/* Header */}
      <div className="hero-gradient text-white px-5 pt-12 pb-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14h-2v-4H6v-2h4V7h2v4h4v2h-4v4z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold">CleaningApp</h1>
              <p className="text-xs text-white/70">Ciao, {userName}</p>
            </div>
          </div>
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 rounded-full flex items-center justify-center text-xs font-bold">3</div>
          </div>
        </div>

        {/* Stats Card */}
        <div className="bg-white/15 backdrop-blur-lg rounded-3xl p-5">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-white/70 text-sm">Pulizie di oggi</p>
              <p className="text-4xl font-bold">{cleanings.length}</p>
            </div>
            {cleanings.length > 0 && (
              <div className="px-3 py-1 rounded-full bg-emerald-400/30 text-emerald-100 text-xs font-medium">
                {stats.completed}/{cleanings.length} completate
              </div>
            )}
          </div>
          
          <div className="flex gap-2 mt-4">
            <button 
              onClick={() => setActiveFilter("pending")}
              className={`filter-btn flex-1 py-3 rounded-2xl text-center ${activeFilter === "pending" ? "active" : "bg-white/10"}`}
            >
              <p className="text-2xl font-bold">{stats.pending}</p>
              <p className="text-xs text-white/70">Da fare</p>
            </button>
            <button 
              onClick={() => setActiveFilter("assigned")}
              className={`filter-btn flex-1 py-3 rounded-2xl text-center ${activeFilter === "assigned" ? "active" : "bg-white/10"}`}
            >
              <p className="text-2xl font-bold">{stats.inProgress}</p>
              <p className="text-xs text-white/70">In corso</p>
            </button>
            <button 
              onClick={() => setActiveFilter("completed")}
              className={`filter-btn flex-1 py-3 rounded-2xl text-center ${activeFilter === "completed" ? "active" : "bg-white/10"}`}
            >
              <p className="text-2xl font-bold text-emerald-300">{stats.completed}</p>
              <p className="text-xs text-white/70">Completate</p>
            </button>
          </div>
        </div>
      </div>

      {/* Date Navigator */}
      <div className="mx-5 -mt-4 bg-white rounded-2xl p-3 flex items-center justify-between relative z-10 shadow-lg">
        <button onClick={() => changeDate(-1)} className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
          <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="text-center">
          <p className="text-lg font-bold text-slate-800">{formatDate(currentDate)}</p>
          <p className="text-xs text-slate-400">
            {currentDate.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <button onClick={() => changeDate(1)} className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
          <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Section Header */}
      <div className="px-5 mt-6 mb-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-800">Tutte le pulizie</h2>
        <button onClick={() => setActiveFilter("all")} className="text-sm text-violet-600 font-medium">
          {activeFilter !== "all" ? "Mostra tutte" : `${filteredCleanings.length} totali`}
        </button>
      </div>

      {/* Cards List */}
      <div className="px-5 space-y-3">
        {loading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-4 animate-pulse">
              <div className="flex gap-3">
                <div className="w-12 h-12 bg-slate-200 rounded-xl"></div>
                <div className="flex-1">
                  <div className="h-4 bg-slate-200 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                </div>
              </div>
            </div>
          ))
        ) : filteredCleanings.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 bg-slate-200 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </div>
            <p className="text-slate-500">Nessuna pulizia per questa data</p>
          </div>
        ) : (
          filteredCleanings.map((cleaning) => (
            <div key={cleaning.id} className={`bg-white rounded-2xl p-4 shadow-sm ${!cleaning.operator ? "card-alert" : ""}`}>
              <div className="flex gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
                  {cleaning.property.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-1">
                    <h3 className="font-semibold text-slate-800 truncate">{cleaning.property.name}</h3>
                    <div className={`w-2 h-2 rounded-full ${getStatusColor(cleaning.status, !!cleaning.operator)}`}></div>
                  </div>
                  <p className="text-xs text-slate-400 truncate mb-3">{cleaning.property.address}</p>
                  
                  <div className="flex gap-2">
                    <button onClick={() => openTimePicker(cleaning)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg">
                      <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-xs font-medium text-slate-600">{cleaning.scheduledTime || "10:00"}</span>
                    </button>
                    
                    <button onClick={() => openGuestsPicker(cleaning)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg">
                      <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="text-xs font-medium text-slate-600">{cleaning.booking?.guestsCount || 2}</span>
                    </button>
                    
                    <button onClick={() => openOperatorPicker(cleaning)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${cleaning.operator ? "bg-slate-100" : "bg-amber-100"}`}>
                      {cleaning.operator ? (
                        <>
                          <div className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
                            <span className="text-[8px] text-white font-bold">{getInitials(cleaning.operator.name)}</span>
                          </div>
                          <span className="text-xs font-medium text-slate-600">{cleaning.operator.name?.split(" ")[0]}</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          <span className="text-xs font-medium text-amber-600">Assegna</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Overlay */}
      {showOverlay && <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={closeAll} />}

      {/* Time Picker Modal */}
      <div className={`picker-modal shadow-2xl z-[60] ${showTimePicker ? "active" : ""}`}>
        <div className="p-6 pb-8">
          <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-6"></div>
          <p className="text-center text-sm text-slate-400 mb-2">Seleziona orario</p>
          <div className="text-center mb-8">
            <span className="text-6xl font-extrabold text-slate-800 tracking-tight">
              {selectedHour.toString().padStart(2, "0")}:{selectedMin.toString().padStart(2, "0")}
            </span>
          </div>
          
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="relative w-24">
              <div className="absolute top-1/2 left-0 right-0 h-[60px] -translate-y-1/2 border-t-2 border-b-2 border-sky-400 bg-sky-50/50 rounded-xl pointer-events-none z-10"></div>
              <div className="time-scroll">
                <div className="h-[60px]"></div>
                {[...Array(18)].map((_, i) => (
                  <div key={i} className={`time-item h-[60px] flex items-center justify-center cursor-pointer ${selectedHour === i + 6 ? "text-3xl font-bold text-slate-900" : "text-xl text-slate-300"}`} onClick={() => setSelectedHour(i + 6)}>
                    {(i + 6).toString().padStart(2, "0")}
                  </div>
                ))}
                <div className="h-[60px]"></div>
              </div>
            </div>
            <span className="text-4xl font-bold text-slate-300 mx-2">:</span>
            <div className="relative w-24">
              <div className="absolute top-1/2 left-0 right-0 h-[60px] -translate-y-1/2 border-t-2 border-b-2 border-sky-400 bg-sky-50/50 rounded-xl pointer-events-none z-10"></div>
              <div className="time-scroll">
                <div className="h-[60px]"></div>
                {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((min) => (
                  <div key={min} className={`time-item h-[60px] flex items-center justify-center cursor-pointer ${selectedMin === min ? "text-3xl font-bold text-slate-900" : "text-xl text-slate-300"}`} onClick={() => setSelectedMin(min)}>
                    {min.toString().padStart(2, "0")}
                  </div>
                ))}
                <div className="h-[60px]"></div>
              </div>
            </div>
          </div>
          
          <button onClick={confirmTime} className="w-full py-4 bg-gradient-to-r from-sky-500 to-sky-600 text-white rounded-2xl font-bold text-lg active:scale-[0.98] transition-transform shadow-lg shadow-sky-500/30">
            Conferma
          </button>
        </div>
      </div>

      {/* Operator Picker Modal */}
      <div className={`picker-modal operator-modal shadow-2xl z-[60] ${showOperatorPicker ? "active" : ""} ${keyboardOpen ? "keyboard-open" : ""}`}>
        <div className="p-5 pb-6">
          <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4"></div>
          <h3 className="text-base font-bold text-slate-800 mb-4">Seleziona operatore</h3>
          
          <div className="relative mb-4">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
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
          
          <div className="overflow-y-auto space-y-2" id="operatorsList">
            {filteredOperators.length === 0 ? (
              <p className="text-center text-slate-400 py-8">Nessun operatore trovato</p>
            ) : (
              filteredOperators.map((operator) => (
                <button key={operator.id} onClick={() => selectOperator(operator)} className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-50 active:bg-slate-100">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold">
                    {getInitials(operator.name)}
                  </div>
                  <div className="text-left flex-1">
                    <p className="font-semibold text-slate-800">{operator.name}</p>
                    <p className="text-xs text-slate-400">{operator.email}</p>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Guests Picker Modal */}
      <div className={`picker-modal shadow-2xl z-[60] ${showGuestsPicker ? "active" : ""}`}>
        <div className="p-5 pb-6">
          <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5"></div>
          
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-800">Numero ospiti</h3>
            <button onClick={() => { setAdultsCount(2); setInfantsCount(0); }} className="text-sm text-slate-400">Reset</button>
          </div>
          
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
              <button onClick={() => setAdultsCount(Math.max(1, adultsCount - 1))} disabled={adultsCount <= 1} className="stepper-btn w-10 h-10 rounded-full border-2 border-slate-200 flex items-center justify-center text-slate-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M20 12H4"/></svg>
              </button>
              <span className="text-xl font-bold text-slate-800 w-8 text-center">{adultsCount}</span>
              <button onClick={() => setAdultsCount(Math.min(20, adultsCount + 1))} className="stepper-btn btn-plus-adults w-10 h-10 rounded-full flex items-center justify-center text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M12 4v16m8-8H4"/></svg>
              </button>
            </div>
          </div>
          
          <div className="flex items-center justify-between py-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-rose-300" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="6" r="3"/><path d="M12 11c-2 0-4 1.5-4 3v4h8v-4c0-1.5-2-3-4-3z"/>
                </svg>
              </div>
              <div>
                <p className="font-semibold text-slate-800">Neonati</p>
                <p className="text-xs text-slate-400">0-2 anni</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={() => setInfantsCount(Math.max(0, infantsCount - 1))} disabled={infantsCount <= 0} className="stepper-btn w-10 h-10 rounded-full border-2 border-slate-200 flex items-center justify-center text-slate-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M20 12H4"/></svg>
              </button>
              <span className="text-xl font-bold text-slate-800 w-8 text-center">{infantsCount}</span>
              <button onClick={() => setInfantsCount(Math.min(10, infantsCount + 1))} className="stepper-btn btn-plus-infants w-10 h-10 rounded-full flex items-center justify-center text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M12 4v16m8-8H4"/></svg>
              </button>
            </div>
          </div>
          
          <div className="bg-slate-50 rounded-2xl p-4 mb-6 text-center">
            <p className="text-sm text-slate-500 mb-1">Totale ospiti</p>
            <p className="text-4xl font-bold text-slate-800">{adultsCount + infantsCount}</p>
          </div>
          
          <button onClick={confirmGuests} className="w-full py-4 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-2xl font-bold text-lg active:scale-[0.98] transition-transform shadow-lg shadow-purple-500/30">
            Conferma
          </button>
        </div>
      </div>

      {/* Success Toast */}
      <div className={`success-toast ${showSuccess ? "active" : ""}`}>
        <div className="bg-white rounded-2xl shadow-2xl px-6 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <span className="font-semibold text-slate-800">{successMessage}</span>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 bottom-nav z-40">
        <div className="flex justify-around py-2">
          <button className="flex flex-col items-center p-2 text-violet-600">
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
            <span className="text-xs mt-1 font-medium">Home</span>
          </button>
          <button className="flex flex-col items-center p-2 text-slate-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <span className="text-xs mt-1">Calendario</span>
          </button>
          <button className="flex flex-col items-center p-2 text-slate-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            <span className="text-xs mt-1">Team</span>
          </button>
          <button className="flex flex-col items-center p-2 text-slate-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            <span className="text-xs mt-1">Impostazioni</span>
          </button>
        </div>
      </div>
    </div>
  );
}