"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { signIn, signInWithGoogle, signOut, getUserFromStorage, saveUserToStorage, type AuthUser } from "./auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./config";

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  loginPending: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isProprietario: boolean;
  isOperatore: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

// ============================================
// COSTANTI SESSIONE
// ============================================
const SESSION_DURATION_DAYS = 30; // Durata sessione in giorni
const SESSION_DURATION_SECONDS = SESSION_DURATION_DAYS * 24 * 60 * 60; // 30 giorni in secondi

// ============================================
// GESTIONE COOKIE MIGLIORATA
// ============================================
function saveUserCookie(user: AuthUser | null) {
  if (typeof window === "undefined") return;
  
  if (user) {
    // Cookie con durata 30 giorni
    const expires = new Date();
    expires.setTime(expires.getTime() + SESSION_DURATION_SECONDS * 1000);
    document.cookie = `firebase-user=${encodeURIComponent(JSON.stringify(user))}; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;
    
    // Salva anche timestamp ultimo accesso
    localStorage.setItem("last-auth-check", Date.now().toString());
  } else {
    document.cookie = "firebase-user=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    localStorage.removeItem("last-auth-check");
  }
}

// Leggi utente da cookie
function getUserFromCookie(): AuthUser | null {
  if (typeof window === "undefined") return null;
  
  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split("=");
    if (name === "firebase-user" && value) {
      try {
        return JSON.parse(decodeURIComponent(value));
      } catch {
        return null;
      }
    }
  }
  return null;
}

// ============================================
// VERIFICA UTENTE NEL DATABASE
// ============================================
async function verifyUserInDatabase(userId: string): Promise<AuthUser | null> {
  try {
    const userDoc = await getDoc(doc(db, "users", userId));
    
    if (!userDoc.exists()) {
      console.log("❌ Utente non trovato nel database");
      return null;
    }
    
    const userData = userDoc.data();
    
    // Verifica che l'utente sia ancora attivo
    if (userData.status !== "ACTIVE") {
      console.log("❌ Utente non più attivo");
      return null;
    }
    
    return {
      id: userDoc.id,
      email: userData.email,
      name: userData.name,
      role: userData.role,
      status: userData.status,
    };
  } catch (error) {
    console.error("Errore verifica utente:", error);
    return null;
  }
}

// ============================================
// AUTH PROVIDER
// ============================================
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginPending, setLoginPending] = useState(false);

  // ============================================
  // RECUPERA SESSIONE AL CARICAMENTO
  // ============================================
  useEffect(() => {
    const restoreSession = async () => {
      console.log("🔄 Tentativo ripristino sessione...");
      
      // Prima prova localStorage, poi cookie
      let storedUser = getUserFromStorage();
      
      if (!storedUser) {
        storedUser = getUserFromCookie();
      }
      
      if (!storedUser) {
        console.log("📦 Nessuna sessione salvata");
        setLoading(false);
        return;
      }
      
      console.log("📦 Sessione trovata per:", storedUser.email);
      
      // Verifica se dobbiamo ri-validare l'utente nel database
      // Lo facciamo ogni 24 ore per non rallentare troppo
      const lastCheck = localStorage.getItem("last-auth-check");
      const now = Date.now();
      const ONE_DAY = 24 * 60 * 60 * 1000;
      
      if (!lastCheck || (now - parseInt(lastCheck)) > ONE_DAY) {
        console.log("🔍 Verifica utente nel database...");
        
        const verifiedUser = await verifyUserInDatabase(storedUser.id);
        
        if (!verifiedUser) {
          console.log("❌ Sessione non valida, logout");
          // Pulisci tutto
          localStorage.removeItem("user");
          localStorage.removeItem("last-auth-check");
          saveUserCookie(null);
          setUser(null);
          setLoading(false);
          return;
        }
        
        // Aggiorna i dati utente (potrebbero essere cambiati)
        console.log("✅ Utente verificato:", verifiedUser.name);
        saveUserToStorage(verifiedUser);
        saveUserCookie(verifiedUser);
        setUser(verifiedUser);
        localStorage.setItem("last-auth-check", now.toString());
      } else {
        // Usa i dati dalla cache senza verificare
        console.log("✅ Sessione valida (cache):", storedUser.name);
        setUser(storedUser);
        saveUserCookie(storedUser); // Rinnova cookie
      }
      
      setLoading(false);
    };
    
    restoreSession();
  }, []);

  // ============================================
  // REDIRECT A WELCOME
  // ============================================
  const redirectToWelcome = (role: string) => {
    const upperRole = role.toUpperCase();
    console.log("🚀 Redirect per ruolo:", upperRole);
    
    let destination = "/dashboard";
    
    if (upperRole === "ADMIN") {
      destination = "/dashboard";
    } else if (upperRole === "PROPRIETARIO" || upperRole === "OWNER" || upperRole === "CLIENTE") {
      destination = "/proprietario";
    } else if (upperRole === "OPERATORE_PULIZIE" || upperRole === "OPERATORE" || upperRole === "OPERATOR") {
      destination = "/operatore";
    } else if (upperRole === "RIDER") {
      destination = "/rider";
    }
    
    console.log("➡️ Redirect a /welcome con destinazione:", destination);
    setLoginPending(true);
    window.location.href = `/welcome?to=${encodeURIComponent(destination)}`;
  };

  // ============================================
  // LOGIN EMAIL/PASSWORD
  // ============================================
  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      console.log("🔐 Tentativo login per:", email);
      const authUser = await signIn(email, password);
      console.log("✅ Login riuscito:", authUser);
      
      // Salva sessione
      saveUserToStorage(authUser);
      saveUserCookie(authUser);
      localStorage.setItem("last-auth-check", Date.now().toString());
      
      setUser(authUser);
      redirectToWelcome(authUser.role);
    } catch (error) {
      console.error("❌ Errore login:", error);
      setLoading(false);
      throw error;
    }
  };

  // ============================================
  // LOGIN GOOGLE
  // ============================================
  const loginWithGoogle = async () => {
    setLoading(true);
    try {
      console.log("🔐 Tentativo login Google...");
      const authUser = await signInWithGoogle();
      console.log("✅ Login Google riuscito:", authUser);
      
      // Salva sessione
      saveUserToStorage(authUser);
      saveUserCookie(authUser);
      localStorage.setItem("last-auth-check", Date.now().toString());
      
      setUser(authUser);
      redirectToWelcome(authUser.role);
    } catch (error) {
      console.error("❌ Errore login Google:", error);
      setLoading(false);
      throw error;
    }
  };

  // ============================================
  // LOGOUT
  // ============================================
  const logout = async () => {
    setLoading(true);
    try {
      await signOut();
      setUser(null);
      saveUserCookie(null);
      localStorage.removeItem("last-auth-check");
      sessionStorage.removeItem("splash-shown");
      window.location.href = "/login";
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // HELPER RUOLI
  // ============================================
  const isAdmin = user?.role?.toUpperCase() === "ADMIN";
  const isProprietario = ["PROPRIETARIO", "OWNER", "CLIENTE"].includes(user?.role?.toUpperCase() || "");
  const isOperatore = ["OPERATORE_PULIZIE", "OPERATORE", "OPERATOR"].includes(user?.role?.toUpperCase() || "");

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      loginPending,
      login, 
      loginWithGoogle, 
      logout, 
      isAdmin, 
      isProprietario, 
      isOperatore 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve essere usato dentro AuthProvider");
  }
  return context;
}
