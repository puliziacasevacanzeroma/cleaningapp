"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AddressAutocomplete from "~/components/ui/AddressAutocomplete";
import { type AddressResult } from "~/lib/geo";

export function NuovaProprietaForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    address: "",
    city: "",
    zip: "",
    floor: "",
    intern: "",
    maxGuests: 4,
    cleaningFee: 0,
    icalUrl: "",
    notes: "",
    // Nuovi campi per geocoding
    coordinates: null as { lat: number; lng: number } | null,
    addressVerified: false,
    houseNumber: "",
    // 🔴 NUOVO: Opzione biancheria propria
    usesOwnLinen: false,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === "maxGuests" || name === "cleaningFee" ? Number(value) : value,
      // Se cambiano città o CAP manualmente, reset verifica
      ...(name === "city" || name === "zip" ? { addressVerified: false } : {}),
    }));
  };

  // Handler per selezione indirizzo da autocomplete
  const handleAddressSelect = (result: AddressResult) => {
    setFormData(prev => ({
      ...prev,
      address: result.fullAddress,
      city: result.city || prev.city,
      zip: result.postalCode || prev.zip,
      houseNumber: result.houseNumber || "",
      coordinates: result.coordinates,
      addressVerified: true,
    }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validazioni
    if (!formData.name.trim()) {
      setError("Inserisci il nome della proprietà");
      setLoading(false);
      return;
    }

    if (!formData.address.trim()) {
      setError("Inserisci l'indirizzo");
      setLoading(false);
      return;
    }

    // NUOVO: Verifica che l'indirizzo sia stato selezionato dall'autocomplete
    if (!formData.addressVerified) {
      setError("Seleziona un indirizzo dalla lista dei suggerimenti per verificarlo");
      setLoading(false);
      return;
    }

    // NUOVO: Verifica presenza numero civico
    if (!formData.houseNumber && !formData.address.match(/\d+/)) {
      setError("L'indirizzo deve includere il numero civico");
      setLoading(false);
      return;
    }

    if (!formData.city.trim()) {
      setError("Inserisci la città");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/proprietario/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          // Assicurati che le coordinate vengano salvate
          coordinates: formData.coordinates,
          coordinatesVerified: formData.addressVerified,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Errore durante la creazione");
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/proprietario/proprieta");
        router.refresh();
      }, 2000);
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
        <h3 className="text-lg font-semibold text-slate-800">Proprietà creata!</h3>
        <p className="text-slate-500 mt-1">La tua richiesta è in attesa di approvazione dall'amministratore.</p>
        {formData.coordinates && (
          <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-xl">
            <svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
            </svg>
            <span className="text-sm text-emerald-700">Posizione GPS salvata</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex items-start gap-3">
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span>{error}</span>
        </div>
      )}

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
            placeholder="Es: Appartamento Centro Storico"
            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            INDIRIZZO CON AUTOCOMPLETE
        ═══════════════════════════════════════════════════════════════ */}
        <div className="md:col-span-2">
          <AddressAutocomplete
            label="Indirizzo completo (via e numero civico)"
            required
            placeholder="Inizia a digitare: Via Roma 123, Roma..."
            onSelect={handleAddressSelect}
            defaultValue={formData.address}
            showVerifiedIcon={true}
            error={!formData.addressVerified && formData.address.length > 0 ? undefined : undefined}
          />
          
          {/* Feedback positivo quando verificato */}
          {formData.addressVerified && formData.coordinates && (
            <div className="mt-2 flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>✓ Indirizzo verificato - Coordinate GPS salvate per calcolo distanze</span>
            </div>
          )}
          
          {/* Info box */}
          <div className="mt-2 p-3 bg-sky-50 border border-sky-200 rounded-lg">
            <p className="text-xs text-sky-700">
              <strong>💡 Suggerimento:</strong> Digita l'indirizzo completo con numero civico (es: "Via Roma 123, Roma") e seleziona dalla lista. 
              Questo ci permette di calcolare automaticamente le distanze per le pulizie.
            </p>
          </div>
        </div>

        {/* Città (auto-compilata ma modificabile) */}
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
            placeholder="Roma"
            className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 ${
              formData.addressVerified ? "border-emerald-300 bg-emerald-50/30" : "border-slate-200"
            }`}
          />
          {formData.addressVerified && (
            <p className="text-xs text-emerald-600 mt-1">✓ Auto-compilata</p>
          )}
        </div>

        {/* CAP (auto-compilato ma modificabile) */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            CAP *
          </label>
          <input
            type="text"
            name="zip"
            value={formData.zip}
            onChange={handleChange}
            required
            placeholder="00100"
            className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 ${
              formData.addressVerified ? "border-emerald-300 bg-emerald-50/30" : "border-slate-200"
            }`}
          />
          {formData.addressVerified && (
            <p className="text-xs text-emerald-600 mt-1">✓ Auto-compilato</p>
          )}
        </div>

        {/* Piano */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Piano *
          </label>
          <input
            type="text"
            name="floor"
            value={formData.floor}
            onChange={handleChange}
            required
            placeholder="3"
            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        {/* Interno/Citofono */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Interno / Citofono *
          </label>
          <input
            type="text"
            name="intern"
            value={formData.intern}
            onChange={handleChange}
            required
            placeholder="A / Rossi"
            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
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
            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
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
            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
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
            URL Calendario iCal (opzionale)
          </label>
          <input
            type="url"
            name="icalUrl"
            value={formData.icalUrl}
            onChange={handleChange}
            placeholder="https://www.airbnb.com/calendar/ical/..."
            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          <p className="text-xs text-slate-500 mt-1">
            Inserisci l'URL del calendario per sincronizzare automaticamente le prenotazioni
          </p>
        </div>

        {/* Note */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Note
          </label>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            rows={3}
            placeholder="Informazioni aggiuntive sulla proprietà..."
            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-slate-100">
        <p className="text-sm text-slate-500">
          * Campi obbligatori
        </p>
        <button
          type="submit"
          disabled={loading || !formData.addressVerified}
          className={`px-6 py-3 font-medium rounded-xl transition-all ${
            formData.addressVerified
              ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:shadow-lg"
              : "bg-slate-200 text-slate-500 cursor-not-allowed"
          } disabled:opacity-50`}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Creazione...
            </span>
          ) : !formData.addressVerified ? (
            "Verifica l'indirizzo prima"
          ) : (
            "Crea Proprietà"
          )}
        </button>
      </div>
    </form>
  );
}
