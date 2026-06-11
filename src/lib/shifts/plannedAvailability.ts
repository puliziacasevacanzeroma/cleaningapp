/**
 * plannedAvailability.ts — util SERVER (admin SDK) per la disponibilità pianificata.
 *
 * Wrappa il modulo puro `availability.ts` con le letture/scritture Firestore.
 * Usato dalle route di assegnazione (cleanings/orders) per:
 *   1. verificare se un dipendente è in turno in una data (checkPlannedAvailability)
 *   2. creare l'eccezione "ON" quando l'admin FORZA un'assegnazione fuori turno
 *      (forceShiftOnException) — con notifica al dipendente.
 *
 * FILOSOFIA FAIL-OPEN: se Firestore dà errore in lettura, NON blocchiamo
 * l'assegnazione (stesso principio di checkActiveShift). Meglio un'assegnazione
 * non verificata che un admin bloccato da un errore di rete.
 */

import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "~/lib/firebase/admin";
import { createNotification } from "~/lib/firebase/notifications-admin";
import {
  resolveAvailability,
  exceptionDocId,
  isValidDateKey,
  type AvailabilityResult,
  type ShiftExceptionType,
  type WorkSchedule,
} from "./availability";

export const EXCEPTIONS_COLLECTION = "shiftExceptions";

export interface PlannedAvailabilityCheck extends AvailabilityResult {
  /** true se il check non è stato possibile (errore lettura): fail-open */
  unchecked?: boolean;
}

/**
 * Converte la data di una pulizia/ordine (Timestamp/Date) in dateKey Europe/Rome.
 * Ritorna null se la data non è interpretabile.
 */
export function dateKeyFromScheduled(raw: unknown): string | null {
  try {
    let d: Date | null = null;
    if (!raw) return null;
    if (raw instanceof Date) d = raw;
    else if (typeof (raw as any).toDate === "function") d = (raw as any).toDate();
    else if (typeof raw === "number") d = new Date(raw);
    else if (typeof raw === "string") d = new Date(raw);
    if (!d || isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
  } catch {
    return null;
  }
}

/**
 * Verifica la disponibilità PIANIFICATA di un utente in una data.
 * Legge users/{id}.workSchedule + shiftExceptions/{userId_dateKey}.
 *
 * @param userData opzionale: se la route ha GIÀ caricato il doc utente,
 *   passalo qui per risparmiare una lettura (si usa userData.workSchedule).
 */
export async function checkPlannedAvailability(
  userId: string,
  dateKey: string,
  userData?: Record<string, any> | null
): Promise<PlannedAvailabilityCheck> {
  if (!userId || !isValidDateKey(dateKey)) {
    // dateKey non valida = non possiamo verificare: fail-open
    return { available: true, source: "default", unchecked: true };
  }
  try {
    let schedule: WorkSchedule | null | undefined = userData?.workSchedule;
    if (userData === undefined) {
      const userSnap = await adminDb.collection("users").doc(userId).get();
      schedule = userSnap.exists ? (userSnap.data() as any)?.workSchedule : null;
    }

    const excSnap = await adminDb
      .collection(EXCEPTIONS_COLLECTION)
      .doc(exceptionDocId(userId, dateKey))
      .get();
    const excType: ShiftExceptionType | null = excSnap.exists
      ? ((excSnap.data() as any)?.type === "OFF" ? "OFF" : "ON")
      : null;

    return resolveAvailability(schedule, excType, dateKey);
  } catch (e) {
    console.error("checkPlannedAvailability errore (fail-open):", userId, dateKey, e);
    return { available: true, source: "default", unchecked: true };
  }
}

/**
 * Crea/sovrascrive l'eccezione "ON" (turno extra / chiamata d'urgenza) per
 * (userId, dateKey) e notifica il dipendente.
 *
 * Chiamata dalle route assign quando l'admin conferma `force:true`.
 * Idempotente: doc ID deterministico, una seconda forzatura aggiorna la stessa eccezione.
 *
 * La notifica è fire-and-forget: se fallisce, l'eccezione resta comunque scritta.
 */
export async function forceShiftOnException(params: {
  userId: string;
  userName: string;
  userRole: string; // "OPERATORE_PULIZIE" | "RIDER"
  dateKey: string;
  createdBy: { id: string; name: string };
  reason?: string | null;
  contextLabel?: string; // es. nome proprietà, per il reason di default
}): Promise<void> {
  const { userId, userName, userRole, dateKey, createdBy, reason, contextLabel } = params;
  if (!userId || !isValidDateKey(dateKey)) return;

  const now = Timestamp.now();
  const finalReason =
    (reason && reason.trim()) ||
    `Chiamata d'urgenza${contextLabel ? ` — ${contextLabel}` : ""} (assegnazione forzata)`;

  await adminDb
    .collection(EXCEPTIONS_COLLECTION)
    .doc(exceptionDocId(userId, dateKey))
    .set(
      {
        userId,
        userName,
        userRole,
        dateKey,
        type: "ON",
        reason: finalReason,
        createdBy: createdBy.id,
        createdByName: createdBy.name,
        createdAt: now,
        updatedAt: now,
        forced: true, // distingue le urgenze dalle eccezioni ON create a mano nella pagina turni
      },
      { merge: true }
    );

  // Notifica al dipendente (fire-and-forget)
  try {
    const dateStr = new Date(dateKey + "T12:00:00Z").toLocaleDateString("it-IT", {
      timeZone: "Europe/Rome",
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    await createNotification({
      title: "📅 Turno aggiunto",
      message: `Sei stato aggiunto in turno per ${dateStr}${contextLabel ? ` (${contextLabel})` : ""}.`,
      type: "SHIFT_EXCEPTION_ON",
      recipientRole: userRole,
      recipientId: userId,
      senderId: createdBy.id,
      senderName: createdBy.name,
      link: userRole === "RIDER" ? "/rider" : "/operatore",
    });
  } catch (e) {
    console.error("forceShiftOnException: notifica fallita (non bloccante):", e);
  }
}
