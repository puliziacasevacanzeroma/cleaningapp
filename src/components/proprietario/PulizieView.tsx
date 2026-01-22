"use client";

import { useState, useMemo, useRef } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import NewCleaningModal from "~/components/NewCleaningModal";

interface Property {
  id: string;
  name: string;
  address: string;
}

interface Operator {
  id: string;
  name: string | null;
}

interface Cleaning {
  id: string;
  propertyId: string;
  propertyName?: string;
  date: Date;
  status: string;
  scheduledTime?: string | null;
  operator?: Operator | null;
  guestsCount?: number;
  adulti?: number;
  neonati?: number;
  notes?: string;
  bookingSource?: string;
}

interface PulizieViewProps {
  properties: Property[];
  cleanings: Cleaning[];
  operators?: Operator[];
  ownerId?: string;
  isAdmin?: boolean;
}

type ViewMode = "calendar" | "list";
type TimeFilter = "all" | "today" | "week" | "month";

const PROPERTY_COLORS = ['#8b5cf6', '#3b82f6', '#f59e0b', '#10b981', '#ec4899', '#06b6d4', '#f97316', '#84cc16'];

export function PulizieView({ properties, cleanings, operators = [], ownerId, isAdmin = false }: PulizieViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showNewCleaningModal, setShowNewCleaningModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [selectedCleaning, setSelectedCleaning] = useState<Cleaning | null>(null);
  const [adulti, setAdulti] = useState(2);
  const [neonati, setNeonati] = useState(0);
  const [savingGuests, setSavingGuests] = useState(false);

  const calendarRef = useRef<HTMLDivElement>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const filteredCleanings = useMemo(() => {
    let filtered = [...cleanings];
    const propertyIds = properties.map(p => p.id);
    filtered = filtered.filter(c => propertyIds.includes(c.propertyId));

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(c => {
        const prop = properties.find(p => p.id === c.propertyId);
        return prop?.name.toLowerCase().includes(search) || 
               c.operator?.name?.toLowerCase().includes(search);
      });
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    switch (timeFilter) {
      case "today":
        filtered = filtered.filter(c => {
          const d = new Date(c.date);
          return d.toDateString() === now.toDateString();
        });
        break;
      case "week":
        const weekEnd = new Date(now);
        weekEnd.setDate(weekEnd.getDate() + 7);
        filtered = filtered.filter(c => {
          const d = new Date(c.date);
          return d >= now && d <= weekEnd;
        });
        break;
      case "month":
        const monthEnd = new Date(now);
        monthEnd.setMonth(monthEnd.getMonth() + 1);
        filtered = filtered.filter(c => {
          const d = new Date(c.date);
          return d >= now && d <= monthEnd;
        });
        break;
    }

    return filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [cleanings, properties, timeFilter, searchTerm]);

  const groupedByDate = useMemo(() => {
    const groups: { [key: string]: Cleaning[] } = {};
    filteredCleanings.forEach(c => {
      const dateKey = new Date(c.date).toDateString();
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(c);
    });
    return groups;
  }, [filteredCleanings]);

  const stats = useMemo(() => {
    const propertyIds = properties.map(p => p.id);
    const myCleanings = cleanings.filter(c => propertyIds.includes(c.propertyId));
    
    const todayCleanings = myCleanings.filter(c => 
      new Date(c.date).toDateString() === today.toDateString()
    );
    const weekCleanings = myCleanings.filter(c => {
      const d = new Date(c.date);
      const weekEnd = new Date(today);
      weekEnd.setDate(weekEnd.getDate() + 7);
      return d >= today && d <= weekEnd;
    });
    
    return {
      today: todayCleanings.length,
      week: weekCleanings.length,
      properties: properties.length,
      completed: todayCleanings.filter(c => c.status === "COMPLETED").length,
      pending: todayCleanings.filter(c => !c.operator).length,
    };
  }, [cleanings, properties]);

  const ganttDays = useMemo(() => {
    const days = [];
    const startDate = new Date(currentDate);
    startDate.setDate(startDate.getDate() - 2);
    
    for (let i = 0; i < 10; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      days.push({
        date,
        day: date.getDate(),
        dayName: date.toLocaleDateString("it-IT", { weekday: "short" }).charAt(0).toUpperCase() + 
                 date.toLocaleDateString("it-IT", { weekday: "short" }).slice(1, 3),
        isToday: date.toDateString() === today.toDateString(),
        isSunday: date.getDay() === 0
      });
    }
    return days;
  }, [currentDate]);

  const monthName = currentDate.toLocaleDateString("it-IT", { month: "long", year: "numeric" });

  const getStatusConfig = (status: string, hasOperator: boolean) => {
    switch (status) {
      case "COMPLETED":
        return { 
          bg: "bg-gradient-to-r from-emerald-400 to-teal-500", 
          badge: "bg-emerald-100 text-emerald-700",
          label: "Completata",
          icon: "✓"
        };
      case "IN_PROGRESS":
        return { 
          bg: "bg-gradient-to-r from-amber-400 to-orange-500", 
          badge: "bg-amber-100 text-amber-700",
          label: "In corso",
          icon: "●"
        };
      case "SCHEDULED":
        if (!hasOperator) {
          return { 
            bg: "bg-gradient-to-r from-rose-400 to-red-500", 
            badge: "bg-rose-100 text-rose-700",
            label: isAdmin ? "Da assegnare" : "In attesa",
            icon: "!"
          };
        }
        return { 
          bg: "bg-gradient-to-r from-sky-400 to-blue-500", 
          badge: "bg-sky-100 text-sky-700",
          label: "Programmata",
          icon: "○"
        };
      default:
        return { 
          bg: "bg-gradient-to-r from-slate-400 to-slate-500", 
          badge: "bg-slate-100 text-slate-700",
          label: status,
          icon: "?"
        };
    }
  };

  const getInitials = (name: string | null) => {
    if (!name) return "??";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const openGuestModal = (cleaning: Cleaning) => {
    setSelectedCleaning(cleaning);
    setAdulti(cleaning.adulti || Math.max(1, (cleaning.guestsCount || 2) - (cleaning.neonati || 0)));
    setNeonati(cleaning.neonati || 0);
    setShowGuestModal(true);
  };

  const saveGuests = async () => {
    if (!selectedCleaning) return;
    
    setSavingGuests(true);
    try {
      const cleaningRef = doc(db, "cleanings", selectedCleaning.id);
      await updateDoc(cleaningRef, {
        guestsCount: adulti + neonati,
        adulti: adulti,
        neonati: neonati,
        updatedAt: new Date()
      });
      setShowGuestModal(false);
    } catch (error) {
      console.error("Errore salvataggio ospiti:", error);
      alert("Errore nel salvataggio");
    } finally {
      setSavingGuests(false);
    }
  };

  const navigateCalendar = (days: number) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + days);
    setCurrentDate(newDate);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      
      {/* HEADER */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700"></div>
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-pink-500/20 rounded-full blur-2xl -ml-8 -mb-8"></div>
        
        <div className="relative px-4 pt-4 pb-5">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/20">
                  <span className="text-xl">✨</span>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">
                    {isAdmin ? "Gestione Pulizie" : "Le Mie Pulizie"}
                  </h1>
                  <p className="text-violet-200 text-xs">
                    {isAdmin ? "Gestisci tutte le pulizie" : "Gestisci le pulizie delle tue proprietà"}
                  </p>
                </div>
              </div>
              <button className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/20">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3 border border-white/10">
                <p className="text-violet-200 text-[10px] font-medium">Oggi</p>
                <p className="text-2xl font-bold text-white">{stats.today}</p>
              </div>
              <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3 border border-white/10">
                <p className="text-violet-200 text-[10px] font-medium">Settimana</p>
                <p className="text-2xl font-bold text-white">{stats.week}</p>
              </div>
              <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3 border border-white/10">
                <p className="text-violet-200 text-[10px] font-medium">Proprietà</p>
                <p className="text-2xl font-bold text-white">{stats.properties}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => setViewMode("list")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-semibold text-sm transition-all ${
                viewMode === "list" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              Lista
            </button>
            <button
              onClick={() => setViewMode("calendar")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-semibold text-sm transition-all ${
                viewMode === "calendar" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Calendario
            </button>
          </div>
        </div>
      </div>

      {/* FILTERS */}
      <div className="bg-white border-b border-slate-200 px-4 py-3">
        <div className="max-w-4xl mx-auto space-y-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {[
              { key: "today" as TimeFilter, label: "Oggi" },
              { key: "week" as TimeFilter, label: "7 giorni" },
              { key: "month" as TimeFilter, label: "30 giorni" },
              { key: "all" as TimeFilter, label: "Tutte" },
            ].map(filter => (
              <button
                key={filter.key}
                onClick={() => setTimeFilter(filter.key)}
                className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap ${
                  timeFilter === filter.key ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
          
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Cerca proprietà..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div className="px-4 py-4">
        <div className="max-w-4xl mx-auto">
          
          {viewMode === "list" && (
            <div className="space-y-5">
              {Object.keys(groupedByDate).length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-100 flex items-center justify-center">
                    <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-800 mb-1">Nessuna pulizia trovata</h3>
                  <p className="text-slate-500 text-sm">Non ci sono pulizie per il periodo selezionato</p>
                </div>
              ) : (
                Object.entries(groupedByDate).map(([dateKey, dayCleanings]) => {
                  const date = new Date(dateKey);
                  const isToday = date.toDateString() === today.toDateString();
                  const dateLabel = isToday ? "Oggi" : date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
                  
                  return (
                    <div key={dateKey}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`px-3 py-1 rounded-lg font-semibold text-sm ${isToday ? "bg-violet-500 text-white" : "bg-slate-200 text-slate-700"}`}>
                          {dateLabel}
                        </div>
                        <div className="flex-1 h-px bg-slate-200"></div>
                        <span className="text-xs text-slate-400">{dayCleanings.length} pulizie</span>
                      </div>

                      <div className="space-y-3">
                        {dayCleanings.map((cleaning) => {
                          const property = properties.find(p => p.id === cleaning.propertyId);
                          const status = getStatusConfig(cleaning.status, !!cleaning.operator);
                          
                          return (
                            <div key={cleaning.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                              <div className={`h-1 ${status.bg}`}></div>
                              
                              <div className="p-4">
                                <div className="flex items-start justify-between mb-3">
                                  <div className="flex items-center gap-3">
                                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                                      <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                      </svg>
                                    </div>
                                    <div>
                                      <h3 className="font-bold text-slate-800 text-sm">{property?.name || cleaning.propertyName}</h3>
                                      <p className="text-xs text-slate-500">{property?.address}</p>
                                    </div>
                                  </div>
                                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${status.badge}`}>
                                    {status.label}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2 mb-3">
                                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 rounded-lg">
                                    <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span className="text-xs font-medium text-slate-700">{cleaning.scheduledTime || "TBD"}</span>
                                  </div>
                                  
                                  <button 
                                    onClick={() => openGuestModal(cleaning)}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-violet-50 rounded-lg border border-violet-200 hover:bg-violet-100 transition-colors"
                                  >
                                    <svg className="w-3.5 h-3.5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                    </svg>
                                    <span className="text-xs font-medium text-violet-700">{cleaning.guestsCount || 2} ospiti</span>
                                    <svg className="w-3 h-3 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                  </button>
                                </div>

                                <div className="flex items-center justify-between">
                                  {cleaning.operator ? (
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 shadow-sm">
                                      <div className="w-5 h-5 rounded-md bg-white/20 flex items-center justify-center">
                                        <span className="text-[10px] font-bold text-white">{getInitials(cleaning.operator.name)}</span>
                                      </div>
                                      <span className="text-xs font-medium text-white">{cleaning.operator.name}</span>
                                    </div>
                                  ) : isAdmin ? (
                                    <button className="flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 border-dashed border-slate-300 text-slate-500">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                      </svg>
                                      <span className="text-xs font-medium">Assegna</span>
                                    </button>
                                  ) : (
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-500">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      </svg>
                                      <span className="text-xs font-medium">In attesa di assegnazione</span>
                                    </div>
                                  )}

                                  <button className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-xl">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                    <span className="text-xs font-medium">Dettagli</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {viewMode === "calendar" && (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-slate-200">
              
              <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
                <button 
                  onClick={() => navigateCalendar(-7)}
                  className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-800 capitalize">{monthName}</h3>
                  <button
                    onClick={() => setCurrentDate(new Date())}
                    className="px-2 py-1 text-[10px] font-medium text-violet-600 bg-violet-50 rounded-md"
                  >
                    Oggi
                  </button>
                </div>
                <button 
                  onClick={() => navigateCalendar(7)}
                  className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              <div ref={calendarRef} className="overflow-x-auto">
                <div className="grid grid-cols-10 border-b-2 border-slate-200 bg-slate-50 min-w-[600px]">
                  {ganttDays.map((day, i) => (
                    <div key={i} className={`py-2 text-center border-r border-slate-200 last:border-r-0 ${day.isToday ? "bg-emerald-100" : ""}`}>
                      <div className={`text-[9px] font-semibold ${day.isToday ? "text-emerald-600" : day.isSunday ? "text-rose-400" : "text-slate-400"}`}>
                        {day.dayName}
                      </div>
                      {day.isToday ? (
                        <div className="w-7 h-7 mx-auto rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center mt-0.5 shadow">
                          {day.day}
                        </div>
                      ) : (
                        <div className={`text-xs font-bold mt-0.5 ${day.isSunday ? "text-rose-400" : "text-slate-700"}`}>
                          {day.day}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {properties.length === 0 ? (
                  <div className="p-8 text-center text-slate-500">Nessuna proprietà</div>
                ) : (
                  properties.map((property, propIndex) => {
                    const propertyColor = PROPERTY_COLORS[propIndex % PROPERTY_COLORS.length];
                    const propertyCleanings = cleanings.filter(c => c.propertyId === property.id);
                    
                    return (
                      <div key={property.id} className="relative h-[70px] border-b-2 border-slate-200 last:border-b-0 min-w-[600px]">
                        
                        <div 
                          className="absolute top-0 left-0 z-20 h-5 flex items-center gap-1 pl-1 pr-3 rounded-br-lg shadow-sm"
                          style={{ backgroundColor: propertyColor }}
                        >
                          <div className="w-3.5 h-3.5 rounded bg-white/20 flex items-center justify-center">
                            <span className="text-white text-[7px] font-bold">{property.name.charAt(0)}</span>
                          </div>
                          <span className="text-white text-[9px] font-semibold truncate max-w-[120px]">{property.name}</span>
                          <span className="text-white/70 text-[7px] truncate max-w-[80px] hidden sm:inline">{property.address}</span>
                        </div>

                        <div className="absolute inset-0 grid grid-cols-10">
                          {ganttDays.map((day, i) => (
                            <div key={i} className={`border-r border-slate-200 last:border-r-0 ${day.isToday ? "bg-emerald-50" : ""}`} />
                          ))}
                        </div>

                        {propertyCleanings.map((cleaning) => {
                          const cleaningDate = new Date(cleaning.date);
                          const dayIndex = ganttDays.findIndex(d => d.date.toDateString() === cleaningDate.toDateString());
                          if (dayIndex === -1) return null;
                          const status = getStatusConfig(cleaning.status, !!cleaning.operator);
                          
                          return (
                            <div
                              key={cleaning.id}
                              className={`absolute top-5 ${status.bg} rounded-lg shadow-lg flex flex-col items-center justify-center cursor-pointer hover:scale-105 transition-transform z-10`}
                              style={{ left: `calc(${dayIndex * 10}% + 3px)`, width: "calc(10% - 6px)", height: "42px" }}
                              onClick={() => openGuestModal(cleaning)}
                            >
                              <span className="text-white font-bold text-sm drop-shadow">{status.icon}</span>
                              <span className="text-white text-[9px] font-medium">{cleaning.scheduledTime || "TBD"}</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="p-3 border-t border-slate-200 bg-slate-50">
                <div className="flex flex-wrap justify-center gap-3 text-[10px]">
                  {[
                    { bg: "from-emerald-400 to-teal-500", label: "Completata", icon: "✓" },
                    { bg: "from-amber-400 to-orange-500", label: "In corso", icon: "●" },
                    { bg: "from-rose-400 to-red-500", label: isAdmin ? "Da assegnare" : "In attesa", icon: "!" },
                    { bg: "from-sky-400 to-blue-500", label: "Programmata", icon: "○" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <div className={`w-4 h-4 rounded bg-gradient-to-r ${item.bg} flex items-center justify-center text-white text-[8px] font-bold shadow`}>
                        {item.icon}
                      </div>
                      <span className="text-slate-600">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {isAdmin && (
        <button 
          onClick={() => setShowNewCleaningModal(true)}
          className="fixed bottom-20 right-4 w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-500/40 flex items-center justify-center z-40"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      )}

      {showGuestModal && selectedCleaning && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
          <div className="bg-white rounded-t-3xl w-full max-w-lg p-6 animate-[slideUp_0.3s_ease-out]">
            <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mb-4"></div>
            
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-800">Numero ospiti</h3>
              <button 
                onClick={() => { setAdulti(selectedCleaning?.adulti || 2); setNeonati(selectedCleaning?.neonati || 0); }}
                className="text-sm text-slate-400"
              >
                Reset
              </button>
            </div>

            <div className="flex items-center justify-between py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <span className="font-medium text-slate-800">Adulti</span>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setAdulti(Math.max(1, adulti - 1))} className="w-10 h-10 rounded-full border-2 border-slate-200 flex items-center justify-center text-slate-400">
                  <span className="text-xl">−</span>
                </button>
                <span className="text-xl font-bold text-slate-800 w-8 text-center">{adulti}</span>
                <button onClick={() => setAdulti(adulti + 1)} className="w-10 h-10 rounded-full bg-violet-500 flex items-center justify-center text-white shadow-lg">
                  <span className="text-xl">+</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <div>
                  <span className="font-medium text-slate-800">Neonati</span>
                  <p className="text-xs text-slate-400">0-2 anni</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setNeonati(Math.max(0, neonati - 1))} className="w-10 h-10 rounded-full border-2 border-slate-200 flex items-center justify-center text-slate-400">
                  <span className="text-xl">−</span>
                </button>
                <span className="text-xl font-bold text-slate-800 w-8 text-center">{neonati}</span>
                <button onClick={() => setNeonati(neonati + 1)} className="w-10 h-10 rounded-full bg-rose-500 flex items-center justify-center text-white shadow-lg">
                  <span className="text-xl">+</span>
                </button>
              </div>
            </div>

            <div className="mt-4 p-4 bg-slate-50 rounded-2xl">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-slate-500">Anteprima</span>
                <span className="text-sm font-semibold text-slate-800">{adulti + neonati} ospiti</span>
              </div>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {Array.from({ length: adulti }).map((_, i) => (
                  <div key={`a-${i}`} className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-violet-200"></div>
                    <div className="w-6 h-8 rounded-t-lg bg-violet-400 -mt-1"></div>
                  </div>
                ))}
                {Array.from({ length: neonati }).map((_, i) => (
                  <div key={`b-${i}`} className="flex flex-col items-center">
                    <div className="w-6 h-6 rounded-full bg-rose-200"></div>
                    <div className="w-5 h-6 rounded-t-lg bg-rose-400 -mt-1"></div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowGuestModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-700 font-semibold rounded-2xl">
                Annulla
              </button>
              <button onClick={saveGuests} disabled={savingGuests} className="flex-1 py-4 bg-slate-800 text-white font-semibold rounded-2xl disabled:opacity-50">
                {savingGuests ? "Salvataggio..." : "Conferma"}
              </button>
            </div>
          </div>
        </div>
      )}

      <NewCleaningModal
        isOpen={showNewCleaningModal}
        onClose={() => setShowNewCleaningModal(false)}
        onSuccess={() => { setShowNewCleaningModal(false); window.location.reload(); }}
        userRole={isAdmin ? "ADMIN" : "PROPRIETARIO"}
        ownerId={ownerId}
      />
    </div>
  );
}
