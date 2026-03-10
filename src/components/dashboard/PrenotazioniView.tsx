"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { isSameDay, getDateString } from "~/lib/dateUtils";
import ManualBookingForm from "~/components/booking/ManualBookingForm";
import EditBookingModal from "~/components/booking/EditBookingModal";
import { getCalendarState, setCalendarDate, setCalendarScroll } from "~/lib/stores/calendarStateStore";

interface Property {
  id: string;
  name: string;
  address: string;
  imageUrl?: string;
  maxGuests?: number;
  icalUrl?: string;
}

interface Booking {
  id: string;
  propertyId: string;
  guestName: string;
  checkIn: Date | string;
  checkOut: Date | string;
  status: string;
  source?: string;
  isManual?: boolean;
  guests?: number;
  guestsCount?: number;
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

const PROPERTY_COLORS = ["#6366f1","#f59e0b","#10b981","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316"];

export function PrenotazioniView({ properties, bookings, isAdmin = false }: PrenotazioniViewProps) {
  const [currentDate, setCurrentDateRaw] = useState(() => getCalendarState("prenotazioni").currentDate);
  const setCurrentDate = (d: Date) => { setCalendarDate("prenotazioni", d); setCurrentDateRaw(d); };
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [sortBy, setSortBy] = useState<string>("next_checkout");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [showBookingForm, setShowBookingForm] = useState(false);

  const calendarRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const isScrollSyncing = useRef(false);

  // Chiudi dropdown search quando si scrolla
  useEffect(() => {
    if (!searchFocused) return;
    const handleScroll = () => { setSearchFocused(false); setSearchTerm(""); };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [searchFocused]);

  // Apri automaticamente modal se c'è openBooking nell'URL (solo lato client)
  useEffect(() => {
    if (typeof window === 'undefined' || bookings.length === 0) return;
    
    const urlParams = new URLSearchParams(window.location.search);
    const openBookingId = urlParams.get('openBooking');
    
    if (openBookingId) {
      const booking = bookings.find(b => b.id === openBookingId);
      if (booking) {
        setSelectedBooking(booking);
        // Rimuovi il parametro dall'URL senza reload
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, [bookings]);

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

    if (selectedPropertyIds.length > 0) {
      filtered = filtered.filter(p => selectedPropertyIds.includes(p.id));
    } else if (searchTerm) {
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
  }, [properties, searchTerm, selectedPropertyIds, sortBy, validBookings]);

  // Statistiche
  const stats = useMemo(() => {
    const todayStr = getDateString(today);
    
    // Check-in oggi
    const checkinsToday = validBookings.filter(b => {
      const ci = parseDateString(b.checkIn);
      return getDateString(new Date(ci.year, ci.month, ci.day)) === todayStr;
    }).length;

    // Check-out oggi
    const checkoutsToday = validBookings.filter(b => {
      const co = parseDateString(b.checkOut);
      return getDateString(new Date(co.year, co.month, co.day)) === todayStr;
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
        isToday: isSameDay(date, today),
        isSunday: date.getDay() === 0
      });
    }
    return days;
  }, [currentDate]);

  const monthName = currentDate.toLocaleDateString("it-IT", { month: "long", year: "numeric" });

  const navigateCalendar = (direction: number) => {
    // FIX: Usa giorno 1 per evitare overflow mese (es: 31 gen -> 3 mar invece di 28 feb)
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + direction, 1));
  };

  // Auto-scroll al giorno corrente
  useEffect(() => {
    const cached = getCalendarState("prenotazioni");
    let scrollPosition: number;
    
    if (cached.scrollLeft >= 0) {
      // Usa posizione salvata dalla cache
      scrollPosition = cached.scrollLeft;
    } else {
      // Calcola posizione per il giorno corrente
      const todayIndex = ganttDays.findIndex(d => d.isToday);
      const cellWidth = 60;
      scrollPosition = todayIndex !== -1 
        ? Math.max(0, (todayIndex * cellWidth) - 150)
        : 0;
    }

    // Scroll IMMEDIATO, senza setTimeout
    if (calendarRef.current) {
      calendarRef.current.scrollLeft = scrollPosition;
    }
    if (headerRef.current) {
      headerRef.current.scrollLeft = scrollPosition;
    }
  }, [currentDate, ganttDays]);

  // Sincronizza iCal
  const syncAllIcal = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync-all-ical", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        // I listener Firestore aggiorneranno automaticamente la UI
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
    return isSameDay(new Date(co.year, co.month, co.day), today);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-4">
      <style>{`
        @keyframes banner-aurora { 0%, 100% { transform: translate(0, 0); } 33% { transform: translate(2%, -1.5%); } 66% { transform: translate(-1.5%, 2%); } }
      `}</style>

      {/* HEADER — Dark banner con foto Airbnb/Booking */}
      <div className="relative overflow-hidden" style={{ background: "#0b0b18", padding: "18px 18px 20px" }}>
        {/* BG foto */}
        <div className="absolute inset-0" style={{ backgroundImage: "url('data:image/jpeg;base64,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')", backgroundSize: "cover", backgroundPosition: "center 15%", opacity: 0.55 }} />
        {/* Gradient */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(11,11,24,0.2) 0%, rgba(11,11,24,0.5) 40%, rgba(11,11,24,0.88) 100%)" }} />
        {/* Aurora */}
        <div className="absolute overflow-hidden" style={{ width: "280%", height: "280%", top: "-90%", left: "-90%", opacity: 0.2, background: "radial-gradient(ellipse 400px 300px at 15% 45%, rgba(56,189,248,0.25) 0%, transparent 70%), radial-gradient(ellipse 350px 250px at 75% 35%, rgba(99,102,241,0.18) 0%, transparent 70%)", animation: "banner-aurora 16s ease-in-out infinite" }} />

        <div className="relative z-10 max-w-4xl mx-auto">
          {/* Header row */}
          <div className="flex items-center justify-between" style={{ marginBottom: "40px" }}>
            <div>
              <div>
                <h1 className="text-[16px] font-bold text-white" style={{ textShadow: "0 2px 6px rgba(0,0,0,0.5)" }}>
                  {isAdmin ? "Calendario " : "Le Mie "}
                  <span style={{ background: "linear-gradient(135deg,#7dd3fc,#38bdf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                    Prenotazioni
                  </span>
                </h1>
                <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.7)", marginTop: "1px", textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}>
                  Gestisci le prenotazioni iCal
                </p>
              </div>
            </div>
            <div className="flex items-center gap-[6px]">
              <button
                onClick={() => setShowBookingForm(true)}
                className="flex items-center gap-1 transition-all"
                style={{ padding: "6px 10px", borderRadius: "8px", background: "rgba(56,189,248,0.3)", border: "1px solid rgba(56,189,248,0.4)", backdropFilter: "blur(10px)" }}
              >
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                <span className="text-white text-[10px] font-bold">Nuova</span>
              </button>
              <button
                onClick={syncAllIcal}
                disabled={syncing}
                className="flex items-center gap-1 transition-all disabled:opacity-50"
                style={{ padding: "6px 10px", borderRadius: "8px", background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.15)", backdropFilter: "blur(10px)" }}
              >
                {syncing ? (
                  <svg className="w-3 h-3 text-white animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                ) : (
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                )}
                <span className="text-white text-[10px] font-bold">{syncing ? "Sync..." : "Sync"}</span>
              </button>
            </div>
          </div>

          {/* Stats colorati */}
          <div className="grid grid-cols-3 gap-2">
            <div style={{ background: "linear-gradient(135deg, rgba(56,189,248,0.18) 0%, rgba(14,165,233,0.06) 100%)", backdropFilter: "blur(12px)", borderRadius: "12px", padding: "10px 12px", border: "1px solid rgba(56,189,248,0.2)" }}>
              <div className="flex items-center gap-1 mb-1">
                <svg className="w-[11px] h-[11px]" viewBox="0 0 24 24" fill="none" stroke="#7dd3fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M13.8 12H3"/></svg>
                <p className="text-[9px] font-bold uppercase" style={{ color: "#7dd3fc", letterSpacing: "1px" }}>Check-in</p>
              </div>
              <p className="text-[22px] font-extrabold text-white" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.2)" }}>{stats.checkinsToday}</p>
              <p className="text-[8px]" style={{ color: "rgba(255,255,255,0.5)", marginTop: "1px" }}>oggi</p>
            </div>
            <div style={{ background: "linear-gradient(135deg, rgba(251,113,133,0.18) 0%, rgba(244,63,94,0.06) 100%)", backdropFilter: "blur(12px)", borderRadius: "12px", padding: "10px 12px", border: "1px solid rgba(251,113,133,0.2)" }}>
              <div className="flex items-center gap-1 mb-1">
                <svg className="w-[11px] h-[11px]" viewBox="0 0 24 24" fill="none" stroke="#fda4af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M19.8 12H9"/></svg>
                <p className="text-[9px] font-bold uppercase" style={{ color: "#fda4af", letterSpacing: "1px" }}>Check-out</p>
              </div>
              <p className="text-[22px] font-extrabold text-white" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.2)" }}>{stats.checkoutsToday}</p>
              <p className="text-[8px]" style={{ color: "rgba(255,255,255,0.5)", marginTop: "1px" }}>oggi</p>
            </div>
            <div style={{ background: "linear-gradient(135deg, rgba(52,211,153,0.18) 0%, rgba(16,185,129,0.06) 100%)", backdropFilter: "blur(12px)", borderRadius: "12px", padding: "10px 12px", border: "1px solid rgba(52,211,153,0.2)" }}>
              <div className="flex items-center gap-1 mb-1">
                <svg className="w-[11px] h-[11px]" viewBox="0 0 24 24" fill="none" stroke="#6ee7b7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
                <p className="text-[9px] font-bold uppercase" style={{ color: "#6ee7b7", letterSpacing: "1px" }}>Attive</p>
              </div>
              <p className="text-[22px] font-extrabold text-white" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.2)" }}>{stats.activeToday}</p>
              <p className="text-[8px]" style={{ color: "rgba(255,255,255,0.5)", marginTop: "1px" }}>in corso</p>
            </div>
          </div>
        </div>
      </div>


      {/* FILTERS — Multiselect come PulizieView */}
      <div className="bg-white border-b border-slate-200 px-4 py-2.5">
        <div className="max-w-4xl mx-auto">
          {/* Search + Sort sulla stessa riga */}
          <div className="flex items-center gap-2">
            {/* Search multiselect */}
            <div className="relative flex-1 min-w-0">
            <div 
              className="flex items-center flex-wrap gap-[5px] min-h-[40px] py-1.5 pl-2 pr-3 bg-slate-50 border border-slate-200 rounded-[10px] focus-within:ring-2 focus-within:ring-violet-500 focus-within:border-transparent cursor-text"
              onClick={() => setSearchFocused(true)}
            >
              <svg className="w-[14px] h-[14px] text-slate-400 flex-shrink-0 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {selectedPropertyIds.map(id => {
                const p = properties.find(pr => pr.id === id);
                if (!p) return null;
                const idx = properties.indexOf(p);
                return (
                  <div key={id} className="flex items-center gap-[4px] py-[3px] pl-[3px] pr-[6px] rounded-[7px] bg-violet-50 border border-violet-200">
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt="" className="w-[22px] h-[22px] rounded-[5px] object-cover" />
                    ) : (
                      <div className="w-[22px] h-[22px] rounded-[5px] flex items-center justify-center text-white text-[9px] font-bold"
                        style={{ background: PROPERTY_COLORS[idx % PROPERTY_COLORS.length] }}
                      >
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-[11px] font-semibold text-violet-700 max-w-[80px] truncate">{p.name}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedPropertyIds(prev => prev.filter(x => x !== id)); }}
                      className="flex items-center justify-center w-[14px] h-[14px] rounded-full bg-violet-200 hover:bg-violet-300 transition-colors ml-[2px]"
                    >
                      <svg className="w-[8px] h-[8px] text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                  </div>
                );
              })}
              <input
                type="text"
                placeholder={selectedPropertyIds.length > 0 ? "Aggiungi..." : "Cerca proprietà..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                className="flex-1 min-w-[80px] py-1 bg-transparent text-[13px] focus:outline-none"
              />
              {(selectedPropertyIds.length > 0 || searchTerm) && (
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedPropertyIds([]); setSearchTerm(""); }}
                  className="flex items-center justify-center w-[20px] h-[20px] rounded-full bg-slate-200 hover:bg-slate-300 transition-colors flex-shrink-0"
                >
                  <svg className="w-[10px] h-[10px] text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              )}
            </div>
            {/* Multiselect dropdown */}
            {searchFocused && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl border border-slate-200 shadow-xl z-[60] overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-100">
                    <span className="text-[11px] font-semibold text-slate-500">
                      {selectedPropertyIds.length > 0 
                        ? `${selectedPropertyIds.length} selezionat${selectedPropertyIds.length === 1 ? "a" : "e"}`
                        : "Seleziona proprietà"
                      }
                    </span>
                    <div className="flex items-center gap-2">
                      {selectedPropertyIds.length > 0 && (
                        <button onClick={() => setSelectedPropertyIds([])} className="text-[10px] font-semibold text-slate-400 hover:text-slate-600 transition-colors">Deseleziona</button>
                      )}
                      <button
                        onClick={() => { setSearchFocused(false); setSearchTerm(""); }}
                        className="flex items-center gap-1 px-3 py-[5px] rounded-[7px] text-[10px] font-bold text-white transition-colors"
                        style={{ background: "#6366f1" }}
                      >
                        <svg className="w-[10px] h-[10px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>
                        OK
                      </button>
                    </div>
                  </div>
                  <div className="max-h-[220px] overflow-y-auto">
                    {properties
                      .filter(p => {
                        if (!searchTerm) return true;
                        return p.name.toLowerCase().includes(searchTerm.toLowerCase()) || (p.address && p.address.toLowerCase().includes(searchTerm.toLowerCase()));
                      })
                      .map((p, i) => {
                        const isSelected = selectedPropertyIds.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            onClick={() => { 
                              if (isSelected) setSelectedPropertyIds(prev => prev.filter(x => x !== p.id));
                              else setSelectedPropertyIds(prev => [...prev, p.id]);
                              setSearchTerm("");
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 transition-colors text-left"
                            style={{ background: isSelected ? "#f5f3ff" : "transparent", borderBottom: "1px solid #f1f5f9" }}
                          >
                            {p.imageUrl ? (
                              <img src={p.imageUrl} alt="" className="w-[40px] h-[40px] rounded-[8px] object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-[40px] h-[40px] rounded-[8px] flex-shrink-0 flex items-center justify-center text-white text-[14px] font-bold"
                                style={{ background: PROPERTY_COLORS[i % PROPERTY_COLORS.length] }}
                              >
                                {p.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className={`text-[12px] font-bold truncate ${isSelected ? "text-violet-700" : "text-slate-800"}`}>{p.name}</div>
                              {p.address && <div className="text-[10px] text-slate-400 truncate">{cleanAddress(p.address)}</div>}
                            </div>
                            <div className="w-[22px] h-[22px] rounded-[6px] flex items-center justify-center flex-shrink-0 transition-all"
                              style={{ background: isSelected ? "#6366f1" : "transparent", border: isSelected ? "none" : "2px solid #cbd5e1" }}
                            >
                              {isSelected && (
                                <svg className="w-[13px] h-[13px] text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>
                              )}
                            </div>
                          </button>
                        );
                      })
                    }
                    {properties.filter(p => !searchTerm || p.name.toLowerCase().includes(searchTerm.toLowerCase()) || (p.address && p.address.toLowerCase().includes(searchTerm.toLowerCase()))).length === 0 && (
                      <div className="px-4 py-3 text-[11px] text-slate-400 text-center">Nessuna proprietà trovata</div>
                    )}
                  </div>
                </div>
            )}
          </div>

          {/* Sort button — affianco alla search */}
          <div className="relative flex-shrink-0">
              <button
                onClick={() => setShowSortMenu(!showSortMenu)}
                className="flex items-center gap-1 px-2 py-[10px] bg-slate-50 border border-slate-200 rounded-lg text-slate-500 hover:border-slate-300 transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg>
                <span className="text-[10px] font-bold">{sortBy === "name" ? "A-Z" : "Checkout"}</span>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {showSortMenu && (
                <>
                  <div className="fixed inset-0 z-50" onClick={() => setShowSortMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-slate-200 shadow-xl z-50 overflow-hidden min-w-[180px]">
                    <button onClick={() => { setSortBy("name"); setShowSortMenu(false); }} className={`w-full flex items-center gap-2 px-4 py-3 text-sm transition-colors ${sortBy === "name" ? "bg-violet-50 text-violet-700" : "text-slate-700 active:bg-slate-100"}`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9" /></svg>
                      <span>Ordine Alfabetico</span>
                      {sortBy === "name" && <svg className="w-4 h-4 ml-auto text-violet-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                    </button>
                    <button onClick={() => { setSortBy("next_checkout"); setShowSortMenu(false); }} className={`w-full flex items-center gap-2 px-4 py-3 text-sm transition-colors ${sortBy === "next_checkout" ? "bg-violet-50 text-violet-700" : "text-slate-700 active:bg-slate-100"}`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7" /></svg>
                      <span>Prossimo Checkout</span>
                      {sortBy === "next_checkout" && <svg className="w-4 h-4 ml-auto text-violet-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
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
              className="overflow-x-auto sticky top-0 z-40 bg-white"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              onScroll={(e) => {
                if (isScrollSyncing.current) return;
                isScrollSyncing.current = true;
                if (calendarRef.current) {
                  calendarRef.current.scrollLeft = e.currentTarget.scrollLeft;
                }
                isScrollSyncing.current = false;
              }}
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
                if (isScrollSyncing.current) return;
                isScrollSyncing.current = true;
                if (headerRef.current) {
                  headerRef.current.scrollLeft = e.currentTarget.scrollLeft;
                }
                setCalendarScroll("prenotazioni", e.currentTarget.scrollLeft);
                isScrollSyncing.current = false;
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

      {/* Modal Dettaglio/Modifica Prenotazione */}
      <EditBookingModal
        booking={selectedBooking}
        isOpen={selectedBooking !== null}
        onClose={() => setSelectedBooking(null)}
        onSuccess={() => {
          setSelectedBooking(null);
          // I listener Firestore aggiorneranno automaticamente la UI
        }}
        isAdmin={isAdmin}
        // @ts-expect-error TODO-FIX: TS2322 Type '{ booking: Booking | null; isOpen: boolean; onClose: () => void; onSuccess...
        maxGuests={selectedBooking ? (properties.find(p => p.id === selectedBooking.propertyId)?.maxGuests || 10) : 10}
      />

      {/* Modal Nuova Prenotazione */}
      <ManualBookingForm
        isOpen={showBookingForm}
        onClose={() => setShowBookingForm(false)}
        onSuccess={() => {
          setShowBookingForm(false);
          // I listener Firestore aggiorneranno automaticamente la UI
        }}
        properties={properties}
      />
    </div>
  );
}
