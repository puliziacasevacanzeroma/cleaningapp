"use client";

/**
 * ════════════════════════════════════════════════════════════════════
 * useDeepNotifications — leggere OLTRE il feed recente
 * ════════════════════════════════════════════════════════════════════
 *
 * IL PROBLEMA
 * Il listener realtime (`subscribeToAdminNotifications`) carica solo le
 * ultime `NOTIFICATION_FEED_LIMIT` = 100 notifiche di TUTTA la flotta.
 * Con ~80 appartamenti attivi coprono uno o due giorni: cercando un
 * singolo immobile ne compaiono due o tre, e le "Pulizia completata" di
 * qualche giorno fa semplicemente non ci sono — non perché il filtro
 * sbagli, ma perché non sono mai state caricate.
 *
 * PERCHÉ NON SI ALZA IL LIMITE
 * Quel listener è sempre attivo su ogni schermata. Alzarlo rallenta
 * l'app per tutti e sempre — ed è già stato un problema di performance
 * in passato — per un caso d'uso occasionale.
 *
 * LA SOLUZIONE
 * Una lettura MIRATA, una tantum, solo quando l'utente sceglie un
 * periodo. Dipinge subito dalla cache locale (IndexedDB, già attiva via
 * `persistentLocalCache`) e allinea col server in sottofondo.
 *
 * Vive qui e non dentro i componenti perché serve identica in due punti
 * — campanella e pagina Centro Messaggi — e due copie divergerebbero.
 */

import { useState, useEffect } from "react";
import {
  collection, query, where, orderBy, limit, Timestamp,
  getDocs, getDocsFromCache,
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";

/**
 * Tetto sulla lettura mirata. Oltre i 300 risultati nessuno scorre più:
 * si restringe il periodo. Tenerlo basso è anche ciò che la rende veloce.
 */
export const DEEP_LIMIT = 300;

/**
 * Cache di modulo per chiave (ruolo + data "Da"). Riselezionare lo stesso
 * periodo, o riaprire il pannello, è istantaneo invece di rifare il giro
 * sul server. Vive quanto la pagina.
 */
const deepCache = new Map<string, any[]>();

export interface DeepNotificationsResult {
  /** Notifiche del periodo, o null se la lettura mirata non è attiva. */
  rows: any[] | null;
  loading: boolean;
  /** Il periodo ha superato il tetto: ne mancano di più vecchie. */
  capped: boolean;
}

export function useDeepNotifications(args: {
  /** Attiva la lettura solo quando serve (pannello aperto, scheda giusta…). */
  enabled: boolean;
  /** Data "Da" in formato "YYYY-MM-DD". È l'unico estremo che guida la query. */
  from: string;
  isAdmin: boolean;
  userId?: string;
}): DeepNotificationsResult {
  const { enabled, from, isAdmin, userId } = args;
  const [rows, setRows] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [capped, setCapped] = useState(false);

  useEffect(() => {
    if (!enabled || !from) {
      setRows(null);
      setCapped(false);
      setLoading(false);
      return;
    }

    const cacheKey = `${isAdmin ? "admin" : userId || "?"}:${from}`;

    // 1) Già letto in questa sessione → istantaneo.
    const cached = deepCache.get(cacheKey);
    if (cached) {
      setRows(cached);
      setCapped(cached.length >= DEEP_LIMIT);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const since = new Date(from);
    since.setHours(0, 0, 0, 0);
    const clauses: any[] = isAdmin
      ? [where("recipientRole", "in", ["ADMIN", "ALL"])]
      : [where("recipientId", "==", userId || "__none__")];
    clauses.push(where("createdAt", ">=", Timestamp.fromDate(since)));
    const q = query(
      collection(db, "notifications"),
      ...clauses,
      orderBy("createdAt", "desc"),
      limit(DEEP_LIMIT),
    );

    const shape = (snap: any) => {
      let out = snap.docs.map((d: any) => ({ id: d.id, ...(d.data() as Record<string, any>) }));
      // Con più admin ogni notifica esiste in copia per ciascuno:
      // si tengono le broadcast e le proprie. Stessa regola del listener.
      if (isAdmin && userId) {
        out = out.filter((n: any) => !n.recipientId || n.recipientId === userId);
      }
      return out;
    };

    (async () => {
      // 2) Dipingi subito da IndexedDB: quasi tutto è già su disco.
      try {
        const cachedSnap = await getDocsFromCache(q);
        if (!cancelled && cachedSnap.docs.length > 0) {
          setRows(shape(cachedSnap));
          setCapped(cachedSnap.docs.length >= DEEP_LIMIT);
        }
      } catch {
        /* niente in cache: si aspetta la rete */
      }

      // 3) Poi allinea col server, senza far aspettare l'utente.
      setLoading(true);
      try {
        const snap = await getDocs(q);
        if (cancelled) return;
        const shaped = shape(snap);
        deepCache.set(cacheKey, shaped);
        setRows(shaped);
        setCapped(snap.docs.length >= DEEP_LIMIT);
      } catch {
        /* offline o errore: restano i dati della cache */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [enabled, from, isAdmin, userId]);

  return { rows, loading, capped };
}
