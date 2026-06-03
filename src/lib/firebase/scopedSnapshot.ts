"use client";

/**
 * subscribeByPropertyChunks — sottoscrive una collection (cleanings/orders)
 * filtrando per `propertyId IN [...]`, suddividendo in blocchi da 30 (limite
 * Firestore per l'operatore `in`) e fondendo i risultati.
 *
 * PERCHÉ: prima gli hook scaricavano TUTTE le pulizie/ordini di TUTTI i
 * proprietari nel range temporale e filtravano lato client → migliaia di
 * documenti per ogni apertura della dashboard. Scopando per proprietà si
 * scaricano solo i documenti del proprietario corrente (poche centinaia).
 *
 * NB: la query usa solo `where("propertyId","in",...)` (indice automatico su
 * singolo campo) — niente range su scheduledDate, così NON serve un indice
 * composito. Il filtro per mese/data resta a valle (computeMonthDebt).
 */

import {
  collection, query, where, onSnapshot,
  type Unsubscribe, type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export function subscribeByPropertyChunks<T>(
  collectionName: string,
  propertyIds: string[],
  transform: (doc: QueryDocumentSnapshot) => T,
  onData: (items: T[]) => void,
  onError?: (e: unknown) => void,
): Unsubscribe {
  if (!propertyIds || propertyIds.length === 0) {
    onData([]);
    return () => {};
  }

  // Blocchi da 30 (limite operatore `in` di Firestore)
  const chunks: string[][] = [];
  for (let i = 0; i < propertyIds.length; i += 30) chunks.push(propertyIds.slice(i, i + 30));

  // Risultati parziali per blocco, fusi per docId a ogni snapshot
  const partial: Array<Map<string, T>> = chunks.map(() => new Map());

  const unsubs = chunks.map((chunk, ci) =>
    onSnapshot(
      query(collection(db, collectionName), where("propertyId", "in", chunk)),
      (snap) => {
        const m = new Map<string, T>();
        snap.docs.forEach((d) => m.set(d.id, transform(d)));
        partial[ci] = m;
        const merged: T[] = [];
        partial.forEach((mm) => mm.forEach((v) => merged.push(v)));
        onData(merged);
      },
      (err) => { if (onError) onError(err); },
    ),
  );

  return () => unsubs.forEach((u) => { try { u(); } catch {} });
}
