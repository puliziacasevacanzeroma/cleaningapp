/**
 * Utility per creare notifiche tramite API o direttamente Firestore
 * Con supporto per Push Notifications via FCM
 */

import { 
  collection, 
  addDoc, 
  Timestamp 
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { 
  getNotificationContent, 
  type NotificationVariables,
  type NotificationPriority 
} from "./notificationTemplates";
import type { NotificationType, NotificationRecipientRole } from "~/lib/firebase/types";
import { sendPushNotification, sendPushToUser, sendPushToRole } from "./sendPushNotification";

// ==================== TIPI ====================

export interface CreateNotificationParams {
  type: string;
  recipientRole: NotificationRecipientRole;
  recipientId?: string;
  senderId: string;
  senderName: string;
  senderEmail?: string;
  variables?: NotificationVariables;
  relatedEntityId?: string;
  relatedEntityType?: "PROPERTY" | "CLEANING" | "BOOKING" | "USER" | "ORDER" | "PAYMENT";
  relatedEntityName?: string;
  actionRequired?: boolean;
  link?: string;
  // Override per titolo/messaggio custom
  customTitle?: string;
  customMessage?: string;
  // Push notification
  sendPush?: boolean; // Se true, invia anche push notification (default: true)
}

export interface NotificationResult {
  success: boolean;
  notificationId?: string;
  error?: string;
}

// ==================== FUNZIONI ====================

/**
 * Crea una notifica direttamente in Firestore (metodo preferito per server-side)
 */
export async function createNotificationDirect(
  params: CreateNotificationParams
): Promise<NotificationResult> {
  try {
    // Ottieni contenuto dal template o usa custom
    const content = params.customTitle && params.customMessage
      ? { 
          title: params.customTitle, 
          message: params.customMessage, 
          priority: "normal" as NotificationPriority 
        }
      : getNotificationContent(params.type, params.variables || {});

    const notificationData = {
      title: content.title,
      message: content.message,
      type: params.type,
      priority: content.priority,
      recipientRole: params.recipientRole,
      recipientId: params.recipientId || null,
      senderId: params.senderId,
      senderName: params.senderName,
      senderEmail: params.senderEmail || null,
      relatedEntityId: params.relatedEntityId || null,
      relatedEntityType: params.relatedEntityType || null,
      relatedEntityName: params.relatedEntityName || null,
      actionRequired: params.actionRequired || false,
      actionStatus: params.actionRequired ? "PENDING" : null,
      link: params.link || null,
      status: "UNREAD",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const docRef = await addDoc(collection(db, "notifications"), notificationData);
    
    console.log(`📬 Notifica creata [${params.type}] per ${params.recipientRole}${params.recipientId ? ` (${params.recipientId})` : ''}:`, docRef.id);
    
    // Invia push notification se abilitato (default: true)
    const shouldSendPush = params.sendPush !== false;
    
    if (shouldSendPush) {
      try {
        const pushData: Record<string, string> = {
          type: params.type,
          notificationId: docRef.id,
        };
        
        if (params.relatedEntityId) {
          pushData.relatedEntityId = params.relatedEntityId;
        }
        if (params.relatedEntityType) {
          pushData.relatedEntityType = params.relatedEntityType;
        }
        if (params.link) {
          pushData.link = params.link;
        }

        // Invia a utente specifico o a ruolo
        if (params.recipientId) {
          await sendPushToUser(
            params.recipientId,
            content.title,
            content.message,
            pushData
          );
        } else if (params.recipientRole && params.recipientRole !== "ALL") {
          await sendPushToRole(
            params.recipientRole as "ADMIN" | "PROPRIETARIO" | "OPERATORE_PULIZIE" | "RIDER",
            content.title,
            content.message,
            pushData
          );
        }
        
        console.log(`📲 Push notification inviata per notifica ${docRef.id}`);
      } catch (pushError) {
        // Non fallire la creazione notifica se la push fallisce
        console.warn("⚠️ Errore invio push notification:", pushError);
      }
    }
    
    return {
      success: true,
      notificationId: docRef.id,
    };
  } catch (error) {
    console.error("Errore creazione notifica:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Errore sconosciuto",
    };
  }
}

/**
 * Crea una notifica tramite API (metodo per client-side)
 */
export async function createNotificationAPI(
  params: CreateNotificationParams
): Promise<NotificationResult> {
  try {
    // Ottieni contenuto dal template
    const content = params.customTitle && params.customMessage
      ? { title: params.customTitle, message: params.customMessage }
      : getNotificationContent(params.type, params.variables || {});

    const response = await fetch("/api/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: params.type,
        title: content.title,
        message: content.message,
        recipientRole: params.recipientRole,
        recipientId: params.recipientId,
        senderId: params.senderId,
        senderName: params.senderName,
        senderEmail: params.senderEmail,
        relatedEntityId: params.relatedEntityId,
        relatedEntityType: params.relatedEntityType,
        relatedEntityName: params.relatedEntityName,
        actionRequired: params.actionRequired,
        link: params.link,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Errore API");
    }

    return {
      success: true,
      notificationId: data.notificationId,
    };
  } catch (error) {
    console.error("Errore API notifica:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Errore sconosciuto",
    };
  }
}

/**
 * Crea notifica - usa il metodo appropriato basato sul contesto
 * Server-side: usa createNotificationDirect
 * Client-side: usa createNotificationAPI (se non hai accesso a Firebase Admin)
 */
export async function createNotification(
  params: CreateNotificationParams
): Promise<NotificationResult> {
  // Per ora usa sempre il metodo diretto (funziona sia client che server con Firebase client SDK)
  return createNotificationDirect(params);
}
