"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import {
  pulizieStore,
  type PulizieStoreState,
} from "~/lib/stores/pulizieDataStore";

// Re-export types per comodità
export type { PulizieProperty, PulizieCleaning, PulizieOperator, PulizieOrder, PulizieInventoryItem } from "~/lib/stores/pulizieDataStore";

/**
 * Hook che si connette al PulizieDataStore singleton.
 * 
 * COMPORTAMENTO:
 * - Prima visita: spinner (initialLoading=true) → arrivano dati → render
 * - Navighi via e torni: dati SUBITO dalla cache (0ms), listener aggiornano in background
 * - Cambio dato in Firestore: aggiornamento silenzioso, nessun flash
 */
export function usePulizieData(): PulizieStoreState {
  const { user } = useAuth();
  const isAdmin = user?.role?.toUpperCase() === "ADMIN";

  // Avvia listener al primo mount con utente disponibile
  // NON li ferma su unmount — restano attivi tra navigazioni
  useEffect(() => {
    if (!user?.id) return;
    pulizieStore.start(user.id, isAdmin);
  }, [user?.id, isAdmin]);

  // Connettiti allo store con useSyncExternalStore
  // Questo è il modo React 18+ corretto — nessun tearing, nessun flash
  return useSyncExternalStore(
    pulizieStore.subscribe,
    pulizieStore.getSnapshot,
    pulizieStore.getSnapshot, // server snapshot (SSR)
  );
}
