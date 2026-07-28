/**
 * 📅 DATE UTILS - Gestione date con TIMEZONE ITALIANA FISSA
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * IMPORTANTE: Questo modulo usa SEMPRE il fuso orario italiano (Europe/Rome)
 * indipendentemente da dove si trova il browser dell'utente.
 * 
 * Se un utente accede dall'America o dall'Asia, vedrà comunque le date
 * secondo l'ora italiana.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Timestamp } from 'firebase/firestore';

// ═══════════════════════════════════════════════════════════════════════════
// COSTANTI
// ═══════════════════════════════════════════════════════════════════════════

/** Timezone Italia - SEMPRE USATO per tutti i calcoli */
export const TIMEZONE = 'Europe/Rome';

/** Locale Italia per formattazione */
export const LOCALE = 'it-IT';

/** Ora sicura per salvare le date (mezzogiorno evita problemi DST) */
export const SAFE_HOUR = 12;

// ═══════════════════════════════════════════════════════════════════════════
// FUNZIONI BASE: Ora italiana
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 🇮🇹 Ottiene la data/ora corrente in ITALIA
 * 
 * Questa è la funzione fondamentale: restituisce sempre l'ora italiana,
 * anche se il browser è in un altro fuso orario.
 * 
 * @returns Oggetto con anno, mese, giorno, ore, minuti, secondi in ora ITALIANA
 */
export function getItalianNow(): {
  year: number;
  month: number;  // 1-12
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
  dayOfWeek: number;  // 0=Domenica, 1=Lunedì, ...
} {
  const now = new Date();
  
  // Formatta in italiano per estrarre i componenti
  const formatter = new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  const parts = formatter.formatToParts(now);
  const getPart = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);
  
  // Calcola il giorno della settimana in Italia
  const weekdayFormatter = new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIMEZONE,
    weekday: 'short',
  });
  const weekdayStr = weekdayFormatter.format(now);
  const weekdays = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
  const dayOfWeek = weekdays.findIndex(d => weekdayStr.toLowerCase().startsWith(d));
  
  return {
    year: getPart('year'),
    month: getPart('month'),
    day: getPart('day'),
    hours: getPart('hour'),
    minutes: getPart('minute'),
    seconds: getPart('second'),
    dayOfWeek: dayOfWeek >= 0 ? dayOfWeek : 0,
  };
}

/**
 * 🇮🇹 Ottiene la data di OGGI in Italia come stringa "YYYY-MM-DD"
 * 
 * QUESTA È LA FUNZIONE PRINCIPALE per sapere che giorno è in Italia.
 */
export function getTodayString(): string {
  const it = getItalianNow();
  return `${it.year}-${String(it.month).padStart(2, '0')}-${String(it.day).padStart(2, '0')}`;
}

/**
 * 🇮🇹 Ottiene l'ora corrente in Italia come stringa "HH:MM"
 */
export function getItalianTime(): string {
  const it = getItalianNow();
  return `${String(it.hours).padStart(2, '0')}:${String(it.minutes).padStart(2, '0')}`;
}

/**
 * 🇮🇹 Converte una Date UTC in componenti data ITALIANA
 */
export function toItalianDate(date: Date): {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
} {
  const formatter = new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  
  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);
  
  return {
    year: getPart('year'),
    month: getPart('month'),
    day: getPart('day'),
    hours: getPart('hour'),
    minutes: getPart('minute'),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVERSIONE: QUALSIASI FORMATO → Date
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 🔄 Converte QUALSIASI formato data in un oggetto Date
 * 
 * Gestisce TUTTI i formati possibili:
 * - Date object
 * - Firebase Timestamp (con .toDate())
 * - Oggetto serializzato { seconds, nanoseconds } (da localStorage/JSON cache)
 * - Stringa ISO "2026-02-01T12:00:00.000Z"
 * - Stringa data "2026-02-01"
 * - Stringa data italiana "01/02/2026"
 * - Timestamp unix in millisecondi o secondi
 * 
 * @param value - Qualsiasi valore che rappresenta una data
 * @returns Date object o null se non valido
 */
export function toDate(value: any): Date | null {
  if (!value) return null;
  
  // 1. Già una Date valida
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  
  // 2. Firebase Timestamp (ha metodo toDate)
  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    try {
      const d = value.toDate();
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }
  
  // 3. Oggetto serializzato { seconds, nanoseconds } (da localStorage/cache Firebase)
  if (typeof value === 'object' && value !== null && 'seconds' in value && typeof value.seconds === 'number') {
    const d = new Date(value.seconds * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  
  // 4. Stringa
  if (typeof value === 'string') {
    const trimmed = value.trim();
    
    // 4a. Stringa solo data "YYYY-MM-DD" → crea data a mezzogiorno per evitare problemi
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [year, month, day] = trimmed.split('-').map(Number);
      // Crea data con ore 12:00 per evitare problemi di timezone
      const d = new Date(Date.UTC(year, month - 1, day, 11, 0, 0, 0)); // 11 UTC ≈ 12 Italia
      return isNaN(d.getTime()) ? null : d;
    }
    
    // 4b. Stringa italiana "DD/MM/YYYY"
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
      const [day, month, year] = trimmed.split('/').map(Number);
      const d = new Date(Date.UTC(year, month - 1, day, 11, 0, 0, 0));
      return isNaN(d.getTime()) ? null : d;
    }
    
    // 4c. Stringa ISO o altro formato standard
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }
  
  // 5. Numero (timestamp unix)
  if (typeof value === 'number') {
    // Se il numero è piccolo (< 10 miliardi), probabilmente sono secondi
    const ms = value < 10000000000 ? value * 1000 : value;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// STRINGHE DATA: Date → "YYYY-MM-DD" (in ora ITALIANA)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 📅 Converte una Date in stringa "YYYY-MM-DD" usando ORA ITALIANA
 * 
 * IMPORTANTE: Questa funzione converte SEMPRE secondo il fuso orario italiano,
 * quindi una data UTC delle 23:30 del 31 gennaio diventerà "2026-02-01" 
 * se in Italia è già l'1 febbraio.
 * 
 * @param date - Date object (o null/undefined)
 * @returns Stringa "YYYY-MM-DD" in ora italiana, o stringa vuota se non valido
 */
export function getDateString(date: Date | null | undefined): string {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return '';
  
  const it = toItalianDate(date);
  return `${it.year}-${String(it.month).padStart(2, '0')}-${String(it.day).padStart(2, '0')}`;
}

/**
 * 📅 Converte QUALSIASI valore in stringa "YYYY-MM-DD" (ora italiana)
 * Combina toDate() + getDateString() per comodità
 */
export function toDateString(value: any): string {
  return getDateString(toDate(value));
}

/**
 * 📅 Ottiene la data corrente come Date object
 * NOTA: Questo è il Date UTC, per la data italiana usa getTodayString()
 */
export function getNow(): Date {
  return new Date();
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFRONTI TRA DATE (usando ora ITALIANA)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ✅ Verifica se un valore rappresenta la data di OGGI in ITALIA
 * 
 * @example
 * // Anche se il browser è in USA, questo controlla se è oggi in ITALIA
 * if (isToday(order.scheduledDate)) { ... }
 */
export function isToday(value: any): boolean {
  const dateStr = toDateString(value);
  if (!dateStr) return false;
  return dateStr === getTodayString();
}

/**
 * ✅ Verifica se un valore rappresenta una data FUTURA rispetto all'Italia
 */
export function isFuture(value: any): boolean {
  const dateStr = toDateString(value);
  if (!dateStr) return false;
  return dateStr > getTodayString();
}

/**
 * ✅ Verifica se un valore rappresenta una data PASSATA rispetto all'Italia
 */
export function isPast(value: any): boolean {
  const dateStr = toDateString(value);
  if (!dateStr) return false;
  return dateStr < getTodayString();
}

/**
 * ✅ Verifica se un valore è OGGI o nel FUTURO (Italia)
 */
export function isTodayOrFuture(value: any): boolean {
  const dateStr = toDateString(value);
  if (!dateStr) return false;
  return dateStr >= getTodayString();
}

/**
 * ✅ Verifica se un valore è OGGI o nel PASSATO (Italia)
 */
export function isTodayOrPast(value: any): boolean {
  const dateStr = toDateString(value);
  if (!dateStr) return false;
  return dateStr <= getTodayString();
}

/**
 * ✅ Verifica se due valori rappresentano lo STESSO GIORNO (in ora italiana)
 */
export function isSameDay(value1: any, value2: any): boolean {
  const str1 = toDateString(value1);
  const str2 = toDateString(value2);
  if (!str1 || !str2) return false;
  return str1 === str2;
}

/**
 * 🔢 Confronta due date
 * @returns -1 se value1 < value2, 0 se uguali, 1 se value1 > value2
 */
export function compareDates(value1: any, value2: any): number {
  const str1 = toDateString(value1);
  const str2 = toDateString(value2);
  
  if (!str1 && !str2) return 0;
  if (!str1) return -1;
  if (!str2) return 1;
  
  if (str1 < str2) return -1;
  if (str1 > str2) return 1;
  return 0;
}

/**
 * 📊 Calcola la differenza in giorni tra due date
 * @returns Numero di giorni (positivo se value2 > value1)
 */
export function daysBetween(value1: any, value2: any): number {
  const str1 = toDateString(value1);
  const str2 = toDateString(value2);
  if (!str1 || !str2) return 0;
  
  // Converti le stringhe in Date per calcolare la differenza
  const d1 = new Date(str1 + 'T12:00:00');
  const d2 = new Date(str2 + 'T12:00:00');
  
  const ms = d2.getTime() - d1.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/**
 * 📊 Verifica se una data è entro N giorni da oggi (Italia)
 */
export function isWithinDays(value: any, days: number): boolean {
  const diff = daysBetween(getTodayString(), value);
  return diff >= 0 && diff <= days;
}

// ═══════════════════════════════════════════════════════════════════════════
// CREAZIONE DATE SICURE (per Firebase)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 🔥 Crea una Date SICURA con ore a MEZZOGIORNO
 * 
 * @param year - Anno (es: 2026)
 * @param month - Mese (1-12, NON 0-11!)
 * @param day - Giorno (1-31)
 * @returns Date object con ore impostate a mezzogiorno
 */
export function createSafeDate(year: number, month: number, day: number): Date {
  // Crea a mezzogiorno UTC (che sarà circa 13:00 in Italia)
  return new Date(Date.UTC(year, month - 1, day, 11, 0, 0, 0));
}

/**
 * 🔥 Crea un Timestamp Firebase SICURO da componenti data
 */
export function createSafeTimestamp(year: number, month: number, day: number): Timestamp {
  return Timestamp.fromDate(createSafeDate(year, month, day));
}

/**
 * 🔥 Crea un Timestamp Firebase SICURO da una stringa "YYYY-MM-DD"
 */
export function createTimestampFromString(dateStr: string): Timestamp | null {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  
  const [year, month, day] = dateStr.split('-').map(Number);
  return createSafeTimestamp(year, month, day);
}

/**
 * 🔥 Crea un Timestamp Firebase SICURO dalla data di oggi in ITALIA
 */
export function createTodayTimestamp(): Timestamp {
  const it = getItalianNow();
  return createSafeTimestamp(it.year, it.month, it.day);
}

/**
 * 🔥 Normalizza una Date esistente impostando l'ora a mezzogiorno
 */
export function normalizeForFirebase(value: any): Date | null {
  const dateStr = toDateString(value);
  if (!dateStr) return null;
  
  const [year, month, day] = dateStr.split('-').map(Number);
  return createSafeDate(year, month, day);
}

// ═══════════════════════════════════════════════════════════════════════════
// NAVIGAZIONE DATE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ➕ Aggiunge giorni a una data (restituisce stringa YYYY-MM-DD)
 */
export function addDays(value: any, days: number): string {
  const dateStr = toDateString(value);
  if (!dateStr) return '';
  
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * ➖ Sottrae giorni da una data
 */
export function subtractDays(value: any, days: number): string {
  return addDays(value, -days);
}

/**
 * 🕛 Calcola i millisecondi fino alla mezzanotte ITALIANA
 */
export function getMillisecondsUntilMidnight(): number {
  const it = getItalianNow();
  
  // Secondi rimanenti fino a mezzanotte italiana
  const secondsRemaining = 
    (23 - it.hours) * 3600 + 
    (59 - it.minutes) * 60 + 
    (60 - it.seconds);
  
  return secondsRemaining * 1000;
}

// ═══════════════════════════════════════════════════════════════════════════
// FORMATTAZIONE PER VISUALIZZAZIONE (sempre in italiano)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 🇮🇹 Formatta una data in italiano
 */
export function formatDate(
  value: any,
  options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }
): string {
  const d = toDate(value);
  if (!d) return '';
  
  // Usa sempre timezone italiana per la formattazione
  return d.toLocaleDateString(LOCALE, {
    ...options,
    timeZone: TIMEZONE,
  });
}

/**
 * 🇮🇹 Formato breve: "1 feb 2026"
 */
export function formatDateShort(value: any): string {
  return formatDate(value, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * 🇮🇹 Con giorno settimana: "sabato 1 febbraio"
 */
export function formatDateWithWeekday(value: any): string {
  return formatDate(value, { weekday: 'long', day: 'numeric', month: 'long' });
}

/**
 * 🇮🇹 Solo giorno e mese: "1 febbraio"
 */
export function formatDayMonth(value: any): string {
  return formatDate(value, { day: 'numeric', month: 'long' });
}

/**
 * 🕐 Formatta l'orario in ora ITALIANA: "10:00"
 */
export function formatTime(value: any): string {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleTimeString(LOCALE, { 
    hour: '2-digit', 
    minute: '2-digit',
    timeZone: TIMEZONE,
  });
}

/**
 * 📅 Formatta data e ora: "1 feb 2026, 10:00"
 */
export function formatDateTime(value: any): string {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleString(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIMEZONE,
  });
}

/**
 * 📅 Formatta in modo relativo: "Oggi", "Domani", "Ieri", o data normale
 */
export function formatRelative(value: any): string {
  const dateStr = toDateString(value);
  if (!dateStr) return '';
  
  const today = getTodayString();
  const tomorrow = addDays(today, 1);
  const yesterday = addDays(today, -1);
  
  if (dateStr === today) return 'Oggi';
  if (dateStr === tomorrow) return 'Domani';
  if (dateStr === yesterday) return 'Ieri';
  
  return formatDateShort(value);
}

// ═══════════════════════════════════════════════════════════════════════════
// DEBUG E DIAGNOSTICA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 🔍 Analizza un valore data e logga info di debug
 */
export function debugDate(value: any, label: string = 'date'): void {
  const converted = toDate(value);
  const italianNow = getItalianNow();
  
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT DEFAULT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⏰ DEADLINE MODIFICHE — "entro le 20:00 del giorno prima della pulizia"
 *
 * Regola UNICA e condivisa per tutte le modifiche che un cliente/proprietario
 * può fare in autonomia su una pulizia (cambio ospiti, cancellazione turnover,
 * ecc.). Oltre questa soglia le modifiche self-service sono chiuse: la logistica
 * (assegnazioni operatori, ordini biancheria) è già stata pianificata e un
 * cambio last-minute causa errori non recuperabili (operatore a vuoto o, peggio,
 * casa non pulita).
 *
 * Calcolata in fuso orario italiano (Europe/Rome) via getItalianNow(), quindi
 * indipendente dal fuso del browser.
 *
 * @param cleaningDate data della pulizia (Date | Timestamp | stringa)
 * @returns oggetto con: isPast (soglia superata?), deadline (Date della soglia),
 *          e helper di formattazione per i messaggi.
 */
export function getModificationDeadline(cleaningDate: any): {
  isPast: boolean;
  deadline: Date | null;
  deadlineLabel: string; // es. "19/10/2026 alle 20:00"
} {
  const cd = toDate(cleaningDate);
  if (!cd) return { isPast: false, deadline: null, deadlineLabel: "" };

  // Deadline = giorno-prima della pulizia, ore 20:00 (ora italiana)
  const deadline = new Date(cd);
  deadline.setDate(deadline.getDate() - 1);
  deadline.setHours(20, 0, 0, 0);

  // "adesso" in ora italiana, ricostruito come Date confrontabile
  const it = getItalianNow();
  const nowItalian = new Date(it.year, it.month - 1, it.day, it.hours, it.minutes, it.seconds);

  const isPast = nowItalian.getTime() >= deadline.getTime();

  const dd = String(deadline.getDate()).padStart(2, "0");
  const mm = String(deadline.getMonth() + 1).padStart(2, "0");
  const yyyy = deadline.getFullYear();
  const deadlineLabel = `${dd}/${mm}/${yyyy} alle 20:00`;

  return { isPast, deadline, deadlineLabel };
}

/**
 * Scorciatoia booleana: true se la deadline "entro le 20:00 del giorno prima"
 * è già passata per la pulizia data.
 */
export function isPastModificationDeadline(cleaningDate: any): boolean {
  return getModificationDeadline(cleaningDate).isPast;
}

const dateUtils = {
  // Costanti
  TIMEZONE,
  LOCALE,
  SAFE_HOUR,
  
  // Ora italiana
  getItalianNow,
  getItalianTime,
  toItalianDate,
  
  // Conversione
  toDate,
  getDateString,
  toDateString,
  getTodayString,
  getNow,
  
  // Confronti
  isToday,
  isFuture,
  isPast,
  isTodayOrFuture,
  isTodayOrPast,
  isSameDay,
  compareDates,
  daysBetween,
  isWithinDays,
  
  // Creazione per Firebase
  createSafeDate,
  createSafeTimestamp,
  createTimestampFromString,
  createTodayTimestamp,
  normalizeForFirebase,
  
  // Navigazione
  addDays,
  subtractDays,
  getMillisecondsUntilMidnight,

  // Deadline modifiche (entro le 20 del giorno prima)
  getModificationDeadline,
  isPastModificationDeadline,
  
  // Formattazione
  formatDate,
  formatDateShort,
  formatDateWithWeekday,
  formatDayMonth,
  formatTime,
  formatDateTime,
  formatRelative,
  
  // Debug
  debugDate,
};

export default dateUtils;
