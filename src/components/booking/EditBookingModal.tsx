"use client";

import { useState, useEffect } from "react";

interface Booking {
  id: string;
  propertyId: string;
  propertyName?: string;
  guestName: string;
  checkIn: Date | string;
  checkOut: Date | string;
  status: string;
  source?: string;
  isManual?: boolean;
}

interface EditBookingModalProps {
  booking: Booking | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  isAdmin?: boolean;
}

const SOURCES = [
  { value: "direct", label: "Diretta", icon: "📞" },
  { value: "manual", label: "Manuale", icon: "✏️" },
  { value: "phone", label: "Telefono", icon: "☎️" },
  { value: "email", label: "Email", icon: "📧" },
  { value: "walkin", label: "Walk-in", icon: "🚶" },
  { value: "airbnb", label: "Airbnb", icon: "🏠" },
  { value: "booking", label: "Booking", icon: "🅱️" },
];

export default function EditBookingModal({
  booking,
  isOpen,
  onClose,
  onSuccess,
  isAdmin = false
}: EditBookingModalProps) {
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view');
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guestName, setGuestName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  // Reset form quando cambia booking
  useEffect(() => {
    if (booking && isOpen) {
      setMode('view');
      setError("");
      
      // Parse date
      const ciDate = booking.checkIn instanceof Date 
        ? booking.checkIn 
        : new Date(booking.checkIn);
      const coDate = booking.checkOut instanceof Date 
        ? booking.checkOut 
        : new Date(booking.checkOut);
      
      setCheckIn(ciDate.toISOString().split('T')[0]);
      setCheckOut(coDate.toISOString().split('T')[0]);
      setGuestName(booking.guestName || '');
    }
  }, [booking, isOpen]);

  // Verifica se è modificabile - prenotazioni manuali o con source manuale
  const isEditable = booking?.isManual === true || 
                     booking?.source === 'manual' || 
                     booking?.source === 'direct' || 
                     booking?.source === 'phone' ||
                     booking?.source === 'email' ||
                     booking?.source === 'walkin';

  // Admin può cancellare TUTTO, proprietario solo manuali
  const isDeletable = isAdmin || isEditable;

  const handleSave = async () => {
    if (!booking) return;
    setError("");

    // Validazioni
    if (!checkIn || !checkOut) {
      setError("Inserisci entrambe le date");
      return;
    }
    if (new Date(checkOut) <= new Date(checkIn)) {
      setError("Il check-out deve essere successivo al check-in");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkIn,
          checkOut,
          guestName: guestName || undefined
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Errore durante il salvataggio");
        setSaving(false);
        return;
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || "Errore di connessione");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!booking) return;
    
    setDeleting(true);
    try {
      const res = await fetch(`/api/bookings/${booking.id}?deleteCleaning=true&deleteOrder=true`, {
        method: "DELETE"
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Errore durante l'eliminazione");
        setDeleting(false);
        return;
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || "Errore di connessione");
    } finally {
      setDeleting(false);
    }
  };

  if (!isOpen || !booking) return null;

  // Parse date per visualizzazione
  const ciDate = booking.checkIn instanceof Date ? booking.checkIn : new Date(booking.checkIn);
  const coDate = booking.checkOut instanceof Date ? booking.checkOut : new Date(booking.checkOut);
  const nights = Math.ceil((coDate.getTime() - ciDate.getTime()) / (1000 * 60 * 60 * 24));

  const formatDate = (d: Date) => {
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  };

  // Colore fonte
  const getSourceLabel = (src?: string) => {
    const found = SOURCES.find(s => s.value === src);
    return found ? `${found.icon} ${found.label}` : src || 'Sconosciuta';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/60" 
        onClick={() => !saving && !deleting && onClose()} 
      />
      
      <div className="relative bg-white rounded-2xl w-full max-w-md mx-auto shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        
        {/* === MODALITÀ VISUALIZZAZIONE === */}
        {mode === 'view' && (
          <div className="p-5">
            {/* Header colorato */}
            <div className={`h-2 rounded-full mb-4 ${
              booking.source === 'airbnb' ? 'bg-gradient-to-r from-rose-400 to-red-500' :
              booking.source === 'booking' ? 'bg-gradient-to-r from-blue-400 to-blue-600' :
              'bg-gradient-to-r from-emerald-400 to-teal-500'
            }`}></div>

            {/* Nome ospite */}
            <div className="flex items-center gap-3 mb-4 p-3 bg-slate-50 rounded-xl">
              <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center">
                <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-xs text-slate-500">Ospite</p>
                <p className="font-bold text-slate-800 text-lg">{booking.guestName || 'Ospite'}</p>
              </div>
              {isEditable && (
                <span className="px-2 py-1 rounded-lg text-xs font-medium bg-emerald-100 text-emerald-700">
                  Manuale
                </span>
              )}
            </div>

            {/* Date */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-emerald-50 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-emerald-600">📥</span>
                  <span className="text-xs font-medium text-emerald-600">Check-in</span>
                </div>
                <p className="text-lg font-bold text-slate-800">{formatDate(ciDate)}</p>
              </div>
              <div className="bg-amber-50 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-amber-600">📤</span>
                  <span className="text-xs font-medium text-amber-600">Check-out</span>
                </div>
                <p className="text-lg font-bold text-slate-800">{formatDate(coDate)}</p>
              </div>
            </div>

            {/* Info aggiuntive */}
            <div className="space-y-2 mb-4">
              <div className="flex justify-between items-center py-2 px-3 bg-sky-50 rounded-xl">
                <span className="text-sm text-sky-600">🌙 Durata</span>
                <span className="font-bold text-slate-800">{nights} {nights === 1 ? 'notte' : 'notti'}</span>
              </div>
              <div className="flex justify-between items-center py-2 px-3 bg-purple-50 rounded-xl">
                <span className="text-sm text-purple-600">📍 Fonte</span>
                <span className="font-bold text-slate-800">{getSourceLabel(booking.source)}</span>
              </div>
            </div>

            {/* Bottoni */}
            <div className="flex gap-2">
              {isEditable && (
                <button
                  onClick={() => setMode('edit')}
                  className="flex-1 py-3 bg-sky-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 active:scale-98 transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Modifica
                </button>
              )}
              {isDeletable && (
                <button
                  onClick={() => setMode('delete')}
                  className="flex-1 py-3 bg-red-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 active:scale-98 transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Elimina
                </button>
              )}
              {(isEditable || isDeletable) ? (
                <button
                  onClick={onClose}
                  className="py-3 px-4 bg-slate-200 text-slate-700 rounded-xl font-semibold active:scale-98 transition-all"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={onClose}
                  className="flex-1 py-3 bg-slate-800 text-white rounded-xl font-semibold active:scale-98 transition-all"
                >
                  Chiudi
                </button>
              )}
            </div>

            {/* Messaggio per prenotazioni non modificabili */}
            {!isEditable && (
              <p className="text-xs text-slate-400 text-center mt-3">
                ℹ️ Solo le prenotazioni inserite manualmente possono essere modificate
              </p>
            )}
          </div>
        )}

        {/* === MODALITÀ MODIFICA === */}
        {mode === 'edit' && (
          <div className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => setMode('view')}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"
              >
                <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h3 className="text-lg font-bold text-slate-800">Modifica Prenotazione</h3>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl mb-4">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Nome Ospite */}
            <div className="mb-4">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Nome Ospite
              </label>
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="es. Mario Rossi"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            {/* Date */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Check-in
                </label>
                <input
                  type="date"
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Check-out
                </label>
                <input
                  type="date"
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                  min={checkIn}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            {/* Bottoni */}
            <div className="flex gap-3">
              <button
                onClick={() => setMode('view')}
                disabled={saving}
                className="flex-1 py-3 bg-slate-200 text-slate-700 rounded-xl font-semibold disabled:opacity-50"
              >
                Annulla
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-3 bg-sky-500 text-white rounded-xl font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Salvataggio...
                  </>
                ) : (
                  "Salva Modifiche"
                )}
              </button>
            </div>
          </div>
        )}

        {/* === MODALITÀ CONFERMA CANCELLAZIONE === */}
        {mode === 'delete' && (
          <div className="p-5">
            {/* Icona Warning */}
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <h3 className="text-xl font-bold text-slate-800 text-center mb-2">
              Conferma Eliminazione
            </h3>

            <p className="text-slate-600 text-center mb-4">
              Stai per eliminare la prenotazione di <strong>{booking.guestName || 'Ospite'}</strong>
            </p>

            {/* Riepilogo prenotazione */}
            <div className="bg-slate-50 rounded-xl p-3 mb-4">
              <div className="text-sm text-slate-600 space-y-1">
                <p>📅 <strong>Check-in:</strong> {formatDate(ciDate)}</p>
                <p>📅 <strong>Check-out:</strong> {formatDate(coDate)}</p>
                <p>🌙 <strong>Durata:</strong> {nights} {nights === 1 ? 'notte' : 'notti'}</p>
              </div>
            </div>

            {/* Warning */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
              <p className="text-sm text-amber-800 font-medium mb-2">
                ⚠️ Attenzione: Verranno eliminati anche:
              </p>
              <ul className="text-sm text-amber-700 space-y-1 ml-4">
                <li>• La pulizia programmata del {formatDate(coDate)}</li>
                <li>• L'ordine biancheria collegato</li>
              </ul>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl mb-4">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <p className="text-xs text-slate-500 text-center mb-4">
              🚫 Questa azione non può essere annullata.
            </p>

            {/* Bottoni */}
            <div className="flex gap-3">
              <button
                onClick={() => setMode('view')}
                disabled={deleting}
                className="flex-1 py-3 bg-slate-200 text-slate-700 rounded-xl font-semibold disabled:opacity-50"
              >
                Annulla
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-3 bg-red-500 text-white rounded-xl font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Eliminazione...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Elimina Tutto
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
