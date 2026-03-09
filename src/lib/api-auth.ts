/**
 * ============================================================
 * API AUTH — Autenticazione sicura con JWT firmato
 * ============================================================
 *
 * PRIMA: leggeva un cookie JSON modificabile da chiunque con DevTools.
 * DOPO:  verifica la firma HMAC-SHA256 del JWT. Se qualcuno modifica
 *        anche un solo carattere (es. role → ADMIN), la firma non
 *        corrisponde e la richiesta viene rifiutata.
 *
 * Compatibilità: l'interfaccia pubblica (getApiUser, requireAuth, ecc.)
 * è identica — nessuna API route deve essere modificata.
 * ============================================================
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyToken } from "~/lib/jwt";

export interface ApiUser {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  contractAccepted?: boolean;
  billingCompleted?: boolean;
}

// Nome del cookie sicuro (HttpOnly, Secure, SameSite=Strict)
const COOKIE_NAME = "auth-token";

/**
 * Legge e verifica il JWT dal cookie sicuro.
 * Ritorna null se il token manca, è scaduto o la firma è invalida.
 */
export async function getApiUser(): Promise<ApiUser | null> {
  try {
    const cookieStore = await cookies();
    const tokenCookie = cookieStore.get(COOKIE_NAME);

    if (!tokenCookie?.value) return null;

    const payload = verifyToken(tokenCookie.value);
    if (!payload) return null;

    return {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      status: payload.status,
      contractAccepted: payload.contractAccepted,
      billingCompleted: payload.billingCompleted,
    };
  } catch {
    return null;
  }
}

/**
 * Verifica autenticazione — ritorna errore 401 se non autenticato.
 */
export async function requireAuth(): Promise<{ user: ApiUser } | { error: NextResponse }> {
  const user = await getApiUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Non autorizzato" }, { status: 401 }) };
  }
  return { user };
}

/**
 * Solo admin — ritorna 403 se il ruolo non è ADMIN.
 */
export async function requireAdmin(): Promise<{ user: ApiUser } | { error: NextResponse }> {
  const user = await getApiUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Non autorizzato" }, { status: 401 }) };
  }
  if (user.role?.toUpperCase() !== "ADMIN") {
    return { error: NextResponse.json({ error: "Accesso negato" }, { status: 403 }) };
  }
  return { user };
}

/**
 * Proprietario o admin.
 */
export async function requireProprietario(): Promise<{ user: ApiUser } | { error: NextResponse }> {
  const user = await getApiUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Non autorizzato" }, { status: 401 }) };
  }
  const role = user.role?.toUpperCase();
  const allowedRoles = ["ADMIN", "PROPRIETARIO", "OWNER", "CLIENTE"];
  if (!allowedRoles.includes(role)) {
    return { error: NextResponse.json({ error: "Accesso negato" }, { status: 403 }) };
  }
  return { user };
}

/**
 * Operatore o admin.
 */
export async function requireOperatore(): Promise<{ user: ApiUser } | { error: NextResponse }> {
  const user = await getApiUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Non autorizzato" }, { status: 401 }) };
  }
  const role = user.role?.toUpperCase();
  const allowedRoles = ["ADMIN", "OPERATORE_PULIZIE", "OPERATORE", "OPERATOR"];
  if (!allowedRoles.includes(role)) {
    return { error: NextResponse.json({ error: "Accesso negato" }, { status: 403 }) };
  }
  return { user };
}