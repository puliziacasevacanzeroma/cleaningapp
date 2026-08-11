"use client";

/**
 * ════════════════════════════════════════════════════════════════════
 * PropertySearchBar — barra di ricerca con scelta dell'appartamento
 * ════════════════════════════════════════════════════════════════════
 *
 * Una sola barra riusata ovunque si debba filtrare per appartamento:
 * pagina Pulizie, campanella Notifiche, campanella Segnalazioni.
 * Stesso aspetto e stesso comportamento in tutti i punti — se cambia,
 * cambia in un posto solo.
 *
 * DUE MODI DI USARLA, insieme:
 *   1. TESTO LIBERO — si scrive e si filtra su qualunque campo
 *      (nome proprietà, proprietario, testo della notifica…).
 *   2. SCELTA DELL'APPARTAMENTO — mentre scrivi compare l'elenco degli
 *      appartamenti che corrispondono: ne scegli uno e resta agganciato
 *      come "pillola", così non devi ricordarne il nome esatto.
 *
 * Il componente NON filtra: espone `value` (testo) e `selected`
 * (appartamento agganciato). Il filtro lo fa il chiamante, che sa cosa
 * sta filtrando. `matchesPropertyQuery` qui sotto è l'helper condiviso
 * per non riscrivere la stessa normalizzazione in ogni pagina.
 */

import { useState, useRef, useEffect, useMemo } from "react";

export interface PropertyOption {
  id: string;
  name: string;
  /** Riga secondaria opzionale (indirizzo, proprietario…). */
  subtitle?: string;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Appartamento agganciato (o null). */
  selected?: PropertyOption | null;
  onSelect?: (p: PropertyOption | null) => void;
  /** Elenco su cui costruire i suggerimenti. */
  properties?: PropertyOption[];
  placeholder?: string;
  /** Conteggio risultati mostrato sotto la barra (opzionale). */
  resultCount?: number;
  autoFocus?: boolean;
  className?: string;
}

/** Minuscole, senza accenti, spazi normalizzati: confronti indulgenti. */
export function normalizeSearch(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Helper condiviso di corrispondenza.
 *
 * @param haystacks campi in cui cercare (nome proprietà, titolo, messaggio…)
 * @param term      testo digitato
 * @param selectedName nome dell'appartamento agganciato, se presente
 *
 * Con un appartamento agganciato il filtro è STRETTO su quel nome
 * (serve a isolare un immobile). Col solo testo libero basta che TUTTE
 * le parole digitate compaiano da qualche parte: "campo fiori" trova
 * "Campo De Fiori Home" anche saltando il "De".
 */
export function matchesPropertyQuery(
  haystacks: Array<string | undefined | null>,
  term: string,
  selectedName?: string | null,
): boolean {
  const hay = normalizeSearch(haystacks.filter(Boolean).join(" · "));

  if (selectedName) {
    return hay.includes(normalizeSearch(selectedName));
  }
  const t = normalizeSearch(term);
  if (!t) return true;
  return t.split(" ").every(word => hay.includes(word));
}

export function PropertySearchBar({
  value,
  onChange,
  selected = null,
  onSelect,
  properties = [],
  placeholder = "Cerca appartamento...",
  resultCount,
  autoFocus = false,
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Suggerimenti: appartamenti che corrispondono al testo digitato.
  // A campo vuoto non si apre nulla, per non coprire la lista sotto.
  const suggestions = useMemo(() => {
    const t = normalizeSearch(value);
    if (!t || selected) return [];
    return properties
      .filter(p => {
        const hay = normalizeSearch(`${p.name} ${p.subtitle || ""}`);
        return t.split(" ").every(w => hay.includes(w));
      })
      .slice(0, 8);
  }, [value, properties, selected]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  const clearAll = () => {
    onChange("");
    onSelect?.(null);
    setOpen(false);
  };

  const pick = (p: PropertyOption) => {
    onSelect?.(p);
    onChange("");
    setOpen(false);
  };

  const showSuggestions = open && suggestions.length > 0;

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>

        {selected ? (
          // Appartamento agganciato: pillola al posto del testo libero
          <div className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2 min-h-[42px]">
            <span className="inline-flex items-center gap-1.5 max-w-full bg-violet-100 text-violet-700 text-[12px] font-semibold px-2.5 py-1 rounded-lg">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span className="truncate">{selected.name}</span>
            </span>
          </div>
        ) : (
          <input
            type="text"
            inputMode="search"
            autoFocus={autoFocus}
            placeholder={placeholder}
            value={value}
            onChange={e => { onChange(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        )}

        {(value || selected) && (
          <button
            type="button"
            onClick={clearAll}
            aria-label="Cancella ricerca"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg bg-slate-200 hover:bg-slate-300 flex items-center justify-center active:scale-95 transition-all"
          >
            <svg className="w-3.5 h-3.5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Suggerimenti appartamenti */}
      {showSuggestions && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-64 overflow-y-auto">
          <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-slate-400 font-semibold">
            Scegli l&apos;appartamento
          </p>
          {suggestions.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => pick(p)}
              className="w-full text-left px-3 py-2.5 hover:bg-slate-50 active:bg-slate-100 transition-colors border-t border-slate-50 flex items-center gap-2.5"
            >
              <div className="w-7 h-7 rounded-lg bg-violet-50 text-violet-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-slate-800 truncate">{p.name}</p>
                {p.subtitle && <p className="text-[11px] text-slate-400 truncate">{p.subtitle}</p>}
              </div>
            </button>
          ))}
        </div>
      )}

      {typeof resultCount === "number" && (value || selected) && !showSuggestions && (
        <p className="mt-1.5 px-1 text-[11px] text-slate-400">
          {resultCount === 0 ? "Nessun risultato" : `${resultCount} risultat${resultCount === 1 ? "o" : "i"}`}
        </p>
      )}
    </div>
  );
}
