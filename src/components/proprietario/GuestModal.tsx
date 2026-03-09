"use client";

import { useState, useEffect, memo } from "react";

interface GuestModalProps {
  cleaning: any;
  properties: any[];
  isAdmin: boolean;
  initialAdulti: number;
  initialNeonati: number;
  savingGuests: boolean;
  onSave: (adulti: number, neonati: number) => void;
  onClose: () => void;
}

export const GuestModal = memo(function GuestModal({
  cleaning,
  properties,
  isAdmin,
  initialAdulti,
  initialNeonati,
  savingGuests,
  onSave,
  onClose,
}: GuestModalProps) {
  const [adulti, setAdulti] = useState(initialAdulti);
  const [neonati, setNeonati] = useState(initialNeonati);
  const [countdownText, setCountdownText] = useState("");

  // Sync when modal opens with new cleaning
  useEffect(() => {
    setAdulti(initialAdulti);
    setNeonati(initialNeonati);
  }, [initialAdulti, initialNeonati]);

  // Countdown timer
  useEffect(() => {
    const cleaningDate = cleaning.date instanceof Date
      ? cleaning.date
      : new Date(cleaning.date);
    const deadline = new Date(cleaningDate);
    deadline.setDate(deadline.getDate() - 1);
    deadline.setHours(20, 0, 0, 0);

    const updateCountdown = () => {
      const now = new Date();
      const diff = deadline.getTime() - now.getTime();
      if (diff <= 0) {
        setCountdownText("Tempo scaduto");
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      const parts: string[] = [];
      if (days > 0) parts.push(`${days}g`);
      if (hours > 0) parts.push(`${hours}h`);
      parts.push(`${minutes}m`);
      parts.push(`${seconds}s`);
      setCountdownText(parts.join(" "));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [cleaning]);

  const cleaningProperty = properties.find((p: any) => p.id === cleaning.propertyId);
  const maxGuestsLimit = cleaning.maxGuests || cleaningProperty?.maxGuests || 6;

  const cleaningDate = cleaning.date instanceof Date
    ? cleaning.date
    : new Date(cleaning.date);
  const now = new Date();
  const deadlineDate = new Date(cleaningDate);
  deadlineDate.setDate(deadlineDate.getDate() - 1);
  deadlineDate.setHours(20, 0, 0, 0);
  const isAfterDeadline = now >= deadlineDate;

  const hasGuestsSet = cleaning.guestsConfirmed === true;
  const isGuestsLocked = !isAdmin && isAfterDeadline;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      style={{ overflow: "hidden" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-bold text-slate-800">Numero ospiti</h3>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Caso 1: Confermato */}
          {hasGuestsSet && !isGuestsLocked && (
            <div className="mb-4 p-4 rounded-xl border bg-emerald-50 border-emerald-200">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-emerald-100">
                  <span className="text-xl">✅</span>
                </div>
                <div>
                  <p className="font-semibold text-emerald-800">Perfetto!</p>
                  <p className="text-sm text-emerald-600 mt-1">
                    Prepareremo la casa per <strong>{cleaning.guestsCount}</strong> {cleaning.guestsCount === 1 ? "ospite" : "ospiti"}. Puoi modificare se necessario.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Caso 2: NON confermato, PRIMA deadline */}
          {!hasGuestsSet && !isAfterDeadline && (
            <div className="mb-4 p-4 rounded-xl border bg-orange-50 border-orange-200">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-orange-100">
                  <span className="text-xl">⚠️</span>
                </div>
                <div>
                  <p className="font-semibold text-orange-800">Inserisci il numero di ospiti!</p>
                  <p className="text-sm text-orange-600 mt-1">
                    Per preparare la biancheria corretta, indica per quante persone dobbiamo preparare la casa.
                  </p>
                  <div className="flex items-center gap-2 mt-2 bg-orange-100 rounded-lg px-3 py-1.5">
                    <span className="text-sm">⏱️</span>
                    <p className="text-xs font-semibold text-orange-700 tabular-nums">
                      Tempo rimasto: <span className="text-orange-900">{countdownText}</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Caso 3: NON confermato, DOPO deadline (solo proprietario) */}
          {!hasGuestsSet && isAfterDeadline && !isAdmin && (
            <div className="mb-4 p-4 rounded-xl border bg-amber-50 border-amber-200">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-amber-100">
                  <span className="text-xl">🔒</span>
                </div>
                <div>
                  <p className="font-semibold text-amber-800">Numero ospiti applicato automaticamente</p>
                  <p className="text-sm text-amber-600 mt-1">
                    Non avendo inserito il numero di ospiti entro le 20:00, è stato applicato il massimo: <strong>{maxGuestsLimit} ospiti</strong>.
                  </p>
                  <p className="text-xs text-amber-500 mt-2">
                    Solo l'amministratore può modificare questa impostazione.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Caso 4: DOPO deadline con conferma */}
          {hasGuestsSet && isGuestsLocked && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H9m3-10V7a4 4 0 00-8 0v4h12V7a4 4 0 00-4-4z" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-red-800">Modifica non più disponibile</p>
                  <p className="text-sm text-red-600 mt-1">
                    Il termine per modificare il numero ospiti è scaduto (ore 20:00 del giorno prima).
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Caso 5: Admin dopo deadline */}
          {isAfterDeadline && isAdmin && (
            <div className="mb-4 p-4 rounded-xl border bg-purple-50 border-purple-200">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-purple-100">
                  <span className="text-xl">👑</span>
                </div>
                <div>
                  <p className="font-semibold text-purple-800">Modifica Admin</p>
                  <p className="text-sm text-purple-600 mt-1">
                    La deadline è passata. Come admin puoi ancora modificare il numero di ospiti.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className={`flex items-center justify-between py-4 border-b border-slate-100 ${isGuestsLocked ? "opacity-50" : ""}`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <span className="font-medium text-slate-800">Adulti</span>
                <p className="text-xs text-slate-400">Max {maxGuestsLimit}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setAdulti(Math.max(1, adulti - 1))} className="w-9 h-9 rounded-full border-2 border-slate-200 flex items-center justify-center text-slate-400 disabled:opacity-30" disabled={adulti <= 1 || isGuestsLocked}>
                <span className="text-lg">−</span>
              </button>
              <span className="text-xl font-bold text-slate-800 w-6 text-center">{adulti}</span>
              <button onClick={() => setAdulti(Math.min(maxGuestsLimit, adulti + 1))} disabled={adulti >= maxGuestsLimit || isGuestsLocked} className="w-9 h-9 rounded-full bg-violet-500 flex items-center justify-center text-white shadow-lg disabled:opacity-30">
                <span className="text-lg">+</span>
              </button>
            </div>
          </div>

          <div className={`flex items-center justify-between py-4 border-b border-slate-100 ${isGuestsLocked ? "opacity-50" : ""}`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <div>
                <span className="font-medium text-slate-800">Neonati</span>
                <p className="text-xs text-slate-400">0-2 anni</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setNeonati(Math.max(0, neonati - 1))} className="w-9 h-9 rounded-full border-2 border-slate-200 flex items-center justify-center text-slate-400 disabled:opacity-30" disabled={neonati <= 0 || isGuestsLocked}>
                <span className="text-lg">−</span>
              </button>
              <span className="text-xl font-bold text-slate-800 w-6 text-center">{neonati}</span>
              <button onClick={() => setNeonati(neonati + 1)} disabled={isGuestsLocked} className="w-9 h-9 rounded-full bg-rose-500 flex items-center justify-center text-white shadow-lg disabled:opacity-30">
                <span className="text-lg">+</span>
              </button>
            </div>
          </div>

          <div className="mt-4 p-3 bg-slate-50 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Totale ospiti</span>
              <span className="text-lg font-bold text-slate-800">{adulti + neonati}</span>
            </div>
          </div>

          <div className="flex gap-3 mt-5">
            <button onClick={onClose} className="flex-1 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl">
              {isGuestsLocked ? "Chiudi" : "Annulla"}
            </button>
            {!isGuestsLocked && (
              <button onClick={() => onSave(adulti, neonati)} disabled={savingGuests} className="flex-1 py-3 bg-slate-800 text-white font-semibold rounded-xl disabled:opacity-50">
                {savingGuests ? "Salvo..." : "Conferma"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
