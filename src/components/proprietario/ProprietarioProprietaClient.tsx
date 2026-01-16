"use client";

import { useState } from "react";
import Link from "next/link";
import { CreaProprietaOwnerModal } from "~/components/dashboard/CreaProprietaOwnerModal";

interface Property {
  id: string;
  name: string;
  address: string;
  city: string;
  status: string;
  maxGuests: number | null;
  bathrooms?: number | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  _count: { bookings: number; cleanings: number };
}

interface ProprietarioProprietaClientProps {
  activeProperties: Property[];
  pendingProperties: Property[];
}

export function ProprietarioProprietaClient({ activeProperties, pendingProperties }: ProprietarioProprietaClientProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);

  return (
    <div className="p-4 pb-24">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Le Mie Proprietà</h1>
          <p className="text-sm text-slate-500 mt-0.5">Gestisci le tue proprietà</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2.5 bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-medium rounded-xl hover:shadow-lg transition-all flex items-center gap-2 active:scale-95"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Nuova
        </button>
      </div>

      {/* Proprietà in attesa di approvazione */}
      {pendingProperties.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
            In attesa ({pendingProperties.length})
          </h2>
          <div className="space-y-3">
            {pendingProperties.map((property) => (
              <div 
                key={property.id} 
                className="bg-white rounded-2xl border-2 border-amber-200 overflow-hidden shadow-sm"
              >
                {/* Header con gradiente amber */}
                <div className="h-2 bg-gradient-to-r from-amber-400 to-orange-400"></div>
                
                <div className="p-4">
                  <div className="flex items-center gap-3">
                    {/* Icona */}
                    <div className="w-14 h-14 bg-gradient-to-br from-amber-100 to-orange-100 rounded-xl flex items-center justify-center flex-shrink-0 relative">
                      <svg className="w-7 h-7 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75" />
                      </svg>
                      {/* Badge orologio */}
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center border-2 border-white">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l2 2" />
                        </svg>
                      </div>
                    </div>
                    
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-slate-800 truncate">{property.name}</h3>
                        <span className="flex-shrink-0 px-2.5 py-1 bg-gradient-to-r from-amber-100 to-orange-100 text-amber-700 text-[10px] font-bold rounded-full border border-amber-200">
                          ⏳ IN ATTESA
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5">{property.address}, {property.city}</p>
                      
                      {/* Stats row */}
                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1 px-2 py-1 bg-slate-50 rounded-lg">
                          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span className="text-[11px] text-slate-600 font-medium">Max {property.maxGuests || "N/D"}</span>
                        </div>
                        {property.bathrooms && (
                          <div className="flex items-center gap-1 px-2 py-1 bg-slate-50 rounded-lg">
                            <span className="text-[11px]">🚿</span>
                            <span className="text-[11px] text-slate-600 font-medium">{property.bathrooms} bagni</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Info box */}
                  <div className="mt-3 px-3 py-2 bg-amber-50 rounded-xl flex items-center gap-2">
                    <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    <p className="text-[11px] text-amber-700">In attesa di approvazione dall'amministratore</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Proprietà attive */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
          Attive ({activeProperties.length})
        </h2>
        
        {activeProperties.length > 0 ? (
          <div className="space-y-3">
            {activeProperties.map((property) => (
              <Link
                key={property.id}
                href={`/proprietario/proprieta/${property.id}`}
                className="block bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-md transition-all active:scale-[0.98]"
              >
                {/* Header con gradiente viola */}
                <div className="h-2 bg-gradient-to-r from-violet-500 to-purple-500"></div>
                
                <div className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 bg-gradient-to-br from-violet-100 to-purple-100 rounded-xl flex items-center justify-center flex-shrink-0 relative">
                      <svg className="w-7 h-7 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75" />
                      </svg>
                      {/* Badge check */}
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-white">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold text-slate-800 truncate">{property.name}</h3>
                        <svg className="w-5 h-5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                      <p className="text-xs text-slate-500 truncate">{property.address}, {property.city}</p>
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1 px-2 py-1 bg-slate-50 rounded-lg">
                          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span className="text-[11px] text-slate-600 font-medium">Max {property.maxGuests || "N/D"}</span>
                        </div>
                        <div className="flex items-center gap-1 px-2 py-1 bg-violet-50 rounded-lg">
                          <span className="text-[11px] text-violet-600 font-medium">{property._count.bookings} prenotazioni</span>
                        </div>
                        <div className="flex items-center gap-1 px-2 py-1 bg-emerald-50 rounded-lg">
                          <span className="text-[11px] text-emerald-600 font-medium">{property._count.cleanings} pulizie</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75" />
              </svg>
            </div>
            <p className="text-slate-700 font-medium">Nessuna proprietà attiva</p>
            <p className="text-sm text-slate-500 mt-1">Aggiungi la tua prima proprietà</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 mt-4 px-4 py-2.5 bg-violet-500 text-white text-sm font-medium rounded-xl hover:bg-violet-600 active:scale-95 transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Aggiungi Proprietà
            </button>
          </div>
        )}
      </div>

      {/* Modal */}
      <CreaProprietaOwnerModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
    </div>
  );
}
