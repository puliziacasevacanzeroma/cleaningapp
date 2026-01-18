import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "./config";
import type {
  FirebaseUser,
  FirebaseProperty,
  FirebaseBooking,
  FirebaseCleaning,
  FirebaseInventoryCategory,
  FirebaseInventoryItem,
  FirebaseNotification,
} from "./types";

// ============================================================
// COLLEZIONI
// ============================================================
export const collections = {
  users: "users",
  properties: "properties",
  bookings: "bookings",
  cleanings: "cleanings",
  inventoryCategories: "inventoryCategories",
  inventoryItems: "inventoryItems",
  notifications: "notifications",
};

// ============================================================
// UTENTI
// ============================================================
export async function getUser(userId: string): Promise<FirebaseUser | null> {
  const docRef = doc(db, collections.users, userId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() } as FirebaseUser;
}

export async function getUserByEmail(email: string): Promise<FirebaseUser | null> {
  const q = query(collection(db, collections.users), where("email", "==", email));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() } as FirebaseUser;
}

export async function getUsersByRole(role: string): Promise<FirebaseUser[]> {
  const q = query(
    collection(db, collections.users),
    where("role", "==", role),
    where("status", "==", "ACTIVE"),
    orderBy("name")
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FirebaseUser));
}

export async function createUser(data: Omit<FirebaseUser, "id" | "createdAt" | "updatedAt">): Promise<string> {
  const docRef = await addDoc(collection(db, collections.users), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateUser(userId: string, data: Partial<FirebaseUser>): Promise<void> {
  const docRef = doc(db, collections.users, userId);
  await updateDoc(docRef, { ...data, updatedAt: serverTimestamp() });
}

// ============================================================
// PROPRIETÀ
// ============================================================
export async function getProperties(status?: string): Promise<FirebaseProperty[]> {
  let q;
  if (status) {
    q = query(
      collection(db, collections.properties),
      where("status", "==", status),
      orderBy("name")
    );
  } else {
    q = query(collection(db, collections.properties), orderBy("name"));
  }
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FirebaseProperty));
}

export async function getPropertiesByOwner(ownerId: string): Promise<FirebaseProperty[]> {
  const q = query(
    collection(db, collections.properties),
    where("ownerId", "==", ownerId),
    orderBy("createdAt", "desc")
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FirebaseProperty));
}

export async function getProperty(propertyId: string): Promise<FirebaseProperty | null> {
  const docRef = doc(db, collections.properties, propertyId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() } as FirebaseProperty;
}

export async function createProperty(data: Omit<FirebaseProperty, "id" | "createdAt" | "updatedAt">): Promise<string> {
  const docRef = await addDoc(collection(db, collections.properties), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateProperty(propertyId: string, data: Partial<FirebaseProperty>): Promise<void> {
  const docRef = doc(db, collections.properties, propertyId);
  await updateDoc(docRef, { ...data, updatedAt: serverTimestamp() });
}

export async function deleteProperty(propertyId: string): Promise<void> {
  await deleteDoc(doc(db, collections.properties, propertyId));
}

// ============================================================
// PRENOTAZIONI
// ============================================================
export async function getBookings(propertyId?: string): Promise<FirebaseBooking[]> {
  let q;