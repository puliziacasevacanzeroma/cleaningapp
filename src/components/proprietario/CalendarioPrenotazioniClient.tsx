"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Booking {
  id: string;
  guestName: string;
  checkIn: string | Date;
  checkOut: string | Date;
  status?: string;
  guestsCount?: number | null;
  source?: string | null;
}

interface Property {
  id: string;
  name: string;
  address: string;
  bookings: Booking[];
}

interface Stats {
  properties: number;
  total: number;
  active: number;
  upcoming: number;
}

interface CalendarioPrenotazioniClientProps {
  properties: Property[];
  stats: Stats;
}

export function CalendarioPrenotazioniClient({ properties, stats }: CalendarioPrenotazioniClientProps) {
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ 
    bookings: { imported: number; updated: number }; 
    cleanings: { created: number };
    errors?: string[] 
  } | null>(null);
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

  const getBookingBars = (property: Property) => {
    const bars: { booking: Booking; startIndex: number; width: number; gradient: string; shadow: string }[] = [];
    
    property.bookings.forEach(booking => {
      const checkIn = new Date(booking.checkIn);
      const checkOut = new Date(booking.checkOut);
      checkIn.setHours(0, 0, 0, 0);
      checkOut.setHours(0, 0, 0, 0);
      
      const startIndex = days.findIndex(d => d.toDateString() === checkIn.toDateString());
      if (startIndex === -1) return;
      
      const durationDays = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
      const width = durationDays * 48;
      
      let gradient = "from-rose-400 via-rose-500 to-red-500";
      let shadow = "shadow-lg shadow-rose-500/30";
      const isCheckoutToday = checkOut.getTime() === today.getTime();
      const isPast = checkOut < today;
      const isNew = checkIn > today && (checkIn.getTime() - today.getTime()) < (3 * 24 * 60 * 60 * 1000);
      
      if (isPast) {
        gradient = "from-slate-300 via-slate-400 to-slate-500";
        shadow = "shadow-md shadow-slate-400/20";
      } else if (isCheckoutToday) {
        gradient = "from-amber-400 via-orange-500 to-orange-600";
        shadow = "shadow-lg shadow-orange-500/30";
      } else if (isNew) {
        gradient = "from-emerald-400 via-teal-500 to-teal-600";
        shadow = "shadow-lg shadow-emerald-500/30";
      }
      
      bars.push({ booking, startIndex, width, gradient, shadow });
    });
    
    return bars;
  };

  const navigateMonth = (direction: number) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + (direction * 7));
    setCurrentDate(newDate);
  };

  return (
    <>
      {/* Container che blocca scroll SOLO per questa pagina */}
      <div className="h-[calc(100vh-56px)] lg:h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-sky-50/30 p-4 flex flex-col">
        
        {/* HEADER */}
        <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/30">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-slate-800">Calendario Prenotazioni</h1>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Pulsante Sincronizza */}
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-sky-500 to-blue-600 text-white text-sm font-medium rounded-xl shadow-lg shadow-sky-500/30 hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {syncing ? "Sincronizzazione..." : "Sincronizza iCal"}
            </button>
            
            {/* Legenda */}
            <div className="hidden lg:flex flex-wrap items-center gap-2 text-[10px]">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gradient-to-br from-rose-400 to-red-500"></span>Confermata</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gradient-to-br from-amber-400 to-orange-500"></span>Check-out oggi</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gradient-to-br from-emerald-400 to-teal-500"></span>Nuova</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-300"></span>Passata</span>
            </div>
          </div>
        </div>

        {/* Risultato sincronizzazione */}
        {syncResult && (
          <div className={`flex-shrink-0 mb-3 p-3 rounded-xl text-sm ${syncResult.errors && syncResult.errors.length > 0 && syncResult.bookings.imported === 0 ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-700'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {syncResult.errors && syncResult.errors.length > 0 && syncResult.bookings.imported === 0 ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                <span>
                  <strong>{syncResult.bookings.imported}</strong> prenotazioni importate, 
                  <strong> {syncResult.cleanings.created}</strong> pulizie create
                  {syncResult.errors && syncResult.errors.length > 0 && (
                    <span className="text-amber-600 ml-2">({syncResult.errors.length} errori)</span>
                  )}
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
          <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-md shadow-sky-500/30">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <p className="text-xl font-bold text-slate-800">{stats.properties}</p>
                <p className="text-[10px] text-slate-500">Proprietà</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center shadow-md shadow-violet-500/30">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p className="text-xl font-bold text-slate-800">{stats.total}</p>
                <p className="text-[10px] text-slate-500">Totali</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-500/30">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-xl font-bold text-slate-800">{stats.active}</p>
                <p className="text-[10px] text-slate-500">Presenti</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md shadow-amber-500/30">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-xl font-bold text-slate-800">{stats.upcoming}</p>
                <p className="text-[10px] text-slate-500">In arrivo</p>
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
            <h3 className="font-bold text-slate-800">{currentDate.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}</h3>
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
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center shadow-md flex-shrink-0">
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
                      <div key={index} className={`w-12 flex-shrink-0 flex flex-col items-center justify-center border-r border-slate-200 ${isToday ? "bg-sky-100" : isSunday ? "bg-rose-50" : ""}`}>
                        <span className={`text-[9px] font-semibold uppercase ${isToday ? "text-sky-600" : isSunday ? "text-rose-500" : "text-slate-400"}`}>
                          {dayNames[day.getDay()]}
                        </span>
                        {isToday ? (
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center shadow-md">
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
                  {properties.map((property) => {
                    const bars = getBookingBars(property);
                    return (
                      <div key={property.id} className="h-12 flex border-b border-slate-100 relative">
                        {days.map((day, dayIndex) => {
                          const isToday = day.toDateString() === today.toDateString();
                          const isSunday = day.getDay() === 0;
                          return (
                            <div key={dayIndex} className={`w-12 flex-shrink-0 border-r border-slate-50 ${isToday ? "bg-sky-50" : isSunday ? "bg-rose-50/30" : ""}`} />
                          );
                        })}
                        {bars.map((bar, barIndex) => (
                          <div
                            key={barIndex}
                            className={`absolute top-1 bottom-1 rounded-lg bg-gradient-to-r ${bar.gradient} ${bar.shadow} flex items-center px-2 cursor-pointer hover:brightness-110 transition-all`}
                            style={{ left: `${bar.startIndex * 48}px`, width: `${bar.width}px` }}
                            title={`${bar.booking.guestName} - ${bar.booking.source || 'Manuale'}`}
                          >
                            <span className="text-[10px] font-semibold text-white truncate">{bar.booking.guestName || "Ospite"}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
