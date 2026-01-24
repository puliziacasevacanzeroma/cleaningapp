"use client";

import { useState, useEffect } from "react";
import { SGROSSO_REASONS, SgrossoReasonCode } from "~/types/serviceType";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface ServiceType {
  id: string;
  name: string;
  code: string;
  icon: string;
  color: string;
  adminOnly: boolean;
  clientCanRequest: boolean;
  requiresApproval: boolean;
  requiresReason: boolean;
  requiresManualPrice: boolean;
}

interface Cleaning {
  id: string;
  propertyId: string;
  propertyName: string;
  propertyAddress?: string;
  scheduledDate: Date | string;
  scheduledTime?: string;
  status: string;
  guestsCount?: number;
  operatorId?: string;
  operatorName?: string;
  operators?: { id: string; name: string }[];
  
  // Tipo servizio
  serviceType?: string;          // "STANDARD" | "APPROFONDITA" | "SGROSSO"
  serviceTypeName?: string;
  
  // Prezzo
  price?: number;
  contractPrice?: number;        // Prezzo da contratto (riferimento)
  priceModified?: boolean;
  priceModifiedBy?: string;
  priceModifiedAt?: Date;
  priceChangeReason?: string;    // Motivazione cambio prezzo
  
  // Per SGROSSO
  sgrossoReason?: SgrossoReasonCode;
  sgrossoReasonLabel?: string;
  sgrossoNotes?: string;
  
  // Stato approvazione (per richieste SGROSSO da cliente)
  approvalStatus?: "pending" | "approved" | "rejected";
  approvedBy?: string;
  approvedAt?: Date;
  
  notes?: string;
  createdAt?: Date;
  completedAt?: Date;
}

interface CleaningDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  cleaning: Cleaning | null;
  onUpdate: () => void;
  userRole: "ADMIN" | "PROPRIETARIO" | "OPERATORE";
  userId?: string;
}

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function CleaningDetailModal({
  isOpen,
  onClose,
  cleaning,
  onUpdate,
  userRole,
  userId,
}: CleaningDetailModalProps) {
  const [saving, setSaving] = useState(false);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  
  // Form state
  const [selectedServiceType, setSelectedServiceType] = useState<string>("");
  const [price, setPrice] = useState<number>(0);
  const [originalPrice, setOriginalPrice] = useState<number>(0);
  const [priceChangeReason, setPriceChangeReason] = useState<string>("");
  const [sgrossoReason, setSgrossoReason] = useState<SgrossoReasonCode | "">("");
  const [sgrossoNotes, setSgrossoNotes] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  
  const isAdmin = userRole === "ADMIN";
  const isCompleted = cleaning?.status === "COMPLETED" || cleaning?.status === "completed";
  const priceChanged = price !== originalPrice;
  
  // ─── LOAD SERVICE TYPES ───
  useEffect(() => {
    async function loadServiceTypes() {
      try {
        const res = await fetch("/api/service-types?activeOnly=true");
        const data = await res.json();
        setServiceTypes(data.serviceTypes || []);
      } catch (error) {
        console.error("Errore caricamento tipi servizio:", error);
      } finally {
        setLoadingTypes(false);
      }
    }
    
    if (isOpen) {
      loadServiceTypes();
    }
  }, [isOpen]);
  
  // ─── INIT FORM FROM CLEANING ───
  useEffect(() => {
    if (cleaning && isOpen) {
      setSelectedServiceType(cleaning.serviceType || "STANDARD");
      setPrice(cleaning.price || cleaning.contractPrice || 0);
      setOriginalPrice(cleaning.contractPrice || cleaning.price || 0);
      setPriceChangeReason(cleaning.priceChangeReason || "");
      setSgrossoReason(cleaning.sgrossoReason || "");
      setSgrossoNotes(cleaning.sgrossoNotes || "");
      setNotes(cleaning.notes || "");
    }
  }, [cleaning, isOpen]);
  
  // ─── GET SELECTED SERVICE TYPE DETAILS ───
  const selectedType = serviceTypes.find(st => st.code === selectedServiceType);
  const isServiceTypeSgrosso = selectedServiceType === "SGROSSO";
  const isServiceTypeApprofondita = selectedServiceType === "APPROFONDITA";
  
  // ─── GET AVAILABLE SERVICE TYPES FOR THIS USER ───
  const availableServiceTypes = serviceTypes.filter(st => {
    if (isAdmin) return true;  // Admin vede tutto
    if (st.adminOnly) return false;  // Non admin non vede adminOnly
    return st.clientCanRequest;  // Altrimenti solo quelli richiedibili
  });
  
  // ─── HANDLE SAVE ───
  const handleSave = async () => {
    if (!cleaning) return;
    
    // Validazioni
    if (priceChanged && !priceChangeReason.trim()) {
      alert("Inserisci la motivazione del cambio prezzo");
      return;
    }
    
    if (isServiceTypeSgrosso && !sgrossoReason) {
      alert("Seleziona il motivo dello sgrosso");
      return;
    }
    
    if (sgrossoReason === "ALTRO" && !sgrossoNotes.trim()) {
      alert("Per 'Altro' devi specificare il motivo nelle note");
      return;
    }
    
    setSaving(true);
    
    try {
      const updateData: Record<string, unknown> = {
        serviceType: selectedServiceType,
        price: price,
        notes: notes,
      };
      
      // Se prezzo cambiato, aggiungi motivazione
      if (priceChanged) {
        updateData.priceModified = true;
        updateData.priceChangeReason = priceChangeReason;
        updateData.contractPrice = originalPrice;
      }
      
      // Se SGROSSO, aggiungi motivo
      if (isServiceTypeSgrosso) {
        updateData.sgrossoReason = sgrossoReason;
        updateData.sgrossoNotes = sgrossoNotes;
        
        // Trova label del motivo
        const reasonObj = SGROSSO_REASONS.find(r => r.code === sgrossoReason);
        updateData.sgrossoReasonLabel = reasonObj?.label || "";
      }
      
      // Aggiungi nome tipo servizio
      if (selectedType) {
        updateData.serviceTypeName = selectedType.name;
      }
      
      const res = await fetch(`/api/dashboard/cleanings/${cleaning.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Errore salvataggio");
      }
      
      onUpdate();
      onClose();
    } catch (error) {
      console.error("Errore salvataggio:", error);
      alert(error instanceof Error ? error.message : "Errore durante il salvataggio");
    } finally {
      setSaving(false);
    }
  };
  
  // ─── RENDER ───
  if (!isOpen || !cleaning) return null;
  
  const formattedDate = cleaning.scheduledDate 
    ? new Date(cleaning.scheduledDate).toLocaleDateString("it-IT", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
      })
    : "";
  
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-sky-500 to-blue-600 px-6 py-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white">
                {isCompleted ? "Dettaglio Pulizia" : "Modifica Pulizia"}
              </h3>
              <p className="text-sky-100 text-sm">{cleaning.propertyName}</p>
            </div>
            <button 
              onClick={onClose} 
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          
          {/* Info Base */}
          <div className="bg-slate-50 rounded-xl p-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-500">Data</span>
                <p className="font-medium text-slate-800 capitalize">{formattedDate}</p>
              </div>
              <div>
                <span className="text-slate-500">Orario</span>
                <p className="font-medium text-slate-800">{cleaning.scheduledTime || "10:00"}</p>
              </div>
              <div>
                <span className="text-slate-500">Stato</span>
                <p className="font-medium">
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    isCompleted ? "bg-green-100 text-green-700" :
                    cleaning.status === "IN_PROGRESS" ? "bg-amber-100 text-amber-700" :
                    "bg-sky-100 text-sky-700"
                  }`}>
                    {isCompleted ? "Completata" : 
                     cleaning.status === "IN_PROGRESS" ? "In corso" : 
                     "Programmata"}
                  </span>
                </p>
              </div>
              <div>
                <span className="text-slate-500">Ospiti</span>
                <p className="font-medium text-slate-800">{cleaning.guestsCount || "-"}</p>
              </div>
            </div>
          </div>
          
          {/* Tipo Servizio - SOLO ADMIN può modificare se non completata */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Tipo Servizio
            </label>
            {isAdmin && !isCompleted ? (
              <div className="grid grid-cols-3 gap-2">
                {availableServiceTypes.map(st => (
                  <button
                    key={st.code}
                    type="button"
                    onClick={() => setSelectedServiceType(st.code)}
                    className={`p-3 rounded-xl border-2 transition-all ${
                      selectedServiceType === st.code
                        ? "border-sky-500 bg-sky-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <span className="text-2xl block mb-1">{st.icon}</span>
                    <span className="text-xs font-medium text-slate-700">{st.name}</span>
                    {st.adminOnly && (
                      <span className="text-[10px] text-amber-600 block">Solo Admin</span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <span className="text-2xl">{selectedType?.icon || "🧹"}</span>
                <span className="font-medium text-slate-800">
                  {cleaning.serviceTypeName || selectedType?.name || "Standard"}
                </span>
              </div>
            )}
          </div>
          
          {/* Motivo SGROSSO - solo se tipo SGROSSO */}
          {isServiceTypeSgrosso && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Motivo Sgrosso *
              </label>
              {isAdmin && !isCompleted ? (
                <>
                  <select
                    value={sgrossoReason}
                    onChange={(e) => setSgrossoReason(e.target.value as SgrossoReasonCode)}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                  >
                    <option value="">Seleziona motivo...</option>
                    {SGROSSO_REASONS.map(reason => (
                      <option key={reason.code} value={reason.code}>
                        {reason.icon} {reason.label}
                      </option>
                    ))}
                  </select>
                  
                  {/* Note obbligatorie per "ALTRO" */}
                  {sgrossoReason === "ALTRO" && (
                    <textarea
                      value={sgrossoNotes}
                      onChange={(e) => setSgrossoNotes(e.target.value)}
                      placeholder="Specifica il motivo..."
                      rows={2}
                      className="w-full mt-2 px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500"
                    />
                  )}
                </>
              ) : (
                <div className="p-3 bg-red-50 rounded-xl">
                  <p className="font-medium text-red-800">
                    {cleaning.sgrossoReasonLabel || "Non specificato"}
                  </p>
                  {cleaning.sgrossoNotes && (
                    <p className="text-sm text-red-600 mt-1">{cleaning.sgrossoNotes}</p>
                  )}
                </div>
              )}
            </div>
          )}
          
          {/* Prezzo */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Prezzo
              {originalPrice > 0 && (
                <span className="text-slate-400 font-normal ml-2">
                  (contratto: €{originalPrice.toFixed(2)})
                </span>
              )}
            </label>
            {isAdmin && !isCompleted ? (
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">€</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={price}
                  onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                  className={`w-full pl-8 pr-4 py-3 border rounded-xl focus:ring-2 focus:ring-sky-500 ${
                    priceChanged ? "border-amber-400 bg-amber-50" : "border-slate-200"
                  }`}
                />
                {priceChanged && (
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-amber-600 text-sm">
                    Modificato
                  </span>
                )}
              </div>
            ) : (
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-2xl font-bold text-slate-800">
                  €{(cleaning.price || 0).toFixed(2)}
                </span>
                {cleaning.priceModified && cleaning.contractPrice && (
                  <span className="text-sm text-slate-500 ml-2">
                    (era €{cleaning.contractPrice.toFixed(2)})
                  </span>
                )}
              </div>
            )}
          </div>
          
          {/* Motivazione cambio prezzo - visibile se prezzo cambiato */}
          {(priceChanged || cleaning?.priceChangeReason) && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Motivazione Cambio Prezzo {priceChanged && "*"}
              </label>
              {isAdmin && !isCompleted && priceChanged ? (
                <textarea
                  value={priceChangeReason}
                  onChange={(e) => setPriceChangeReason(e.target.value)}
                  placeholder="Es: Pulizia extra accurata richiesta dal cliente, intervento su macchie difficili..."
                  rows={2}
                  className="w-full px-4 py-3 border border-amber-300 bg-amber-50 rounded-xl focus:ring-2 focus:ring-amber-500"
                />
              ) : cleaning?.priceChangeReason ? (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                  <p className="text-sm text-amber-800">{cleaning.priceChangeReason}</p>
                  {cleaning.priceModifiedBy && (
                    <p className="text-xs text-amber-600 mt-1">
                      Modificato da Admin
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          )}
          
          {/* Note */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Note
            </label>
            {!isCompleted ? (
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Note aggiuntive..."
                rows={2}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500"
              />
            ) : notes ? (
              <div className="p-3 bg-slate-50 rounded-xl">
                <p className="text-sm text-slate-700">{notes}</p>
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic">Nessuna nota</p>
            )}
          </div>
          
          {/* Info completamento (solo se completata) */}
          {isCompleted && cleaning.completedAt && (
            <div className="bg-green-50 rounded-xl p-4 border border-green-200">
              <h4 className="font-medium text-green-800 mb-2">✅ Completata</h4>
              <p className="text-sm text-green-700">
                {new Date(cleaning.completedAt).toLocaleDateString("it-IT", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit"
                })}
              </p>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors font-medium"
          >
            {isCompleted ? "Chiudi" : "Annulla"}
          </button>
          
          {!isCompleted && isAdmin && (
            <button
              onClick={handleSave}
              disabled={saving || (priceChanged && !priceChangeReason.trim())}
              className="flex-1 px-4 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-xl font-medium hover:from-sky-600 hover:to-blue-700 transition-all disabled:opacity-50"
            >
              {saving ? "Salvataggio..." : "Salva Modifiche"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
