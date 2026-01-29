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
const SESSION_DURATION_DAYS = 30;
const SESSION_DURATION_SECONDS = SESSION_DURATION_DAYS * 24 * 60 * 60;

// ✅ Stati validi per essere "loggati" (include onboarding)
const VALID_STATUSES = [
  "ACTIVE",
  "PENDING_CONTRACT",
  "PENDING_BILLING", 
  "PENDING_APPROVAL",
];

// ============================================
// GESTIONE COOKIE
// ============================================
function saveUserCookie(user: AuthUser | null) {
  if (typeof window === "undefined") return;
  
  if (user) {
    const expires = new Date();
    expires.setTime(expires.getTime() + SESSION_DURATION_SECONDS * 1000);
    document.cookie = `firebase-user=${encodeURIComponent(JSON.stringify(user))}; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;
    localStorage.setItem("last-auth-check", Date.now().toString());
  } else {
    document.cookie = "firebase-user=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    localStorage.removeItem("last-auth-check");
  }
}

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
      return null;
    }
    
    const userData = userDoc.data();
    const status = userData.status || "ACTIVE";
    
    // ✅ Blocca solo BLOCKED/DISABLED, permetti stati onboarding
    if (status === "BLOCKED" || status === "DISABLED") {
      return null;
    }
    
    return {
      id: userDoc.id,
      email: userData.email,
      name: userData.name,
      role: userData.role,
      status: userData.status,
      contractAccepted: userData.contractAccepted ?? true,
      billingCompleted: userData.billingCompleted ?? true,
    };
  } catch (error) {
    console.error("Errore verifica utente:", error);
    return null;
  }
}

// ============================================
// DETERMINA DESTINAZIONE POST-LOGIN
// ============================================
function getDestination(user: AuthUser): string {
  const role = user.role?.toUpperCase() || "";
  const status = user.status?.toUpperCase() || "ACTIVE";
  const isProprietario = ["PROPRIETARIO", "OWNER", "CLIENTE"].includes(role);
  
  // ✅ Se proprietario in onboarding, vai al passo corretto
  if (isProprietario) {
    if (status === "PENDING_CONTRACT" || user.contractAccepted === false) {
      return "/accept-contract";
    }
    if (status === "PENDING_BILLING" || (user.contractAccepted && user.billingCompleted === false)) {
      return "/complete-billing";
    }
    if (status === "PENDING_APPROVAL") {
      return "/pending-approval";
    }
  }
  
  // Utente attivo, vai alla dashboard del ruolo
  if (role === "ADMIN") {
    return "/dashboard";
  } else if (isProprietario) {
    return "/proprietario";
  } else if (["OPERATORE_PULIZIE", "OPERATORE", "OPERATOR"].includes(role)) {
    return "/operatore";
  } else if (role === "RIDER") {
    return "/rider";
  }
  
  return "/dashboard";
}

// ============================================
// AUTH PROVIDER
// ============================================
export function AuthProvider({ children }: { children: ReactNode }) {
  // 🔄 INIZIALIZZA UTENTE IMMEDIATAMENTE DA CACHE - Zero loading visibile!
  const [user, setUser] = useState<AuthUser | null>(() => {
    if (typeof window === "undefined") return null;
    // Prima prova localStorage, poi cookie
    const stored = getUserFromStorage();
    if (stored) return stored;
    return getUserFromCookie();
  });
  
  // Loading solo se NON abbiamo utente in cache
  const [loading, setLoading] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = getUserFromStorage() || getUserFromCookie();
    return !stored; // Loading solo se non c'è utente in cache
  });
  
  const [loginPending, setLoginPending] = useState(false);

  // ============================================
  // VERIFICA SESSIONE IN BACKGROUND (non blocca il rendering)
  // ============================================
  useEffect(() => {
    const verifySessionInBackground = async () => {
      const storedUser = getUserFromStorage() || getUserFromCookie();
      
      if (!storedUser) {
        setLoading(false);
        return;
      }
      
      // Verifica nel database ogni 24 ore (in background, senza bloccare)
      const lastCheck = localStorage.getItem("last-auth-check");
      const now = Date.now();
      const ONE_DAY = 24 * 60 * 60 * 1000;
      
      if (!lastCheck || (now - parseInt(lastCheck)) > ONE_DAY) {
        // Verifica in background - l'utente è già visibile
        const verifiedUser = await verifyUserInDatabase(storedUser.id);
        
        if (!verifiedUser) {
          // Sessione non valida, fai logout
          localStorage.removeItem("user");
          localStorage.removeItem("last-auth-check");
          saveUserCookie(null);
          setUser(null);
        } else {
          // Aggiorna i dati utente se necessario
          saveUserToStorage(verifiedUser);
          saveUserCookie(verifiedUser);
          setUser(verifiedUser);
        }
      }
      
      setLoading(false);
    };
    
    verifySessionInBackground();
  }, []);

  // ============================================
  // REDIRECT POST-LOGIN
  // ============================================
  const redirectAfterLogin = (authUser: AuthUser) => {
    const destination = getDestination(authUser);
    
    // Se va a onboarding, redirect diretto (senza welcome)
    if (destination.startsWith("/accept-") || 
        destination.startsWith("/complete-") || 
        destination.startsWith("/pending-")) {
      setLoginPending(true);
      window.location.href = destination;
      return;
    }
    
    // Altrimenti passa dal welcome
    setLoginPending(true);
    window.location.href = `/welcome?to=${encodeURIComponent(destination)}`;
  };

  // ============================================
  // LOGIN
  // ============================================
  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const authUser = await signIn(email, password);
      
      saveUserToStorage(authUser);
      saveUserCookie(authUser);
      
      setUser(authUser);
      redirectAfterLogin(authUser);
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  const loginWithGoogle = async () => {
    setLoading(true);
    try {
      const authUser = await signInWithGoogle();
      
      saveUserToStorage(authUser);
      saveUserCookie(authUser);
      
      setUser(authUser);
      redirectAfterLogin(authUser);
    } catch (error) {
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
