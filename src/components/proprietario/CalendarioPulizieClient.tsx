"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
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
  
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  
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

  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('calendar');

  // Refs per sincronizzare lo scroll
  const gridRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  
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

  // Sincronizza scroll orizzontale (griglia -> header)
  // Sincronizza scroll verticale (griglia -> sidebar)
  const handleGridScroll = () => {
    if (gridRef.current && headerRef.current && sidebarRef.current) {
      headerRef.current.scrollLeft = gridRef.current.scrollLeft;
      sidebarRef.current.scrollTop = gridRef.current.scrollTop;
    }
  };
  
  const days = useMemo(() => {
    const result = [];
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const lastDay = new Date(year, month + 1, 0);
    
    for (let d = 1; d <= lastDay.getDate(); d++) {
      result.push(new Date(year, month, d));
    }
    return result;
  }, [currentDate]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dayNames = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    
    try {
      const response = await fetch("/api/proprietario/sync-ical", { method: "POST" });
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
    } catch {
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
        return { bg: "bg-emerald-500", icon: "✓", label: "Completata", color: "emerald" };
      case "in_progress":
        return { bg: "bg-amber-500 animate-pulse", icon: "●", label: "In corso", color: "amber" };
      case "assigned":
        return { bg: "bg-sky-500", icon: "○", label: "Programmata", color: "sky" };
      case "not_assigned":
        return { bg: "bg-rose-500", icon: "!", label: "In attesa", color: "rose" };
      default:
        return { bg: "bg-slate-400", icon: "?", label: "Sconosciuto", color: "slate" };
    }
  };

  const navigateMonth = (direction: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + direction);
    setCurrentDate(newDate);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
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

  // Dimensioni
  const CELL_WIDTH = 52;
  const PROPERTY_COL_WIDTH = 130;
  const HEADER_HEIGHT = 52;
  const ROW_HEIGHT = 56;

  return (
    <>
      <div className="h-[calc(100vh-80px)] lg:h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 flex flex-col">
        
        {/* Toggle Lista/Calendario */}
        <div className="flex-shrink-0 p-3 pb-0">
          <div className="flex bg-slate-100 rounded-full p-1 max-w-xs mx-auto">
            <button
              onClick={() => setViewMode('list')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-full text-sm font-medium transition-all ${
                viewMode === 'list' ? 'bg-white shadow-md text-slate-800' : 'text-slate-500'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              Lista
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-full text-sm font-medium transition-all ${
                viewMode === 'calendar' ? 'bg-white shadow-md text-slate-800' : 'text-slate-500'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Calendario
            </button>
          </div>
        </div>

        {/* CALENDARIO VIEW */}
        {viewMode === 'calendar' && (
          <div className="flex-1 min-h-0 flex flex-col p-3">
            <div className="flex-1 min-h-0 bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden flex flex-col">
              
              {/* Navigation Header */}
              <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-white border-b border-slate-100">
                <button onClick={() => navigateMonth(-1)} className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200">
                  <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                
                <div className="flex items-center gap-3">
                  <h3 className="font-bold text-slate-800 text-lg capitalize">
                    {currentDate.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}
                  </h3>
                  <button onClick={goToToday} className="px-3 py-1 text-sm font-medium text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100">
                    Oggi
                  </button>
                </div>
                
                <button onClick={() => navigateMonth(1)} className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200">
                  <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {/* ========== CALENDARIO A 4 QUADRANTI ========== */}
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                
                {/* RIGA SUPERIORE: Angolo + Header Giorni */}
                <div className="flex-shrink-0 flex" style={{ height: HEADER_HEIGHT }}>
                  
                  {/* ANGOLO FISSO */}
                  <div 
                    className="flex-shrink-0 bg-slate-100 border-b border-r border-slate-200 flex items-center justify-center"
                    style={{ width: PROPERTY_COL_WIDTH, height: HEADER_HEIGHT }}
                  >
                    <span className="text-xs font-bold text-slate-500 uppercase">Proprietà</span>
                  </div>
                  
                  {/* HEADER GIORNI - scroll orizzontale nascosto, sincronizzato */}
                  <div 
                    ref={headerRef}
                    className="flex-1 overflow-hidden"
                    style={{ height: HEADER_HEIGHT }}
                  >
                    <div className="flex" style={{ width: days.length * CELL_WIDTH }}>
                      {days.map((day, index) => {
                        const isToday = day.toDateString() === today.toDateString();
                        const isSunday = day.getDay() === 0;
                        return (
                          <div 
                            key={index}
                            className={`flex-shrink-0 flex flex-col items-center justify-center border-b border-r border-slate-200 ${
                              isToday ? "bg-emerald-100" : isSunday ? "bg-rose-50" : "bg-slate-50"
                            }`}
                            style={{ width: CELL_WIDTH, height: HEADER_HEIGHT }}
                          >
                            <span className={`text-[10px] font-semibold uppercase ${
                              isToday ? "text-emerald-600" : isSunday ? "text-rose-500" : "text-slate-400"
                            }`}>
                              {dayNames[day.getDay()]}
                            </span>
                            {isToday ? (
                              <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center shadow mt-0.5">
                                <span className="text-xs font-bold text-white">{day.getDate()}</span>
                              </div>
                            ) : (
                              <span className={`text-sm font-bold mt-0.5 ${isSunday ? "text-rose-500" : "text-slate-700"}`}>
                                {day.getDate()}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* RIGA INFERIORE: Sidebar Proprietà + Griglia */}
                <div className="flex-1 min-h-0 flex overflow-hidden">
                  
                  {/* SIDEBAR PROPRIETÀ - scroll verticale nascosto, sincronizzato */}
                  <div 
                    ref={sidebarRef}
                    className="flex-shrink-0 overflow-hidden bg-white"
                    style={{ width: PROPERTY_COL_WIDTH }}
                  >
                    <div style={{ height: properties.length * ROW_HEIGHT }}>
                      {properties.map((property) => (
                        <div 
                          key={property.id}
                          className="flex items-center px-2 gap-2 border-b border-r border-slate-100 bg-white"
                          style={{ height: ROW_HEIGHT }}
                        >
                          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-sm flex-shrink-0">
                            <span className="text-white font-bold text-[10px]">
                              {property.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-slate-800 text-[11px] truncate leading-tight">{property.name}</p>
                            <p className="text-[9px] text-slate-400 truncate leading-tight">{property.address}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* GRIGLIA CELLE - scroll in entrambe le direzioni */}
                  <div 
                    ref={gridRef}
                    className="flex-1 overflow-auto"
                    onScroll={handleGridScroll}
                  >
                    <div style={{ width: days.length * CELL_WIDTH, height: properties.length * ROW_HEIGHT }}>
                      {properties.map((property) => (
                        <div key={property.id} className="flex" style={{ height: ROW_HEIGHT }}>
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
                                className={`flex-shrink-0 flex items-center justify-center border-b border-r border-slate-100 transition-all
                                  ${isToday ? "bg-emerald-50/60" : isSunday ? "bg-rose-50/40" : "bg-white"} 
                                  ${!isPast && !cleaningOnDay ? "cursor-pointer hover:bg-emerald-100/50" : ""} 
                                  ${isPast && !cleaningOnDay ? "opacity-40" : ""}`}
                                style={{ width: CELL_WIDTH, height: ROW_HEIGHT }}
                              >
                                {cleaningOnDay && (
                                  <div 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCleaningClick(cleaningOnDay, property.name);
                                    }}
                                    className={`w-10 h-10 rounded-xl ${getCleaningStyle(cleaningOnDay).bg} flex flex-col items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-transform shadow-lg`}
                                  >
                                    <span className="text-white font-bold text-sm">{getCleaningStyle(cleaningOnDay).icon}</span>
                                    {cleaningOnDay.scheduledTime && (
                                      <span className="text-white text-[8px] font-medium">{cleaningOnDay.scheduledTime}</span>
                                    )}
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

              {/* Legenda */}
              <div className="flex-shrink-0 px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-center gap-4 flex-wrap">
                <span className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span className="w-4 h-4 rounded bg-emerald-500 flex items-center justify-center"><span className="text-white text-[8px]">✓</span></span>
                  Completata
                </span>
                <span className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span className="w-4 h-4 rounded bg-amber-500 flex items-center justify-center"><span className="text-white text-[8px]">●</span></span>
                  In corso
                </span>
                <span className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span className="w-4 h-4 rounded bg-rose-500 flex items-center justify-center"><span className="text-white text-[8px]">!</span></span>
                  In attesa
                </span>
                <span className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span className="w-4 h-4 rounded bg-sky-500 flex items-center justify-center"><span className="text-white text-[8px]">○</span></span>
                  Programmata
                </span>
              </div>
            </div>
          </div>
        )}

        {/* LISTA VIEW */}
        {viewMode === 'list' && (
          <div className="flex-1 min-h-0 p-3 overflow-auto">
            <div className="grid grid-cols-4 gap-2 mb-3">
              <div className="bg-white rounded-xl border border-slate-100 p-2.5 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-violet-500 flex items-center justify-center"><span className="text-white text-sm">📋</span></div>
                  <div><p className="text-lg font-bold text-slate-800">{stats.total}</p><p className="text-[9px] text-slate-500">Totali</p></div>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-slate-100 p-2.5 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center"><span className="text-white text-sm">✓</span></div>
                  <div><p className="text-lg font-bold text-slate-800">{stats.completed}</p><p className="text-[9px] text-slate-500">Completate</p></div>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-slate-100 p-2.5 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center"><span className="text-white text-sm">⏱</span></div>
                  <div><p className="text-lg font-bold text-slate-800">{stats.today}</p><p className="text-[9px] text-slate-500">Oggi</p></div>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-slate-100 p-2.5 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-rose-500 flex items-center justify-center"><span className="text-white text-sm">!</span></div>
                  <div><p className="text-lg font-bold text-slate-800">{stats.unassigned}</p><p className="text-[9px] text-slate-500">In attesa</p></div>
                </div>
              </div>
            </div>

            <button onClick={handleSync} disabled={syncing} className="w-full mb-3 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-medium rounded-xl shadow-lg disabled:opacity-50">
              <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {syncing ? "Sincronizzazione..." : "Sincronizza iCal"}
            </button>

            {syncResult && (
              <div className="mb-3 p-3 rounded-xl text-sm bg-emerald-50 border border-emerald-200 text-emerald-700">
                <div className="flex items-center justify-between">
                  <span><strong>{syncResult.cleanings.created}</strong> pulizie create</span>
                  <button onClick={() => setSyncResult(null)} className="text-slate-400 hover:text-slate-600">✕</button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {properties.map((property) => {
                const upcomingCleanings = property.cleanings
                  .filter(c => new Date(c.date) >= today)
                  .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                  .slice(0, 5);
                
                return (
                  <div key={property.id} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-sm">
                        <span className="text-white font-bold">{property.name.charAt(0)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 truncate">{property.name}</p>
                        <p className="text-xs text-slate-500 truncate">{property.address}</p>
                      </div>
                    </div>
                    
                    {upcomingCleanings.length > 0 ? (
                      <div className="divide-y divide-slate-50">
                        {upcomingCleanings.map((cleaning) => (
                          <div key={cleaning.id} onClick={() => handleCleaningClick(cleaning, property.name)} className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50 cursor-pointer">
                            <div className={`w-10 h-10 rounded-xl ${getCleaningStyle(cleaning).bg} flex items-center justify-center shadow-md`}>
                              <span className="text-white font-bold">{getCleaningStyle(cleaning).icon}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-slate-800">{new Date(cleaning.date).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" })}</p>
                              <p className="text-xs text-slate-500">{cleaning.scheduledTime || "Orario da definire"} • {getCleaningStyle(cleaning).label}</p>
                            </div>
                            <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="px-4 py-6 text-center text-slate-400 text-sm">Nessuna pulizia programmata</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
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
                <select value={selectedPropertyId} onChange={(e) => setSelectedPropertyId(e.target.value)} className="w-full px-3 py-2 border rounded-lg" required>
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

      {/* Modal DETTAGLIO */}
      {showDetailModal && selectedCleaning && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-4 max-h-[90vh] overflow-y-auto">
            <div className={`px-5 py-4 bg-gradient-to-r sticky top-0 z-10 ${
              getCleaningStyle(selectedCleaning).color === 'emerald' ? 'from-emerald-500 to-teal-600' :
              getCleaningStyle(selectedCleaning).color === 'amber' ? 'from-amber-500 to-orange-600' :
              getCleaningStyle(selectedCleaning).color === 'sky' ? 'from-sky-500 to-blue-600' :
              getCleaningStyle(selectedCleaning).color === 'rose' ? 'from-rose-500 to-red-600' : 'from-slate-500 to-slate-600'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">Dettaglio Pulizia</h3>
                  <p className="text-white/80 text-sm">{selectedPropertyName}</p>
                </div>
                <button onClick={() => { setShowDetailModal(false); setSelectedCleaning(null); }} className="bg-white/20 hover:bg-white/30 p-2 rounded-lg">
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
              {selectedCleaning.booking && (
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                  <p className="text-xs text-slate-500 mb-1">Prenotazione collegata</p>
                  <p className="font-medium text-slate-800">{selectedCleaning.booking.guestName}</p>
                  <p className="text-sm text-slate-600">Check-out: {new Date(selectedCleaning.booking.checkOut).toLocaleDateString("it-IT")}</p>
                </div>
              )}
              
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                <p className="text-xs text-slate-500 mb-1">Data pulizia</p>
                <p className="font-medium text-slate-800">{new Date(selectedCleaning.date).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Stato</label>
                <select value={editFormData.status} onChange={(e) => setEditFormData(prev => ({ ...prev, status: e.target.value }))} className="w-full px-3 py-2 border rounded-lg">
                  <option value="not_assigned">Da assegnare</option>
                  <option value="assigned">Assegnata</option>
                  <option value="in_progress">In corso</option>
                  <option value="completed">Completata</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Orario</label>
                  <input type="time" value={editFormData.scheduledTime} onChange={(e) => setEditFormData(prev => ({ ...prev, scheduledTime: e.target.value }))} className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">N° Ospiti</label>
                  <input type="number" value={editFormData.guestsCount} onChange={(e) => setEditFormData(prev => ({ ...prev, guestsCount: parseInt(e.target.value) || 0 }))} min={1} className="w-full px-3 py-2 border rounded-lg" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Note</label>
                <textarea value={editFormData.notes} onChange={(e) => setEditFormData(prev => ({ ...prev, notes: e.target.value }))} placeholder="Note opzionali..." rows={2} className="w-full px-3 py-2 border rounded-lg resize-none" />
              </div>

              {selectedCleaning.operator && (
                <div className="bg-sky-50 rounded-xl p-3 border border-sky-200">
                  <p className="text-xs text-sky-600 mb-1">Operatore assegnato</p>
                  <p className="font-medium text-sky-800">{selectedCleaning.operator.name}</p>
                </div>
              )}

              <div className="flex gap-3 pt-4 mt-4 border-t border-slate-200">
                <button type="button" onClick={handleDelete} disabled={deleting} className="px-4 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 text-sm font-medium">
                  {deleting ? "..." : "🗑️ Elimina"}
                </button>
                <button type="button" onClick={() => { setShowDetailModal(false); setSelectedCleaning(null); }} className="flex-1 px-4 py-2.5 border text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium">Annulla</button>
                <button type="submit" disabled={loading} className="flex-1 px-4 py-2.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50 text-sm font-medium">{loading ? "..." : "💾 Salva"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
