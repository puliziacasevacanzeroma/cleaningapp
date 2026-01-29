"use client";

import { useState } from "react";
import NewCleaningModal from "~/components/NewCleaningModal";

interface Operator {
  id: string;
  name: string | null;
}

// Funzione per rimuovere operatore
async function removeOperator(cleaningId: string, operatorId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/dashboard/cleanings/${cleaningId}/assign`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operatorId }),
    });
    return res.ok;
  } catch {
    return false;
  }
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
  const [showNewCleaningModal, setShowNewCleaningModal] = useState(false);

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

  const getInitials = (name: string | null) => {
    if (!name) return "??";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const operatorColors = [
    "from-emerald-400 to-teal-500",
    "from-sky-400 to-blue-500",
    "from-violet-400 to-purple-500",
    "from-rose-400 to-pink-500",
    "from-amber-400 to-orange-500",
  ];

  const getOperatorColor = (index: number) => operatorColors[index % operatorColors.length];

  const handleNewCleaningSuccess = () => {
    // Ricarica la pagina per vedere la nuova pulizia
    window.location.reload();
  };

  return (
    <div className="p-4 lg:p-8">
      {/* Welcome */}
      <div className="mb-6 lg:mb-8">
        <div className="flex items-center gap-2 mb-1 lg:mb-2">
          <span className="text-xl lg:text-2xl">👋</span>
          <h1 className="text-xl lg:text-3xl font-bold text-slate-800">Ciao, {userName.split(" ")[0]}!</h1>
        </div>
        <p className="text-slate-500 text-sm lg:text-base">Ecco cosa succede oggi</p>
      </div>

      {/* Stats Grid - 2x2 su mobile, 4 colonne su desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6 mb-6 lg:mb-8">
        {/* Stat 1 - Pulizie Oggi */}
        <div className="bg-white rounded-2xl border border-slate-200/60 p-4 lg:p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 lg:w-32 h-20 lg:h-32 bg-gradient-to-br from-sky-400 to-blue-600 opacity-10 rounded-full blur-2xl -mr-6 lg:-mr-10 -mt-6 lg:-mt-10"></div>
          <div className="relative">
            <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl lg:rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center mb-3 lg:mb-4 shadow-lg shadow-sky-500/30">
              <svg className="w-5 h-5 lg:w-6 lg:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-xs lg:text-sm font-medium text-slate-500 mb-1">Pulizie Oggi</p>
            <span className="text-2xl lg:text-3xl font-bold text-slate-800">{stats.cleaningsToday}</span>
          </div>
        </div>

        {/* Stat 2 - Operatori */}
        <div className="bg-white rounded-2xl border border-slate-200/60 p-4 lg:p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 lg:w-32 h-20 lg:h-32 bg-gradient-to-br from-emerald-400 to-teal-600 opacity-10 rounded-full blur-2xl -mr-6 lg:-mr-10 -mt-6 lg:-mt-10"></div>
          <div className="relative">
            <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl lg:rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center mb-3 lg:mb-4 shadow-lg shadow-emerald-500/30">
              <svg className="w-5 h-5 lg:w-6 lg:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-xs lg:text-sm font-medium text-slate-500 mb-1">Operatori</p>
            <span className="text-2xl lg:text-3xl font-bold text-slate-800">{stats.operatorsActive}</span>
          </div>
        </div>

        {/* Stat 3 - Proprietà */}
        <div className="bg-white rounded-2xl border border-slate-200/60 p-4 lg:p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 lg:w-32 h-20 lg:h-32 bg-gradient-to-br from-violet-400 to-purple-600 opacity-10 rounded-full blur-2xl -mr-6 lg:-mr-10 -mt-6 lg:-mt-10"></div>
          <div className="relative">
            <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl lg:rounded-2xl bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center mb-3 lg:mb-4 shadow-lg shadow-violet-500/30">
              <svg className="w-5 h-5 lg:w-6 lg:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <p className="text-xs lg:text-sm font-medium text-slate-500 mb-1">Proprietà</p>
            <span className="text-2xl lg:text-3xl font-bold text-slate-800">{stats.propertiesTotal}</span>
          </div>
        </div>

        {/* Stat 4 - Check-in */}
        <div className="bg-white rounded-2xl border border-slate-200/60 p-4 lg:p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 lg:w-32 h-20 lg:h-32 bg-gradient-to-br from-amber-400 to-orange-500 opacity-10 rounded-full blur-2xl -mr-6 lg:-mr-10 -mt-6 lg:-mt-10"></div>
          <div className="relative">
            <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl lg:rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mb-3 lg:mb-4 shadow-lg shadow-amber-500/30">
              <svg className="w-5 h-5 lg:w-6 lg:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <p className="text-xs lg:text-sm font-medium text-slate-500 mb-1">Check-in</p>
            <span className="text-2xl lg:text-3xl font-bold text-slate-800">{stats.checkinsWeek}</span>
          </div>
        </div>
      </div>

      {/* Section Header con Pulsanti Azione */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4 lg:mb-6">
        <div>
          <h2 className="text-lg lg:text-xl font-bold text-slate-800">Pulizie di Oggi</h2>
          <p className="text-slate-500 text-sm">{formattedDate}</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          {/* Pulsante Nuova Pulizia */}
          <button
            onClick={() => setShowNewCleaningModal(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-medium shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/40 transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Nuova Pulizia</span>
          </button>

          {/* Search */}
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 shadow-sm">
            <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Cerca proprietà..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none text-sm flex-1 lg:w-40 placeholder:text-slate-400"
            />
          </div>
        </div>
      </div>

      {/* Cleaning Cards */}
      <div className="space-y-3 lg:space-y-4">
        {filteredCleanings.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/60 p-8 lg:p-12 text-center">
            <div className="w-14 h-14 lg:w-16 lg:h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 lg:w-8 lg:h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-base lg:text-lg font-semibold text-slate-800 mb-2">Nessuna pulizia per oggi</h3>
            <p className="text-slate-500 text-sm mb-4">Le pulizie programmate appariranno qui</p>
            <button
              onClick={() => setShowNewCleaningModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl font-medium hover:bg-emerald-100 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Crea la prima pulizia</span>
            </button>
          </div>
        ) : (
          filteredCleanings.map((cleaning, index) => (
            <div
              key={cleaning.id}
              className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden"
            >
              {/* Mobile Layout - Stack verticale */}
              <div className="lg:hidden">
                {/* Image - Piccola su mobile */}
                <div className="h-32 overflow-hidden bg-slate-100">
                  {cleaning.property.imageUrl ? (
                    <img
                      src={cleaning.property.imageUrl}
                      alt={cleaning.property.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                      <svg className="w-10 h-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-4">
                  <h3 className="text-lg font-bold text-slate-800 mb-1">{cleaning.property.name}</h3>
                  <div className="flex items-center gap-1 text-slate-500 text-sm mb-3">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    </svg>
                    <span className="truncate">{cleaning.property.address}</span>
                  </div>

                  {/* Time & Guests - Pills */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg">
                      <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-sm font-medium text-slate-700">{cleaning.scheduledTime || "10:00"}</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg">
                      <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                      <span className="text-sm font-medium text-slate-700">
                        {cleaning.guestsCount || cleaning.booking?.guestsCount || 2} ospiti
                      </span>
                    </div>
                  </div>

                  {/* Operator */}
                  <div className="flex items-center justify-between">
                    {cleaning.operator ? (
                      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r ${getOperatorColor(index)} shadow-md`}>
                        <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center">
                          <span className="text-xs font-bold text-white">{getInitials(cleaning.operator.name)}</span>
                        </div>
                        <span className="text-sm font-medium text-white">{cleaning.operator.name}</span>
                      </div>
                    ) : (
                      <button className="flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 border-dashed border-slate-300 text-slate-500">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="text-sm font-medium">Assegna</span>
                      </button>
                    )}

                    <button className="flex items-center gap-2 px-4 py-2 bg-sky-50 text-sky-600 rounded-xl">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      <span className="text-sm font-medium">Dettagli</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Desktop Layout - Orizzontale */}
              <div className="hidden lg:flex">
                <div className="w-56 h-44 overflow-hidden bg-slate-100 flex-shrink-0">
                  {cleaning.property.imageUrl ? (
                    <img
                      src={cleaning.property.imageUrl}
                      alt={cleaning.property.name}
                      className="w-full h-full object-cover hover:scale-110 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                      <svg className="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </div>
                  )}
                </div>

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

                      <div className="mt-4">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Operatori</p>
                        {cleaning.operator ? (
                          <div className="flex gap-2">
                            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r ${getOperatorColor(index)} shadow-md group relative`}>
                              <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center">
                                <span className="text-xs font-bold text-white">{getInitials(cleaning.operator.name)}</span>
                              </div>
                              <span className="text-sm font-medium text-white">{cleaning.operator.name}</span>
                              {/* Bottone X per rimuovere operatore */}
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (confirm(`Rimuovere ${cleaning.operator?.name} da questa pulizia?`)) {
                                    const success = await removeOperator(cleaning.id, cleaning.operator!.id);
                                    if (success) {
                                      window.location.reload();
                                    } else {
                                      alert("Errore nella rimozione dell'operatore");
                                    }
                                  }
                                }}
                                className="ml-1 w-5 h-5 rounded-full bg-white/20 hover:bg-red-500 flex items-center justify-center transition-colors"
                                title="Rimuovi operatore"
                              >
                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
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

      {/* Modal Nuova Pulizia */}
      <NewCleaningModal
        isOpen={showNewCleaningModal}
        onClose={() => setShowNewCleaningModal(false)}
        onSuccess={handleNewCleaningSuccess}
        userRole="ADMIN"
      />
    </div>
  );
}
