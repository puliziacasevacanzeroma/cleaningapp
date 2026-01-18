import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { auth } from "./config";
import { getUserByEmail, createUser } from "./firestore";
import type { FirebaseUser } from "./types";
import { Timestamp } from "firebase/firestore";
import bcrypt from "bcryptjs";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
}

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
  
  if (user.status !== "ACTIVE") {
    throw new Error("Account non attivo");
  }
  
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
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
    // Se non esiste, crea un nuovo utente come PROPRIETARIO
    const newUserId = await createUser({
      email: firebaseUser.email,
      name: firebaseUser.displayName || "",
      surname: "",
      phone: firebaseUser.phoneNumber || "",
      role: "PROPRIETARIO",
      status: "ACTIVE",
      avatar: firebaseUser.photoURL || "",
      password: "",
    });
    
    user = {
      id: newUserId,
      email: firebaseUser.email,
      name: firebaseUser.displayName || "",
      role: "PROPRIETARIO",
      status: "ACTIVE",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    } as FirebaseUser;
  }
  
  if (user.status !== "ACTIVE") {
    throw new Error("Account non attivo");
  }
  
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
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
  }
}

// Salva utente in localStorage
export function saveUserToStorage(user: AuthUser): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("user", JSON.stringify(user));
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