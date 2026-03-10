/**
 * ============================================================
 * RATE LIMITER — Protezione API con Upstash Redis
 * ============================================================
 *
 * Limita il numero di richieste per IP per prevenire:
 * - Brute force su login/register
 * - Abuso delle API di pagamento
 * - Flood generico su tutte le API
 *
 * Compatibile con Edge Runtime (middleware Next.js).
 * Fallback permissivo: se Redis è down, le richieste passano.
 *
 * LIMITI CONFIGURATI:
 * - /api/auth/register    → 5 req/min  (creazione account)
 * - /api/auth/session     → 10 req/min (login)
 * - /api/auth/login       → 10 req/min (login)
 * - /api/payments         → 20 req/min (operazioni finanziarie)
 * - /api/cleanings        → 30 req/min (gestione pulizie)
 * - tutte le altre API    → 60 req/min (limite globale)
 * ============================================================
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { NextRequest } from "next/server";

// ─── Configurazione Redis ────────────────────────────────────

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;

  try {
    redis = new Redis({ url, token });
    return redis;
  } catch {
    return null;
  }
}

// ─── Rate Limiters (creati lazily) ────────────────────────────

const limiters = new Map<string, Ratelimit>();

function getLimiter(name: string, maxRequests: number, windowSeconds: number): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;

  const key = `${name}:${maxRequests}:${windowSeconds}`;
  if (limiters.has(key)) return limiters.get(key)!;

  const limiter = new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(maxRequests, `${windowSeconds} s`),
    prefix: `rl:${name}`,
    analytics: false,
  });

  limiters.set(key, limiter);
  return limiter;
}

// ─── Configurazione limiti per percorso ──────────────────────

interface RateLimitRule {
  /** Pattern per matchare il pathname */
  pattern: RegExp;
  /** Numero massimo di richieste nella finestra */
  maxRequests: number;
  /** Durata finestra in secondi */
  windowSeconds: number;
  /** Nome per il prefisso Redis */
  name: string;
}

const RATE_LIMIT_RULES: RateLimitRule[] = [
  // Auth — limiti stretti (attacchi brute force)
  { pattern: /^\/api\/auth\/register$/,       maxRequests: 5,  windowSeconds: 60,   name: "auth-register" },
  { pattern: /^\/api\/auth\/session$/,        maxRequests: 30, windowSeconds: 60,   name: "auth-session" },
  { pattern: /^\/api\/auth\/login$/,          maxRequests: 15, windowSeconds: 60,   name: "auth-login" },
  // Password reset — limiti molto stretti (anti-spam email + brute force token)
  { pattern: /^\/api\/auth\/forgot-password$/, maxRequests: 3,  windowSeconds: 300, name: "auth-forgot-password" },
  { pattern: /^\/api\/auth\/reset-password$/,  maxRequests: 5,  windowSeconds: 300, name: "auth-reset-password" },

  // Pagamenti — dati finanziari, limite moderato
  { pattern: /^\/api\/payments/,         maxRequests: 20, windowSeconds: 60,  name: "payments" },

  // Pulizie — operazioni frequenti ma limitate
  { pattern: /^\/api\/cleanings/,        maxRequests: 30, windowSeconds: 60,  name: "cleanings" },

  // Ordini
  { pattern: /^\/api\/orders/,           maxRequests: 30, windowSeconds: 60,  name: "orders" },
];

// Limite globale per qualsiasi altra API
const GLOBAL_LIMIT = { maxRequests: 60, windowSeconds: 60, name: "global" };

// ─── Funzione principale ─────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

/**
 * Estrae l'IP reale dalla request.
 * Controlla x-forwarded-for (Railway, Cloudflare, proxy),
 * poi x-real-ip, infine fallback a "unknown".
 */
function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // Prendi il primo IP (il client originale)
    return forwarded.split(",")[0]!.trim();
  }

  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    "unknown"
  );
}

/**
 * Controlla il rate limit per una richiesta API.
 *
 * Ritorna:
 * - { allowed: true }  → la richiesta può procedere
 * - { allowed: false }  → la richiesta va bloccata (429)
 *
 * Se Redis non è configurato o è down, ritorna SEMPRE allowed: true.
 * Non vogliamo che un problema Redis blocchi l'intera app.
 */
export async function checkRateLimit(request: NextRequest): Promise<RateLimitResult> {
  const permissiveResult: RateLimitResult = {
    allowed: true,
    limit: 0,
    remaining: 0,
    reset: 0,
  };

  try {
    const pathname = request.nextUrl.pathname;
    const ip = getClientIp(request);

    // Trova la regola specifica, altrimenti usa il globale
    const rule = RATE_LIMIT_RULES.find((r) => r.pattern.test(pathname));
    const { maxRequests, windowSeconds, name } = rule ?? GLOBAL_LIMIT;

    const limiter = getLimiter(name, maxRequests, windowSeconds);
    if (!limiter) return permissiveResult; // Redis non configurato

    // Chiave: combina nome limiter + IP
    const identifier = `${ip}`;
    const result = await limiter.limit(identifier);

    return {
      allowed: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    };
  } catch (error) {
    // Se Redis va in errore, non blocchiamo le richieste
    console.warn("[RateLimit] Errore Redis, richiesta permessa:", error);
    return permissiveResult;
  }
}
