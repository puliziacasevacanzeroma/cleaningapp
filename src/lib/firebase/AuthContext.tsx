"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { signIn, signInWithGoogle, signOut, getUserFromStorage, saveUserToStorage, type AuthUser } from "./auth";

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isProprietario: boolean;
  isOperatore: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Salva utente anche come cookie per le API
function saveUserCookie(user: AuthUser | null) {
  if (typeof window === "undefined") return;
  
  if (user) {
    document.cookie = `firebase-user=${encodeURIComponent(JSON.stringify(user))}; path=/; max-age=86400; SameSite=Lax`;
  } else {
    document.cookie = "firebase-user=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = getUserFromStorage();
    console.log("📦 Utente da storage:", storedUser);
    setUser(storedUser);
    saveUserCookie(storedUser);
    setLoading(false);
  }, []);

  // 🚀 REDIRECT A /welcome CON DESTINAZIONE
  const redirectByRole = (role: string) => {
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
    
    console.log("➡️ Redirect a welcome con destinazione:", destination);
    
    // 🎉 REDIRECT A /welcome CHE MOSTRA SPLASH E PRECARICA DATI
    setTimeout(() => {
      window.location.href = `/welcome?to=${encodeURIComponent(destination)}`;
    }, 100);
  };

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      console.log("🔐 Tentativo login per:", email);
      const authUser = await signIn(email, password);
      console.log("✅ Login riuscito:", authUser);
      saveUserToStorage(authUser);
      saveUserCookie(authUser);
      setUser(authUser);
      redirectByRole(authUser.role);
    } catch (error) {
      console.error("❌ Errore login:", error);
      setLoading(false);
      throw error;
    }
  };

  const loginWithGoogle = async () => {
    setLoading(true);
    try {
      console.log("🔐 Tentativo login Google...");
      const authUser = await signInWithGoogle();
      console.log("✅ Login Google riuscito:", authUser);
      saveUserToStorage(authUser);
      saveUserCookie(authUser);
      setUser(authUser);
      redirectByRole(authUser.role);
    } catch (error) {
      console.error("❌ Errore login Google:", error);
      setLoading(false);
      throw error;
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await signOut();
      setUser(null);
      saveUserCookie(null);
      // Pulisci anche il session storage dello splash
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
