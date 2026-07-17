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
import { useAuth } from "~/lib/firebase/AuthContext";
import { splashOverlay } from "~/components/SplashOverlay";

// 🚀 PERF v2: RIMOSSO splashPrefetch. Scaricava TUTTE le properties + cleanings
// + operators via getDocs, mentre la pagina di destinazione (già montata dietro
// lo splash) scaricava le STESSE collezioni coi suoi listener onSnapshot →
// doppio traffico nel momento più congestionato, notifiche/pulizie in ritardo.
// La pagina si carica da sola: cache localStorage subito, realtime a seguire.
//
// Margine minimo per la pagina di destinazione per renderizzare dietro lo splash.
const GRACE_MS = 250;

const wait = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
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

      // Prefetch del solo chunk JS della destinazione (leggero, no dati)
      try { router.prefetch(destination); } catch { /* no-op */ }

      // 🚀 Naviga SUBITO: la pagina si carica DIETRO lo splash coi SUOI listener
      router.push(destination);

      // Grazia breve, poi chiudi: la pagina mostra subito la cache locale
      await wait(GRACE_MS);
      splashOverlay.finish();
    };
    run();
  }, [user, loading, router]);

  // Sfondo identico allo splash: nessun flash prima che l'overlay compaia
  return (
    <div
      className="min-h-screen"
      style={{ background: "linear-gradient(180deg, #63cef2 0%, #3aa9e0 50%, #2a83c8 100%)" }}
    />
  );
}
