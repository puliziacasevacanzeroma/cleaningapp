"use client";

import { useState, useMemo } from "react";

interface Booking {
  id: string;
  guestName: string;
  checkIn: Date;
  checkOut: Date;
  status: string;
}

interface Property {
  id: string;
  name: string;
  address: string;
  bookings: Booking[];
}

interface Props {
  properties: Property[];
}

export default function CalendarioPrenotazioniClient({ properties }: Props) {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Generate days for the current view (3 weeks)
  const days = useMemo(() => {
    const result = [];
    const startDate = new Date(currentDate);
    startDate.setDate(startDate.getDate() - 7); // Start 1 week before
    
    for (let i = 0; i < 21; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      result.push(date);
    }
    return result;
  }, [currentDate]);

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const getBookingStyle = (booking: Booking, days: Date[]) => {
    const checkIn = new Date(booking.checkIn);
    const checkOut = new Date(booking.checkOut);
    
    const startIdx = days.findIndex(d => d.toDateString() === checkIn.toDateString());
    const endIdx = days.findIndex(d => d.toDateString() === checkOut.toDateString());
    
    if (startIdx === -1 && endIdx === -1) {
      // Check if booking spans the entire view
      if (checkIn < days[0]! && checkOut > days[days.length - 1]!) {
        return { left: 0, width: days.length, visible: true };
      }
      return { left: 0, width: 0, visible: false };
    }
    
    const actualStart = startIdx === -1 ? 0 : startIdx;
    const actualEnd = endIdx === -1 ? days.length : endIdx;
    
    return {
      left: actualStart,
      width: actualEnd - actualStart,
      visible: true,
    };
  };

  const colors = [
    "from-rose-400 to-red-500",
    "from-blue-400 to-indigo-500",
    "from-emerald-400 to-teal-500",
    "from-amber-400 to-orange-500",
    "from-violet-400 to-purple-500",
    "from-pink-400 to-rose-500",
  ];

  const prevWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentDate(newDate);
  };

  const nextWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentDate(newDate);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  return (
    <div className="p-4 lg:p-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Calendario Prenotazioni</h1>
          <p className="text-slate-500 mt-1">Visualizza tutte le prenotazioni delle proprietà</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={prevWeek}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={goToToday}
            className="px-4 py-2 bg-sky-500 text-white rounded-lg font-medium hover:bg-sky-600 transition-colors"
          >
            Oggi
          </button>
          <button
            onClick={nextWeek}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Gantt Chart */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            {/* Header */}
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="sticky left-0 z-20 bg-slate-50 w-52 lg:w-64 px-4 py-3 text-left text-sm font-semibold text-slate-600 border-r border-slate-200">
                  Proprietà
                </th>
                {days.map((day, idx) => (
                  <th
                    key={idx}
                    className={`w-12 px-1 py-3 text-center border-r border-slate-100 ${
                      isToday(day) ? "bg-sky-50" : ""
                    }`}
                  >
                    <div className="text-[10px] text-slate-400 uppercase">
                      {day.toLocaleDateString("it-IT", { weekday: "short" })}
                    </div>
                    <div className={`text-sm font-semibold ${isToday(day) ? "text-sky-600" : "text-slate-700"}`}>
                      {day.getDate()}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            
            {/* Body */}
            <tbody>
              {properties.map((property, propIdx) => (
                <tr key={property.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                  <td className="sticky left-0 z-10 bg-white w-52 lg:w-64 px-4 py-3 border-r border-slate-200">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colors[propIdx % colors.length]} flex items-center justify-center flex-shrink-0`}>
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 text-sm truncate">{property.name}</p>
                        <p className="text-xs text-slate-500 truncate">{property.address}</p>
                      </div>
                    </div>
                  </td>
                  
                  {/* Days cells with booking bars */}
                  {days.map((day, dayIdx) => {
                    // Find booking for this day
                    const booking = property.bookings.find(b => {
                      const checkIn = new Date(b.checkIn);
                      const checkOut = new Date(b.checkOut);
                      return day >= checkIn && day < checkOut;
                    });
                    
                    // Check if this is the start of a booking
                    const isBookingStart = booking && new Date(booking.checkIn).toDateString() === day.toDateString();
                    
                    // Calculate booking span
                    let bookingSpan = 0;
                    if (isBookingStart && booking) {
                      const checkOut = new Date(booking.checkOut);
                      for (let i = dayIdx; i < days.length && days[i]! < checkOut; i++) {
                        bookingSpan++;
                      }
                    }

                    return (
                      <td
                        key={dayIdx}
                        className={`relative h-14 border-r border-slate-100 ${isToday(day) ? "bg-sky-50/50" : ""}`}
                      >
                        {isBookingStart && booking && (
                          <div
                            className="absolute inset-y-2 left-1 bg-gradient-to-r from-rose-400 to-red-500 rounded-lg shadow-md cursor-pointer flex items-center px-2 hover:scale-y-105 hover:brightness-105 transition-all z-10"
                            style={{
                              width: `calc(${bookingSpan * 100}% - 8px)`,
                            }}
                            title={`${booking.guestName}: ${new Date(booking.checkIn).toLocaleDateString("it-IT")} - ${new Date(booking.checkOut).toLocaleDateString("it-IT")}`}
                          >
                            <span className="text-xs font-medium text-white truncate">
                              {booking.guestName.split(" ").map(n => n[0]).join(".")}
                            </span>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              
              {properties.length === 0 && (
                <tr>
                  <td colSpan={days.length + 1} className="text-center py-12 text-slate-500">
                    Nessuna proprietà trovata. Aggiungi la tua prima proprietà!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-6 p-4 bg-sky-50 border border-sky-200 rounded-xl flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <p className="font-semibold text-sky-800">Suggerimento</p>
          <p className="text-sm text-sky-700">Scorri orizzontalmente per vedere tutti i giorni. La colonna proprietà rimane fissa. Clicca su una prenotazione per i dettagli.</p>
        </div>
      </div>
    </div>
  );
}
