/**
 * Send Push Notifications via Firebase Admin SDK (API V1)
 * 
 * Usa Firebase Admin SDK per inviare push notifications.
 * Richiede FIREBASE_ADMIN_* variabili d'ambiente configurate.
 */

import { 
  collection, 
  query, 
  where, 
  getDocs,
  doc,
  updateDoc,
  Timestamp 
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { getMessaging } from "firebase-admin/messaging";
import { getApps } from "firebase-admin/app";
// Importa adminDb per assicurare che Firebase Admin SDK sia inizializzato
import "~/lib/firebase/admin";

// ==================== TIPI ====================

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  image?: string;
  clickAction?: string;
  data?: Record<string, string>;
}

export interface SendPushOptions {
  userId?: string;
  token?: string;
  userIds?: string[];
  tokens?: string[];
  role?: "ADMIN" | "PROPRIETARIO" | "OPERATORE_PULIZIE" | "RIDER";
  priority?: "high" | "normal";
  ttl?: number;
  collapseKey?: string;
}

export interface SendPushResult {
  success: boolean;
  successCount?: number;
  failureCount?: number;
  failedTokens?: string[];
  error?: string;
}

// ==================== FUNZIONI UTILITY ====================

async function getTokensForUser(userId: string): Promise<string[]> {
  try {
    const q = query(
      collection(db, "userDevices"),
      where("userId", "==", userId),
      where("isActive", "==", true)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => (doc.data() as Record<string, any>).token as string);
  } catch (error) {
    console.error(`Errore recupero token per utente ${userId}:`, error);
    return [];
  }
}

async function getTokensForRole(role: string): Promise<string[]> {
  try {
    const usersQuery = query(
      collection(db, "users"),
      where("role", "==", role),
      where("status", "==", "ACTIVE")
    );
    const usersSnapshot = await getDocs(usersQuery);
    const userIds = usersSnapshot.docs.map(doc => doc.id);

    if (userIds.length === 0) return [];

    const allTokens: string[] = [];
    
    for (let i = 0; i < userIds.length; i += 30) {
      const batch = userIds.slice(i, i + 30);
      const tokensQuery = query(
        collection(db, "userDevices"),
        where("userId", "in", batch),
        where("isActive", "==", true)
      );
      const tokensSnapshot = await getDocs(tokensQuery);
      const tokens = tokensSnapshot.docs.map(doc => (doc.data() as Record<string, any>).token as string);
      allTokens.push(...tokens);
    }

    return allTokens;
  } catch (error) {
    console.error(`Errore recupero token per ruolo ${role}:`, error);
    return [];
  }
}

async function invalidateToken(token: string): Promise<void> {
  try {
    const q = query(
      collection(db, "userDevices"),
      where("token", "==", token)
    );
    const snapshot = await getDocs(q);
    
    for (const docSnapshot of snapshot.docs) {
      await updateDoc(doc(db, "userDevices", docSnapshot.id), {
        isActive: false,
        updatedAt: Timestamp.now(),
        invalidatedReason: "FCM_ERROR",
      });
    }
  } catch (error) {
    console.error("Errore invalidazione token:", error);
  }
}

// ==================== FUNZIONE PRINCIPALE ====================

export async function sendPushNotification(
  payload: PushNotificationPayload,
  options: SendPushOptions
): Promise<SendPushResult> {
  let tokens: string[] = [];

  try {
    if (options.token) {
      tokens.push(options.token);
    }
    if (options.tokens && options.tokens.length > 0) {
      tokens.push(...options.tokens);
    }
    if (options.userId) {
      const userTokens = await getTokensForUser(options.userId);
      tokens.push(...userTokens);
    }
    if (options.userIds && options.userIds.length > 0) {
      for (const userId of options.userIds) {
        const userTokens = await getTokensForUser(userId);
        tokens.push(...userTokens);
      }
    }
    if (options.role) {
      const roleTokens = await getTokensForRole(options.role);
      tokens.push(...roleTokens);
    }

    // Rimuovi duplicati
    tokens = [...new Set(tokens)];

    if (tokens.length === 0) {
      console.warn("⚠️ Nessun token destinatario trovato");
      return {
        success: false,
        error: "Nessun dispositivo registrato per i destinatari specificati",
      };
    }


    // Verifica che Firebase Admin SDK sia inizializzato
    if (getApps().length === 0) {
      console.warn("⚠️ Firebase Admin SDK non inizializzato - push non inviata");
      return {
        success: false,
        error: "Firebase Admin SDK non inizializzato",
      };
    }

    const messaging = getMessaging();
    const failedTokens: string[] = [];
    let successCount = 0;
    let failureCount = 0;

    // Firebase Admin SDK supporta max 500 token per sendEachForMulticast
    const batches: string[][] = [];
    for (let i = 0; i < tokens.length; i += 500) {
      batches.push(tokens.slice(i, i + 500));
    }

    for (const batch of batches) {
      try {
        const message = {
          data: {
            ...(payload.data || {}),
            title: payload.title,
            body: payload.body,
            icon: payload.icon || "/Favicon_192.png",
            badge: payload.badge || "/badge-icon.png",
            click_action: payload.clickAction || "/",
            ...(payload.image && { image: payload.image }),
          },
          tokens: batch,
          android: {
            collapseKey: payload.data?.cleaningId ? `cleaning_${payload.data.cleaningId}` : undefined,
          },
          apns: payload.data?.cleaningId ? {
            headers: {
              'apns-collapse-id': `cleaning_${payload.data.cleaningId}`,
            },
          } : undefined,
        };

        const response = await messaging.sendEachForMulticast(message);

        successCount += response.successCount;
        failureCount += response.failureCount;

        // Gestisci token non validi
        response.responses.forEach((resp, index) => {
          if (!resp.success && resp.error) {
            const errorCode = resp.error.code;
            if (
              errorCode === "messaging/registration-token-not-registered" ||
              errorCode === "messaging/invalid-registration-token" ||
              errorCode === "messaging/invalid-argument"
            ) {
              const failedToken = batch[index];
              failedTokens.push(failedToken);
              invalidateToken(failedToken);
            }
          }
        });
      } catch (error) {
        console.error("Errore batch FCM:", error);
        failureCount += batch.length;
      }
    }


    return {
      success: successCount > 0,
      successCount,
      failureCount,
      failedTokens: failedTokens.length > 0 ? failedTokens : undefined,
    };
  } catch (error) {
    console.error("Errore invio push notification:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Errore sconosciuto",
    };
  }
}

// ==================== HELPER FUNCTIONS ====================

export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<SendPushResult> {
  return sendPushNotification(
    { title, body, data },
    { userId }
  );
}

export async function sendPushToRole(
  role: "ADMIN" | "PROPRIETARIO" | "OPERATORE_PULIZIE" | "RIDER",
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<SendPushResult> {
  return sendPushNotification(
    { title, body, data },
    { role }
  );
}

// ==================== FUNZIONI SPECIALIZZATE ====================

export async function notifyCleaningAssigned(
  operatorId: string,
  cleaningId: string,
  propertyName: string,
  scheduledDate: string
): Promise<SendPushResult> {
  return sendPushToUser(
    operatorId,
    "🧹 Nuova pulizia assegnata",
    `Pulizia assegnata: ${propertyName} - ${scheduledDate}`,
    {
      type: "CLEANING_ASSIGNED",
      cleaningId,
      propertyName,
    }
  );
}

export async function notifyNewProperty(
  propertyId: string,
  propertyName: string,
  ownerName: string
): Promise<SendPushResult> {
  return sendPushToRole(
    "ADMIN",
    "🏠 Nuova proprietà da approvare",
    `${ownerName} ha registrato: ${propertyName}`,
    {
      type: "NEW_PROPERTY",
      propertyId,
      propertyName,
    }
  );
}

export async function notifyDeliveryAssigned(
  riderId: string,
  orderId: string,
  propertyName: string,
  deliveryTime: string
): Promise<SendPushResult> {
  return sendPushToUser(
    riderId,
    "🚚 Nuova consegna assegnata",
    `Consegna per: ${propertyName} - ${deliveryTime}`,
    {
      type: "LAUNDRY_ASSIGNED",
      orderId,
      propertyName,
    }
  );
}

export async function notifyCleaningCompleted(
  ownerId: string,
  cleaningId: string,
  propertyName: string
): Promise<SendPushResult> {
  return sendPushToUser(
    ownerId,
    "✅ Pulizia completata",
    `La pulizia di ${propertyName} è stata completata`,
    {
      type: "CLEANING_COMPLETED",
      cleaningId,
      propertyName,
    }
  );
}
