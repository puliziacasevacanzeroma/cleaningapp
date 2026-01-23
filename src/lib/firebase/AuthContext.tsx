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

// ============================================
// DEBUG OVERLAY
// ============================================
function DebugSessionOverlay({ logs }: { logs: string[] }) {
  const [show, setShow] = useState(true);
  
  if (!show) {
    return (
      <button 
        onClick={() => setShow(true)}
        className="fixed top-2 right-2 z-[99999] bg-orange-500 text-white text-xs px-2 py-1 rounded-full shadow-lg"
      >
        🔐
      </button>
    );
  }
  
  return (
    <div className="fixed top-2 left-2 right-2 z-[99999] bg-black/95 text-orange-400 text-[10px] font-mono p-2 rounded-lg max-h-48 overflow-y-auto shadow-xl border border-orange-500">
      <div className="flex justify-between items-center mb-1">
        <span className="text-yellow-400 font-bold">🔐 DEBUG SESSION</span>
        <button onClick={() => setShow(false)} className="text-red-400 text-xs px-2">✕</button>
      </div>
      {logs.map((log, i) => (
        <div key={i} className="border-b border-orange-900/50 py-0.5">
          {log}
        </div>
      ))}
    </div>
  );
}

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
    
    if (userData.status !== "ACTIVE") {
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
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setDebugLogs(prev => [...prev.slice(-20), `[${time}] ${msg}`]);
    console.log(`🔐 AUTH: ${msg}`);
  };

  // ============================================
  // RECUPERA SESSIONE AL CARICAMENTO
  // ============================================
  useEffect(() => {
    const restoreSession = async () => {
      addLog("🚀 Inizio restore sessione...");
      
      // Debug: mostra cosa c'è in localStorage
      const rawStorage = localStorage.getItem("user");
      addLog(`📦 localStorage["user"]: ${rawStorage ? rawStorage.substring(0, 50) + '...' : 'NULL'}`);
      
      // Debug: mostra cookie
      const cookieUser = getUserFromCookie();
      addLog(`🍪 Cookie user: ${cookieUser ? cookieUser.email : 'NULL'}`);
      
      // Prima prova localStorage
      let storedUser = getUserFromStorage();
      addLog(`📦 getUserFromStorage(): ${storedUser ? storedUser.email : 'NULL'}`);
      
      // Se non c'è in localStorage, prova cookie
      if (!storedUser) {
        storedUser = cookieUser;
        addLog(`🔄 Fallback a cookie: ${storedUser ? storedUser.email : 'NULL'}`);
      }
      
      if (!storedUser) {
        addLog("❌ Nessuna sessione trovata - redirect a login");
        setLoading(false);
        return;
      }
      
      addLog(`✅ Sessione trovata: ${storedUser.email} (${storedUser.role})`);
      
      // Verifica nel database
      const lastCheck = localStorage.getItem("last-auth-check");
      const now = Date.now();
      const ONE_DAY = 24 * 60 * 60 * 1000;
      
      addLog(`⏰ Last check: ${lastCheck ? new Date(parseInt(lastCheck)).toLocaleString() : 'MAI'}`);
      
      if (!lastCheck || (now - parseInt(lastCheck)) > ONE_DAY) {
        addLog("🔍 Verifica utente nel database...");
        
        const verifiedUser = await verifyUserInDatabase(storedUser.id);
        
        if (!verifiedUser) {
          addLog("❌ Utente non valido nel DB - pulisco sessione");
          localStorage.removeItem("user");
          localStorage.removeItem("last-auth-check");
          saveUserCookie(null);
          setUser(null);
          setLoading(false);
          return;
        }
        
        addLog(`✅ Utente verificato: ${verifiedUser.name}`);
        saveUserToStorage(verifiedUser);
        saveUserCookie(verifiedUser);
        setUser(verifiedUser);
      } else {
        addLog("✅ Uso sessione dalla cache (già verificata di recente)");
        setUser(storedUser);
        saveUserCookie(storedUser); // Rinnova cookie
      }
      
      setLoading(false);
      addLog("🏁 Restore sessione completato!");
    };
    
    restoreSession();
  }, []);

  // ============================================
  // REDIRECT A WELCOME
  // ============================================
  const redirectToWelcome = (role: string) => {
    const upperRole = role.toUpperCase();
    
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
    
    addLog(`➡️ Redirect a /welcome?to=${destination}`);
    setLoginPending(true);
    window.location.href = `/welcome?to=${encodeURIComponent(destination)}`;
  };

  // ============================================
  // LOGIN
  // ============================================
  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      addLog(`🔐 Login per: ${email}`);
      const authUser = await signIn(email, password);
      addLog(`✅ Login OK: ${authUser.name}`);
      
      saveUserToStorage(authUser);
      saveUserCookie(authUser);
      
      setUser(authUser);
      redirectToWelcome(authUser.role);
    } catch (error) {
      addLog(`❌ Login fallito: ${error}`);
      setLoading(false);
      throw error;
    }
  };

  const loginWithGoogle = async () => {
    setLoading(true);
    try {
      addLog("🔐 Login Google...");
      const authUser = await signInWithGoogle();
      addLog(`✅ Login Google OK: ${authUser.name}`);
      
      saveUserToStorage(authUser);
      saveUserCookie(authUser);
      
      setUser(authUser);
      redirectToWelcome(authUser.role);
    } catch (error) {
      addLog(`❌ Login Google fallito: ${error}`);
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
      addLog("🚪 Logout...");
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
      <DebugSessionOverlay logs={debugLogs} />
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
