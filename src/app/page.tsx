"use client";

/**
 * HomePage ("/") — entry della PWA alla riapertura (utente già loggato).
 *
 * PRIMA: window.location.href → /welcome → splash → push → la pagina si
 *        montava DOPO lo splash → spinner visibile 1-2 secondi.
 *
 * ADESSO: stesso flusso overlay del login. Lo splash globale copre tutto,
 *         si naviga SUBITO con router.push (la pagina si carica DIETRO lo
 *         splash), prefetch dati in parallelo, e lo splash chiude solo
 *         quando prefetch + finestra di grazia sono completati → la pagina
 *         appare già renderizzata, zero spinner.
 */

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "~/lib/firebase/AuthContext";
import { splashOverlay } from "~/components/SplashOverlay";
import { splashPrefetch } from "~/lib/splashPrefetch";

// Margine dato alla pagina di destinazione per renderizzare dietro lo splash.
// Se si intravede ancora caricamento, alzalo (es. 1500).
const GRACE_MS = 1100;

const wait = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const startedRef = useRef(false);

  // Splash subito, appena la home si monta: copre anche l'attesa dell'AuthContext.
  // Niente hide nel cleanup: quando navighiamo deve restare visibile sopra la destinazione.
  useEffect(() => {
    splashOverlay.show();
  }, []);

  useEffect(() => {
    if (loading || startedRef.current) return;

    if (!user) {
      splashOverlay.hide();
      window.location.href = "/login";
      return;
    }

    startedRef.current = true;

    const role = user.role?.toUpperCase() || "";

    // Destinazione in base al ruolo
    let destination = "/dashboard";
    if (role === "ADMIN") {
      destination = "/dashboard";
    } else if (["PROPRIETARIO", "OWNER", "CLIENTE"].includes(role)) {
      destination = "/proprietario/calendario/pulizie";
    } else if (["OPERATORE_PULIZIE", "OPERATORE", "OPERATOR"].includes(role)) {
      destination = "/operatore";
    } else if (role === "RIDER") {
      destination = "/rider";
    } else if (role === "LAVANDERIA") {
      destination = "/lavanderia";
    }

    const run = async () => {
      splashOverlay.load(user.name || "Utente");
      sessionStorage.setItem("splash-shown", "true");

      // Prefetch dati (cache react-query) + chunk JS della destinazione
      const dataPromise = splashPrefetch(queryClient, user.id, destination, (t) => splashOverlay.setText(t));
      try { router.prefetch(destination); } catch { /* no-op */ }

      // 🚀 Naviga SUBITO: la pagina si carica DIETRO lo splash
      router.push(destination);

      // Chiudi solo quando: prefetch finito E passata la finestra di grazia
      await Promise.allSettled([dataPromise, wait(GRACE_MS)]);
      splashOverlay.finish();
    };
    run();
  }, [user, loading, router, queryClient]);

  // Sfondo identico allo splash: nessun flash prima che l'overlay compaia
  return (
    <div
      className="min-h-screen"
      style={{ background: "linear-gradient(180deg, #63cef2 0%, #3aa9e0 50%, #2a83c8 100%)" }}
    />
  );
}
