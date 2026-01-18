import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export interface ApiUser {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
}

/**
 * Ottiene l'utente dal cookie Firebase
 */
export async function getApiUser(): Promise<ApiUser | null> {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) {
      return JSON.parse(decodeURIComponent(userCookie.value));
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Verifica autenticazione e ritorna errore se non autorizzato
 */
export async function requireAuth(): Promise<{ user: ApiUser } | { error: NextResponse }> {
  const user = await getApiUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Non autorizzato" }, { status: 401 }) };
  }
  return { user };
}

/**
 * Verifica che l'utente sia admin
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
 * Verifica che l'utente sia proprietario o admin
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
 * Verifica che l'utente sia operatore o admin
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