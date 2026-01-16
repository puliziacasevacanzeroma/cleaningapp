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

interface CalendarioMobileProps {
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
  const blockPatterns = ["not available", "blocked", "unavailable", "chiuso", "non disponibile"];
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
    case "inreception": return "from-cyan-500 to-blue-500";
    default: return "from-slate-500 to-slate-600";
  }
}

export function CalendarioPrenotazioniMobile({ properties, bookings }: CalendarioMobileProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "checkout">("checkout");
  const [syncing, setSyncing] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [tooltipProperty, setTooltipProperty] = useState<Property | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasScrolledToToday = useRef(false);

  // Blocca scroll body quando modal è aperto
  useEffect(() => {
    if (selectedBooking) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedBooking]);

  // Auto-chiudi tooltip dopo 2 secondi
  useEffect(() => {
    if (tooltipProperty) {
      const timer = setTimeout(() => setTooltipProperty(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [tooltipProperty]);

  const today = new Date();
  const todayDay = today.getDate();
  const todayMonth = today.getMonth();
  const todayYear = today.getFullYear();
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  // Filtra prenotazioni valide
  const validBookings = useMemo(() => {
    return bookings.filter(b => !isBlockedEntry(b.guestName, b.source));
  }, [bookings]);

  // Trova prossimo checkout per una proprietà
  const getNextCheckout = (propertyId: string) => {
    const propertyBookings = validBookings.filter(b => b.propertyId === propertyId);
    const futureCheckouts = propertyBookings.filter(b => {
      const co = parseDateString(b.checkOut);
      const checkoutDate = new Date(co.year, co.month, co.day);
      return checkoutDate >= today;
    });
    if (futureCheckouts.length === 0) return null;
    return futureCheckouts.sort((a, b) => {
      const coA = parseDateString(a.checkOut);
      const coB = parseDateString(b.checkOut);
      return new Date(coA.year, coA.month, coA.day).getTime() - new Date(coB.year, coB.month, coB.day).getTime();
    })[0];
  };

  // Filtra e ordina proprietà
  const filteredProperties = useMemo(() => {
    let filtered = properties.filter(p => {
      if (searchTerm === "") return true;
      return p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
             p.address.toLowerCase().includes(searchTerm.toLowerCase());
    });

    if (sortBy === "name") {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "checkout") {
      filtered.sort((a, b) => {
        const nextA = getNextCheckout(a.id);
        const nextB = getNextCheckout(b.id);
        if (!nextA && !nextB) return 0;
        if (!nextA) return 1;
        if (!nextB) return -1;
        const coA = parseDateString(nextA.checkOut);
        const coB = parseDateString(nextB.checkOut);
        return new Date(coA.year, coA.month, coA.day).getTime() - new Date(coB.year, coB.month, coB.day).getTime();
      });
    }

    return filtered;
  }, [properties, searchTerm, sortBy, validBookings]);

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

  // Auto-scroll al giorno corrente (solo una volta all'apertura)
  useEffect(() => {
    if (scrollRef.current && !hasScrolledToToday.current) {
      const dayWidth = 36;
      
      if (currentMonth === todayMonth && currentYear === todayYear) {
        // Scroll al giorno di oggi
        const scrollPosition = (todayDay - 1) * dayWidth - 20;
        scrollRef.current.scrollLeft = Math.max(0, scrollPosition);
      } else {
        // Se non è il mese corrente, scroll all'inizio
        scrollRef.current.scrollLeft = 0;
      }
      hasScrolledToToday.current = true;
    }
  }, []);

  // Reset scroll flag quando cambia mese
  useEffect(() => {
    if (currentMonth === todayMonth && currentYear === todayYear) {
      // Se torniamo al mese corrente, scroll a oggi
      if (scrollRef.current) {
        const dayWidth = 36;
        const scrollPosition = (todayDay - 1) * dayWidth - 20;
        scrollRef.current.scrollLeft = Math.max(0, scrollPosition);
      }
    }
  }, [currentMonth, currentYear]);

  const monthName = currentDate.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  const prevMonth = () => setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  const goToToday = () => {
    setCurrentDate(new Date());
    // Scroll a oggi
    setTimeout(() => {
      if (scrollRef.current) {
        const dayWidth = 36;
        const scrollPosition = (todayDay - 1) * dayWidth - 20;
        scrollRef.current.scrollLeft = Math.max(0, scrollPosition);
      }
    }, 100);
  };

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

  // Track horizontal scroll for syncing header
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollLeft(e.currentTarget.scrollLeft);
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

    const dayWidth = 36;
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
    { bg: "from-pink-100 to-pink-200", text: "text-pink-600" },
    { bg: "from-cyan-100 to-cyan-200", text: "text-cyan-600" },
  ];

  const dayWidth = 36;
  const propertyColWidth = 110;
  const rowHeight = 40;
  const totalWidth = propertyColWidth + daysInMonth.length * dayWidth;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50/30 pb-24">
      {/* Header fisso - compatto */}
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="px-3 py-2">
          {/* Riga 1: Navigazione mese centrata + Sync floating */}
          <div className="relative flex items-center justify-center mb-2">
            {/* Navigazione mese - centrata */}
            <div className="flex items-center bg-slate-50 rounded-xl p-0.5">
              <button 
                onClick={prevMonth} 
                className="p-2 hover:bg-white rounded-lg active:scale-95 transition-all touch-manipulation"
              >
                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              
              <button 
                onClick={goToToday} 
                className="px-3 py-1.5 font-semibold text-slate-800 capitalize text-sm hover:bg-white rounded-lg transition-colors touch-manipulation min-w-[110px] text-center"
              >
                {monthName}
              </button>
              
              <button 
                onClick={nextMonth} 
                className="p-2 hover:bg-white rounded-lg active:scale-95 transition-all touch-manipulation"
              >
                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Sync button - floating a destra */}
            <button
              onClick={syncAllIcal}
              disabled={syncing}
              className="absolute -right-1 top-1/2 -translate-y-1/2 w-11 h-11 bg-gradient-to-br from-emerald-400 to-emerald-600 text-white rounded-full disabled:opacity-50 active:scale-90 transition-all touch-manipulation shadow-lg shadow-emerald-500/40 hover:shadow-xl hover:shadow-emerald-500/50 flex items-center justify-center"
            >
              <svg className={`w-5 h-5 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          {/* Riga 2: Ricerca + Filtro ordine */}
          <div className="flex gap-2">
            {/* Barra di ricerca */}
            <div className="flex-1 relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Cerca proprietà..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-400 transition-all"
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 bg-slate-300 rounded-full flex items-center justify-center active:scale-95 touch-manipulation"
                >
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Filtro ordine */}
            <div className="relative">
              <button
                onClick={() => setShowSortMenu(!showSortMenu)}
                className="flex items-center gap-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 active:scale-95 touch-manipulation"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                </svg>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown ordine */}
              {showSortMenu && (
                <>
                  <div className="fixed inset-0 z-50" onClick={() => setShowSortMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-slate-200 shadow-xl z-50 overflow-hidden min-w-[180px]">
                    <button
                      onClick={() => { setSortBy("name"); setShowSortMenu(false); }}
                      className={`w-full flex items-center gap-2 px-4 py-3.5 text-sm transition-colors touch-manipulation ${
                        sortBy === "name" ? "bg-sky-50 text-sky-700" : "text-slate-700 active:bg-slate-100"
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9" />
                      </svg>
                      <span>Ordine Alfabetico</span>
                      {sortBy === "name" && (
                        <svg className="w-4 h-4 ml-auto text-sky-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={() => { setSortBy("checkout"); setShowSortMenu(false); }}
                      className={`w-full flex items-center gap-2 px-4 py-3.5 text-sm transition-colors touch-manipulation ${
                        sortBy === "checkout" ? "bg-sky-50 text-sky-700" : "text-slate-700 active:bg-slate-100"
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7" />
                      </svg>
                      <span>Prossimi Checkout</span>
                      {sortBy === "checkout" && (
                        <svg className="w-4 h-4 ml-auto text-sky-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Calendario Gantt */}
      <div className="px-1.5 pt-2 flex flex-col" style={{ height: "calc(100vh - 115px)" }}>
        {/* Container con bordo */}
        <div className="border border-slate-200 rounded-xl bg-white shadow-lg flex flex-col flex-1 overflow-hidden">
          
          {/* Header giorni - FISSO */}
          <div className="flex-shrink-0 flex bg-slate-50 border-b border-slate-200">
            <div 
              className="flex-shrink-0 flex items-center px-2 bg-slate-100 border-r border-slate-200"
              style={{ width: `${propertyColWidth}px`, height: "38px" }}
            >
              <span className="text-[10px] font-bold text-slate-600">Proprietà</span>
            </div>
            <div 
              className="flex overflow-hidden flex-1"
              style={{ marginLeft: "0" }}
            >
              <div 
                className="flex transition-transform"
                style={{ transform: `translateX(-${scrollLeft}px)` }}
              >
                {daysInMonth.map((day, index) => (
                  <div
                    key={index}
                    className={`flex-shrink-0 flex flex-col items-center justify-center border-r border-slate-100 ${
                      day.isToday ? "bg-sky-100" : day.isWeekend ? "bg-slate-100/50" : "bg-slate-50"
                    }`}
                    style={{ width: `${dayWidth}px`, height: "38px" }}
                  >
                    <span className={`text-[8px] font-medium uppercase ${day.isToday ? "text-sky-600" : "text-slate-400"}`}>
                      {day.dayName}
                    </span>
                    {day.isToday ? (
                      <div className="w-5 h-5 rounded-full bg-sky-500 flex items-center justify-center">
                        <span className="text-[9px] font-bold text-white">{day.day}</span>
                      </div>
                    ) : (
                      <span className={`text-[11px] font-bold ${day.isSunday ? "text-rose-400" : "text-slate-700"}`}>
                        {day.day}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Body scrollabile */}
          <div 
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-auto"
          >
            <div style={{ minWidth: `${totalWidth}px` }}>

            {/* Righe proprietà */}
            {filteredProperties.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <svg className="w-12 h-12 text-slate-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <p className="text-slate-500 text-sm">Nessuna proprietà trovata</p>
                </div>
              </div>
            ) : (
              filteredProperties.map((property, index) => {
                const colorSet = propertyColors[index % propertyColors.length];
                const propertyBookings = validBookings.filter(b => b.propertyId === property.id);
                const nextCheckout = getNextCheckout(property.id);
                const checkoutInfo = nextCheckout ? parseDateString(nextCheckout.checkOut) : null;
                const isCheckoutToday = checkoutInfo && 
                  checkoutInfo.day === todayDay && 
                  checkoutInfo.month === todayMonth && 
                  checkoutInfo.year === todayYear;

                return (
                  <div key={property.id} className={`flex border-b border-slate-100 ${isCheckoutToday ? 'bg-amber-50/50' : ''}`}>
                    <div 
                      className="flex-shrink-0 flex items-center px-1.5 bg-white border-r border-slate-200 sticky left-0 z-10 cursor-pointer active:bg-slate-50"
                      style={{ width: `${propertyColWidth}px`, height: `${rowHeight}px` }}
                      onClick={() => setTooltipProperty(property)}
                    >
                      <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${colorSet.bg} flex items-center justify-center mr-1 flex-shrink-0`}>
                        <span className={`text-[8px] font-bold ${colorSet.text}`}>
                          {property.name.slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[9px] font-semibold text-slate-800 truncate leading-tight">
                          {property.name}
                        </p>
                        {isCheckoutToday && (
                          <span className="text-[7px] font-bold text-amber-600 bg-amber-100 px-1 rounded">
                            OUT
                          </span>
                        )}
                      </div>
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
                        const isThisCheckoutToday = checkOut.day === todayDay && checkOut.month === todayMonth && checkOut.year === todayYear;
                        const colorClass = isThisCheckoutToday ? "from-amber-400 to-orange-500" : getSourceColor(booking.source);

                        return (
                          <div
                            key={booking.id}
                            onClick={() => setSelectedBooking(booking)}
                            className={`absolute top-1.5 bottom-1.5 rounded-md bg-gradient-to-r ${colorClass} flex items-center px-1.5 shadow-md active:scale-95 transition-all cursor-pointer touch-manipulation`}
                            style={style}
                          >
                            <span className="text-[9px] font-medium text-white truncate drop-shadow-sm">
                              {cleanGuestName(booking.guestName, booking.source)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
            </div>
          </div>
        </div>

        {/* Legenda compatta */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 px-1 flex-shrink-0">
          {[
            { color: "bg-rose-500", label: "Airbnb" },
            { color: "bg-blue-500", label: "Booking" },
            { color: "bg-violet-500", label: "Octorate" },
            { color: "bg-emerald-500", label: "Kross" },
            { color: "bg-amber-500", label: "Out oggi" },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${item.color}`}></div>
              <span className="text-[9px] text-slate-500">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Modal Dettaglio Prenotazione - Centrato */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Overlay scuro */}
          <div 
            className="absolute inset-0 bg-black/60" 
            onClick={() => setSelectedBooking(null)} 
          />
          
          {/* Modal centrato */}
          <div className="relative bg-white rounded-2xl w-full max-w-sm mx-auto shadow-2xl overflow-hidden">
            {(() => {
              const property = properties.find(p => p.id === selectedBooking.propertyId);
              const checkIn = parseDateString(selectedBooking.checkIn);
              const checkOut = parseDateString(selectedBooking.checkOut);
              const nights = Math.ceil(
                (new Date(checkOut.year, checkOut.month, checkOut.day).getTime() - 
                 new Date(checkIn.year, checkIn.month, checkIn.day).getTime()) / (1000 * 60 * 60 * 24)
              );
              const sourceColor = getSourceColor(selectedBooking.source);

              return (
                <div className="p-4">
                  {/* Barra colorata fonte */}
                  <div className={`h-1.5 rounded-full bg-gradient-to-r ${sourceColor} mb-4`}></div>

                  {/* Proprietà */}
                  <h3 className="text-lg font-bold text-slate-800 mb-1">{property?.name}</h3>
                  <p className="text-sm text-slate-500 mb-4">{property?.address}</p>

                  {/* Ospite */}
                  <div className="flex items-center gap-3 mb-4 p-3 bg-slate-50 rounded-xl">
                    <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                      <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Ospite</p>
                      <p className="font-semibold text-slate-800">{cleanGuestName(selectedBooking.guestName, selectedBooking.source)}</p>
                    </div>
                    <div className="ml-auto">
                      <span className={`px-2 py-1 rounded-lg text-xs font-medium capitalize ${
                        selectedBooking.source === 'airbnb' ? 'bg-rose-100 text-rose-600' :
                        selectedBooking.source === 'booking' ? 'bg-blue-100 text-blue-600' :
                        selectedBooking.source === 'oktorate' ? 'bg-violet-100 text-violet-600' :
                        selectedBooking.source === 'krossbooking' ? 'bg-emerald-100 text-emerald-600' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {selectedBooking.source || 'Manuale'}
                      </span>
                    </div>
                  </div>

                  {/* Date Check-in / Check-out */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-emerald-50 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14" />
                        </svg>
                        <span className="text-xs font-medium text-emerald-600">Check-in</span>
                      </div>
                      <p className="text-lg font-bold text-slate-800">
                        {checkIn.day.toString().padStart(2, '0')}/{(checkIn.month + 1).toString().padStart(2, '0')}/{checkIn.year}
                      </p>
                    </div>

                    <div className="bg-amber-50 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H3" />
                        </svg>
                        <span className="text-xs font-medium text-amber-600">Check-out</span>
                      </div>
                      <p className="text-lg font-bold text-slate-800">
                        {checkOut.day.toString().padStart(2, '0')}/{(checkOut.month + 1).toString().padStart(2, '0')}/{checkOut.year}
                      </p>
                    </div>
                  </div>

                  {/* Notti */}
                  <div className="bg-sky-50 rounded-xl p-3 mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                      </svg>
                      <span className="text-sm font-medium text-sky-600">Durata soggiorno</span>
                    </div>
                    <span className="text-lg font-bold text-slate-800">{nights} {nights === 1 ? 'notte' : 'notti'}</span>
                  </div>

                  {/* Chiudi */}
                  <button
                    onClick={() => setSelectedBooking(null)}
                    className="w-full py-3 bg-slate-800 text-white rounded-xl font-semibold active:scale-98 transition-all touch-manipulation"
                  >
                    Chiudi
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Tooltip Nome Proprietà */}
      {tooltipProperty && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setTooltipProperty(null)}
        >
          {/* Overlay trasparente */}
          <div className="absolute inset-0 bg-black/20 animate-fade-in" />
          
          {/* Tooltip */}
          <div 
            className="relative bg-white rounded-2xl shadow-2xl px-6 py-4 max-w-xs animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <p className="text-lg font-bold text-slate-800 leading-tight">
                {tooltipProperty.name}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                {tooltipProperty.address}
              </p>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scale-in {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in {
          animation: fade-in 0.15s ease-out;
        }
        .animate-scale-in {
          animation: scale-in 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}
