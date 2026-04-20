import { adminDb } from "~/lib/firebase/admin";

/**
 * Utility server-side per verificare che un utente abbia il turno attivo.
 *
 * Legge il doc `activeShifts/{userId}` — se esiste, l'utente ha un turno OPEN.
 * Lettura serializzabile, zero query con composite index.
 *
 * Uso:
 *   const { onShift, sessionId } = await checkActiveShift(user.id);
 *   if (!onShift) return 403 SHIFT_REQUIRED
 */

export interface ActiveShiftResult {
  onShift: boolean;
  sessionId: string | null;
  startAt: any | null;
}

/**
 * Verifica server-side se l'utente ha un turno attivo (OPEN).
 *
 * @param userId ID dell'utente da controllare
 * @returns { onShift: true/false, sessionId, startAt }
 */
export async function checkActiveShift(userId: string): Promise<ActiveShiftResult> {
  if (!userId) return { onShift: false, sessionId: null, startAt: null };
  try {
    const lockRef = adminDb.collection("activeShifts").doc(userId);
    const snap = await lockRef.get();
    if (!snap.exists) {
      return { onShift: false, sessionId: null, startAt: null };
    }
    const data = snap.data() || {};
    return {
      onShift: true,
      sessionId: data.sessionId || null,
      startAt: data.startAt || null,
    };
  } catch (e) {
    console.error("Errore checkActiveShift per", userId, e);
    // In caso di errore di lettura, per sicurezza NON blocchiamo il lavoro
    // (meglio che un operatore possa lavorare con qualche secondo di disservizio
    // piuttosto che bloccarlo per un errore di rete temporaneo).
    // Ritorniamo onShift=true per non bloccare. Log in console per il debug.
    return { onShift: true, sessionId: null, startAt: null };
  }
}
