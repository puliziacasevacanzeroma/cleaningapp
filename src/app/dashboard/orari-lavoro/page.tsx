"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where, orderBy, limit } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import {
  toMillis,
  formatDurationLive,
  formatDurationHM,
  formatTimeRome,
  formatDateTimeRome,
  toDateKeyRome,
} from "~/lib/workSessions";

interface OperatorBrief {
  id: string;
  name: string;
  role: string;
  status: string;
}

interface Session {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  startAt: any;
  endAt: any | null;
  status: "OPEN" | "CLOSED";
  dateKey: string;
  durationMinutes: number | null;
  notes?: string | null;
  alertedAt?: any | null;
  editHistory?: any[];
}

/**
 * Pagina Admin: Orari di Lavoro
 *
 * Features:
 * - Live: lista dipendenti in turno con timer HH:MM:SS
 * - Oggi: totali per giorno per ogni dipendente
 * - Storico: range custom con totali settimanali
 * - Edit modal: correggi inizio/fine/note con motivo obbligatorio
 * - Force close: chiudi turno aperto altrui con motivo
 */
export default function OrariLavoroPage() {
  const [users, setUsers] = useState<OperatorBrief[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  // allOpenSessions: TUTTE le sessioni OPEN, senza filtro date.
  // Serve per il tab "Live" così anche turni dimenticati da settimane sono visibili.
  const [allOpenSessions, setAllOpenSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"live" | "oggi" | "storico">("live");
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return toDateKeyRome(d);
  });
  const [toDate, setToDate] = useState<string>(() => toDateKeyRome(new Date()));
  const [userFilter, setUserFilter] = useState<string>("all");

  // Edit modal state
  const [editSession, setEditSession] = useState<Session | null>(null);
  const [editStartLocal, setEditStartLocal] = useState<string>("");
  const [editEndLocal, setEditEndLocal] = useState<string>("");
  const [editNotes, setEditNotes] = useState<string>("");
  const [editReason, setEditReason] = useState<string>("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Force-close modal state
  const [forceCloseSession, setForceCloseSession] = useState<Session | null>(null);
  const [forceCloseEndLocal, setForceCloseEndLocal] = useState<string>("");
  const [forceCloseReason, setForceCloseReason] = useState<string>("");
  const [forceCloseSaving, setForceCloseSaving] = useState(false);
  const [forceCloseError, setForceCloseError] = useState<string | null>(null);

  // ── Carica users (operatori + rider) ──
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
          };
        })
        .filter((u) => u.status === "ACTIVE")
        .sort((a, b) => a.name.localeCompare(b.name));
      setUsers(data);
    });
    return () => unsub();
  }, []);

  // ── Carica workSessions in range ──
  useEffect(() => {
    const q = query(
      collection(db, "workSessions"),
      where("dateKey", ">=", fromDate),
      where("dateKey", "<=", toDate),
      orderBy("dateKey", "desc"),
      limit(2000)
    );
    const unsub = onSnapshot(q, (snap) => {
      const data: Session[] = snap.docs.map((d) => {
        const raw = d.data() as Record<string, any>;
        return {
          id: d.id,
          userId: raw.userId || "",
          userName: raw.userName || "",
          userRole: raw.userRole || "",
          startAt: raw.startAt || null,
          endAt: raw.endAt || null,
          status: (raw.status as "OPEN" | "CLOSED") || "CLOSED",
          dateKey: raw.dateKey || "",
          durationMinutes: raw.durationMinutes ?? null,
          notes: raw.notes || null,
          alertedAt: raw.alertedAt || null,
          editHistory: raw.editHistory || [],
        };
      });
      setSessions(data);
      setLoading(false);
    });
    return () => unsub();
  }, [fromDate, toDate]);

  // ── Carica TUTTE le sessioni OPEN (senza filtro date) per tab Live ──
  // Importante per non nascondere turni dimenticati aperti da molto tempo.
  useEffect(() => {
    const q = query(
      collection(db, "workSessions"),
      where("status", "==", "OPEN"),
      limit(200)
    );
    const unsub = onSnapshot(q, (snap) => {
      const data: Session[] = snap.docs.map((d) => {
        const raw = d.data() as Record<string, any>;
        return {
          id: d.id,
          userId: raw.userId || "",
          userName: raw.userName || "",
          userRole: raw.userRole || "",
          startAt: raw.startAt || null,
          endAt: raw.endAt || null,
          status: "OPEN",
          dateKey: raw.dateKey || "",
          durationMinutes: raw.durationMinutes ?? null,
          notes: raw.notes || null,
          alertedAt: raw.alertedAt || null,
          editHistory: raw.editHistory || [],
        };
      });
      setAllOpenSessions(data);
    });
    return () => unsub();
  }, []);

  // ── Ticker live ogni secondo se ci sono sessioni aperte ──
  // Uso allOpenSessions (senza filtro date) per non perdere turni dimenticati
  const openSessions = useMemo(() => allOpenSessions, [allOpenSessions]);
  useEffect(() => {
    if (openSessions.length === 0) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [openSessions.length]);

  // ── Sessioni di oggi ──
  const todayKey = useMemo(() => toDateKeyRome(new Date()), []);
  const todaySessions = useMemo(() => sessions.filter((s) => s.dateKey === todayKey), [sessions, todayKey]);

  // ── Aggrega per utente (per giorno) ──
  const todayByUser = useMemo(() => {
    const map = new Map<string, { user: OperatorBrief; minutes: number; sessions: Session[]; isOpen: boolean }>();
    users.forEach((u) => map.set(u.id, { user: u, minutes: 0, sessions: [], isOpen: false }));
    todaySessions.forEach((s) => {
      const entry = map.get(s.userId);
      if (!entry) return;
      entry.sessions.push(s);
      if (s.status === "OPEN") {
        entry.isOpen = true;
        const startMs = toMillis(s.startAt);
        if (startMs) entry.minutes += Math.round((nowMs - startMs) / 60000);
      } else {
        entry.minutes += s.durationMinutes || 0;
      }
    });
    return Array.from(map.values()).sort((a, b) => {
      if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
      return b.minutes - a.minutes;
    });
  }, [todaySessions, users, nowMs]);

  // ── Aggrega per utente (range storico) ──
  const rangeByUser = useMemo(() => {
    const map = new Map<string, { user: OperatorBrief; minutes: number; sessions: Session[]; daysWorked: Set<string> }>();
    users.forEach((u) => map.set(u.id, { user: u, minutes: 0, sessions: [], daysWorked: new Set() }));
    sessions.forEach((s) => {
      if (userFilter !== "all" && s.userId !== userFilter) return;
      const entry = map.get(s.userId);
      if (!entry) return;
      entry.sessions.push(s);
      entry.daysWorked.add(s.dateKey);
      if (s.status === "CLOSED") {
        entry.minutes += s.durationMinutes || 0;
      } else {
        // sessione aperta nel range: usa nowMs
        const startMs = toMillis(s.startAt);
        if (startMs) entry.minutes += Math.max(0, Math.round((nowMs - startMs) / 60000));
      }
    });
    const arr = Array.from(map.values()).filter((e) => userFilter === "all" || e.user.id === userFilter);
    return arr.sort((a, b) => b.minutes - a.minutes);
  }, [sessions, users, userFilter, nowMs]);

  // ── Helpers ──
  const roleLabel = (role: string) => (role === "RIDER" ? "Rider" : "Operatore");

  const openEditModal = (s: Session) => {
    setEditSession(s);
    setEditError(null);
    setEditReason("");
    setEditNotes(s.notes || "");
    const startMs = toMillis(s.startAt);
    const endMs = s.endAt ? toMillis(s.endAt) : null;
    setEditStartLocal(startMs ? msToDatetimeLocal(startMs) : "");
    setEditEndLocal(endMs ? msToDatetimeLocal(endMs) : "");
  };

  const submitEdit = async () => {
    if (!editSession) return;
    if (!editReason.trim() || editReason.trim().length < 3) {
      setEditError("Inserisci un motivo (min 3 caratteri)");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      const body: any = { action: "admin_edit", sessionId: editSession.id, reason: editReason.trim() };
      const origStartMs = toMillis(editSession.startAt);
      const origEndMs = editSession.endAt ? toMillis(editSession.endAt) : null;
      const newStartMs = editStartLocal ? datetimeLocalToMs(editStartLocal) : null;
      const newEndMs = editEndLocal ? datetimeLocalToMs(editEndLocal) : null;

      if (newStartMs && newStartMs !== origStartMs) body.startAt = newStartMs;
      if (newEndMs !== origEndMs) body.endAt = newEndMs;
      if (editNotes !== (editSession.notes || "")) body.notes = editNotes;

      const res = await fetch("/api/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEditError(json?.error || "Errore");
      } else {
        setEditSession(null);
      }
    } catch (e: any) {
      setEditError(e?.message || "Errore di rete");
    }
    setEditSaving(false);
  };

  const openForceClose = (s: Session) => {
    setForceCloseSession(s);
    setForceCloseError(null);
    setForceCloseReason("");
    setForceCloseEndLocal(msToDatetimeLocal(Date.now()));
  };

  const submitForceClose = async () => {
    if (!forceCloseSession) return;
    if (!forceCloseReason.trim() || forceCloseReason.trim().length < 3) {
      setForceCloseError("Inserisci un motivo (min 3 caratteri)");
      return;
    }
    if (!forceCloseEndLocal) {
      setForceCloseError("Inserisci l'orario di fine");
      return;
    }
    setForceCloseSaving(true);
    setForceCloseError(null);
    try {
      const res = await fetch("/api/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "admin_close",
          sessionId: forceCloseSession.id,
          endAt: datetimeLocalToMs(forceCloseEndLocal),
          reason: forceCloseReason.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setForceCloseError(json?.error || "Errore");
      else setForceCloseSession(null);
    } catch (e: any) {
      setForceCloseError(e?.message || "Errore di rete");
    }
    setForceCloseSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-3 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-5 pb-20">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">Orari di Lavoro</h1>
          <p className="text-sm text-slate-500 mt-1">
            Timbrature, ore lavorate e correzioni degli operatori e rider.
          </p>
        </div>
        {openSessions.length > 0 && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            <span className="relative flex items-center justify-center">
              <span className="animate-ping absolute w-2 h-2 bg-emerald-500 rounded-full opacity-75" />
              <span className="relative w-2 h-2 bg-emerald-500 rounded-full" />
            </span>
            <p className="text-sm font-bold text-emerald-700">
              {openSessions.length} {openSessions.length === 1 ? "turno attivo" : "turni attivi"}
            </p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-5 w-full md:w-auto md:inline-flex">
        {(["live", "oggi", "storico"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 md:flex-none px-5 py-2 rounded-lg text-sm font-bold transition-all ${
              tab === t ? "bg-white text-slate-800 shadow" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t === "live" && "🔴 Live"}
            {t === "oggi" && "📅 Oggi"}
            {t === "storico" && "📊 Storico"}
          </button>
        ))}
      </div>

      {/* TAB LIVE */}
      {tab === "live" && (
        <div>
          {openSessions.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <span className="text-3xl">😴</span>
              </div>
              <p className="text-slate-500 font-semibold">Nessun turno attivo in questo momento</p>
              <p className="text-xs text-slate-400 mt-1">Appariranno qui i dipendenti che hanno timbrato l'inizio turno</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {openSessions.map((s) => {
                const liveDur = formatDurationLive(s.startAt, null, nowMs);
                const startMs = toMillis(s.startAt);
                const hoursOpen = (nowMs - startMs) / 3600000;
                const isLongOpen = hoursOpen > 8;
                return (
                  <div
                    key={s.id}
                    className={`rounded-2xl p-4 shadow-sm border ${
                      isLongOpen
                        ? "bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200"
                        : "bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200"
                    }`}
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold ${
                          isLongOpen ? "bg-gradient-to-br from-amber-400 to-orange-500" : "bg-gradient-to-br from-emerald-400 to-teal-500"
                        }`}
                      >
                        {s.userName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-slate-800 truncate">{s.userName}</p>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white text-slate-500 font-semibold">
                            {roleLabel(s.userRole)}
                          </span>
                          {isLongOpen && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500 text-white font-bold">
                              ⚠️ APERTO DA {Math.floor(hoursOpen)}H
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Iniziato alle <strong>{formatTimeRome(s.startAt)}</strong> · {s.dateKey}
                        </p>
                      </div>
                    </div>

                    <div className="bg-white rounded-xl py-3 text-center mb-3">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tempo in corso</p>
                      <p className={`text-3xl font-black tabular-nums mt-0.5 ${isLongOpen ? "text-amber-600" : "text-emerald-600"}`}>
                        {liveDur}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => openEditModal(s)}
                        className="flex-1 py-2 rounded-lg text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50"
                      >
                        ✏️ Modifica
                      </button>
                      <button
                        onClick={() => openForceClose(s)}
                        className="flex-1 py-2 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-red-500 to-rose-600 hover:shadow"
                      >
                        🔒 Chiudi turno
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB OGGI */}
      {tab === "oggi" && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-sm font-bold text-slate-700">Ore lavorate oggi ({todayKey})</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {todayByUser.length === 0 && (
              <div className="py-8 text-center text-slate-400 text-sm">Nessun dipendente attivo</div>
            )}
            {todayByUser.map(({ user, minutes, sessions: userSessions, isOpen }) => (
              <div key={user.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                        isOpen ? "bg-gradient-to-br from-emerald-400 to-teal-500" : "bg-gradient-to-br from-slate-300 to-slate-400"
                      }`}
                    >
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-800 truncate">{user.name}</p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-semibold">
                          {roleLabel(user.role)}
                        </span>
                        {isOpen && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500 text-white font-bold">🟢 IN CORSO</span>}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {userSessions.length} {userSessions.length === 1 ? "sessione" : "sessioni"}
                      </p>
                    </div>
                  </div>
                  <p className={`text-xl font-black tabular-nums ${isOpen ? "text-emerald-600" : minutes > 0 ? "text-slate-700" : "text-slate-300"}`}>
                    {formatDurationHM(minutes)}
                  </p>
                </div>
                {userSessions.length > 0 && (
                  <div className="mt-2 pl-13 space-y-1">
                    {userSessions.map((s) => (
                      <div key={s.id} className="flex items-center gap-2 text-xs text-slate-500">
                        <span className={`w-1.5 h-1.5 rounded-full ${s.status === "OPEN" ? "bg-emerald-500" : "bg-slate-300"}`} />
                        <span className="tabular-nums">
                          {formatTimeRome(s.startAt)} → {s.endAt ? formatTimeRome(s.endAt) : "in corso"}
                        </span>
                        {s.status === "CLOSED" && <span className="text-slate-400">· {formatDurationHM(s.durationMinutes)}</span>}
                        {(s.editHistory?.length || 0) > 0 && <span className="text-amber-600 font-semibold">· ✏️ modificato</span>}
                        <button
                          onClick={() => openEditModal(s)}
                          className="ml-auto text-indigo-600 hover:text-indigo-700 font-semibold"
                        >
                          Dettagli
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB STORICO */}
      {tab === "storico" && (
        <div>
          {sessions.length >= 2000 && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 mb-3 text-sm text-amber-800">
              ⚠️ Risultati troncati a 2000. Restringi l&apos;intervallo di date per vedere tutti i dati.
            </div>
          )}
          <div className="bg-white rounded-2xl border border-slate-100 p-4 mb-3 flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">Da</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">A</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400"
              />
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs font-bold text-slate-600 block mb-1">Dipendente</label>
              <select
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400"
              >
                <option value="all">Tutti</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({roleLabel(u.role)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="divide-y divide-slate-100">
              {rangeByUser.length === 0 && (
                <div className="py-8 text-center text-slate-400 text-sm">Nessun dato nel range</div>
              )}
              {rangeByUser.map(({ user, minutes, sessions: userSessions, daysWorked }) => (
                <div key={user.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-800 truncate">{user.name}</p>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-semibold">
                            {roleLabel(user.role)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {daysWorked.size} giorni · {userSessions.length} sessioni
                        </p>
                      </div>
                    </div>
                    <p className="text-xl font-black tabular-nums text-slate-700">{formatDurationHM(minutes)}</p>
                  </div>
                  {userFilter !== "all" && userSessions.length > 0 && (
                    <div className="mt-3 space-y-1 border-t border-slate-100 pt-3">
                      {userSessions
                        .slice()
                        .sort((a, b) => toMillis(b.startAt) - toMillis(a.startAt))
                        .map((s) => (
                          <div key={s.id} className="flex items-center gap-2 text-xs">
                            <span className="text-slate-400 tabular-nums w-20">{s.dateKey}</span>
                            <span className={`w-1.5 h-1.5 rounded-full ${s.status === "OPEN" ? "bg-emerald-500" : "bg-slate-300"}`} />
                            <span className="tabular-nums text-slate-600">
                              {formatTimeRome(s.startAt)} → {s.endAt ? formatTimeRome(s.endAt) : "in corso"}
                            </span>
                            <span className="text-slate-500 font-semibold">{formatDurationHM(s.durationMinutes)}</span>
                            {(s.editHistory?.length || 0) > 0 && <span className="text-amber-600 font-semibold">· ✏️</span>}
                            <button
                              onClick={() => openEditModal(s)}
                              className="ml-auto text-indigo-600 hover:text-indigo-700 font-semibold"
                            >
                              Dettagli
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDIT */}
      {editSession && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => !editSaving && setEditSession(null)}
        >
          <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
              <h3 className="text-lg font-extrabold text-slate-800">Modifica turno</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {editSession.userName} · {editSession.dateKey}
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Inizio</label>
                <input
                  type="datetime-local"
                  value={editStartLocal}
                  onChange={(e) => setEditStartLocal(e.target.value)}
                  step="1"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-indigo-400"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">
                  Fine {editSession.status === "OPEN" && <span className="text-emerald-600">(turno aperto)</span>}
                </label>
                <input
                  type="datetime-local"
                  value={editEndLocal}
                  onChange={(e) => setEditEndLocal(e.target.value)}
                  step="1"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-indigo-400"
                  placeholder={editSession.status === "OPEN" ? "Lascia vuoto se ancora aperto" : ""}
                />
                {editSession.status === "OPEN" && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    Se inserisci una fine, il turno passerà a stato CHIUSO.
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Note</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-indigo-400 resize-none text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Motivo modifica <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="Es. Problema di rete, dimenticanza, correzione manuale..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-indigo-400 text-sm"
                />
              </div>

              {(editSession.editHistory?.length || 0) > 0 && (
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Cronologia modifiche</label>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {editSession.editHistory!.map((h: any, i: number) => (
                      <div key={i} className="text-[11px] p-2 bg-slate-50 rounded border border-slate-100">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-700">{h.field}</span>
                          <span className="text-slate-400">{formatDateTimeRome(h.editedAt)}</span>
                        </div>
                        <div className="text-slate-500 mt-0.5">
                          {h.editedByName} · {h.reason || "nessun motivo"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {editError && <p className="text-xs text-red-600 font-semibold bg-red-50 rounded-lg px-3 py-2">⚠️ {editError}</p>}
            </div>
            <div className="flex border-t border-slate-100">
              <button
                onClick={() => setEditSession(null)}
                disabled={editSaving}
                className="flex-1 py-3 text-sm font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-50"
              >
                Annulla
              </button>
              <button
                onClick={submitEdit}
                disabled={editSaving}
                className="flex-1 py-3 text-sm font-bold text-indigo-600 hover:bg-indigo-50 border-l border-slate-100 disabled:opacity-50"
              >
                {editSaving ? "Salvataggio..." : "💾 Salva"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FORCE CLOSE */}
      {forceCloseSession && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => !forceCloseSaving && setForceCloseSession(null)}
        >
          <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 bg-red-50">
              <h3 className="text-lg font-extrabold text-slate-800">Chiudi turno forzatamente</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {forceCloseSession.userName} · iniziato alle {formatTimeRome(forceCloseSession.startAt)}
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Orario fine</label>
                <input
                  type="datetime-local"
                  value={forceCloseEndLocal}
                  onChange={(e) => setForceCloseEndLocal(e.target.value)}
                  step="1"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-red-400"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Motivo <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={forceCloseReason}
                  onChange={(e) => setForceCloseReason(e.target.value)}
                  placeholder="Es. Dipendente non ha chiuso"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-red-400 text-sm"
                />
              </div>
              {forceCloseError && <p className="text-xs text-red-600 font-semibold bg-red-50 rounded-lg px-3 py-2">⚠️ {forceCloseError}</p>}
            </div>
            <div className="flex border-t border-slate-100">
              <button
                onClick={() => setForceCloseSession(null)}
                disabled={forceCloseSaving}
                className="flex-1 py-3 text-sm font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-50"
              >
                Annulla
              </button>
              <button
                onClick={submitForceClose}
                disabled={forceCloseSaving}
                className="flex-1 py-3 text-sm font-bold text-red-600 hover:bg-red-50 border-l border-slate-100 disabled:opacity-50"
              >
                {forceCloseSaving ? "Chiusura..." : "🔒 Chiudi forzatamente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Helpers locali — timezone Europe/Rome
// ──────────────────────────────────────────────────
// IMPORTANTE: gli input datetime-local del browser usano il fuso LOCALE del
// computer dell'utente. Se l'admin è in viaggio (es. USA) e modifica un turno,
// senza questi helper gli orari sarebbero SPOSTATI rispetto all'orario reale
// italiano. Questi helper forzano SEMPRE Europe/Rome.

/** Converte millisecondi → stringa "YYYY-MM-DDTHH:MM:SS" rappresentante l'orario Europe/Rome */
function msToDatetimeLocal(ms: number): string {
  // Uso Intl.DateTimeFormat per estrarre i componenti in timezone Roma
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "00";
  // en-GB con hour12:false restituisce "24" alle 00:00 → normalizza
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}:${get("second")}`;
}

/** Converte stringa datetime-local (interpretata come Europe/Rome) → millisecondi UTC */
function datetimeLocalToMs(local: string): number {
  // local = "YYYY-MM-DDTHH:MM:SS" (o senza secondi).
  // Devo interpretarla come orario Europe/Rome e convertire in UTC ms.
  const match = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return NaN;
  const [, Y, M, D, h, m, s] = match;
  // Trovo l'offset UTC di Europe/Rome per quella data (gestisce ora legale/solare)
  // Algoritmo: creo una Date UTC con quei componenti, poi calcolo la differenza
  // rispetto all'orario Europe/Rome in quel momento.
  const asUTC = Date.UTC(+Y!, +M! - 1, +D!, +h!, +m!, s ? +s : 0);
  // Ottengo l'offset di Europe/Rome a quella data
  const romeStr = new Date(asUTC).toLocaleString("en-US", { timeZone: "Europe/Rome" });
  const utcStr = new Date(asUTC).toLocaleString("en-US", { timeZone: "UTC" });
  const offsetMinutes = (new Date(romeStr).getTime() - new Date(utcStr).getTime()) / 60000;
  // asUTC rappresenta i componenti come se fossero UTC; per ottenere l'UTC reale
  // dell'orario Roma dichiarato, sottraggo l'offset
  return asUTC - offsetMinutes * 60000;
}
