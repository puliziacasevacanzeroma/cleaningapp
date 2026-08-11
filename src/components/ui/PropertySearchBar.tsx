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

import { useState, useRef, useEffect, useMemo, memo } from "react";

export interface PropertyOption {
  id: string;
  name: string;
  /** Riga secondaria opzionale (indirizzo, proprietario…). */
  subtitle?: string;
  /** Foto della proprietà (di norma `images.door` o `imageUrl`). */
  image?: string;
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
  /** Elemento affiancato sulla STESSA riga (es. il bottone Date). */
  trailing?: React.ReactNode;
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

/**
 * Miniatura della proprietà: la foto se c'è, altrimenti l'iniziale su
 * fondo colorato — mai un quadrato grigio anonimo.
 * Se l'immagine non carica (URL morto) si ricade sull'iniziale invece di
 * lasciare il riquadro rotto.
 */
function PropertyThumb({ property, size = 32 }: { property: PropertyOption; size?: number }) {
  const [failed, setFailed] = useState(false);
  const px = { width: size, height: size };
  const radius = Math.round(size / 4);

  if (property.image && !failed) {
    return (
      <img
        src={property.image}
        alt={property.name}
        onError={() => setFailed(true)}
        style={{ ...px, borderRadius: radius }}
        className="object-cover flex-shrink-0 block bg-slate-100"
      />
    );
  }
  return (
    <div
      style={{ ...px, borderRadius: radius, fontSize: Math.max(10, Math.round(size / 2.4)) }}
      className="flex-shrink-0 bg-gradient-to-br from-violet-500 to-purple-600 text-white font-bold flex items-center justify-center"
    >
      {(property.name || "?").charAt(0).toUpperCase()}
    </div>
  );
}

/**
 * ⚠️ ISOLAMENTO DEL CAMPO DI TESTO
 *
 * Il testo digitato vive in stato LOCALE e viene propagato al genitore
 * con un ritardo breve. Due motivi, entrambi concreti:
 *
 * 1. FUOCO. Il campo non dipende più dal ciclo di render del genitore.
 *    Nella pagina Centro Messaggi ogni lettera faceva ricalcolare e
 *    ridisegnare l'intera lista accanto, e il campo perdeva il fuoco a
 *    ogni battuta. Con lo stato locale il campo è immune a qualunque
 *    cosa succeda intorno.
 *
 * 2. VELOCITÀ. Il genitore (e la lista pesante) si aggiorna una volta a
 *    fine digitazione, non a ogni tasto.
 *
 * Il `memo` sotto completa l'isolamento: la barra non si ridisegna
 * quando cambiano solo i dati della lista.
 */
const TYPING_DEBOUNCE_MS = 180;

function PropertySearchBarInner({
  value,
  onChange,
  selected = null,
  onSelect,
  properties = [],
  placeholder = "Cerca appartamento...",
  resultCount,
  autoFocus = false,
  className = "",
  trailing,
}: Props) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Testo mostrato nel campo: locale, quindi indipendente dal genitore.
  const [text, setText] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ultimo valore propagato: serve a distinguere "il genitore ha
  // cambiato il valore da fuori" (es. Reset) da "sta arrivando il mio
  // stesso testo di ritorno", che non deve sovrascrivere la digitazione.
  const lastPushed = useRef(value);

  useEffect(() => {
    if (value !== lastPushed.current) {
      setText(value);
      lastPushed.current = value;
    }
  }, [value]);

  const pushText = (v: string) => {
    setText(v);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      lastPushed.current = v;
      onChange(v);
    }, TYPING_DEBOUNCE_MS);
  };

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  // Suggerimenti: appartamenti che corrispondono al testo digitato.
  // A campo vuoto non si apre nulla, per non coprire la lista sotto.
  const suggestions = useMemo(() => {
    const t = normalizeSearch(text);
    if (!t || selected) return [];
    return properties
      .filter(p => {
        const hay = normalizeSearch(`${p.name} ${p.subtitle || ""}`);
        return t.split(" ").every(w => hay.includes(w));
      })
      .slice(0, 8);
  }, [text, properties, selected]);

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
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setText("");
    lastPushed.current = "";
    onChange("");
    onSelect?.(null);
    setOpen(false);
  };

  const pick = (p: PropertyOption) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setText("");
    lastPushed.current = "";
    onSelect?.(p);
    onChange("");
    setOpen(false);
  };

  const showSuggestions = open && suggestions.length > 0;

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <div className="flex items-center gap-2">
      <div className="relative flex-1 min-w-0">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>

        {selected ? (
          // Appartamento agganciato: pillola al posto del testo libero
          <div className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2 min-h-[42px]">
            <span className="inline-flex items-center gap-1.5 max-w-full bg-violet-100 text-violet-700 text-[12px] font-semibold pl-1 pr-2.5 py-1 rounded-lg">
              <PropertyThumb property={selected} size={22} />
              <span className="truncate">{selected.name}</span>
            </span>
          </div>
        ) : (
          <input
            type="text"
            inputMode="search"
            autoFocus={autoFocus}
            placeholder={placeholder}
            value={text}
            onChange={e => pushText(e.target.value)}
            onFocus={() => setOpen(true)}
            className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        )}

        {(text || selected) && (
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
        {/* Slot sulla STESSA riga: qui vive il bottone Date */}
        {trailing}
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
              <PropertyThumb property={p} size={34} />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-slate-800 truncate">{p.name}</p>
                {p.subtitle && <p className="text-[11px] text-slate-400 truncate">{p.subtitle}</p>}
              </div>
            </button>
          ))}
        </div>
      )}

      {typeof resultCount === "number" && (text || selected) && !showSuggestions && (
        <p className="mt-1.5 px-1 text-[11px] text-slate-400">
          {resultCount === 0 ? "Nessun risultato" : `${resultCount} risultat${resultCount === 1 ? "o" : "i"}`}
        </p>
      )}
    </div>
  );
}

/** Non si ridisegna quando intorno cambiano solo i dati della lista. */
export const PropertySearchBar = memo(PropertySearchBarInner);

// ══════════════════════════════════════════════════════════════════
// PERIODO — bottone compatto + modale calendario
// ══════════════════════════════════════════════════════════════════
//
// Stesso identico calendario della pagina Pulizie (Da → A, intervallo
// evidenziato, Reset + Conferma), qui però estratto come componente
// riusabile invece di restare incastrato dentro una pagina.
//
// Il bottone sta SULLA STESSA RIGA della barra di ricerca: mostra "Date"
// quando non c'è filtro, e l'intervallo scelto quando c'è.

export interface DateRange {
  /** "YYYY-MM-DD" oppure "" */
  from: string;
  to: string;
}

export const EMPTY_RANGE: DateRange = { from: "", to: "" };

export function hasDateRange(r: DateRange | null | undefined): boolean {
  return !!(r && (r.from || r.to));
}

/** Data di un documento Firestore (Timestamp, Date, o null). */
export function docDate(v: any): Date | null {
  try {
    if (!v) return null;
    if (typeof v.toDate === "function") return v.toDate();
    if (v instanceof Date) return v;
    if (v.seconds) return new Date(v.seconds * 1000);
  } catch {
    /* data non leggibile */
  }
  return null;
}

/**
 * L'elemento rientra nell'intervallo?
 * Estremi INCLUSI (il giorno "A" conta per intero, fino a 23:59).
 * Senza data l'elemento NON viene escluso: meglio mostrarlo che perderlo.
 */
export function isInDateRange(v: any, range: DateRange | null | undefined): boolean {
  if (!hasDateRange(range)) return true;
  const d = docDate(v);
  if (!d) return true;
  if (range!.from) {
    const from = new Date(range!.from);
    from.setHours(0, 0, 0, 0);
    if (d < from) return false;
  }
  if (range!.to) {
    const to = new Date(range!.to);
    to.setHours(23, 59, 59, 999);
    if (d > to) return false;
  }
  return true;
}

function fmtShort(s: string): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

const MONTH_NAMES = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

export function DateRangeButton({
  value, onChange, className = "",
}: { value: DateRange; onChange: (r: DateRange) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const [tempFrom, setTempFrom] = useState(value.from);
  const [tempTo, setTempTo] = useState(value.to);
  const [mode, setMode] = useState<"from" | "to">("from");
  const [month, setMonth] = useState(() => (value.from ? new Date(value.from) : new Date()));

  // All'apertura si riparte SEMPRE dal valore confermato: se chiudi senza
  // confermare, le scelte a metà non restano appese.
  const openPicker = () => {
    setTempFrom(value.from);
    setTempTo(value.to);
    setMode("from");
    setMonth(value.from ? new Date(value.from) : new Date());
    setOpen(true);
  };

  const active = hasDateRange(value);
  const label = active ? `${fmtShort(value.from)} → ${fmtShort(value.to)}` : "Date";

  const y = month.getFullYear();
  const m = month.getMonth();
  const startDow = (new Date(y, m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const fromDate = tempFrom ? new Date(tempFrom) : null;
  const toDate = tempTo ? new Date(tempTo) : null;
  if (fromDate) fromDate.setHours(0, 0, 0, 0);
  if (toDate) toDate.setHours(0, 0, 0, 0);

  const dayStr = (d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const clickDay = (day: number) => {
    const clicked = new Date(y, m, day);
    const str = dayStr(day);
    if (mode === "from") {
      setTempFrom(str);
      if (toDate && clicked > toDate) setTempTo("");
      setMode("to");
    } else {
      // Cliccando una data precedente al "Da" i due estremi si scambiano,
      // invece di rifiutare il clic senza spiegazioni.
      if (fromDate && clicked < fromDate) { setTempTo(tempFrom); setTempFrom(str); }
      else setTempTo(str);
      setMode("from");
    }
  };

  const isFrom = (d: number) => !!fromDate && new Date(y, m, d).setHours(0,0,0,0) === fromDate.getTime();
  const isTo = (d: number) => !!toDate && new Date(y, m, d).setHours(0,0,0,0) === toDate.getTime();
  const inBetween = (d: number) => {
    if (!fromDate || !toDate) return false;
    const x = new Date(y, m, d); x.setHours(0, 0, 0, 0);
    return x > fromDate && x < toDate;
  };
  const isToday = (d: number) => new Date(y, m, d).setHours(0,0,0,0) === today.getTime();

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-[12px] font-semibold whitespace-nowrap transition-colors flex-shrink-0 ${
          active
            ? "bg-violet-50 border-violet-200 text-violet-700"
            : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
        } ${className}`}
      >
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="max-w-[130px] truncate">{label}</span>
        {active && (
          <span
            role="button"
            aria-label="Rimuovi filtro date"
            onClick={e => { e.stopPropagation(); onChange(EMPTY_RANGE); }}
            className="ml-0.5 w-4 h-4 rounded-md bg-violet-200 flex items-center justify-center flex-shrink-0"
          >
            <svg className="w-2.5 h-2.5 text-violet-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[10050] flex items-center justify-center px-5" style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="absolute inset-0" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-[360px] bg-white rounded-[20px] px-5 pt-5 pb-4 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[14px] font-bold text-slate-800">Seleziona periodo</span>
              <button onClick={() => setOpen(false)} className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors">
                <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => setMode("from")}
                className="flex-1 px-3 py-[8px] rounded-[10px] text-[11px] font-bold transition-all"
                style={{ background: mode === "from" ? "#6366f1" : "#f1f5f9", color: mode === "from" ? "#fff" : "#64748b" }}
              >
                Da: {fmtShort(tempFrom)}
              </button>
              <svg className="w-3 h-3 text-slate-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              <button
                onClick={() => setMode("to")}
                className="flex-1 px-3 py-[8px] rounded-[10px] text-[11px] font-bold transition-all"
                style={{ background: mode === "to" ? "#6366f1" : "#f1f5f9", color: mode === "to" ? "#fff" : "#64748b" }}
              >
                A: {fmtShort(tempTo)}
              </button>
            </div>

            <div className="flex items-center justify-between mb-2">
              <button onClick={() => setMonth(new Date(y, m - 1, 1))} className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-100 transition-colors">
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <span className="text-[13px] font-bold text-slate-800">{MONTH_NAMES[m]} {y}</span>
              <button onClick={() => setMonth(new Date(y, m + 1, 1))} className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-100 transition-colors">
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0 mb-1">
              {["Lu","Ma","Me","Gi","Ve","Sa","Do"].map(d => (
                <div key={d} className="text-center text-[9px] font-bold text-slate-400 uppercase py-1">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0 mb-4">
              {Array.from({ length: startDow }, (_, i) => <div key={`e-${i}`} className="h-[38px]" />)}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const f = isFrom(day), t = isTo(day), mid = inBetween(day), tod = isToday(day);
                return (
                  <button
                    key={day}
                    onClick={() => clickDay(day)}
                    className="h-[38px] flex items-center justify-center text-[12px] font-semibold transition-all relative"
                    style={{
                      background: f || t ? "#6366f1" : mid ? "rgba(99,102,241,0.08)" : "transparent",
                      color: f || t ? "#fff" : mid ? "#6366f1" : tod ? "#6366f1" : "#334155",
                      borderRadius: f && t ? "8px" : f ? "8px 0 0 8px" : t ? "0 8px 8px 0" : "0",
                    }}
                  >
                    {tod && !f && !t && <div className="absolute bottom-[3px] left-1/2 -translate-x-1/2 w-[4px] h-[4px] rounded-full bg-violet-500" />}
                    {day}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              {(tempFrom || tempTo) && (
                <button
                  onClick={() => { setTempFrom(""); setTempTo(""); setMode("from"); onChange(EMPTY_RANGE); setOpen(false); }}
                  className="flex-1 flex items-center justify-center gap-1 py-[10px] rounded-[10px] bg-slate-100 hover:bg-slate-200 text-[11px] font-bold text-slate-500 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  Reset
                </button>
              )}
              <button
                onClick={() => { onChange({ from: tempFrom, to: tempTo }); setOpen(false); }}
                className="flex-1 flex items-center justify-center gap-1 py-[10px] rounded-[10px] text-[11px] font-bold text-white transition-colors"
                style={{ background: tempFrom ? "#6366f1" : "#94a3b8" }}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                Conferma
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════
// CONSERVAZIONE — deve combaciare con cleanup-notifications
// ══════════════════════════════════════════════════════════════════
//
// Le notifiche lette vengono cancellate da un cron giornaliero dopo
// RETENTION_READ_DAYS. Cercare più indietro non dà errore: semplicemente
// non trova nulla, perché quei documenti non esistono più.
// Senza avviso sembrerebbe un difetto della ricerca.
//
// ⚠️ Se cambi il valore nel cron, cambialo anche qui.
export const NOTIFICATION_RETENTION_DAYS = 90;

/** La data scelta è oltre il limite di conservazione delle notifiche? */
export function isBeyondRetention(from: string, retentionDays = NOTIFICATION_RETENTION_DAYS): boolean {
  if (!from) return false;
  const limit = new Date();
  limit.setDate(limit.getDate() - retentionDays);
  limit.setHours(0, 0, 0, 0);
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  return d < limit;
}
