/**
 * Componente che inizializza le Push Notifications
 * 
 * Va inserito nei layout degli utenti loggati.
 * Registra il token FCM ad ogni mount del componente (ogni sessione).
 */

"use client";

import { useEffect } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import {
  isNotificationSupported,
  requestNotificationPermission,
  initializePushNotifications,
} from "~/lib/firebase/messaging";

// Flag globale per evitare registrazioni multiple nella stessa sessione
// (non useRef perché deve persistere tra re-mount del componente)
let sessionInitialized = false;

export function PushNotificationInit() {
  const { user } = useAuth();

  useEffect(() => {
    // Reset: nuova sessione se l'utente cambia
    const currentUserId = user?.id;
    if (!currentUserId) return;

    // Evita inizializzazioni multiple nella stessa sessione per lo stesso utente
    if (sessionInitialized) return;

    const init = async () => {
      try {
        if (!isNotificationSupported()) {
          return;
        }

        const permission = Notification.permission;

        if (permission === "denied") {
          return;
        }

        if (permission === "default") {
          const granted = await requestNotificationPermission();
          if (!granted) {
            return;
          }
        }

        // Inizializza push (registra SW, ottieni token, salva, foreground handler)
        const result = await initializePushNotifications(currentUserId);
        if (result.success) {
          sessionInitialized = true;
        } else {
          console.warn("⚠️ Push init fallito:", result.error);
        }
      } catch (error) {
        console.error("❌ Errore init push:", error);
      }
    };

    // Ritarda di 2 secondi per non bloccare il rendering
    const timeout = setTimeout(init, 2000);
    return () => clearTimeout(timeout);
  }, [user?.id]);

  return null;
}
