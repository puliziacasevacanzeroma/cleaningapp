"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

interface Property {
  id: string;
  name: string;
  address: string;
  status: string;
  imageUrl?: string | null;
  owner?: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
  _count?: {
    bookings: number;
    cleanings: number;
  };
}

interface ProprietaAttiveClientProps {
  properties: Property[];
}

export function ProprietaAttiveClient({ properties }: ProprietaAttiveClientProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);

  // Filtra proprietà
  const filteredProperties = useMemo(() => {
    if (searchTerm === "") return properties;
    return properties.filter(p => 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.address.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [properties, searchTerm]);

  // Colori per le card
  const cardColors = [
    { bg: "from-rose-500 to-pink-600", light: "bg-rose-50", text: "text-rose-600", border: "border-rose-200" },
    { bg: "from-sky-500 to-blue-600", light: "bg-sky-50", text: "text-sky-600", border: "border-sky-200" },
    { bg: "from-amber-500 to-orange-600", light: "bg-amber-50", text: "text-amber-600", border: "border-amber-200" },
    { bg: "from-violet-500 to-purple-600", light: "bg-violet-50", text: "text-violet-600", border: "border-violet-200" },
    { bg: "from-emerald-500 to-teal-600", light: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-200" },
    { bg: "from-cyan-500 to-blue-600", light: "bg-cyan-50", text: "text-cyan-600", border: "border-cyan-200" },
    { bg: "from-fuchsia-500 to-pink-600", light: "bg-fuchsia-50", text: "text-fuchsia-600", border: "border-fuchsia-200" },
    { bg: "from-lime-500 to-green-600", light: "bg-lime-50", text: "text-lime-600", border: "border-lime-200" },
  ];

  const getColorForProperty = (index: number) => cardColors[index % cardColors.length];

  // Stats
  const totalBookings = properties.reduce((sum, p) => sum + (p._count?.bookings || 0), 0);
  const totalCleanings = properties.reduce((sum, p) => sum + (p._count?.cleanings || 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50/30 pb-24">
      {/* Header Mobile */}
      <div className="lg:hidden sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="px-4 py-3">
          {/* Titolo e Aggiungi */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-lg font-bold text-slate-800">Proprietà</h1>
              <p className="text-xs text-slate-500">{properties.length} attive</p>
            </div>
            <Link 
              href="/dashboard/proprieta/nuova"
              className="w-10 h-10 bg-gradient-to-br from-sky-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30 active:scale-95 transition-transform"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
            </Link>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-2.5 border border-emerald-100">
              <p className="text-lg font-bold text-emerald-600">{properties.length}</p>
              <p className="text-[10px] text-emerald-600/70 font-medium">Proprietà</p>
            </div>
            <div className="bg-gradient-to-br from-sky-50 to-blue-50 rounded-xl p-2.5 border border-sky-100">
              <p className="text-lg font-bold text-sky-600">{totalBookings}</p>
              <p className="text-[10px] text-sky-600/70 font-medium">Prenotazioni</p>
            </div>
            <div className="bg-gradient-to-br from-violet-50 to-purple-50 rounded-xl p-2.5 border border-violet-100">
              <p className="text-lg font-bold text-violet-600">{totalCleanings}</p>
              <p className="text-[10px] text-violet-600/70 font-medium">Pulizie</p>
            </div>
          </div>

          {/* Search + View Toggle */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Cerca proprietà..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/50"
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 bg-slate-300 rounded-full flex items-center justify-center"
                >
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            
            {/* View Toggle */}
            <div className="flex bg-slate-100 rounded-xl p-0.5">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-2 rounded-lg transition-all ${viewMode === "grid" ? "bg-white shadow-sm" : ""}`}
              >
                <svg className={`w-4 h-4 ${viewMode === "grid" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 rounded-lg transition-all ${viewMode === "list" ? "bg-white shadow-sm" : ""}`}
              >
                <svg className={`w-4 h-4 ${viewMode === "list" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Header - manteniamo quello esistente */}
      <div className="hidden lg:block p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Proprietà Attive</h1>
            <p className="text-slate-500">Gestisci tutte le proprietà attive nel sistema</p>
          </div>
          <Link 
            href="/dashboard/proprieta/nuova"
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-xl font-medium hover:shadow-lg transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nuova Proprietà
          </Link>
        </div>

        {/* Desktop Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Totale Attive</p>
                <p className="text-2xl font-bold text-slate-800">{properties.length}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Prenotazioni</p>
                <p className="text-2xl font-bold text-slate-800">{totalBookings}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Pulizie</p>
                <p className="text-2xl font-bold text-slate-800">{totalCleanings}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Filtrate</p>
                <p className="text-2xl font-bold text-slate-800">{filteredProperties.length}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Desktop Search */}
        <div className="relative max-w-md mb-6">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Cerca per nome o indirizzo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
      </div>

      {/* Content Area */}
      <div className="px-3 lg:px-8">
        {filteredProperties.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <p className="text-slate-500 mb-2">Nessuna proprietà trovata</p>
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm("")}
                className="text-sky-600 text-sm font-medium"
              >
                Cancella ricerca
              </button>
            )}
          </div>
        ) : (
          <>
            {/* MOBILE: Grid View */}
            <div className={`lg:hidden ${viewMode === "grid" ? "block" : "hidden"}`}>
              <div className="grid grid-cols-3 gap-2">
                {filteredProperties.map((property, index) => {
                  const color = getColorForProperty(index);
                  return (
                    <Link
                      key={property.id}
                      href={`/dashboard/proprieta/${property.id}`}
                      className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm active:scale-95 transition-all"
                    >
                      {/* Gradient Top */}
                      <div className={`h-16 bg-gradient-to-br ${color.bg} relative flex items-center justify-center`}>
                        <span className="text-2xl font-bold text-white/90">
                          {property.name.slice(0, 2).toUpperCase()}
                        </span>
                        {/* Badge prenotazioni */}
                        {(property._count?.bookings || 0) > 0 && (
                          <div className="absolute -bottom-2 right-2 bg-white rounded-full px-1.5 py-0.5 shadow-md border border-slate-100">
                            <span className="text-[9px] font-bold text-slate-700">{property._count?.bookings}</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Content */}
                      <div className="p-2">
                        <p className="text-[11px] font-semibold text-slate-800 truncate leading-tight">
                          {property.name}
                        </p>
                        <p className="text-[9px] text-slate-400 truncate mt-0.5">
                          {property.address.split(",")[0]}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* MOBILE: List View */}
            <div className={`lg:hidden ${viewMode === "list" ? "block" : "hidden"}`}>
              <div className="space-y-2">
                {filteredProperties.map((property, index) => {
                  const color = getColorForProperty(index);
                  return (
                    <Link
                      key={property.id}
                      href={`/dashboard/proprieta/${property.id}`}
                      className="flex items-center gap-3 bg-white rounded-xl border border-slate-100 p-3 shadow-sm active:scale-[0.98] transition-all"
                    >
                      {/* Avatar */}
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color.bg} flex items-center justify-center flex-shrink-0`}>
                        <span className="text-lg font-bold text-white">
                          {property.name.slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{property.name}</p>
                        <p className="text-xs text-slate-400 truncate">{property.address}</p>
                      </div>
                      
                      {/* Stats */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="text-center">
                          <p className="text-sm font-bold text-sky-600">{property._count?.bookings || 0}</p>
                          <p className="text-[9px] text-slate-400">Pren.</p>
                        </div>
                        <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* DESKTOP: Card Grid (manteniamo simile all'originale) */}
            <div className="hidden lg:grid lg:grid-cols-3 gap-6">
              {filteredProperties.map((property, index) => {
                const color = getColorForProperty(index);
                return (
                  <div 
                    key={property.id} 
                    className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden group"
                  >
                    {/* Image/Header */}
                    <div className={`h-32 bg-gradient-to-br ${color.bg} relative`}>
                      {property.imageUrl ? (
                        <img src={property.imageUrl} alt={property.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-4xl font-bold text-white/50">
                            {property.name.slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className="absolute top-3 right-3">
                        <span className="px-2 py-1 bg-emerald-500 text-white text-xs font-medium rounded-lg">
                          Attiva
                        </span>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-4">
                      <h3 className="font-semibold text-slate-800 text-lg mb-1 truncate">{property.name}</h3>
                      <p className="text-sm text-slate-500 mb-3 truncate">{property.address}</p>

                      {/* Owner */}
                      {property.owner && (
                        <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-100">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center">
                            <span className="text-xs font-bold text-white">
                              {property.owner.name?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "??"}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-700 truncate">{property.owner.name}</p>
                            <p className="text-xs text-slate-400 truncate">{property.owner.email}</p>
                          </div>
                        </div>
                      )}

                      {/* Stats */}
                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span>{property._count?.bookings || 0} prenotazioni</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span>{property._count?.cleanings || 0} pulizie</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 mt-4">
                        <Link 
                          href={`/dashboard/proprieta/${property.id}`}
                          className="flex-1 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium text-center hover:bg-slate-200 transition-colors"
                        >
                          Dettagli
                        </Link>
                        <Link 
                          href={`/dashboard/proprieta/${property.id}`}
                          className="px-3 py-2 bg-sky-50 text-sky-600 rounded-lg text-sm font-medium hover:bg-sky-100 transition-colors"
                        >
                          Modifica
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Modal Dettaglio Proprietà (Mobile) */}
      {selectedProperty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 lg:hidden">
          <div 
            className="absolute inset-0 bg-black/60" 
            onClick={() => setSelectedProperty(null)} 
          />
          <div className="relative bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            {(() => {
              const index = properties.findIndex(p => p.id === selectedProperty.id);
              const color = getColorForProperty(index);
              
              return (
                <>
                  {/* Header colorato */}
                  <div className={`h-24 bg-gradient-to-br ${color.bg} flex items-center justify-center relative`}>
                    <span className="text-4xl font-bold text-white/80">
                      {selectedProperty.name.slice(0, 2).toUpperCase()}
                    </span>
                    <button
                      onClick={() => setSelectedProperty(null)}
                      className="absolute top-3 right-3 w-8 h-8 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center"
                    >
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  
                  {/* Content */}
                  <div className="p-4">
                    <h3 className="text-lg font-bold text-slate-800 mb-1">{selectedProperty.name}</h3>
                    <p className="text-sm text-slate-500 mb-4">{selectedProperty.address}</p>
                    
                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="bg-sky-50 rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold text-sky-600">{selectedProperty._count?.bookings || 0}</p>
                        <p className="text-xs text-sky-600/70">Prenotazioni</p>
                      </div>
                      <div className="bg-violet-50 rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold text-violet-600">{selectedProperty._count?.cleanings || 0}</p>
                        <p className="text-xs text-violet-600/70">Pulizie</p>
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex gap-2">
                      <Link
                        href={`/dashboard/proprieta/${selectedProperty.id}`}
                        className="flex-1 py-3 bg-slate-800 text-white rounded-xl font-semibold text-center"
                      >
                        Vedi Dettagli
                      </Link>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
