/**
 * Componente: Bottone Richiesta Cancellazione Proprietà
 * 
 * Da usare nella pagina dettaglio proprietà del proprietario
 * Apre modal per inserire motivo e invia richiesta
 */

"use client";

import { useState } from "react";

interface DeletePropertyButtonProps {
  propertyId: string;
  propertyName: string;
  propertyStatus?: string;
  deactivationRequested?: boolean;
  onSuccess?: () => void;
}

export function DeletePropertyButton({ 
  propertyId, 
  propertyName, 
  propertyStatus,
  deactivationRequested,
  onSuccess 
}: DeletePropertyButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Se già in pending deletion o con flag deactivationRequested, mostra stato
  if (propertyStatus === "PENDING_DELETION" || deactivationRequested === true) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="font-medium text-red-800">Cancellazione in corso</p>
            <p className="text-sm text-red-600">In attesa di approvazione dall'amministratore</p>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (!reason.trim()) {
      setError("Inserisci il motivo della cancellazione");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/deletion-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          reason: reason.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Errore durante la richiesta");
        return;
      }

      setShowModal(false);
      setReason("");
      
      alert("✅ Richiesta di cancellazione inviata!\nRiceverai una notifica quando verrà elaborata.");
      
      if (onSuccess) {
        onSuccess();
      } else {
        window.location.reload();
      }

    } catch (err) {
      console.error("Errore:", err);
      setError("Errore di connessione");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Bottone */}
      <button
        onClick={() => setShowModal(true)}
        className="flex items-center gap-2 px-4 py-2 text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        Richiedi Cancellazione
      </button>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Richiedi Cancellazione</h3>
                <p className="text-sm text-gray-500">{propertyName}</p>
              </div>
            </div>

            {/* Warning */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <p className="text-amber-800 text-sm">
                ⚠️ La richiesta verrà inviata all'amministratore per approvazione. 
                Tutte le prenotazioni e pulizie future verranno cancellate.
              </p>
            </div>

            {/* Form */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Motivo della cancellazione *
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Es: Vendita dell'immobile, fine collaborazione..."
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
                rows={3}
              />
              {error && (
                <p className="mt-2 text-sm text-red-600">{error}</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowModal(false);
                  setReason("");
                  setError("");
                }}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200"
                disabled={loading}
              >
                Annulla
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 py-3 bg-red-500 text-white font-medium rounded-xl hover:bg-red-600 disabled:opacity-50"
              >
                {loading ? "Invio..." : "Invia Richiesta"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default DeletePropertyButton;
