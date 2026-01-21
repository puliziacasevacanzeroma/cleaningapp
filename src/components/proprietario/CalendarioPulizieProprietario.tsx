"use client";

import { useState, useMemo } from "react";
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
  date: Date;
  status: string;
  scheduledTime?: string | null;
  operator?: Operator | null;
}

interface CalendarioPulizieProprietarioProps {
  properties: Property[];
  cleanings: Cleaning[];
}

export function CalendarioPulizieProprietario({ properties, cleanings }: CalendarioPulizieProprietarioProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showNewCleaningModal, setShowNewCleaningModal] = useState(false);
  const [modalRequestType, setModalRequestType] = useState<"cleaning" | "linen_only">("cleaning");
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Genera i giorni del mese
  const daysInMonth = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const lastDay = new Date(year, month + 1, 0);
    const days = [];
    
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month, d);
      days.push({
        date,
        day: d,
        dayName: date.toLocaleDateString("it-IT", { weekday: "short" }).slice(0, 3),
        isToday: date.toDateString() === today.toDateString(),
        isSunday: date.getDay() === 0
      });
    }
    return days;
  }, [currentDate]);

  const monthName = currentDate.toLocaleDateString("it-IT", { month: "long", year: "numeric" });

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  // Statistiche
  const stats = useMemo(() => {
    const todayCleanings = cleanings.filter(c => {
      const cleaningDate = new Date(c.date);
      return cleaningDate.toDateString() === today.toDateString();
    });
    
    return {
      today: todayCleanings.length,
      inProgress: todayCleanings.filter(c => c.status === "in_progress").length,
      completed: todayCleanings.filter(c => c.status === "completed").length,
      notAssigned: todayCleanings.filter(c => c.status === "not_assigned" || !c.operator).length
    };
  }, [cleanings]);

  // Pulizie di oggi per la lista sotto
  const todayCleanings = useMemo(() => {
    return cleanings.filter(c => {
      const cleaningDate = new Date(c.date);
      return cleaningDate.toDateString() === today.toDateString();
    });
  }, [cleanings]);

  // Colori proprietà
  const propertyColors = [
    { bg: "from-rose-100 to-rose-200", icon: "text-rose-500" },
    { bg: "from-sky-100 to-sky-200", icon: "text-sky-500" },
    { bg: "from-amber-100 to-amber-200", icon: "text-amber-500" },
    { bg: "from-violet-100 to-violet-200", icon: "text-violet-500" },
    { bg: "from-emerald-100 to-emerald-200", icon: "text-emerald-500" },
    { bg: "from-pink-100 to-pink-200", icon: "text-pink-500" },
    { bg: "from-cyan-100 to-cyan-200", icon: "text-cyan-500" },
  ];

  // Ottieni iniziali operatore
  const getInitials = (name: string | null) => {
    if (!name) return "??";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  // Stile pulizia basato sullo stato
  const getCleaningStyle = (cleaning: Cleaning, dayIndex: number) => {
    const cleaningDate = new Date(cleaning.date);
    if (cleaningDate.getDate() !== daysInMonth[dayIndex]?.day || 
        cleaningDate.getMonth() !== currentDate.getMonth()) {
      return null;
    }

    const left = dayIndex * 48 + 4;
    
    let colorClass = "from-sky-400 to-blue-500"; // Programmata
    let icon = cleaning.operator ? getInitials(cleaning.operator.name) : "?";
    
    if (cleaning.status === "completed") {
      colorClass = "from-emerald-400 to-teal-500";
      icon = "✓";
    } else if (cleaning.status === "in_progress") {
      colorClass = "from-amber-400 to-orange-500";
      icon = "🕐";
    } else if (cleaning.status === "not_assigned" || !cleaning.operator) {
      colorClass = "from-rose-400 to-red-500";
      icon = "!";
    }
    
    return { left: `${left}px`, colorClass, icon };
  };

  return (
    <div className="p-6 overflow-x-hidden">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Pulizie Oggi</p>
              <p className="text-2xl font-bold text-slate-800">{stats.today}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">In Corso</p>
              <p className="text-2xl font-bold text-slate-800">{stats.inProgress}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Completate</p>
              <p className="text-2xl font-bold text-slate-800">{stats.completed}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">In Attesa</p>
              <p className="text-2xl font-bold text-slate-800">{stats.notAssigned}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-400 to-red-500 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 bg-white rounded-xl border border-slate-200 p-1 shadow-sm">
            <button onClick={prevMonth} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
              <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button onClick={nextMonth} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
              <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <h2 className="text-xl lg:text-2xl font-bold text-slate-800 capitalize">{monthName}</h2>
        </div>
        
        {/* Pulsanti Azione */}
        <div className="flex gap-2">
          <button
            onClick={() => { setModalRequestType("linen_only"); setShowNewCleaningModal(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-medium text-sm hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-95 shadow-sm"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 18V12C3 11 4 10 5 10H19C20 10 21 11 21 12V18M3 20V18M21 20V18M6 10V7C6 6 7 5 8 5H16C17 5 18 6 18 7V10" />
            </svg>
            <span className="hidden sm:inline">Richiedi Biancheria</span>
          </button>
          <button
            onClick={() => { setModalRequestType("cleaning"); setShowNewCleaningModal(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-sky-500 to-sky-600 text-white rounded-xl font-medium text-sm hover:from-sky-600 hover:to-sky-700 transition-all active:scale-95 shadow-md"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:inline">Nuova Pulizia</span>
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-gradient-to-r from-emerald-400 to-teal-500"></div>
          <span className="text-sm text-slate-600">Completata</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-gradient-to-r from-amber-400 to-orange-500"></div>
          <span className="text-sm text-slate-600">In corso</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-gradient-to-r from-sky-400 to-blue-500"></div>
          <span className="text-sm text-slate-600">Programmata</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-gradient-to-r from-rose-400 to-red-500"></div>
          <span className="text-sm text-slate-600">In attesa</span>
        </div>
      </div>

      {/* GANTT CHART */}
      <div className="flex border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-lg">
        {/* LEFT: Properties - FIXED */}
        <div className="flex-shrink-0 w-[200px] bg-white border-r-2 border-slate-200 z-10">
          {/* Header */}
          <div className="h-14 flex items-center px-4 bg-slate-50 border-b-2 border-slate-200">
            <span className="font-semibold text-slate-700 text-sm">Proprietà</span>
          </div>
          
          {/* Properties */}
          {properties.length === 0 ? (
            <div className="h-[60px] flex items-center justify-center px-4 text-slate-400 text-sm">
              Nessuna proprietà
            </div>
          ) : (
            properties.map((property, index) => {
              const colorSet = propertyColors[index % propertyColors.length];
              return (
                <div key={property.id} className="h-[60px] flex items-center px-3 border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${colorSet.bg} flex items-center justify-center mr-2 flex-shrink-0`}>
                    <svg className={`w-4 h-4 ${colorSet.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 text-xs truncate">{property.name}</p>
                    <p className="text-[10px] text-slate-500 truncate">{property.address}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* RIGHT: Calendar - SCROLLABLE SOLO QUI */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden" style={{ scrollbarWidth: "thin" }}>
          <div style={{ minWidth: `${daysInMonth.length * 48}px` }}>
            {/* Days Header */}
            <div className="h-14 flex bg-slate-50 border-b-2 border-slate-200">
              {daysInMonth.map((day, index) => (
                <div 
                  key={index}
                  className={`w-12 flex-shrink-0 flex flex-col items-center justify-center border-r border-slate-100 ${day.isToday ? "bg-emerald-50" : day.isSunday ? "bg-slate-50/50" : ""}`}
                >
                  <span className={`text-[10px] ${day.isToday ? "text-emerald-600 font-semibold" : "text-slate-400"}`}>{day.dayName}</span>
                  {day.isToday ? (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow">
                      <span className="text-sm font-bold text-white">{day.day}</span>
                    </div>
                  ) : (
                    <span className="text-sm font-bold text-slate-700">{day.day}</span>
                  )}
                </div>
              ))}
            </div>

            {/* Rows */}
            {properties.length === 0 ? (
              <div className="h-[60px] flex items-center justify-center text-slate-400">
                Aggiungi proprietà per visualizzare il calendario
              </div>
            ) : (
              properties.map((property) => {
                const propertyCleanings = cleanings.filter(c => c.propertyId === property.id);
                
                return (
                  <div key={property.id} className="h-[60px] flex border-b border-slate-100 relative">
                    {/* Day columns background */}
                    {daysInMonth.map((day, index) => (
                      <div 
                        key={index}
                        className={`w-12 flex-shrink-0 border-r border-slate-50 ${day.isToday ? "bg-emerald-50/50" : day.isSunday ? "bg-slate-50/30" : ""}`}
                      />
                    ))}
                    
                    {/* Cleaning bars */}
                    {daysInMonth.map((day, dayIndex) => {
                      const cleaning = propertyCleanings.find(c => {
                        const cleaningDate = new Date(c.date);
                        return cleaningDate.getDate() === day.day && 
                               cleaningDate.getMonth() === currentDate.getMonth() &&
                               cleaningDate.getFullYear() === currentDate.getFullYear();
                      });
                      
                      if (!cleaning) return null;
                      
                      const style = getCleaningStyle(cleaning, dayIndex);
                      if (!style) return null;
                      
                      return (
                        <div
                          key={`${cleaning.id}-${dayIndex}`}
                          className={`absolute top-2 bottom-2 w-10 rounded-lg bg-gradient-to-r ${style.colorClass} flex items-center justify-center cursor-pointer shadow-md hover:scale-y-110 hover:brightness-105 transition-all`}
                          style={{ left: style.left }}
                          title={`${property.name} - ${cleaning.scheduledTime || "Da definire"} - ${cleaning.operator?.name || "Non assegnato"}`}
                        >
                          <span className={`text-xs ${style.icon.length > 2 ? "" : "font-bold text-white"}`}>{style.icon}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Today's Cleanings */}
      <div className="mt-8">
        <h3 className="text-lg font-bold text-slate-800 mb-4">
          Pulizie di Oggi - {today.toLocaleDateString("it-IT", { day: "numeric", month: "long" })}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {todayCleanings.length === 0 ? (
            <div className="col-span-full bg-white rounded-xl border border-slate-200 p-8 text-center">
              <p className="text-slate-500">Nessuna pulizia programmata per oggi</p>
            </div>
          ) : (
            todayCleanings.map((cleaning) => {
              const property = properties.find(p => p.id === cleaning.propertyId);
              let borderColor = "border-slate-200";
              let statusText = "Programmata";
              let statusColor = "text-slate-600";
              let iconBg = "from-sky-400 to-blue-500";
              let icon = (
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              );
              
              if (cleaning.status === "completed") {
                borderColor = "border-emerald-200";
                statusText = "Completata";
                statusColor = "text-emerald-600";
                iconBg = "from-emerald-400 to-teal-500";
                icon = (
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                );
              } else if (cleaning.status === "in_progress") {
                borderColor = "border-amber-200";
                statusText = "In corso";
                statusColor = "text-amber-600";
                iconBg = "from-amber-400 to-orange-500";
                icon = (
                  <svg className="w-5 h-5 text-white animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                );
              } else if (cleaning.status === "not_assigned" || !cleaning.operator) {
                borderColor = "border-rose-200";
                statusText = "In attesa";
                statusColor = "text-rose-600";
                iconBg = "from-rose-400 to-red-500";
                icon = (
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                );
              }
              
              return (
                <div key={cleaning.id} className={`bg-white rounded-xl border ${borderColor} p-4 shadow-sm hover:shadow-md transition-shadow`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${iconBg} flex items-center justify-center`}>
                        {icon}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800">{property?.name || "Proprietà"}</p>
                        <p className={`text-xs ${statusColor} font-medium`}>{cleaning.scheduledTime || "Orario da definire"} - {statusText}</p>
                      </div>
                    </div>
                  </div>
                  {cleaning.operator ? (
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
                        <span className="text-[10px] font-bold text-white">{getInitials(cleaning.operator.name)}</span>
                      </div>
                      <span className="text-sm text-slate-600">{cleaning.operator.name}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-rose-500">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span>In attesa di assegnazione</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Modal Nuova Pulizia / Richiedi Biancheria */}
      <NewCleaningModal
        isOpen={showNewCleaningModal}
        onClose={() => setShowNewCleaningModal(false)}
        onSuccess={() => { setShowNewCleaningModal(false); window.location.reload(); }}
        userRole="PROPRIETARIO"
        defaultRequestType={modalRequestType}
      />
    </div>
  );
}
