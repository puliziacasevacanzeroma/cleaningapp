"use client";

import { useState, useMemo, useEffect, useRef } from "react";

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

interface CalendarioPrenotazioniProps {
  properties: Property[];
  bookings: Booking[];
}

function cleanGuestName(name: string, source?: string): string {
  if (!name) return "Ospite";
  if (source === "booking") return "Booking.com";
  const clientMatch = name.match(/Client Name \(([^)]+)\)/);
  if (clientMatch) return clientMatch[1];
  if (name.toLowerCase() === "reserved") return "Prenotazione";
  if (name.toLowerCase() === "reservation") return "Prenotazione";
  return name;
}

function isBlockedEntry(guestName: string, source?: string): boolean {
  if (!guestName) return false;
  if (source === "booking") return false;
  const lower = guestName.toLowerCase();
  const blockPatterns = [
    "not available", "no vacancy", "stop sell", "bloccata", "bloccato",
    "blocked", "unavailable", "chiuso", "non disponibile", "imported",
  ];
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

function getBookingColor(source?: string): string {
  switch (source) {
    case "booking": return "from-blue-400 to-blue-600";
    case "airbnb": return "from-rose-400 to-red-500";
    case "oktorate": return "from-violet-400 to-purple-500";
    case "krossbooking": return "from-emerald-400 to-teal-500";
    case "inreception": return "from-cyan-400 to-blue-500";
    default: return "from-slate-400 to-slate-600";
  }
}

export function CalendarioPrenotazioniClient({ properties, bookings }: CalendarioPrenotazioniProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<string>("next_checkout");
  const [syncing, setSyncing] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);

  const today = new Date();
  const todayDay = today.getDate();
  const todayMonth = today.getMonth();
  const todayYear = today.getFullYear();
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  useEffect(() => {
    if (calendarRef.current && currentMonth === todayMonth && currentYear === todayYear) {
      const dayWidth = 48;
      const scrollPosition = (todayDay - 1) * dayWidth - 100;
      calendarRef.current.scrollLeft = Math.max(0, scrollPosition);
    }
  }, [currentMonth, currentYear, todayDay, todayMonth, todayYear]);

  const syncAllIcal = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync-all-ical", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        alert(`Sincronizzazione completata!\n\nNuove: ${data.stats.totalNew}\nAggiornate: ${data.stats.totalUpdated}\nPulizie create: ${data.stats.totalCleaningsCreated || 0}`);
        window.location.reload();
      } else {
        alert("Errore: " + data.error);
      }
    } catch (e) {
      alert("Errore di connessione");
    }
    setSyncing(false);
  };

  const validBookings = useMemo(() => {
    return bookings.filter(b => !isBlockedEntry(b.guestName, b.source));
  }, [bookings]);

  const getNextCheckout = (propertyId: string) => {
    const propertyBookings = validBookings.filter(b => b.propertyId === propertyId);
    const futureCheckouts = propertyBookings.filter(b => {
      const co = parseDateString(b.checkOut);
      return new Date(co.year, co.month, co.day) >= today;
    });
    if (futureCheckouts.length === 0) return null;
    return futureCheckouts.sort((a, b) => {
      const coA = parseDateString(a.checkOut);
      const coB = parseDateString(b.checkOut);
      return new Date(coA.year, coA.month, coA.day).getTime() - new Date(coB.year, coB.month, coB.day).getTime();
    })[0];
  };

  const filteredProperties = useMemo(() => {
    let filtered = properties.filter(p => {
      return searchTerm === "" ||
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.address.toLowerCase().includes(searchTerm.toLowerCase());
    });

    if (sortBy === "name") {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "checkout_today") {
      filtered.sort((a, b) => {
        const nextA = getNextCheckout(a.id);
        const nextB = getNextCheckout(b.id);
        const isAToday = nextA && (() => {
          const co = parseDateString(nextA.checkOut);
          return co.day === todayDay && co.month === todayMonth && co.year === todayYear;
        })();
        const isBToday = nextB && (() => {
          const co = parseDateString(nextB.checkOut);
          return co.day === todayDay && co.month === todayMonth && co.year === todayYear;
        })();
        if (isAToday && !isBToday) return -1;
        if (!isAToday && isBToday) return 1;
        return 0;
      });
    } else if (sortBy === "next_checkout") {
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

  const monthName = currentDate.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  const prevMonth = () => setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  const goToToday = () => setCurrentDate(new Date());

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
    } else if (checkIn.year < currentYear || (checkIn.year === currentYear && checkIn.month < currentMonth)) {
      startDay = 1;
    } else {
      return null;
    }

    if (lastNightYear === currentYear && lastNightMonth === currentMonth) {
      endDay = adjustedLastNightDay;
    } else if (lastNightYear > currentYear || (lastNightYear === currentYear && lastNightMonth > currentMonth)) {
      endDay = daysInMonth.length;
    } else {
      return null;
    }

    if (startDay > endDay || startDay < 1 || endDay < 1) return null;

    const dayWidth = 48;
    const left = (startDay - 1) * dayWidth;
    const width = (endDay - startDay + 1) * dayWidth - 8;

    if (width <= 0) return null;
    return { left: `${left}px`, width: `${width}px` };
  };

  const propertyColors = [
    { bg: "from-rose-100 to-rose-200", icon: "text-rose-500" },
    { bg: "from-sky-100 to-sky-200", icon: "text-sky-500" },
    { bg: "from-amber-100 to-amber-200", icon: "text-amber-500" },
    { bg: "from-violet-100 to-violet-200", icon: "text-violet-500" },
    { bg: "from-emerald-100 to-emerald-200", icon: "text-emerald-500" },
    { bg: "from-pink-100 to-pink-200", icon: "text-pink-500" },
    { bg: "from-cyan-100 to-cyan-200", icon: "text-cyan-500" },
  ];

  const totalWidth = 220 + daysInMonth.length * 48;

  return (
    <div className="bg-gradient-to-br from-slate-50 via-white to-sky-50/30">
      {/* TITOLO - scorre via */}
      <div className="p-6 pb-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30 transform hover:scale-105 transition-transform">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-800 via-slate-700 to-slate-600 bg-clip-text text-transparent">
                Calendario Prenotazioni
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">Gestisci tutte le prenotazioni in un colpo d'occhio</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={syncAllIcal}
              disabled={syncing}
              className="group px-5 py-2.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 text-white rounded-xl font-medium shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/30 hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:hover:translate-y-0 flex items-center gap-2"
            >
              {syncing ? (
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              <span>{syncing ? "Sincronizzando..." : "Sincronizza iCal"}</span>
            </button>

            <div className="flex items-center bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200 p-1 shadow-lg shadow-slate-200/50">
              <button onClick={prevMonth} className="p-2.5 hover:bg-slate-100 rounded-lg transition-all hover:scale-105 active:scale-95">
                <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button onClick={goToToday} className="px-4 py-1 font-bold text-slate-700 capitalize text-lg hover:text-sky-600 transition-colors">
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
      </div>

      {/* CONTROLLI STICKY */}
      <div className="sticky top-0 z-40 bg-gradient-to-r from-white via-slate-50 to-white border-y border-slate-200/50 shadow-md backdrop-blur-sm">
        <div className="px-6 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[280px] group">
              <div className="absolute inset-0 bg-gradient-to-r from-sky-400 to-blue-500 rounded-xl opacity-0 group-focus-within:opacity-100 blur transition-opacity -z-10 scale-105"></div>
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-sky-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Cerca proprietà..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-400 transition-all"
              />
            </div>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="px-4 py-3 rounded-xl bg-white/90 backdrop-blur border border-slate-200/80 text-sm text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-300 transition-all cursor-pointer hover:bg-white hover:shadow-md appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%2364748b%27 stroke-width=%272%27%3e%3cpath d=%27M6 9l6 6 6-6%27/%3e%3c/svg%3e')] bg-[length:20px] bg-[right_8px_center] bg-no-repeat pr-10"><option value="name">Ordine alfabetico</option><option value="next_checkout">Prossimo checkout</option></select>
          </div>

          <div className="flex flex-wrap gap-3 mt-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-default">
              <div className="w-3 h-3 rounded-full bg-gradient-to-r from-rose-400 to-red-500 shadow-sm shadow-rose-500/50"></div>
              <span className="text-sm font-medium text-slate-600">Airbnb</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-default">
              <div className="w-3 h-3 rounded-full bg-gradient-to-r from-blue-400 to-blue-600 shadow-sm shadow-blue-500/50"></div>
              <span className="text-sm font-medium text-slate-600">Booking</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-default">
              <div className="w-3 h-3 rounded-full bg-gradient-to-r from-violet-400 to-purple-500 shadow-sm shadow-violet-500/50"></div>
              <span className="text-sm font-medium text-slate-600">Octorate</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-default">
              <div className="w-3 h-3 rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 shadow-sm shadow-emerald-500/50"></div>
              <span className="text-sm font-medium text-slate-600">Krossbooking</span>
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
                    className={`w-12 flex-shrink-0 h-12 flex flex-col items-center justify-center border-r border-slate-100 transition-colors ${day.isToday ? "bg-gradient-to-b from-sky-100 to-sky-50" : day.isSunday ? "bg-slate-50/80" : "bg-gradient-to-b from-white to-slate-50/50"}`}
                  >
                    <span className={`text-[10px] font-medium ${day.isToday ? "text-sky-600" : "text-slate-400"}`}>{day.dayName}</span>
                    {day.isToday ? (
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/40">
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
              const propertyBookings = validBookings.filter(b => b.propertyId === property.id);

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
                        className={`w-12 flex-shrink-0 border-r border-slate-50 ${day.isToday ? "bg-sky-50/50" : day.isSunday ? "bg-slate-50/30" : ""}`}
                      />
                    ))}

                    {propertyBookings.map((booking) => {
                      const style = getBookingStyle(booking);
                      if (!style) return null;

                      const checkOut = parseDateString(booking.checkOut);
                      const isCheckoutToday = checkOut.day === todayDay && checkOut.month === todayMonth && checkOut.year === todayYear;
                      const displayName = cleanGuestName(booking.guestName, booking.source);
                      const colorClass = isCheckoutToday ? "from-amber-400 to-orange-500" : getBookingColor(booking.source);

                      const checkIn = parseDateString(booking.checkIn);
                      const checkInStr = `${checkIn.day.toString().padStart(2,'0')}/${(checkIn.month+1).toString().padStart(2,'0')}/${checkIn.year}`;
                      const checkOutStr = `${checkOut.day.toString().padStart(2,'0')}/${(checkOut.month+1).toString().padStart(2,'0')}/${checkOut.year}`;

                      return (
                        <div
                          key={booking.id}
                          className={`absolute top-1.5 bottom-1.5 rounded-lg bg-gradient-to-r ${colorClass} flex items-center px-2 cursor-pointer shadow-md hover:shadow-lg hover:scale-y-110 hover:brightness-105 transition-all`}
                          style={style}
                          title={`${displayName} - Check-in: ${checkInStr} - Check-out: ${checkOutStr} - ${booking.source || 'manual'}`}
                        >
                          <span className="text-[11px] font-medium text-white truncate drop-shadow-sm">{displayName}</span>
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

