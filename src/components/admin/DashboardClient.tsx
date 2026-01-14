"use client";

import { useState } from "react";

interface Operator {
  id: string;
  name: string | null;
}

interface Property {
  id: string;
  name: string;
  address: string;
  imageUrl?: string | null;
  owner?: { name: string | null } | null;
}

interface Booking {
  guestName: string;
  guestsCount?: number | null;
}

interface Cleaning {
  id: string;
  date: string | Date;
  scheduledTime?: string | null;
  status: string;
  guestsCount?: number | null;
  property: Property;
  operator?: Operator | null;
  booking?: Booking | null;
}

interface DashboardClientProps {
  userName: string;
  stats: {
    cleaningsToday: number;
    operatorsActive: number;
    propertiesTotal: number;
    checkinsWeek: number;
  };
  cleanings: Cleaning[];
}

export function DashboardClient({ userName, stats, cleanings }: DashboardClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  
  const today = new Date();
  const formattedDate = today.toLocaleDateString("it-IT", { 
    day: "numeric", 
    month: "long", 
    year: "numeric" 
  });

  const filteredCleanings = cleanings.filter(c => 
    c.property.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.property.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Genera iniziali per operatore
  const getInitials = (name: string | null) => {
    if (!name) return "??";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  // Colori random per operatori
  const operatorColors = [
    "from-emerald-400 to-teal-500",
    "from-sky-400 to-blue-500",
    "from-violet-400 to-purple-500",
    "from-rose-400 to-pink-500",
    "from-amber-400 to-orange-500",
  ];

  const getOperatorColor = (index: number) => operatorColors[index % operatorColors.length];

  return (
    <div className="p-8">
      {/* Welcome */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">👋</span>
          <h1 className="text-3xl font-bold text-slate-800">Buongiorno, {userName.split(" ")[0]}!</h1>
        </div>
        <p className="text-slate-500">Ecco cosa succede oggi nella tua attività</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        {/* Stat 1 - Pulizie Oggi */}
        <div className="group bg-white rounded-2xl border border-slate-200/60 p-6 relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/50">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-sky-400 to-blue-600 opacity-10 rounded-full blur-2xl -mr-10 -mt-10"></div>
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center mb-4 shadow-lg shadow-sky-500/30">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-500 mb-1">Pulizie Oggi</p>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold text-slate-800">{stats.cleaningsToday}</span>
              {stats.cleaningsToday > 0 && (
                <span className="flex items-center text-xs font-semibold text-emerald-600 mb-1">
                  <svg className="w-3 h-3 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  attive
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stat 2 - Operatori Attivi */}
        <div className="group bg-white rounded-2xl border border-slate-200/60 p-6 relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/50">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-400 to-teal-600 opacity-10 rounded-full blur-2xl -mr-10 -mt-10"></div>
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/30">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-500 mb-1">Operatori Attivi</p>
            <span className="text-3xl font-bold text-slate-800">{stats.operatorsActive}</span>
          </div>
        </div>

        {/* Stat 3 - Proprietà */}
        <div className="group bg-white rounded-2xl border border-slate-200/60 p-6 relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/50">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-violet-400 to-purple-600 opacity-10 rounded-full blur-2xl -mr-10 -mt-10"></div>
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center mb-4 shadow-lg shadow-violet-500/30">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-500 mb-1">Proprietà</p>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold text-slate-800">{stats.propertiesTotal}</span>
              <span className="flex items-center text-xs font-semibold text-emerald-600 mb-1">attive</span>
            </div>
          </div>
        </div>

        {/* Stat 4 - Check-in Settimana */}
        <div className="group bg-white rounded-2xl border border-slate-200/60 p-6 relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/50">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-amber-400 to-orange-500 opacity-10 rounded-full blur-2xl -mr-10 -mt-10"></div>
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mb-4 shadow-lg shadow-amber-500/30">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-500 mb-1">Check-in Settimana</p>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold text-slate-800">{stats.checkinsWeek}</span>
              <span className="flex items-center text-xs font-semibold text-emerald-600 mb-1">
                <svg className="w-3 h-3 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                +12%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Section Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Pulizie di Oggi</h2>
          <p className="text-slate-500 text-sm">{formattedDate}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-white rounded-xl border border-slate-200 p-1 shadow-sm">
            <button className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button className="px-4 py-2 bg-slate-100 rounded-lg font-medium text-sm text-slate-700">Oggi</button>
            <button className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 shadow-sm">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input 
              type="text" 
              placeholder="Cerca proprietà..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none text-sm w-40 placeholder:text-slate-400"
            />
          </div>
        </div>
      </div>

      {/* Cleaning Cards */}
      <div className="space-y-4">
        {filteredCleanings.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/60 p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Nessuna pulizia per oggi</h3>
            <p className="text-slate-500">Le pulizie programmate appariranno qui</p>
          </div>
        ) : (
          filteredCleanings.map((cleaning, index) => (
            <div 
              key={cleaning.id} 
              className="group bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/50"
            >
              <div className="flex">
                {/* Image */}
                <div className="w-56 h-44 overflow-hidden bg-slate-100 flex-shrink-0">
                  {cleaning.property.imageUrl ? (
                    <img 
                      src={cleaning.property.imageUrl} 
                      alt={cleaning.property.name}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                      <svg className="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </div>
                  )}
                </div>
                
                {/* Content */}
                <div className="flex-1 p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-slate-800 mb-1">{cleaning.property.name}</h3>
                      <div className="flex items-center gap-2 text-slate-500 text-sm">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span>{cleaning.property.address}</span>
                      </div>
                      
                      {/* Time & Guests */}
                      <div className="flex items-center gap-4 mt-3">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg">
                          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-sm font-medium text-slate-700">{cleaning.scheduledTime || "10:00"}</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg">
                          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                          </svg>
                          <span className="text-sm font-medium text-slate-700">
                            {cleaning.guestsCount || cleaning.booking?.guestsCount || 2} ospiti
                          </span>
                        </div>
                      </div>
                      
                      {/* Operators */}
                      <div className="mt-4">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Operatori</p>
                        {cleaning.operator ? (
                          <div className="flex gap-2">
                            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r ${getOperatorColor(index)} shadow-md`}>
                              <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center">
                                <span className="text-xs font-bold text-white">{getInitials(cleaning.operator.name)}</span>
                              </div>
                              <span className="text-sm font-medium text-white">{cleaning.operator.name}</span>
                            </div>
                          </div>
                        ) : (
                          <button className="flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-sky-400 hover:text-sky-600 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            <span className="text-sm font-medium">Assegna operatore</span>
                          </button>
                        )}
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex flex-col gap-2 ml-4">
                      <button className="flex items-center gap-2 px-4 py-2 bg-sky-50 text-sky-600 rounded-xl hover:bg-sky-100 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        <span className="text-sm font-medium">Dettagli</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
