"use client";

/**
 * Error Boundary — Area Operatore
 */

export default function OperatoreError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center bg-gradient-to-br from-emerald-500/10 to-teal-600/10 backdrop-blur-xl rounded-3xl p-8 border border-emerald-200/50 shadow-lg">
        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-2xl shadow-lg shadow-emerald-500/25">
          🧹
        </div>
        <h2 className="text-lg font-semibold text-slate-800 mb-2">
          Errore nel caricamento
        </h2>
        <p className="text-sm text-slate-500 mb-7 leading-relaxed">
          Si è verificato un problema. Prova a ricaricare la pagina.
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={reset}
            className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-emerald-500/30 hover:-translate-y-0.5 transition-all"
          >
            Riprova
          </button>
          <a
            href="/operatore"
            className="text-slate-400 text-sm hover:text-slate-600 transition-colors"
          >
            Torna alla Home
          </a>
        </div>
      </div>
    </div>
  );
}
