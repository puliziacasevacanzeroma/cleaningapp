"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import {
  WEEKDAY_KEYS,
  WEEKDAY_LABELS_IT,
  WEEKDAY_LABELS_FULL_IT,
  DEFAULT_FULL_SCHEDULE,
  resolveAvailability,
  weekdayKeyFromDateKey,
  sanitizeSchedule,
  type WorkSchedule,
  type ShiftExceptionType,
  type AvailabilitySource,
} from "~/lib/shifts/availability";

/**
 * Pagina Admin: Turni (pianificazione settimanale)
 *
 * NON è la pagina timbrature (quella è /dashboard/orari-lavoro).
 * Qui l'admin pianifica CHI lavora in quali giorni:
 *  - Template ricorrente per dipendente (lun-dom) → users/{id}.workSchedule
 *  - Eccezioni puntuali (assenza / turno extra) → collection shiftExceptions
 *  - Pannello CONFLITTI: assegnazioni esistenti a persone fuori turno
 *    (es. pulizia spostata a un giorno in cui l'operatore è in ferie)
 *
 * Letture: realtime via onSnapshot (users + shiftExceptions + cleanings/orders della settimana).
 * Scritture: SEMPRE via API /api/planned-shifts (admin-gated, input sanitizzato).
 */

// ════════════════════════════════════════════════════════════════
// TIPI
// ════════════════════════════════════════════════════════════════

interface Employee {
  id: string;
  name: string;
  role: string; // OPERATORE_PULIZIE | RIDER
  workSchedule: WorkSchedule | null;
}

interface ShiftExceptionDoc {
  id: string;
  userId: string;
  userName?: string;
  dateKey: string;
  type: ShiftExceptionType;
  reason?: string | null;
  createdByName?: string;
  forced?: boolean;
}

interface WeekCleaning {
  id: string;
  propertyName: string;
  dateKey: string;
  status: string;
  operators: Array<{ id: string; name: string }>;
}

interface WeekOrder {
  id: string;
  propertyName: string;
  dateKey: string;
  status: string;
  riderId: string;
  riderName: string;
}

interface Conflict {
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  dateKey: string;
  kind: "PULIZIA" | "CONSEGNA";
  entityId: string;
  entityName: string;
  entityStatus: string;
}

// ════════════════════════════════════════════════════════════════
// HELPER DATE (Europe/Rome)
// ════════════════════════════════════════════════════════════════

function toDateKeyRome(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
}

/** Lunedì della settimana che contiene `anchor` (in dateKey Rome). */
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

function fmtDayNum(dateKey: string): string {
  const d = new Date(dateKey + "T12:00:00Z");
  return d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short" });
}

function fmtFull(dateKey: string): string {
  const d = new Date(dateKey + "T12:00:00Z");
  return d.toLocaleDateString("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

// ════════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════════

export default function TurniPage() {
  // ── Settimana selezionata (ancora = lunedì) ──
  const [weekMonday, setWeekMonday] = useState<Date>(() => mondayOfWeek(new Date()));
  const weekDateKeys = useMemo(
    () => Array.from({ length: 7 }, (_, i) => toDateKeyRome(addDays(weekMonday, i))),
    [weekMonday]
  );
  const todayKey = toDateKeyRome(new Date());

  // ── Stato dati ──
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [exceptions, setExceptions] = useState<ShiftExceptionDoc[]>([]);
  const [weekCleanings, setWeekCleanings] = useState<WeekCleaning[]>([]);
  const [weekOrders, setWeekOrders] = useState<WeekOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState<"all" | "OPERATORE_PULIZIE" | "RIDER">("all");

  // ── Modal cella (eccezione) ──
  const [cellModal, setCellModal] = useState<{ emp: Employee; dateKey: string } | null>(null);
  const [cellReason, setCellReason] = useState("");
  const [cellSaving, setCellSaving] = useState(false);
  const [cellError, setCellError] = useState<string | null>(null);

  // ── Modal template ──
  const [tplModal, setTplModal] = useState<Employee | null>(null);
  const [tplDraft, setTplDraft] = useState<Required<WorkSchedule>>(DEFAULT_FULL_SCHEDULE);
  const [tplSaving, setTplSaving] = useState(false);
  const [tplError, setTplError] = useState<string | null>(null);

  // ════════════════════════════════════════════════════════════
  // LISTENER REALTIME
  // ════════════════════════════════════════════════════════════

  // Dipendenti (operatori + rider attivi)
  useEffect(() => {
    const q = query(
      collection(db, "users"),
      where("role", "in", ["OPERATORE_PULIZIE", "RIDER"])
    );
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs
        .map((d) => {
          const raw = d.data() as Record<string, any>;
          return {
            id: d.id,
            name: raw.name || raw.email || "Utente",
            role: raw.role || "",
            status: raw.status || "ACTIVE",
            workSchedule: (raw.workSchedule as WorkSchedule) || null,
          };
        })
        .filter((u) => u.status === "ACTIVE")
        .sort((a, b) => {
          if (a.role !== b.role) return a.role.localeCompare(b.role); // operatori prima dei rider
          return a.name.localeCompare(b.name);
        });
      setEmployees(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Eccezioni della settimana
  useEffect(() => {
    const from = weekDateKeys[0]!;
    const to = weekDateKeys[6]!;
    const q = query(
      collection(db, "shiftExceptions"),
      where("dateKey", ">=", from),
      where("dateKey", "<=", to)
    );
    const unsub = onSnapshot(q, (snap) => {
      setExceptions(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, any>) }) as ShiftExceptionDoc)
      );
    });
    return () => unsub();
  }, [weekDateKeys]);

  // Pulizie della settimana (per pannello conflitti)
  useEffect(() => {
    const start = new Date(weekDateKeys[0]! + "T00:00:00+02:00");
    // +2 giorni di margine sul fuso: filtriamo poi per dateKey esatta in memoria
    const startSafe = addDays(start, -1);
    const end = addDays(new Date(weekDateKeys[6]! + "T23:59:59+02:00"), 1);
    const q = query(
      collection(db, "cleanings"),
      where("scheduledDate", ">=", Timestamp.fromDate(startSafe)),
      where("scheduledDate", "<=", Timestamp.fromDate(end))
    );
    const unsub = onSnapshot(q, (snap) => {
      const list: WeekCleaning[] = [];
      snap.docs.forEach((d) => {
        const raw = d.data() as Record<string, any>;
        const date = raw.scheduledDate?.toDate?.();
        if (!date) return;
        const dateKey = toDateKeyRome(date);
        if (dateKey < weekDateKeys[0]! || dateKey > weekDateKeys[6]!) return;
        const status = (raw.status || "").toUpperCase();
        if (status === "CANCELLED" || status === "COMPLETED" || status === "VERIFIED") return;
        let operators: Array<{ id: string; name: string }> = Array.isArray(raw.operators)
          ? raw.operators.filter((o: any) => o && o.id)
          : [];
        if (operators.length === 0 && raw.operatorId) {
          operators = [{ id: raw.operatorId, name: raw.operatorName || "Operatore" }];
        }
        if (operators.length === 0) return;
        list.push({
          id: d.id,
          propertyName: raw.propertyName || "Proprietà",
          dateKey,
          status,
          operators,
        });
      });
      setWeekCleanings(list);
    });
    return () => unsub();
  }, [weekDateKeys]);

  // Ordini della settimana con rider (per pannello conflitti)
  useEffect(() => {
    const startSafe = addDays(new Date(weekDateKeys[0]! + "T00:00:00+02:00"), -1);
    const end = addDays(new Date(weekDateKeys[6]! + "T23:59:59+02:00"), 1);
    const q = query(
      collection(db, "orders"),
      where("scheduledDate", ">=", Timestamp.fromDate(startSafe)),
      where("scheduledDate", "<=", Timestamp.fromDate(end))
    );
    const unsub = onSnapshot(q, (snap) => {
      const list: WeekOrder[] = [];
      snap.docs.forEach((d) => {
        const raw = d.data() as Record<string, any>;
        const date = raw.scheduledDate?.toDate?.();
        if (!date || !raw.riderId) return;
        const dateKey = toDateKeyRome(date);
        if (dateKey < weekDateKeys[0]! || dateKey > weekDateKeys[6]!) return;
        const status = (raw.status || "").toUpperCase();
        if (status === "DELIVERED" || status === "CANCELLED" || status === "COMPLETED") return;
        list.push({
          id: d.id,
          propertyName: raw.propertyName || "Proprietà",
          dateKey,
          status,
          riderId: raw.riderId,
          riderName: raw.riderName || "Rider",
        });
      });
      setWeekOrders(list);
    });
    return () => unsub();
  }, [weekDateKeys]);

  // ════════════════════════════════════════════════════════════
  // DERIVATI
  // ════════════════════════════════════════════════════════════

  /** Mappa eccezioni: `${userId}_${dateKey}` → doc */
  const excMap = useMemo(() => {
    const m = new Map<string, ShiftExceptionDoc>();
    for (const e of exceptions) m.set(`${e.userId}_${e.dateKey}`, e);
    return m;
  }, [exceptions]);

  const filteredEmployees = useMemo(
    () => employees.filter((e) => roleFilter === "all" || e.role === roleFilter),
    [employees, roleFilter]
  );

  function availabilityOf(emp: Employee, dateKey: string) {
    const exc = excMap.get(`${emp.id}_${dateKey}`);
    return resolveAvailability(emp.workSchedule, exc?.type ?? null, dateKey);
  }

  /** Conflitti: assegnati ma fuori turno */
  const conflicts = useMemo<Conflict[]>(() => {
    const empById = new Map(employees.map((e) => [e.id, e]));
    const out: Conflict[] = [];
    for (const c of weekCleanings) {
      for (const op of c.operators) {
        const emp = empById.get(op.id);
        if (!emp) continue; // utente disattivato/cancellato: fuori scope
        const av = availabilityOf(emp, c.dateKey);
        if (!av.available) {
          out.push({
            employeeId: emp.id,
            employeeName: emp.name,
            employeeRole: emp.role,
            dateKey: c.dateKey,
            kind: "PULIZIA",
            entityId: c.id,
            entityName: c.propertyName,
            entityStatus: c.status,
          });
        }
      }
    }
    for (const o of weekOrders) {
      const emp = empById.get(o.riderId);
      if (!emp) continue;
      const av = availabilityOf(emp, o.dateKey);
      if (!av.available) {
        out.push({
          employeeId: emp.id,
          employeeName: emp.name,
          employeeRole: emp.role,
          dateKey: o.dateKey,
          kind: "CONSEGNA",
          entityId: o.id,
          entityName: o.propertyName,
          entityStatus: o.status,
        });
      }
    }
    return out.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.employeeName.localeCompare(b.employeeName));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekCleanings, weekOrders, employees, excMap]);

  // ════════════════════════════════════════════════════════════
  // AZIONI (via API)
  // ════════════════════════════════════════════════════════════

  async function postAction(payload: Record<string, any>): Promise<string | null> {
    try {
      const res = await fetch("/api/planned-shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return data.error || `Errore ${res.status}`;
      }
      return null;
    } catch {
      return "Errore di rete";
    }
  }

  async function handleSetException(type: ShiftExceptionType) {
    if (!cellModal) return;
    setCellSaving(true);
    setCellError(null);
    const err = await postAction({
      action: "set_exception",
      userId: cellModal.emp.id,
      dateKey: cellModal.dateKey,
      type,
      reason: cellReason,
    });
    setCellSaving(false);
    if (err) setCellError(err);
    else {
      setCellModal(null);
      setCellReason("");
    }
  }

  async function handleRemoveException() {
    if (!cellModal) return;
    setCellSaving(true);
    setCellError(null);
    const err = await postAction({
      action: "remove_exception",
      userId: cellModal.emp.id,
      dateKey: cellModal.dateKey,
    });
    setCellSaving(false);
    if (err) setCellError(err);
    else {
      setCellModal(null);
      setCellReason("");
    }
  }

  async function handleSaveTemplate() {
    if (!tplModal) return;
    setTplSaving(true);
    setTplError(null);
    const err = await postAction({
      action: "set_schedule",
      userId: tplModal.id,
      schedule: tplDraft,
    });
    setTplSaving(false);
    if (err) setTplError(err);
    else setTplModal(null);
  }

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════

  function cellStyle(av: { available: boolean; source: AvailabilitySource }): string {
    switch (av.source) {
      case "exception_on":
        return "bg-purple-100 border-purple-300 text-purple-700";
      case "exception_off":
        return "bg-rose-100 border-rose-300 text-rose-700";
      case "template_off":
        return "bg-slate-100 border-slate-200 text-slate-400";
      case "template_on":
        return "bg-emerald-50 border-emerald-200 text-emerald-700";
      case "default":
        return "bg-emerald-50/60 border-dashed border-emerald-200 text-emerald-600";
    }
  }

  function cellLabel(av: { available: boolean; source: AvailabilitySource }): string {
    switch (av.source) {
      case "exception_on":
        return "Extra";
      case "exception_off":
        return "Assenza";
      case "template_off":
        return "—";
      case "template_on":
        return "✓";
      case "default":
        return "✓";
    }
  }

  const weekLabel = `${fmtDayNum(weekDateKeys[0]!)} – ${fmtDayNum(weekDateKeys[6]!)}`;

  const currentExc = cellModal ? excMap.get(`${cellModal.emp.id}_${cellModal.dateKey}`) : null;

  return (
    <div className="max-w-7xl mx-auto">
      {/* ── Header ── */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-800">Turni</h1>
        <p className="text-sm text-slate-500">
          Pianificazione settimanale di operatori e rider. Le timbrature sono in{" "}
          <a href="/dashboard/orari-lavoro" className="text-sky-600 underline">Orari di Lavoro</a>.
        </p>
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={() => setWeekMonday(addDays(weekMonday, -7))}
            className="w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 active:bg-slate-100 flex-shrink-0"
            aria-label="Settimana precedente"
          >
            ←
          </button>
          <button
            onClick={() => setWeekMonday(mondayOfWeek(new Date()))}
            className="h-10 px-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 active:bg-slate-100 text-sm font-medium flex-shrink-0"
          >
            Oggi
          </button>
          <button
            onClick={() => setWeekMonday(addDays(weekMonday, 7))}
            className="w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 active:bg-slate-100 flex-shrink-0"
            aria-label="Settimana successiva"
          >
            →
          </button>
          <span className="ml-1 text-sm font-semibold text-slate-700 truncate">{weekLabel}</span>
        </div>
      </div>

      {/* ── Filtro ruolo + legenda ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex gap-2">
          {([
            ["all", "Tutti"],
            ["OPERATORE_PULIZIE", "Operatori"],
            ["RIDER", "Rider"],
          ] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setRoleFilter(val)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                roleFilter === val
                  ? "bg-indigo-600 text-white"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300 inline-block" /> In turno</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-100 border border-slate-300 inline-block" /> Riposo</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-rose-100 border border-rose-300 inline-block" /> Assenza</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-purple-100 border border-purple-300 inline-block" /> Turno extra</span>
        </div>
      </div>

      {/* ── Pannello conflitti ── */}
      {conflicts.length > 0 && (
        <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <h2 className="font-bold text-amber-800 mb-2 flex items-center gap-2">
            ⚠️ Conflitti: assegnazioni a persone fuori turno ({conflicts.length})
          </h2>
          <p className="text-xs text-amber-700 mb-3">
            Lavori già assegnati in giorni in cui il dipendente risulta non in turno (es. data spostata dopo
            l'assegnazione, o assenza inserita dopo). Risolvi riassegnando il lavoro oppure aggiungendo un turno extra.
          </p>
          <div className="space-y-1">
            {conflicts.map((c, i) => (
              <div key={`${c.entityId}_${c.employeeId}_${i}`} className="flex flex-wrap items-center gap-2 text-sm text-amber-900">
                <span className="font-semibold">{c.employeeName}</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-amber-200">{c.employeeRole === "RIDER" ? "Rider" : "Operatore"}</span>
                <span>{c.kind === "PULIZIA" ? "pulizia" : "consegna"} a</span>
                <span className="font-medium">{c.entityName}</span>
                <span>il {fmtFull(c.dateKey)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Griglia ── */}
      {loading ? (
        <div className="text-center py-16 text-slate-400">Caricamento…</div>
      ) : filteredEmployees.length === 0 ? (
        <div className="text-center py-16 text-slate-400">Nessun dipendente attivo trovato.</div>
      ) : (
        <>
        {/* DESKTOP (md+): tabella settimanale */}
        <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 font-semibold text-slate-600 min-w-[180px]">Dipendente</th>
                {weekDateKeys.map((dk) => (
                  <th
                    key={dk}
                    className={`px-2 py-3 text-center font-semibold min-w-[84px] ${
                      dk === todayKey ? "text-indigo-700 bg-indigo-50" : "text-slate-600"
                    }`}
                  >
                    <div>{WEEKDAY_LABELS_IT[weekdayKeyFromDateKey(dk)]}</div>
                    <div className="text-xs font-normal text-slate-400">{fmtDayNum(dk)}</div>
                  </th>
                ))}
                <th className="px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((emp) => (
                <tr key={emp.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2">
                    <div className="font-medium text-slate-800">{emp.name}</div>
                    <div className="text-xs text-slate-400">
                      {emp.role === "RIDER" ? "Rider" : "Operatore"}
                      {!emp.workSchedule && (
                        <span className="ml-1 text-amber-500" title="Nessun orario configurato: risulta sempre disponibile">
                          • orario non configurato
                        </span>
                      )}
                    </div>
                  </td>
                  {weekDateKeys.map((dk) => {
                    const av = availabilityOf(emp, dk);
                    const exc = excMap.get(`${emp.id}_${dk}`);
                    return (
                      <td key={dk} className={`px-1.5 py-1.5 text-center ${dk === todayKey ? "bg-indigo-50/40" : ""}`}>
                        <button
                          onClick={() => {
                            setCellModal({ emp, dateKey: dk });
                            setCellReason(exc?.reason || "");
                            setCellError(null);
                          }}
                          title={exc?.reason || undefined}
                          className={`w-full h-9 rounded-lg border text-xs font-semibold transition-all hover:ring-2 hover:ring-indigo-300 ${cellStyle(av)}`}
                        >
                          {cellLabel(av)}
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-center">
                    <button
                      onClick={() => {
                        setTplModal(emp);
                        setTplDraft(sanitizeSchedule(emp.workSchedule, true));
                        setTplError(null);
                      }}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-500 hover:bg-slate-50 whitespace-nowrap"
                    >
                      Orario
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* MOBILE (<md): una card per dipendente, 7 chip giorno — niente scroll orizzontale */}
        <div className="md:hidden space-y-2.5">
          {filteredEmployees.map((emp) => (
            <div key={emp.id} className="bg-white border border-slate-200 rounded-2xl p-3">
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800 text-sm truncate">{emp.name}</div>
                  <div className="text-[11px] text-slate-400">
                    {emp.role === "RIDER" ? "Rider" : "Operatore"}
                    {!emp.workSchedule && <span className="ml-1 text-amber-500">• orario non configurato</span>}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setTplModal(emp);
                    setTplDraft(sanitizeSchedule(emp.workSchedule, true));
                    setTplError(null);
                  }}
                  className="px-3 h-9 rounded-lg text-xs font-medium border border-slate-200 text-slate-500 active:bg-slate-100 flex-shrink-0"
                >
                  Orario
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {weekDateKeys.map((dk) => {
                  const av = availabilityOf(emp, dk);
                  const exc = excMap.get(`${emp.id}_${dk}`);
                  const isToday = dk === todayKey;
                  return (
                    <button
                      key={dk}
                      onClick={() => {
                        setCellModal({ emp, dateKey: dk });
                        setCellReason(exc?.reason || "");
                        setCellError(null);
                      }}
                      className={`rounded-lg border text-center py-1.5 ${cellStyle(av)} ${isToday ? "ring-2 ring-indigo-400" : ""}`}
                    >
                      <div className="text-[9px] font-medium opacity-70">{WEEKDAY_LABELS_IT[weekdayKeyFromDateKey(dk)]}</div>
                      <div className="text-xs font-bold">{dk.slice(8)}</div>
                      <div className="text-[8px] font-semibold leading-tight">
                        {av.source === "exception_on" ? "Extra" : av.source === "exception_off" ? "Ass." : av.available ? "✓" : "—"}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        </>
      )}

      {/* ── MODAL CELLA (eccezione) ── */}
      {cellModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={() => !cellSaving && setCellModal(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-w-md w-full p-5 max-h-[85vh] overflow-y-auto" style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-slate-800 mb-1">{cellModal.emp.name}</h3>
            <p className="text-sm text-slate-500 mb-3">{fmtFull(cellModal.dateKey)}</p>

            {(() => {
              const av = availabilityOf(cellModal.emp, cellModal.dateKey);
              return (
                <div className={`text-sm rounded-lg border px-3 py-2 mb-4 ${cellStyle(av)}`}>
                  Stato attuale:{" "}
                  <strong>
                    {av.source === "exception_on" && "Turno extra"}
                    {av.source === "exception_off" && "Assenza"}
                    {av.source === "template_on" && "In turno (orario settimanale)"}
                    {av.source === "template_off" && "Riposo (orario settimanale)"}
                    {av.source === "default" && "Disponibile (orario non configurato)"}
                  </strong>
                  {currentExc?.reason && <div className="text-xs mt-1 opacity-80">Motivo: {currentExc.reason}</div>}
                  {currentExc?.createdByName && <div className="text-xs opacity-60">Inserita da {currentExc.createdByName}</div>}
                </div>
              );
            })()}

            <label className="block text-xs font-medium text-slate-500 mb-1">Motivo (opzionale)</label>
            <input
              value={cellReason}
              onChange={(e) => setCellReason(e.target.value)}
              maxLength={300}
              placeholder="Es. ferie, malattia, urgenza…"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-base sm:text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />

            {cellError && <div className="text-sm text-rose-600 mb-3">{cellError}</div>}

            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleSetException("OFF")}
                disabled={cellSaving}
                className="w-full py-2.5 rounded-xl bg-rose-600 text-white font-medium hover:bg-rose-700 disabled:opacity-50"
              >
                Segna ASSENZA questo giorno
              </button>
              <button
                onClick={() => handleSetException("ON")}
                disabled={cellSaving}
                className="w-full py-2.5 rounded-xl bg-purple-600 text-white font-medium hover:bg-purple-700 disabled:opacity-50"
              >
                Aggiungi TURNO EXTRA questo giorno
              </button>
              {currentExc && (
                <button
                  onClick={handleRemoveException}
                  disabled={cellSaving}
                  className="w-full py-2.5 rounded-xl border border-slate-300 text-slate-600 font-medium hover:bg-slate-50 disabled:opacity-50"
                >
                  Rimuovi eccezione (torna all'orario settimanale)
                </button>
              )}
              <button
                onClick={() => setCellModal(null)}
                disabled={cellSaving}
                className="w-full py-2 text-sm text-slate-400 hover:text-slate-600"
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL TEMPLATE (orario settimanale) ── */}
      {tplModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={() => !tplSaving && setTplModal(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-w-md w-full p-5 max-h-[85vh] overflow-y-auto" style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-slate-800 mb-1">Orario settimanale</h3>
            <p className="text-sm text-slate-500 mb-4">
              {tplModal.name} — giorni in cui è normalmente in turno. Le eccezioni puntuali (assenze/extra) vincono
              su questo orario.
            </p>

            <div className="grid grid-cols-1 gap-2 mb-4">
              {WEEKDAY_KEYS.map((k) => (
                <label
                  key={k}
                  className={`flex items-center justify-between rounded-xl border px-4 py-2.5 cursor-pointer ${
                    tplDraft[k] ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <span className="font-medium text-slate-700">{WEEKDAY_LABELS_FULL_IT[k]}</span>
                  <input
                    type="checkbox"
                    checked={tplDraft[k]}
                    onChange={(e) => setTplDraft({ ...tplDraft, [k]: e.target.checked })}
                    className="w-5 h-5 accent-emerald-600"
                  />
                </label>
              ))}
            </div>

            {tplError && <div className="text-sm text-rose-600 mb-3">{tplError}</div>}

            <div className="flex gap-2">
              <button
                onClick={() => setTplModal(null)}
                disabled={tplSaving}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-medium hover:bg-slate-50 disabled:opacity-50"
              >
                Annulla
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={tplSaving}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {tplSaving ? "Salvataggio…" : "Salva orario"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
