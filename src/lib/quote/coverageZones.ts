/**
 * coverageZones.ts — Zone coperte dal servizio (lato server)
 * v1 — 06/07/2026
 *
 * Struttura Firestore: collection `coverageZones`
 *   - ID documento = CAP (es. "00165")
 *   - campi: { attivo: boolean, note?: string, aggiornatoIl?: Timestamp }
 * Per aggiungere/togliere una zona basta creare/disattivare il documento:
 * nessun deploy necessario. (La UI admin per gestirle arriva con la dashboard.)
 */
import { adminDb } from '~/lib/firebase/admin';

/** Fallback usato SOLO se la collection è vuota o Firestore non risponde:
 *  meglio classificare tutto "in_valutazione" che bloccare il widget. */
const FALLBACK_CAPS: string[] = [];

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { caps: string[]; scadenza: number } | null = null;

export async function getCoveredCaps(): Promise<string[]> {
  if (cache && Date.now() < cache.scadenza) return cache.caps;
  try {
    const snap = await adminDb.collection('coverageZones').get();
    const caps = snap.docs
      .filter((d) => d.data()?.attivo !== false)
      .map((d) => d.id.trim())
      .filter((id) => /^\d{5}$/.test(id));
    const result = caps.length > 0 ? caps : FALLBACK_CAPS;
    cache = { caps: result, scadenza: Date.now() + CACHE_TTL_MS };
    return result;
  } catch (err) {
    console.error('[coverageZones] Errore lettura Firestore:', err);
    return cache?.caps ?? FALLBACK_CAPS;
  }
}

/** Invalida la cache (da chiamare dopo modifiche admin alle zone). */
export function invalidateCoverageCache(): void {
  cache = null;
}
