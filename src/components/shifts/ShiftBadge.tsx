"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { useAuth } from "~/lib/firebase/AuthContext";
import { toMillis, formatDurationLive, formatTimeRome } from "~/lib/workSessions";

/**
 * ShiftBadge — widget timbratura inizio/fine turno.
 *
 * Architettura (v2):
 * - Listener su doc `activeShifts/{userId}` (ID fisso, zero composite index)
 * - Se il doc esiste → turno OPEN, leggo startAt da lì (evito secondo fetch)
 * - Se il doc non esiste → nessun turno attivo
 * - Start/End via POST /api/shifts con transaction server-side
 * - Timer live calcolato come (now - startAt): sorgente di verità = server
 *
 * Protezioni:
 * - Debounce anti-doppioclick (1.5s)
 * - state `saving` blocca bottoni durante chiamata
 * - Retry 1 volta su errore rete (timeout 1.2s)
 * - Modal di conferma per start E end (evita click accidentali)
 */
export default function ShiftBadge() {
  const { user } = useAuth();
  const [activeLock, setActiveLock] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [notes, setNotes] = useState("");
  // Modal lavori in corso: mostrata quando l'utente prova a chiudere il turno
  // ma ha ancora pulizie IN_PROGRESS o ordini PICKING/IN_TRANSIT
  const [showActiveWorkModal, setShowActiveWorkModal] = useState(false);
  const [activeWork, setActiveWork] = useState<{ cleanings: any[]; orders: any[] }>({ cleanings: [], orders: [] });
  const [checkingWork, setCheckingWork] = useState(false);
  // Mount flag per createPortal (evita SSR hydration mismatch)
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const lastClickRef = useRef<number>(0);

  // Listener diretto sul doc activeShifts/{userId} — no index, no where, no composite
  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    const docRef = doc(db, "activeShifts", user.id);
    const unsub = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          setActiveLock({ id: snap.id, ...snap.data() });
        } else {
          setActiveLock(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error("Errore listener activeShifts:", err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [user?.id]);

  // Ticker live: 1s solo se sessione aperta
  useEffect(() => {
    if (!activeLock) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeLock]);

  const canClick = useCallback(() => {
    const n = Date.now();
    if (n - lastClickRef.current < 1500) return false;
    lastClickRef.current = n;
    return true;
  }, []);

  const callApi = useCallback(
    async (action: "start" | "end", extra?: Record<string, any>, retry = 1): Promise<boolean> => {
      try {
        const res = await fetch("/api/shifts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...(extra || {}) }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          // Caso ALREADY_OPEN all'avvio: il listener ricaricherà lo stato coerente
          if (json?.code === "ALREADY_OPEN" && action === "start") return true;
          setError(json?.error || `Errore ${res.status}`);
          return false;
        }
        return true;
      } catch (e: any) {
        if (retry > 0) {
          await new Promise((r) => setTimeout(r, 1200));
          return callApi(action, extra, retry - 1);
        }
        setError("Errore di rete. Verifica la connessione e riprova.");
        return false;
      }
    },
    []
  );

  const handleStart = async () => {
    if (!canClick() || saving) return;
    setError(null);
    setSaving(true);
    const ok = await callApi("start", notes.trim() ? { notes: notes.trim() } : undefined);
    setSaving(false);
    if (ok) {
      setShowStartConfirm(false);
      setNotes("");
    }
  };

  const handleEnd = async () => {
    if (!canClick() || saving) return;
    setError(null);
    setSaving(true);
    const ok = await callApi("end", notes.trim() ? { notes: notes.trim() } : undefined);
    setSaving(false);
    if (ok) {
      setShowEndConfirm(false);
      setNotes("");
    }
  };

  // Click "Termina turno" → PRIMA controlla se ci sono lavori in corso.
  // Se sì, mostra il modal di alert (con opzione "chiudi comunque").
  // Se no, va direttamente al modal di conferma chiusura.
  const handleRequestEnd = async () => {
    if (!canClick() || checkingWork) return;
    setError(null);
    setNotes("");
    setCheckingWork(true);
    try {
      const res = await fetch("/api/shifts/check-active-work", {
        method: "GET",
        credentials: "same-origin",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.hasActiveWork) {
          setActiveWork({ cleanings: data.cleanings || [], orders: data.orders || [] });
          setShowActiveWorkModal(true);
          setCheckingWork(false);
          return;
        }
      }
      // Nessun lavoro in corso (o errore API) → procedi normalmente
      setShowEndConfirm(true);
    } catch (e) {
      // Errore di rete: non blocco, mostro conferma normale
      console.error("Errore check-active-work:", e);
      setShowEndConfirm(true);
    } finally {
      setCheckingWork(false);
    }
  };

  // Non mostrare il widget ai ruoli non abilitati (confronto case-insensitive)
  const userRoleUpper = user?.role?.toUpperCase();
  if (!user || (userRoleUpper !== "OPERATORE_PULIZIE" && userRoleUpper !== "RIDER")) {
    return null;
  }

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-slate-100 to-slate-50 rounded-2xl p-4 border border-slate-200">
        <div className="animate-pulse flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-slate-200" />
          <div className="flex-1">
            <div className="h-3 bg-slate-200 rounded w-24 mb-2" />
            <div className="h-4 bg-slate-200 rounded w-32" />
          </div>
        </div>
      </div>
    );
  }

  const isOpen = !!activeLock;
  const liveDuration = isOpen ? formatDurationLive(activeLock.startAt, null, nowMs) : "00:00:00";

  return (
    <>
      <div
        className={`rounded-2xl overflow-hidden transition-all ${
          isOpen
            ? "bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/30"
            : "bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200"
        }`}
      >
        <div className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
                isOpen ? "bg-white/20" : "bg-white"
              }`}
            >
              {isOpen ? (
                <span className="relative flex items-center justify-center">
                  <span className="animate-ping absolute w-3 h-3 bg-white rounded-full opacity-75" />
                  <span className="relative w-3 h-3 bg-white rounded-full" />
                </span>
              ) : (
                <span className="text-slate-500">⏱️</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-bold uppercase tracking-wider ${isOpen ? "text-white/80" : "text-slate-400"}`}>
                {isOpen ? "Turno in corso" : "Nessun turno attivo"}
              </p>
              {isOpen ? (
                <p className="text-sm font-semibold text-white mt-0.5">
                  Iniziato alle {formatTimeRome(activeLock.startAt)}
                </p>
              ) : (
                <p className="text-sm text-slate-500 mt-0.5">Clicca per iniziare</p>
              )}
            </div>
          </div>

          {isOpen && (
            <div className="mb-3 bg-white/10 rounded-xl py-3 text-center">
              <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest">Tempo lavorato</p>
              <p className="text-3xl font-black text-white tabular-nums mt-0.5">{liveDuration}</p>
            </div>
          )}

          {error && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
              ⚠️ {error}
            </div>
          )}

          <button
            onClick={() => {
              setError(null);
              setNotes("");
              if (isOpen) handleRequestEnd();
              else setShowStartConfirm(true);
            }}
            disabled={saving || checkingWork}
            className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all disabled:opacity-50 ${
              isOpen
                ? "bg-white text-red-600 hover:bg-red-50 shadow"
                : "bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30 hover:shadow-xl"
            }`}
          >
            {checkingWork ? "Controllo..." : (isOpen ? "🔴 Termina Turno" : "🟢 Inizia Turno")}
          </button>
        </div>
      </div>

      {/* Modal START */}
      {showStartConfirm && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => !saving && setShowStartConfirm(false)}
        >
          <div className="bg-white rounded-2xl max-w-sm w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-5">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-emerald-500/30">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-extrabold text-slate-800 text-center mb-1">Inizia il turno?</h3>
              <p className="text-sm text-slate-500 text-center mb-4">
                L&apos;orario di inizio verrà registrato automaticamente.
              </p>
              <label className="text-xs font-bold text-slate-600 block mb-1">Note (opzionale)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, 500))}
                placeholder="Es. Oggi parto da zona Centro..."
                rows={2}
                maxLength={500}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-emerald-400 resize-none"
              />
              <p className="text-[10px] text-slate-400 text-right mt-0.5">{notes.length}/500</p>
            </div>
            <div className="flex border-t border-slate-100">
              <button
                onClick={() => setShowStartConfirm(false)}
                disabled={saving}
                className="flex-1 py-3.5 text-sm font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-50"
              >
                Annulla
              </button>
              <button
                onClick={handleStart}
                disabled={saving}
                className="flex-1 py-3.5 text-sm font-bold text-emerald-600 hover:bg-emerald-50 border-l border-slate-100 disabled:opacity-50"
              >
                {saving ? "⏳ Avvio..." : "🟢 Inizia"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal END */}
      {showEndConfirm && isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => !saving && setShowEndConfirm(false)}
        >
          <div className="bg-white rounded-2xl max-w-sm w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-5">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-400 to-rose-500 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-red-500/30">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10l-4 4m0 0l-4-4m4 4V3m-8 16h14" />
                </svg>
              </div>
              <h3 className="text-lg font-extrabold text-slate-800 text-center mb-1">Termina il turno?</h3>
              <p className="text-sm text-slate-500 text-center mb-1">
                Turno iniziato alle <strong>{formatTimeRome(activeLock.startAt)}</strong>
              </p>
              <p className="text-3xl font-black text-emerald-600 text-center tabular-nums mb-4">{liveDuration}</p>
              <label className="text-xs font-bold text-slate-600 block mb-1">Note (opzionale)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, 500))}
                placeholder="Es. Nessun problema oggi..."
                rows={2}
                maxLength={500}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-red-400 resize-none"
              />
              <p className="text-[10px] text-slate-400 text-right mt-0.5">{notes.length}/500</p>
            </div>
            <div className="flex border-t border-slate-100">
              <button
                onClick={() => setShowEndConfirm(false)}
                disabled={saving}
                className="flex-1 py-3.5 text-sm font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-50"
              >
                Annulla
              </button>
              <button
                onClick={handleEnd}
                disabled={saving}
                className="flex-1 py-3.5 text-sm font-bold text-red-600 hover:bg-red-50 border-l border-slate-100 disabled:opacity-50"
              >
                {saving ? "⏳ Chiusura..." : "🔴 Termina"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal LAVORI IN CORSO — avvisa l'utente se prova a chiudere con pulizie/ordini attivi */}
      {/* Usa createPortal verso document.body per uscire dallo stacking context */}
      {/* di navbar/header ed essere VERAMENTE sopra tutto. */}
      {showActiveWorkModal && mounted && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] p-3"
          onClick={() => setShowActiveWorkModal(false)}
          style={{ maxHeight: "100dvh" }}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-sm shadow-2xl flex flex-col overflow-hidden"
            style={{ maxHeight: "92dvh" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* HEADER — fisso in alto */}
            <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-5 text-center flex-shrink-0">
              <div className="w-14 h-14 rounded-2xl bg-white/20 mx-auto flex items-center justify-center text-3xl mb-2">
                ⚠️
              </div>
              <h3 className="text-white font-black text-lg">Lavori in corso</h3>
              <p className="text-white/90 text-xs mt-0.5">Stai terminando il turno</p>
            </div>

            {/* BODY — scrollabile se tanti lavori */}
            <div className="flex-1 overflow-y-auto p-5">
              <p className="text-slate-700 font-semibold text-center mb-3 text-sm">
                Hai ancora {activeWork.cleanings.length + activeWork.orders.length}{" "}
                {activeWork.cleanings.length + activeWork.orders.length === 1 ? "lavoro" : "lavori"} in corso:
              </p>

              {activeWork.cleanings.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-bold text-slate-500 uppercase mb-2">Pulizie</p>
                  <div className="space-y-2">
                    {activeWork.cleanings.map((c) => (
                      <div key={c.id} className="bg-amber-50 border border-amber-200 rounded-xl p-2.5">
                        <p className="font-semibold text-slate-800 text-sm truncate">🧹 {c.propertyName}</p>
                        {c.propertyAddress && (
                          <p className="text-xs text-slate-500 truncate">{c.propertyAddress}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeWork.orders.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-bold text-slate-500 uppercase mb-2">Consegne</p>
                  <div className="space-y-2">
                    {activeWork.orders.map((o) => (
                      <div key={o.id} className="bg-blue-50 border border-blue-200 rounded-xl p-2.5">
                        <p className="font-semibold text-slate-800 text-sm truncate">📦 {o.propertyName}</p>
                        <p className="text-xs text-slate-500">Stato: {o.status}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-slate-600 text-center mt-2">
                Vuoi completarli prima di chiudere il turno?
              </p>
            </div>

            {/* FOOTER — bottoni SEMPRE visibili (sticky in fondo) */}
            <div className="flex-shrink-0 p-4 border-t border-slate-100 bg-white space-y-2">
              {activeWork.cleanings.length > 0 && (
                <button
                  onClick={() => {
                    setShowActiveWorkModal(false);
                    const first = activeWork.cleanings[0];
                    window.location.href = `/operatore/pulizie/${first.id}`;
                  }}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm shadow active:scale-95 transition"
                >
                  ✅ Vai a completare
                </button>
              )}
              {activeWork.orders.length > 0 && activeWork.cleanings.length === 0 && (
                <button
                  onClick={() => {
                    setShowActiveWorkModal(false);
                    window.location.href = "/rider";
                  }}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold text-sm shadow active:scale-95 transition"
                >
                  📦 Vai a completare
                </button>
              )}
              <button
                onClick={() => {
                  setShowActiveWorkModal(false);
                  setShowEndConfirm(true);
                }}
                className="w-full py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm hover:bg-slate-200 transition"
              >
                🔴 Chiudi comunque
              </button>
              <button
                onClick={() => setShowActiveWorkModal(false)}
                className="w-full py-1.5 text-xs text-slate-500 hover:text-slate-700"
              >
                Annulla
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
