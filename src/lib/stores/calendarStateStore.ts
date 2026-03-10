/**
 * CalendarStateStore — cache globale per stato calendari
 * 
 * Mantiene il mese selezionato e la posizione di scroll
 * tra navigazioni. Quando torni su un calendario, lo trovi
 * esattamente come lo avevi lasciato — zero flash.
 */

interface CalendarState {
  /** Mese correntemente visualizzato */
  currentDate: Date;
  /** Posizione scroll orizzontale */
  scrollLeft: number;
}

// Cache per ogni calendario (chiave = identificatore pagina)
const cache: Record<string, CalendarState> = {};

export function getCalendarState(key: string): CalendarState {
  if (!cache[key]) {
    // Default: mese corrente, scroll 0 (verrà calcolato al primo render)
    cache[key] = {
      currentDate: new Date(),
      scrollLeft: -1, // -1 = mai impostato, calcola auto-scroll
    };
  }
  return cache[key];
}

export function setCalendarDate(key: string, date: Date): void {
  if (!cache[key]) {
    cache[key] = { currentDate: date, scrollLeft: -1 };
  } else {
    cache[key].currentDate = date;
    cache[key].scrollLeft = -1; // Reset scroll quando si cambia mese
  }
}

export function setCalendarScroll(key: string, scrollLeft: number): void {
  if (!cache[key]) {
    cache[key] = { currentDate: new Date(), scrollLeft };
  } else {
    cache[key].scrollLeft = scrollLeft;
  }
}
