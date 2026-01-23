import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { adminAuth } from "./admin";

export interface ApiUser {
  uid: string;
  email: string;
  name?: string;
  role?: string;
}

/**
 * Verifica l'autenticazione per le API routes
 * Legge il token da cookies o Authorization header
 */
export async function verifyAuth(request?: NextRequest): Promise<ApiUser | null> {
  try {
    // Prova a leggere dal cookie
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    
    if (userCookie) {
      try {
        const user = JSON.parse(userCookie.value);
        return {
          uid: user.id || user.uid,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      } catch {
        // Cookie non valido, continua
      }
    }
    
    // Prova con Authorization header se disponibile
    if (request) {
      const authHeader = request.headers.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        try {
          const decodedToken = await adminAuth.verifyIdToken(token);
          return {
            uid: decodedToken.uid,
            email: decodedToken.email || "",
            name: decodedToken.name,
          };
        } catch {
          // Token non valido
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error("Errore verifyAuth:", error);
    return null;
  }
}

/**
 * Alias per compatibilità
 */
export async function getApiUser(): Promise<ApiUser | null> {
  return verifyAuth();
}

/**
 * Verifica che l'utente abbia uno dei ruoli specificati
 */
export function hasRole(user: ApiUser | null, roles: string[]): boolean {
  if (!user || !user.role) return false;
  const userRole = user.role.toUpperCase();
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
