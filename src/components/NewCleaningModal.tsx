"use client";

import { useState, useEffect } from "react";
import { getProperties, Property } from "~/lib/firebase/firestore-data";

interface NewCleaningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preselectedPropertyId?: string; // Per proprietario che ha una sola proprietà
  userRole?: "ADMIN" | "PROPRIETARIO";
}

export default function NewCleaningModal({
  isOpen,
  onClose,
  onSuccess,
  preselectedPropertyId,
  userRole = "ADMIN",
}: NewCleaningModalProps) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    propertyId: preselectedPropertyId || "",
    scheduledDate: new Date().toISOString().split("T")[0],
    scheduledTime: "10:00",
    guestsCount: 2,
    notes: "",
    type: "MANUAL" as "MANUAL" | "CHECKOUT" | "CHECKIN" | "DEEP_CLEAN",
    requestType: "cleaning" as "cleaning" | "linen_only",
    createLinenOrder: true,
  });

  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);

  // Carica proprietà
  useEffect(() => {
    async function loadProperties() {
      setLoading(true);
      try {
        const data = await getProperties("ACTIVE");
        setProperties(data);
        
        // Se c'è una proprietà preselezionata, caricala
        if (preselectedPropertyId) {
          const prop = data.find(p => p.id === preselectedPropertyId);
          if (prop) {
            setSelectedProperty(prop);
            setFormData(prev => ({ ...prev, propertyId: prop.id }));
          }
        }
      } catch (error) {
        console.error("Errore caricamento proprietà:", error);
      } finally {
        setLoading(false);
      }
    }
    if (isOpen) loadProperties();
  }, [isOpen, preselectedPropertyId]);

  // Quando cambia la proprietà selezionata
  const handlePropertyChange = (propertyId: string) => {
    const prop = properties.find(p => p.id === propertyId);
    setSelectedProperty(prop || null);
    setFormData(prev => ({
      ...prev,
      propertyId,
      guestsCount: prop?.maxGuests || 2,
      createLinenOrder: !prop?.usesOwnLinen,
    }));
  };

  // Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.propertyId) {
      alert("Seleziona una proprietà");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/cleanings/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: formData.propertyId,
          scheduledDate: formData.scheduledDate,
          scheduledTime: formData.scheduledTime,
          guestsCount: formData.guestsCount,
          notes: formData.notes,
          type: formData.type,
          linenOnly: formData.requestType === "linen_only",
          createLinenOrder: formData.requestType === "cleaning" ? formData.createLinenOrder : true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Errore nella creazione");
      }

      alert(data.message || "Creato con successo!");
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Errore:", error);
      alert(error.message || "Errore nella creazione");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-800">
              {formData.requestType === "linen_only" ? "🛏️ Richiedi Biancheria" : "🧹 Nuova Pulizia"}
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Tipo di richiesta */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Cosa vuoi richiedere?
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, requestType: "cleaning" }))}
                className={`p-4 rounded-xl border-2 text-center transition-all ${
                  formData.requestType === "cleaning"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <span className="text-2xl block mb-1">🧹</span>
                <span className="font-medium">Pulizia</span>
                <span className="text-xs text-slate-500 block">+ biancheria se necessario</span>
              </button>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, requestType: "linen_only" }))}
                className={`p-4 rounded-xl border-2 text-center transition-all ${
                  formData.requestType === "linen_only"
                    ? "border-sky-500 bg-sky-50 text-sky-700"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <span className="text-2xl block mb-1">🛏️</span>
                <span className="font-medium">Solo Biancheria</span>
                <span className="text-xs text-slate-500 block">Consegna senza pulizia</span>
              </button>
            </div>
          </div>

          {/* Proprietà */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Proprietà *
            </label>
            {loading ? (
              <div className="animate-pulse bg-slate-100 h-12 rounded-xl"></div>
            ) : (
              <select
                value={formData.propertyId}
                onChange={(e) => handlePropertyChange(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none"
                required
              >
                <option value="">Seleziona proprietà...</option>
                {properties.map((prop) => (
                  <option key={prop.id} value={prop.id}>
                    {prop.name} - {prop.address}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Info proprietà selezionata */}
          {selectedProperty && (
            <div className="bg-slate-50 rounded-xl p-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-slate-500">Camere:</span>
                  <span className="font-medium ml-1">{selectedProperty.bedrooms || 1}</span>
                </div>
                <div>
                  <span className="text-slate-500">Bagni:</span>
                  <span className="font-medium ml-1">{selectedProperty.bathrooms || 1}</span>
                </div>
                <div>
                  <span className="text-slate-500">Max ospiti:</span>
                  <span className="font-medium ml-1">{selectedProperty.maxGuests || 2}</span>
                </div>
                <div>
                  <span className="text-slate-500">Biancheria:</span>
                  <span className={`font-medium ml-1 ${selectedProperty.usesOwnLinen ? "text-amber-600" : "text-emerald-600"}`}>
                    {selectedProperty.usesOwnLinen ? "Propria" : "Nostra"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Data */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Data *
            </label>
            <input
              type="date"
              value={formData.scheduledDate}
              onChange={(e) => setFormData(prev => ({ ...prev, scheduledDate: e.target.value }))}
              min={new Date().toISOString().split("T")[0]}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none"
              required
            />
          </div>

          {/* Orario (solo per pulizia) */}
          {formData.requestType === "cleaning" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Orario
              </label>
              <input
                type="time"
                value={formData.scheduledTime}
                onChange={(e) => setFormData(prev => ({ ...prev, scheduledTime: e.target.value }))}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none"
              />
            </div>
          )}

          {/* Ospiti (solo per pulizia) */}
          {formData.requestType === "cleaning" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Numero ospiti
              </label>
              <input
                type="number"
                value={formData.guestsCount}
                onChange={(e) => setFormData(prev => ({ ...prev, guestsCount: parseInt(e.target.value) || 2 }))}
                min={1}
                max={20}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none"
              />
            </div>
          )}

          {/* Tipo pulizia */}
          {formData.requestType === "cleaning" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Tipo di pulizia
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as any }))}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none"
              >
                <option value="MANUAL">Pulizia Manuale</option>
                <option value="CHECKOUT">Check-out</option>
                <option value="CHECKIN">Check-in</option>
                <option value="DEEP_CLEAN">Pulizia Profonda</option>
              </select>
            </div>
          )}

          {/* Ordine biancheria (solo per pulizia e se proprietà non usa propria) */}
          {formData.requestType === "cleaning" && selectedProperty && !selectedProperty.usesOwnLinen && (
            <div className="flex items-center gap-3 p-4 bg-sky-50 rounded-xl">
              <input
                type="checkbox"
                id="createLinenOrder"
                checked={formData.createLinenOrder}
                onChange={(e) => setFormData(prev => ({ ...prev, createLinenOrder: e.target.checked }))}
                className="w-5 h-5 text-sky-500 rounded"
              />
              <label htmlFor="createLinenOrder" className="flex-1">
                <span className="font-medium text-sky-800">Crea ordine biancheria</span>
                <span className="text-sm text-sky-600 block">La biancheria verrà consegnata dal rider</span>
              </label>
            </div>
          )}

          {/* Note */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Note (opzionale)
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              rows={3}
              placeholder="Istruzioni speciali..."
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none resize-none"
            />
          </div>

          {/* Bottoni */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 border border-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition-colors"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={saving || !formData.propertyId}
              className={`flex-1 py-3 rounded-xl font-bold transition-all disabled:opacity-50 ${
                formData.requestType === "linen_only"
                  ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:shadow-lg"
                  : "bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:shadow-lg"
              }`}
            >
              {saving ? "Creazione..." : formData.requestType === "linen_only" ? "Richiedi Biancheria" : "Crea Pulizia"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
