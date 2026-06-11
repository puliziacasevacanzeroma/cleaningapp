/**
 * availability.ts — MODULO PURO per la disponibilità pianificata (turni).
 *
 * Zero dipendenze (no firebase, no react): stessa filosofia di linenCore.ts.
 * Usato IDENTICO da client (pagine UI) e server (route assign) così la
 * logica di "è in turno quel giorno?" ha una sola fonte di verità.
 *
 * MODELLO DATI
 * ────────────
 * 1. Template settimanale ricorrente: `users/{id}.workSchedule`
 *    { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false }
 *    - Se `workSchedule` è ASSENTE/undefined → l'utente è SEMPRE disponibile
 *      (default sicuro: al lancio della feature nulla si blocca).
 *    - Se il template esiste ma manca una chiave giorno → quel giorno è
 *      considerato DISPONIBILE (mai bloccare per dato parziale).
 *      NOTA: la UI scrive sempre tutte e 7 le chiavi, questo è solo un guardrail.
 *
 * 2. Eccezioni puntuali: collection `shiftExceptions`, doc ID = `${userId}_${dateKey}`
 *    { userId, dateKey: "YYYY-MM-DD", type: "ON" | "OFF", reason?, createdBy, createdByName, createdAt }
 *    - "OFF" = assenza/ferie quel giorno (vince sul template)
 *    - "ON"  = turno extra / chiamata d'urgenza (vince sul template)
 *    - Max UNA eccezione per (utente, giorno): garantito dal doc ID deterministico.
 *
 * PRECEDENZA: eccezione > template > default (disponibile).
 */

// ════════════════════════════════════════════════════════════════
// TIPI
// ════════════════════════════════════════════════════════════════

export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type WorkSchedule = Partial<Record<WeekdayKey, boolean>>;

export type ShiftExceptionType = "ON" | "OFF";

export interface ShiftException {
  userId: string;
  dateKey: string; // YYYY-MM-DD (Europe/Rome)
  type: ShiftExceptionType;
  reason?: string | null;
  createdBy?: string;
  createdByName?: string;
}

export type AvailabilitySource =
  | "default" // nessun template configurato → disponibile
  | "template_on" // il template dice che lavora
  | "template_off" // il template dice che NON lavora
  | "exception_on" // turno extra / urgenza
  | "exception_off"; // assenza/ferie

export interface AvailabilityResult {
  available: boolean;
  source: AvailabilitySource;
}

// ════════════════════════════════════════════════════════════════
// COSTANTI
// ════════════════════════════════════════════════════════════════

/** Ordine ISO: lunedì → domenica (come si mostra la settimana in Italia). */
export const WEEKDAY_KEYS: WeekdayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export const WEEKDAY_LABELS_IT: Record<WeekdayKey, string> = {
  mon: "Lun",
  tue: "Mar",
  wed: "Mer",
  thu: "Gio",
  fri: "Ven",
  sat: "Sab",
  sun: "Dom",
};

export const WEEKDAY_LABELS_FULL_IT: Record<WeekdayKey, string> = {
  mon: "Lunedì",
  tue: "Martedì",
  wed: "Mercoledì",
  thu: "Giovedì",
  fri: "Venerdì",
  sat: "Sabato",
  sun: "Domenica",
};

/** Template di default proposto dalla UI quando si configura un utente per la prima volta. */
export const DEFAULT_FULL_SCHEDULE: Required<WorkSchedule> = {
  mon: true,
  tue: true,
  wed: true,
  thu: true,
  fri: true,
  sat: true,
  sun: true,
};

// ════════════════════════════════════════════════════════════════
// FUNZIONI
// ════════════════════════════════════════════════════════════════

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Valida il formato YYYY-MM-DD (non valida il calendario, solo la forma). */
export function isValidDateKey(dateKey: string): boolean {
  if (!DATE_KEY_RE.test(dateKey)) return false;
  const d = new Date(dateKey + "T12:00:00Z");
  return !isNaN(d.getTime());
}

/**
 * Da "YYYY-MM-DD" → chiave del giorno della settimana.
 * Parse a MEZZOGIORNO UTC: il giorno della settimana di una data-chiave è
 * indipendente dal fuso, e il mezzogiorno evita qualunque slittamento.
 */
export function weekdayKeyFromDateKey(dateKey: string): WeekdayKey {
  const d = new Date(dateKey + "T12:00:00Z");
  const jsDay = d.getUTCDay(); // 0=dom, 1=lun, ... 6=sab
  const map: WeekdayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return map[jsDay]!;
}

/**
 * Disponibilità secondo SOLO il template (senza eccezioni).
 * - schedule assente → true (default sicuro)
 * - chiave giorno assente nel template → true (guardrail anti-blocco)
 */
export function templateAvailability(
  schedule: WorkSchedule | null | undefined,
  dateKey: string
): { available: boolean; source: AvailabilitySource } {
  if (!schedule || typeof schedule !== "object" || Object.keys(schedule).length === 0) {
    return { available: true, source: "default" };
  }
  const dayKey = weekdayKeyFromDateKey(dateKey);
  const val = schedule[dayKey];
  if (val === undefined || val === null) {
    return { available: true, source: "default" };
  }
  return val
    ? { available: true, source: "template_on" }
    : { available: false, source: "template_off" };
}

/**
 * Disponibilità RISOLTA: eccezione (se presente) vince sul template.
 * @param exceptionType tipo dell'eccezione per (utente, dateKey), o null se non esiste.
 */
export function resolveAvailability(
  schedule: WorkSchedule | null | undefined,
  exceptionType: ShiftExceptionType | null | undefined,
  dateKey: string
): AvailabilityResult {
  if (exceptionType === "ON") return { available: true, source: "exception_on" };
  if (exceptionType === "OFF") return { available: false, source: "exception_off" };
  return templateAvailability(schedule, dateKey);
}

/** Doc ID deterministico per l'eccezione: max una per (utente, giorno). */
export function exceptionDocId(userId: string, dateKey: string): string {
  return `${userId}_${dateKey}`;
}

/**
 * Sanifica un oggetto schedule arbitrario (input API): tiene solo le 7 chiavi
 * note, forza boolean. Ritorna sempre tutte e 7 le chiavi.
 * @param fallback valore per le chiavi mancanti (default true = disponibile)
 */
export function sanitizeSchedule(raw: unknown, fallback = true): Required<WorkSchedule> {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = {} as Required<WorkSchedule>;
  for (const k of WEEKDAY_KEYS) {
    const v = src[k];
    out[k] = typeof v === "boolean" ? v : fallback;
  }
  return out;
}

/**
 * Etichetta leggibile della sorgente (per UI/messaggi).
 */
export function sourceLabelIt(source: AvailabilitySource): string {
  switch (source) {
    case "default":
      return "Disponibile (nessun turno configurato)";
    case "template_on":
      return "In turno (orario settimanale)";
    case "template_off":
      return "Non in turno (orario settimanale)";
    case "exception_on":
      return "Turno extra / urgenza";
    case "exception_off":
      return "Assenza";
  }
}
