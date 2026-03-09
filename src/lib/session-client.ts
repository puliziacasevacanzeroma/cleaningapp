/**
 * Utilities client-side per la gestione della sessione sicura.
 *
 * Queste funzioni sono usate nelle pagine di onboarding (accept-contract,
 * complete-billing, pending-approval) per aggiornare i dati di sessione
 * quando lo stato dell'utente cambia (es. contratto firmato → billing).
 *
 * La sessione viene aggiornata chiamando il server, che rigenera
 * il JWT firmato con i nuovi dati e aggiorna il cookie HttpOnly.
 */

import type { AuthUser } from "~/lib/firebase/auth";

/** Aggiorna localStorage e rinnova la sessione server con nuovi dati */
export async function updateUserSession(updates: Partial<AuthUser>): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    const stored = localStorage.getItem("user");
    if (!stored) return;

    const userData: AuthUser = JSON.parse(stored);
    const updatedUser: AuthUser = { ...userData, ...updates };

    // 1. Aggiorna localStorage (per UI immediata)
    localStorage.setItem("user", JSON.stringify(updatedUser));

    // 2. Rinnova sessione server (JWT HttpOnly cookie)
    await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedUser),
    });
  } catch (e) {
    console.error("Errore aggiornamento sessione:", e);
  }
}

/** Legge l'utente corrente da localStorage */
export function getCurrentUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem("user");
    return stored ? (JSON.parse(stored) as AuthUser) : null;
  } catch {
    return null;
  }
}

/** Distrugge completamente la sessione (usato in logout forzato) */
export async function destroySession(): Promise<void> {
  if (typeof window === "undefined") return;
  localStorage.removeItem("user");
  localStorage.removeItem("last-auth-check");
  // Cancella cookie legacy
  document.cookie = "firebase-user=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  // Cancella sessione server
  await fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
}
