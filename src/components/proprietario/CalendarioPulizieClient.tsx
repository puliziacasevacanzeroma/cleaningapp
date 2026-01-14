"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Operator {
  id: string;
  name: string | null;
}

interface Booking {
  id: string;
  guestName: string;
  checkIn: string | Date;
  checkOut: string | Date;
}

interface Cleaning {
  id: string;
  date: string | Date;
  status: string;
  scheduledTime?: string | null;
  operator?: Operator | null;
  operatorId?: string | null;
  notes?: string | null;
  guestsCount?: number | null;
  booking?: Booking | null;
}

interface Property {
  id: string;
  name: string;
  address: string;
  cleanings: Cleaning[];
}

interface Stats {
  total: number;
  completed: number;
  today: number;
  unassigned: number;
}

interface CalendarioPulizieClientProps {
  properties: Property[];
  stats: Stats;
}

export function CalendarioPulizieClient({ properties, stats }: CalendarioPulizieClientProps) {
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Modal nuova pulizia
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  
  // Modal dettaglio pulizia
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedCleaning, setSelectedCleaning] = useState<Cleaning | null>(null);
  const [selectedPropertyName, setSelectedPropertyName] = useState<string>("");
  
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ 
    bookings: { imported: number; updated: number }; 
    cleanings: { created: number };
    errors?: string[] 
  } | null>(null);
  
  const [newFormData, setNewFormData] = useState({
    scheduledTime: "10:00",
    guestsCount: 2,
    notes: ""
  });
  
  const [editFormData, setEditFormData] = useState({
    scheduledTime: "",
    guestsCount: 0,
    notes: "",
    status: ""
  });
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const scrollEl = scrollRef.current;
    const headerEl = headerScrollRef.current;
    if (!scrollEl || !headerEl) return;
    
    const handleScroll = () => {
      headerEl.scrollLeft = scrollEl.scrollLeft;
    };
    
    scrollEl.addEventListener('scroll', handleScroll);
    return () => scrollEl.removeEventListener('scroll', handleScroll);
  }, []);
  
  // Quando si seleziona una pulizia, popola il form
  useEffect(() => {
    if (selectedCleaning) {
      setEditFormData({
        scheduledTime: selectedCleaning.scheduledTime || "10:00",
        guestsCount: selectedCleaning.guestsCount || 2,
        notes: selectedCleaning.notes || "",
        status: selectedCleaning.status || "not_assigned"
      });
    }
  }, [selectedCleaning]);
  
  const days = useMemo(() => {
    const result = [];
    const startDate = new Date(currentDate);
    startDate.setDate(startDate.getDate() - 3);
    
    for (let i = 0; i < 21; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      result.push(date);
    }
    return result;
  }, [currentDate]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dayNames = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    
    try {
      const response = await fetch("/api/proprietario/sync-ical", {
        method: "POST"
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setSyncResult({
          bookings: data.bookings || { imported: 0, updated: 0 },
          cleanings: data.cleanings || { created: 0 },
          errors: data.errors
        });
        router.refresh();
      } else {
        setSyncResult({
          bookings: { imported: 0, updated: 0 },
          cleanings: { created: 0 },
          errors: [data.error || "Errore durante la sincronizzazione"]
        });
      }
    } catch (error) {
      setSyncResult({
        bookings: { imported: 0, updated: 0 },
        cleanings: { created: 0 },
        errors: ["Errore di connessione"]
      });
    } finally {
      setSyncing(false);
    }
  };

  const getCleaningStyle = (cleaning: Cleaning) => {
    switch (cleaning.status) {
      case "completed":
        return { bg: "bg-gradient-to-br from-emerald-400 via-teal-500 to-teal-600 shadow-lg shadow-emerald-500/40", icon: "✓", label: "Completata", color: "emerald" };
      case "in_progress":
        return { bg: "bg-gradient-to-br from-amber-400 via-orange-500 to-orange-600 shadow-lg shadow-amber-500/40 animate-pulse", icon: "⏱", label: "In corso", color: "amber" };
      case "assigned":
        return { bg: "bg-gradient-to-br from-sky-400 via-blue-500 to-blue-600 shadow-lg shadow-sky-500/40", icon: cleaning.operator?.name?.split(" ").map(n => n[0]).join("") || "OP", label: "Assegnata", color: "sky" };
      case "not_assigned":
        return { bg: "bg-gradient-to-br from-rose-400 via-red-500 to-red-600 shadow-lg shadow-rose-500/40", icon: "!", label: "Da assegnare", color: "rose" };
      default:
        return { bg: "bg-gradient-to-br from-slate-300 to-slate-400 shadow-md", icon: "?", label: "Sconosciuto", color: "slate" };
    }
  };

  const navigateMonth = (direction: number) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + (direction * 7));
    setCurrentDate(newDate);
  };

  const handleDayClick = (propertyId: string, date: Date) => {
    if (date < today) return;
    setSelectedPropertyId(propertyId);
    setSelectedDate(date);
    setShowNewModal(true);
  };

  const handleCleaningClick = (cleaning: Cleaning, propertyName: string) => {
    setSelectedCleaning(cleaning);
    setSelectedPropertyName(propertyName);
    setShowDetailModal(true);
  };

  const handleNewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate || !selectedPropertyId) return;
    
    setLoading(true);
    try {
      const response = await fetch("/api/proprietario/cleanings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: selectedPropertyId,
          date: selectedDate.toISOString(),
          scheduledTime: newFormData.scheduledTime,
          guestsCount: newFormData.guestsCount,
          notes: newFormData.notes
        }),
      });

      if (response.ok) {
        setShowNewModal(false);
        setNewFormData({ scheduledTime: "10:00", guestsCount: 2, notes: "" });
        router.refresh();
      }
    } catch (error) {
      console.error("Errore:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCleaning) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/proprietario/cleanings/${selectedCleaning.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledTime: editFormData.scheduledTime,
          guestsCount: editFormData.guestsCount,
          notes: editFormData.notes,
          status: editFormData.status
        }),
      });

      if (response.ok) {
        setShowDetailModal(false);
        setSelectedCleaning(null);
        router.refresh();
      }
    } catch (error) {
      console.error("Errore:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedCleaning) return;
    
    if (!confirm("Sei sicuro di voler eliminare questa pulizia?")) return;
    
    setDeleting(true);
    try {
      const response = await fetch(`/api/proprietario/cleanings/${selectedCleaning.id}`, {
        method: "DELETE"
      });

      if (response.ok) {
        setShowDetailModal(false);
        setSelectedCleaning(null);
        router.refresh();
      }
    } catch (error) {
      console.error("Errore:", error);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      {/* Container */}
      <div className="h-[calc(100vh-56px)] lg:h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 p-4 flex flex-col">
        
        {/* HEADER */}
        <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-slate-800">Calendario Pulizie</h1>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-medium rounded-xl shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {syncing ? "Sincronizzazione..." : "Sincronizza iCal"}
            </button>
            
            <div className="hidden lg:flex flex-wrap items-center gap-2 text-[10px]">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gradient-to-br from-emerald-400 to-teal-500"></span>Completata</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gradient-to-br from-amber-400 to-orange-500"></span>In corso</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gradient-to-br from-sky-400 to-blue-500"></span>Assegnata</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gradient-to-br from-rose-400 to-red-500"></span>Da assegnare</span>
            </div>
          </div>
        </div>

        {/* Risultato sincronizzazione */}
        {syncResult && (
          <div className={`flex-shrink-0 mb-3 p-3 rounded-xl text-sm bg-emerald-50 border border-emerald-200 text-emerald-700`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>
                  <strong>{syncResult.cleanings.created}</strong> pulizie create, 
                  <strong> {syncResult.bookings.imported}</strong> prenotazioni importate
                </span>
              </div>
              <button onClick={() => setSyncResult(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* STATS */}
        <div className="flex-shrink-0 grid grid-cols-4 gap-2 mb-3">
          <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-md">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center shadow-md">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div>
                <p className="text-xl font-bold text-slate-800">{stats.total}</p>
                <p className="text-[10px] text-slate-500">Totali</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-md">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-md">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-xl font-bold text-slate-800">{stats.completed}</p>
                <p className="text-[10px] text-slate-500">Completate</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-md">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-xl font-bold text-slate-800">{stats.today}</p>
                <p className="text-[10px] text-slate-500">Oggi</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-md">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-rose-400 to-red-600 flex items-center justify-center shadow-md">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <p className="text-xl font-bold text-slate-800">{stats.unassigned}</p>
                <p className="text-[10px] text-slate-500">Da assegnare</p>
              </div>
            </div>
          </div>
        </div>

        {/* CALENDARIO */}
        <div className="flex-1 min-h-0 bg-white rounded-xl border border-slate-100 shadow-lg overflow-hidden flex flex-col">
          
          {/* Navigation */}
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-100">
            <button onClick={() => navigateMonth(-1)} className="w-8 h-8 rounded-lg bg-white border shadow-sm flex items-center justify-center hover:shadow-md transition-all">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="text-center">
              <h3 className="font-bold text-slate-800">{currentDate.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}</h3>
              <p className="text-[10px] text-slate-500">Clicca su una pulizia per modificarla</p>
            </div>
            <button onClick={() => navigateMonth(1)} className="w-8 h-8 rounded-lg bg-white border shadow-sm flex items-center justify-center hover:shadow-md transition-all">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* GANTT */}
          <div className="flex-1 min-h-0 flex overflow-hidden">
            
            {/* PROPRIETÀ */}
            <div className="w-[150px] flex-shrink-0 border-r border-slate-200 flex flex-col bg-slate-50/50">
              <div className="h-10 flex items-center px-3 bg-slate-100 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase">
                Proprietà
              </div>
              <div className="flex-1 overflow-y-auto">
                {properties.map((property) => (
                  <div key={property.id} className="h-12 flex items-center px-2 border-b border-slate-100">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-md flex-shrink-0">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21" />
                        </svg>
                      </div>
                      <p className="font-medium text-slate-800 text-xs truncate">{property.name}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* GIORNI */}
            <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
              <div ref={headerScrollRef} className="h-10 flex-shrink-0 overflow-hidden bg-slate-100 border-b border-slate-200">
                <div className="flex h-full" style={{ width: `${days.length * 48}px` }}>
                  {days.map((day, index) => {
                    const isToday = day.toDateString() === today.toDateString();
                    const isSunday = day.getDay() === 0;
                    return (
                      <div key={index} className={`w-12 flex-shrink-0 flex flex-col items-center justify-center border-r border-slate-200 ${isToday ? "bg-emerald-100" : isSunday ? "bg-rose-50" : ""}`}>
                        <span className={`text-[9px] font-semibold uppercase ${isToday ? "text-emerald-600" : isSunday ? "text-rose-500" : "text-slate-400"}`}>
                          {dayNames[day.getDay()]}
                        </span>
                        {isToday ? (
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-md">
                            <span className="text-[10px] font-bold text-white">{day.getDate()}</span>
                          </div>
                        ) : (
                          <span className={`text-xs font-bold ${isSunday ? "text-rose-500" : "text-slate-700"}`}>{day.getDate()}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              
              <div ref={scrollRef} className="flex-1 overflow-auto">
                <div style={{ width: `${days.length * 48}px` }}>
                  {properties.map((property) => (
                    <div key={property.id} className="h-12 flex border-b border-slate-100">
                      {days.map((day, dayIndex) => {
                        const isToday = day.toDateString() === today.toDateString();
                        const isSunday = day.getDay() === 0;
                        const isPast = day < today;
                        
                        const cleaningOnDay = property.cleanings.find(c => {
                          const cleaningDate = new Date(c.date);
                          cleaningDate.setHours(0, 0, 0, 0);
                          return cleaningDate.toDateString() === day.toDateString();
                        });
                        
                        return (
                          <div
                            key={dayIndex}
                            onClick={() => !cleaningOnDay && !isPast && handleDayClick(property.id, day)}
                            className={`w-12 flex-shrink-0 flex items-center justify-center border-r border-slate-50 transition-all
                              ${isToday ? "bg-emerald-50" : isSunday ? "bg-rose-50/30" : ""} 
                              ${!isPast && !cleaningOnDay ? "cursor-pointer hover:bg-emerald-100" : ""} 
                              ${isPast && !cleaningOnDay ? "opacity-40" : ""}`}
                          >
                            {cleaningOnDay && (
                              <div 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCleaningClick(cleaningOnDay, property.name);
                                }}
                                className={`w-9 h-9 rounded-lg ${getCleaningStyle(cleaningOnDay).bg} flex items-center justify-center cursor-pointer hover:scale-110 transition-transform`}
                                title="Clicca per modificare"
                              >
                                <span className="text-xs text-white font-bold">{getCleaningStyle(cleaningOnDay).icon}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal NUOVA pulizia */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-4">
              <h3 className="text-lg font-bold text-white">Nuova Pulizia</h3>
              <p className="text-emerald-100 text-sm">{selectedDate?.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</p>
            </div>
            
            <form onSubmit={handleNewSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Proprietà</label>
                <select value={selectedPropertyId} onChange={(e) => setSelectedPropertyId(e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500" required>
                  <option value="">Seleziona...</option>
                  {properties.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Orario</label>
                  <input type="time" value={newFormData.scheduledTime} onChange={(e) => setNewFormData(prev => ({ ...prev, scheduledTime: e.target.value }))} className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Ospiti</label>
                  <input type="number" value={newFormData.guestsCount} onChange={(e) => setNewFormData(prev => ({ ...prev, guestsCount: parseInt(e.target.value) || 0 }))} min={1} className="w-full px-3 py-2 border rounded-lg" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Note</label>
                <input type="text" value={newFormData.notes} onChange={(e) => setNewFormData(prev => ({ ...prev, notes: e.target.value }))} placeholder="Note opzionali..." className="w-full px-3 py-2 border rounded-lg" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowNewModal(false)} className="flex-1 px-4 py-2 border text-slate-700 rounded-lg hover:bg-slate-50">Annulla</button>
                <button type="submit" disabled={loading || !selectedPropertyId} className="flex-1 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50">{loading ? "..." : "Crea"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal DETTAGLIO/MODIFICA pulizia */}
      {showDetailModal && selectedCleaning && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-4 max-h-[90vh] overflow-y-auto">
            <div className={`px-5 py-4 bg-gradient-to-r sticky top-0 z-10 ${
              getCleaningStyle(selectedCleaning).color === 'emerald' ? 'from-emerald-500 to-teal-600' :
              getCleaningStyle(selectedCleaning).color === 'amber' ? 'from-amber-500 to-orange-600' :
              getCleaningStyle(selectedCleaning).color === 'sky' ? 'from-sky-500 to-blue-600' :
              getCleaningStyle(selectedCleaning).color === 'rose' ? 'from-rose-500 to-red-600' :
              'from-slate-500 to-slate-600'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">Dettaglio Pulizia</h3>
                  <p className="text-white/80 text-sm">{selectedPropertyName}</p>
                </div>
                <button 
                  onClick={() => {
                    setShowDetailModal(false);
                    setSelectedCleaning(null);
                  }}
                  className="bg-white/20 hover:bg-white/30 p-2 rounded-lg transition-all"
                >
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="mt-2 bg-white/20 px-3 py-1 rounded-lg inline-block">
                <span className="text-white text-sm font-medium">{getCleaningStyle(selectedCleaning).label}</span>
              </div>
            </div>
            
            <form onSubmit={handleEditSubmit} className="p-5 space-y-4">
              {/* Info prenotazione collegata */}
              {selectedCleaning.booking && (
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                  <p className="text-xs text-slate-500 mb-1">Prenotazione collegata</p>
                  <p className="font-medium text-slate-800">{selectedCleaning.booking.guestName}</p>
                  <p className="text-sm text-slate-600">
                    Check-out: {new Date(selectedCleaning.booking.checkOut).toLocaleDateString("it-IT")}
                  </p>
                </div>
              )}
              
              {/* Data */}
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                <p className="text-xs text-slate-500 mb-1">Data pulizia</p>
                <p className="font-medium text-slate-800">
                  {new Date(selectedCleaning.date).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </p>
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Stato</label>
                <select 
                  value={editFormData.status} 
                  onChange={(e) => setEditFormData(prev => ({ ...prev, status: e.target.value }))} 
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="not_assigned">Da assegnare</option>
                  <option value="assigned">Assegnata</option>
                  <option value="in_progress">In corso</option>
                  <option value="completed">Completata</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Orario</label>
                  <input 
                    type="time" 
                    value={editFormData.scheduledTime} 
                    onChange={(e) => setEditFormData(prev => ({ ...prev, scheduledTime: e.target.value }))} 
                    className="w-full px-3 py-2 border rounded-lg" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">N° Ospiti</label>
                  <input 
                    type="number" 
                    value={editFormData.guestsCount} 
                    onChange={(e) => setEditFormData(prev => ({ ...prev, guestsCount: parseInt(e.target.value) || 0 }))} 
                    min={1} 
                    className="w-full px-3 py-2 border rounded-lg" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Note</label>
                <textarea 
                  value={editFormData.notes} 
                  onChange={(e) => setEditFormData(prev => ({ ...prev, notes: e.target.value }))} 
                  placeholder="Note opzionali..."
                  rows={2}
                  className="w-full px-3 py-2 border rounded-lg resize-none" 
                />
              </div>

              {/* Operatore assegnato */}
              {selectedCleaning.operator && (
                <div className="bg-sky-50 rounded-xl p-3 border border-sky-200">
                  <p className="text-xs text-sky-600 mb-1">Operatore assegnato</p>
                  <p className="font-medium text-sky-800">{selectedCleaning.operator.name}</p>
                </div>
              )}

              <div className="flex gap-3 pt-4 mt-4 border-t border-slate-200 sticky bottom-0 bg-white pb-1">
                <button 
                  type="button" 
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-4 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 transition-all text-sm font-medium"
                >
                  {deleting ? "..." : "🗑️ Elimina"}
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    setShowDetailModal(false);
                    setSelectedCleaning(null);
                  }} 
                  className="flex-1 px-4 py-2.5 border text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium"
                >
                  Annulla
                </button>
                <button 
                  type="submit" 
                  disabled={loading} 
                  className="flex-1 px-4 py-2.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50 text-sm font-medium"
                >
                  {loading ? "..." : "💾 Salva"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
