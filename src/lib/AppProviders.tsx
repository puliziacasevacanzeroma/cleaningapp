"use client";
import type { ReactNode } from "react";
import { AuthProvider } from "~/lib/firebase/AuthContext";
import { CleaningsProvider } from "~/lib/contexts/CleaningsContext";
import { SplashOverlayHost } from "~/components/SplashOverlay";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <CleaningsProvider>
        {children}
        {/* 🎬 Splash globale: sopravvive a router.push, la pagina di
            destinazione si carica DIETRO di lui e viene rivelata già pronta */}
        <SplashOverlayHost />
      </CleaningsProvider>
    </AuthProvider>
  );
}
