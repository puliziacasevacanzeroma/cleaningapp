/**
 * firestore-data-admin.ts
 * 
 * Versione Admin SDK delle funzioni CRUD Firestore per uso lato server (API routes).
 * Questo file è un mirror delle funzioni in firestore-data.ts ma usa firebase-admin
 * invece del Client SDK, per uso corretto nelle API routes.
 * 
 * Il file firestore-data.ts originale rimane invariato per il frontend (client-side).
 */

import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

// Costante definita localmente per evitare import dal Client SDK
export const DELIVERY_FEE = 10; // €10 per consegna biancheria standalone

// Re-export types only (eliminati a compile time, non causano import runtime)
export type { Property, Cleaning, Order, BedConfig, LinenConfig, Booking, InventoryItem } from "./firestore-data";

// Import types for internal use
import type { Property, Cleaning, Order } from "./firestore-data";

// ==================== PROPERTIES ====================

export async function getProperties(status?: string): Promise<Property[]> {
  const snapshot = await adminDb.collection("properties").get();
  let properties = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) } as Property));

  if (status) {
    properties = properties.filter(p => p.status === status);
  }

  properties.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  return properties;
}

export async function getPropertyById(id: string): Promise<Property | null> {
  const docSnap = await adminDb.collection("properties").doc(id).get();
  if (!docSnap.exists) return null;
  return { id: docSnap.id, ...(docSnap.data() as Record<string, any>) } as Property;
}

export async function getPropertiesByOwner(ownerId: string): Promise<Property[]> {
  const snapshot = await adminDb.collection("properties")
    .where("ownerId", "==", ownerId)
    .get();

  const properties = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) } as Property));
  properties.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  return properties;
}

export async function updateProperty(id: string, data: Partial<Property>): Promise<void> {
  await adminDb.collection("properties").doc(id).update({
    ...data,
    updatedAt: Timestamp.now(),
  });
}

// ==================== DELETE WITH CASCADE ====================

export async function deletePropertyWithCascade(propertyId: string): Promise<{
  deletedCleanings: number;
  deletedOrders: number;
  deletedBookings: number;
  deletedNotifications: number;
}> {
  let deletedCleanings = 0;
  let deletedOrders = 0;
  let deletedBookings = 0;
  let deletedNotifications = 0;

  // 1. Elimina tutte le pulizie della proprietà
  const cleaningsSnapshot = await adminDb.collection("cleanings")
    .where("propertyId", "==", propertyId).get();
  const cleaningIds = cleaningsSnapshot.docs.map(d => d.id);
  for (const docSnap of cleaningsSnapshot.docs) {
    await adminDb.collection("cleanings").doc(docSnap.id).delete();
    deletedCleanings++;
  }

  // 2. Elimina tutti gli ordini della proprietà (per propertyId)
  const ordersSnapshot = await adminDb.collection("orders")
    .where("propertyId", "==", propertyId).get();
  for (const docSnap of ordersSnapshot.docs) {
    await adminDb.collection("orders").doc(docSnap.id).delete();
    deletedOrders++;
  }

  // 2b. Elimina ordini collegati alle pulizie (per cleaningId)
  if (cleaningIds.length > 0) {
    for (let i = 0; i < cleaningIds.length; i += 30) {
      const chunk = cleaningIds.slice(i, i + 30);
      try {
        const linkedOrdersSnapshot = await adminDb.collection("orders")
          .where("cleaningId", "in", chunk).get();
        for (const docSnap of linkedOrdersSnapshot.docs) {
          try {
            await adminDb.collection("orders").doc(docSnap.id).delete();
            deletedOrders++;
          } catch { /* Già eliminato */ }
        }
      } catch (e) {
        console.warn("⚠️ Errore query ordini per cleaningIds chunk:", e);
      }
    }
  }

  // 2c. Elimina ordini legacy (linen_orders)
  try {
    const linenOrdersSnapshot = await adminDb.collection("linen_orders")
      .where("propertyId", "==", propertyId).get();
    for (const docSnap of linenOrdersSnapshot.docs) {
      await adminDb.collection("linen_orders").doc(docSnap.id).delete();
      deletedOrders++;
    }
  } catch { /* Collection might not exist */ }

  // 3. Elimina prenotazioni
  const bookingsSnapshot = await adminDb.collection("bookings")
    .where("propertyId", "==", propertyId).get();
  for (const docSnap of bookingsSnapshot.docs) {
    await adminDb.collection("bookings").doc(docSnap.id).delete();
    deletedBookings++;
  }

  // 4. Elimina notifiche
  try {
    const notificationsSnapshot = await adminDb.collection("notifications")
      .where("propertyId", "==", propertyId).get();
    for (const docSnap of notificationsSnapshot.docs) {
      await adminDb.collection("notifications").doc(docSnap.id).delete();
      deletedNotifications++;
    }
  } catch { /* Ignore */ }

  // 5. Elimina la proprietà stessa
  await adminDb.collection("properties").doc(propertyId).delete();

  return { deletedCleanings, deletedOrders, deletedBookings, deletedNotifications };
}

// ==================== CLEANINGS ====================

export async function getCleaningsByDate(date: Date): Promise<Cleaning[]> {
  const dateStr = date.toISOString().split('T')[0];
  const snapshot = await adminDb.collection("cleanings").get();

  let cleanings = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) } as Cleaning));

  cleanings = cleanings.filter(c => {
    if (!c.scheduledDate) return false;
    const cleaningDate = (c.scheduledDate as any).toDate?.()?.toISOString().split('T')[0] || "";
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
  const docSnap = await adminDb.collection("cleanings").doc(id).get();
  if (!docSnap.exists) return null;
  return { id: docSnap.id, ...(docSnap.data() as Record<string, any>) } as Cleaning;
}

export async function createCleaning(data: Omit<Cleaning, "id" | "createdAt" | "updatedAt">): Promise<string> {
  const docRef = await adminDb.collection("cleanings").add({
    ...data,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  return docRef.id;
}

// ==================== ORDERS ====================

export async function createOrder(data: Omit<Order, "id" | "createdAt" | "updatedAt">): Promise<string> {
  const docRef = await adminDb.collection("orders").add({
    ...data,
    status: data.status || "PENDING",
    type: data.type || "LINEN",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  return docRef.id;
}

// ==================== USERS ====================

export async function getUsers(role?: string) {
  const snapshot = await adminDb.collection("users").get();

  let users = snapshot.docs.map(doc => {
    const data = doc.data() as Record<string, any>;
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

async function getActivePropertyIds(): Promise<Set<string>> {
  const properties = await getProperties("ACTIVE");
  return new Set(properties.map(p => p.id));
}

async function getCleaningsByDateForActiveProperties(date: Date): Promise<Cleaning[]> {
  const activePropertyIds = await getActivePropertyIds();
  const allCleanings = await getCleaningsByDate(date);
  return allCleanings.filter(c => activePropertyIds.has(c.propertyId));
}

async function getOrdersByDateForActiveProperties(date: Date): Promise<Order[]> {
  const dateStr = date.toISOString().split('T')[0];
  const activePropertyIds = await getActivePropertyIds();
  const snapshot = await adminDb.collection("orders").get();

  let orders = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) } as Order));

  orders = orders.filter(o => {
    if (!activePropertyIds.has(o.propertyId)) return false;
    if (!o.scheduledDate) return false;
    const orderDate = (o.scheduledDate as any).toDate?.()?.toISOString().split('T')[0] || "";
    return orderDate === dateStr;
  });

  return orders;
}

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

// ==================== GHOST CLEANINGS ====================

export interface GhostCleaning {
  id: string;
  propertyId: string;
  propertyName: string;
  scheduledDate: Date;
  scheduledTime: string;
  status: string;
  operatorName: string | null;
  guestName: string | null;
  daysOverdue: number;
}

export async function getGhostCleanings(daysBack: number = 30): Promise<GhostCleaning[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - daysBack);

  const snapshot = await adminDb.collection("cleanings").get();
  const activePropertyIds = await getActivePropertyIds();

  const ghosts: GhostCleaning[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data() as Record<string, any>;
    if (!activePropertyIds.has(data.propertyId)) continue;

    const scheduledDate = data.scheduledDate?.toDate?.();
    if (!scheduledDate) continue;
    if (scheduledDate >= today || scheduledDate < startDate) continue;

    if (["COMPLETED", "CANCELLED", "SKIPPED"].includes(data.status)) continue;

    const daysOverdue = Math.floor((today.getTime() - scheduledDate.getTime()) / (1000 * 60 * 60 * 24));

    ghosts.push({
      id: doc.id,
      propertyId: data.propertyId,
      propertyName: data.propertyName || "Sconosciuta",
      scheduledDate,
      scheduledTime: data.scheduledTime || "N/A",
      status: data.status,
      operatorName: data.operatorName || null,
      guestName: data.guestName || null,
      daysOverdue,
    });
  }

  ghosts.sort((a, b) => b.daysOverdue - a.daysOverdue);
  return ghosts;
}

export async function markCleaningAsCompleted(cleaningId: string): Promise<void> {
  await adminDb.collection("cleanings").doc(cleaningId).update({
    status: "COMPLETED",
    completedAt: Timestamp.now(),
    operatorNotes: "Completata automaticamente (pulizia fantasma)",
    updatedAt: Timestamp.now(),
  });
}

export async function markCleaningAsCancelled(cleaningId: string): Promise<void> {
  await adminDb.collection("cleanings").doc(cleaningId).update({
    status: "CANCELLED",
    cancelledAt: Timestamp.now(),
    cancelReason: "Cancellata automaticamente (pulizia fantasma)",
    updatedAt: Timestamp.now(),
  });
}
