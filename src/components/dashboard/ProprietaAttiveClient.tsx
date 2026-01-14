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
  const [sortBy, setSortBy] = useState<string>("name");

  // Filtra proprietà
  const filteredProperties = useMemo(() => {
    let filtered = properties.filter(p => {
      const matchesSearch = searchTerm === "" || 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.owner?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.owner?.email?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSearch;
    });

    // Ordina
    filtered.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "address") return a.address.localeCompare(b.address);
      if (sortBy === "owner") return (a.owner?.name || "").localeCompare(b.owner?.name || "");
      if (sortBy === "bookings") return (b._count?.bookings || 0) - (a._count?.bookings || 0);
      return 0;
    });

    return filtered;
  }, [properties, searchTerm, sortBy]);

  // Colori proprietà
  const propertyColors = [
    { bg: "from-rose-400 to-red-500", light: "from-rose-100 to-rose-200", icon: "text-rose-500" },
    { bg: "from-sky-400 to-blue-500", light: "from-sky-100 to-sky-200", icon: "text-sky-500" },
    { bg: "from-amber-400 to-orange-500", light: "from-amber-100 to-amber-200", icon: "text-amber-500" },
    { bg: "from-violet-400 to-purple-500", light: "from-violet-100 to-violet-200", icon: "text-violet-500" },
    { bg: "from-emerald-400 to-teal-500", light: "from-emerald-100 to-emerald-200", icon: "text-emerald-500" },
    { bg: "from-pink-400 to-rose-500", light: "from-pink-100 to-pink-200", icon: "text-pink-500" },
  ];

  return (
    <div className="p-8 overflow-x-hidden">
      {/* Header */}
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

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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
              <p className="text-sm text-slate-500">Filtrate</p>
              <p className="text-2xl font-bold text-slate-800">{filteredProperties.length}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Barra Ricerca e Filtri */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="relative flex-1 min-w-[300px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Cerca per nome, indirizzo o proprietario..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          <option value="name">Ordina per Nome</option>
          <option value="address">Ordina per Indirizzo</option>
          <option value="owner">Ordina per Proprietario</option>
          <option value="bookings">Ordina per Prenotazioni</option>
        </select>
      </div>

      {/* Grid Proprietà */}
      {filteredProperties.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <p className="text-slate-500">Nessuna proprietà trovata</p>
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm("")}
              className="mt-4 px-4 py-2 text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
            >
              Cancella ricerca
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProperties.map((property, index) => {
            const colorSet = propertyColors[index % propertyColors.length];
            return (
              <div 
                key={property.id} 
                className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden group"
              >
                {/* Image/Header */}
                <div className={`h-32 bg-gradient-to-br ${colorSet.bg} relative`}>
                  {property.imageUrl ? (
                    <img src={property.imageUrl} alt={property.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-12 h-12 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                      </svg>
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
                      href={`/dashboard/proprieta/${property.id}/edit`}
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
      )}
    </div>
  );
}
