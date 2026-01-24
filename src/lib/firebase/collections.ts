/**
 * Firebase Firestore Collections
 * 
 * Riferimenti centralizzati a tutte le collezioni Firestore.
 * Questo file fornisce helper type-safe per accedere alle collezioni.
 */

import { 
  collection, 
  doc, 
  CollectionReference,
  DocumentReference,
  type DocumentData 
} from "firebase/firestore";
import { db } from "./config";

// Import types
import type { 
  FirebaseUser, 
  FirebaseProperty, 
  FirebaseBooking, 
  FirebaseCleaning,
  FirebaseInventoryItem,
  FirebaseInventoryCategory,
  FirebaseNotification 
} from "./types";

import type { 
  RegulationDocument, 
  ContractAcceptance 
} from "~/types/contract";

import type { DeviceToken } from "./messaging";

// ==================== COLLECTION NAMES ====================

export const COLLECTIONS = {
  // Utenti e autenticazione
  USERS: "users",
  USER_DEVICES: "userDevices",
  
  // Proprietà e prenotazioni
  PROPERTIES: "properties",
  BOOKINGS: "bookings",
  
  // Pulizie e ordini
  CLEANINGS: "cleanings",
  ORDERS: "orders",
  
  // Inventario
  INVENTORY: "inventory",
  INVENTORY_CATEGORIES: "inventoryCategories",
  
  // Notifiche
  NOTIFICATIONS: "notifications",
  
  // Pagamenti
  PAYMENTS: "payments",
  
  // Contratti e regolamenti
  REGULATION_DOCUMENTS: "regulationDocuments",
  CONTRACT_ACCEPTANCES: "contractAcceptances",
  
  // Sincronizzazione iCal
  ICAL_SYNC_LOG: "icalSyncLog",
  
  // Configurazioni
  SERVICE_CONFIGS: "serviceConfigs",
  APP_SETTINGS: "appSettings",
} as const;

// ==================== TYPED COLLECTION REFERENCES ====================

/**
 * Collezione utenti
 */
export const usersCollection = () => 
  collection(db, COLLECTIONS.USERS) as CollectionReference<FirebaseUser>;

/**
 * Documento utente specifico
 */
export const userDoc = (userId: string) => 
  doc(db, COLLECTIONS.USERS, userId) as DocumentReference<FirebaseUser>;

/**
 * Collezione dispositivi utente (per push notifications)
 */
export const userDevicesCollection = () => 
  collection(db, COLLECTIONS.USER_DEVICES) as CollectionReference<DeviceToken>;

/**
 * Documento dispositivo specifico
 */
export const userDeviceDoc = (deviceId: string) => 
  doc(db, COLLECTIONS.USER_DEVICES, deviceId) as DocumentReference<DeviceToken>;

/**
 * Collezione proprietà
 */
export const propertiesCollection = () => 
  collection(db, COLLECTIONS.PROPERTIES) as CollectionReference<FirebaseProperty>;

/**
 * Documento proprietà specifica
 */
export const propertyDoc = (propertyId: string) => 
  doc(db, COLLECTIONS.PROPERTIES, propertyId) as DocumentReference<FirebaseProperty>;

/**
 * Collezione prenotazioni
 */
export const bookingsCollection = () => 
  collection(db, COLLECTIONS.BOOKINGS) as CollectionReference<FirebaseBooking>;

/**
 * Documento prenotazione specifica
 */
export const bookingDoc = (bookingId: string) => 
  doc(db, COLLECTIONS.BOOKINGS, bookingId) as DocumentReference<FirebaseBooking>;

/**
 * Collezione pulizie
 */
export const cleaningsCollection = () => 
  collection(db, COLLECTIONS.CLEANINGS) as CollectionReference<FirebaseCleaning>;

/**
 * Documento pulizia specifica
 */
export const cleaningDoc = (cleaningId: string) => 
  doc(db, COLLECTIONS.CLEANINGS, cleaningId) as DocumentReference<FirebaseCleaning>;

/**
 * Collezione inventario
 */
export const inventoryCollection = () => 
  collection(db, COLLECTIONS.INVENTORY) as CollectionReference<FirebaseInventoryItem>;

/**
 * Documento articolo inventario specifico
 */
export const inventoryItemDoc = (itemId: string) => 
  doc(db, COLLECTIONS.INVENTORY, itemId) as DocumentReference<FirebaseInventoryItem>;

/**
 * Collezione categorie inventario
 */
export const inventoryCategoriesCollection = () => 
  collection(db, COLLECTIONS.INVENTORY_CATEGORIES) as CollectionReference<FirebaseInventoryCategory>;

/**
 * Collezione notifiche
 */
export const notificationsCollection = () => 
  collection(db, COLLECTIONS.NOTIFICATIONS) as CollectionReference<FirebaseNotification>;

/**
 * Documento notifica specifica
 */
export const notificationDoc = (notificationId: string) => 
  doc(db, COLLECTIONS.NOTIFICATIONS, notificationId) as DocumentReference<FirebaseNotification>;

/**
 * Collezione ordini (biancheria)
 */
export const ordersCollection = () => 
  collection(db, COLLECTIONS.ORDERS) as CollectionReference<DocumentData>;

/**
 * Documento ordine specifico
 */
export const orderDoc = (orderId: string) => 
  doc(db, COLLECTIONS.ORDERS, orderId) as DocumentReference<DocumentData>;

// ==================== CONTRATTI E REGOLAMENTI ====================

/**
 * Collezione documenti regolamentari
 */
export const regulationDocumentsCollection = () => 
  collection(db, COLLECTIONS.REGULATION_DOCUMENTS) as CollectionReference<RegulationDocument>;

/**
 * Documento regolamentare specifico
 */
export const regulationDocumentDoc = (docId: string) => 
  doc(db, COLLECTIONS.REGULATION_DOCUMENTS, docId) as DocumentReference<RegulationDocument>;

/**
 * Collezione accettazioni contratto
 */
export const contractAcceptancesCollection = () => 
  collection(db, COLLECTIONS.CONTRACT_ACCEPTANCES) as CollectionReference<ContractAcceptance>;

/**
 * Documento accettazione specifica
 */
export const contractAcceptanceDoc = (acceptanceId: string) => 
  doc(db, COLLECTIONS.CONTRACT_ACCEPTANCES, acceptanceId) as DocumentReference<ContractAcceptance>;

// ==================== PAGAMENTI ====================

/**
 * Collezione pagamenti
 */
export const paymentsCollection = () => 
  collection(db, COLLECTIONS.PAYMENTS) as CollectionReference<DocumentData>;

/**
 * Documento pagamento specifico
 */
export const paymentDoc = (paymentId: string) => 
  doc(db, COLLECTIONS.PAYMENTS, paymentId) as DocumentReference<DocumentData>;

// ==================== CONFIGURAZIONI ====================

/**
 * Collezione configurazioni servizio
 */
export const serviceConfigsCollection = () => 
  collection(db, COLLECTIONS.SERVICE_CONFIGS) as CollectionReference<DocumentData>;

/**
 * Documento configurazione specifica
 */
export const serviceConfigDoc = (configId: string) => 
  doc(db, COLLECTIONS.SERVICE_CONFIGS, configId) as DocumentReference<DocumentData>;

/**
 * Collezione impostazioni app
 */
export const appSettingsCollection = () => 
  collection(db, COLLECTIONS.APP_SETTINGS) as CollectionReference<DocumentData>;

/**
 * Documento impostazione specifica
 */
export const appSettingDoc = (settingId: string) => 
  doc(db, COLLECTIONS.APP_SETTINGS, settingId) as DocumentReference<DocumentData>;

// ==================== HELPERS ====================

/**
 * Genera un ID univoco per un nuovo documento
 */
export function generateDocId(collectionName: string): string {
  return doc(collection(db, collectionName)).id;
}

/**
 * Ottiene il riferimento a una collezione generica
 */
export function getCollection<T = DocumentData>(name: string): CollectionReference<T> {
  return collection(db, name) as CollectionReference<T>;
}

/**
 * Ottiene il riferimento a un documento generico
 */
export function getDoc<T = DocumentData>(collectionName: string, docId: string): DocumentReference<T> {
  return doc(db, collectionName, docId) as DocumentReference<T>;
}
