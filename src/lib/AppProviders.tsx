"use client";
import type { ReactNode } from "react";
import { AuthProvider } from "~/lib/firebase/AuthContext";
import { SplashOverlayHost } from "~/components/SplashOverlay";

export function AppProviders({ children }: { children: ReactNode }) {
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
