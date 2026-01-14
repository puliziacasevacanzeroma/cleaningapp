"use client";

import { useState, useMemo } from "react";

interface Operator {
  id: string;
  name: string;
}

interface Cleaning {
  id: string;
  date: Date;
  time: string | null;
  status: string;
  operator: Operator | null;
}

interface Property {
  id: string;
  name: string;
  address: string;
  cleanings: Cleaning[];
}

interface Props {
  properties: Property[];
  operators: Operator[];
}

export default function CalendarioPulizieClient({ properties, operators }: Props) {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Generate days for the current view (3 weeks)
  const days = useMemo(() => {
    const result = [];
    const startDate = new Date(currentDate);
    startDate.setDate(startDate.getDate() - 7);
    
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "from-emerald-400 to-teal-500";
      case "in_progress":
        return "from-amber-400 to-orange-500";
      case "pending":
        return "from-sky-400 to-blue-500";
      default:
        return "from-rose-400 to-red-500";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return "✓";
      case "in_progress":
        return "🕐";
      case "pending":
        return "⏳";
      default:
        return "!";
    }
  };

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

  // Count today's cleanings by status
  const today = new Date();
  const todaysCleanings = properties.flatMap(p => 
    p.cleanings.filter(c => new Date(c.date).toDateString() === today.toDateString())
  );
  const completedToday = todaysCleanings.filter(c => c.status === "completed").length;
  const inProgressToday = todaysCleanings.filter(c => c.status === "in_progress").length;
  const pendingToday = todaysCleanings.filter(c => c.status === "pending").length;

  return (
    <div className="p-4 lg:p-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Calendario Pulizie</h1>
          <p className="text-slate-500 mt-1">Gestisci tutte le pulizie programmate</p>
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
            className="px-4 py-2 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 transition-colors"
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

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-emerald-700">{completedToday}</p>
            <p className="text-sm text-emerald-600">Completate</p>
          </div>
        </div>
        
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center animate-pulse">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-amber-700">{inProgressToday}</p>
            <p className="text-sm text-amber-600">In corso</p>
          </div>
        </div>
        
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-sky-700">{pendingToday}</p>
            <p className="text-sm text-sky-600">Da fare</p>
          </div>
        </div>
      </div>

      {/* Gantt Chart */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            {/* Header */}
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="sticky left-0 z-20 bg-slate-50 w-48 px-4 py-3 text-left text-sm font-semibold text-slate-600 border-r border-slate-200">
                  Proprietà
                </th>
                {days.map((day, idx) => (
                  <th
                    key={idx}
                    className={`w-12 px-1 py-3 text-center border-r border-slate-100 ${
                      isToday(day) ? "bg-emerald-50" : ""
                    }`}
                  >
                    <div className="text-[10px] text-slate-400 uppercase">
                      {day.toLocaleDateString("it-IT", { weekday: "short" })}
                    </div>
                    <div className={`text-sm font-semibold ${isToday(day) ? "text-emerald-600" : "text-slate-700"}`}>
                      {day.getDate()}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            
            {/* Body */}
            <tbody>
              {properties.map((property) => (
                <tr key={property.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                  <td className="sticky left-0 z-10 bg-white w-48 px-4 py-3 border-r border-slate-200">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 text-sm truncate">{property.name}</p>
                      </div>
                    </div>
                  </td>
                  
                  {/* Days cells with cleaning indicators */}
                  {days.map((day, dayIdx) => {
                    const cleaning = property.cleanings.find(c => 
                      new Date(c.date).toDateString() === day.toDateString()
                    );

                    return (
                      <td
                        key={dayIdx}
                        className={`relative h-14 border-r border-slate-100 ${isToday(day) ? "bg-emerald-50/50" : ""}`}
                      >
                        {cleaning && (
                          <div
                            className={`absolute inset-2 bg-gradient-to-r ${getStatusColor(cleaning.status)} rounded-lg shadow-md cursor-pointer flex items-center justify-center hover:scale-105 transition-all`}
                            title={`${cleaning.status} - ${cleaning.operator?.name || "Non assegnato"}`}
                          >
                            <span className="text-xs text-white">
                              {cleaning.operator ? cleaning.operator.name.split(" ").map(n => n[0]).join("") : getStatusIcon(cleaning.status)}
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
                    Nessuna proprietà trovata.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-6 flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-gradient-to-r from-emerald-400 to-teal-500"></div>
          <span className="text-sm text-slate-600">Completata</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-gradient-to-r from-amber-400 to-orange-500"></div>
          <span className="text-sm text-slate-600">In corso</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-gradient-to-r from-sky-400 to-blue-500"></div>
          <span className="text-sm text-slate-600">Programmata</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-gradient-to-r from-rose-400 to-red-500"></div>
          <span className="text-sm text-slate-600">Da assegnare</span>
        </div>
      </div>
    </div>
  );
}
