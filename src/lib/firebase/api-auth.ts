/**
 * firebase/api-auth.ts — Alias che punta al sistema auth principale.
 *
 * PRIMA: questo file leggeva il cookie "firebase-user" (insicuro).
 * DOPO:  delega a ~/lib/api-auth che verifica il JWT firmato.
 *
 * Mantenuto per compatibilità con le poche route che lo importano.
 */

import { getApiUser as getSecureApiUser } from "~/lib/api-auth";
import { adminAuth } from "./admin";
import type { NextRequest } from "next/server";

export interface ApiUser {
  uid: string;
  email: string;
  name?: string;
  role?: string;
}

/**
 * Verifica l'autenticazione per le API routes.
 * Prima tenta il JWT sicuro, poi il Bearer token Firebase (per Google Auth).
 */
export async function verifyAuth(request?: NextRequest): Promise<ApiUser | null> {
  // Prova prima il JWT sicuro (HttpOnly cookie)
  const secureUser = await getSecureApiUser();
  if (secureUser) {
    return {
      uid: secureUser.id,
      email: secureUser.email,
      name: secureUser.name,
      role: secureUser.role,
    };
  }

  // Fallback: Authorization header con Firebase ID Token (solo per Google Auth)
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
}

export async function getApiUser(): Promise<ApiUser | null> {
  return verifyAuth();
}

export function hasRole(user: ApiUser | null, roles: string[]): boolean {
  if (!user?.role) return false;
  const userRole = user.role.toUpperCase();
  return roles.map(r => r.toUpperCase()).includes(userRole);
}

export function isAdmin(user: ApiUser | null): boolean {
  return hasRole(user, ["ADMIN"]);
}

export function isProprietario(user: ApiUser | null): boolean {
  return hasRole(user, ["PROPRIETARIO", "OWNER", "CLIENTE"]);
}

export function isOperatore(user: ApiUser | null): boolean {
  return hasRole(user, ["OPERATORE_PULIZIE", "OPERATORE", "OPERATOR"]);
}
