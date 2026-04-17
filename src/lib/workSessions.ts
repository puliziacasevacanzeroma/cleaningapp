/**
 * Sistema timbrature (badge inizio/fine turno).
 *
 * Collezione Firestore: `workSessions`
 * Un documento per ogni sessione di lavoro (aperta o chiusa).
 *
 * Invariante: un utente può avere al massimo UNA sessione con status="OPEN"
 * alla volta. Enforce tramite transaction sul server (API).
 */

export type WorkSessionStatus = "OPEN" | "CLOSED";

export interface WorkSessionEdit {
  editedAt: any;          // Timestamp
  editedBy: string;       // userId dell'admin
  editedByName: string;
  field: "startAt" | "endAt" | "notes";
  prev: any;              // valore precedente (Timestamp o string)
  next: any;              // valore nuovo
  reason?: string;
}

export interface WorkSession {
  id: string;
  userId: string;
  userName: string;
  userRole: string;        // OPERATORE_PULIZIE | RIDER
  startAt: any;            // Timestamp
  endAt: any | null;       // Timestamp o null se OPEN
  status: WorkSessionStatus;
  dateKey: string;         // "YYYY-MM-DD" del giorno di inizio (Europe/Rome)
  durationMinutes: number | null; // calcolato al close
  notes?: string;
  alertedAt?: any | null;  // se cron alert 20:00 già mandato
  editHistory?: WorkSessionEdit[];
  createdAt?: any;
  updatedAt?: any;
}

/**
 * Converti una Date in dateKey "YYYY-MM-DD" timezone Europe/Rome.
 * Usato per raggruppare sessioni per giornata lavorativa.
 */
export function toDateKeyRome(date: Date): string {
  // 'en-CA' dà ISO YYYY-MM-DD. Con timeZone: 'Europe/Rome' abbiamo la data corretta
  return date.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
}

/**
 * Calcola la durata in minuti tra due Timestamp-like.
 * Accetta Timestamp Firestore, Date, o numero di millisecondi.
 */
export function computeDurationMinutes(startAt: any, endAt: any): number {
  const start = toMillis(startAt);
  const end = toMillis(endAt);
  if (!start || !end) return 0;
  return Math.max(0, Math.round((end - start) / 60000));
}

/**
 * Converte vari formati (Timestamp, Date, number, string ISO) in millisecondi.
 */
export function toMillis(ts: any): number {
  if (!ts) return 0;
  if (typeof ts === "number") return ts;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === "string") return new Date(ts).getTime();
  // Firestore Timestamp: ha .toMillis() o { seconds, nanoseconds }
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number") return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1e6);
  if (typeof ts._seconds === "number") return ts._seconds * 1000 + Math.floor((ts._nanoseconds || 0) / 1e6);
  return 0;
}

/**
 * Formatta durata in minuti come "Xh Ym Zs" per il timer live.
 * Se nowMillis è fornito, calcola fino a quello (per sessioni OPEN).
 */
export function formatDurationLive(startAt: any, endAt: any | null, nowMillis?: number): string {
  const startMs = toMillis(startAt);
  if (!startMs) return "—";
  const endMs = endAt ? toMillis(endAt) : (nowMillis ?? Date.now());
  const diffMs = Math.max(0, endMs - startMs);
  const totSec = Math.floor(diffMs / 1000);
  const h = Math.floor(totSec / 3600);
  const m = Math.floor((totSec % 3600) / 60);
  const s = totSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * Formatta durata in minuti come "5h 23m" (per elenchi/report).
 */
export function formatDurationHM(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Formatta un Timestamp come ora "HH:MM" in Europe/Rome.
 */
export function formatTimeRome(ts: any): string {
  const ms = toMillis(ts);
  if (!ms) return "—";
  return new Date(ms).toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
}

/**
 * Formatta un Timestamp come data+ora "DD/MM HH:MM" in Europe/Rome.
 */
export function formatDateTimeRome(ts: any): string {
  const ms = toMillis(ts);
  if (!ms) return "—";
  const d = new Date(ms);
  const date = d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit" });
  const time = d.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`;
}
