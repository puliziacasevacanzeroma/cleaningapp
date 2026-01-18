import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "./config";

// ==================== PROPERTIES ====================

export interface Property {
  id: string;
  name: string;
  address: string;
  city?: string;
  zone?: string;
  type?: string;
  size?: number;
  bedrooms?: number;
  bathrooms?: number;
  maxGuests?: number;
  cleaningPrice?: number;
  ownerId: string;
  ownerName?: string;
  ownerEmail?: string;
  status: string;
  icalUrl?: string;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export async function getProperties(status?: string): Promise<Property[]> {
  const snapshot = await getDocs(collection(db, "properties"));
  
  let properties = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Property));
  
  if (status) {
    properties = properties.filter(p => p.status === status);
  }
  
  properties.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  
  return properties;
}

export async function getPropertyById(id: string): Promise<Property | null> {
  const docRef = doc(db, "properties", id);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() } as Property;
}

export async function getPropertiesByOwner(ownerId: string): Promise<Property[]> {
  const snapshot = await getDocs(collection(db, "properties"));
  
  let properties = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Property));
  properties = properties.filter(p => p.ownerId === ownerId);
  properties.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  
  return properties;
}

export async function createProperty(data: Omit<Property, "id" | "createdAt" | "updatedAt">): Promise<string> {
  const docRef = await addDoc(collection(db, "properties"), {
    ...data,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  return docRef.id;
}

export async function updateProperty(id: string, data: Partial<Property>): Promise<void> {
  await updateDoc(doc(db, "properties", id), {
    ...data,
    updatedAt: Timestamp.now(),
  });
}

export async function deleteProperty(id: string): Promise<void> {
  await deleteDoc(doc(db, "properties", id));
}

// ==================== CLEANINGS ====================

export interface Cleaning {
  id: string;
  propertyId: string;
  propertyName?: string;
  operatorId?: string;
  operatorName?: string;
  bookingId?: string;
  guestName?: string;
  scheduledDate: Timestamp;
  scheduledTime?: string;
  status: string;
  price?: number;
  notes?: string;
  completedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export async function getCleanings(filters?: { date?: Date; status?: string; operatorId?: string }): Promise<Cleaning[]> {
  const snapshot = await getDocs(collection(db, "cleanings"));
  
  let cleanings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Cleaning));
  
  if (filters?.status) {
    cleanings = cleanings.filter(c => c.status === filters.status);
  }
  if (filters?.operatorId) {
    cleanings = cleanings.filter(c => c.operatorId === filters.operatorId);
  }
  if (filters?.date) {
    const dateStr = filters.date.toISOString().split('T')[0];
    cleanings = cleanings.filter(c => {
      if (!c.scheduledDate) return false;
      const cleaningDate = c.scheduledDate.toDate?.()?.toISOString().split('T')[0] || "";
      return cleaningDate === dateStr;
    });
  }
  
  cleanings.sort((a, b) => {
    const dateA = a.scheduledDate?.toDate?.() || new Date(0);
    const dateB = b.scheduledDate?.toDate?.() || new Date(0);
    return dateB.getTime() - dateA.getTime();
  });
  
  return cleanings;
}

export async function getCleaningsByDate(date: Date): Promise<Cleaning[]> {
  const dateStr = date.toISOString().split('T')[0];
  
  const snapshot = await getDocs(collection(db, "cleanings"));
  
  let cleanings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Cleaning));
  
  cleanings = cleanings.filter(c => {
    if (!c.scheduledDate) return false;
    const cleaningDate = c.scheduledDate.toDate?.()?.toISOString().split('T')[0] || "";
    return cleaningDate === dateStr;
  });
  
  cleanings.sort((a, b) => {
    const timeA = a.scheduledTime || "00:00";
    const timeB = b.scheduledTime || "00:00";
    return timeA.localeCompare(timeB);
  });
  
  return cleanings;
}

export async function getCleaningById(id: string): Promise<Cleaning | null> {
  const docRef = doc(db, "cleanings", id);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() } as Cleaning;
}

export async function createCleaning(data: Omit<Cleaning, "id" | "createdAt" | "updatedAt">): Promise<string> {
  const docRef = await addDoc(collection(db, "cleanings"), {
    ...data,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  return docRef.id;
}

export async function updateCleaning(id: string, data: Partial<Cleaning>): Promise<void> {
  await updateDoc(doc(db, "cleanings", id), {
    ...data,
    updatedAt: Timestamp.now(),
  });
}

// ==================== BOOKINGS ====================

export interface Booking {
  id: string;
  propertyId: string;
  propertyName?: string;
  guestName: string;
  guestEmail?: string;
  guestPhone?: string;
  checkIn: Timestamp;
  checkOut: Timestamp;
  guests?: number;
  source?: string;
  status: string;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export async function getBookings(propertyId?: string): Promise<Booking[]> {
  const snapshot = await getDocs(collection(db, "bookings"));
  
  let bookings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
  
  if (propertyId) {
    bookings = bookings.filter(b => b.propertyId === propertyId);
  }
  
  bookings.sort((a, b) => {
    const dateA = a.checkIn?.toDate?.() || new Date(0);
    const dateB = b.checkIn?.toDate?.() || new Date(0);
    return dateB.getTime() - dateA.getTime();
  });
  
  return bookings;
}

export async function getBookingById(id: string): Promise<Booking | null> {
  const docRef = doc(db, "bookings", id);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() } as Booking;
}

export async function createBooking(data: Omit<Booking, "id" | "createdAt" | "updatedAt">): Promise<string> {
  const docRef = await addDoc(collection(db, "bookings"), {
    ...data,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  return docRef.id;
}

export async function updateBooking(id: string, data: Partial<Booking>): Promise<void> {
  await updateDoc(doc(db, "bookings", id), {
    ...data,
    updatedAt: Timestamp.now(),
  });
}

// ==================== INVENTORY ====================

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit?: string;
  minQuantity?: number;
  price?: number;
  supplier?: string;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export async function getInventory(category?: string): Promise<InventoryItem[]> {
  const snapshot = await getDocs(collection(db, "inventory"));
  
  let items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem));
  
  if (category) {
    items = items.filter(i => i.category === category);
  }
  
  items.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  
  return items;
}

export async function updateInventoryQuantity(id: string, quantity: number): Promise<void> {
  await updateDoc(doc(db, "inventory", id), {
    quantity,
    updatedAt: Timestamp.now(),
  });
}

// ==================== ORDERS ====================

export interface Order {
  id: string;
  propertyId: string;
  propertyName?: string;
  propertyAddress?: string;
  riderId?: string;
  riderName?: string;
  status: string;
  scheduledDate?: Timestamp;
  items: { id: string; name: string; quantity: number }[];
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export async function getOrders(): Promise<Order[]> {
  const snapshot = await getDocs(collection(db, "orders"));
  
  let orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
  
  orders.sort((a, b) => {
    const dateA = a.createdAt?.toDate?.() || new Date(0);
    const dateB = b.createdAt?.toDate?.() || new Date(0);
    return dateB.getTime() - dateA.getTime();
  });
  
  return orders;
}

// ==================== USERS ====================

export async function getUsers(role?: string) {
  const snapshot = await getDocs(collection(db, "users"));
  
  let users = snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name || "",
      surname: data.surname || "",
      email: data.email || "",
      phone: data.phone || "",
      role: data.role || "",
      status: data.status || "ACTIVE",
    };
  });
  
  if (role) {
    users = users.filter(u => u.role === role);
  }
  
  users.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  
  return users;
}

// ==================== STATS ====================

export async function getDashboardStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const [properties, cleaningsToday, operators] = await Promise.all([
    getProperties("ACTIVE"),
    getCleaningsByDate(today),
    getUsers("OPERATORE_PULIZIE"),
  ]);
  
  return {
    propertiesTotal: properties.length,
    cleaningsToday: cleaningsToday.length,
    operatorsActive: operators.length,
    cleanings: cleaningsToday,
    operators: operators,
  };
}