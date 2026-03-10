"use client";

/**
 * AuthContext — Autenticazione sicura con sessione server-side
 *
 * PRIMA: il cookie "firebase-user" era scritto da JavaScript,
 *        modificabile da chiunque con DevTools.
 *
 * DOPO:  la sessione viene creata/distrutta solo tramite il server
 *        (/api/auth/session). Il cookie "auth-token" è HttpOnly:
 *        JavaScript non può leggerlo né modificarlo.
 *        Il ruolo e l'ID sono firmati con JWT HMAC-SHA256.
 */

import { createContext, useContext, useEffect, useState} from "react";
import { signIn, signInWithGoogle, signOut, getUserFromStorage, saveUserToStorage, type AuthUser } from "./auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./config";
import type { ReactNode } from "react";

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
// GESTIONE SESSIONE SICURA (via server)
// ============================================
// Il cookie "auth-token" è HttpOnly: JavaScript non può leggerlo né scriverlo.
// Viene creato/distrutto solo tramite /api/auth/session.
// Questo impedisce che un utente possa modificare il proprio ruolo via DevTools.

async function createServerSession(user: AuthUser): Promise<void> {
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(user),
  });
  if (!res.ok) {
    throw new Error("Impossibile creare la sessione");
  }
  localStorage.setItem("last-auth-check", Date.now().toString());
}

async function destroyServerSession(): Promise<void> {
  try {
    await fetch("/api/auth/session", { method: "DELETE" });
  } catch {
    // Ignora errori di rete durante il logout
  }
  localStorage.removeItem("last-auth-check");
}

function clearLegacyCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = "firebase-user=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
}

// ============================================
// VERIFICA UTENTE NEL DATABASE
// ============================================
type VerifyResult =
  | { status: "ok"; user: AuthUser }
  | { status: "not_found" }   // utente non esiste o bloccato
  | { status: "error" };      // errore di rete/Firestore — non fare logout

async function verifyUserInDatabase(userId: string): Promise<VerifyResult> {
  try {
    const userDoc = await getDoc(doc(db, "users", userId));
    if (!userDoc.exists()) return { status: "not_found" };

    const userData = userDoc.data() as Record<string, any>;
    const userStatus = userData.status || "ACTIVE";

    if (userStatus === "BLOCKED" || userStatus === "DISABLED") return { status: "not_found" };

    return {
      status: "ok",
      user: {
        id: userDoc.id,
        email: userData.email,
        name: userData.name,
        role: userData.role,
        status: userData.status,
        contractAccepted: userData.contractAccepted ?? true,
        billingCompleted: userData.billingCompleted ?? true,
      },
    };
  } catch (error) {
    console.error("Errore verifica utente (rete/Firestore):", error);
    return { status: "error" }; // NON fare logout in caso di errore di rete
  }
}

// ============================================
// DETERMINA DESTINAZIONE POST-LOGIN
// ============================================
function getDestination(user: AuthUser): string {
  const role = user.role?.toUpperCase() || "";
  const status = user.status?.toUpperCase() || "ACTIVE";
  const isProprietario = ["PROPRIETARIO", "OWNER", "CLIENTE"].includes(role);

  if (isProprietario) {
    if (status === "PENDING_CONTRACT" || user.contractAccepted === false) return "/accept-contract";
    if (status === "PENDING_BILLING" || (user.contractAccepted && user.billingCompleted === false)) return "/complete-billing";
    if (status === "PENDING_APPROVAL") return "/pending-approval";
  }

  if (role === "ADMIN") return "/dashboard";
  if (isProprietario) return "/proprietario/calendario/pulizie";
  if (["OPERATORE_PULIZIE", "OPERATORE", "OPERATOR"].includes(role)) return "/operatore";
  if (role === "RIDER") return "/rider";
  return "/dashboard";
}

// ============================================
// AUTH PROVIDER
// ============================================
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    if (typeof window === "undefined") return null;
    return getUserFromStorage();
  });

  const [loading, setLoading] = useState(() => {
    if (typeof window === "undefined") return true;
    return !getUserFromStorage();
  });

  const [loginPending, setLoginPending] = useState(false);

  // ============================================
  // VERIFICA SESSIONE IN BACKGROUND
  // ============================================
  useEffect(() => {
    const verifySessionInBackground = async () => {
      const storedUser = getUserFromStorage();

      if (!storedUser) {
        setLoading(false);
        return;
      }

      // Il cookie JWT lato server è la fonte di verità per l'autenticazione.
      // Qui facciamo solo una verifica DB opzionale ogni 24h per aggiornare
      // i dati utente (es. cambio ruolo), ma NON facciamo mai logout
      // in caso di errore — il middleware server gestisce già la validità del token.
      const lastCheck = localStorage.getItem("last-auth-check");
      const now = Date.now();
      const ONE_DAY = 24 * 60 * 60 * 1000;

      if (!lastCheck || (now - parseInt(lastCheck)) > ONE_DAY) {
        const result = await verifyUserInDatabase(storedUser.id);

        if (result.status === "not_found") {
          // Utente esplicitamente eliminato o bloccato nel DB → logout
          localStorage.removeItem("user");
          localStorage.removeItem("last-auth-check");
          await destroyServerSession();
          setUser(null);
        } else if (result.status === "ok") {
          // Aggiorna dati utente e rinnova cookie JWT
          saveUserToStorage(result.user);
          await createServerSession(result.user);
          localStorage.setItem("last-auth-check", Date.now().toString());
          setUser(result.user);
        } else {
          // Errore di rete — NON fare logout, aggiorna solo il timestamp
          // per evitare di riprovare ad ogni reload
          localStorage.setItem("last-auth-check", Date.now().toString());
        }
      } else {
        // Cookie JWT ancora valido — non serve rinnovarlo ad ogni page load
        // Il middleware server lo valida ad ogni richiesta protetta
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

    if (
      destination.startsWith("/accept-") ||
      destination.startsWith("/complete-") ||
      destination.startsWith("/pending-")
    ) {
      setLoginPending(true);
      window.location.href = destination;
      return;
    }

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

      // 1. Salva in localStorage (per UI immediata)
      saveUserToStorage(authUser);

      // 2. Crea sessione sicura sul server (JWT HttpOnly cookie)
      await createServerSession(authUser);

      // 3. Rimuovi vecchio cookie insicuro
      clearLegacyCookie();

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
      await createServerSession(authUser);
      clearLegacyCookie();

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

      await destroyServerSession();

      localStorage.removeItem("user");
      clearLegacyCookie();
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
      isOperatore,
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
