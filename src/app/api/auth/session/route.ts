/**
 * ============================================================
 * POST /api/auth/session — Crea sessione sicura dopo il login
 * ============================================================
 *
 * Questo endpoint viene chiamato dal client DOPO che il login
 * con bcrypt è andato a buon fine.
 *
 * Riceve i dati utente verificati, crea un JWT firmato e lo
 * imposta come cookie HttpOnly (inaccessibile da JavaScript).
 *
 * DELETE /api/auth/session — Distrugge la sessione (logout)
 * ============================================================
 */

import { NextRequest, NextResponse } from "next/server";
import { createToken, SESSION_DURATION_SECONDS } from "~/lib/jwt";
import { validateBody, SessionCreateSchema } from "~/lib/validation/schemas";

// ─── Tipi ────────────────────────────────────────────────────

interface SessionCreateBody {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  contractAccepted?: boolean;
  billingCompleted?: boolean;
}

// ─── Configurazione cookie ────────────────────────────────────

const COOKIE_NAME = "auth-token";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Costruisce la stringa cookie con tutti i flag di sicurezza.
 *
 * HttpOnly  → il cookie non è leggibile da JavaScript (protegge da XSS)
 * Secure    → trasmesso solo su HTTPS (in produzione)
 * SameSite=Lax → non inviato in richieste cross-site (protegge da CSRF)
 * Path=/    → valido per tutto il sito
 */
function buildSecureCookie(value: string, maxAge: number): string {
  const flags = [
    `${COOKIE_NAME}=${value}`,
    `Max-Age=${maxAge}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (IS_PRODUCTION) {
    flags.push("Secure");
  }

  return flags.join("; ");
}

// ─── POST: Crea sessione ──────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await validateBody(request, SessionCreateSchema);
    if (body instanceof Response) return body;

    // Validazione campi obbligatori
    if (!body.id || !body.email || !body.role) {
      return NextResponse.json(
        { error: "Dati utente mancanti" },
        { status: 400 }
      );
    }

    // Sanifica il ruolo (uppercase per consistenza)
    const sanitizedUser = {
      id: String(body.id),
      email: String(body.email),
      name: String(body.name ?? ""),
      role: String(body.role).toUpperCase(),
      status: String(body.status ?? "ACTIVE").toUpperCase(),
      contractAccepted: Boolean(body.contractAccepted ?? true),
      billingCompleted: Boolean(body.billingCompleted ?? true),
    };

    // Crea JWT firmato
    const token = createToken(sanitizedUser);

    // Imposta cookie sicuro
    const response = NextResponse.json({ ok: true });
    response.headers.set(
      "Set-Cookie",
      buildSecureCookie(token, SESSION_DURATION_SECONDS)
    );

    return response;
  } catch (error) {
    console.error("Errore creazione sessione:", error);
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    );
  }
}

// ─── DELETE: Distruggi sessione (logout) ──────────────────────

export async function DELETE() {
  const response = NextResponse.json({ ok: true });

  // Sovrascrive il cookie con valore vuoto e Max-Age=0 (scadenza immediata)
  response.headers.set(
    "Set-Cookie",
    buildSecureCookie("", 0)
  );

  return response;
}
