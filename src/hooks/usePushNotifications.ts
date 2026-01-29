/**
 * Hook per gestire le Push Notifications lato client
 * 
 * Uso:
 * const { 
 *   isSupported, 
 *   permission, 
 *   requestPermission, 
 *   initializePush 
 * } = usePushNotifications();
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import {
  isNotificationSupported,
  getNotificationPermissionStatus,
  requestNotificationPermission,
  initializePushNotifications,
  onForegroundMessage,
  type NotificationPayload,
} from "~/lib/firebase/messaging";

// ==================== TIPI ====================

export interface UsePushNotificationsReturn {
  // Stato
  isSupported: boolean;
  permission: NotificationPermission | "unsupported" | "loading";
  isInitialized: boolean;
  token: string | null;
  error: string | null;
  
  // Azioni
  requestPermission: () => Promise<boolean>;
  initializePush: () => Promise<boolean>;
  
  // Callbacks
  onNotification: (callback: (payload: NotificationPayload) => void) => () => void;
}

// ==================== HOOK ====================

export function usePushNotifications(): UsePushNotificationsReturn {
  const { user } = useAuth();
  
  // Stato
  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported" | "loading">("loading");
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Verifica supporto al mount
  useEffect(() => {
    const supported = isNotificationSupported();
    setIsSupported(supported);
    
    if (supported) {
      setPermission(getNotificationPermissionStatus());
    } else {
      setPermission("unsupported");
    }
  }, []);

  // Richiedi permesso
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      setError("Notifiche push non supportate");
      return false;
    }

    try {
      const granted = await requestNotificationPermission();
      setPermission(granted ? "granted" : "denied");
      return granted;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore richiesta permesso");
      return false;
    }
  }, [isSupported]);

  // Inizializza completamente
  const initializePush = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      setError("Notifiche push non supportate");
      return false;
    }

    if (!user?.uid) {
      setError("Utente non autenticato");
      return false;
    }

    try {
      setError(null);
      const result = await initializePushNotifications(user.uid);
      
      if (result.success && result.token) {
        setToken(result.token);
        setIsInitialized(true);
        setPermission("granted");
        return true;
      } else {
        setError(result.error || "Inizializzazione fallita");
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore inizializzazione");
      return false;
    }
  }, [isSupported, user?.uid]);

  // Callback per notifiche in foreground
  const onNotification = useCallback((
    callback: (payload: NotificationPayload) => void
  ): (() => void) => {
    const unsubscribe = onForegroundMessage(callback);
    return unsubscribe || (() => {});
  }, []);

  // Auto-inizializza se già permesso e utente loggato
  useEffect(() => {
    if (isSupported && permission === "granted" && user?.uid && !isInitialized) {
      initializePush();
    }
  }, [isSupported, permission, user?.uid, isInitialized, initializePush]);

  return {
    isSupported,
    permission,
    isInitialized,
    token,
    error,
    requestPermission,
    initializePush,
    onNotification,
  };
}

// ==================== COMPONENTE HELPER ====================

/**
 * Componente per mostrare banner richiesta permesso notifiche
 */
export function PushNotificationBanner({ 
  onDismiss 
}: { 
  onDismiss?: () => void 
}) {
  const { isSupported, permission, requestPermission } = usePushNotifications();
  const [dismissed, setDismissed] = useState(false);

  // Non mostrare se non supportato, già concesso/negato, o dismissato
  if (!isSupported || permission !== "default" || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  const handleEnable = async () => {
    await requestPermission();
    setDismissed(true);
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4 z-50">
      <div className="flex items-start gap-3">
        <div className="text-2xl">🔔</div>
        <div className="flex-1">
          <h3 className="font-medium text-gray-900 dark:text-white">
            Attiva le notifiche
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
            Ricevi aggiornamenti in tempo reale su pulizie, consegne e pagamenti.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleEnable}
              className="px-3 py-1.5 bg-sky-500 text-white text-sm rounded-md hover:bg-sky-600 transition-colors"
            >
              Attiva
            </button>
            <button
              onClick={handleDismiss}
              className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
            >
              Non ora
            </button>
          </div>
        </div>
        <button 
          onClick={handleDismiss}
          className="text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default usePushNotifications;
