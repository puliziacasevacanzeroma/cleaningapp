"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";

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

interface CalendarioPrenotazioniMobileProps {
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

function getSourceInfo(source?: string): { color: string; bgColor: string; name: string; icon: string } {
  switch (source) {
    case "booking":
      return { color: "text-blue-600", bgColor: "bg-blue-500", name: "Booking", icon: "B" };
    case "airbnb":
      return { color: "text-rose-600", bgColor: "bg-gradient-to-r from-rose-500 to-red-500", name: "Airbnb", icon: "A" };
    case "oktorate":
      return { color: "text-violet-600", bgColor: "bg-gradient-to-r from-violet-500 to-purple-500", name: "Octorate", icon: "O" };
    case "krossbooking":
      return { color: "text-emerald-600", bgColor: "bg-gradient-to-r from-emerald-500 to-teal-500", name: "Kross", icon: "K" };
    case "inreception":
      return { color: "text-cyan-600", bgColor: "bg-gradient-to-r from-cyan-500 to-blue-500", name: "InRec", icon: "I" };
    default:
      return { color: "text-slate-600", bgColor: "bg-slate-500", name: "Manuale", icon: "M" };
  }
}

function formatDate(date: { day: number; month: number; year: number }): string {
  return `${date.day.toString().padStart(2, '0')}/${(date.month + 1).toString().padStart(2, '0')}`;
}

function getDayName(date: Date): string {
  return date.toLocaleDateString("it-IT", { weekday: "short" }).slice(0, 3);
}

export function CalendarioPrenotazioniMobile({ properties, bookings }: CalendarioPrenotazioniMobileProps) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedProperty, setSelectedProperty] = useState<string>("all");
  const [showPropertyFilter, setShowPropertyFilter] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [viewMode, setViewMode] = useState<"day" | "week">("day");
  const [showBookingDetail, setShowBookingDetail] = useState<Booking | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Filtra prenotazioni valide (no blocchi)
  const validBookings = useMemo(() => {
    return bookings.filter(b => !isBlockedEntry(b.guestName, b.source));
  }, [bookings]);

  // Genera array di giorni per la settimana
  const weekDays = useMemo(() => {
    const days = [];
    const startOfWeek = new Date(selectedDate);
    const dayOfWeek = startOfWeek.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Inizia da lunedì
    startOfWeek.setDate(startOfWeek.getDate() + diff);

    for (let i = 0; i < 7; i++) {
      const day = new Date(startOfWeek);
      day.setDate(startOfWeek.getDate() + i);
      days.push(day);
    }
    return days;
  }, [selectedDate]);

  // Filtra prenotazioni per data e proprietà
  const getBookingsForDate = useCallback((date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    
    return validBookings.filter(booking => {
      if (selectedProperty !== "all" && booking.propertyId !== selectedProperty) {
        return false;
      }

      const checkIn = parseDateString(booking.checkIn);
      const checkOut = parseDateString(booking.checkOut);
      
      const checkInDate = new Date(checkIn.year, checkIn.month, checkIn.day);
      const checkOutDate = new Date(checkOut.year, checkOut.month, checkOut.day);
      const targetDate = new Date(date);
      targetDate.setHours(0, 0, 0, 0);
      checkInDate.setHours(0, 0, 0, 0);
      checkOutDate.setHours(0, 0, 0, 0);

      // La prenotazione è attiva se: checkIn <= date < checkOut
      return checkInDate <= targetDate && targetDate < checkOutDate;
    });
  }, [validBookings, selectedProperty]);

  // Prenotazioni per il giorno selezionato
  const bookingsForSelectedDate = useMemo(() => {
    return getBookingsForDate(selectedDate);
  }, [selectedDate, getBookingsForDate]);

  // Checkout oggi
  const checkoutsToday = useMemo(() => {
    return validBookings.filter(booking => {
      if (selectedProperty !== "all" && booking.propertyId !== selectedProperty) {
        return false;
      }
      const checkOut = parseDateString(booking.checkOut);
      const checkOutDate = new Date(checkOut.year, checkOut.month, checkOut.day);
      checkOutDate.setHours(0, 0, 0, 0);
      return checkOutDate.getTime() === selectedDate.getTime();
    });
  }, [validBookings, selectedDate, selectedProperty]);

  // Check-in oggi
  const checkinsToday = useMemo(() => {
    return validBookings.filter(booking => {
      if (selectedProperty !== "all" && booking.propertyId !== selectedProperty) {
        return false;
      }
      const checkIn = parseDateString(booking.checkIn);
      const checkInDate = new Date(checkIn.year, checkIn.month, checkIn.day);
      checkInDate.setHours(0, 0, 0, 0);
      return checkInDate.getTime() === selectedDate.getTime();
    });
  }, [validBookings, selectedDate, selectedProperty]);

  // Touch handlers per swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current;
    const threshold = 50;

    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        // Swipe left - giorno successivo
        navigateDate(1);
      } else {
        // Swipe right - giorno precedente
        navigateDate(-1);
      }
    }
  };

  const navigateDate = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    setSelectedDate(newDate);
  };

  const goToToday = () => {
    setSelectedDate(new Date());
  };

  const syncAllIcal = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync-all-ical", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        alert(`✅ Sincronizzazione completata!\n\nNuove: ${data.stats.totalNew}\nAggiornate: ${data.stats.totalUpdated}\nPulizie create: ${data.stats.totalCleaningsCreated || 0}`);
        window.location.reload();
      } else {
        alert("❌ Errore: " + data.error);
      }
    } catch (e) {
      alert("❌ Errore di connessione");
    }
    setSyncing(false);
  };

  const getPropertyById = (id: string) => properties.find(p => p.id === id);

  const isToday = (date: Date) => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return t.getTime() === d.getTime();
  };

  const isSelected = (date: Date) => {
    const s = new Date(selectedDate);
    s.setHours(0, 0, 0, 0);
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return s.getTime() === d.getTime();
  };

  const selectedPropertyName = selectedProperty === "all" 
    ? "Tutte le proprietà" 
    : properties.find(p => p.id === selectedProperty)?.name || "Proprietà";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50/30 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-xl border-b border-slate-200/60">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-800">Prenotazioni</h1>
                <p className="text-xs text-slate-500">{selectedPropertyName}</p>
              </div>
            </div>
            <button
              onClick={syncAllIcal}
              disabled={syncing}
              className="p-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl shadow-lg disabled:opacity-50"
            >
              <svg className={`w-5 h-5 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          {/* Week Strip */}
          <div className="flex items-center gap-2 mb-3">
            <button 
              onClick={() => navigateDate(-7)} 
              className="p-2 rounded-lg hover:bg-slate-100 active:scale-95 transition-all"
            >
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <div className="flex-1 flex justify-between">
              {weekDays.map((day, index) => {
                const dayBookings = getBookingsForDate(day);
                const hasBookings = dayBookings.length > 0;
                
                return (
                  <button
                    key={index}
                    onClick={() => setSelectedDate(day)}
                    className={`flex flex-col items-center py-2 px-2 rounded-xl transition-all ${
                      isSelected(day)
                        ? 'bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/30'
                        : isToday(day)
                        ? 'bg-sky-50 text-sky-600'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className={`text-[10px] font-medium uppercase ${isSelected(day) ? 'text-white/80' : ''}`}>
                      {getDayName(day)}
                    </span>
                    <span className={`text-sm font-bold ${isSelected(day) ? 'text-white' : ''}`}>
                      {day.getDate()}
                    </span>
                    {hasBookings && !isSelected(day) && (
                      <div className="w-1.5 h-1.5 rounded-full bg-sky-500 mt-0.5"></div>
                    )}
                    {hasBookings && isSelected(day) && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white mt-0.5"></div>
                    )}
                  </button>
                );
              })}
            </div>

            <button 
              onClick={() => navigateDate(7)} 
              className="p-2 rounded-lg hover:bg-slate-100 active:scale-95 transition-all"
            >
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Filtro Proprietà + Vai a Oggi */}
          <div className="flex gap-2">
            <button
              onClick={() => setShowPropertyFilter(true)}
              className="flex-1 flex items-center justify-between px-3 py-2 bg-slate-50 rounded-xl border border-slate-200"
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <span className="text-sm text-slate-700 truncate max-w-[150px]">{selectedPropertyName}</span>
              </div>
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <button
              onClick={goToToday}
              className="px-4 py-2 bg-sky-50 text-sky-600 rounded-xl border border-sky-200 font-medium text-sm"
            >
              Oggi
            </button>
          </div>
        </div>
      </div>

      {/* Main Content con Swipe */}
      <div
        ref={scrollContainerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="px-4 py-4"
      >
        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-lg bg-sky-100 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </div>
            </div>
            <p className="text-xl font-bold text-slate-800">{bookingsForSelectedDate.length}</p>
            <p className="text-[10px] text-slate-500">Occupate</p>
          </div>

          <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </div>
            </div>
            <p className="text-xl font-bold text-slate-800">{checkoutsToday.length}</p>
            <p className="text-[10px] text-slate-500">Check-out</p>
          </div>

          <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
              </div>
            </div>
            <p className="text-xl font-bold text-slate-800">{checkinsToday.length}</p>
            <p className="text-[10px] text-slate-500">Check-in</p>
          </div>
        </div>

        {/* Date Header */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-slate-800">
            {selectedDate.toLocaleDateString("it-IT", { 
              weekday: 'long', 
              day: 'numeric', 
              month: 'long' 
            })}
          </h2>
          <span className="text-xs text-slate-500">
            Scorri per cambiare giorno →
          </span>
        </div>

        {/* Bookings List */}
        {bookingsForSelectedDate.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 border border-slate-100 shadow-sm text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-slate-600 font-medium">Nessuna prenotazione</p>
            <p className="text-sm text-slate-400 mt-1">Non ci sono soggiorni attivi per questa data</p>
          </div>
        ) : (
          <div className="space-y-3">
            {bookingsForSelectedDate.map((booking) => {
              const property = getPropertyById(booking.propertyId);
              const sourceInfo = getSourceInfo(booking.source);
              const checkIn = parseDateString(booking.checkIn);
              const checkOut = parseDateString(booking.checkOut);
              const isCheckoutDay = (() => {
                const co = new Date(checkOut.year, checkOut.month, checkOut.day);
                co.setHours(0, 0, 0, 0);
                const sel = new Date(selectedDate);
                sel.setHours(0, 0, 0, 0);
                return co.getTime() === sel.getTime();
              })();
              const isCheckinDay = (() => {
                const ci = new Date(checkIn.year, checkIn.month, checkIn.day);
                ci.setHours(0, 0, 0, 0);
                const sel = new Date(selectedDate);
                sel.setHours(0, 0, 0, 0);
                return ci.getTime() === sel.getTime();
              })();

              return (
                <div
                  key={booking.id}
                  onClick={() => setShowBookingDetail(booking)}
                  className={`bg-white rounded-2xl border shadow-sm overflow-hidden active:scale-[0.98] transition-transform ${
                    isCheckoutDay ? 'border-amber-200' : isCheckinDay ? 'border-emerald-200' : 'border-slate-100'
                  }`}
                >
                  {/* Color bar */}
                  <div className={`h-1 ${sourceInfo.bgColor}`}></div>
                  
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-slate-800 truncate">
                          {property?.name || "Proprietà"}
                        </h3>
                        <p className="text-xs text-slate-500 truncate">{property?.address}</p>
                      </div>
                      <div className={`px-2 py-1 rounded-lg text-xs font-medium ${sourceInfo.color} bg-opacity-10`} style={{ backgroundColor: `currentColor`, opacity: 0.1 }}>
                        <span className={sourceInfo.color}>{sourceInfo.name}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
                        <span className="text-sm font-medium text-slate-700">
                          {cleanGuestName(booking.guestName, booking.source)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`flex items-center gap-1.5 ${isCheckinDay ? 'text-emerald-600' : 'text-slate-500'}`}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14" />
                          </svg>
                          <span className="text-xs font-medium">{formatDate(checkIn)}</span>
                        </div>
                        <div className={`flex items-center gap-1.5 ${isCheckoutDay ? 'text-amber-600' : 'text-slate-500'}`}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H3" />
                          </svg>
                          <span className="text-xs font-medium">{formatDate(checkOut)}</span>
                        </div>
                      </div>

                      {isCheckoutDay && (
                        <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-semibold">
                          CHECK-OUT
                        </span>
                      )}
                      {isCheckinDay && (
                        <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-semibold">
                          CHECK-IN
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Legenda Sources */}
        <div className="mt-6 bg-white rounded-2xl p-4 border border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Fonti prenotazioni</h3>
          <div className="flex flex-wrap gap-2">
            {[
              { source: "airbnb", name: "Airbnb" },
              { source: "booking", name: "Booking" },
              { source: "oktorate", name: "Octorate" },
              { source: "krossbooking", name: "Krossbooking" },
            ].map(({ source, name }) => {
              const info = getSourceInfo(source);
              return (
                <div key={source} className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 rounded-full">
                  <div className={`w-2.5 h-2.5 rounded-full ${info.bgColor}`}></div>
                  <span className="text-xs font-medium text-slate-600">{name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Property Filter Modal */}
      {showPropertyFilter && (
        <>
          <div 
            className="fixed inset-0 bg-black/50 z-50" 
            onClick={() => setShowPropertyFilter(false)} 
          />
          <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-50 max-h-[70vh] overflow-hidden">
            <div className="p-4">
              <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto mb-4"></div>
              <h3 className="text-lg font-bold text-slate-800 mb-4">Seleziona Proprietà</h3>
              
              <div className="space-y-2 max-h-[50vh] overflow-y-auto pb-4">
                <button
                  onClick={() => {
                    setSelectedProperty("all");
                    setShowPropertyFilter(false);
                  }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${
                    selectedProperty === "all" ? 'bg-sky-50 border-2 border-sky-500' : 'hover:bg-slate-50 border-2 border-transparent'
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-semibold text-slate-800">Tutte le proprietà</p>
                    <p className="text-xs text-slate-500">{properties.length} proprietà</p>
                  </div>
                  {selectedProperty === "all" && (
                    <svg className="w-5 h-5 text-sky-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>

                {properties.map((property, index) => {
                  const colors = [
                    "from-rose-400 to-rose-500",
                    "from-sky-400 to-sky-500",
                    "from-amber-400 to-amber-500",
                    "from-violet-400 to-violet-500",
                    "from-emerald-400 to-emerald-500",
                    "from-pink-400 to-pink-500",
                  ];
                  const colorClass = colors[index % colors.length];

                  return (
                    <button
                      key={property.id}
                      onClick={() => {
                        setSelectedProperty(property.id);
                        setShowPropertyFilter(false);
                      }}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${
                        selectedProperty === property.id ? 'bg-sky-50 border-2 border-sky-500' : 'hover:bg-slate-50 border-2 border-transparent'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colorClass} flex items-center justify-center`}>
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <p className="font-semibold text-slate-800 truncate">{property.name}</p>
                        <p className="text-xs text-slate-500 truncate">{property.address}</p>
                      </div>
                      {selectedProperty === property.id && (
                        <svg className="w-5 h-5 text-sky-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Booking Detail Modal */}
      {showBookingDetail && (
        <>
          <div 
            className="fixed inset-0 bg-black/50 z-50" 
            onClick={() => setShowBookingDetail(null)} 
          />
          <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-50 max-h-[80vh] overflow-hidden">
            <div className="p-4">
              <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto mb-4"></div>
              
              {(() => {
                const booking = showBookingDetail;
                const property = getPropertyById(booking.propertyId);
                const sourceInfo = getSourceInfo(booking.source);
                const checkIn = parseDateString(booking.checkIn);
                const checkOut = parseDateString(booking.checkOut);

                return (
                  <div>
                    {/* Header */}
                    <div className={`h-2 ${sourceInfo.bgColor} rounded-full mb-4`}></div>
                    
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-xl font-bold text-slate-800">{property?.name}</h3>
                        <p className="text-sm text-slate-500">{property?.address}</p>
                      </div>
                      <span className={`px-3 py-1.5 rounded-xl text-sm font-semibold ${sourceInfo.color}`} style={{ backgroundColor: 'currentColor', opacity: 0.15 }}>
                        <span className={sourceInfo.color}>{sourceInfo.name}</span>
                      </span>
                    </div>

                    {/* Guest */}
                    <div className="bg-slate-50 rounded-2xl p-4 mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-sm">
                          <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm text-slate-500">Ospite</p>
                          <p className="font-semibold text-slate-800">{cleanGuestName(booking.guestName, booking.source)}</p>
                        </div>
                      </div>
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="bg-emerald-50 rounded-2xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14" />
                          </svg>
                          <span className="text-sm font-medium text-emerald-600">Check-in</span>
                        </div>
                        <p className="text-lg font-bold text-slate-800">
                          {checkIn.day}/{checkIn.month + 1}/{checkIn.year}
                        </p>
                      </div>

                      <div className="bg-amber-50 rounded-2xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H3" />
                          </svg>
                          <span className="text-sm font-medium text-amber-600">Check-out</span>
                        </div>
                        <p className="text-lg font-bold text-slate-800">
                          {checkOut.day}/{checkOut.month + 1}/{checkOut.year}
                        </p>
                      </div>
                    </div>

                    {/* Nights */}
                    <div className="bg-sky-50 rounded-2xl p-4 mb-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <svg className="w-5 h-5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                          </svg>
                          <span className="text-sm font-medium text-sky-600">Durata soggiorno</span>
                        </div>
                        <span className="text-lg font-bold text-slate-800">
                          {(() => {
                            const ci = new Date(checkIn.year, checkIn.month, checkIn.day);
                            const co = new Date(checkOut.year, checkOut.month, checkOut.day);
                            const diffTime = Math.abs(co.getTime() - ci.getTime());
                            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                            return `${diffDays} notti`;
                          })()}
                        </span>
                      </div>
                    </div>

                    {/* Close Button */}
                    <button
                      onClick={() => setShowBookingDetail(null)}
                      className="w-full py-3 bg-slate-100 text-slate-700 rounded-xl font-semibold"
                    >
                      Chiudi
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
