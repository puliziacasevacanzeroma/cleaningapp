"use client";

import { useState, useMemo, useEffect, useRef } from "react";

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
  scheduledDate: Date | string;
  status: string;
  scheduledTime?: string | null;
  operator?: Operator | null;
}

interface CalendarioPulizieProps {
  properties: Property[];
  cleanings: Cleaning[];
  operators: Operator[];
}

export function CalendarioPulizieClient({ properties, cleanings, operators }: CalendarioPulizieProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedOperator, setSelectedOperator] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<string>("next_cleaning");
  const calendarRef = useRef<HTMLDivElement>(null);

  const today = new Date();
  const todayDay = today.getDate();
  const todayMonth = today.getMonth();
  const todayYear = today.getFullYear();
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  // Scroll automatico al giorno di oggi
  useEffect(() => {
    if (calendarRef.current && currentMonth === todayMonth && currentYear === todayYear) {
      const dayWidth = 48;
      const scrollPosition = (todayDay - 1) * dayWidth - 100;
      calendarRef.current.scrollLeft = Math.max(0, scrollPosition);
    }
  }, [currentMonth, currentYear, todayDay, todayMonth, todayYear]);

  // Genera i giorni del mese
  const daysInMonth = useMemo(() => {
    const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
    const days = [];
    for (let d = 1; d <= lastDay; d++) {
      const date = new Date(currentYear, currentMonth, d);
      const isToday = d === todayDay && currentMonth === todayMonth && currentYear === todayYear;
      days.push({
        day: d,
        dayName: date.toLocaleDateString("it-IT", { weekday: "short" }).slice(0, 3),
        isToday,
        isSunday: date.getDay() === 0
      });
    }
    return days;
  }, [currentMonth, currentYear, todayDay, todayMonth, todayYear]);

  // Prossima pulizia per proprietà
  const getNextCleaning = (propertyId: string) => {
    const propertyCleanings = cleanings.filter(c => c.propertyId === propertyId);
    const futureCleanings = propertyCleanings.filter(c => {
      const cleaningDate = new Date(c.scheduledDate);
      return cleaningDate >= today;
    });
    if (futureCleanings.length === 0) return null;
    return futureCleanings.sort((a, b) => 
      new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
    )[0];
  };

  // Filtra e ordina proprietà
  const filteredProperties = useMemo(() => {
    let filtered = properties.filter(p => {
      const matchesSearch = searchTerm === "" ||
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.address.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSearch;
    });

    if (sortBy === "name") {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "next_cleaning") {
      filtered.sort((a, b) => {
        const nextA = getNextCleaning(a.id);
        const nextB = getNextCleaning(b.id);
        if (!nextA && !nextB) return 0;
        if (!nextA) return 1;
        if (!nextB) return -1;
        return new Date(nextA.scheduledDate).getTime() - new Date(nextB.scheduledDate).getTime();
      });
    }
    return filtered;
  }, [properties, searchTerm, sortBy, cleanings]);

  // Statistiche
  const stats = useMemo(() => {
    const todayCleanings = cleanings.filter(c => {
      const cleaningDate = new Date(c.scheduledDate);
      return cleaningDate.toDateString() === today.toDateString();
    });
    return {
      today: todayCleanings.length,
      inProgress: todayCleanings.filter(c => c.status === "IN_PROGRESS").length,
      completed: todayCleanings.filter(c => c.status === "COMPLETED").length,
      notAssigned: todayCleanings.filter(c => c.status === "PENDING" || !c.operator).length
    };
  }, [cleanings]);

  const monthName = currentDate.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  const prevMonth = () => setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  const goToToday = () => setCurrentDate(new Date());

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

  const getInitials = (name: string | null) => {
    if (!name) return "??";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const totalWidth = 220 + daysInMonth.length * 48;

  return (
    <div className="bg-gradient-to-br from-slate-50 via-white to-emerald-50/30">
      {/* TITOLO - scorre via */}
      <div className="p-6 pb-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-emerald-500/30 transform hover:scale-105 transition-transform">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-800 via-slate-700 to-slate-600 bg-clip-text text-transparent">
                Calendario Pulizie
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">Organizza e monitora tutte le pulizie</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button className="group px-5 py-2.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 text-white rounded-xl font-medium shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/30 hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Nuova Pulizia</span>
            </button>

            <div className="flex items-center bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200 p-1 shadow-lg shadow-slate-200/50">
              <button onClick={prevMonth} className="p-2.5 hover:bg-slate-100 rounded-lg transition-all hover:scale-105 active:scale-95">
                <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button onClick={goToToday} className="px-4 py-1 font-bold text-slate-700 capitalize text-lg hover:text-emerald-600 transition-colors">
                {monthName}
              </button>
              <button onClick={nextMonth} className="p-2.5 hover:bg-slate-100 rounded-lg transition-all hover:scale-105 active:scale-95">
                <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <div className="bg-white/80 backdrop-blur rounded-xl border border-slate-200/60 p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Pulizie Oggi</p>
                <p className="text-2xl font-bold text-slate-800">{stats.today}</p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
          </div>
          <div className="bg-white/80 backdrop-blur rounded-xl border border-slate-200/60 p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">In Corso</p>
                <p className="text-2xl font-bold text-slate-800">{stats.inProgress}</p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
          <div className="bg-white/80 backdrop-blur rounded-xl border border-slate-200/60 p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Completate</p>
                <p className="text-2xl font-bold text-slate-800">{stats.completed}</p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
          <div className="bg-white/80 backdrop-blur rounded-xl border border-slate-200/60 p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Da Assegnare</p>
                <p className="text-2xl font-bold text-slate-800">{stats.notAssigned}</p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-rose-400 to-red-500 flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CONTROLLI STICKY */}
      <div className="sticky top-0 z-40 bg-gradient-to-r from-white via-slate-50 to-white border-y border-slate-200/50 shadow-md backdrop-blur-sm">
        <div className="px-6 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[280px] group">
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-teal-500 rounded-xl opacity-0 group-focus-within:opacity-100 blur transition-opacity -z-10 scale-105"></div>
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Cerca proprietà..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-400 transition-all"
              />
            </div>
            <select
              value={selectedOperator}
              onChange={(e) => setSelectedOperator(e.target.value)}
              className="px-4 py-3 rounded-xl bg-white/90 backdrop-blur border border-slate-200/80 text-sm text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-300 transition-all cursor-pointer hover:bg-white hover:shadow-md"
            >
              <option value="all">Tutti gli operatori</option>
              {operators.map(op => (
                <option key={op.id} value={op.id}>{op.name}</option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-3 rounded-xl bg-white/90 backdrop-blur border border-slate-200/80 text-sm text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-300 transition-all cursor-pointer hover:bg-white hover:shadow-md"
            >
              <option value="next_cleaning">Prossima pulizia</option>
              <option value="name">Ordine alfabetico</option>
            </select>
          </div>

          <div className="flex flex-wrap gap-3 mt-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-default">
              <div className="w-3 h-3 rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 shadow-sm shadow-emerald-500/50"></div>
              <span className="text-sm font-medium text-slate-600">Completata</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-default">
              <div className="w-3 h-3 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 shadow-sm shadow-amber-500/50"></div>
              <span className="text-sm font-medium text-slate-600">In corso</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-default">
              <div className="w-3 h-3 rounded-full bg-gradient-to-r from-sky-400 to-blue-500 shadow-sm shadow-sky-500/50"></div>
              <span className="text-sm font-medium text-slate-600">Programmata</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-default">
              <div className="w-3 h-3 rounded-full bg-gradient-to-r from-rose-400 to-red-500 shadow-sm shadow-rose-500/50"></div>
              <span className="text-sm font-medium text-slate-600">Da assegnare</span>
            </div>
          </div>
        </div>
      </div>

      {/* CALENDARIO */}
      <div className="px-4 pb-4 pt-4">
        <div 
          ref={calendarRef}
          className="border border-slate-200 rounded-2xl bg-white shadow-xl shadow-slate-200/50 overflow-auto"
          style={{ scrollbarWidth: "thin", maxHeight: "calc(100vh - 160px)" }}
        >
          <div style={{ minWidth: `${totalWidth}px` }}>
            {/* Header sticky */}
            <div className="flex sticky top-0 z-20 bg-gradient-to-b from-white to-slate-50 border-b-2 border-slate-200">
              <div className="w-[220px] flex-shrink-0 h-12 flex items-center px-3 bg-gradient-to-r from-slate-100 to-slate-50 border-r-2 border-slate-200 sticky left-0 z-30">
                <span className="font-bold text-slate-700 text-sm">Proprietà</span>
              </div>
              <div className="flex">
                {daysInMonth.map((day, index) => (
                  <div
                    key={index}
                    className={`w-12 flex-shrink-0 h-12 flex flex-col items-center justify-center border-r border-slate-100 transition-colors ${day.isToday ? "bg-gradient-to-b from-emerald-100 to-emerald-50" : day.isSunday ? "bg-slate-50/80" : "bg-gradient-to-b from-white to-slate-50/50"}`}
                  >
                    <span className={`text-[10px] font-medium ${day.isToday ? "text-emerald-600" : "text-slate-400"}`}>{day.dayName}</span>
                    {day.isToday ? (
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/40">
                        <span className="text-xs font-bold text-white">{day.day}</span>
                      </div>
                    ) : (
                      <span className={`text-sm font-bold ${day.isSunday ? "text-rose-400" : "text-slate-700"}`}>{day.day}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Righe proprietà */}
            {filteredProperties.map((property, index) => {
              const colorSet = propertyColors[index % propertyColors.length];
              const propertyCleanings = cleanings.filter(c => c.propertyId === property.id);

              return (
                <div key={property.id} className="flex border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                  <div className="w-[220px] flex-shrink-0 h-[50px] flex items-center px-2 bg-white border-r-2 border-slate-200 sticky left-0 z-10 hover:bg-slate-50 transition-colors">
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${colorSet.bg} flex items-center justify-center mr-2 flex-shrink-0 shadow-sm`}>
                      <svg className={`w-4 h-4 ${colorSet.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 text-xs truncate">{property.name}</p>
                      <p className="text-[10px] text-slate-500 truncate">{property.address}</p>
                    </div>
                  </div>

                  <div className="flex relative h-[50px]">
                    {daysInMonth.map((day, dayIndex) => (
                      <div
                        key={dayIndex}
                        className={`w-12 flex-shrink-0 border-r border-slate-50 ${day.isToday ? "bg-emerald-50/50" : day.isSunday ? "bg-slate-50/30" : ""}`}
                      />
                    ))}

                    {/* Pulizie */}
                    {propertyCleanings.map((cleaning) => {
                      const cleaningDate = new Date(cleaning.scheduledDate);
                      if (cleaningDate.getMonth() !== currentMonth || cleaningDate.getFullYear() !== currentYear) {
                        return null;
                      }

                      const dayIndex = cleaningDate.getDate() - 1;
                      const left = dayIndex * 48 + 4;

                      let colorClass = "from-sky-400 to-blue-500";
                      let icon = cleaning.operator ? getInitials(cleaning.operator.name) : "?";

                      if (cleaning.status === "COMPLETED") {
                        colorClass = "from-emerald-400 to-teal-500";
                        icon = "✓";
                      } else if (cleaning.status === "IN_PROGRESS") {
                        colorClass = "from-amber-400 to-orange-500";
                      } else if (cleaning.status === "PENDING" || !cleaning.operator) {
                        colorClass = "from-rose-400 to-red-500";
                        icon = "!";
                      }

                      return (
                        <div
                          key={cleaning.id}
                          className={`absolute top-1.5 bottom-1.5 w-10 rounded-lg bg-gradient-to-r ${colorClass} flex items-center justify-center cursor-pointer shadow-md hover:shadow-lg hover:scale-y-110 hover:brightness-105 transition-all`}
                          style={{ left: `${left}px` }}
                          title={`${property.name} - ${cleaning.scheduledTime || "Da definire"} - ${cleaning.operator?.name || "Non assegnato"}`}
                        >
                          <span className="text-xs font-bold text-white">{icon}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
