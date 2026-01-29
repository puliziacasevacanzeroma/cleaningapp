"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Property {
  id: string;
  name: string;
  address: string;
}

interface Cleaning {
  id: string;
  date: Date;
  scheduledTime: string | null;
  status: string;
  guestsCount: number | null;
  property: Property;
  operator: { name: string } | null;
  booking: { guestName: string } | null;
}

interface CalendarioProprietarioProps {
  properties: Property[];
  cleanings: Cleaning[];
}

export function CalendarioProprietario({ properties, cleanings }: CalendarioProprietarioProps) {
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    propertyId: "",
    scheduledTime: "09:00",
    guestsCount: 2,
    notes: ""
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const startDay = firstDayOfMonth.getDay() || 7; // Lunedì = 1
  const daysInMonth = lastDayOfMonth.getDate();

  const monthNames = [
    "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
    "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
  ];

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const getCleaningsForDay = (day: number) => {
    return cleanings.filter(c => {
      const cleaningDate = new Date(c.date);
      return cleaningDate.getDate() === day &&
             cleaningDate.getMonth() === month &&
             cleaningDate.getFullYear() === year;
    });
  };

  const handleDayClick = (day: number) => {
    const clickedDate = new Date(year, month, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (clickedDate >= today) {
      setSelectedDate(clickedDate);
      setShowModal(true);
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate || !formData.propertyId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/proprietario/cleanings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          date: selectedDate.toISOString()
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Errore durante la creazione");
      }

      setShowModal(false);
      setFormData({ propertyId: "", scheduledTime: "09:00", guestsCount: 2, notes: "" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto");
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-emerald-500";
      case "in_progress": return "bg-amber-500";
      case "assigned": return "bg-sky-500";
      default: return "bg-slate-400";
    }
  };

  // Genera i giorni del calendario
  const calendarDays = [];
  
  // Giorni vuoti all'inizio
  for (let i = 1; i < startDay; i++) {
    calendarDays.push(null);
  }
  
  // Giorni del mese
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  const today = new Date();
  const isToday = (day: number) => {
    return day === today.getDate() && 
           month === today.getMonth() && 
           year === today.getFullYear();
  };

  return (
    <div>
      {/* Header Calendario */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
        <div className="flex items-center justify-between">
          <button
            onClick={prevMonth}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-xl font-bold text-slate-800">
            {monthNames[month]} {year}
          </h2>
          <button
            onClick={nextMonth}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Griglia Calendario */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {/* Intestazioni giorni */}
        <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
          {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map(day => (
            <div key={day} className="p-3 text-center text-sm font-semibold text-slate-600">
              {day}
            </div>
          ))}
        </div>

        {/* Giorni */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day, index) => {
            const dayCleanings = day ? getCleaningsForDay(day) : [];
            const isPastDay = day ? new Date(year, month, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate()) : false;

            return (
              <div
                key={index}
                onClick={() => day && !isPastDay && handleDayClick(day)}
                className={`min-h-24 p-2 border-b border-r border-slate-100 ${
                  day && !isPastDay ? "cursor-pointer hover:bg-slate-50" : ""
                } ${isPastDay ? "bg-slate-50 opacity-50" : ""}`}
              >
                {day && (
                  <>
                    <div className={`text-sm font-medium mb-1 ${
                      isToday(day) 
                        ? "w-7 h-7 bg-sky-500 text-white rounded-full flex items-center justify-center" 
                        : "text-slate-700"
                    }`}>
                      {day}
                    </div>
                    <div className="space-y-1">
                      {dayCleanings.slice(0, 3).map(cleaning => (
                        <div
                          key={cleaning.id}
                          className={`text-xs p-1 rounded ${getStatusColor(cleaning.status)} text-white truncate`}
                        >
                          {cleaning.property.name}
                        </div>
                      ))}
                      {dayCleanings.length > 3 && (
                        <div className="text-xs text-slate-500">
                          +{dayCleanings.length - 3} altre
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legenda */}
      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
          <span className="text-slate-600">Completata</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-amber-500"></div>
          <span className="text-slate-600">In corso</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-sky-500"></div>
          <span className="text-slate-600">Assegnata</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-slate-400"></div>
          <span className="text-slate-600">Da assegnare</span>
        </div>
      </div>

      {/* Modal Nuova Pulizia */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-800">
                Nuova Pulizia - {selectedDate?.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg"
              >
                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Proprietà *
                </label>
                <select
                  value={formData.propertyId}
                  onChange={(e) => setFormData({ ...formData, propertyId: e.target.value })}
                  required
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="">Seleziona proprietà</option>
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Orario
                </label>
                <input
                  type="time"
                  value={formData.scheduledTime}
                  onChange={(e) => setFormData({ ...formData, scheduledTime: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Numero Ospiti
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={formData.guestsCount}
                  onChange={(e) => setFormData({ ...formData, guestsCount: parseInt(e.target.value) })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Note (opzionale)
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-3 border border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={loading || !formData.propertyId}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-sky-500 to-blue-600 text-white font-medium rounded-xl hover:shadow-lg disabled:opacity-50"
                >
                  {loading ? "Creazione..." : "Crea Pulizia"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
