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
              <div key={property.id} className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-amber-100 to-amber-200 rounded-xl flex items-center justify-center">
                      <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-800">{property.name}</h3>
                      <p className="text-xs text-slate-500">{property.address}, {property.city}</p>
                    </div>
                  </div>
                  <span className="px-2 py-1 bg-amber-200 text-amber-800 text-[10px] font-bold rounded-lg">
                    IN ATTESA
                  </span>
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
                className="block bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md transition-all active:scale-[0.98]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 bg-gradient-to-br from-violet-100 to-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <svg className="w-7 h-7 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-800 truncate">{property.name}</h3>
                    <p className="text-xs text-slate-500 truncate">{property.address}, {property.city}</p>
                    <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Max {property.maxGuests || "N/D"}
                      </span>
                      <span>{property._count.bookings} prenotazioni</span>
                      <span>{property._count.cleanings} pulizie</span>
                    </div>
                  </div>
                  <svg className="w-5 h-5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
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
