"use client";

/**
 * 🔌 WATCHDOG CANALE DI RETE FIRESTORE
 *
 * PROBLEMA (visto in produzione su PWA mobile): dopo un resume dal background o
 * durante la navigazione, il WebChannel di Firestore può restare "zombie":
 * i listener non ricevono più snapshot e perfino i getDocs restano appesi.
 * Risultato: dashboard admin e calendario proprietario bloccati su caricamento.
 *
 * CURA: al ritorno in primo piano facciamo una LETTURA DI PROVA leggera
 * (inventory, limit 1). Se non risponde entro il timeout, il canale è morto:
 * lo riavviamo con disableNetwork() + enableNetwork(). I listener attivi si
 * riagganciano da soli sul canale nuovo e gli snapshot ripartono.
 *
 * I fallback nelle varie superfici possono anche chiamare kickFirestoreNetwork()
 * direttamente quando una loro lettura one-shot va in timeout.
 */

import { disableNetwork, enableNetwork, getDocs, query, collection, limit } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

const PROBE_TIMEOUT_MS = 4000;   // se la lettura di prova non risponde entro 4s → canale morto
const MIN_PROBE_GAP_MS = 15000;  // max una prova ogni 15s (i micro alt-tab non spammano letture)
const MIN_KICK_GAP_MS = 20000;   // max un riavvio canale ogni 20s

let probing = false;
let lastProbeAt = 0;
let lastKickAt = 0;
let installed = false;

const timeoutAfter = (ms: number) =>
  new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));

/**
 * Riavvia il canale di rete Firestore (disable + enable).
 * I listener onSnapshot attivi sopravvivono e si riagganciano da soli.
 */
export async function kickFirestoreNetwork(reason: string): Promise<void> {
  const now = Date.now();
  if (now - lastKickAt < MIN_KICK_GAP_MS) return;
  lastKickAt = now;
  console.warn(`🔌 [firestore] canale di rete bloccato (${reason}) → riavvio disable/enableNetwork`);
  try { await disableNetwork(db); } catch { /* no-op */ }
  try { await enableNetwork(db); } catch { /* no-op */ }
}

/** Lettura di prova: se non risponde, riavvia il canale. */
async function probeAndKick(trigger: string): Promise<void> {
  const now = Date.now();
  if (probing || now - lastProbeAt < MIN_PROBE_GAP_MS) return;
  probing = true;
  lastProbeAt = now;
  try {
    await Promise.race([
      getDocs(query(collection(db, "inventory"), limit(1))),
      timeoutAfter(PROBE_TIMEOUT_MS),
    ]);
    // Canale vivo: nulla da fare.
  } catch {
    await kickFirestoreNetwork(`probe senza risposta dopo ${trigger}`);
  } finally {
    probing = false;
  }
}

/**
 * Installa il watchdog (idempotente). Da chiamare una volta in AppProviders.
 * Controlla il canale a ogni ritorno in primo piano dell'app.
 */
export function installFirestoreNetworkWatchdog(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;

  const onMaybeVisible = () => {
    if (document.visibilityState === "visible") {
      // Piccolo ritardo: diamo al canale l'occasione di riattaccarsi da solo
      setTimeout(() => probeAndKick("resume"), 1200);
    }
  };

  document.addEventListener("visibilitychange", onMaybeVisible);
  window.addEventListener("pageshow", onMaybeVisible);
  // Page Lifecycle API (mobile): il resume può arrivare senza visibilitychange
  document.addEventListener("resume", onMaybeVisible as EventListener);
}
