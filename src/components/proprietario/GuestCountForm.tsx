"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface GuestCountFormProps {
  bookingId: string;
  currentGuests: number | null;
  maxGuests: number;
}

export function GuestCountForm({ bookingId, currentGuests, maxGuests }: GuestCountFormProps) {
  const router = useRouter();
  const [guests, setGuests] = useState(currentGuests || 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch(`/api/bookings/${bookingId}/guests`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestsCount: guests }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Errore durante l'aggiornamento");
      }

      setSuccess(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <label className="text-sm font-medium text-slate-700">Seleziona numero ospiti:</label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setGuests(Math.max(1, guests - 1))}
            disabled={guests <= 1 || loading}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          
          <input
            type="number"
            min={1}
            max={maxGuests}
            value={guests}
            onChange={(e) => setGuests(Math.min(maxGuests, Math.max(1, parseInt(e.target.value) || 1)))}
            disabled={loading}
            className="w-20 h-10 text-center text-lg font-bold border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          
          <button
            type="button"
            onClick={() => setGuests(Math.min(maxGuests, guests + 1))}
            disabled={guests >= maxGuests || loading}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
        <span className="text-sm text-slate-500">(max {maxGuests})</span>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">{error}</div>
      )}

      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
          Numero ospiti aggiornato con successo!
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading || guests === currentGuests}
        className="px-6 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 text-white font-medium rounded-xl hover:shadow-lg disabled:opacity-50 transition-all"
      >
        {loading ? "Salvataggio..." : "Conferma ospiti"}
      </button>
    </div>
  );
}
