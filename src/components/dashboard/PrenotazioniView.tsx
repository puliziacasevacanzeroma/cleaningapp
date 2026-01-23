"use client";

import { useState, useMemo, useRef, useEffect } from "react";

interface Property {
  id: string;
  name: string;
  address: string;
  imageUrl?: string;
}

interface Booking {
  id: string;
  propertyId: string;
  guestName: string;
  checkIn: Date | string;
  checkOut: Date | string;
  status: string;
  source?: string;
}

interface PrenotazioniViewProps {
  properties: Property[];
  bookings: Booking[];
  isAdmin?: boolean;
}

// Funzione per pulire l'indirizzo
function cleanAddress(address: string | undefined): string {
  if (!address) return '';
  const firstPart = address.split(',')[0].trim();
  return firstPart.replace(/\s*\d{5}\s*/g, '').trim();
}

// Pulisci nome ospite
function cleanGuestName(name: string, source?: string): string {
  if (!name) return "Ospite";
  if (source === "booking") return "Booking";
  const clientMatch = name.match(/Client Name \(([^)]+)\)/);
  if (clientMatch) return clientMatch[1];
  if (name.toLowerCase() === "reserved") return "Prenotazione";
  if (name.toLowerCase() === "reservation") return "Prenotazione";
  return name;
}

// Verifica se è un blocco (non prenotazione vera)
function isBlockedEntry(guestName: string, source?: string): boolean {
  if (!guestName) return false;
  if (source === "booking") return false;
  const lower = guestName.toLowerCase();
  const blockPatterns = ["not available", "no vacancy", "stop sell", "bloccata", "bloccato", "blocked", "unavailable", "chiuso", "non disponibile", "imported"];
  return blockPatterns.some(pattern => lower.includes(pattern));
}

// Parse data stringa
function parseDateString(dateInput: Date | string): { day: number; month: number; year: number } {
  const str = typeof dateInput === 'string' ? dateInput : dateInput.toISOString();
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return { year: parseInt(match[1]), month: parseInt(match[2]) - 1, day: parseInt(match[3]) };
  }
  const d = new Date(dateInput);
  return { day: d.getUTCDate(), month: d.getUTCMonth(), year: d.getUTCFullYear() };
}

// Colori per fonte prenotazione
function getSourceColor(source?: string): { gradient: string; cssGradient: string; shadowColor: string; badge: string; label: string } {
  switch (source) {
    case "booking":
      return {
        gradient: "from-blue-400 to-blue-600",
        cssGradient: "linear-gradient(135deg, rgba(59,130,246,0.9), rgba(37,99,235,0.85))",
        shadowColor: "rgba(59,130,246,0.4)",
        badge: "bg-blue-100 text-blue-700",
        label: "Booking"
      };
    case "airbnb":
      return {
        gradient: "from-rose-400 to-red-500",
        cssGradient: "linear-gradient(135deg, rgba(251,113,133,0.9), rgba(239,68,68,0.85))",
        shadowColor: "rgba(239,68,68,0.4)",
        badge: "bg-rose-100 text-rose-700",
        label: "Airbnb"
      };
    case "oktorate":
      return {
        gradient: "from-violet-400 to-purple-500",
        cssGradient: "linear-gradient(135deg, rgba(167,139,250,0.9), rgba(168,85,247,0.85))",
        shadowColor: "rgba(139,92,246,0.4)",
        badge: "bg-violet-100 text-violet-700",
        label: "Octorate"
      };
    case "krossbooking":
      return {
        gradient: "from-emerald-400 to-teal-500",
        cssGradient: "linear-gradient(135deg, rgba(52,211,153,0.9), rgba(20,184,166,0.85))",
        shadowColor: "rgba(16,185,129,0.4)",
        badge: "bg-emerald-100 text-emerald-700",
        label: "Krossbooking"
      };
    case "inreception":
      return {
        gradient: "from-cyan-400 to-blue-500",
        cssGradient: "linear-gradient(135deg, rgba(34,211,238,0.9), rgba(59,130,246,0.85))",
        shadowColor: "rgba(6,182,212,0.4)",
        badge: "bg-cyan-100 text-cyan-700",
        label: "InReception"
      };
    default:
      return {
        gradient: "from-slate-400 to-slate-600",
        cssGradient: "linear-gradient(135deg, rgba(148,163,184,0.9), rgba(71,85,105,0.85))",
        shadowColor: "rgba(100,116,139,0.4)",
        badge: "bg-slate-100 text-slate-700",
        label: "Manuale"
      };
  }
}

export function PrenotazioniView({ properties, bookings, isAdmin = false }: PrenotazioniViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<string>("next_checkout");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  const calendarRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayDay = today.getDate();
  const todayMonth = today.getMonth();
  const todayYear = today.getFullYear();

  // Filtra prenotazioni valide (esclude blocchi)
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
    let filtered = [...properties];

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(search) ||
        p.address?.toLowerCase().includes(search)
      );
    }

    if (sortBy === "name") {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "next_checkout") {
      filtered.sort((a, b) => {
        const nextA = getNextCheckout(a.id);
        const nextB = getNextCheckout(b.id);
        if (!nextA && !nextB) return a.name.localeCompare(b.name);
        if (!nextA) return 1;
        if (!nextB) return -1;
        const coA = parseDateString(nextA.checkOut);
        const coB = parseDateString(nextB.checkOut);
        return new Date(coA.year, coA.month, coA.day).getTime() - new Date(coB.year, coB.month, coB.day).getTime();
      });
    }

    return filtered;
  }, [properties, searchTerm, sortBy, validBookings]);

  // Statistiche
  const stats = useMemo(() => {
    const todayStr = today.toDateString();
    
    // Check-in oggi
    const checkinsToday = validBookings.filter(b => {
      const ci = parseDateString(b.checkIn);
      return new Date(ci.year, ci.month, ci.day).toDateString() === todayStr;
    }).length;

    // Check-out oggi
    const checkoutsToday = validBookings.filter(b => {
      const co = parseDateString(b.checkOut);
      return new Date(co.year, co.month, co.day).toDateString() === todayStr;
    }).length;

    // Prenotazioni attive oggi
    const activeToday = validBookings.filter(b => {
      const ci = parseDateString(b.checkIn);
      const co = parseDateString(b.checkOut);
      const checkIn = new Date(ci.year, ci.month, ci.day);
      const checkOut = new Date(co.year, co.month, co.day);
      return checkIn <= today && checkOut > today;
    }).length;

    return {
      checkinsToday,
      checkoutsToday,
      activeToday,
      properties: properties.length
    };
  }, [validBookings, properties]);

  // Giorni del mese per il calendario Gantt
  const ganttDays = useMemo(() => {
    const days = [];
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();

    for (let d = 1; d <= lastDay; d++) {
      const date = new Date(year, month, d);
      days.push({
        date,
        day: d,
        dayName: date.toLocaleDateString("it-IT", { weekday: "short" }).charAt(0).toUpperCase() +
                 date.toLocaleDateString("it-IT", { weekday: "short" }).slice(1, 3),
        isToday: date.toDateString() === today.toDateString(),
        isSunday: date.getDay() === 0
      });
    }
    return days;
  }, [currentDate]);

  const monthName = currentDate.toLocaleDateString("it-IT", { month: "long", year: "numeric" });

  const navigateCalendar = (direction: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + direction);
    setCurrentDate(newDate);
  };

  // Auto-scroll al giorno corrente
  useEffect(() => {
    const todayIndex = ganttDays.findIndex(d => d.isToday);
    if (todayIndex !== -1) {
      const cellWidth = 60;
      const scrollPosition = Math.max(0, (todayIndex * cellWidth) - 150);

      const timer = setTimeout(() => {
        if (calendarRef.current) {
          calendarRef.current.scrollLeft = scrollPosition;
        }
        if (headerRef.current) {
          headerRef.current.scrollLeft = scrollPosition;
        }
      }, 200);

      return () => clearTimeout(timer);
    }
  }, [currentDate, ganttDays]);

  // Sincronizza iCal
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
    } catch {
      alert("Errore di connessione");
    }
    setSyncing(false);
  };

  // Calcola posizione e larghezza di una prenotazione nel Gantt
  const getBookingPosition = (booking: Booking) => {
    const ci = parseDateString(booking.checkIn);
    const co = parseDateString(booking.checkOut);
    
    const checkIn = new Date(ci.year, ci.month, ci.day);
    const checkOut = new Date(co.year, co.month, co.day);
    
    // Ultimo giorno di pernottamento (checkout - 1)
    const lastNight = new Date(checkOut);
    lastNight.setDate(lastNight.getDate() - 1);

    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    // Verifica se la prenotazione è visibile nel mese corrente
    const monthStart = new Date(currentYear, currentMonth, 1);
    const monthEnd = new Date(currentYear, currentMonth + 1, 0);

    // Se il checkout è prima dell'inizio del mese o il check-in è dopo la fine, non visibile
    if (checkOut <= monthStart || checkIn > monthEnd) return null;

    // Calcola indice inizio
    let startDayIndex: number;
    if (checkIn < monthStart) {
      startDayIndex = 0;
    } else {
      startDayIndex = checkIn.getDate() - 1;
    }

    // Calcola indice fine (ultimo giorno di pernottamento)
    let endDayIndex: number;
    if (lastNight > monthEnd) {
      endDayIndex = ganttDays.length - 1;
    } else if (lastNight < monthStart) {
      return null;
    } else {
      endDayIndex = lastNight.getDate() - 1;
    }

    if (startDayIndex > endDayIndex) return null;

    const cellWidth = 60;
    const left = startDayIndex * cellWidth + 3;
    const width = (endDayIndex - startDayIndex + 1) * cellWidth - 6;

    return { left, width };
  };

  // Verifica se checkout è oggi
  const isCheckoutToday = (booking: Booking) => {
    const co = parseDateString(booking.checkOut);
    return new Date(co.year, co.month, co.day).toDateString() === today.toDateString();
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24">

      {/* HEADER - IDENTICO a PulizieView */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-sky-600 via-blue-600 to-indigo-700"></div>
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-cyan-500/20 rounded-full blur-2xl -ml-8 -mb-8"></div>

        <div className="relative px-4 pt-4 pb-5">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/20">
                  <span className="text-xl">📅</span>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">
                    {isAdmin ? "Calendario Prenotazioni" : "Le Mie Prenotazioni"}
                  </h1>
                  <p className="text-sky-200 text-xs">
                    Gestisci tutte le prenotazioni iCal
                  </p>
                </div>
              </div>
              <button
                onClick={syncAllIcal}
                disabled={syncing}
                className="px-3 py-2 rounded-xl bg-white/20 backdrop-blur-sm flex items-center gap-1.5 border border-white/30 hover:bg-white/30 transition-all disabled:opacity-50"
              >
                {syncing ? (
                  <svg className="w-3.5 h-3.5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
                <span className="text-white text-[11px] font-semibold whitespace-nowrap">
                  {syncing ? "Sync..." : "Sincronizza"}
                </span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3 border border-white/10">
                <p className="text-sky-200 text-[10px] font-medium">Check-in Oggi</p>
                <p className="text-2xl font-bold text-white">{stats.checkinsToday}</p>
              </div>
              <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3 border border-white/10">
                <p className="text-sky-200 text-[10px] font-medium">Check-out Oggi</p>
                <p className="text-2xl font-bold text-white">{stats.checkoutsToday}</p>
              </div>
              <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3 border border-white/10">
                <p className="text-sky-200 text-[10px] font-medium">Attive</p>
                <p className="text-2xl font-bold text-white">{stats.activeToday}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FILTERS - IDENTICO */}
      <div className="bg-white border-b border-slate-200 px-4 py-3">
        <div className="max-w-4xl mx-auto space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Cerca proprietà..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
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
                      onClick={() => { setSortBy("next_checkout"); setShowSortMenu(false); }}
                      className={`w-full flex items-center gap-2 px-4 py-3.5 text-sm transition-colors touch-manipulation ${
                        sortBy === "next_checkout" ? "bg-sky-50 text-sky-700" : "text-slate-700 active:bg-slate-100"
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7" />
                      </svg>
                      <span>Prossimo Checkout</span>
                      {sortBy === "next_checkout" && (
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

      {/* CALENDARIO - IDENTICO a PulizieView */}
      <div className="px-4 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200">

            {/* Navigation header - IDENTICO */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
              <button
                onClick={() => navigateCalendar(-1)}
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
                  className="px-2 py-1 text-[10px] font-medium text-sky-600 bg-sky-50 rounded-md"
                >
                  Oggi
                </button>
              </div>
              <button
                onClick={() => navigateCalendar(1)}
                className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Header giorni - IDENTICO */}
            <div
              ref={headerRef}
              className="overflow-x-auto sticky top-[68px] z-40 bg-white"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              <div className="grid border-b-2 border-slate-200 bg-slate-50" style={{ gridTemplateColumns: `repeat(${ganttDays.length}, 60px)` }}>
                {ganttDays.map((day, i) => (
                  <div key={i} className={`py-2 text-center border-r border-slate-200 last:border-r-0 ${day.isToday ? "bg-emerald-100" : "bg-slate-50"}`}>
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
            </div>

            {/* Griglia proprietà - IDENTICO */}
            <div
              ref={calendarRef}
              className="overflow-x-auto"
              onScroll={(e) => {
                if (headerRef.current) {
                  headerRef.current.scrollLeft = e.currentTarget.scrollLeft;
                }
              }}
            >
              {filteredProperties.length === 0 ? (
                <div className="p-8 text-center text-slate-500">Nessuna proprietà trovata</div>
              ) : (
                filteredProperties.map((property) => {
                  const propertyBookings = validBookings.filter(b => b.propertyId === property.id);

                  return (
                    <div key={property.id} className="relative h-[70px] border-b-2 border-slate-200 last:border-b-0" style={{ width: `${ganttDays.length * 60}px` }}>

                      {/* Badge nome proprietà - IDENTICO */}
                      <div
                        className="h-5 flex items-center gap-1.5 pl-1.5 pr-3 rounded-br-lg shadow-md sticky left-0 w-fit"
                        style={{
                          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)',
                          zIndex: 10,
                          marginBottom: '-20px',
                          boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)'
                        }}
                      >
                        <div className="w-4 h-4 rounded bg-white/25 flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-[8px] font-bold drop-shadow-sm">{property.name.charAt(0)}</span>
                        </div>
                        <span className="text-white text-[10px] font-semibold whitespace-nowrap drop-shadow-sm">{property.name}</span>
                        {property.address && (
                          <>
                            <span className="text-white/60 text-[10px]">-</span>
                            <span className="text-white/80 text-[9px] whitespace-nowrap drop-shadow-sm">{cleanAddress(property.address)}</span>
                          </>
                        )}
                      </div>

                      {/* Griglia sfondo - IDENTICO */}
                      <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${ganttDays.length}, 60px)` }}>
                        {ganttDays.map((day, i) => (
                          <div key={i} className={`border-r border-slate-200 last:border-r-0 ${day.isToday ? "bg-emerald-50" : ""}`} />
                        ))}
                      </div>

                      {/* PRENOTAZIONI come barre orizzontali */}
                      {propertyBookings.map((booking) => {
                        const pos = getBookingPosition(booking);
                        if (!pos) return null;

                        const isCoToday = isCheckoutToday(booking);
                        const sourceStyle = getSourceColor(booking.source);
                        const colorClass = isCoToday ? "from-amber-400 to-orange-500" : sourceStyle.gradient;

                        return (
                          <div
                            key={booking.id}
                            className={`absolute top-[24px] bg-gradient-to-r ${colorClass} rounded-lg shadow-lg flex items-center px-2 cursor-pointer hover:scale-y-110 active:scale-95 transition-transform z-10`}
                            style={{ left: `${pos.left}px`, width: `${pos.width}px`, height: "42px" }}
                            onClick={() => setSelectedBooking(booking)}
                          >
                            <span className="text-white text-[10px] font-bold truncate drop-shadow">
                              {cleanGuestName(booking.guestName, booking.source)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>

            {/* Legenda - IDENTICO */}
            <div className="p-3 border-t border-slate-200 bg-slate-50">
              <div className="flex flex-wrap justify-center gap-3 text-[10px]">
                {[
                  { gradient: "from-rose-400 to-red-500", label: "Airbnb" },
                  { gradient: "from-blue-400 to-blue-600", label: "Booking" },
                  { gradient: "from-violet-400 to-purple-500", label: "Octorate" },
                  { gradient: "from-emerald-400 to-teal-500", label: "Krossbooking" },
                  { gradient: "from-amber-400 to-orange-500", label: "Checkout oggi" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <div className={`w-4 h-4 rounded bg-gradient-to-r ${item.gradient} shadow`}></div>
                    <span className="text-slate-600">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Dettaglio Prenotazione */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSelectedBooking(null)} />
          <div className="relative bg-white rounded-2xl w-full max-w-sm mx-auto shadow-2xl overflow-hidden">
            {(() => {
              const property = properties.find(p => p.id === selectedBooking.propertyId);
              const ci = parseDateString(selectedBooking.checkIn);
              const co = parseDateString(selectedBooking.checkOut);
              const nights = Math.ceil(
                (new Date(co.year, co.month, co.day).getTime() -
                 new Date(ci.year, ci.month, ci.day).getTime()) / (1000 * 60 * 60 * 24)
              );
              const sourceStyle = getSourceColor(selectedBooking.source);

              return (
                <div className="p-4">
                  <div className={`h-1.5 rounded-full bg-gradient-to-r ${sourceStyle.gradient} mb-4`}></div>

                  <h3 className="text-lg font-bold text-slate-800 mb-1">{property?.name}</h3>
                  <p className="text-sm text-slate-500 mb-4">{property?.address}</p>

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
                      <span className={`px-2 py-1 rounded-lg text-xs font-medium ${sourceStyle.badge}`}>
                        {sourceStyle.label}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-emerald-50 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14" />
                        </svg>
                        <span className="text-xs font-medium text-emerald-600">Check-in</span>
                      </div>
                      <p className="text-lg font-bold text-slate-800">
                        {ci.day.toString().padStart(2, '0')}/{(ci.month + 1).toString().padStart(2, '0')}/{ci.year}
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
                        {co.day.toString().padStart(2, '0')}/{(co.month + 1).toString().padStart(2, '0')}/{co.year}
                      </p>
                    </div>
                  </div>

                  <div className="bg-sky-50 rounded-xl p-3 mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                      </svg>
                      <span className="text-sm font-medium text-sky-600">Durata soggiorno</span>
                    </div>
                    <span className="text-lg font-bold text-slate-800">{nights} {nights === 1 ? 'notte' : 'notti'}</span>
                  </div>

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
    </div>
  );
}
