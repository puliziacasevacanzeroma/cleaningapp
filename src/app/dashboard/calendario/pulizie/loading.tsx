// 🚀 Loading istantaneo per /dashboard/calendario/pulizie
// 
// Next.js 14 mostra QUESTO file immediatamente al click sul link Pulizie,
// mentre il bundle della pagina pesante (PulizieContent, 2800+ righe)
// viene caricato e parsato in background. Così l'utente vede SUBITO
// il cambio di pagina anziché restare bloccato sulla Dashboard precedente.
//
// Lo skeleton è leggerissimo (pochi div con animate-pulse), non fa fetch,
// non monta componenti pesanti. Scompare non appena page.tsx è pronto
// e la cache dello store si popola.

export default function PulizieLoading() {
  return (
    <div className="min-h-screen bg-slate-50 pb-4">
      {/* Header skeleton */}
      <div className="px-4 pt-4 pb-3">
        <div className="h-8 w-40 rounded-lg bg-slate-200 animate-pulse" />
      </div>

      {/* Toggle List/Calendar skeleton */}
      <div className="px-4 mb-3">
        <div className="h-11 w-full max-w-xs rounded-2xl bg-slate-200 animate-pulse" />
      </div>

      {/* Filtri skeleton */}
      <div className="px-4 mb-3 flex gap-2 flex-wrap">
        <div className="h-9 w-24 rounded-xl bg-slate-200 animate-pulse" />
        <div className="h-9 w-32 rounded-xl bg-slate-200 animate-pulse" />
        <div className="h-9 w-28 rounded-xl bg-slate-200 animate-pulse" />
      </div>

      {/* Card skeleton (3 card grigie) */}
      <div className="px-4 space-y-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-24 w-full rounded-2xl bg-slate-200 animate-pulse"
            style={{ animationDelay: `${i * 100}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
