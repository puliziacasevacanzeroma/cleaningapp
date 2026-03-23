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
    const currentUserId = user?.id;
    console.log("🔔 PushInit: user.id =", currentUserId, "sessionInitialized =", sessionInitialized);
    if (!currentUserId) return;

    if (sessionInitialized) {
      console.log("🔔 PushInit: già inizializzato, skip");
      return;
    }

    const init = async () => {
      try {
        if (!isNotificationSupported()) {
          console.warn("🔔 PushInit: notifiche non supportate");
          return;
        }

        const permission = Notification.permission;
        console.log("🔔 PushInit: permesso =", permission);

        if (permission === "denied") {
          console.warn("🔔 PushInit: permesso negato");
          return;
        }

        if (permission === "default") {
          console.log("🔔 PushInit: richiedo permesso...");
          const granted = await requestNotificationPermission();
          if (!granted) {
            console.warn("🔔 PushInit: permesso non concesso");
            return;
          }
        }

        console.log("🔔 PushInit: inizializzo push per", currentUserId);
        const result = await initializePushNotifications(currentUserId);
        if (result.success) {
          sessionInitialized = true;
          console.log("✅ PushInit: token registrato!", result.token?.substring(0, 30) + "...");
        } else {
          console.warn("⚠️ PushInit fallito:", result.error);
        }
      } catch (error) {
        console.error("❌ PushInit errore:", error);
      }
    };

    const timeout = setTimeout(init, 2000);
    return () => clearTimeout(timeout);
  }, [user?.id]);

  return null;
}
