"use client";

/**
 * Error Boundary globale app — Cattura errori in qualsiasi pagina.
 */

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-500 via-sky-600 to-blue-700 flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center bg-white/[0.12] backdrop-blur-xl rounded-3xl p-8 border border-white/20 shadow-xl">
        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-white/15 flex items-center justify-center text-3xl">
          😵
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">
          Errore imprevisto
        </h2>
        <p className="text-sm text-white/70 mb-7 leading-relaxed">
          Si è verificato un problema. Puoi riprovare oppure tornare alla home.
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={reset}
            className="w-full py-3 bg-white/95 text-sky-700 font-semibold rounded-xl hover:bg-white transition-all"
          >
            Riprova
          </button>
          <a
            href="/"
            className="text-white/80 text-sm hover:text-white transition-colors"
          >
            Torna alla Home
          </a>
        </div>
      </div>
    </div>
  );
}
