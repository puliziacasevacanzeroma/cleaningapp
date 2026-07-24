/**
 * checkInClipGuard — FONTE DI VERITÀ per la protezione del check-in nei sync iCal.
 *
 * PROBLEMA (documentato con i backup del 21-24/07/2026, booking Poerio 2B SINISTRA):
 * il feed iCal di Booking rigenera ogni notte i blocchi "in corso" con UID nuovo e
 * DTSTART ritagliato a OGGI (i giorni già trascorsi vengono rimossi dal feed).
 * La vecchia guardia confrontava con la mezzanotte UTC: alle 00:01 italiane
 * (22:01 UTC) un check-in di "oggi a mezzogiorno" non risultava ancora "nel
 * passato" → la protezione non scattava e il check-in scivolava avanti di un
 * giorno a notte, cancellando la storia (e i checkout) dal calendario.
 *
 * SOLUZIONE:
 * - Il "giorno corrente" si calcola in Europe/Rome (DST-correct via Intl).
 * - FIRMA STRETTA del taglio quotidiano: check-in in DB nel passato E inizio
 *   del feed che cade OGGI (o prima) → si preserva la storia.
 * - Inizio del feed DOPO oggi con check-in nel passato = giorni realmente
 *   liberati (partenza anticipata / cancellazione a metà soggiorno):
 *   si aggiorna normalmente e si segnala (freedDays=true → alert admin).
 * - Tutto il resto (sorgenti non-booking, check-in futuri, feed che anticipa)
 *   → aggiornamento normale, nessuna interferenza.
 *
 * Modulo PURO: zero dipendenze firebase/react/next. `now` iniettabile per i test.
 */

export interface ClipGuardInput {
  source: string;               // 'booking' | 'airbnb' | ...
  existingCheckIn: Date | null; // check-in attuale in DB (null se assente)
  feedStart: Date;              // DTSTART dell'evento nel feed
  now?: Date;                   // iniettabile nei test; default: adesso
}

export interface ClipGuardResult {
  effectiveStart: Date; // valore da scrivere come checkIn
  kept: boolean;        // true = storia preservata (taglio quotidiano riconosciuto)
  freedDays: boolean;   // true = giorni liberati su date odierne/future → alert
  todayRome: string;    // YYYY-MM-DD del giorno corrente a Roma (per log/debug)
}

// en-CA → formato YYYY-MM-DD; timeZone Europe/Rome gestisce il DST correttamente.
const romeDayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Giorno di calendario (YYYY-MM-DD) di una data, visto dall'Italia. */
export function dayRome(d: Date): string {
  return romeDayFmt.format(d);
}

export function resolveEffectiveCheckIn(inp: ClipGuardInput): ClipGuardResult {
  const now = inp.now ?? new Date();
  const todayRome = dayRome(now);
  const base: Omit<ClipGuardResult, "effectiveStart" | "kept" | "freedDays"> = { todayRome };

  const ci = inp.existingCheckIn;

  // Guardia applicabile solo a Booking, con check-in esistente e feed che SPOSTA
  // AVANTI l'inizio. Feed che anticipa (dtstart < ci) resta gestito a valle
  // (caso LEFT_MERGE già esistente nel cron).
  if (inp.source !== "booking" || !ci || ci.getTime() >= inp.feedStart.getTime()) {
    return { ...base, effectiveStart: inp.feedStart, kept: false, freedDays: false };
  }

  const ciDay = dayRome(ci);
  const feedDay = dayRome(inp.feedStart);
  // Stringhe ISO YYYY-MM-DD: il confronto lessicografico coincide con quello cronologico.
  const ciInPast = ciDay < todayRome;

  if (!ciInPast) {
    // Check-in oggi o futuro: qualsiasi spostamento è una modifica reale.
    return { ...base, effectiveStart: inp.feedStart, kept: false, freedDays: false };
  }

  if (feedDay <= todayRome) {
    // Firma del taglio quotidiano Booking: inizio feed = oggi (o ancora nel
    // passato). I giorni rimossi sono già trascorsi → la storia resta.
    return { ...base, effectiveStart: ci, kept: true, freedDays: false };
  }

  // Inizio feed DOPO oggi con check-in passato: giorni tra oggi e il nuovo
  // inizio realmente liberati → aggiorna e segnala.
  return { ...base, effectiveStart: inp.feedStart, kept: false, freedDays: true };
}
