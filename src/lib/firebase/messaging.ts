/**
 * Firebase Cloud Messaging (FCM) - Push Notifications
 * 
 * Questo modulo gestisce:
 * - Richiesta permessi notifiche
 * - Ottenimento token FCM del dispositivo
 * - Salvataggio token in Firestore
 * - Gestione notifiche in foreground
 */

import { getMessaging, getToken, onMessage, type Messaging } from "firebase/messaging";
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  deleteDoc,
  Timestamp,
  serverTimestamp
} from "firebase/firestore";
import app, { db } from "./config";

// ==================== TIPI ====================

export interface DeviceToken {
  id?: string;
  userId: string;
  token: string;
  deviceType: "web" | "android" | "ios";
  deviceInfo: {
    userAgent: string;
    platform: string;
    language: string;
  };
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastUsedAt?: Timestamp;
}

export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  image?: string;
  click_action?: string;
  data?: Record<string, string>;
}

// ==================== VARIABILI ====================

let messagingInstance: Messaging | null = null;

// VAPID Key per FCM Web Push (da generare nella console Firebase)
// Vai su Firebase Console > Project Settings > Cloud Messaging > Web Push certificates
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || "";

// ==================== FUNZIONI UTILITY ====================

/**
 * Verifica se le notifiche sono supportate dal browser
 */
export function isNotificationSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "Notification" in window && "serviceWorker" in navigator;
}

/**
 * Ottiene lo stato corrente del permesso notifiche
 */
export function getNotificationPermissionStatus(): NotificationPermission | "unsupported" {
  if (!isNotificationSupported()) return "unsupported";
  return Notification.permission;
}

/**
 * Inizializza Firebase Messaging (solo client-side)
 */
function getMessagingInstance(): Messaging | null {
  if (typeof window === "undefined") return null;
  
  if (!messagingInstance) {
    try {
      messagingInstance = getMessaging(app);
    } catch (error) {
      console.error("Errore inizializzazione FCM:", error);
      return null;
    }
  }
  
  return messagingInstance;
}

/**
 * Ottiene informazioni sul dispositivo corrente
 */
function getDeviceInfo(): DeviceToken["deviceInfo"] {
  return {
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    platform: typeof navigator !== "undefined" ? navigator.platform : "unknown",
    language: typeof navigator !== "undefined" ? navigator.language : "unknown",
  };
}

/**
 * Determina il tipo di dispositivo
 */
function getDeviceType(): DeviceToken["deviceType"] {
  if (typeof navigator === "undefined") return "web";
  
  const ua = navigator.userAgent.toLowerCase();
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  return "web";
}

// ==================== FUNZIONI PRINCIPALI ====================

/**
 * Richiede il permesso per le notifiche push all'utente
 * 
 * @returns Promise<boolean> - true se il permesso è stato concesso
 */
export async function requestNotificationPermission(): Promise<boolean> {
  // Verifica supporto
  if (!isNotificationSupported()) {
    console.warn("⚠️ Notifiche push non supportate da questo browser");
    return false;
  }

  // Se già concesso, ritorna true
  if (Notification.permission === "granted") {
    console.log("✅ Permesso notifiche già concesso");
    return true;
  }

  // Se già negato, non si può richiedere di nuovo
  if (Notification.permission === "denied") {
    console.warn("❌ Permesso notifiche negato dall'utente");
    return false;
  }

  // Richiedi permesso
  try {
    const permission = await Notification.requestPermission();
    
    if (permission === "granted") {
      console.log("✅ Permesso notifiche concesso");
      return true;
    } else {
      console.warn("❌ Permesso notifiche non concesso:", permission);
      return false;
    }
  } catch (error) {
    console.error("Errore richiesta permesso notifiche:", error);
    return false;
  }
}

/**
 * Ottiene il token FCM del dispositivo corrente
 * 
 * @returns Promise<string | null> - Token FCM o null se non disponibile
 */
export async function getDeviceToken(): Promise<string | null> {
  // Verifica supporto
  if (!isNotificationSupported()) {
    console.warn("⚠️ FCM non supportato");
    return null;
  }

  // Verifica permesso
  if (Notification.permission !== "granted") {
    console.warn("⚠️ Permesso notifiche non concesso");
    return null;
  }

  // Verifica VAPID key
  if (!VAPID_KEY) {
    console.warn("⚠️ VAPID_KEY non configurata. Aggiungi NEXT_PUBLIC_FIREBASE_VAPID_KEY nelle variabili d'ambiente");
    return null;
  }

  const messaging = getMessagingInstance();
  if (!messaging) {
    console.error("❌ Impossibile inizializzare FCM");
    return null;
  }

  try {
    // Registra il service worker se non già fatto
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    
    // Ottieni il token
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (token) {
      console.log("✅ Token FCM ottenuto:", token.substring(0, 20) + "...");
      return token;
    } else {
      console.warn("⚠️ Nessun token FCM disponibile");
      return null;
    }
  } catch (error) {
    console.error("Errore ottenimento token FCM:", error);
    return null;
  }
}

/**
 * Salva il token del dispositivo in Firestore
 * 
 * @param userId - ID dell'utente
 * @param token - Token FCM del dispositivo
 * @returns Promise<boolean> - true se salvato con successo
 */
export async function saveDeviceToken(userId: string, token: string): Promise<boolean> {
  if (!userId || !token) {
    console.error("❌ userId e token sono obbligatori");
    return false;
  }

  try {
    // Usa una combinazione di userId e token come ID documento per evitare duplicati
    const tokenHash = btoa(token).substring(0, 20); // Hash breve del token
    const docId = `${userId}_${tokenHash}`;

    const deviceTokenData: Omit<DeviceToken, "id"> = {
      userId,
      token,
      deviceType: getDeviceType(),
      deviceInfo: getDeviceInfo(),
      isActive: true,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    // Verifica se esiste già
    const docRef = doc(db, "userDevices", docId);
    const existingDoc = await getDoc(docRef);

    if (existingDoc.exists()) {
      // Aggiorna solo updatedAt e lastUsedAt
      await setDoc(docRef, {
        ...deviceTokenData,
        createdAt: existingDoc.data().createdAt, // Mantieni la data di creazione originale
        lastUsedAt: Timestamp.now(),
      });
      console.log("✅ Token dispositivo aggiornato:", docId);
    } else {
      // Crea nuovo documento
      await setDoc(docRef, deviceTokenData);
      console.log("✅ Token dispositivo salvato:", docId);
    }

    return true;
  } catch (error) {
    console.error("Errore salvataggio token dispositivo:", error);
    return false;
  }
}

/**
 * Rimuove un token dispositivo da Firestore
 * 
 * @param userId - ID dell'utente
 * @param token - Token FCM da rimuovere
 */
export async function removeDeviceToken(userId: string, token: string): Promise<boolean> {
  try {
    const tokenHash = btoa(token).substring(0, 20);
    const docId = `${userId}_${tokenHash}`;
    
    await deleteDoc(doc(db, "userDevices", docId));
    console.log("✅ Token dispositivo rimosso:", docId);
    return true;
  } catch (error) {
    console.error("Errore rimozione token dispositivo:", error);
    return false;
  }
}

/**
 * Ottiene tutti i token attivi di un utente
 * 
 * @param userId - ID dell'utente
 * @returns Promise<string[]> - Array di token FCM
 */
export async function getUserDeviceTokens(userId: string): Promise<string[]> {
  try {
    const q = query(
      collection(db, "userDevices"),
      where("userId", "==", userId),
      where("isActive", "==", true)
    );

    const snapshot = await getDocs(q);
    const tokens = snapshot.docs.map(doc => doc.data().token as string);
    
    console.log(`📱 Trovati ${tokens.length} dispositivi per utente ${userId}`);
    return tokens;
  } catch (error) {
    console.error("Errore recupero token dispositivi:", error);
    return [];
  }
}

/**
 * Disattiva tutti i token di un utente (utile per logout)
 * 
 * @param userId - ID dell'utente
 */
export async function deactivateAllUserTokens(userId: string): Promise<boolean> {
  try {
    const q = query(
      collection(db, "userDevices"),
      where("userId", "==", userId),
      where("isActive", "==", true)
    );

    const snapshot = await getDocs(q);
    
    const updates = snapshot.docs.map(docSnapshot => 
      setDoc(doc(db, "userDevices", docSnapshot.id), {
        ...docSnapshot.data(),
        isActive: false,
        updatedAt: Timestamp.now(),
      })
    );

    await Promise.all(updates);
    console.log(`✅ Disattivati ${snapshot.docs.length} token per utente ${userId}`);
    return true;
  } catch (error) {
    console.error("Errore disattivazione token:", error);
    return false;
  }
}

/**
 * Configura il listener per le notifiche in foreground
 * 
 * @param callback - Funzione da chiamare quando arriva una notifica
 * @returns Unsubscribe function
 */
export function onForegroundMessage(
  callback: (payload: NotificationPayload & { data?: Record<string, string> }) => void
): (() => void) | null {
  const messaging = getMessagingInstance();
  if (!messaging) return null;

  const unsubscribe = onMessage(messaging, (payload) => {
    console.log("📬 Notifica ricevuta in foreground:", payload);
    
    callback({
      title: payload.notification?.title || "Nuova notifica",
      body: payload.notification?.body || "",
      icon: payload.notification?.icon,
      image: payload.notification?.image,
      data: payload.data,
    });
  });

  return unsubscribe;
}

/**
 * Inizializza completamente il sistema di push notifications per un utente
 * 
 * @param userId - ID dell'utente
 * @returns Promise<{ success: boolean; token?: string; error?: string }>
 */
export async function initializePushNotifications(userId: string): Promise<{
  success: boolean;
  token?: string;
  error?: string;
}> {
  try {
    // 1. Richiedi permesso
    const permissionGranted = await requestNotificationPermission();
    if (!permissionGranted) {
      return { 
        success: false, 
        error: "Permesso notifiche non concesso" 
      };
    }

    // 2. Ottieni token
    const token = await getDeviceToken();
    if (!token) {
      return { 
        success: false, 
        error: "Impossibile ottenere token FCM" 
      };
    }

    // 3. Salva token
    const saved = await saveDeviceToken(userId, token);
    if (!saved) {
      return { 
        success: false, 
        error: "Errore salvataggio token" 
      };
    }

    console.log("✅ Push notifications inizializzate con successo");
    return { success: true, token };
  } catch (error) {
    console.error("Errore inizializzazione push notifications:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Errore sconosciuto" 
    };
  }
}
