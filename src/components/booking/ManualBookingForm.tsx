"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, query, where, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

interface Property {
  id: string;
  name: string;
  address?: string;
  maxGuests?: number;
  icalUrl?: string;
}

interface ExistingBooking {
  id: string;
  guestName?: string;
  checkIn: Date;
  checkOut: Date;
  status: string;
  source?: string;
}

interface ManualBookingFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  properties: Property[];
  preselectedPropertyId?: string;
  preselectedDate?: Date;
}

function fmtKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Stessa funzione del calendario principale per escludere blocchi iCal
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

// ═══════════════════════════════════════════════════════════════
// CALENDARIO CON BARRE DI SFONDO PER PRENOTAZIONI ESISTENTI
// ═══════════════════════════════════════════════════════════════
function BookingCalendar({
  selectedCheckIn,
  selectedCheckOut,
  onSelectCheckIn,
  onSelectCheckOut,
  existingBookings,
  loading
}: {
  selectedCheckIn: string;
  selectedCheckOut: string;
  onSelectCheckIn: (date: string) => void;
  onSelectCheckOut: (date: string) => void;
  existingBookings: ExistingBooking[];
  loading: boolean;
}) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectingMode, setSelectingMode] = useState<"checkIn" | "checkOut">("checkIn");

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Genera settimane
  const weeks = useMemo(() => {
    const { year, month } = currentMonth;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;

    const allDays: (Date | null)[] = [];
    for (let i = 0; i < startDow; i++) allDays.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) allDays.push(new Date(year, month, d));
    while (allDays.length % 7 !== 0) allDays.push(null);

    const rows: (Date | null)[][] = [];
    for (let i = 0; i < allDays.length; i += 7) rows.push(allDays.slice(i, i + 7));
    return rows;
  }, [currentMonth]);

  // Prenotazioni attive
  const activeBookings = useMemo(() => existingBookings.filter(b => b.status !== "CANCELLED"), [existingBookings]);

  // Per ogni cella, calcola se fa parte di una prenotazione e la sua posizione
  // nella prenotazione (inizio, mezzo, fine, singolo)
  const cellBookingInfo = useMemo(() => {
    const map = new Map<string, { booking: ExistingBooking; position: "start" | "middle" | "end" | "single" | "startEnd" }>();

    activeBookings.forEach(b => {
      // Normalizza le date usando solo anno/mese/giorno per evitare problemi timezone
      const bStart = new Date(b.checkIn);
      const bEnd = new Date(b.checkOut);
      
      // Usa fmtKey direttamente sulle date originali per ottenere il giorno corretto
      const startKey = fmtKey(bStart);
      const endKey = fmtKey(bEnd);

      if (startKey === endKey) {
        if (!map.has(startKey)) {
          map.set(startKey, { booking: b, position: "single" });
        }
        return;
      }

      // Itera giorno per giorno usando le date normalizzate a mezzanotte
      const current = new Date(bStart.getFullYear(), bStart.getMonth(), bStart.getDate());
      const endNorm = new Date(bEnd.getFullYear(), bEnd.getMonth(), bEnd.getDate());
      
      while (current <= endNorm) {
        const key = fmtKey(current);
        const isStart = key === startKey;
        const isEnd = key === endKey;

        if (!map.has(key)) {
          if (isStart) {
            map.set(key, { booking: b, position: "start" });
          } else if (isEnd) {
            map.set(key, { booking: b, position: "end" });
          } else {
            map.set(key, { booking: b, position: "middle" });
          }
        } else {
          // Giorno con più prenotazioni (es. checkout di una + checkin di un'altra)
          if (isStart || isEnd) {
            const existing = map.get(key)!;
            if ((existing.position === "end" && isStart) || (existing.position === "start" && isEnd)) {
              map.set(key, { booking: b, position: "startEnd" });
            }
          }
        }
        current.setDate(current.getDate() + 1);
      }
    });

    return map;
  }, [activeBookings]);

  const monthNames = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
    "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

  const prevMonth = () => {
    setCurrentMonth(prev => prev.month === 0 ? { year: prev.year - 1, month: 11 } : { year: prev.year, month: prev.month - 1 });
  };
  const nextMonth = () => {
    setCurrentMonth(prev => prev.month === 11 ? { year: prev.year + 1, month: 0 } : { year: prev.year, month: prev.month + 1 });
  };

  const handleDayClick = (day: Date) => {
    const dateStr = fmtKey(day);
    if (selectingMode === "checkIn") {
      onSelectCheckIn(dateStr);
      if (selectedCheckOut && selectedCheckOut <= dateStr) onSelectCheckOut("");
      setSelectingMode("checkOut");
    } else {
      if (dateStr > selectedCheckIn) {
        onSelectCheckOut(dateStr);
        setSelectingMode("checkIn");
      }
    }
  };

  const isInSelectedRange = (key: string): boolean => {
    if (!selectedCheckIn || !selectedCheckOut) return false;
    return key > selectedCheckIn && key < selectedCheckOut;
  };

  // Verifica sovrapposizione
  const hasOverlap = useMemo(() => {
    if (!selectedCheckIn || !selectedCheckOut) return false;
    const ciDate = new Date(selectedCheckIn + "T12:00:00");
    const coDate = new Date(selectedCheckOut + "T12:00:00");
    return activeBookings.some(b => {
      const bStart = new Date(b.checkIn);
      const bEnd = new Date(b.checkOut);
      bStart.setHours(12, 0, 0, 0);
      bEnd.setHours(12, 0, 0, 0);
      return ciDate < bEnd && coDate > bStart;
    });
  }, [selectedCheckIn, selectedCheckOut, activeBookings]);

  return (
    <div className="space-y-3">
      {/* Header mese */}
      <div className="flex items-center justify-between">
        <button type="button" onClick={prevMonth} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors">
          <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <span className="text-sm font-bold text-slate-800">{monthNames[currentMonth.month]} {currentMonth.year}</span>
        <button type="button" onClick={nextMonth} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors">
          <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>

      {/* Selettore check-in / check-out */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setSelectingMode("checkIn")}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold text-center transition-all ${
            selectingMode === "checkIn" ? "bg-sky-100 text-sky-700 ring-2 ring-sky-400" : "bg-slate-50 text-slate-500"
          }`}
        >
          Check-in: {selectedCheckIn ? selectedCheckIn.split('-').reverse().join('/') : "—"}
        </button>
        <button
          type="button"
          onClick={() => setSelectingMode("checkOut")}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold text-center transition-all ${
            selectingMode === "checkOut" ? "bg-orange-100 text-orange-700 ring-2 ring-orange-400" : "bg-slate-50 text-slate-500"
          }`}
        >
          Check-out: {selectedCheckOut ? selectedCheckOut.split('-').reverse().join('/') : "—"}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-2">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-sky-500 mr-2"></div>
          <span className="text-xs text-slate-500">Caricamento prenotazioni...</span>
        </div>
      )}

      {/* Griglia calendario */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Intestazione giorni */}
        <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
          {["Lu", "Ma", "Me", "Gi", "Ve", "Sa", "Do"].map(d => (
            <div key={d} className="py-2 text-center text-[10px] font-bold text-slate-400 uppercase">{d}</div>
          ))}
        </div>

        {/* Settimane */}
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.map((day, di) => {
              if (!day) {
                return <div key={`empty-${wi}-${di}`} className="h-12 border-b border-r border-slate-50" />;
              }

              const key = fmtKey(day);
              const isPast = day < today;
              const isToday = key === fmtKey(today);
              const isCi = key === selectedCheckIn;
              const isCo = key === selectedCheckOut;
              const inRange = isInSelectedRange(key);
              const disabled = isPast;

              // Info prenotazione per questa cella
              const bookingInfo = cellBookingInfo.get(key);
              const hasBooking = !!bookingInfo;
              const pos = bookingInfo?.position;

              // ── STILE NUMERO ──
              let textClass = "text-slate-700";
              let numBg = "";

              if (disabled) {
                textClass = "text-slate-300";
              } else if (isCi) {
                numBg = "bg-sky-500 text-white";
                textClass = "";
              } else if (isCo) {
                numBg = "bg-orange-500 text-white";
                textClass = "";
              } else if (isToday) {
                textClass = "text-sky-600 font-bold";
              } else if (hasBooking) {
                textClass = "text-red-600 font-semibold";
              }

              // Sfondo selezione range
              let cellBg = "";
              if (inRange && !hasBooking) {
                cellBg = "bg-sky-50";
              } else if (inRange && hasBooking) {
                cellBg = "";
              }

              return (
                <button
                  key={key}
                  type="button"
                  disabled={disabled}
                  onClick={() => !disabled && handleDayClick(day)}
                  className={`relative h-12 overflow-hidden border-b border-r border-slate-50 transition-all ${cellBg} ${
                    disabled ? "cursor-not-allowed" : "cursor-pointer hover:bg-slate-50/50 active:scale-95"
                  }`}
                  title={hasBooking ? `${bookingInfo.booking.guestName || "Ospite"} (${
                    new Date(bookingInfo.booking.checkIn).toLocaleDateString("it-IT", { day: "2-digit", month: "short" })
                  } → ${
                    new Date(bookingInfo.booking.checkOut).toLocaleDateString("it-IT", { day: "2-digit", month: "short" })
                  })` : undefined}
                >
                  {/* Barra prenotazione di sfondo */}
                  {hasBooking && !isCi && !isCo && (
                    <>
                      {pos === "start" && (
                        /* Check-in (arrivo): occupato dal 10% in poi verso destra */
                        <div className="absolute top-1 bottom-1 right-0 bg-red-200 rounded-l-md pointer-events-none" style={{ left: '10%' }} />
                      )}
                      {pos === "end" && (
                        /* Check-out (partenza): occupato solo primo 10% a sinistra */
                        <div className="absolute top-1 bottom-1 left-0 bg-red-200 rounded-r-md pointer-events-none" style={{ width: '10%' }} />
                      )}
                      {pos === "middle" && (
                        /* Giorni intermedi: pieno */
                        <div className="absolute top-1 bottom-1 left-0 right-0 bg-red-200 pointer-events-none" />
                      )}
                      {pos === "single" && (
                        <div className="absolute top-1 bottom-1 left-[10%] right-[10%] bg-red-200 rounded-md pointer-events-none" />
                      )}
                      {pos === "startEnd" && (
                        /* Stesso giorno: checkout precedente (10% sinistra) + checkin nuova (90% destra) */
                        <>
                          <div className="absolute top-1 bottom-1 left-0 bg-red-200 rounded-r-md pointer-events-none" style={{ width: '10%' }} />
                          <div className="absolute top-1 bottom-1 right-0 bg-red-200 rounded-l-md pointer-events-none" style={{ left: '15%' }} />
                        </>
                      )}
                    </>
                  )}

                  {/* Range selezione sfondo */}
                  {inRange && (
                    <div className="absolute inset-y-1 left-0 right-0 bg-sky-100 pointer-events-none"></div>
                  )}

                  {/* Numero giorno */}
                  <div className={`relative z-10 flex items-center justify-center h-full`}>
                    {numBg ? (
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs ${numBg}`}>
                        {day.getDate()}
                      </span>
                    ) : (
                      <span className={`text-xs ${textClass}`}>{day.getDate()}</span>
                    )}
                  </div>

                  {/* Indicatore oggi */}
                  {isToday && !isCi && !isCo && (
                    <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-sky-500 z-10"></div>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500 px-1">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-3 rounded-full bg-sky-500"></div>
          <span>Check-in</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-3 rounded-full bg-orange-500"></div>
          <span>Check-out</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-8 h-3 rounded-sm bg-red-100 border border-red-200"></div>
          <span>Occupato</span>
        </div>
      </div>

      {/* Warning sovrapposizione */}
      {hasOverlap && (
        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
          <span className="text-sm flex-shrink-0">⚠️</span>
          <p className="text-[11px] text-amber-700 font-medium">
            Attenzione: le date selezionate si sovrappongono con una prenotazione esistente!
          </p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// FORM PRINCIPALE
// ═══════════════════════════════════════════════════════════════
export default function ManualBookingForm({
  isOpen,
  onClose,
  onSuccess,
  properties,
  preselectedPropertyId,
  preselectedDate
}: ManualBookingFormProps) {
  const [propertyId, setPropertyId] = useState(preselectedPropertyId || "");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(0);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [source] = useState("manual");
  const [notes, setNotes] = useState("");
  const [createCleaning, setCreateCleaning] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [existingBookings, setExistingBookings] = useState<ExistingBooking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [propertySearch, setPropertySearch] = useState("");
  const [showPropertyDropdown, setShowPropertyDropdown] = useState(false);

  const selectedProperty = properties.find(p => p.id === propertyId);
  const maxGuests = selectedProperty?.maxGuests || 0;
  const hasProperty = !!propertyId && !!selectedProperty;

  // Listener realtime prenotazioni per proprietà selezionata
  useEffect(() => {
    if (!propertyId || !isOpen) {
      setExistingBookings([]);
      return;
    }
    setLoadingBookings(true);
    const q = query(collection(db, "bookings"), where("propertyId", "==", propertyId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bookings: ExistingBooking[] = snapshot.docs
        .map(doc => {
          const data = doc.data() as Record<string, any>;
          return {
            id: doc.id,
            guestName: data.guestName || data.guest_name || "Ospite",
            checkIn: data.checkIn instanceof Timestamp ? data.checkIn.toDate() : new Date(data.checkIn),
            checkOut: data.checkOut instanceof Timestamp ? data.checkOut.toDate() : new Date(data.checkOut),
            status: data.status || "UPCOMING",
            source: data.source || ""
          };
        })
        // Filtra: escludi blocchi iCal (stessa logica del calendario principale)
        .filter(b => !isBlockedEntry(b.guestName || "", b.source));
      bookings.sort((a, b) => a.checkIn.getTime() - b.checkIn.getTime());
      setExistingBookings(bookings);
      setLoadingBookings(false);
    }, () => setLoadingBookings(false));
    return () => unsubscribe();
  }, [propertyId, isOpen]);

  useEffect(() => {
    if (preselectedDate) {
      const y = preselectedDate.getFullYear();
      const m = String(preselectedDate.getMonth() + 1).padStart(2, '0');
      const d = String(preselectedDate.getDate()).padStart(2, '0');
      setCheckIn(`${y}-${m}-${d}`);
      const nextDay = new Date(preselectedDate);
      nextDay.setDate(nextDay.getDate() + 1);
      setCheckOut(`${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`);
    }
  }, [preselectedDate]);

  useEffect(() => {
    if (preselectedPropertyId) {
      setPropertyId(preselectedPropertyId);
      const prop = properties.find(p => p.id === preselectedPropertyId);
      if (prop) setPropertySearch(prop.name);
    }
  }, [preselectedPropertyId, properties]);

  useEffect(() => {
    if (hasProperty && maxGuests > 0) {
      if (guests === 0 || guests > maxGuests) setGuests(Math.min(2, maxGuests));
    } else {
      setGuests(0);
    }
  }, [propertyId, maxGuests, hasProperty]);

  useEffect(() => {
    if (!isOpen) {
      setPropertyId(preselectedPropertyId || "");
      setCheckIn(""); setCheckOut(""); setGuests(0);
      setGuestName(""); setGuestEmail(""); setGuestPhone("");
      setNotes(""); setCreateCleaning(true); setError("");
      setExistingBookings([]);
      setPropertySearch(""); setShowPropertyDropdown(false);
    }
  }, [isOpen, preselectedPropertyId]);

  const handlePropertyChange = (id: string) => {
    setPropertyId(id);
    const prop = properties.find(p => p.id === id);
    setPropertySearch(prop ? prop.name : "");
    setShowPropertyDropdown(false);
    setCheckIn(""); setCheckOut(""); setError("");
  };

  const handleSubmit = async () => {
    setError("");
    if (!propertyId) { setError("Seleziona una proprietà"); return; }
    if (!checkIn || !checkOut) { setError("Seleziona le date di check-in e check-out dal calendario"); return; }
    if (new Date(checkOut) <= new Date(checkIn)) { setError("Il check-out deve essere successivo al check-in"); return; }
    if (guests < 1 || guests > maxGuests) { setError(`Numero ospiti deve essere tra 1 e ${maxGuests}`); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId, checkIn, checkOut, guests,
          guestName: guestName || "Ospite",
          guestEmail: guestEmail || null, guestPhone: guestPhone || null,
          source, notes: notes || null, createCleaning
        })
      });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "Errore durante il salvataggio"); setSaving(false); return; }
      onSuccess?.(); onClose();
    } catch (err: any) { setError(err.message || "Errore di connessione"); }
    finally { setSaving(false); }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-3.5 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center">
              <span className="text-base">📅</span>
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Nuova Prenotazione</h2>
              <p className="text-[11px] text-slate-500">Inserisci manualmente</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors">
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4" onClick={() => setShowPropertyDropdown(false)}>
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* STEP 1: Proprietà - Barra di ricerca */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">① Proprietà *</label>
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={propertySearch}
                  onChange={(e) => {
                    setPropertySearch(e.target.value);
                    setShowPropertyDropdown(true);
                    if (!e.target.value) {
                      setPropertyId("");
                    }
                  }}
                  onFocus={() => setShowPropertyDropdown(true)}
                  placeholder="Cerca appartamento per nome..."
                  className="w-full pl-10 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                {propertyId && (
                  <button
                    type="button"
                    onClick={() => { setPropertyId(""); setPropertySearch(""); setShowPropertyDropdown(false); setCheckIn(""); setCheckOut(""); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center hover:bg-slate-300 transition-colors"
                  >
                    <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Dropdown risultati */}
              {showPropertyDropdown && !propertyId && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                  {properties
                    .filter(p => {
                      if (!propertySearch.trim()) return true;
                      return p.name.toLowerCase().includes(propertySearch.toLowerCase());
                    })
                    .map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handlePropertyChange(p.id)}
                        className="w-full text-left px-4 py-2.5 hover:bg-sky-50 transition-colors flex items-center justify-between border-b border-slate-50 last:border-0"
                      >
                        <span className="text-sm text-slate-700 font-medium">{p.name}</span>
                        {p.maxGuests && (
                          <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">max {p.maxGuests}</span>
                        )}
                      </button>
                    ))
                  }
                  {properties.filter(p => !propertySearch.trim() || p.name.toLowerCase().includes(propertySearch.toLowerCase())).length === 0 && (
                    <div className="px-4 py-3 text-sm text-slate-400 text-center">Nessun risultato</div>
                  )}
                </div>
              )}
            </div>

            {/* Chip proprietà selezionata */}
            {selectedProperty && (
              <div className="mt-2 flex items-center gap-2 px-3 py-1.5 bg-sky-50 border border-sky-200 rounded-lg">
                <div className="w-2 h-2 rounded-full bg-sky-500"></div>
                <span className="text-xs text-sky-700 font-medium flex-1">{selectedProperty.name}</span>
                <span className="text-[10px] text-sky-500">max {maxGuests} ospiti</span>
              </div>
            )}
          </div>

          {/* STEP 2: Calendario */}
          {hasProperty ? (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">② Seleziona Date *</label>
              <BookingCalendar
                selectedCheckIn={checkIn} selectedCheckOut={checkOut}
                onSelectCheckIn={setCheckIn} onSelectCheckOut={setCheckOut}
                existingBookings={existingBookings} loading={loadingBookings}
              />
            </div>
          ) : (
            <div className="py-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-sm text-slate-400 font-medium">Seleziona una proprietà per vedere il calendario</p>
              <p className="text-xs text-slate-300 mt-1">Le prenotazioni esistenti verranno mostrate</p>
            </div>
          )}

          {/* STEP 3: Ospiti */}
          {hasProperty && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">③ Numero Ospiti *</label>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setGuests(Math.max(1, guests - 1))} disabled={guests <= 1}
                  className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 disabled:opacity-30 transition-colors">
                  <span className="text-xl">−</span>
                </button>
                <span className="text-xl font-bold text-slate-800 w-12 text-center">{guests}</span>
                <button type="button" onClick={() => setGuests(Math.min(maxGuests, guests + 1))} disabled={guests >= maxGuests}
                  className="w-10 h-10 rounded-xl bg-sky-500 flex items-center justify-center text-white hover:bg-sky-600 disabled:opacity-30 transition-colors">
                  <span className="text-xl">+</span>
                </button>
                <span className="text-sm text-slate-500">max <strong>{maxGuests}</strong></span>
              </div>
            </div>
          )}

          {/* Nome Ospite */}
          {hasProperty && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Nome Ospite</label>
              <input type="text" value={guestName} onChange={(e) => setGuestName(e.target.value)}
                placeholder="es. Mario Rossi" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
          )}

          {/* Contatti */}
          {hasProperty && (
            <details className="bg-slate-50 rounded-xl border border-slate-200">
              <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-slate-700">📧 Contatti ospite (opzionale)</summary>
              <div className="px-4 pb-4 space-y-3">
                <input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="Email" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm" />
                <input type="tel" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)}
                  placeholder="Telefono" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm" />
              </div>
            </details>
          )}

          {/* Note */}
          {hasProperty && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Note (opzionale)</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note aggiuntive..." rows={2}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
          )}

          {/* Genera Pulizia */}
          {hasProperty && (
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-200 p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={createCleaning} onChange={(e) => setCreateCleaning(e.target.checked)}
                  className="w-5 h-5 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500 mt-0.5" />
                <div>
                  <span className="font-semibold text-emerald-800">🧹 Genera pulizia automatica</span>
                  <p className="text-xs text-emerald-700 mt-1">
                    Crea automaticamente una pulizia programmata per il giorno del check-out
                    {guests > 0 ? `, con l'ordine biancheria per ${guests} ospiti.` : '.'}
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* Riepilogo */}
          {createCleaning && checkOut && selectedProperty && guests > 0 && (
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-medium text-slate-700 mb-2">📋 Riepilogo</p>
              <div className="space-y-1 text-sm text-slate-600">
                <p>• <strong>{selectedProperty.name}</strong></p>
                <p>• Prenotazione: {checkIn.split('-').reverse().join('/')} → {checkOut.split('-').reverse().join('/')}</p>
                <p>• Pulizia: {checkOut.split('-').reverse().join('/')} (checkout)</p>
                <p>• Biancheria per {guests} ospiti</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-5 py-4 flex gap-3 z-10">
          <button type="button" onClick={onClose}
            className="flex-1 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition-colors">Annulla</button>
          <button type="button" onClick={handleSubmit}
            disabled={saving || !hasProperty || guests < 1 || !checkIn || !checkOut}
            className="flex-1 py-3 bg-gradient-to-r from-sky-500 to-blue-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all">
            {saving ? "Salvataggio..." : "Crea Prenotazione"}
          </button>
        </div>
      </div>
    </div>
  );
}
