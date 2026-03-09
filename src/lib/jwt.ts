/**
 * ============================================================
 * JWT SICURO — Firma HMAC-SHA256 con crypto nativo Node.js
 * ============================================================
 *
 * Perché questo file esiste:
 * Il vecchio sistema salvava i dati utente (incluso il ruolo "ADMIN")
 * in un cookie JSON leggibile e modificabile da chiunque con DevTools.
 *
 * Questo modulo implementa JWT firmati: il payload è encodato in
 * base64 e la firma HMAC-SHA256 garantisce che nessuno possa
 * modificare il contenuto senza conoscere il segreto server.
 *
 * Formato JWT: header.payload.signature (standard RFC 7519)
 * Algoritmo: HS256 (HMAC + SHA-256)
 * Dipendenze: zero — usa solo il modulo `crypto` nativo di Node.js
 * ============================================================
 */

import { createHmac, timingSafeEqual } from "crypto";

// ─── Tipi ───────────────────────────────────────────────────

export interface JwtPayload {
  /** ID utente Firestore */
  id: string;
  /** Email utente */
  email: string;
  /** Nome display */
  name: string;
  /** Ruolo: ADMIN | PROPRIETARIO | OPERATORE_PULIZIE | RIDER */
  role: string;
  /** Stato account */
  status: string;
  /** Contratto accettato (per flusso onboarding proprietari) */
  contractAccepted?: boolean;
  /** Fatturazione completata (per flusso onboarding proprietari) */
  billingCompleted?: boolean;
  /** Emesso a (Unix timestamp secondi) */
  iat: number;
  /** Scade a (Unix timestamp secondi) */
  exp: number;
}

// ─── Costanti ───────────────────────────────────────────────

const ALGORITHM = "sha256";
const HEADER = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
/** Durata sessione: 30 giorni in secondi */
export const SESSION_DURATION_SECONDS = 30 * 24 * 60 * 60;

// ─── Helpers interni ────────────────────────────────────────

function getSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET non configurato o troppo corto (minimo 32 caratteri). " +
      "Aggiungilo al file .env"
    );
  }
  return secret;
}

function sign(input: string, secret: string): string {
  return createHmac(ALGORITHM, secret).update(input).digest("base64url");
}

function toBase64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function fromBase64url(str: string): unknown {
  return JSON.parse(Buffer.from(str, "base64url").toString("utf8"));
}

// ─── API pubblica ────────────────────────────────────────────

/**
 * Crea un JWT firmato con i dati utente.
 * Valido per SESSION_DURATION_SECONDS (30 giorni).
 */
export function createToken(user: Omit<JwtPayload, "iat" | "exp">): string {
  const secret = getSecret();
  const now = Math.floor(Date.now() / 1000);

  const payload: JwtPayload = {
    ...user,
    iat: now,
    exp: now + SESSION_DURATION_SECONDS,
  };

  const encodedPayload = toBase64url(payload);
  const signingInput = `${HEADER}.${encodedPayload}`;
  const signature = sign(signingInput, secret);

  return `${signingInput}.${signature}`;
}

/**
 * Verifica un JWT e restituisce il payload.
 * Ritorna null se il token è invalido, scaduto o manomesso.
 *
 * Usa `timingSafeEqual` per prevenire timing attacks.
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    const secret = getSecret();
    const parts = token.split(".");

    if (parts.length !== 3) return null;

    const [header, payload, signature] = parts as [string, string, string];
    const signingInput = `${header}.${payload}`;

    // Verifica firma con confronto a tempo costante (timing-safe)
    const expectedSig = sign(signingInput, secret);
    const expectedBuf = Buffer.from(expectedSig, "utf8");
    const actualBuf = Buffer.from(signature, "utf8");

    if (expectedBuf.length !== actualBuf.length) return null;
    if (!timingSafeEqual(expectedBuf, actualBuf)) return null;

    // Decodifica payload
    const decoded = fromBase64url(payload) as JwtPayload;

    // Verifica scadenza
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp < now) return null;

    // Verifica campi obbligatori
    if (!decoded.id || !decoded.role) return null;

    return decoded;
  } catch {
    return null;
  }
}
