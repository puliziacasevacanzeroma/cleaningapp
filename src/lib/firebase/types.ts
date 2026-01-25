import { Timestamp } from "firebase/firestore";

// Utente
export interface FirebaseUser {
  id: string;
  email: string;
  name: string;
  surname?: string;
  phone?: string;
  role: "ADMIN" | "PROPRIETARIO" | "OPERATORE_PULIZIE" | "RIDER";
  status: "ACTIVE" | "INACTIVE";
  avatar?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Proprietà
export interface FirebaseProperty {
  id: string;
  name: string;
  address: string;
  city: string;
  postalCode?: string;
  apartment?: string;
  floor?: string;
  intercom?: string;
  description?: string;
  imageUrl?: string;
  status: "ACTIVE" | "PENDING" | "SUSPENDED";
  bedrooms: number;
  bathrooms: number;
  maxGuests: number;
  checkInTime: string;
  checkOutTime: string;
  accessNotes?: string;
  cleaningPrice: number;
  usesOwnLinen: boolean;
  ownerId: string;
  ownerName?: string;
  icalAirbnb?: string;
  icalBooking?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  
  // ═══════════════════════════════════════════════════════════════
  // COORDINATE GEOGRAFICHE (Task Assegnazione Intelligente)
  // ═══════════════════════════════════════════════════════════════
  
  coordinates?: {
    lat: number;
    lng: number;
  };
  coordinatesVerified?: boolean;
  
  // ═══════════════════════════════════════════════════════════════
  // NUOVI CAMPI - Foto e Accesso Proprietà (Task 2.3.1)
  // ═══════════════════════════════════════════════════════════════
  
  // Foto identificative per operatori/rider
  images?: {
    door?: string;       // Foto porta d'ingresso (PRINCIPALE)
    building?: string;   // Foto palazzo/edificio (opzionale)
  };
  
  // Informazioni accesso
  doorCode?: string;     // Codice porta/portone (es: "1234#", "A5B")
  keysLocation?: string; // Posizione chiavi (es: "KeyBox codice 5678", "Portineria")
}

// Prenotazione
export interface FirebaseBooking {
  id: string;
  propertyId: string;
  propertyName: string;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  checkIn: Timestamp;
  checkOut: Timestamp;
  guestsCount: number;
  totalPrice?: number;
  status: "UPCOMING" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  source?: string;
  externalUid?: string;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Pulizia
export interface FirebaseCleaning {
  id: string;
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
  bookingId?: string;
  operatorId?: string;
  operatorName?: string;
  scheduledDate: Timestamp;
  scheduledTime?: string;
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  type: "CHECKOUT" | "CHECKIN" | "DEEP_CLEAN" | "MAINTENANCE";
  price: number;
  guestsCount?: number;
  notes?: string;
  operatorNotes?: string;
  issues?: string;
  photos: string[];
  checklistDone: boolean;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Inventario Categoria
export interface FirebaseInventoryCategory {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  order: number;
  isActive: boolean;
  createdAt: Timestamp;
}

// Inventario Item
export interface FirebaseInventoryItem {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  description?: string;
  quantity: number;
  minQuantity: number;
  sellPrice: number;
  costPrice?: number;
  unit: string;
  sku?: string;
  supplier?: string;
  imageUrl?: string;
  isActive: boolean;
  isForLinen: boolean;
  lastRestocked?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Tipi di notifica
export type NotificationType = 
  | "DELETION_REQUEST"        // Richiesta cancellazione proprietà
  | "DELETION_APPROVED"       // Richiesta cancellazione approvata
  | "DELETION_REJECTED"       // Richiesta cancellazione rifiutata
  | "NEW_PROPERTY"            // Nuova proprietà da approvare
  | "PROPERTY_APPROVED"       // Proprietà approvata
  | "PROPERTY_REJECTED"       // Proprietà rifiutata
  | "CLEANING_ASSIGNED"       // Pulizia assegnata (operatore)
  | "CLEANING_ASSIGNED_OWNER" // Pulizia assegnata (proprietario)
  | "CLEANING_COMPLETED"      // Pulizia completata
  | "CLEANING_NOT_COMPLETED"  // Pulizia non completata (urgente)
  | "CLEANING_STARTED"        // Pulizia iniziata
  | "LAUNDRY_NEW"             // Nuovo ordine biancheria
  | "LAUNDRY_ASSIGNED"        // Consegna assegnata a rider
  | "LAUNDRY_IN_TRANSIT"      // Consegna in corso
  | "LAUNDRY_DELIVERED"       // Consegna completata
  | "PAYMENT_DUE"             // Pagamento dovuto (inizio mese)
  | "PAYMENT_REMINDER"        // Promemoria pagamento
  | "PAYMENT_OVERDUE"         // Pagamento scaduto
  | "PAYMENT_RECEIVED"        // Pagamento ricevuto
  | "BOOKING_NEW"             // Nuova prenotazione
  | "BOOKING_CANCELLED"       // Prenotazione cancellata
  | "SYSTEM"                  // Notifica di sistema
  | "INFO"                    // Informazione generica
  | "WARNING"                 // Avviso
  | "SUCCESS"                 // Successo
  | "ERROR";                  // Errore

// Ruoli destinatari
export type NotificationRecipientRole = "ADMIN" | "PROPRIETARIO" | "OPERATORE_PULIZIE" | "RIDER" | "ALL";

// Status azione
export type NotificationActionStatus = "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED";

// Notifica
export interface FirebaseNotification {
  id: string;
  
  // Contenuto
  title: string;
  message: string;
  type: NotificationType;
  
  // Destinatario
  recipientRole: NotificationRecipientRole;  // Per notifiche a ruolo
  recipientId?: string;                       // Per notifiche specifiche a utente
  
  // Mittente
  senderId: string;
  senderName: string;
  senderEmail?: string;
  
  // Entità correlata (es. proprietà, pulizia, prenotazione)
  relatedEntityId?: string;
  relatedEntityType?: "PROPERTY" | "CLEANING" | "BOOKING" | "USER";
  relatedEntityName?: string;
  
  // Stato
  status: "UNREAD" | "READ" | "ARCHIVED";
  
  // Se richiede un'azione
  actionRequired: boolean;
  actionStatus?: NotificationActionStatus;
  actionNote?: string;                        // Note admin per approvazione/rifiuto
  actionBy?: string;                          // Chi ha eseguito l'azione
  actionAt?: Timestamp;                       // Quando è stata eseguita l'azione
  
  // Link per navigazione
  link?: string;
  
  // Timestamp
  createdAt: Timestamp;
  readAt?: Timestamp;
  updatedAt?: Timestamp;
}