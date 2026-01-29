/**
 * Send Push Notifications
 * 
 * Questo modulo gestisce l'invio di push notifications tramite Firebase Cloud Messaging.
 * 
 * NOTA: Per l'invio effettivo delle push, è necessario:
 * 1. Firebase Admin SDK (server-side) - richiede una Cloud Function o API Route con credenziali admin
 * 2. Oppure usare l'API HTTP v1 di FCM
 * 
 * Per ora implementiamo la struttura base con l'API HTTP legacy di FCM
 * che può essere chiamata anche da client con la server key.
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
  // Destinatario singolo
  userId?: string;
  token?: string;
  
  // Destinatari multipli
  userIds?: string[];
  tokens?: string[];
  
  // Per ruolo
  role?: "ADMIN" | "PROPRIETARIO" | "OPERATORE_PULIZIE" | "RIDER";
  
  // Opzioni
  priority?: "high" | "normal";
  ttl?: number; // Time to live in secondi
  collapseKey?: string; // Per raggruppare notifiche simili
}

export interface SendPushResult {
  success: boolean;
  successCount?: number;
  failureCount?: number;
  failedTokens?: string[];
  error?: string;
}

// ==================== CONFIGURAZIONE ====================

// Server Key FCM (da Firebase Console > Project Settings > Cloud Messaging)
// IMPORTANTE: Questa chiave NON deve essere esposta al client!
// Dovrebbe essere in una variabile d'ambiente server-side
const FCM_SERVER_KEY = process.env.FCM_SERVER_KEY || "";
const FCM_API_URL = "https://fcm.googleapis.com/fcm/send";

// ==================== FUNZIONI UTILITY ====================

/**
 * Ottiene tutti i token FCM per un utente
 */
async function getTokensForUser(userId: string): Promise<string[]> {
  try {
    const q = query(
      collection(db, "userDevices"),
      where("userId", "==", userId),
      where("isActive", "==", true)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data().token as string);
  } catch (error) {
    console.error(`Errore recupero token per utente ${userId}:`, error);
    return [];
  }
}

/**
 * Ottiene tutti i token FCM per un ruolo
 */
async function getTokensForRole(role: string): Promise<string[]> {
  try {
    // Prima ottieni tutti gli utenti con quel ruolo
    const usersQuery = query(
      collection(db, "users"),
      where("role", "==", role),
      where("status", "==", "ACTIVE")
    );

    const usersSnapshot = await getDocs(usersQuery);
    const userIds = usersSnapshot.docs.map(doc => doc.id);

    if (userIds.length === 0) return [];

    // Poi ottieni i token per quegli utenti
    // Nota: Firestore non supporta query con "in" su più di 30 elementi
    // Per semplicità, facciamo query multiple se necessario
    const allTokens: string[] = [];
    
    for (let i = 0; i < userIds.length; i += 30) {
      const batch = userIds.slice(i, i + 30);
      const tokensQuery = query(
        collection(db, "userDevices"),
        where("userId", "in", batch),
        where("isActive", "==", true)
      );

      const tokensSnapshot = await getDocs(tokensQuery);
      const tokens = tokensSnapshot.docs.map(doc => doc.data().token as string);
      allTokens.push(...tokens);
    }

    return allTokens;
  } catch (error) {
    console.error(`Errore recupero token per ruolo ${role}:`, error);
    return [];
  }
}

/**
 * Marca un token come non valido
 */
async function invalidateToken(token: string): Promise<void> {
  try {
    // Trova il documento con questo token
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

/**
 * Invia una push notification
 * 
 * Questa funzione può essere chiamata in diversi modi:
 * - Con un singolo userId o token
 * - Con array di userIds o tokens
 * - Con un ruolo (invia a tutti gli utenti con quel ruolo)
 * 
 * @example
 * // Invia a un utente specifico
 * await sendPushNotification(
 *   { title: "Nuova pulizia", body: "Hai una nuova pulizia assegnata" },
 *   { userId: "user123" }
 * );
 * 
 * @example
 * // Invia a tutti gli admin
 * await sendPushNotification(
 *   { title: "Nuova proprietà", body: "C'è una nuova proprietà da approvare" },
 *   { role: "ADMIN" }
 * );
 */
export async function sendPushNotification(
  payload: PushNotificationPayload,
  options: SendPushOptions
): Promise<SendPushResult> {
  // Raccogli tutti i token destinatari
  let tokens: string[] = [];

  try {
    // Token singolo
    if (options.token) {
      tokens.push(options.token);
    }

    // Array di token
    if (options.tokens && options.tokens.length > 0) {
      tokens.push(...options.tokens);
    }

    // Utente singolo
    if (options.userId) {
      const userTokens = await getTokensForUser(options.userId);
      tokens.push(...userTokens);
    }

    // Array di utenti
    if (options.userIds && options.userIds.length > 0) {
      for (const userId of options.userIds) {
        const userTokens = await getTokensForUser(userId);
        tokens.push(...userTokens);
      }
    }

    // Per ruolo
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

    console.log(`📤 Invio push a ${tokens.length} dispositivi...`);

    // Verifica che la server key sia configurata
    if (!FCM_SERVER_KEY) {
      console.warn("⚠️ FCM_SERVER_KEY non configurata - push notification simulata");
      
      // In sviluppo, logga solo l'intento di inviare
      console.log("📬 [SIMULAZIONE] Push notification:", {
        payload,
        tokensCount: tokens.length,
      });

      return {
        success: true,
        successCount: tokens.length,
        failureCount: 0,
      };
    }

    // Invia tramite API FCM
    // Per invii multipli, FCM supporta fino a 1000 token per richiesta
    const results = await sendViaFCM(tokens, payload, options);

    return results;
  } catch (error) {
    console.error("Errore invio push notification:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Errore sconosciuto",
    };
  }
}

/**
 * Invia notifiche tramite FCM HTTP Legacy API
 * 
 * Nota: L'API Legacy è deprecata ma ancora funzionante.
 * Per produzione, considera di migrare all'API HTTP v1 o usare Firebase Admin SDK
 */
async function sendViaFCM(
  tokens: string[],
  payload: PushNotificationPayload,
  options: SendPushOptions
): Promise<SendPushResult> {
  const failedTokens: string[] = [];
  let successCount = 0;
  let failureCount = 0;

  // FCM supporta max 1000 token per richiesta
  const batches = [];
  for (let i = 0; i < tokens.length; i += 1000) {
    batches.push(tokens.slice(i, i + 1000));
  }

  for (const batch of batches) {
    try {
      const response = await fetch(FCM_API_URL, {
        method: "POST",
        headers: {
          "Authorization": `key=${FCM_SERVER_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          registration_ids: batch,
          notification: {
            title: payload.title,
            body: payload.body,
            icon: payload.icon || "/favicon.ico",
            badge: payload.badge,
            image: payload.image,
            click_action: payload.clickAction || "/",
          },
          data: payload.data || {},
          priority: options.priority || "high",
          time_to_live: options.ttl || 86400, // Default: 24 ore
          collapse_key: options.collapseKey,
        }),
      });

      const result = await response.json();

      if (result.success) {
        successCount += result.success;
      }
      if (result.failure) {
        failureCount += result.failure;
      }

      // Gestisci token non validi
      if (result.results) {
        result.results.forEach((res: { error?: string }, index: number) => {
          if (res.error === "NotRegistered" || res.error === "InvalidRegistration") {
            const failedToken = batch[index];
            failedTokens.push(failedToken);
            // Invalida il token in Firestore
            invalidateToken(failedToken);
          }
        });
      }
    } catch (error) {
      console.error("Errore batch FCM:", error);
      failureCount += batch.length;
    }
  }

  console.log(`📬 Push completate: ${successCount} successi, ${failureCount} fallimenti`);

  return {
    success: failureCount === 0,
    successCount,
    failureCount,
    failedTokens: failedTokens.length > 0 ? failedTokens : undefined,
  };
}

/**
 * Invia push notification a un utente specifico per un tipo di notifica
 * Helper function per uso comune
 */
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

/**
 * Invia push notification a tutti gli utenti con un ruolo specifico
 * Helper function per uso comune
 */
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

/**
 * Notifica nuova pulizia assegnata a operatore
 */
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

/**
 * Notifica nuova proprietà da approvare agli admin
 */
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

/**
 * Notifica consegna assegnata a rider
 */
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

/**
 * Notifica pulizia completata al proprietario
 */
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
