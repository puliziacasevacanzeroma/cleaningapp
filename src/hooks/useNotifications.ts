"use client";

import { useState, useEffect, useCallback } from "react";
import { Timestamp } from "firebase/firestore";
import { useAuth } from "~/lib/firebase/AuthContext";
import {
  subscribeToNotifications,
  subscribeToAdminNotifications,
  markAsRead,
  markAllAsRead,
  archiveNotification,
  deleteNotification,
  deleteAllNotifications,
  handleNotificationAction,
  createDeletionRequestNotification,
  createNewPropertyNotification,
  createActionResultNotification,
} from "~/lib/firebase/notifications";
import type { FirebaseNotification } from "~/lib/firebase/types";

interface UseNotificationsReturn {
  notifications: FirebaseNotification[];
  unreadCount: number;
  pendingActionsCount: number;
  loading: boolean;
  error: string | null;
  
  // Azioni
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  archiveNotification: (id: string) => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  deleteAllNotifications: () => Promise<number>;
  handleAction: (id: string, action: "APPROVED" | "REJECTED", note?: string) => Promise<void>;
  
  // Helper per creare notifiche
  requestPropertyDeletion: (propertyId: string, propertyName: string) => Promise<string>;
  notifyNewProperty: (propertyId: string, propertyName: string) => Promise<string>;
  notifyActionResult: (recipientId: string, propertyName: string, approved: boolean, note?: string) => Promise<string>;
}

export function useNotifications(): UseNotificationsReturn {
  const { user, isAdmin } = useAuth();
  const [notifications, setNotifications] = useState<FirebaseNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sottoscrizione real-time alle notifiche
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Usa listener diverso per admin
    const unsubscribe = isAdmin
      ? subscribeToAdminNotifications((notifs) => {
          setNotifications(notifs);
          setLoading(false);
        }, user.id)
      : subscribeToNotifications(user.role, user.id, (notifs) => {
          setNotifications(notifs);
          setLoading(false);
        });

    return () => {
      unsubscribe();
    };
  }, [user, isAdmin]);

  // Conta notifiche non lette (escludi archiviate)
  const unreadCount = notifications.filter(n => n.status === "UNREAD").length;

  // Conta azioni pendenti (solo per admin) - escludi archiviate
  const pendingActionsCount = notifications.filter(
    n => n.actionRequired && n.actionStatus === "PENDING" && n.status !== "ARCHIVED"
  ).length;

  // Segna come letta
  const handleMarkAsRead = useCallback(async (id: string) => {
    try {
      await markAsRead(id);
    } catch (err) {
      console.error("Errore marking as read:", err);
      setError("Errore nel segnare come letta");
    }
  }, []);

  // Segna tutte come lette
  // 🚀 PERF: optimistic update + operazione DB in background.
  //    - UI: aggiorno IMMEDIATAMENTE lo state (badge a 0, tutte READ).
  //      Niente attesa, niente spinner, niente blocco utente.
  //    - DB: lancio il writeBatch in background. Se fallisce, revert dello
  //      state + messaggio errore (caso edge, raro).
  //    - In ogni caso il listener onSnapshot ricaricherà comunque lo stato
  //      reale dal DB nei secondi successivi.
  const handleMarkAllAsRead = useCallback(async () => {
    if (!user) return;

    // 📸 Snapshot dello stato corrente per eventuale revert in caso di errore
    const previousNotifications = notifications;

    // 1. OPTIMISTIC: aggiorno la UI subito (UNREAD → READ in memoria)
    const now = Timestamp.now();
    setNotifications(prev =>
      prev.map(n =>
        n.status === "UNREAD"
          ? { ...n, status: "READ", readAt: now, updatedAt: now }
          : n
      )
    );

    // 2. DB: lancio in background, non blocco l'UI
    //    NON aspetto await: se fallisce gestisco nel .catch
    markAllAsRead(user.role, user.id).catch(err => {
      console.error("Errore marking all as read:", err);
      setError("Errore nel segnare tutte come lette. Riprovo in background...");
      // Revert: ripristino lo stato precedente
      setNotifications(previousNotifications);
    });
  }, [user, notifications]);

  // Archivia notifica
  const handleArchive = useCallback(async (id: string) => {
    try {
      await archiveNotification(id);
    } catch (err) {
      console.error("Errore archiviazione:", err);
      setError("Errore nell'archiviazione");
    }
  }, []);

  // 🗑️ Elimina notifica DEFINITIVAMENTE
  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteNotification(id);
    } catch (err) {
      console.error("Errore eliminazione:", err);
      setError("Errore nell'eliminazione");
    }
  }, []);

  // 🗑️ Elimina TUTTE le notifiche
  const handleDeleteAll = useCallback(async (): Promise<number> => {
    if (!user) return 0;
    
    try {
      const count = await deleteAllNotifications(user.role, user.id);
      return count;
    } catch (err) {
      console.error("Errore eliminazione tutte:", err);
      setError("Errore nell'eliminazione");
      return 0;
    }
  }, [user]);

  // Gestisci azione (approva/rifiuta)
  const handleAction = useCallback(async (
    id: string, 
    action: "APPROVED" | "REJECTED", 
    note?: string
  ) => {
    if (!user) return;
    
    try {
      const result = await handleNotificationAction(id, action, user.id, note);
      
      // Se è una PROPERTY_CHANGE_REQUEST, chiama anche l'API per applicare le modifiche
      if (result?.type === "PROPERTY_CHANGE_REQUEST" && result?.relatedEntityId) {
        
        // Cerca la propertyChangeRequest PENDING
        const searchRes = await fetch(`/api/property-change-request?propertyId=${result.relatedEntityId}&status=PENDING`);
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const pendingRequest = searchData.requests?.[0];
          
          if (pendingRequest) {
            const approveRes = await fetch("/api/property-change-request", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                requestId: pendingRequest.id,
                action: action === "APPROVED" ? "APPROVE" : "REJECT",
                adminNote: note || undefined,
              }),
            });
            
            if (approveRes.ok) {
            } else {
              const errData = await approveRes.json().catch(() => ({}));
              console.error("❌ Errore approvazione PropertyChangeRequest:", approveRes.status, errData);
            }
          } else {
            console.warn("⚠️ Nessuna request PENDING trovata");
          }
        }
      }
    } catch (err) {
      console.error("Errore gestione azione:", err);
      setError("Errore nella gestione dell'azione");
    }
  }, [user]);

  // Helper: Richiesta cancellazione proprietà
  const requestPropertyDeletion = useCallback(async (
    propertyId: string, 
    propertyName: string
  ): Promise<string> => {
    if (!user) throw new Error("Utente non autenticato");
    
    return createDeletionRequestNotification(
      propertyId,
      propertyName,
      user.id,
      user.name,
      user.email
    );
  }, [user]);

  // Helper: Notifica nuova proprietà
  const notifyNewProperty = useCallback(async (
    propertyId: string, 
    propertyName: string
  ): Promise<string> => {
    if (!user) throw new Error("Utente non autenticato");
    
    return createNewPropertyNotification(
      propertyId,
      propertyName,
      user.id,
      user.name
    );
  }, [user]);

  // Helper: Notifica risultato azione
  const notifyActionResult = useCallback(async (
    recipientId: string,
    propertyName: string,
    approved: boolean,
    note?: string
  ): Promise<string> => {
    return createActionResultNotification(
      recipientId,
      propertyName,
      approved,
      note
    );
  }, []);

  return {
    notifications,
    unreadCount,
    pendingActionsCount,
    loading,
    error,
    markAsRead: handleMarkAsRead,
    markAllAsRead: handleMarkAllAsRead,
    archiveNotification: handleArchive,
    deleteNotification: handleDelete,
    deleteAllNotifications: handleDeleteAll,
    handleAction,
    requestPropertyDeletion,
    notifyNewProperty,
    notifyActionResult,
  };
}

// Hook semplificato solo per il conteggio (per badge)
export function useUnreadCount(): number {
  const { unreadCount } = useNotifications();
  return unreadCount;
}

// Hook per le azioni pendenti (per admin)
export function usePendingActions(): number {
  const { pendingActionsCount } = useNotifications();
  return pendingActionsCount;
}
