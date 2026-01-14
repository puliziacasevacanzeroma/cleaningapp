"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";

interface Operator {
  id: string;
  name: string | null;
}

interface Cleaning {
  id: string;
  date: string | Date;
  status: string;
  scheduledTime?: string | null;
  operator?: Operator | null;
  operatorId?: string | null;
}

interface Property {
  id: string;
  name: string;
  address: string;
  cleanings: Cleaning[];
}

interface CalendarioPulizieGanttProps {
  properties: Property[];
}

export function CalendarioPulizieGantt({ properties }: CalendarioPulizieGanttProps) {
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    scheduledTime: "10:00",
    guestsCount: 2,
    notes: ""
  });
  
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

  const getCleaningStyle = (cleaning: Cleaning) => {
    let gradient = "from-slate-300 to-slate-400";
    let icon = "?";
    
    switch (cleaning.status) {
      case "completed":
        gradient = "from-emerald-400 to-teal-500";
        icon = "✓";
        break;
      case "in_progress":
        gradient = "from-amber-400 to-orange-500";
        icon = "🕐";
        break;
      case "assigned":
        gradient = "from-sky-400 to-blue-500";
        icon = cleaning.operator?.name?.split(" ").map(n => n[0]).join("").toUpperCase() || "OP";
        break;
      case "not_assigned":
        gradient = "from-rose-400 to-red-500";
        icon = "!";
        break;
    }
    
    return { gradient, icon };
  };

  const navigateMonth = (direction: number) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + (direction * 15));
    setCurrentDate(newDate);
  };

  const handleDayClick = (propertyId: string, date: Date) => {
    if (date < today) return;
    setSelectedPropertyId(propertyId);
    setSelectedDate(date);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate || !selectedPropertyId) return;
    
    setLoading(true);
    
    try {
      const response = await fetch("/api/proprietario/cleanings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: selectedPropertyId,
          date: selectedDate.toISOString(),
          scheduledTime: formData.scheduledTime,
          guestsCount: formData.guestsCount,
          notes: formData.notes
        }),
      });

      if (response.ok) {
        setShowModal(false);
        setFormData({ scheduledTime: "10:00", guestsCount: 2, notes: "" });
        router.refresh();
      }
    } catch (error) {
      console.error("Errore:", error);
    } finally {
      setLoading(false);
    }
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
          <p className="text-xs text-slate-500">Clicca su un giorno per aggiungere una pulizia</p>
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
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center flex-shrink-0">
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
                      isToday ? "bg-emerald-50" : isSunday ? "bg-blue-50/50" : ""
                    }`}
                  >
                    <span className={`text-[10px] ${isToday ? "text-emerald-600 font-semibold" : "text-slate-400"}`}>
                      {dayNames[day.getDay()]}
                    </span>
                    {isToday ? (
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow">
                        <span className="text-sm font-bold text-white">{day.getDate()}</span>
                      </div>
                    ) : (
                      <span className="text-sm font-bold text-slate-700">{day.getDate()}</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Righe Calendario */}
            {properties.map((property) => (
              <div key={property.id} className="h-[60px] flex border-b border-slate-100">
                {days.map((day, dayIndex) => {
                  const isToday = day.toDateString() === today.toDateString();
                  const isSunday = day.getDay() === 0;
                  const isPast = day < today;
                  
                  const cleaningOnDay = property.cleanings.find(c => {
                    const cleaningDate = new Date(c.date);
                    cleaningDate.setHours(0, 0, 0, 0);
                    return cleaningDate.toDateString() === day.toDateString();
                  });
                  
                  return (
                    <div
                      key={dayIndex}
                      onClick={() => !cleaningOnDay && !isPast && handleDayClick(property.id, day)}
                      className={`w-12 flex-shrink-0 flex items-center justify-center border-r border-slate-50 ${
                        isToday ? "bg-emerald-50/50" : isSunday ? "bg-blue-50/30" : ""
                      } ${!isPast && !cleaningOnDay ? "cursor-pointer hover:bg-emerald-50" : ""} ${
                        isPast ? "opacity-50" : ""
                      }`}
                    >
                      {cleaningOnDay && (
                        <div 
                          className={`w-10 h-10 rounded-lg bg-gradient-to-r ${getCleaningStyle(cleaningOnDay).gradient} flex items-center justify-center shadow-md cursor-pointer hover:scale-110 transition-transform`}
                        >
                          <span className="text-xs text-white font-medium">
                            {getCleaningStyle(cleaningOnDay).icon}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Empty State */}
      {properties.length === 0 && (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 mt-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Nessuna proprietà</h3>
          <p className="text-slate-500">Aggiungi una proprietà per gestire le pulizie</p>
        </div>
      )}

      {/* Modal Nuova Pulizia */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-4">
              <h3 className="text-xl font-bold text-white">Nuova Pulizia Manuale</h3>
              <p className="text-emerald-100 text-sm">
                {selectedDate?.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
              </p>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Proprietà</label>
                <select
                  value={selectedPropertyId}
                  onChange={(e) => setSelectedPropertyId(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                >
                  <option value="">Seleziona proprietà</option>
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Orario previsto</label>
                <input
                  type="time"
                  value={formData.scheduledTime}
                  onChange={(e) => setFormData(prev => ({ ...prev, scheduledTime: e.target.value }))}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Numero Ospiti</label>
                <input
                  type="number"
                  value={formData.guestsCount}
                  onChange={(e) => setFormData(prev => ({ ...prev, guestsCount: parseInt(e.target.value) || 0 }))}
                  min={1}
                  max={20}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Note (opzionale)</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                  placeholder="Istruzioni speciali..."
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-3 border border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-colors"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={loading || !selectedPropertyId}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-medium rounded-xl hover:shadow-lg disabled:opacity-50 transition-all"
                >
                  {loading ? "Salvataggio..." : "Crea Pulizia"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
