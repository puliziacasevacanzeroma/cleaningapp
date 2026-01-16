"use client";

import { useState } from "react";
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
  cleaningFee?: number | null;
  icalUrl?: string | null;
  _count: { bookings: number; cleanings: number };
}

interface ProprietarioProprietaClientProps {
  activeProperties: Property[];
  pendingProperties: Property[];
}

// ==================== ICONS ====================
const I: Record<string, JSX.Element> = {
  building: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75" /></svg>,
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><circle cx="9" cy="7" r="3" fill="currentColor" opacity="0.15"/><path d="M2 19C2 16 5 14 9 14S16 16 16 19"/><path d="M19 8V14M16 11H22"/></svg>,
  calendar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="3" y="4" width="18" height="18" rx="2" fill="currentColor" opacity="0.1"/><path d="M3 10H21M8 2V6M16 2V6"/></svg>,
  clean: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M12 2V8M9 8H15L14 22H10L9 8Z" fill="currentColor" opacity="0.1"/></svg>,
  money: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.1"/><path d="M12 6V18M15 9C15 8 14 7 12 7S9 8 9 10C9 11 10 12 12 12S15 13 15 15C15 17 14 17 12 17S9 16 9 15"/></svg>,
  clock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.1"/><path d="M12 6V12L16 14"/></svg>,
  bath: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M4 12H20V16C20 18 18 20 16 20H8C6 20 4 18 4 16V12Z" fill="currentColor" opacity="0.1"/><path d="M4 12H20"/></svg>,
  link: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M10 13C10.4 13.6 11 14 11.6 14.4C12.2 14.7 12.9 14.9 13.6 15C14.4 15 15.1 14.9 15.8 14.7C16.4 14.4 17 14 17.5 13.5L20.5 10.5C21.5 9.6 22 8.3 21.9 7C21.9 5.7 21.4 4.5 20.5 3.5C19.6 2.6 18.3 2.1 17 2.1C15.7 2.1 14.4 2.6 13.5 3.5L11.8 5.2"/><path d="M14 11C13.6 10.4 13 10 12.4 9.6C11.8 9.3 11.1 9.1 10.4 9C9.6 9 8.9 9.1 8.2 9.3C7.6 9.6 7 10 6.5 10.5L3.5 13.5C2.5 14.4 2 15.7 2.1 17C2.1 18.3 2.6 19.5 3.5 20.5C4.4 21.4 5.7 21.9 7 21.9C8.3 21.9 9.6 21.4 10.5 20.5L12.2 18.8"/></svg>,
  close: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M18 6L6 18M6 6L18 18"/></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-full h-full"><path d="M5 13L9 17L19 7"/></svg>,
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-full h-full"><path d="M12 4V20M4 12H20"/></svg>,
  right: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M9 5L16 12L9 19"/></svg>,
  edit: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M11 4H4C2.9 4 2 4.9 2 6V20C2 21.1 2.9 22 4 22H18C19.1 22 20 21.1 20 20V13"/><path d="M18.5 2.5C19.3 1.7 20.7 1.7 21.5 2.5C22.3 3.3 22.3 4.7 21.5 5.5L12 15L8 16L9 12L18.5 2.5Z"/></svg>,
  settings: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.15"/><path d="M12 1v3m0 16v3m-9-10h3m13 0h3"/></svg>,
  info: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.1"/><path d="M12 8V12M12 16H12.01"/></svg>,
};

// ==================== PROPERTY DETAIL MODAL ====================
function PropertyDetailModal({ property, onClose }: { property: Property; onClose: () => void }) {
  const [tab, setTab] = useState<'info' | 'stats'>('info');

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div 
        className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-3xl max-h-[90vh] flex flex-col shadow-xl"
        onClick={e => e.stopPropagation()}
        style={{ animation: 'slideUp 0.3s ease-out' }}
      >
        <style>{`
          @keyframes slideUp { from { opacity: 0; transform: translateY(100px); } to { opacity: 1; transform: translateY(0); } }
        `}</style>

        {/* Handle bar mobile */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-300 rounded-full"></div>
        </div>

        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-violet-100 to-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <div className="w-6 h-6 text-violet-500">{I.building}</div>
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">{property.name}</h2>
                <p className="text-xs text-slate-500">{property.address}, {property.city}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors">
              <div className="w-4 h-4 text-slate-500">{I.close}</div>
            </button>
          </div>

          {/* Status badge */}
          <div className="mt-3 flex items-center gap-2">
            <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-full flex items-center gap-1">
              <div className="w-3 h-3">{I.check}</div>
              Attiva
            </span>
            {property.icalUrl && (
              <span className="px-2.5 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full flex items-center gap-1">
                <div className="w-3 h-3">{I.link}</div>
                iCal
              </span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100">
          {[
            { k: 'info', l: 'Informazioni', i: 'info' },
            { k: 'stats', l: 'Statistiche', i: 'calendar' },
          ].map(t => (
            <button
              key={t.k}
              onClick={() => setTab(t.k as 'info' | 'stats')}
              className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                tab === t.k ? 'text-violet-600 border-b-2 border-violet-600' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <div className="w-4 h-4">{I[t.i]}</div>
              {t.l}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'info' && (
            <div className="space-y-4">
              {/* Quick Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center">
                      <div className="w-4 h-4 text-violet-600">{I.users}</div>
                    </div>
                  </div>
                  <p className="text-xl font-bold text-slate-800">{property.maxGuests || "N/D"}</p>
                  <p className="text-xs text-slate-500">Max Ospiti</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                      <div className="w-4 h-4 text-emerald-600">{I.money}</div>
                    </div>
                  </div>
                  <p className="text-xl font-bold text-slate-800">€{property.cleaningFee || 0}</p>
                  <p className="text-xs text-slate-500">Pulizia</p>
                </div>
              </div>

              {/* Details */}
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                {property.bathrooms && (
                  <div className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                        <div className="w-4 h-4 text-slate-500">{I.bath}</div>
                      </div>
                      <span className="text-sm text-slate-600">Bagni</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-800">{property.bathrooms}</span>
                  </div>
                )}
                {property.checkInTime && (
                  <div className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                        <div className="w-4 h-4 text-slate-500">{I.clock}</div>
                      </div>
                      <span className="text-sm text-slate-600">Check-in</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-800">{property.checkInTime}</span>
                  </div>
                )}
                {property.checkOutTime && (
                  <div className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                        <div className="w-4 h-4 text-slate-500">{I.clock}</div>
                      </div>
                      <span className="text-sm text-slate-600">Check-out</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-800">{property.checkOutTime}</span>
                  </div>
                )}
              </div>

              {/* iCal Info */}
              {property.icalUrl && (
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 text-blue-600">{I.link}</div>
                    <span className="text-sm font-semibold text-blue-800">Sincronizzazione iCal Attiva</span>
                  </div>
                  <p className="text-xs text-blue-600 break-all">{property.icalUrl}</p>
                </div>
              )}
            </div>
          )}

          {tab === 'stats' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-violet-50 rounded-xl p-4 border border-violet-100">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center">
                      <div className="w-4 h-4 text-violet-600">{I.calendar}</div>
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-violet-700">{property._count.bookings}</p>
                  <p className="text-xs text-violet-600">Prenotazioni</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                      <div className="w-4 h-4 text-emerald-600">{I.clean}</div>
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-emerald-700">{property._count.cleanings}</p>
                  <p className="text-xs text-emerald-600">Pulizie</p>
                </div>
              </div>

              {/* Info message */}
              <div className="bg-slate-50 rounded-xl p-4 text-center">
                <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <div className="w-5 h-5 text-slate-400">{I.info}</div>
                </div>
                <p className="text-sm text-slate-600">Per maggiori statistiche e dettagli contatta l'amministratore</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          <div className="flex gap-3">
            <button 
              onClick={onClose}
              className="flex-1 py-3 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors"
            >
              Chiudi
            </button>
            <button 
              className="flex-1 py-3 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 transition-colors flex items-center justify-center gap-2"
            >
              <div className="w-4 h-4">{I.edit}</div>
              Modifica
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== MAIN COMPONENT ====================
export function ProprietarioProprietaClient({ activeProperties, pendingProperties }: ProprietarioProprietaClientProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);

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
          <div className="w-4 h-4">{I.plus}</div>
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
                      <div className="w-7 h-7 text-amber-600">{I.building}</div>
                      {/* Badge orologio */}
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center border-2 border-white">
                        <div className="w-3 h-3 text-white">{I.clock}</div>
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
                          <div className="w-3.5 h-3.5 text-slate-400">{I.users}</div>
                          <span className="text-[11px] text-slate-600 font-medium">Max {property.maxGuests || "N/D"}</span>
                        </div>
                        {property.bathrooms && (
                          <div className="flex items-center gap-1 px-2 py-1 bg-slate-50 rounded-lg">
                            <div className="w-3.5 h-3.5 text-slate-400">{I.bath}</div>
                            <span className="text-[11px] text-slate-600 font-medium">{property.bathrooms} bagni</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Info box */}
                  <div className="mt-3 px-3 py-2 bg-amber-50 rounded-xl flex items-center gap-2">
                    <div className="w-4 h-4 text-amber-500">{I.info}</div>
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
              <button
                key={property.id}
                onClick={() => setSelectedProperty(property)}
                className="w-full text-left bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-md transition-all active:scale-[0.98]"
              >
                {/* Header con gradiente viola */}
                <div className="h-2 bg-gradient-to-r from-violet-500 to-purple-500"></div>

                <div className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 bg-gradient-to-br from-violet-100 to-purple-100 rounded-xl flex items-center justify-center flex-shrink-0 relative">
                      <div className="w-7 h-7 text-violet-500">{I.building}</div>
                      {/* Badge check */}
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-white">
                        <div className="w-3 h-3 text-white">{I.check}</div>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold text-slate-800 truncate">{property.name}</h3>
                        <div className="w-5 h-5 text-slate-400 flex-shrink-0">{I.right}</div>
                      </div>
                      <p className="text-xs text-slate-500 truncate">{property.address}, {property.city}</p>
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1 px-2 py-1 bg-slate-50 rounded-lg">
                          <div className="w-3.5 h-3.5 text-slate-400">{I.users}</div>
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
              </button>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <div className="w-7 h-7 text-slate-400">{I.building}</div>
            </div>
            <p className="text-slate-700 font-medium">Nessuna proprietà attiva</p>
            <p className="text-sm text-slate-500 mt-1">Aggiungi la tua prima proprietà</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 mt-4 px-4 py-2.5 bg-violet-500 text-white text-sm font-medium rounded-xl hover:bg-violet-600 active:scale-95 transition-all"
            >
              <div className="w-4 h-4">{I.plus}</div>
              Aggiungi Proprietà
            </button>
          </div>
        )}
      </div>

      {/* Modal Crea Proprietà */}
      <CreaProprietaOwnerModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />

      {/* Modal Dettaglio Proprietà */}
      {selectedProperty && (
        <PropertyDetailModal
          property={selectedProperty}
          onClose={() => setSelectedProperty(null)}
        />
      )}
    </div>
  );
}
