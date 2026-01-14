"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ApprovePropertyButton } from "~/_components/dashboard/ApprovePropertyButton";

interface Property {
  id: string;
  name: string;
  address: string;
  city: string;
  owner?: { name: string | null; email?: string | null } | null;
  _count?: { bookings: number; cleanings: number };
}

interface ProprietaClientProps {
  activeProperties: Property[];
  pendingProperties: Property[];
}

export function ProprietaClient({ activeProperties, pendingProperties }: ProprietaClientProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const colors = [
    "from-sky-400 to-blue-500",
    "from-emerald-400 to-teal-500", 
    "from-violet-400 to-purple-500",
    "from-rose-400 to-red-500",
    "from-amber-400 to-orange-500",
    "from-pink-400 to-rose-500"
  ];

  // Filtra proprietà attive
  const filteredActive = useMemo(() => {
    if (!searchTerm) return activeProperties;
    const term = searchTerm.toLowerCase();
    return activeProperties.filter(p => 
      p.name.toLowerCase().includes(term) ||
      p.address.toLowerCase().includes(term) ||
      p.city.toLowerCase().includes(term) ||
      p.owner?.name?.toLowerCase().includes(term)
    );
  }, [activeProperties, searchTerm]);

  // Filtra proprietà in attesa
  const filteredPending = useMemo(() => {
    if (!searchTerm) return pendingProperties;
    const term = searchTerm.toLowerCase();
    return pendingProperties.filter(p => 
      p.name.toLowerCase().includes(term) ||
      p.address.toLowerCase().includes(term) ||
      p.city.toLowerCase().includes(term) ||
      p.owner?.name?.toLowerCase().includes(term)
    );
  }, [pendingProperties, searchTerm]);

  return (
    <div className="p-4 lg:p-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Proprietà</h1>
          <p className="text-slate-500 mt-1">{activeProperties.length} attive, {pendingProperties.length} in attesa</p>
        </div>
      </div>

      {/* Barra Ricerca */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Cerca proprietà per nome, indirizzo, città o proprietario..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
          />
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {searchTerm && (
          <p className="text-sm text-slate-500 mt-2">
            Trovate {filteredActive.length} attive e {filteredPending.length} in attesa per "{searchTerm}"
          </p>
        )}
      </div>

      {/* Proprietà in attesa */}
      {filteredPending.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-3 h-3 bg-amber-500 rounded-full animate-pulse"></span>
            <h2 className="text-lg font-bold text-slate-800">In attesa di approvazione ({filteredPending.length})</h2>
          </div>
          <div className="space-y-3">
            {filteredPending.map((property) => (
              <div key={property.id} className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-800">{property.name}</h3>
                  <p className="text-sm text-slate-600">{property.address}, {property.city}</p>
                  <p className="text-sm text-slate-500 mt-1">
                    Richiesta da: <span className="font-medium">{property.owner?.name || "N/D"}</span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <ApprovePropertyButton propertyId={property.id} action="reject" />
                  <ApprovePropertyButton propertyId={property.id} action="approve" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Proprietà attive */}
      <h2 className="text-lg font-bold text-slate-800 mb-4">Proprietà Attive ({filteredActive.length})</h2>
      
      {filteredActive.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <p className="text-slate-500">Nessuna proprietà trovata per "{searchTerm}"</p>
          <button 
            onClick={() => setSearchTerm("")}
            className="mt-4 px-4 py-2 text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
          >
            Cancella ricerca
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredActive.map((property, idx) => (
            <Link 
              key={property.id} 
              href={`/dashboard/proprieta/${property.id}`} 
              className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all overflow-hidden group"
            >
              <div className={`h-28 bg-gradient-to-br ${colors[idx % colors.length]} relative`}>
                <div className="absolute bottom-4 left-4 right-4">
                  <h3 className="text-lg font-bold text-white truncate">{property.name}</h3>
                  {property.owner && <p className="text-white/80 text-sm">{property.owner.name}</p>}
                </div>
              </div>
              <div className="p-4">
                <p className="text-sm text-slate-500 truncate">{property.address}, {property.city}</p>
                <div className="flex gap-4 mt-3">
                  <span className="text-sm"><strong>{property._count?.bookings || 0}</strong> prenotazioni</span>
                  <span className="text-sm"><strong>{property._count?.cleanings || 0}</strong> pulizie</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
