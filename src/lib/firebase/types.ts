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

// Notifica
export interface FirebaseNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: "INFO" | "WARNING" | "SUCCESS" | "ERROR";
  read: boolean;
  link?: string;
  createdAt: Timestamp;
}