/**
 * 🕛 useMidnightRefresh - Hook per aggiornare i componenti a mezzanotte
 * 
 * Uso:
 * ```tsx
 * function MyComponent() {
 *   const today = useMidnightRefresh(); // Si aggiorna automaticamente a mezzanotte
 *   return <div>Oggi: {today}</div>
 * }
 * ```
 */

import { useState, useEffect, useCallback } from 'react';
import { getTodayString, getMillisecondsUntilMidnight } from '~/lib/dateUtils';

/**
 * Hook che restituisce la data di oggi e si aggiorna automaticamente a mezzanotte
 * @returns stringa "YYYY-MM-DD" che si aggiorna a mezzanotte
 */
export function useMidnightRefresh(): string {
  const [today, setToday] = useState<string>(getTodayString());

  useEffect(() => {
    // Funzione per aggiornare e ri-schedulare
    const scheduleNextUpdate = () => {
      const msUntilMidnight = getMillisecondsUntilMidnight();
      
      if (process.env.NODE_ENV !== "production") console.log(`🕛 [MidnightRefresh] Prossimo aggiornamento tra ${Math.round(msUntilMidnight / 1000 / 60)} minuti`);
      
      // Imposta timeout per mezzanotte + 1 secondo (per sicurezza)
      const timeoutId = setTimeout(() => {
        const newToday = getTodayString();
        if (process.env.NODE_ENV !== "production") console.log(`🕛 [MidnightRefresh] È mezzanotte! Aggiorno da ${today} a ${newToday}`);
        setToday(newToday);
        
        // Ri-schedula per la prossima mezzanotte
        scheduleNextUpdate();
      }, msUntilMidnight + 1000);
      
      return timeoutId;
    };
    
    const timeoutId = scheduleNextUpdate();
    
    return () => clearTimeout(timeoutId);
  }, [today]);

  return today;
}

/**
 * Hook che forza un re-render a mezzanotte
 * Utile quando il componente ha già la sua logica di date
 * @returns numero che incrementa a ogni mezzanotte (per forzare re-render)
 */
export function useMidnightTrigger(): number {
  const [trigger, setTrigger] = useState<number>(0);

  useEffect(() => {
    const scheduleNextUpdate = () => {
      const msUntilMidnight = getMillisecondsUntilMidnight();
      
      const timeoutId = setTimeout(() => {
        if (process.env.NODE_ENV !== "production") console.log(`🕛 [MidnightTrigger] È mezzanotte! Trigger refresh #${trigger + 1}`);
        setTrigger(t => t + 1);
        scheduleNextUpdate();
      }, msUntilMidnight + 1000);
      
      return timeoutId;
    };
    
    const timeoutId = scheduleNextUpdate();
    
    return () => clearTimeout(timeoutId);
  }, [trigger]);

  return trigger;
}

/**
 * Hook per ottenere l'ora corrente italiana formattata
 * Si aggiorna ogni minuto
 */
export function useCurrentTime(): string {
  const [time, setTime] = useState<string>(() => {
    return new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }));
    }, 60000); // Ogni minuto

    return () => clearInterval(interval);
  }, []);

  return time;
}

export default useMidnightRefresh;
