"use client";

import { useState } from "react";

interface CleaningActionModalProps {
  cleaning: {
    id: string;
    propertyName: string;
    propertyId: string;
    scheduledDate: Date | string | any;
    scheduledTime?: string;
    status: string;
    operatorName?: string;
  };
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  isAdmin?: boolean;
}

const CANCEL_REASONS = [
  { value: "guest_cancelled", label: "Ospiti hanno cancellato" },
  { value: "plan_change", label: "Cambio piano pulizie" },
  { value: "property_unavailable", label: "Proprietà non disponibile" },
  { value: "error_duplicate", label: "Errore/Duplicato" },
  { value: "owner_request", label: "Richiesta proprietario" },
  { value: "other", label: "Altro" },
];

export default function CleaningActionModal({ 
  cleaning, 
  isOpen, 
  onClose, 
  onSuccess,
  isAdmin = false 
}: CleaningActionModalProps) {
  const [activeTab, setActiveTab] = useState<"move" | "cancel">("move");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Move state
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState(cleaning.scheduledTime || "10:00");
  const [moveReason, setMoveReason] = useState("");
  
  // Cancel state
  const [cancelReason, setCancelReason] = useState("");
  const [cancelNotes, setCancelNotes] = useState("");
  const [deleteCompletely, setDeleteCompletely] = useState(false);

  if (!isOpen) return null;

  // Formatta data attuale
  const currentDate = cleaning.scheduledDate?.toDate?.() 
    ? cleaning.scheduledDate.toDate() 
    : new Date(cleaning.scheduledDate);
  
  const currentDateStr = currentDate.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  // Handle Move
  const handleMove = async () => {
    if (!newDate) {
      setError("Seleziona una nuova data");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/cleanings/${cleaning.id}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newDate,
          newTime,
          reason: moveReason || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Errore durante lo spostamento");
        return;
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError("Errore di connessione");
    } finally {
      setLoading(false);
    }
  };

  // Handle Cancel
  const handleCancel = async () => {
    const reason = cancelReason === "other" ? cancelNotes : CANCEL_REASONS.find(r => r.value === cancelReason)?.label || cancelReason;
    
    if (!reason || reason.length < 3) {
      setError("Inserisci un motivo per la cancellazione");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/cleanings/${cleaning.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: cancelReason === "other" ? `${CANCEL_REASONS.find(r => r.value === "other")?.label}: ${cancelNotes}` : reason,
          deleteCompletely: deleteCompletely && isAdmin,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Errore durante la cancellazione");
        return;
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError("Errore di connessione");
    } finally {
      setLoading(false);
    }
  };

  // Calcola data minima (domani)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split("T")[0];

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50" />
      
      <div 
        className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 border-b border-slate-100">
          <div className="p-4 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-800">Gestisci Pulizia</h2>
              <p className="text-xs text-slate-500 truncate">{cleaning.propertyName}</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200"
            >
              ✕
            </button>
          </div>

          {/* Tabs */}
          <div className="flex px-4 pb-0">
            <button
              onClick={() => { setActiveTab("move"); setError(null); }}
              className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-all ${
                activeTab === "move"
                  ? "text-sky-600 border-sky-500"
                  : "text-slate-500 border-transparent hover:text-slate-700"
              }`}
            >
              📅 Sposta
            </button>
            <button
              onClick={() => { setActiveTab("cancel"); setError(null); }}
              className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-all ${
                activeTab === "cancel"
                  ? "text-rose-600 border-rose-500"
                  : "text-slate-500 border-transparent hover:text-slate-700"
              }`}
            >
              ❌ Cancella
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Tab: Sposta */}
          {activeTab === "move" && (
            <div className="space-y-4">
              {/* Data attuale */}
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-1">Data attuale</p>
                <p className="font-medium text-slate-800">{currentDateStr}</p>
                <p className="text-sm text-slate-600">Ore {cleaning.scheduledTime || "10:00"}</p>
              </div>

              {/* Nuova data */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Nuova data *
                </label>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  min={minDate}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400"
                />
              </div>

              {/* Nuovo orario */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Orario
                </label>
                <input
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400"
                />
              </div>

              {/* Motivo (opzionale) */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Motivo <span className="text-slate-400 font-normal">(opzionale)</span>
                </label>
                <input
                  type="text"
                  value={moveReason}
                  onChange={(e) => setMoveReason(e.target.value)}
                  placeholder="Es: Richiesta proprietario"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400"
                />
              </div>

              {/* Warning */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
                <span className="text-lg">⚠️</span>
                <div>
                  <p className="text-sm text-amber-800 font-medium">Nota importante</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    La pulizia NON verrà ricreata alla data originale quando il calendario iCal si sincronizza.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tab: Cancella */}
          {activeTab === "cancel" && (
            <div className="space-y-4">
              {/* Data */}
              <div className="bg-rose-50 rounded-xl p-3">
                <p className="text-xs text-rose-500 mb-1">Pulizia da cancellare</p>
                <p className="font-medium text-slate-800">{currentDateStr}</p>
                {cleaning.operatorName && (
                  <p className="text-sm text-slate-600">Operatore: {cleaning.operatorName}</p>
                )}
              </div>

              {/* Motivo */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Motivo cancellazione *
                </label>
                <select
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-400"
                >
                  <option value="">Seleziona un motivo...</option>
                  {CANCEL_REASONS.map(reason => (
                    <option key={reason.value} value={reason.value}>
                      {reason.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Note se "Altro" */}
              {cancelReason === "other" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Specifica il motivo *
                  </label>
                  <textarea
                    value={cancelNotes}
                    onChange={(e) => setCancelNotes(e.target.value)}
                    placeholder="Descrivi il motivo della cancellazione..."
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-400 resize-none h-20"
                  />
                </div>
              )}

              {/* Elimina completamente (solo admin) */}
              {isAdmin && (
                <label className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deleteCompletely}
                    onChange={(e) => setDeleteCompletely(e.target.checked)}
                    className="w-4 h-4 text-rose-500 rounded"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-700">Elimina completamente</p>
                    <p className="text-xs text-slate-500">Rimuove la pulizia dallo storico</p>
                  </div>
                </label>
              )}

              {/* Warning */}
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex gap-2">
                <span className="text-lg">⚠️</span>
                <div>
                  <p className="text-sm text-rose-800 font-medium">Attenzione</p>
                  <p className="text-xs text-rose-700 mt-0.5">
                    La pulizia NON verrà ricreata quando il calendario iCal si sincronizza.
                    {cleaning.operatorName && " L'operatore assegnato verrà notificato."}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl">
              <p className="text-sm text-rose-700">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 p-4 border-t border-slate-100 bg-slate-50">
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2.5 border border-slate-200 rounded-xl font-medium text-slate-600 hover:bg-white disabled:opacity-50"
            >
              Annulla
            </button>
            
            {activeTab === "move" ? (
              <button
                onClick={handleMove}
                disabled={loading || !newDate}
                className="flex-1 py-2.5 bg-sky-500 text-white rounded-xl font-medium hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>📅 Sposta pulizia</>
                )}
              </button>
            ) : (
              <button
                onClick={handleCancel}
                disabled={loading || !cancelReason || (cancelReason === "other" && !cancelNotes.trim())}
                className="flex-1 py-2.5 bg-rose-500 text-white rounded-xl font-medium hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>❌ Cancella pulizia</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
