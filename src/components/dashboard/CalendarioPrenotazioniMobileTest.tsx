"use client";

import { useState, useMemo, useRef, useEffect } from "react";

interface Property {
  id: string;
  name: string;
  address: string;
  color: string;
}

interface Booking {
  id: string;
  propertyId: string;
  guestName: string;
  checkIn: Date;
  checkOut: Date;
  status: string;
  source?: string;
}

interface CalendarioTestProps {
  properties: Property[];
  bookings: Booking[];
}

function cleanGuestName(name: string, source?: string): string {
  if (!name) return "Ospite";
  if (source === "booking") return "Booking";
  const clientMatch = name.match(/Client Name \(([^)]+)\)/);
  if (clientMatch) return clientMatch[1];
  if (name.toLowerCase() === "reserved") return "Prenotazione";
  return name.length > 12 ? name.slice(0, 10) + ".." : name;
}

function isBlockedEntry(guestName: string, source?: string): boolean {
  if (!guestName) return false;
  if (source === "booking") return false;
  const lower = guestName.toLowerCase();
  const blockPatterns = ["not available", "blocked", "unavailable", "chiuso"];
  return blockPatterns.some(pattern => lower.includes(pattern));
}

function parseDateString(dateInput: Date | string): { day: number; month: number; year: number } {
  const str = typeof dateInput === 'string' ? dateInput : dateInput.toISOString();
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return { year: parseInt(match[1]), month: parseInt(match[2]) - 1, day: parseInt(match[3]) };
  }
  const d = new Date(dateInput);
  return { day: d.getUTCDate(), month: d.getUTCMonth(), year: d.getUTCFullYear() };
}

function getSourceColor(source?: string): string {
  switch (source) {
    case "booking": return "from-blue-500 to-blue-600";
    case "airbnb": return "from-rose-500 to-red-500";
    case "oktorate": return "from-violet-500 to-purple-500";
    case "krossbooking": return "from-emerald-500 to-teal-500";
    default: return "from-slate-500 to-slate-600";
  }
}

export function CalendarioPrenotazioniMobileTest({ properties, bookings }: CalendarioTestProps) {
  const [viewMode, setViewMode] = useState<"gantt" | "compact" | "timeline">("gantt");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedProperty, setSelectedProperty] = useState<string>("all");
  const [syncing, setSyncing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const today = new Date();
  const todayDay = today.getDate();
  const todayMonth = today.getMonth();
  const todayYear = today.getFullYear();
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  const validBookings = useMemo(() => {
    return bookings.filter(b => !isBlockedEntry(b.guestName, b.source));
  }, [bookings]);

  const filteredProperties = useMemo(() => {
    if (selectedProperty === "all") return properties;
    return properties.filter(p => p.id === selectedProperty);
  }, [properties, selectedProperty]);

  // Genera giorni del mese
  const daysInMonth = useMemo(() => {
    const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
    const days = [];
    for (let d = 1; d <= lastDay; d++) {
      const date = new Date(currentYear, currentMonth, d);
      const isToday = d === todayDay && currentMonth === todayMonth && currentYear === todayYear;
      days.push({
        day: d,
        dayName: date.toLocaleDateString("it-IT", { weekday: "short" }).slice(0, 2),
        isToday,
        isSunday: date.getDay() === 0,
        isWeekend: date.getDay() === 0 || date.getDay() === 6
      });
    }
    return days;
  }, [currentMonth, currentYear, todayDay, todayMonth, todayYear]);

  // Scroll al giorno corrente
  useEffect(() => {
    if (scrollRef.current && currentMonth === todayMonth && currentYear === todayYear) {
      const dayWidth = viewMode === "compact" ? 28 : 36;
      const scrollPosition = (todayDay - 1) * dayWidth - 50;
      scrollRef.current.scrollLeft = Math.max(0, scrollPosition);
    }
  }, [currentMonth, currentYear, todayDay, todayMonth, todayYear, viewMode]);

  const monthName = currentDate.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  const prevMonth = () => setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  const goToToday = () => setCurrentDate(new Date());

  const syncAllIcal = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync-all-ical", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        alert(`✅ Sync completata!\nNuove: ${data.stats.totalNew}\nAggiornate: ${data.stats.totalUpdated}`);
        window.location.reload();
      }
    } catch (e) {
      alert("❌ Errore sync");
    }
    setSyncing(false);
  };

  // Calcola stile prenotazione
  const getBookingStyle = (booking: Booking) => {
    const checkIn = parseDateString(booking.checkIn);
    const checkOut = parseDateString(booking.checkOut);
    
    const lastNightDay = checkOut.day - 1;
    let lastNightMonth = checkOut.month;
    let lastNightYear = checkOut.year;
    let adjustedLastNightDay = lastNightDay;

    if (lastNightDay < 1) {
      lastNightMonth = checkOut.month === 0 ? 11 : checkOut.month - 1;
      lastNightYear = checkOut.month === 0 ? checkOut.year - 1 : checkOut.year;
      adjustedLastNightDay = new Date(lastNightYear, lastNightMonth + 1, 0).getDate();
    }

    const checkInBeforeOrInMonth = (checkIn.year < currentYear) || (checkIn.year === currentYear && checkIn.month <= currentMonth);
    const lastNightInOrAfterMonth = (lastNightYear > currentYear) || (lastNightYear === currentYear && lastNightMonth >= currentMonth);

    if (!checkInBeforeOrInMonth || !lastNightInOrAfterMonth) return null;

    let startDay: number;
    let endDay: number;

    if (checkIn.year === currentYear && checkIn.month === currentMonth) {
      startDay = checkIn.day;
    } else {
      startDay = 1;
    }

    if (lastNightYear === currentYear && lastNightMonth === currentMonth) {
      endDay = adjustedLastNightDay;
    } else {
      endDay = daysInMonth.length;
    }

    if (startDay > endDay || startDay < 1 || endDay < 1) return null;

    const dayWidth = viewMode === "compact" ? 28 : 36;
    const left = (startDay - 1) * dayWidth;
    const width = (endDay - startDay + 1) * dayWidth - 4;

    if (width <= 0) return null;
    return { left: `${left}px`, width: `${width}px` };
  };

  const propertyColors = [
    { bg: "from-rose-100 to-rose-200", text: "text-rose-600" },
    { bg: "from-sky-100 to-sky-200", text: "text-sky-600" },
    { bg: "from-amber-100 to-amber-200", text: "text-amber-600" },
    { bg: "from-violet-100 to-violet-200", text: "text-violet-600" },
    { bg: "from-emerald-100 to-emerald-200", text: "text-emerald-600" },
  ];

  const dayWidth = viewMode === "compact" ? 28 : 36;
  const propertyColWidth = viewMode === "compact" ? 100 : 120;
  const rowHeight = viewMode === "compact" ? 36 : 44;
  const totalWidth = propertyColWidth + daysInMonth.length * dayWidth;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50/30 pb-24">
      {/* Header fisso */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-slate-200/60">
        <div className="px-3 py-2">
          {/* Titolo e Sync */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-sm font-bold text-slate-800">Calendario</h1>
                <p className="text-[10px] text-slate-500">{filteredProperties.length} proprietà</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={syncAllIcal}
                disabled={syncing}
                className="p-2 bg-emerald-500 text-white rounded-lg disabled:opacity-50"
              >
                <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>

          {/* Navigazione mese */}
          <div className="flex items-center justify-between mb-2">
            <button onClick={prevMonth} className="p-1.5 hover:bg-slate-100 rounded-lg">
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button onClick={goToToday} className="px-3 py-1 font-bold text-slate-700 capitalize">
              {monthName}
            </button>
            <button onClick={nextMonth} className="p-1.5 hover:bg-slate-100 rounded-lg">
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Toggle Vista */}
          <div className="flex gap-1 p-1 bg-slate-100 rounded-lg mb-2">
            <button
              onClick={() => setViewMode("gantt")}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                viewMode === "gantt" ? "bg-white text-sky-600 shadow-sm" : "text-slate-500"
              }`}
            >
              📊 Gantt
            </button>
            <button
              onClick={() => setViewMode("compact")}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                viewMode === "compact" ? "bg-white text-sky-600 shadow-sm" : "text-slate-500"
              }`}
            >
              📱 Compatto
            </button>
            <button
              onClick={() => setViewMode("timeline")}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                viewMode === "timeline" ? "bg-white text-sky-600 shadow-sm" : "text-slate-500"
              }`}
            >
              📋 Timeline
            </button>
          </div>

          {/* Filtro proprietà */}
          <select
            value={selectedProperty}
            onChange={(e) => setSelectedProperty(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg"
          >
            <option value="all">🏠 Tutte le proprietà ({properties.length})</option>
            {properties.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ============================================ */}
      {/* VISTA GANTT - Stile Desktop */}
      {/* ============================================ */}
      {viewMode === "gantt" && (
        <div className="px-2 pt-2">
          <div 
            ref={scrollRef}
            className="border border-slate-200 rounded-xl bg-white shadow-lg overflow-auto"
            style={{ maxHeight: "calc(100vh - 240px)" }}
          >
            <div style={{ minWidth: `${totalWidth}px` }}>
              {/* Header giorni */}
              <div className="flex sticky top-0 z-20 bg-slate-50 border-b border-slate-200">
                <div 
                  className="flex-shrink-0 flex items-center px-2 bg-slate-100 border-r border-slate-200 sticky left-0 z-30"
                  style={{ width: `${propertyColWidth}px`, height: "40px" }}
                >
                  <span className="text-xs font-bold text-slate-600">Proprietà</span>
                </div>
                <div className="flex">
                  {daysInMonth.map((day, index) => (
                    <div
                      key={index}
                      className={`flex-shrink-0 flex flex-col items-center justify-center border-r border-slate-100 ${
                        day.isToday ? "bg-sky-100" : day.isWeekend ? "bg-slate-50" : ""
                      }`}
                      style={{ width: `${dayWidth}px`, height: "40px" }}
                    >
                      <span className={`text-[9px] font-medium ${day.isToday ? "text-sky-600" : "text-slate-400"}`}>
                        {day.dayName}
                      </span>
                      {day.isToday ? (
                        <div className="w-5 h-5 rounded-full bg-sky-500 flex items-center justify-center">
                          <span className="text-[10px] font-bold text-white">{day.day}</span>
                        </div>
                      ) : (
                        <span className={`text-xs font-bold ${day.isSunday ? "text-rose-400" : "text-slate-700"}`}>
                          {day.day}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Righe proprietà */}
              {filteredProperties.map((property, index) => {
                const colorSet = propertyColors[index % propertyColors.length];
                const propertyBookings = validBookings.filter(b => b.propertyId === property.id);

                return (
                  <div key={property.id} className="flex border-b border-slate-100">
                    <div 
                      className="flex-shrink-0 flex items-center px-2 bg-white border-r border-slate-200 sticky left-0 z-10"
                      style={{ width: `${propertyColWidth}px`, height: `${rowHeight}px` }}
                    >
                      <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${colorSet.bg} flex items-center justify-center mr-1.5 flex-shrink-0`}>
                        <span className={`text-[10px] font-bold ${colorSet.text}`}>
                          {property.name.slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <p className="text-[10px] font-medium text-slate-700 truncate leading-tight">
                        {property.name}
                      </p>
                    </div>

                    <div className="flex relative" style={{ height: `${rowHeight}px` }}>
                      {daysInMonth.map((day, dayIndex) => (
                        <div
                          key={dayIndex}
                          className={`flex-shrink-0 border-r border-slate-50 ${
                            day.isToday ? "bg-sky-50/50" : day.isWeekend ? "bg-slate-50/30" : ""
                          }`}
                          style={{ width: `${dayWidth}px` }}
                        />
                      ))}

                      {propertyBookings.map((booking) => {
                        const style = getBookingStyle(booking);
                        if (!style) return null;

                        const checkOut = parseDateString(booking.checkOut);
                        const isCheckoutToday = checkOut.day === todayDay && checkOut.month === todayMonth && checkOut.year === todayYear;
                        const colorClass = isCheckoutToday ? "from-amber-400 to-orange-500" : getSourceColor(booking.source);

                        return (
                          <div
                            key={booking.id}
                            className={`absolute top-1 bottom-1 rounded bg-gradient-to-r ${colorClass} flex items-center px-1.5 shadow-sm`}
                            style={style}
                          >
                            <span className="text-[9px] font-medium text-white truncate">
                              {cleanGuestName(booking.guestName, booking.source)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legenda */}
          <div className="flex flex-wrap gap-2 mt-3 px-1">
            {[
              { color: "bg-rose-500", label: "Airbnb" },
              { color: "bg-blue-500", label: "Booking" },
              { color: "bg-violet-500", label: "Octorate" },
              { color: "bg-emerald-500", label: "Kross" },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${item.color}`}></div>
                <span className="text-[10px] text-slate-500">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* VISTA COMPATTA - Celle più piccole */}
      {/* ============================================ */}
      {viewMode === "compact" && (
        <div className="px-2 pt-2">
          <div 
            ref={scrollRef}
            className="border border-slate-200 rounded-xl bg-white shadow-lg overflow-auto"
            style={{ maxHeight: "calc(100vh - 240px)" }}
          >
            <div style={{ minWidth: `${100 + daysInMonth.length * 28}px` }}>
              {/* Header giorni - super compatto */}
              <div className="flex sticky top-0 z-20 bg-slate-50 border-b border-slate-200">
                <div 
                  className="flex-shrink-0 flex items-center px-1 bg-slate-100 border-r border-slate-200 sticky left-0 z-30"
                  style={{ width: "100px", height: "32px" }}
                >
                  <span className="text-[10px] font-bold text-slate-600">Proprietà</span>
                </div>
                <div className="flex">
                  {daysInMonth.map((day, index) => (
                    <div
                      key={index}
                      className={`flex-shrink-0 flex items-center justify-center border-r border-slate-100 ${
                        day.isToday ? "bg-sky-200" : day.isWeekend ? "bg-slate-100" : ""
                      }`}
                      style={{ width: "28px", height: "32px" }}
                    >
                      <span className={`text-[10px] font-bold ${
                        day.isToday ? "text-sky-700" : day.isSunday ? "text-rose-400" : "text-slate-600"
                      }`}>
                        {day.day}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Righe proprietà */}
              {filteredProperties.map((property, index) => {
                const propertyBookings = validBookings.filter(b => b.propertyId === property.id);

                return (
                  <div key={property.id} className="flex border-b border-slate-100">
                    <div 
                      className="flex-shrink-0 flex items-center px-1 bg-white border-r border-slate-200 sticky left-0 z-10"
                      style={{ width: "100px", height: "28px" }}
                    >
                      <p className="text-[9px] font-medium text-slate-700 truncate">
                        {property.name}
                      </p>
                    </div>

                    <div className="flex relative" style={{ height: "28px" }}>
                      {daysInMonth.map((day, dayIndex) => (
                        <div
                          key={dayIndex}
                          className={`flex-shrink-0 border-r border-slate-50 ${
                            day.isToday ? "bg-sky-50" : day.isWeekend ? "bg-slate-50/50" : ""
                          }`}
                          style={{ width: "28px" }}
                        />
                      ))}

                      {propertyBookings.map((booking) => {
                        const checkIn = parseDateString(booking.checkIn);
                        const checkOut = parseDateString(booking.checkOut);
                        
                        let startDay = checkIn.month === currentMonth && checkIn.year === currentYear ? checkIn.day : 1;
                        let endDay = checkOut.month === currentMonth && checkOut.year === currentYear ? checkOut.day - 1 : daysInMonth.length;
                        
                        if (checkIn.year < currentYear || (checkIn.year === currentYear && checkIn.month < currentMonth)) startDay = 1;
                        if (checkOut.year > currentYear || (checkOut.year === currentYear && checkOut.month > currentMonth)) endDay = daysInMonth.length;
                        
                        if (startDay > endDay) return null;

                        const left = (startDay - 1) * 28;
                        const width = (endDay - startDay + 1) * 28 - 2;
                        
                        if (width <= 0) return null;

                        const isCheckoutToday = checkOut.day === todayDay && checkOut.month === todayMonth && checkOut.year === todayYear;
                        const colorClass = isCheckoutToday ? "from-amber-400 to-orange-500" : getSourceColor(booking.source);

                        return (
                          <div
                            key={booking.id}
                            className={`absolute top-0.5 bottom-0.5 rounded-sm bg-gradient-to-r ${colorClass}`}
                            style={{ left: `${left}px`, width: `${width}px` }}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* VISTA TIMELINE - Lista verticale per giorno */}
      {/* ============================================ */}
      {viewMode === "timeline" && (
        <div className="px-3 pt-3">
          {/* Scroll orizzontale giorni */}
          <div className="flex gap-2 overflow-x-auto pb-3 -mx-3 px-3" style={{ scrollbarWidth: "none" }}>
            {daysInMonth.map((day, index) => {
              const date = new Date(currentYear, currentMonth, day.day);
              const dayBookings = validBookings.filter(b => {
                const ci = parseDateString(b.checkIn);
                const co = parseDateString(b.checkOut);
                const ciDate = new Date(ci.year, ci.month, ci.day);
                const coDate = new Date(co.year, co.month, co.day);
                return ciDate <= date && date < coDate;
              });

              return (
                <button
                  key={index}
                  onClick={() => setCurrentDate(new Date(currentYear, currentMonth, day.day))}
                  className={`flex-shrink-0 flex flex-col items-center py-2 px-3 rounded-xl transition-all ${
                    day.isToday
                      ? "bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-lg"
                      : dayBookings.length > 0
                      ? "bg-sky-50 text-sky-700"
                      : "bg-slate-50 text-slate-500"
                  }`}
                >
                  <span className="text-[10px] font-medium uppercase">{day.dayName}</span>
                  <span className="text-lg font-bold">{day.day}</span>
                  {dayBookings.length > 0 && (
                    <span className={`text-[10px] font-medium ${day.isToday ? "text-white/80" : ""}`}>
                      {dayBookings.length} occ.
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Lista prenotazioni del giorno selezionato */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-700">
              {currentDate.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
            </h3>

            {(() => {
              const dayBookings = validBookings.filter(b => {
                if (selectedProperty !== "all" && b.propertyId !== selectedProperty) return false;
                const ci = parseDateString(b.checkIn);
                const co = parseDateString(b.checkOut);
                const ciDate = new Date(ci.year, ci.month, ci.day);
                const coDate = new Date(co.year, co.month, co.day);
                return ciDate <= currentDate && currentDate < coDate;
              });

              if (dayBookings.length === 0) {
                return (
                  <div className="bg-white rounded-xl p-6 text-center border border-slate-100">
                    <p className="text-slate-500">Nessuna prenotazione</p>
                  </div>
                );
              }

              return dayBookings.map(booking => {
                const property = properties.find(p => p.id === booking.propertyId);
                const ci = parseDateString(booking.checkIn);
                const co = parseDateString(booking.checkOut);
                const sourceColor = getSourceColor(booking.source);

                return (
                  <div key={booking.id} className="bg-white rounded-xl border border-slate-100 overflow-hidden">
                    <div className={`h-1 bg-gradient-to-r ${sourceColor}`}></div>
                    <div className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-slate-800 text-sm">{property?.name}</h4>
                        <span className="text-[10px] px-2 py-0.5 bg-slate-100 rounded-full text-slate-500">
                          {booking.source || "manual"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mb-2">{cleanGuestName(booking.guestName, booking.source)}</p>
                      <div className="flex items-center gap-3 text-[10px] text-slate-400">
                        <span>📥 {ci.day}/{ci.month + 1}</span>
                        <span>📤 {co.day}/{co.month + 1}</span>
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
