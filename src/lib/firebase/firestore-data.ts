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
  usesOwnLinen?: boolean; // NUOVO: se true, non creare ordine biancheria
  linenConfig?: LinenConfig[]; // Configurazione biancheria per questa proprietà
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface LinenConfig {
  itemId: string;
  itemName: string;
  quantity: number;
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
    usesOwnLinen: data.usesOwnLinen || false,
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
  propertyAddress?: string;
  operatorId?: string;
  operatorName?: string;
  operators?: { id: string; name: string }[];
  bookingId?: string;
  guestName?: string;
  guestsCount?: number;
  scheduledDate: Timestamp;
  scheduledTime?: string;
  status: string;
  type?: string; // CHECKOUT, CHECKIN, DEEP_CLEAN, MAINTENANCE, MANUAL
  price?: number;
  notes?: string;
  operatorNotes?: string;
  photos?: string[];
  checklistCompleted?: string[];
  startedAt?: Timestamp;
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

// ==================== ORDERS (BIANCHERIA) ====================

export interface Order {
  id: string;
  cleaningId?: string; // NUOVO: collegamento alla pulizia
  propertyId: string;
  propertyName?: string;
  propertyAddress?: string;
  riderId?: string;
  riderName?: string;
  status: string; // PENDING, ASSIGNED, IN_PROGRESS, DELIVERED
  type?: string; // LINEN (biancheria), SUPPLIES (forniture)
  scheduledDate?: Timestamp;
  items: { id: string; name: string; quantity: number }[];
  notes?: string;
  deliveredAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export async function getOrders(filters?: { status?: string; riderId?: string; date?: Date }): Promise<Order[]> {
  const snapshot = await getDocs(collection(db, "orders"));

  let orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));

  if (filters?.status) {
    orders = orders.filter(o => o.status === filters.status);
  }
  if (filters?.riderId) {
    orders = orders.filter(o => o.riderId === filters.riderId);
  }
  if (filters?.date) {
    const dateStr = filters.date.toISOString().split('T')[0];
    orders = orders.filter(o => {
      if (!o.scheduledDate) return false;
      const orderDate = o.scheduledDate.toDate?.()?.toISOString().split('T')[0] || "";
      return orderDate === dateStr;
    });
  }

  orders.sort((a, b) => {
    const dateA = a.createdAt?.toDate?.() || new Date(0);
    const dateB = b.createdAt?.toDate?.() || new Date(0);
    return dateB.getTime() - dateA.getTime();
  });

  return orders;
}

export async function getOrdersByDate(date: Date): Promise<Order[]> {
  const dateStr = date.toISOString().split('T')[0];

  const snapshot = await getDocs(collection(db, "orders"));

  let orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));

  orders = orders.filter(o => {
    if (!o.scheduledDate) return false;
    const orderDate = o.scheduledDate.toDate?.()?.toISOString().split('T')[0] || "";
    return orderDate === dateStr;
  });

  return orders;
}

export async function createOrder(data: Omit<Order, "id" | "createdAt" | "updatedAt">): Promise<string> {
  const docRef = await addDoc(collection(db, "orders"), {
    ...data,
    status: data.status || "PENDING",
    type: data.type || "LINEN",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  return docRef.id;
}

export async function updateOrder(id: string, data: Partial<Order>): Promise<void> {
  await updateDoc(doc(db, "orders", id), {
    ...data,
    updatedAt: Timestamp.now(),
  });
}

// ==================== CREA PULIZIA CON ORDINE BIANCHERIA ====================

export async function createCleaningWithLinenOrder(
  cleaningData: Omit<Cleaning, "id" | "createdAt" | "updatedAt">,
  createLinenOrder: boolean = true
): Promise<{ cleaningId: string; orderId?: string }> {
  
  // 1. Crea la pulizia
  const cleaningId = await createCleaning(cleaningData);
  
  let orderId: string | undefined;
  
  // 2. Se richiesto, crea l'ordine biancheria
  if (createLinenOrder && cleaningData.propertyId) {
    // Carica la proprietà per ottenere la config biancheria
    const property = await getPropertyById(cleaningData.propertyId);
    
    if (property && !property.usesOwnLinen) {
      // Determina gli items di biancheria
      let linenItems: { id: string; name: string; quantity: number }[] = [];
      
      if (property.linenConfig && property.linenConfig.length > 0) {
        // Usa la configurazione specifica della proprietà
        linenItems = property.linenConfig.map(item => ({
          id: item.itemId,
          name: item.itemName,
          quantity: item.quantity,
        }));
      } else {
        // Usa una configurazione di default basata sulle camere
        const bedrooms = property.bedrooms || 1;
        const bathrooms = property.bathrooms || 1;
        const guests = cleaningData.guestsCount || property.maxGuests || 2;
        
        linenItems = [
          { id: "lenzuola_matrimoniale", name: "Set Lenzuola Matrimoniale", quantity: Math.ceil(bedrooms / 2) },
          { id: "lenzuola_singolo", name: "Set Lenzuola Singolo", quantity: bedrooms % 2 },
          { id: "asciugamani_grandi", name: "Asciugamani Grandi", quantity: guests },
          { id: "asciugamani_piccoli", name: "Asciugamani Piccoli", quantity: guests },
          { id: "tappetino_bagno", name: "Tappetino Bagno", quantity: bathrooms },
        ].filter(item => item.quantity > 0);
      }
      
      if (linenItems.length > 0) {
        orderId = await createOrder({
          cleaningId: cleaningId,
          propertyId: cleaningData.propertyId,
          propertyName: cleaningData.propertyName || property.name,
          propertyAddress: property.address,
          status: "PENDING",
          type: "LINEN",
          scheduledDate: cleaningData.scheduledDate,
          items: linenItems,
        });
      }
    }
  }
  
  return { cleaningId, orderId };
}

// ==================== CREA SOLO ORDINE BIANCHERIA ====================

export async function createLinenOnlyOrder(
  propertyId: string,
  scheduledDate: Date,
  customItems?: { id: string; name: string; quantity: number }[]
): Promise<string> {
  const property = await getPropertyById(propertyId);
  
  if (!property) {
    throw new Error("Proprietà non trovata");
  }
  
  let linenItems = customItems;
  
  if (!linenItems || linenItems.length === 0) {
    // Usa config proprietà o default
    if (property.linenConfig && property.linenConfig.length > 0) {
      linenItems = property.linenConfig.map(item => ({
        id: item.itemId,
        name: item.itemName,
        quantity: item.quantity,
      }));
    } else {
      const bedrooms = property.bedrooms || 1;
      const bathrooms = property.bathrooms || 1;
      const guests = property.maxGuests || 2;
      
      linenItems = [
        { id: "lenzuola_matrimoniale", name: "Set Lenzuola Matrimoniale", quantity: Math.ceil(bedrooms / 2) },
        { id: "asciugamani_grandi", name: "Asciugamani Grandi", quantity: guests },
        { id: "asciugamani_piccoli", name: "Asciugamani Piccoli", quantity: guests },
        { id: "tappetino_bagno", name: "Tappetino Bagno", quantity: bathrooms },
      ];
    }
  }
  
  const orderId = await createOrder({
    propertyId: propertyId,
    propertyName: property.name,
    propertyAddress: property.address,
    status: "PENDING",
    type: "LINEN",
    scheduledDate: Timestamp.fromDate(scheduledDate),
    items: linenItems,
  });
  
  return orderId;
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

  const [properties, cleaningsToday, operators, ordersToday] = await Promise.all([
    getProperties("ACTIVE"),
    getCleaningsByDate(today),
    getUsers("OPERATORE_PULIZIE"),
    getOrdersByDate(today),
  ]);

  return {
    propertiesTotal: properties.length,
    cleaningsToday: cleaningsToday.length,
    operatorsActive: operators.length,
    ordersToday: ordersToday.length,
    cleanings: cleaningsToday,
    operators: operators,
    orders: ordersToday,
  };
}
