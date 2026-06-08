"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { searchAddress, type AddressResult } from "~/lib/geo";

interface AddressAutocompleteProps {
  /** Callback quando l'utente seleziona un indirizzo */
  onSelect: (result: AddressResult) => void;
  /** Callback quando l'utente vuole inserire manualmente. Riceve l'eventuale
   *  testo già digitato, così il campo manuale può partire pre-compilato. */
  onManualEntry?: (prefill?: string) => void;
  /** Valore iniziale del campo */
  defaultValue?: string;
  /** Placeholder del campo */
  placeholder?: string;
  /** Se il campo è disabilitato */
  disabled?: boolean;
  /** Classe CSS aggiuntiva per l'input */
  className?: string;
  /** Se mostrare l'icona di verifica quando selezionato */
  showVerifiedIcon?: boolean;
  /** Label del campo */
  label?: string;
  /** Se il campo è obbligatorio */
  required?: boolean;
  /** Messaggio di errore */
  error?: string;
}

export default function AddressAutocomplete({
  onSelect,
  onManualEntry,
  defaultValue = "",
  placeholder = "Inizia a digitare l'indirizzo...",
  disabled = false,
  className = "",
  showVerifiedIcon = true,
  label,
  required = false,
  error,
}: AddressAutocompleteProps) {
  const [query, setQuery] = useState(defaultValue);
  const [results, setResults] = useState<AddressResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isVerified, setIsVerified] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [failedSearches, setFailedSearches] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced search
  const performSearch = useCallback(async (searchQuery: string) => {
    const q = searchQuery.trim();
    if (q.length < 3) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    // Apri subito la tendina: anche durante il caricamento l'utente vede
    // l'opzione "inserisci manualmente" e non resta mai bloccato.
    setIsOpen(true);
    setIsLoading(true);
    try {
      let searchResults: AddressResult[] = [];

      // 1) Proxy server-side (User-Agent corretto + cache → più risultati).
      try {
        const res = await fetch(
          `/api/geocode?q=${encodeURIComponent(q)}&limit=8`,
          { headers: { Accept: "application/json" } }
        );
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.results)) searchResults = data.results;
        } else {
          throw new Error(`geocode ${res.status}`);
        }
      } catch {
        // 2) Fallback: ricerca diretta dal client (comportamento storico).
        searchResults = await searchAddress(q, {
          limit: 8,
          countryCode: "it",
          lang: "it",
        });
      }

      setResults(searchResults);
      setIsOpen(true);
      setSelectedIndex(-1);
      if (searchResults.length === 0) {
        setFailedSearches((prev) => prev + 1);
      } else {
        setFailedSearches(0);
      }
    } catch (error) {
      console.error("Errore ricerca indirizzo:", error);
      setResults([]);
      setIsOpen(true);
      setFailedSearches((prev) => prev + 1);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle input change with debounce
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setIsVerified(false);
    setHasInteracted(true);

    // Clear previous timeout
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Set new timeout (300ms debounce)
    debounceRef.current = setTimeout(() => {
      performSearch(value);
    }, 200);
  };

  // Handle result selection
  const handleSelect = (result: AddressResult) => {
    setQuery(result.fullAddress);
    setIsVerified(true);
    setIsOpen(false);
    setResults([]);
    onSelect(result);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < results.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && results[selectedIndex]) {
          handleSelect(results[selectedIndex]);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setSelectedIndex(-1);
        break;
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Confidence badge colors
  const getConfidenceBadge = (confidence: string) => {
    switch (confidence) {
      case "high":
        return (
          <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded-full">
            ✓ Preciso
          </span>
        );
      case "medium":
        return (
          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">
            ~ Parziale
          </span>
        );
      default:
        return (
          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">
            ? Incerto
          </span>
        );
    }
  };

  return (
    <div className="relative">
      {/* Label */}
      {label && (
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {/* Input Container */}
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          {isLoading ? (
            <svg
              className="w-5 h-5 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : (
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          )}
        </div>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          placeholder={placeholder}
          disabled={disabled}
          className={`
            w-full pl-10 pr-10 py-3 
            border rounded-xl 
            focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500
            disabled:bg-slate-100 disabled:cursor-not-allowed
            transition-all
            ${error ? "border-red-300 bg-red-50" : isVerified ? "border-emerald-300 bg-emerald-50/50" : "border-slate-200"}
            ${className}
          `}
        />

        {/* Verified Icon */}
        {showVerifiedIcon && isVerified && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
              <svg
                className="w-4 h-4 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          </div>
        )}

        {/* Clear button when not verified and has content */}
        {!isVerified && query.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setResults([]);
              setIsOpen(false);
              setIsVerified(false);
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Error message */}
      {error && (
        <p className="mt-1.5 text-sm text-red-600 flex items-center gap-1">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </p>
      )}

      {/* Warning if not verified after interaction */}
      {hasInteracted && !isVerified && query.length > 0 && !isOpen && !isLoading && (
        <p className="mt-1.5 text-sm text-amber-600 flex items-center gap-1">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          Seleziona un indirizzo dalla lista per verificarlo
        </p>
      )}

      {/* Dropdown unificato: risultati / caricamento / nessun risultato,
          con SEMPRE in fondo il pulsante "Inserisci manualmente". */}
      {isOpen && query.trim().length >= 3 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
        >
          {/* Intestazione (solo se ci sono risultati) */}
          {results.length > 0 && (
            <div className="p-2 bg-slate-50 border-b border-slate-100">
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                Seleziona un indirizzo per verificarlo
              </p>
            </div>
          )}

          {/* Caricamento (mentre non ci sono ancora risultati) */}
          {isLoading && results.length === 0 && (
            <div className="px-4 py-4 flex items-center justify-center gap-2 text-sm text-slate-500">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Ricerca in corso…
            </div>
          )}

          {/* Lista risultati */}
          {results.length > 0 && (
            <ul className="max-h-64 overflow-y-auto">
              {results.map((result, index) => (
                <li key={index}>
                  <button
                    type="button"
                    onClick={() => handleSelect(result)}
                    className={`
                      w-full px-4 py-3 text-left flex items-start gap-3 transition-colors
                      ${selectedIndex === index ? "bg-blue-50" : "hover:bg-slate-50"}
                    `}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      <div className={`
                        w-8 h-8 rounded-lg flex items-center justify-center
                        ${result.confidence === "high" ? "bg-emerald-100 text-emerald-600" :
                          result.confidence === "medium" ? "bg-amber-100 text-amber-600" :
                          "bg-slate-100 text-slate-500"}
                      `}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 truncate">
                        {result.street} {result.houseNumber}
                      </p>
                      <p className="text-sm text-slate-500 truncate">
                        {result.postalCode} {result.city}
                      </p>
                    </div>

                    <div className="flex-shrink-0">
                      {getConfidenceBadge(result.confidence)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Nessun risultato (ma NON in caricamento) */}
          {!isLoading && results.length === 0 && (
            <div className="px-4 py-4 text-center">
              <div className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2">
                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-700">Nessun indirizzo trovato</p>
              <p className="text-xs text-slate-500 mt-1">
                Nessun problema: inseriscilo manualmente qui sotto.
              </p>
            </div>
          )}

          {/* 🆕 FOOTER SEMPRE PRESENTE: inserimento manuale.
              Porta con sé il testo già digitato, così non lo si riscrive. */}
          {onManualEntry && (
            <div className="p-2 bg-slate-50 border-t border-slate-100">
              <button
                type="button"
                onClick={() => { setIsOpen(false); onManualEntry(query.trim()); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 active:scale-[0.99] transition-all"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                <span className="truncate">
                  Inserisci manualmente{query.trim() ? `: «${query.trim()}»` : ""}
                </span>
              </button>
              {results.length > 0 && (
                <p className="text-[10px] text-slate-400 text-center mt-1.5">
                  ↑↓ naviga • Invio seleziona • Esc chiudi
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
