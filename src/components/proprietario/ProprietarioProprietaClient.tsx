"use client";

import { useState } from "react";
import Link from "next/link";
import { CreaProprietaOwnerModal } from "~/components/dashboard/CreaProprietaOwnerModal";

interface Property {
  id: string;
  name: string;
  address: string;
  city?: string;
  status: string;
  maxGuests?: number | null;
  bathrooms?: number | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  imageUrl?: string | null;
  _count?: { bookings: number; cleanings: number };
}

interface ProprietarioProprietaClientProps {
  activeProperties: Property[];
  pendingProperties: Property[];
}

const placeholderImages = [
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600&h=400&fit=crop",
  "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600&h=400&fit=crop",
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600&h=400&fit=crop",
  "https://images.unsplash.com/photo-1484154218962-a197022b5858?w=600&h=400&fit=crop",
];

export function ProprietarioProprietaClient({ activeProperties, pendingProperties }: ProprietarioProprietaClientProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);

  const getPlaceholderImage = (index: number) => {
    return placeholderImages[index % placeholderImages.length];
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Le Mie Proprietà</h1>
            <p className="text-sm text-slate-500 mt-0.5">{activeProperties.length + pendingProperties.length} proprietà totali</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="w-11 h-11 bg-slate-900 text-white rounded-xl flex items-center justify-center hover:bg-slate-800 transition-all active:scale-95 shadow-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Proprietà in attesa di approvazione */}
        {pendingProperties.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></div>
              <h2 className="text-sm font-semibold text-slate-600">In attesa di approvazione ({pendingProperties.length})</h2>
            </div>
            <div className="space-y-4">
              {pendingProperties.map((property, index) => (
                <div
                  key={property.id}
                  className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-200"
                >
                  <div className="relative h-40 bg-slate-200">
                    <img 
                      src={property.imageUrl || getPlaceholderImage(index)}
                      alt={property.name}
                      className="w-full h-full object-cover opacity-70"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"></div>
                    
                    <div className="absolute top-3 left-3">
                      <span className="px-3 py-1.5 bg-amber-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-lg">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        In attesa
                      </span>
                    </div>

                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <h3 className="text-white font-bold text-lg truncate">{property.name}</h3>
                      <p className="text-white/80 text-sm truncate">{property.address}{property.city ? `, ${property.city}` : ""}</p>
                    </div>
                  </div>

                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="text-sm font-medium">{property.maxGuests || "N/D"} ospiti</span>
                      </div>
                      {property.bathrooms && (
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          <span className="text-sm font-medium">{property.bathrooms} bagni</span>
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-lg font-medium">
                      Revisione in corso
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Proprietà attive */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
            <h2 className="text-sm font-semibold text-slate-600">Attive ({activeProperties.length})</h2>
          </div>

          {activeProperties.length > 0 ? (
            <div className="space-y-4">
              {activeProperties.map((property, index) => (
                <Link
                  key={property.id}
                  href={`/proprietario/proprieta/${property.id}`}
                  className="block"
                >
                  <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-200 hover:shadow-lg transition-all active:scale-[0.98]">
                    <div className="relative h-44 bg-slate-200">
                      <img 
                        src={property.imageUrl || getPlaceholderImage(index)}
                        alt={property.name}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div>
                      
                      <div className="absolute top-3 left-3">
                        <span className="px-2.5 py-1 bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1 shadow-lg">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                          Attiva
                        </span>
                      </div>

                      <div className="absolute top-3 right-3">
                        <div className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>

                      <div className="absolute bottom-0 left-0 right-0 p-4">
                        <h3 className="text-white font-bold text-xl truncate">{property.name}</h3>
                        <p className="text-white/80 text-sm truncate mt-0.5">{property.address}{property.city ? `, ${property.city}` : ""}</p>
                      </div>
                    </div>

                    <div className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1.5 text-slate-600">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="text-sm font-medium">{property.maxGuests || "N/D"}</span>
                          </div>
                          <div className="h-4 w-px bg-slate-200"></div>
                          <div className="flex items-center gap-1.5 text-blue-600">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className="text-sm font-medium">{property._count?.bookings || 0}</span>
                          </div>
                          <div className="h-4 w-px bg-slate-200"></div>
                          <div className="flex items-center gap-1.5 text-emerald-600">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                            </svg>
                            <span className="text-sm font-medium">{property._count?.cleanings || 0}</span>
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
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </div>
              <p className="text-slate-800 font-semibold text-lg">Nessuna proprietà</p>
              <p className="text-sm text-slate-500 mt-1 mb-4">Aggiungi la tua prima proprietà per iniziare</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-800 active:scale-95 transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Aggiungi Proprietà
              </button>
            </div>
          )}
        </div>
      </div>

      <CreaProprietaOwnerModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
    </div>
  );
}