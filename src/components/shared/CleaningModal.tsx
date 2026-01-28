/**
 * CLEANING MODAL - Modal Unificata per Modifica Pulizie
 * 
 * Questa modal:
 * - È usata sia da ADMIN che da PROPRIETARIO
 * - Carica config da linenService
 * - Usa GuestSelectorWithLimit per il limite ospiti
 * - Quando si cambia ospiti → carica config corrispondente
 * - Salva modifiche + aggiorna ordine
 */

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { doc, updateDoc, Timestamp, getDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/firebase";
import { useCleaningConfig } from "~/lib/hooks/usePropertyConfig";
import { 
  updateCleaning, 
  createOrUpdateLinenOrder,
  calculateTotalPrice,
  type LinenOrderItem,
  type GuestConfig,
} from "~/lib/linenService";
import GuestSelector, { GuestSelectorButtons, GuestSelectorCounter } from "~/components/shared/GuestSelectorWithLimit";

// ==================== TYPES ====================

export interface CleaningData {
  id: string;
  propertyId: string;
  propertyName: string;
  date: Date;
  scheduledTime?: string;
  status: string;
  guestsCount: number;
  notes?: string;
  price?: number;
  serviceType?: string;
  serviceTypeName?: string;
  customLinenConfig?: GuestConfig;
}

export interface CleaningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  cleaning: CleaningData;
  userRole: "ADMIN" | "PROPRIETARIO" | "OPERATORE";
}

// ==================== ICONS ====================

const Icons = {
  close: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  bed: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  ),
};

// ==================== MAIN COMPONENT ====================

export default function CleaningModal({
  isOpen,
  onClose,
  onSuccess,
  cleaning,
  userRole,
}: CleaningModalProps) {
  // Hook per caricare config proprietà
  const {
    loading: configLoading,
    error: configError,
    property,
    maxGuests,
    guestsCount,
    setGuestsCount,
    currentConfig,
    currentItems,
    totalPrice,
  } = useCleaningConfig(cleaning.propertyId, cleaning.guestsCount);

  // Stati locali
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState(cleaning.notes || "");
  const [scheduledTime, setScheduledTime] = useState(cleaning.scheduledTime || "10:00");
  const [activeTab, setActiveTab] = useState<"dettagli" | "biancheria">("dettagli");

  const isAdmin = userRole === "ADMIN";
  const isReadOnly = userRole === "OPERATORE" || cleaning.status === "COMPLETED";

  // Sync con cleaning quando cambia
  useEffect(() => {
    if (isOpen) {
      setNotes(cleaning.notes || "");
      setScheduledTime(cleaning.scheduledTime || "10:00");
      setGuestsCount(cleaning.guestsCount);
    }
  }, [isOpen, cleaning, setGuestsCount]);

  // Salvataggio
  const handleSave = useCallback(async () => {
    if (isReadOnly) return;

    setSaving(true);
    try {
      // 1. Aggiorna pulizia
      const updateData: any = {
        guestsCount,
        notes,
        scheduledTime,
        updatedAt: Timestamp.now(),
      };

      // Se la config è stata personalizzata, salvala
      if (currentConfig) {
        updateData.customLinenConfig = currentConfig;
      }

      await updateDoc(doc(db, "cleanings", cleaning.id), updateData);
      console.log("✅ Pulizia aggiornata");

      // 2. Aggiorna/crea ordine biancheria
      if (property && !property.usesOwnLinen) {
        await createOrUpdateLinenOrder(cleaning.id, cleaning.propertyId, guestsCount);
        console.log("✅ Ordine biancheria aggiornato");
      }

      onSuccess();
    } catch (error) {
      console.error("❌ Errore salvataggio:", error);
      alert("Errore durante il salvataggio");
    } finally {
      setSaving(false);
    }
  }, [cleaning.id, cleaning.propertyId, guestsCount, notes, scheduledTime, currentConfig, property, isReadOnly, onSuccess]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="fixed inset-x-0 bottom-0 top-0 md:inset-4 md:m-auto md:max-w-2xl md:max-h-[90vh] bg-white md:rounded-2xl shadow-xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex-shrink-0 bg-gradient-to-r from-slate-800 to-slate-900 text-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Modifica Servizio</h2>
              <p className="text-sm text-white/70">{cleaning.propertyName}</p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20"
            >
              <div className="w-5 h-5">{Icons.close}</div>
            </button>
          </div>
          
          {/* Info badges */}
          <div className="flex flex-wrap gap-2 mt-3">
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
              cleaning.status === "COMPLETED" 
                ? "bg-emerald-500/20 text-emerald-200" 
                : "bg-amber-500/20 text-amber-200"
            }`}>
              {cleaning.status === "COMPLETED" ? "Completata" : "Programmata"}
            </span>
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-white/10 text-white/80">
              {cleaning.date.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" })}
            </span>
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-white/10 text-white/80">
              {scheduledTime}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex-shrink-0 flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab("dettagli")}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === "dettagli"
                ? "text-slate-800 border-b-2 border-slate-800"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Dettagli
          </button>
          <button
            onClick={() => setActiveTab("biancheria")}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === "biancheria"
                ? "text-slate-800 border-b-2 border-slate-800"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Biancheria
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {configLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin mx-auto mb-3" />
                <p className="text-slate-500">Caricamento configurazione...</p>
              </div>
            </div>
          ) : configError ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
              <p className="font-medium">Errore</p>
              <p className="text-sm">{configError}</p>
            </div>
          ) : activeTab === "dettagli" ? (
            <div className="space-y-4">
              {/* Numero Ospiti */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
                    <div className="w-5 h-5 text-violet-600">{Icons.users}</div>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-800">Numero Ospiti</span>
                    <p className="text-xs text-slate-500">Max {maxGuests} per questa proprietà</p>
                  </div>
                </div>
                
                <GuestSelectorButtons
                  value={guestsCount}
                  onChange={setGuestsCount}
                  maxGuests={maxGuests}
                  disabled={isReadOnly}
                  showLimit={true}
                />
              </div>

              {/* Orario */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                    <div className="w-5 h-5 text-blue-600">{Icons.calendar}</div>
                  </div>
                  <span className="font-semibold text-slate-800">Orario Programmato</span>
                </div>
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  disabled={isReadOnly}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-lg font-semibold text-center disabled:opacity-50"
                />
              </div>

              {/* Note */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </div>
                  <span className="font-semibold text-slate-800">Note</span>
                </div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={isReadOnly}
                  placeholder="Aggiungi note per gli operatori..."
                  rows={3}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl resize-none disabled:opacity-50"
                />
              </div>
            </div>
          ) : (
            /* Tab Biancheria */
            <div className="space-y-4">
              {/* Riepilogo letti selezionati */}
              {currentConfig && currentConfig.beds.length > 0 && (
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-500 mb-2">Letti selezionati per {guestsCount} ospiti:</p>
                  <div className="flex flex-wrap gap-2">
                    {currentConfig.beds.map((bedId, i) => {
                      const bed = property?.bedsConfig.find(b => b.id === bedId);
                      return (
                        <span key={i} className="px-2.5 py-1 bg-white rounded-lg text-sm font-medium text-slate-700 border border-slate-200">
                          {bed?.name || bedId}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Lista items biancheria */}
              {currentItems.length > 0 ? (
                <div className="space-y-2">
                  {/* Biancheria Letto */}
                  {currentItems.filter(i => i.category === "biancheria_letto").length > 0 && (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <div className="px-4 py-2 bg-sky-50 border-b border-sky-100">
                        <span className="text-sm font-medium text-sky-800">🛏️ Biancheria Letto</span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {currentItems.filter(i => i.category === "biancheria_letto").map((item, i) => (
                          <div key={i} className="px-4 py-3 flex items-center justify-between">
                            <span className="text-slate-700">{item.name}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-sm text-slate-500">×{item.quantity}</span>
                              <span className="font-semibold text-slate-800">€{(item.price * item.quantity).toFixed(2)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Biancheria Bagno */}
                  {currentItems.filter(i => i.category === "biancheria_bagno").length > 0 && (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-100">
                        <span className="text-sm font-medium text-emerald-800">🛁 Biancheria Bagno</span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {currentItems.filter(i => i.category === "biancheria_bagno").map((item, i) => (
                          <div key={i} className="px-4 py-3 flex items-center justify-between">
                            <span className="text-slate-700">{item.name}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-sm text-slate-500">×{item.quantity}</span>
                              <span className="font-semibold text-slate-800">€{(item.price * item.quantity).toFixed(2)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Kit Cortesia */}
                  {currentItems.filter(i => i.category === "kit_cortesia").length > 0 && (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <div className="px-4 py-2 bg-violet-50 border-b border-violet-100">
                        <span className="text-sm font-medium text-violet-800">🧴 Kit Cortesia</span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {currentItems.filter(i => i.category === "kit_cortesia").map((item, i) => (
                          <div key={i} className="px-4 py-3 flex items-center justify-between">
                            <span className="text-slate-700">{item.name}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-sm text-slate-500">×{item.quantity}</span>
                              <span className="font-semibold text-slate-800">€{(item.price * item.quantity).toFixed(2)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <p>Nessuna biancheria configurata</p>
                  <p className="text-sm mt-1">Configura la biancheria nella sezione proprietà</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-slate-200 p-4 bg-white">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-slate-500">Totale biancheria</span>
            <span className="text-xl font-bold text-slate-800">€{totalPrice.toFixed(2)}</span>
          </div>
          
          {!isReadOnly && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-4 bg-slate-800 text-white font-semibold rounded-xl hover:bg-slate-900 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Salvataggio...
                </>
              ) : (
                <>
                  <div className="w-5 h-5">{Icons.check}</div>
                  Salva Modifiche
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
