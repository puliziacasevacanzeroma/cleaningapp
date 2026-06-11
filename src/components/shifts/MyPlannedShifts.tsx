"use client";

import { useEffect, useState } from "react";
import {
  resolveAvailability,
  weekdayKeyFromDateKey,
  WEEKDAY_LABELS_IT,
  type WorkSchedule,
  type ShiftExceptionType,
  type AvailabilitySource,
} from "~/lib/shifts/availability";

/**
 * MyPlannedShifts — vista SOLA LETTURA dei propri turni pianificati
 * per operatore e rider (settimana corrente + successiva, 14 giorni).
 *
 * Legge da GET /api/planned-shifts (il path self-service ritorna solo i
 * dati dell'utente loggato). Nessuna scrittura: i turni li gestisce l'admin
 * dalla pagina /dashboard/turni.
 *
 * Comportamento difensivo: se la fetch fallisce o l'utente non ha dati,
 * il componente non renderizza nulla (non deve mai rompere la pagina).
 */

interface ExceptionLite {
  dateKey: string;
  type: ShiftExceptionType;
  reason?: string | null;
}

function toDateKeyRome(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
}

function mondayOfWeek(anchor: Date): Date {
  const key = toDateKeyRome(anchor);
  const noonUtc = new Date(key + "T12:00:00Z");
  const jsDay = noonUtc.getUTCDay(); // 0=dom
  const diff = jsDay === 0 ? -6 : 1 - jsDay;
  noonUtc.setUTCDate(noonUtc.getUTCDate() + diff);
  return noonUtc;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

function chipStyle(source: AvailabilitySource): string {
  switch (source) {
    case "exception_on":
      return "bg-purple-100 border-purple-300 text-purple-700";
    case "exception_off":
      return "bg-rose-100 border-rose-300 text-rose-600";
    case "template_off":
      return "bg-slate-100 border-slate-200 text-slate-400";
    case "template_on":
    case "default":
      return "bg-emerald-50 border-emerald-200 text-emerald-700";
  }
}

export default function MyPlannedShifts() {
  const [schedule, setSchedule] = useState<WorkSchedule | null>(null);
  const [exceptions, setExceptions] = useState<Map<string, ExceptionLite>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // 14 giorni: lunedì di questa settimana → domenica della prossima
  const monday = mondayOfWeek(new Date());
  const dateKeys = Array.from({ length: 14 }, (_, i) => toDateKeyRome(addDays(monday, i)));
  const todayKey = toDateKeyRome(new Date());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const from = dateKeys[0]!;
        const to = dateKeys[13]!;
        const res = await fetch(`/api/planned-shifts?from=${from}&to=${to}`);
        if (!res.ok) { if (!cancelled) setLoaded(true); return; }
        const data = await res.json();
        if (cancelled) return;
        const me = Array.isArray(data.users) ? data.users[0] : null;
        const excs: ExceptionLite[] = Array.isArray(data.exceptions) ? data.exceptions : [];
        const m = new Map<string, ExceptionLite>();
        for (const e of excs) {
          if (e?.dateKey) m.set(e.dateKey, { dateKey: e.dateKey, type: e.type === "OFF" ? "OFF" : "ON", reason: e.reason });
        }
        setSchedule(me?.workSchedule || null);
        setExceptions(m);
        // Mostra il widget solo se c'è QUALCOSA di configurato (template o eccezioni):
        // se l'admin non ha mai configurato i turni, non confondere con "sempre in turno".
        setHasData(Boolean(me?.workSchedule) || m.size > 0);
        setLoaded(true);
      } catch {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!loaded || !hasData) return null;

  const visibleKeys = expanded ? dateKeys : dateKeys.slice(0, 7);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-3 mt-2">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">📅</span>
          <span className="font-bold text-xs text-slate-600 uppercase">I miei turni</span>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[11px] font-medium text-sky-600"
        >
          {expanded ? "Solo questa settimana" : "Prossima settimana →"}
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {visibleKeys.map((dk) => {
          const exc = exceptions.get(dk);
          const av = resolveAvailability(schedule, exc?.type ?? null, dk);
          const dayNum = dk.slice(8); // "DD"
          const isToday = dk === todayKey;
          return (
            <div
              key={dk}
              title={exc?.reason || undefined}
              className={`rounded-lg border text-center py-1.5 ${chipStyle(av.source)} ${isToday ? "ring-2 ring-sky-400" : ""}`}
            >
              <div className="text-[9px] font-medium opacity-70">{WEEKDAY_LABELS_IT[weekdayKeyFromDateKey(dk)]}</div>
              <div className="text-xs font-bold">{dayNum}</div>
              <div className="text-[8px] font-semibold leading-tight">
                {av.source === "exception_on" ? "Extra" : av.source === "exception_off" ? "Assente" : av.available ? "Turno" : "Riposo"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
