"use client";
import { useEffect, type ReactNode } from "react";
import { AuthProvider } from "~/lib/firebase/AuthContext";
import { SplashOverlayHost } from "~/components/SplashOverlay";
import { installFirestoreNetworkWatchdog } from "~/lib/firebase/networkWatchdog";

export function AppProviders({ children }: { children: ReactNode }) {
  // 🔌 Watchdog canale Firestore: al resume dell'app verifica con una lettura
  // di prova che il canale realtime sia vivo; se è zombie lo riavvia.
  // Cura per: dashboard admin / calendario proprietario bloccati su caricamento.
  useEffect(() => {
    installFirestoreNetworkWatchdog();
  }, []);

  return (
    <AuthProvider>
      {children}
      {/* 🎬 Splash globale: sopravvive a router.push, la pagina di
          destinazione si carica DIETRO di lui e viene rivelata già pronta */}
      <SplashOverlayHost />
    </AuthProvider>
  );
}

// 🚀 PERF v2: RIMOSSO CleaningsProvider dal root. Apriva 4 listener Firestore
// (tra cui l'INTERA collezione `bookings` senza filtro) su OGNI pagina per OGNI
// ruolo, ma l'unico consumatore di useCleanings è
// /dashboard/calendario/prenotazioni: ora il provider è montato SOLO lì.
