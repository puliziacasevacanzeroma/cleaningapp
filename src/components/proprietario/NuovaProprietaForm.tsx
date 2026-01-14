"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    notes: ""
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === "maxGuests" || name === "cleaningFee" ? Number(value) : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/proprietario/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
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
            placeholder="Via Roma 123"
            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
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
            placeholder="Roma"
            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
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
            placeholder="00100"
            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
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
            placeholder="3"
            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
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
            placeholder="A"
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
          disabled={loading}
          className="px-6 py-3 bg-gradient-to-r from-sky-500 to-blue-600 text-white font-medium rounded-xl hover:shadow-lg disabled:opacity-50 transition-all"
        >
          {loading ? "Creazione in corso..." : "Crea Proprietà"}
        </button>
      </div>
    </form>
  );
}
