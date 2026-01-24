import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { auth, db } from "./config";
import { getUserByEmail } from "./firestore";
import type { FirebaseUser } from "./types";
import { Timestamp, doc, setDoc, getDoc, addDoc, collection } from "firebase/firestore";
import bcrypt from "bcryptjs";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  contractAccepted?: boolean;
  billingCompleted?: boolean;
}

// ✅ Stati validi per il login (include onboarding)
const VALID_LOGIN_STATUSES = [
  "ACTIVE",
  "PENDING_CONTRACT",
  "PENDING_BILLING",
  "PENDING_APPROVAL",
];

// Login con email e password (verifica nel nostro database con bcrypt)
export async function signIn(email: string, password: string): Promise<AuthUser> {
  const user = await getUserByEmail(email);
  
  if (!user) {
    throw new Error("Utente non trovato");
  }
  
  // Confronta password con hash bcrypt
  const isValid = await bcrypt.compare(password, user.password || "");
  
  if (!isValid) {
    throw new Error("Password non corretta");
  }
  
  // ✅ Permetti login anche durante onboarding, blocca solo BLOCKED/DISABLED
  const status = user.status || "ACTIVE";
  if (status === "BLOCKED" || status === "DISABLED") {
    throw new Error("Account disabilitato");
  }
  
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    contractAccepted: user.contractAccepted ?? true, // Default true per utenti esistenti
    billingCompleted: user.billingCompleted ?? true, // Default true per utenti esistenti
  };
}

// Login con Google
export async function signInWithGoogle(): Promise<AuthUser> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    prompt: 'select_account'
  });
  
  const result = await signInWithPopup(auth, provider);
  const firebaseUser = result.user;
  
  if (!firebaseUser.email) {
    throw new Error("Email non disponibile");
  }
  
  // Cerca l'utente nel database
  let user = await getUserByEmail(firebaseUser.email);
  
  if (!user) {
    // ✅ NUOVO UTENTE VIA GOOGLE - Crea con flusso onboarding
    const userId = firebaseUser.uid;
    
    const userData = {
      id: userId,
      email: firebaseUser.email,
      name: firebaseUser.displayName || "",
      surname: "",
      phone: firebaseUser.phoneNumber || "",
      role: "PROPRIETARIO",
      status: "PENDING_CONTRACT", // ✅ Inizia con onboarding
      contractAccepted: false,    // ✅ Deve firmare contratto
      billingCompleted: false,    // ✅ Deve compilare fatturazione
      avatar: firebaseUser.photoURL || "",
      password: "", // No password per Google auth
      registrationMethod: "google",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    
    // Salva in Firestore
    await setDoc(doc(db, "users", userId), userData);
    
    console.log("✅ Nuovo utente Google creato:", userId);

    // Invia notifica all'admin
    try {
      await addDoc(collection(db, "notifications"), {
        title: "Nuova Registrazione Google",
        message: `${firebaseUser.displayName || firebaseUser.email} si è registrato con Google.`,
        type: "NEW_REGISTRATION",
        recipientRole: "ADMIN",
        senderId: userId,
        senderName: firebaseUser.displayName || firebaseUser.email,
        senderEmail: firebaseUser.email,
        relatedEntityId: userId,
        relatedEntityType: "USER",
        actionRequired: false,
        status: "UNREAD",
        link: `/dashboard/utenti`,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    } catch (e) {
      console.warn("Errore notifica:", e);
    }
    
    return {
      id: userId,
      email: firebaseUser.email,
      name: firebaseUser.displayName || "",
      role: "PROPRIETARIO",
      status: "PENDING_CONTRACT",
      contractAccepted: false,
      billingCompleted: false,
    };
  }
  
  // ✅ UTENTE ESISTENTE - Verifica stato
  const status = user.status || "ACTIVE";
  if (status === "BLOCKED" || status === "DISABLED") {
    throw new Error("Account disabilitato");
  }
  
  // Aggiorna avatar se cambiato
  if (firebaseUser.photoURL && firebaseUser.photoURL !== user.avatar) {
    try {
      await setDoc(doc(db, "users", user.id), {
        avatar: firebaseUser.photoURL,
        updatedAt: Timestamp.now(),
      }, { merge: true });
    } catch (e) {
      console.warn("Errore aggiornamento avatar:", e);
    }
  }
  
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    contractAccepted: user.contractAccepted ?? true,
    billingCompleted: user.billingCompleted ?? true,
  };
}

// Logout
export async function signOut(): Promise<void> {
  try {
    await firebaseSignOut(auth);
  } catch (error) {
    console.error("Errore logout:", error);
  }
  if (typeof window !== "undefined") {
    localStorage.removeItem("user");
    document.cookie = "firebase-user=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  }
}

// Salva utente in localStorage e cookie
export function saveUserToStorage(user: AuthUser): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("user", JSON.stringify(user));
    
    // Salva anche nel cookie per il middleware
    const expires = new Date();
    expires.setTime(expires.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 giorni
    document.cookie = `firebase-user=${encodeURIComponent(JSON.stringify(user))}; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;
  }
}

// Recupera utente da localStorage
export function getUserFromStorage(): AuthUser | null {
  if (typeof window === "undefined") return null;
  
  const stored = localStorage.getItem("user");
  if (!stored) return null;
  
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

// Verifica se utente è loggato
export function isAuthenticated(): boolean {
  return getUserFromStorage() !== null;
}

// Verifica ruolo
export function hasRole(role: string | string[]): boolean {
  const user = getUserFromStorage();
  if (!user) return false;
  
  const roles = Array.isArray(role) ? role : [role];
  return roles.includes(user.role);
}
