/**
 * 📅 useToday - Hook React per gestione data corrente ITALIANA
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * IMPORTANTE: Questo hook usa SEMPRE il fuso orario italiano (Europe/Rome)
 * 
 * - Si aggiorna automaticamente a MEZZANOTTE ITALIANA
 * - Anche se l'utente è in USA/Asia, vede l'ora italiana
 * - Gestisce focus/visibility della finestra
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  getTodayString, 
  getMillisecondsUntilMidnight, 
  getDateString, 
  toDate,
  isSameDay as utilIsSameDay,
  getItalianNow,
  getItalianTime,
} from '~/lib/dateUtils';

// ═══════════════════════════════════════════════════════════════════════════
// HOOK PRINCIPALE: useToday
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 🇮🇹 Hook principale: restituisce la data di oggi IN ITALIA come "YYYY-MM-DD"
 * 
 * Si aggiorna automaticamente a mezzanotte ITALIANA, anche se il browser
 * è in un altro fuso orario.
 * 
 * @returns Stringa "YYYY-MM-DD" che rappresenta oggi in Italia
 */
export function useToday(): string {
  const [today, setToday] = useState<string>(() => getTodayString());
  const lastCheckRef = useRef<number>(Date.now());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Funzione per verificare e aggiornare se necessario
  const checkAndUpdate = useCallback(() => {
    const currentToday = getTodayString();
    if (today !== currentToday) {
      const italianNow = getItalianNow();
      if (process.env.NODE_ENV !== "production") console.log(`🇮🇹 [useToday] Cambio giorno in Italia: ${today} → ${currentToday} (ora italiana: ${italianNow.hours}:${italianNow.minutes})`);
      setToday(currentToday);
      return true;
    }
    return false;
  }, [today]);

  useEffect(() => {
    // 1. Verifica immediata (per gestire mount dopo mezzanotte con stato stale)
    checkAndUpdate();

    // 2. Schedula il prossimo aggiornamento a mezzanotte ITALIANA
    const scheduleMidnight = () => {
      // Cancella timeout precedente se esiste
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      // Millisecondi fino a mezzanotte ITALIANA
      const msUntilMidnight = getMillisecondsUntilMidnight();
      
      // Se siamo molto vicini a mezzanotte (< 2 minuti), controlla più frequentemente
      const waitTime = msUntilMidnight < 2 * 60 * 1000 
        ? Math.min(msUntilMidnight + 1000, 30000)  // Max 30 secondi
        : msUntilMidnight + 1000;  // +1 secondo per sicurezza
      
      const italianTime = getItalianTime();
      if (process.env.NODE_ENV !== "production") console.log(`🇮🇹 [useToday] Ora italiana: ${italianTime} - Prossimo check in ${Math.round(waitTime / 1000)}s (mezzanotte italiana in ${Math.round(msUntilMidnight / 1000)}s)`);
      
      timeoutRef.current = setTimeout(() => {
        const changed = checkAndUpdate();
        // Rischedula sempre, sia che sia cambiato o no
        scheduleMidnight();
      }, waitTime);
    };
    
    scheduleMidnight();

    // 3. Listener per quando la finestra torna visibile
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        // Evita check troppo frequenti (minimo 5 secondi tra un check e l'altro)
        if (now - lastCheckRef.current > 5000) {
          lastCheckRef.current = now;
          if (process.env.NODE_ENV !== "production") console.log(`🇮🇹 [useToday] Tab tornato visibile, verifico data italiana...`);
          if (checkAndUpdate()) {
            // Se è cambiato, rischedula il timer
            scheduleMidnight();
          }
        }
      }
    };

    // 4. Listener per quando la finestra ottiene focus
    const handleFocus = () => {
      const now = Date.now();
      if (now - lastCheckRef.current > 5000) {
        lastCheckRef.current = now;
        if (process.env.NODE_ENV !== "production") console.log(`🇮🇹 [useToday] Finestra in focus, verifico data italiana...`);
        if (checkAndUpdate()) {
          scheduleMidnight();
        }
      }
    };

    // 5. Listener per quando il browser torna online (utile per PWA)
    const handleOnline = () => {
      if (process.env.NODE_ENV !== "production") console.log(`🇮🇹 [useToday] Browser online, verifico data italiana...`);
      if (checkAndUpdate()) {
        scheduleMidnight();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
    };
  }, [checkAndUpdate]);

  return today;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK TRIGGER: useMidnightTrigger
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 🔄 Hook che forza un re-render completo a mezzanotte ITALIANA
 * 
 * Restituisce un "trigger" (numero) che cambia a ogni cambio di giorno.
 * Utile come dipendenza in useMemo/useCallback per forzare ricalcolo a mezzanotte.
 * 
 * @returns Numero che incrementa a ogni cambio di giorno in Italia
 */
export function useMidnightTrigger(): number {
  const [trigger, setTrigger] = useState<number>(0);
  const today = useToday();

  useEffect(() => {
    // Incrementa trigger quando today cambia
    setTrigger(t => t + 1);
  }, [today]);

  return trigger;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK CONFRONTI: useDateComparison
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 📅 Hook per ottenere funzioni di confronto date REATTIVE (basate su ora italiana)
 * 
 * Queste funzioni si aggiornano automaticamente a mezzanotte italiana.
 */
export function useDateComparison() {
  const todayString = useToday();

  const isToday = useCallback((value: any): boolean => {
    const d = toDate(value);
    if (!d) return false;
    return getDateString(d) === todayString;
  }, [todayString]);

  const isFuture = useCallback((value: any): boolean => {
    const d = toDate(value);
    if (!d) return false;
    return getDateString(d) > todayString;
  }, [todayString]);

  const isPast = useCallback((value: any): boolean => {
    const d = toDate(value);
    if (!d) return false;
    return getDateString(d) < todayString;
  }, [todayString]);

  const isTodayOrFuture = useCallback((value: any): boolean => {
    const d = toDate(value);
    if (!d) return false;
    return getDateString(d) >= todayString;
  }, [todayString]);

  const isTodayOrPast = useCallback((value: any): boolean => {
    const d = toDate(value);
    if (!d) return false;
    return getDateString(d) <= todayString;
  }, [todayString]);

  const isSameDay = useCallback((value1: any, value2: any): boolean => {
    return utilIsSameDay(value1, value2);
  }, []);

  const getDateStr = useCallback((value: any): string => {
    return getDateString(toDate(value));
  }, []);

  return useMemo(() => ({
    today: todayString,
    isToday,
    isFuture,
    isPast,
    isTodayOrFuture,
    isTodayOrPast,
    isSameDay,
    getDateStr,
  }), [todayString, isToday, isFuture, isPast, isTodayOrFuture, isTodayOrPast, isSameDay, getDateStr]);
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK OROLOGIO: useItalianTime
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 🇮🇹🕐 Hook per ottenere l'ora corrente ITALIANA (si aggiorna ogni minuto)
 * 
 * @returns Stringa "HH:MM" dell'ora corrente in Italia
 */
export function useItalianTime(): string {
  const [time, setTime] = useState<string>(() => getItalianTime());

  useEffect(() => {
    const updateTime = () => {
      setTime(getItalianTime());
    };

    // Calcola quando iniziare (all'inizio del prossimo minuto)
    const italianNow = getItalianNow();
    const msUntilNextMinute = (60 - italianNow.seconds) * 1000;
    
    // Prima aggiorna all'inizio del prossimo minuto
    const initialTimeout = setTimeout(() => {
      updateTime();
      
      // Poi ogni minuto esatto
      const interval = setInterval(updateTime, 60000);
      
      // Cleanup dell'interval quando il componente si smonta
      return () => clearInterval(interval);
    }, msUntilNextMinute);

    return () => clearTimeout(initialTimeout);
  }, []);

  return time;
}

// Alias per retrocompatibilità
export const useCurrentTime = useItalianTime;

// ═══════════════════════════════════════════════════════════════════════════
// HOOK COMBINATO: useItalianDateTime
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 📅🕐 Hook combinato per data e ora correnti ITALIANE
 * 
 * @returns Oggetto con today (YYYY-MM-DD) e time (HH:MM) in ora italiana
 */
export function useItalianDateTime() {
  const today = useToday();
  const time = useItalianTime();
  
  return useMemo(() => ({
    today,
    time,
    dateTime: `${today} ${time}`,
  }), [today, time]);
}

// Alias per retrocompatibilità
export const useDateTime = useItalianDateTime;

// ═══════════════════════════════════════════════════════════════════════════
// RE-EXPORT per comodità
// ═══════════════════════════════════════════════════════════════════════════

export { 
  getTodayString, 
  getDateString, 
  toDate,
  toDateString,
  getItalianNow,
  getItalianTime,
  isToday as isTodayStatic,
  isFuture as isFutureStatic,
  isPast as isPastStatic,
  isSameDay as isSameDayStatic,
} from '~/lib/dateUtils';

export default useToday;
