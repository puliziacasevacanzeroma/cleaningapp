import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  query,
  where,
} from "firebase/firestore";
import { db } from "./config";

// ==================== PROPERTIES ====================

export interface BedConfig {
  id: string;
  type: 'matr' | 'sing' | 'divano' | 'castello'; // matrimoniale, singolo, divano letto, castello
  name: string;
  location: string; // es: "Camera 1", "Soggiorno"
  capacity: number; // posti letto
}

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
  usesOwnLinen?: boolean;
  linenConfig?: LinenConfig[];
  bedsConfig?: BedConfig[];
  // Campi posizione
  floor?: string;
  apartment?: string;
  intercom?: string;
  postalCode?: string;
  // Coordinate geografiche (per calcolo distanze)
  coordinates?: {
    lat: number;
    lng: number;
  };
  coordinatesVerified?: boolean; // true se verificate da geocoding
  // Campi accesso
  doorCode?: string;
  keysLocation?: string;
  accessNotes?: string;
  images?: { door?: string; building?: string };
  // Timestamp
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
  // 🔥 NOTA: La protezione contro la cancellazione accidentale dei link iCal
  // è ora gestita dal frontend con un dialog di conferma.
  // L'utente deve esplicitamente scegliere "Elimina" per rimuovere le prenotazioni.
  
  await updateDoc(doc(db, "properties", id), {
    ...data,
    updatedAt: Timestamp.now(),
  });
}

export async function deleteProperty(id: string): Promise<void> {
  await deleteDoc(doc(db, "properties", id));
}

// ==================== ELIMINAZIONE A CASCATA ====================

/**
 * Elimina una proprietà e TUTTI i dati collegati:
 * - Pulizie (cleanings)
 * - Ordini biancheria (orders)
 * - Prenotazioni (bookings)
 * - Notifiche collegate
 */
export async function deletePropertyWithCascade(propertyId: string): Promise<{
  deletedCleanings: number;
  deletedOrders: number;
  deletedBookings: number;
  deletedNotifications: number;
}> {
  console.log(`🗑️ Eliminazione a cascata per proprietà: ${propertyId}`);
  
  let deletedCleanings = 0;
  let deletedOrders = 0;
  let deletedBookings = 0;
  let deletedNotifications = 0;

  // 1. Elimina tutte le pulizie della proprietà
  const cleaningsSnapshot = await getDocs(
    query(collection(db, "cleanings"), where("propertyId", "==", propertyId))
  );
  for (const docSnap of cleaningsSnapshot.docs) {
    await deleteDoc(doc(db, "cleanings", docSnap.id));
    deletedCleanings++;
  }
  console.log(`   ✓ Eliminate ${deletedCleanings} pulizie`);

  // 2. Elimina tutti gli ordini della proprietà
  const ordersSnapshot = await getDocs(
    query(collection(db, "orders"), where("propertyId", "==", propertyId))
  );
  for (const docSnap of ordersSnapshot.docs) {
    await deleteDoc(doc(db, "orders", docSnap.id));
    deletedOrders++;
  }
  console.log(`   ✓ Eliminati ${deletedOrders} ordini`);

  // 3. Elimina tutte le prenotazioni della proprietà
  const bookingsSnapshot = await getDocs(
    query(collection(db, "bookings"), where("propertyId", "==", propertyId))
  );
  for (const docSnap of bookingsSnapshot.docs) {
    await deleteDoc(doc(db, "bookings", docSnap.id));
    deletedBookings++;
  }
  console.log(`   ✓ Eliminate ${deletedBookings} prenotazioni`);

  // 4. Elimina notifiche collegate alla proprietà
  try {
    const notificationsSnapshot = await getDocs(
      query(collection(db, "notifications"), where("propertyId", "==", propertyId))
    );
    for (const docSnap of notificationsSnapshot.docs) {
      await deleteDoc(doc(db, "notifications", docSnap.id));
      deletedNotifications++;
    }
    console.log(`   ✓ Eliminate ${deletedNotifications} notifiche`);
  } catch (e) {
    console.log(`   ⚠️ Notifiche: nessuna o errore ignorato`);
  }

  // 5. Infine elimina la proprietà stessa
  await deleteDoc(doc(db, "properties", propertyId));
  console.log(`   ✓ Proprietà eliminata`);

  return { deletedCleanings, deletedOrders, deletedBookings, deletedNotifications };
}

/**
 * Pulisce TUTTI i dati orfani (pulizie, ordini, prenotazioni senza proprietà esistente)
 */
export async function cleanOrphanedData(): Promise<{
  deletedCleanings: number;
  deletedOrders: number;
  deletedBookings: number;
}> {
  console.log("🧹 Pulizia dati orfani in corso...");

  const propertiesSnapshot = await getDocs(collection(db, "properties"));
  const existingPropertyIds = new Set(propertiesSnapshot.docs.map(d => d.id));
  
  console.log(`   📋 Proprietà esistenti: ${existingPropertyIds.size}`);

  let deletedCleanings = 0;
  let deletedOrders = 0;
  let deletedBookings = 0;

  // 1. Pulisci pulizie orfane
  const cleaningsSnapshot = await getDocs(collection(db, "cleanings"));
  for (const docSnap of cleaningsSnapshot.docs) {
    const data = docSnap.data();
    if (!data.propertyId || !existingPropertyIds.has(data.propertyId)) {
      await deleteDoc(doc(db, "cleanings", docSnap.id));
      deletedCleanings++;
      console.log(`   🗑️ Pulizia orfana eliminata: ${docSnap.id} (propertyId: ${data.propertyId})`);
    }
  }

  // 2. Pulisci ordini orfani
  const ordersSnapshot = await getDocs(collection(db, "orders"));
  for (const docSnap of ordersSnapshot.docs) {
    const data = docSnap.data();
    if (!data.propertyId || !existingPropertyIds.has(data.propertyId)) {
      await deleteDoc(doc(db, "orders", docSnap.id));
      deletedOrders++;
      console.log(`   🗑️ Ordine orfano eliminato: ${docSnap.id} (propertyId: ${data.propertyId})`);
    }
  }

  // 3. Pulisci prenotazioni orfane
  const bookingsSnapshot = await getDocs(collection(db, "bookings"));
  for (const docSnap of bookingsSnapshot.docs) {
    const data = docSnap.data();
    if (!data.propertyId || !existingPropertyIds.has(data.propertyId)) {
      await deleteDoc(doc(db, "bookings", docSnap.id));
      deletedBookings++;
      console.log(`   🗑️ Prenotazione orfana eliminata: ${docSnap.id} (propertyId: ${data.propertyId})`);
    }
  }

  console.log(`✅ Pulizia completata: ${deletedCleanings} pulizie, ${deletedOrders} ordini, ${deletedBookings} prenotazioni`);

  return { deletedCleanings, deletedOrders, deletedBookings };
}

/**
 * Ottiene gli ID di tutte le proprietà ATTIVE
 */
export async function getActivePropertyIds(): Promise<Set<string>> {
  const snapshot = await getDocs(
    query(collection(db, "properties"), where("status", "==", "ACTIVE"))
  );
  return new Set(snapshot.docs.map(d => d.id));
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
  type?: string;
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

/**
 * Ottiene pulizie SOLO per proprietà ATTIVE
 */
export async function getCleaningsForActiveProperties(filters?: { date?: Date; status?: string; operatorId?: string }): Promise<Cleaning[]> {
  const activePropertyIds = await getActivePropertyIds();
  const allCleanings = await getCleanings(filters);
  
  return allCleanings.filter(c => activePropertyIds.has(c.propertyId));
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

/**
 * Ottiene pulizie di una data SOLO per proprietà ATTIVE
 */
export async function getCleaningsByDateForActiveProperties(date: Date): Promise<Cleaning[]> {
  const activePropertyIds = await getActivePropertyIds();
  const allCleanings = await getCleaningsByDate(date);
  
  return allCleanings.filter(c => activePropertyIds.has(c.propertyId));
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

export async function deleteCleaning(id: string): Promise<void> {
  await deleteDoc(doc(db, "cleanings", id));
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

/**
 * Ottiene prenotazioni SOLO per proprietà ATTIVE
 */
export async function getBookingsForActiveProperties(propertyId?: string): Promise<Booking[]> {
  const activePropertyIds = await getActivePropertyIds();
  const allBookings = await getBookings(propertyId);
  
  return allBookings.filter(b => activePropertyIds.has(b.propertyId));
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
  cleaningId?: string;
  propertyId: string;
  propertyName?: string;
  propertyAddress?: string;
  propertyCity?: string;
  propertyPostalCode?: string;
  propertyFloor?: string;
  propertyApartment?: string;
  propertyIntercom?: string;
  propertyAccessCode?: string;
  propertyDoorCode?: string;
  propertyKeysLocation?: string;
  propertyAccessNotes?: string;
  propertyImages?: { door?: string; building?: string };
  riderId?: string;
  riderName?: string;
  status: string;
  type?: string;
  scheduledDate?: Timestamp;
  scheduledTime?: string; // Ora consegna (per ordini senza pulizia o override)
  urgency?: 'normal' | 'urgent'; // Urgenza ordine (default: normal)
  
  // Articoli da CONSEGNARE (portare pulita)
  items: { id: string; name: string; quantity: number }[];
  
  // Ritiro biancheria sporca
  includePickup?: boolean; // Default: true. Solo Admin può mettere false
  pickupItems?: { id: string; name: string; quantity: number }[]; // Articoli da ritirare (calcolato automaticamente)
  pickupFromOrders?: string[]; // ID degli ordini precedenti da cui ritiro
  pickupCompleted?: boolean; // true quando il rider ha ritirato
  
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

/**
 * Ottiene ordini SOLO per proprietà ATTIVE
 */
export async function getOrdersForActiveProperties(filters?: { status?: string; riderId?: string; date?: Date }): Promise<Order[]> {
  const activePropertyIds = await getActivePropertyIds();
  const allOrders = await getOrders(filters);
  
  return allOrders.filter(o => activePropertyIds.has(o.propertyId));
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

/**
 * Ottiene ordini di una data SOLO per proprietà ATTIVE
 */
export async function getOrdersByDateForActiveProperties(date: Date): Promise<Order[]> {
  const activePropertyIds = await getActivePropertyIds();
  const allOrders = await getOrdersByDate(date);
  
  return allOrders.filter(o => activePropertyIds.has(o.propertyId));
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
  
  const cleaningId = await createCleaning(cleaningData);
  
  let orderId: string | undefined;
  
  if (createLinenOrder && cleaningData.propertyId) {
    const property = await getPropertyById(cleaningData.propertyId);
    
    if (property && !property.usesOwnLinen) {
      let linenItems: { id: string; name: string; quantity: number }[] = [];
      
      if (property.linenConfig && property.linenConfig.length > 0) {
        linenItems = property.linenConfig.map(item => ({
          id: item.itemId,
          name: item.itemName,
          quantity: item.quantity,
        }));
      } else {
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
          cleaningId,
          propertyId: cleaningData.propertyId,
          propertyName: cleaningData.propertyName || property.name,
          propertyAddress: property.address,
          propertyCity: property.city || "",
          propertyPostalCode: property.postalCode || "",
          propertyFloor: property.floor || "",
          propertyApartment: property.apartment || "",
          propertyIntercom: property.intercom || "",
          propertyAccessCode: (property as any).accessCode || "",
          propertyDoorCode: property.doorCode || "",
          propertyKeysLocation: property.keysLocation || "",
          propertyAccessNotes: property.accessNotes || "",
          propertyImages: property.images || undefined,
          status: "PENDING",
          type: "LINEN",
          scheduledDate: cleaningData.scheduledDate,
          items: linenItems
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
    propertyId,
    propertyName: property.name,
    propertyAddress: property.address,
    propertyCity: property.city || "",
    propertyPostalCode: property.postalCode || "",
    propertyFloor: property.floor || "",
    propertyApartment: property.apartment || "",
    propertyIntercom: property.intercom || "",
    propertyAccessCode: (property as any).accessCode || "",
    propertyDoorCode: property.doorCode || "",
    propertyKeysLocation: property.keysLocation || "",
    propertyAccessNotes: property.accessNotes || "",
    propertyImages: property.images || undefined,
    status: "PENDING",
    type: "LINEN",
    scheduledDate: Timestamp.fromDate(scheduledDate),
    items: linenItems
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
    getCleaningsByDateForActiveProperties(today),
    getUsers("OPERATORE_PULIZIE"),
    getOrdersByDateForActiveProperties(today),
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

// ==================== PULIZIE FANTASMA ====================

/**
 * Interfaccia per pulizia fantasma con info aggiuntive
 */
export interface GhostCleaning {
  id: string;
  propertyId: string;
  propertyName: string;
  scheduledDate: Date;
  scheduledTime: string;
  status: string;
  operatorName: string | null;
  guestName: string | null;
  daysOverdue: number; // Giorni di ritardo
}

/**
 * Trova tutte le pulizie "fantasma" - pulizie passate non completate/annullate
 * @param daysBack - Quanti giorni indietro cercare (default: 30)
 */
export async function getGhostCleanings(daysBack: number = 30): Promise<GhostCleaning[]> {
  console.log(`👻 Ricerca pulizie fantasma (ultimi ${daysBack} giorni)...`);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - daysBack);

  // Carica tutte le pulizie nel range
  const snapshot = await getDocs(collection(db, "cleanings"));
  
  const ghostCleanings: GhostCleaning[] = [];

  snapshot.docs.forEach(docSnap => {
    const data = docSnap.data();
    const scheduledDate = data.scheduledDate?.toDate?.() || null;
    
    if (!scheduledDate) return;

    // Verifica se è una pulizia fantasma:
    // 1. Data passata (prima di oggi)
    // 2. Stato NON completato e NON annullato
    const isPast = scheduledDate < today;
    const isNotCompleted = data.status !== "COMPLETED" && 
                           data.status !== "CANCELLED" && 
                           data.status !== "completed" &&
                           data.status !== "cancelled";
    const isInRange = scheduledDate >= startDate;

    if (isPast && isNotCompleted && isInRange) {
      const daysOverdue = Math.floor((today.getTime() - scheduledDate.getTime()) / (1000 * 60 * 60 * 24));
      
      ghostCleanings.push({
        id: docSnap.id,
        propertyId: data.propertyId || "",
        propertyName: data.propertyName || "Proprietà sconosciuta",
        scheduledDate: scheduledDate,
        scheduledTime: data.scheduledTime || "10:00",
        status: data.status || "SCHEDULED",
        operatorName: data.operatorName || (data.operators?.[0]?.name) || null,
        guestName: data.guestName || null,
        daysOverdue,
      });
    }
  });

  // Ordina per data (più vecchie prima)
  ghostCleanings.sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime());

  console.log(`👻 Trovate ${ghostCleanings.length} pulizie fantasma`);

  return ghostCleanings;
}

/**
 * Marca una pulizia come completata
 */
export async function markCleaningAsCompleted(cleaningId: string): Promise<void> {
  await updateDoc(doc(db, "cleanings", cleaningId), {
    status: "COMPLETED",
    completedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    notes: (await getCleaningById(cleaningId))?.notes 
      ? `${(await getCleaningById(cleaningId))?.notes}\n[Marcata come completata manualmente]`
      : "[Marcata come completata manualmente]"
  });
  console.log(`✅ Pulizia ${cleaningId} marcata come completata`);
}

/**
 * Marca una pulizia come annullata
 */
export async function markCleaningAsCancelled(cleaningId: string): Promise<void> {
  await updateDoc(doc(db, "cleanings", cleaningId), {
    status: "CANCELLED",
    updatedAt: Timestamp.now(),
    notes: (await getCleaningById(cleaningId))?.notes 
      ? `${(await getCleaningById(cleaningId))?.notes}\n[Annullata manualmente]`
      : "[Annullata manualmente]"
  });
  console.log(`❌ Pulizia ${cleaningId} annullata`);
}

/**
 * Gestisce in blocco le pulizie fantasma
 * @param action - "complete" | "cancel" | "delete"
 * @param cleaningIds - Array di ID da gestire (se vuoto, gestisce tutte)
 */
export async function handleGhostCleanings(
  action: "complete" | "cancel" | "delete",
  cleaningIds?: string[]
): Promise<{ processed: number; errors: number }> {
  let idsToProcess = cleaningIds;

  // Se non specificati, prendi tutte le ghost cleanings
  if (!idsToProcess || idsToProcess.length === 0) {
    const ghosts = await getGhostCleanings();
    idsToProcess = ghosts.map(g => g.id);
  }

  console.log(`👻 Gestione ${idsToProcess.length} pulizie fantasma (azione: ${action})...`);

  let processed = 0;
  let errors = 0;

  for (const id of idsToProcess) {
    try {
      switch (action) {
        case "complete":
          await updateDoc(doc(db, "cleanings", id), {
            status: "COMPLETED",
            completedAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          });
          break;
        case "cancel":
          await updateDoc(doc(db, "cleanings", id), {
            status: "CANCELLED",
            updatedAt: Timestamp.now(),
          });
          break;
        case "delete":
          await deleteDoc(doc(db, "cleanings", id));
          break;
      }
      processed++;
    } catch (e) {
      console.error(`Errore gestione pulizia ${id}:`, e);
      errors++;
    }
  }

  console.log(`✅ Gestione completata: ${processed} processate, ${errors} errori`);

  return { processed, errors };
}

/**
 * Ottiene statistiche sulle pulizie fantasma
 */
export async function getGhostCleaningsStats(): Promise<{
  total: number;
  byStatus: Record<string, number>;
  oldestDays: number;
  withOperator: number;
  withoutOperator: number;
}> {
  const ghosts = await getGhostCleanings(90); // Ultimi 90 giorni

  const byStatus: Record<string, number> = {};
  let withOperator = 0;
  let withoutOperator = 0;
  let oldestDays = 0;

  ghosts.forEach(g => {
    byStatus[g.status] = (byStatus[g.status] || 0) + 1;
    if (g.operatorName) withOperator++;
    else withoutOperator++;
    if (g.daysOverdue > oldestDays) oldestDays = g.daysOverdue;
  });

  return {
    total: ghosts.length,
    byStatus,
    oldestDays,
    withOperator,
    withoutOperator,
  };
}
