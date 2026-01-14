"use client";

import { useState, useMemo } from "react";

interface Property {
  id: string;
  name: string;
  address: string;
}

interface Booking {
  id: string;
  propertyId: string;
  guestName: string;
  checkIn: Date;
  checkOut: Date;
  status: string;
}

interface CalendarioPrenotazioniProprietarioProps {
  properties: Property[];
  bookings: Booking[];
}

export function CalendarioPrenotazioniProprietario({ properties, bookings }: CalendarioPrenotazioniProprietarioProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Genera i giorni del mese
  const daysInMonth = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const lastDay = new Date(year, month + 1, 0);
    const days = [];
    
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month, d);
      days.push({
        date,
        day: d,
        dayName: date.toLocaleDateString("it-IT", { weekday: "short" }).slice(0, 3),
        isToday: date.toDateString() === today.toDateString(),
        isSunday: date.getDay() === 0
      });
    }
    return days;
  }, [currentDate]);

  const monthName = currentDate.toLocaleDateString("it-IT", { month: "long", year: "numeric" });

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Calcola posizione e larghezza delle barre prenotazione
  const getBookingStyle = (booking: Booking) => {
    const checkIn = new Date(booking.checkIn);
    const checkOut = new Date(booking.checkOut);
    const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    
    const startDate = checkIn < monthStart ? monthStart : checkIn;
    const endDate = checkOut > monthEnd ? monthEnd : checkOut;
    
    if (startDate > monthEnd || endDate < monthStart) return null;
    
    const startDay = startDate.getDate();
    const endDay = endDate.getDate();
    const dayWidth = 48;
    
    const left = (startDay - 1) * dayWidth;
    const width = (endDay - startDay + 1) * dayWidth - 8;
    
    return { left: `${left}px`, width: `${width}px` };
  };

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

  // Colori prenotazioni
  const bookingColors = [
    "from-rose-400 to-red-500",
    "from-blue-400 to-indigo-500",
    "from-amber-400 to-orange-500",
    "from-emerald-400 to-teal-500",
    "from-violet-400 to-purple-500",
  ];

  return (
    <div className="p-6 overflow-x-hidden">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Calendario Prenotazioni</h1>
            <p className="text-slate-500 text-sm">Visualizza le prenotazioni delle tue proprietà</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-white rounded-xl border border-slate-200 p-1 shadow-sm">
              <button onClick={prevMonth} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button onClick={goToToday} className="px-3 font-semibold text-slate-700 capitalize">{monthName}</button>
              <button onClick={nextMonth} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        
        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-gradient-to-r from-rose-400 to-red-500"></div>
            <span className="text-sm text-slate-600">Prenotazione</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-gradient-to-r from-amber-400 to-orange-500"></div>
            <span className="text-sm text-slate-600">Check-out oggi</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-slate-300"></div>
            <span className="text-sm text-slate-600">Bloccato</span>
          </div>
        </div>
      </div>

      {/* GANTT CHART */}
      <div className="flex border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-lg">
        {/* LEFT: Properties - FIXED */}
        <div className="flex-shrink-0 w-[220px] bg-white border-r-2 border-slate-200 z-10">
          {/* Header */}
          <div className="h-14 flex items-center px-4 bg-slate-50 border-b-2 border-slate-200">
            <span className="font-semibold text-slate-700">Proprietà</span>
          </div>
          
          {/* Properties */}
          {properties.length === 0 ? (
            <div className="h-[60px] flex items-center justify-center px-4 text-slate-400 text-sm">
              Nessuna proprietà
            </div>
          ) : (
            properties.map((property, index) => {
              const colorSet = propertyColors[index % propertyColors.length];
              return (
                <div key={property.id} className="h-[60px] flex items-center px-3 border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${colorSet.bg} flex items-center justify-center mr-3 flex-shrink-0`}>
                    <svg className={`w-5 h-5 ${colorSet.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 text-sm truncate">{property.name}</p>
                    <p className="text-xs text-slate-500 truncate">{property.address}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* RIGHT: Calendar - SCROLLABLE SOLO QUI */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden" style={{ scrollbarWidth: "thin" }}>
          <div style={{ minWidth: `${daysInMonth.length * 48}px` }}>
            {/* Days Header */}
            <div className="h-14 flex bg-slate-50 border-b-2 border-slate-200">
              {daysInMonth.map((day, index) => (
                <div 
                  key={index}
                  className={`w-12 flex-shrink-0 flex flex-col items-center justify-center border-r border-slate-100 ${day.isToday ? "bg-sky-50" : day.isSunday ? "bg-slate-50/50" : ""}`}
                >
                  <span className={`text-[10px] ${day.isToday ? "text-sky-600 font-semibold" : "text-slate-400"}`}>{day.dayName}</span>
                  {day.isToday ? (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow">
                      <span className="text-sm font-bold text-white">{day.day}</span>
                    </div>
                  ) : (
                    <span className="text-sm font-bold text-slate-700">{day.day}</span>
                  )}
                </div>
              ))}
            </div>

            {/* Rows */}
            {properties.length === 0 ? (
              <div className="h-[60px] flex items-center justify-center text-slate-400">
                Aggiungi proprietà per visualizzare il calendario
              </div>
            ) : (
              properties.map((property, propIndex) => {
                const propertyBookings = bookings.filter(b => b.propertyId === property.id);
                
                return (
                  <div key={property.id} className="h-[60px] flex border-b border-slate-100 relative">
                    {/* Day columns background */}
                    {daysInMonth.map((day, index) => (
                      <div 
                        key={index}
                        className={`w-12 flex-shrink-0 border-r border-slate-50 ${day.isToday ? "bg-sky-50/50" : day.isSunday ? "bg-slate-50/30" : ""}`}
                      />
                    ))}
                    
                    {/* Booking bars */}
                    {propertyBookings.map((booking, bookIndex) => {
                      const style = getBookingStyle(booking);
                      if (!style) return null;
                      
                      const colorClass = bookingColors[bookIndex % bookingColors.length];
                      const checkOut = new Date(booking.checkOut);
                      const isCheckoutToday = checkOut.toDateString() === today.toDateString();
                      
                      return (
                        <div
                          key={booking.id}
                          className={`absolute top-2 bottom-2 rounded-lg bg-gradient-to-r ${isCheckoutToday ? "from-amber-400 to-orange-500" : colorClass} flex items-center px-2.5 cursor-pointer shadow-md hover:scale-y-110 hover:brightness-105 transition-all`}
                          style={style}
                          title={`${booking.guestName} - ${new Date(booking.checkIn).toLocaleDateString("it-IT")} → ${new Date(booking.checkOut).toLocaleDateString("it-IT")}`}
                        >
                          <span className="text-xs font-medium text-white truncate">{booking.guestName}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="mt-6">
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-emerald-800">Usa la scrollbar</p>
            <p className="text-sm text-emerald-700">Scorri il calendario orizzontalmente. Le proprietà a sinistra rimangono sempre fisse! ✅</p>
          </div>
        </div>
      </div>
    </div>
  );
}
