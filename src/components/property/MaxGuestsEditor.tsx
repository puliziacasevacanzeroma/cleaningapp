"use client";

import { useState, useEffect } from "react";

interface MaxGuestsEditorProps {
  propertyId: string;
  propertyName: string;
  currentMaxGuests: number;
  bedCapacity: number;
  isAdmin: boolean;
  hasPendingRequest?: boolean;
  onAdminSave: (newMaxGuests: number) => Promise<void>;
  onProprietarioRequest: (currentValue: number, requestedValue: number, reason: string) => Promise<void>;
}

export function MaxGuestsEditor({
  propertyId,
  propertyName,
  currentMaxGuests,
  bedCapacity,
  isAdmin,
  hasPendingRequest,
  onAdminSave,
  onProprietarioRequest
}: MaxGuestsEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [newValue, setNewValue] = useState(currentMaxGuests);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [impact, setImpact] = useState<any>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);

  // Reset quando cambiano i props
  useEffect(() => {
    setNewValue(currentMaxGuests);
  }, [currentMaxGuests]);

  // Carica impatto per admin
  const loadImpact = async (value: number) => {
    if (!isAdmin || value === currentMaxGuests) return;
    
    setLoadingImpact(true);
    try {
      const res = await fetch(`/api/admin/property-update/${propertyId}?newMaxGuests=${value}`);
      const data = await res.json();
      setImpact(data);
    } catch (err) {
      console.error("Errore caricamento impatto:", err);
    } finally {
      setLoadingImpact(false);
    }
  };

  // Quando admin cambia valore, carica impatto
  useEffect(() => {
    if (isAdmin && isEditing && newValue !== currentMaxGuests) {
      const timeout = setTimeout(() => loadImpact(newValue), 300);
      return () => clearTimeout(timeout);
    }
  }, [newValue, isAdmin, isEditing]);

  // Gestione salvataggio admin
  const handleAdminSave = async () => {
    if (newValue === currentMaxGuests) {
      setIsEditing(false);
      return;
    }

    // Mostra modal conferma
    setShowConfirmModal(true);
  };

  const confirmAdminSave = async () => {
    setSaving(true);
    setError(null);
    
    try {
      await onAdminSave(newValue);
      setShowConfirmModal(false);
      setIsEditing(false);
      setImpact(null);
    } catch (err: any) {
      setError(err.message || "Errore durante il salvataggio");
    } finally {
      setSaving(false);
    }
  };

  // Gestione richiesta proprietario
  const handleProprietarioRequest = async () => {
    if (newValue === currentMaxGuests) {
      setError("Seleziona un valore diverso da quello attuale");
      return;
    }

    if (newValue > bedCapacity) {
      setError(`Non puoi richiedere più di ${bedCapacity} ospiti (capacità letti attuale)`);
      return;
    }

    setSaving(true);
    setError(null);
    
    try {
      await onProprietarioRequest(currentMaxGuests, newValue, reason);
      setIsEditing(false);
      setNewValue(currentMaxGuests);
      setReason("");
    } catch (err: any) {
      setError(err.message || "Errore durante l'invio della richiesta");
    } finally {
      setSaving(false);
    }
  };

  // Vista compatta (non editing)
  if (!isEditing) {
    return (
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Numero Massimo Ospiti
            </label>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-slate-800">{currentMaxGuests}</span>
              <span className="text-sm text-slate-500">ospiti</span>
              {bedCapacity < currentMaxGuests && (
                <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded-lg">
                  ⚠️ Capacità letti: {bedCapacity}
                </span>
              )}
            </div>
          </div>
          
          {hasPendingRequest ? (
            <span className="px-3 py-1.5 bg-amber-100 text-amber-700 text-sm font-medium rounded-lg">
              ⏳ Richiesta in attesa
            </span>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="px-3 py-1.5 text-sm font-medium text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
            >
              {isAdmin ? "✏️ Modifica" : "📝 Richiedi modifica"}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Vista editing
  return (
    <>
      <div className="bg-sky-50 rounded-xl p-4 border-2 border-sky-200">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          {isAdmin ? "Modifica Numero Massimo Ospiti" : "Richiedi Modifica Numero Ospiti"}
        </label>
        
        {error && (
          <div className="mb-3 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm">
            ⚠️ {error}
          </div>
        )}
        
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center">
            <button
              onClick={() => setNewValue(Math.max(1, newValue - 1))}
              disabled={newValue <= 1}
              className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-l-lg text-lg font-bold hover:bg-slate-50 disabled:opacity-50"
            >
              −
            </button>
            <input
              type="number"
              value={newValue}
              onChange={(e) => setNewValue(Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
              max={20}
              className="w-16 h-10 text-center border-y border-slate-200 text-lg font-bold"
            />
            <button
              onClick={() => setNewValue(Math.min(20, newValue + 1))}
              disabled={newValue >= 20}
              className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-r-lg text-lg font-bold hover:bg-slate-50 disabled:opacity-50"
            >
              +
            </button>
          </div>
          
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">Attuale: {currentMaxGuests}</span>
              {newValue !== currentMaxGuests && (
                <span className={`text-sm font-medium ${newValue > currentMaxGuests ? 'text-emerald-600' : 'text-amber-600'}`}>
                  → {newValue} ({newValue > currentMaxGuests ? '+' : ''}{newValue - currentMaxGuests})
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Capacità letti: {bedCapacity} posti
            </div>
          </div>
        </div>
        
        {/* Warning se supera capacità */}
        {newValue > bedCapacity && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
            ⚠️ Il numero di ospiti ({newValue}) supera la capacità dei letti ({bedCapacity}). 
            {isAdmin ? "Assicurati di aggiornare anche i letti." : "Prima aggiungi più letti alla proprietà."}
          </div>
        )}
        
        {/* Impatto per admin */}
        {isAdmin && impact && newValue !== currentMaxGuests && (
          <div className="mb-4 p-3 bg-slate-100 rounded-lg">
            <p className="text-sm font-medium text-slate-700 mb-2">Impatto modifica:</p>
            {loadingImpact ? (
              <p className="text-sm text-slate-500">Calcolo in corso...</p>
            ) : (
              <ul className="text-sm text-slate-600 space-y-1">
                {impact.willGenerate?.length > 0 && (
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-500">✓</span>
                    Verranno create config per: {impact.willGenerate.join(", ")} ospiti
                  </li>
                )}
                {impact.warnings?.map((w: string, i: number) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="text-amber-500">⚠</span>
                    {w}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        
        {/* Campo motivazione per proprietario */}
        {!isAdmin && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Motivazione (opzionale)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Es: Ho aggiunto un divano letto nel soggiorno..."
              rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none"
            />
          </div>
        )}
        
        {/* Pulsanti */}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => {
              setIsEditing(false);
              setNewValue(currentMaxGuests);
              setError(null);
              setImpact(null);
            }}
            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            disabled={saving}
          >
            Annulla
          </button>
          <button
            onClick={isAdmin ? handleAdminSave : handleProprietarioRequest}
            disabled={saving || newValue === currentMaxGuests || (!isAdmin && newValue > bedCapacity)}
            className="px-4 py-2 bg-sky-500 text-white font-medium rounded-lg hover:bg-sky-600 disabled:opacity-50 transition-colors"
          >
            {saving ? "..." : isAdmin ? "Salva" : "Invia Richiesta"}
          </button>
        </div>
        
        {!isAdmin && (
          <p className="text-xs text-slate-500 text-center mt-2">
            La richiesta verrà inviata all'amministratore per l'approvazione
          </p>
        )}
      </div>
      
      {/* Modal conferma admin */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowConfirmModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4">
              ⚠️ Conferma Modifica
            </h3>
            
            <div className="mb-4">
              <p className="text-slate-600 mb-3">
                Stai per modificare il numero massimo di ospiti per <strong>{propertyName}</strong>:
              </p>
              
              <div className="flex items-center justify-center gap-4 py-3 bg-slate-50 rounded-lg">
                <div className="text-center">
                  <p className="text-2xl font-bold text-slate-400">{currentMaxGuests}</p>
                  <p className="text-xs text-slate-500">Attuale</p>
                </div>
                <span className="text-2xl text-slate-400">→</span>
                <div className="text-center">
                  <p className="text-2xl font-bold text-sky-600">{newValue}</p>
                  <p className="text-xs text-slate-500">Nuovo</p>
                </div>
              </div>
            </div>
            
            {impact && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm font-medium text-amber-800 mb-1">Conseguenze:</p>
                <ul className="text-sm text-amber-700 space-y-1">
                  {impact.willGenerate?.length > 0 && (
                    <li>• Verranno generate {impact.willGenerate.length} nuove configurazioni biancheria</li>
                  )}
                  {impact.warnings?.map((w: string, i: number) => (
                    <li key={i}>• {w}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {error && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm">
                {error}
              </div>
            )}
            
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                disabled={saving}
              >
                Annulla
              </button>
              <button
                onClick={confirmAdminSave}
                disabled={saving}
                className="px-4 py-2 bg-sky-500 text-white font-medium rounded-lg hover:bg-sky-600 disabled:opacity-50"
              >
                {saving ? "Salvataggio..." : "Conferma Modifica"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
