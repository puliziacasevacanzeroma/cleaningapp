"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PropertyPhotoUploader } from "~/components/property/PropertyPhotoUploader";

// ═══════════════════════════════════════════════════════════════
// MODIFICA PROPRIETÀ FORM - Con foto accesso e info chiavi
// ═══════════════════════════════════════════════════════════════

interface PropertyImages {
  door?: string;
  building?: string;
}

interface Property {
  id: string;
  name: string;
  address: string;
  city: string | null;
  zip: string | null;
  floor: string | null;
  intern: string | null;
  maxGuests: number | null;
  cleaningFee: number | null;
  icalUrl: string | null;
  notes: string | null;
  // Nuovi campi
  images?: PropertyImages;
  doorCode?: string | null;
  keysLocation?: string | null;
  accessNotes?: string | null;
  // 🔴 NUOVO: Biancheria propria
  usesOwnLinen?: boolean;
}

export function ModificaProprietaForm({ property }: { property: Property }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<"info" | "access">("info");

  const [formData, setFormData] = useState({
    name: property.name || "",
    address: property.address || "",
    city: property.city || "",
    zip: property.zip || "",
    floor: property.floor || "",
    intern: property.intern || "",
    maxGuests: property.maxGuests || 4,
    cleaningFee: property.cleaningFee || 0,
    icalUrl: property.icalUrl || "",
    notes: property.notes || "",
    // Nuovi campi accesso
    doorCode: property.doorCode || "",
    keysLocation: property.keysLocation || "",
    accessNotes: property.accessNotes || "",
    // 🔴 NUOVO: Biancheria propria
    usesOwnLinen: property.usesOwnLinen || false,
  });

  // Stato foto (gestito separatamente per upload)
  const [images, setImages] = useState<PropertyImages>(property.images || {});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === "maxGuests" || name === "cleaningFee" ? Number(value) : value
    }));
  };

  // Handler per le foto
  const handlePhotoUploaded = (photoType: "door" | "building", url: string) => {
    setImages(prev => ({ ...prev, [photoType]: url }));
  };

  const handlePhotoRemoved = async (photoType: "door" | "building") => {
    try {
      // Chiama API per rimuovere
      await fetch(`/api/properties/upload-photo?propertyId=${property.id}&photoType=${photoType}`, {
        method: "DELETE",
      });
      
      setImages(prev => {
        const updated = { ...prev };
        delete updated[photoType];
        return updated;
      });
    } catch (err) {
      console.error("Errore rimozione foto:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/proprietario/properties/${property.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          images, // Include le foto
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Errore durante l'aggiornamento");
      }

      setSuccess(true);
      setTimeout(() => {
        router.push(`/proprietario/proprieta/${property.id}`);
        router.refresh();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-slate-800">Proprietà aggiornata!</h3>
        <p className="text-slate-500 mt-1">Reindirizzamento in corso...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700">
          {error}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab("info")}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-all ${
            activeTab === "info"
              ? "border-sky-500 text-sky-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          📋 Informazioni Base
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("access")}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-all ${
            activeTab === "access"
              ? "border-sky-500 text-sky-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          🔐 Foto e Accesso
        </button>
      </div>

      {/* TAB: Informazioni Base */}
      {activeTab === "info" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Nome */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Nome Proprietà *
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
            />
          </div>

          {/* Indirizzo */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Indirizzo *
            </label>
            <input
              type="text"
              name="address"
              value={formData.address}
              onChange={handleChange}
              required
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
            />
          </div>

          {/* Città */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Città *
            </label>
            <input
              type="text"
              name="city"
              value={formData.city}
              onChange={handleChange}
              required
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
            />
          </div>

          {/* CAP */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              CAP
            </label>
            <input
              type="text"
              name="zip"
              value={formData.zip}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
            />
          </div>

          {/* Piano */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Piano
            </label>
            <input
              type="text"
              name="floor"
              value={formData.floor}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
            />
          </div>

          {/* Interno */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Interno
            </label>
            <input
              type="text"
              name="intern"
              value={formData.intern}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
            />
          </div>

          {/* Max Ospiti */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Numero Massimo Ospiti *
            </label>
            <input
              type="number"
              name="maxGuests"
              value={formData.maxGuests}
              onChange={handleChange}
              required
              min={1}
              max={20}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
            />
          </div>

          {/* Costo Pulizia */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Costo Pulizia (€)
            </label>
            <input
              type="number"
              name="cleaningFee"
              value={formData.cleaningFee}
              onChange={handleChange}
              min={0}
              step={0.01}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
            />
          </div>

          {/* 🔴 NUOVO: Toggle Biancheria Propria */}
          <div className="md:col-span-2">
            <div className={`p-4 rounded-xl border-2 transition-all ${
              formData.usesOwnLinen 
                ? "bg-amber-50 border-amber-300" 
                : "bg-emerald-50 border-emerald-300"
            }`}>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, usesOwnLinen: !prev.usesOwnLinen }))}
                    className={`relative w-14 h-8 rounded-full transition-colors ${
                      formData.usesOwnLinen ? "bg-amber-500" : "bg-emerald-500"
                    }`}
                  >
                    <span className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                      formData.usesOwnLinen ? "translate-x-7" : "translate-x-1"
                    }`} />
                  </button>
                </div>
                <div className="flex-1">
                  <h4 className={`font-semibold ${formData.usesOwnLinen ? "text-amber-800" : "text-emerald-800"}`}>
                    {formData.usesOwnLinen ? "🏠 Uso biancheria propria" : "🧺 Uso biancheria del servizio"}
                  </h4>
                  <p className={`text-sm mt-1 ${formData.usesOwnLinen ? "text-amber-700" : "text-emerald-700"}`}>
                    {formData.usesOwnLinen 
                      ? "La biancheria la fornisco io. Non verranno creati ordini biancheria per le pulizie."
                      : "Utilizzerò la biancheria fornita dal servizio. Gli ordini biancheria verranno creati automaticamente."
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* iCal URL */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              URL Calendario iCal
            </label>
            <input
              type="url"
              name="icalUrl"
              value={formData.icalUrl}
              onChange={handleChange}
              placeholder="https://www.airbnb.com/calendar/ical/..."
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
            />
            <p className="text-xs text-slate-500 mt-1">
              Inserisci l'URL del calendario per sincronizzare automaticamente le prenotazioni
            </p>
          </div>

          {/* Note */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Note Generali
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={3}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all resize-none"
            />
          </div>
        </div>
      )}

      {/* TAB: Foto e Accesso */}
      {activeTab === "access" && (
        <div className="space-y-8">
          {/* Sezione Foto Identificative */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">📸</span>
              <h3 className="text-lg font-semibold text-slate-800">Foto Identificative</h3>
            </div>
            <p className="text-sm text-slate-500 mb-6">
              Queste foto aiutano gli operatori e i rider a identificare facilmente la proprietà.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Foto Porta */}
              <div className="md:col-span-1">
                <PropertyPhotoUploader
                  propertyId={property.id}
                  photoType="door"
                  currentPhotoUrl={images.door}
                  onPhotoUploaded={(url) => handlePhotoUploaded("door", url)}
                  onPhotoRemoved={() => handlePhotoRemoved("door")}
                  label="Foto Porta d'Ingresso"
                  description="Importante: aiuta l'operatore a trovare l'appartamento giusto"
                  isRequired={false}
                />
              </div>

              {/* Foto Palazzo */}
              <div className="md:col-span-1">
                <PropertyPhotoUploader
                  propertyId={property.id}
                  photoType="building"
                  currentPhotoUrl={images.building}
                  onPhotoUploaded={(url) => handlePhotoUploaded("building", url)}
                  onPhotoRemoved={() => handlePhotoRemoved("building")}
                  label="Foto Palazzo/Edificio"
                  description="Opzionale: utile per identificare l'edificio dall'esterno"
                  isRequired={false}
                />
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-slate-200" />

          {/* Sezione Informazioni Accesso */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">🔐</span>
              <h3 className="text-lg font-semibold text-slate-800">Informazioni Accesso</h3>
            </div>
            <p className="text-sm text-slate-500 mb-6">
              Fornisci le informazioni necessarie per accedere alla proprietà.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Codice Porta */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  🚪 Codice Porta/Portone
                </label>
                <input
                  type="text"
                  name="doorCode"
                  value={formData.doorCode}
                  onChange={handleChange}
                  placeholder="Es: 1234# oppure A5B"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Il codice per aprire il portone o la porta d'ingresso
                </p>
              </div>

              {/* Posizione Chiavi */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  🔑 Posizione Chiavi
                </label>
                <input
                  type="text"
                  name="keysLocation"
                  value={formData.keysLocation}
                  onChange={handleChange}
                  placeholder="Es: KeyBox codice 5678 a destra del portone"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Dove si trovano le chiavi (KeyBox, portineria, nascondiglio, ecc.)
                </p>
              </div>

              {/* Istruzioni Accesso */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  📝 Istruzioni di Accesso
                </label>
                <textarea
                  name="accessNotes"
                  value={formData.accessNotes}
                  onChange={handleChange}
                  rows={4}
                  placeholder="Es: Suonare al citofono 'Rossi' se il portone è chiuso. Prendere l'ascensore fino al 3° piano, appartamento sulla destra."
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all resize-none"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Istruzioni dettagliate per raggiungere l'appartamento
                </p>
              </div>
            </div>
          </div>

          {/* Box Info */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl">💡</span>
              <div>
                <h4 className="font-medium text-amber-800">Perché queste informazioni sono importanti?</h4>
                <p className="text-sm text-amber-700 mt-1">
                  Gli operatori delle pulizie e i rider vedranno queste informazioni quando devono 
                  raggiungere la proprietà. Foto chiare e istruzioni dettagliate evitano chiamate 
                  e ritardi!
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pulsanti */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-6 py-3 text-slate-700 font-medium hover:bg-slate-100 rounded-xl transition-all"
        >
          Annulla
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-3 bg-gradient-to-r from-sky-500 to-blue-600 text-white font-medium rounded-xl hover:shadow-lg disabled:opacity-50 transition-all"
        >
          {loading ? "Salvataggio..." : "Salva Modifiche"}
        </button>
      </div>
    </form>
  );
}
