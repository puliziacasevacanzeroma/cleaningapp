/**
 * ============================================================
 * TYPED FIRESTORE HELPERS
 * ============================================================
 *
 * Helper per estrarre dati tipizzati da Firestore DocumentSnapshot.
 *
 * PROBLEMA: doc.data() ritorna DocumentData | undefined, quindi
 * { id: doc.id, ...(doc.data() as Record<string, any>) } ha tipo { id: string } e TypeScript
 * non riconosce le proprietà (TS2339, TS18048).
 *
 * SOLUZIONE: snapToObj<T>(doc) ritorna T & { id: string } | null
 *
 * PRIMA:
 *   const cleaning = { id: doc.id, ...(doc.data() as Record<string, any>) };
 *   cleaning.propertyName // ❌ TS2339
 *
 * DOPO:
 *   const cleaning = snapToObj<Cleaning>(doc);
 *   if (!cleaning) return notFound();
 *   cleaning.propertyName // ✅ OK
 * ============================================================
 */

import type {
  DocumentSnapshot,
  QueryDocumentSnapshot,
  QuerySnapshot,
} from "firebase-admin/firestore";

/**
 * Estrae dati tipizzati da un singolo DocumentSnapshot.
 * Ritorna null se il documento non esiste.
 */
export function snapToObj<T extends Record<string, unknown>>(
  snap: DocumentSnapshot,
): (T & { id: string }) | null {
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as T) };
}

/**
 * Versione per QueryDocumentSnapshot (risultato di query — esiste sempre).
 */
export function queryDocToObj<T extends Record<string, unknown>>(
  snap: QueryDocumentSnapshot,
): T & { id: string } {
  return { id: snap.id, ...(snap.data() as T) };
}

/**
 * Mappa un intero QuerySnapshot a un array tipizzato.
 */
export function queryToArray<T extends Record<string, unknown>>(
  snap: QuerySnapshot,
): (T & { id: string })[] {
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) }));
}
