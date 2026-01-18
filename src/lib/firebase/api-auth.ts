import { cookies } from "next/headers";
import { getUserByEmail } from "./firestore";

export interface ApiUser {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
}

/**
 * Verifica l'autenticazione per le API routes
 * Legge il token/session da cookies o headers
 */
export async function getApiUser(): Promise<ApiUser | null> {
  try {
    // Per ora, leggiamo l'utente dal cookie di sessione
    // In produzione, useresti un JWT token
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    
    if (userCookie) {
      const user = JSON.parse(userCookie.value);
      return user;
    }
    
    return null;
  } catch (error) {
    console.error("Errore getApiUser:", error);
    return null;
  }
}

/**
 * Verifica che l'utente abbia uno dei ruoli specificati
 */
export function hasRole(user: ApiUser | null, roles: string[]): boolean {
  if (!user) return false;
  const userRole = user.role?.toUpperCase();
  return roles.map(r => r.toUpperCase()).includes(userRole);
}

/**
 * Verifica che l'utente sia admin
 */
export function isAdmin(user: ApiUser | null): boolean {
  return hasRole(user, ["ADMIN"]);
}

/**
 * Verifica che l'utente sia proprietario
 */
export function isProprietario(user: ApiUser | null): boolean {
  return hasRole(user, ["PROPRIETARIO", "OWNER", "CLIENTE"]);
}

/**
 * Verifica che l'utente sia operatore
 */
export function isOperatore(user: ApiUser | null): boolean {
  return hasRole(user, ["OPERATORE_PULIZIE", "OPERATORE", "OPERATOR"]);
}