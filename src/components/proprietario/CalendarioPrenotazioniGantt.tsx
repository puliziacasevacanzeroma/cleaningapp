"use client";

import { useState, useMemo } from "react";

interface Booking {
  id: string;
  guestName: string;
  checkIn: string | Date;
  checkOut: string | Date;
  status?: string;
  guestsCount?: number | null;
}

interface Property {
  id: string;
  name: string;
  address: string;
  bookings: Booking[];
}

interface CalendarioPrenotazioniGanttProps {
  properties: Property[];
}

export function CalendarioPrenotazioniGantt({ properties }: CalendarioPrenotazioniGanttProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const days = useMemo(() => {
    const result = [];
    const startDate = new Date(currentDate);
    startDate.setDate(startDate.getDate() - 10);
    
    for (let i = 0; i < 30; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      result.push(date);
    }
    return result;
  }, [currentDate]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dayNames = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];

  const getBookingBars = (property: Property) => {
    const bars: { booking: Booking; startIndex: number; width: number; gradient: string }[] = [];
    
    property.bookings.forEach(booking => {
      const checkIn = new Date(booking.checkIn);
      const checkOut = new Date(booking.checkOut);
      checkIn.setHours(0, 0, 0, 0);
      checkOut.setHours(0, 0, 0, 0);
      
      const startIndex = days.findIndex(d => d.toDateString() === checkIn.toDateString());
      if (startIndex === -1) return;
      
      const durationDays = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
      const width = durationDays * 48;
      
      // Determine color
      let gradient = "from-rose-400 to-red-500"; // Default: confirmed
      const isCheckoutToday = checkOut.getTime() === today.getTime();
      const isPast = checkOut < today;
      const isNew = checkIn > today && (checkIn.getTime() - today.getTime()) < (3 * 24 * 60 * 60 * 1000);
      
      if (isPast) {
        gradient = "from-slate-300 to-slate-400";
      } else if (isCheckoutToday) {
        gradient = "from-amber-400 to-orange-500";
      } else if (isNew) {
        gradient = "from-emerald-400 to-teal-500";
      }
      
      bars.push({ booking, startIndex, width, gradient });
    });
    
    return bars;
  };

  const navigateMonth = (direction: number) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + (direction * 15));
    setCurrentDate(newDate);
  };

  return (
    <>
      {/* Navigation - FISSO SOPRA */}
      <div className="flex items-center justify-between p-4 bg-white rounded-t-2xl border border-slate-200 border-b-0">
        <button
          onClick={() => navigateMonth(-1)}
          className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
        >
          <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="text-center">
          <h3 className="font-bold text-slate-800">
            {currentDate.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}
          </h3>
          <p className="text-xs text-slate-500">Visualizza le prenotazioni delle tue proprietà</p>
        </div>
        <button
          onClick={() => navigateMonth(1)}
          className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
        >
          <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Gantt Chart - Struttura: Proprietà FISSE | Calendario SCROLLABILE */}
      <div className="flex border border-slate-200 rounded-b-2xl overflow-hidden bg-white">
        
        {/* COLONNA PROPRIETÀ - FISSA (non scrolla) */}
        <div className="flex-shrink-0 w-[200px] lg:w-[220px] bg-white border-r-2 border-slate-200 z-10">
          {/* Header Proprietà */}
          <div className="h-14 flex items-center px-4 bg-slate-50 border-b-2 border-slate-200">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Proprietà</span>
          </div>
          
          {/* Righe Proprietà */}
          {properties.map((property) => (
            <div key={property.id} className="h-[60px] flex items-center px-3 border-b border-slate-100 hover:bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 text-xs truncate">{property.name}</p>
                  <p className="text-[10px] text-slate-500 truncate">{property.address}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CALENDARIO - SCROLLABILE */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden" style={{ scrollbarWidth: 'thin' }}>
          <div style={{ minWidth: '1200px' }}>
            {/* Header Giorni */}
            <div className="h-14 flex bg-slate-50 border-b-2 border-slate-200">
              {days.map((day, index) => {
                const isToday = day.toDateString() === today.toDateString();
                const isSunday = day.getDay() === 0;
                
                return (
                  <div
                    key={index}
                    className={`w-12 flex-shrink-0 flex flex-col items-center justify-center border-r border-slate-100 ${
                      isToday ? "bg-sky-50" : isSunday ? "bg-blue-50/50" : ""
                    }`}
                  >
                    <span className={`text-[10px] ${isToday ? "text-sky-600 font-semibold" : "text-slate-400"}`}>
                      {dayNames[day.getDay()]}
                    </span>
                    {isToday ? (
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow">
                        <span className="text-sm font-bold text-white">{day.getDate()}</span>
                      </div>
                    ) : (
                      <span className="text-sm font-bold text-slate-700">{day.getDate()}</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Righe Calendario con Barre Prenotazioni */}
            {properties.map((property) => {
              const bars = getBookingBars(property);
              
              return (
                <div key={property.id} className="h-[60px] flex border-b border-slate-100 relative">
                  {/* Colonne giorni come sfondo */}
                  {days.map((day, dayIndex) => {
                    const isToday = day.toDateString() === today.toDateString();
                    const isSunday = day.getDay() === 0;
                    
                    return (
                      <div
                        key={dayIndex}
                        className={`w-12 flex-shrink-0 border-r border-slate-50 ${
                          isToday ? "bg-sky-50/50" : isSunday ? "bg-blue-50/30" : ""
                        }`}
                      />
                    );
                  })}
                  
                  {/* Barre prenotazioni */}
                  {bars.map((bar, barIndex) => (
                    <div
                      key={barIndex}
                      className={`absolute top-2 bottom-2 rounded-lg bg-gradient-to-r ${bar.gradient} flex items-center px-3 cursor-pointer shadow-md hover:brightness-105 transition-all`}
                      style={{
                        left: `${bar.startIndex * 48}px`,
                        width: `${bar.width}px`
                      }}
                    >
                      <span className="text-xs font-medium text-white truncate">
                        {bar.booking.guestName || "Ospite"}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Empty State */}
      {properties.length === 0 && (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 mt-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Nessuna proprietà</h3>
          <p className="text-slate-500">Aggiungi una proprietà per vedere le prenotazioni</p>
        </div>
      )}
    </>
  );
}
