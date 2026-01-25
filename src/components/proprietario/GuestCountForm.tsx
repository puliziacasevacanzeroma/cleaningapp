"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface GuestCountFormProps {
  bookingId: string;
  currentGuests: number | null;
  maxGuests: number;
  checkoutDate?: string | Date;
}

export function GuestCountForm({ bookingId, currentGuests, maxGuests, checkoutDate }: GuestCountFormProps) {
  const router = useRouter();
  const [guests, setGuests] = useState(currentGuests || 1);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [canModify, setCanModify] = useState(true);
  const [blockReason, setBlockReason] = useState<string | null>(null);

  // Verifica se la modifica è ancora permessa
  useEffect(() => {
    const checkCanModify = async () => {
      try {
        const response = await fetch(`/api/bookings/${bookingId}/guests`);
        if (response.ok) {
          const data = await response.json();
          setCanModify(data.canModify);
          setBlockReason(data.reason || null);
        }
      } catch (err) {
        console.error("Errore verifica modifica:", err);
      } finally {
        setChecking(false);
      }
    };
    
    checkCanModify();
  }, [bookingId]);

  const handleSubmit = async () => {
    if (!canModify) return;
    
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch(`/api/bookings/${bookingId}/guests`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestsCount: guests }),
      });

      const data = await response.json();
      
      if (!response.ok) {
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

  // Loading state
  if (checking) {
    return (
      <div className="flex items-center gap-2 text-slate-500">
        <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
        <span>Verifica in corso...</span>
      </div>
    );
  }

  // Bloccato - mostra messaggio
  if (!canModify) {
    return (
      <div className="space-y-3">
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H9m3-10V7a4 4 0 00-8 0v4h12V7a4 4 0 00-4-4z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-red-800">Modifica non più disponibile</p>
              <p className="text-sm text-red-600 mt-1">
                {blockReason || "Il termine per modificare il numero ospiti è scaduto."}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm text-amber-800">
            <strong>La biancheria verrà preparata per {maxGuests} ospiti</strong> (capacità massima della proprietà).
          </p>
        </div>
      </div>
    );
  }

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
          ✓ Numero ospiti aggiornato! La biancheria sarà preparata per {guests} ospiti.
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
