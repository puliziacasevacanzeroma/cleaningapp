import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "./config";

// Ottieni utente per email
export async function getUserByEmail(email: string) {
  try {
    const q = query(collection(db, "users"), where("email", "==", email));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return null;
    }
    
    const userDoc = snapshot.docs[0];
    return {
      id: userDoc.id,
      ...userDoc.data()
    };
  } catch (error) {
    console.error("Errore getUserByEmail:", error);
    return null;
  }
}

// Crea nuovo utente
export async function createUser(data: {
  email: string;
  name?: string;
  password?: string;
  role?: string;
  status?: string;
}) {
  try {
    const docRef = await addDoc(collection(db, "users"), {
      ...data,
      role: data.role || "PROPRIETARIO",
      status: data.status || "ACTIVE",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    
    return {
      id: docRef.id,
      ...data
    };
  } catch (error) {
    console.error("Errore createUser:", error);
    throw error;
  }
}

// Ottieni utente per ID
export async function getUserById(id: string) {
  try {
    const docSnap = await getDoc(doc(db, "users", id));
    
    if (!docSnap.exists()) {
      return null;
    }
    
    return {
      id: docSnap.id,
      ...docSnap.data()
    };
  } catch (error) {
    console.error("Errore getUserById:", error);
    return null;
  }
}

// Aggiorna utente
export async function updateUser(id: string, data: Record<string, any>) {
  try {
    await updateDoc(doc(db, "users", id), {
      ...data,
      updatedAt: Timestamp.now(),
    });
    return true;
  } catch (error) {
    console.error("Errore updateUser:", error);
    return false;
  }
}