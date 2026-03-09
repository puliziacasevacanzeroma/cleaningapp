/**
 * Validazione variabili d'ambiente con @t3-oss/env-nextjs
 *
 * Se una variabile obbligatoria manca, il build fallisce subito
 * con un messaggio chiaro invece di crashare in produzione.
 *
 * server: variabili usate solo lato server (mai incluse nel bundle client)
 * client: variabili NEXT_PUBLIC_* incluse nel bundle client
 */

import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    // ── Autenticazione JWT ────────────────────────────────────
    // Genera con: openssl rand -base64 32
    AUTH_SECRET: z.string().min(32, "AUTH_SECRET deve essere almeno 32 caratteri"),

    // ── Firebase Admin SDK (lato server, mai nel bundle client) ─
    FIREBASE_ADMIN_PROJECT_ID:   z.string().min(1),
    FIREBASE_ADMIN_CLIENT_EMAIL: z.string().email(),
    FIREBASE_ADMIN_PRIVATE_KEY:  z.string().min(1),

    // ── Storage bucket Firebase (usato nelle API upload) ───────
    FIREBASE_STORAGE_BUCKET: z.string().min(1),

    // ── Cron job secret ────────────────────────────────────────
    // Genera con: openssl rand -base64 24
    CRON_SECRET: z.string().min(16, "CRON_SECRET deve essere almeno 16 caratteri"),

    // ── Email (Resend) ─────────────────────────────────────────
    RESEND_API_KEY: z.string().startsWith("re_").optional(),

    // ── Upstash Redis (per cache, opzionale) ──────────────────
    UPSTASH_REDIS_REST_URL:   z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  },

  client: {
    // ── Firebase Client SDK ────────────────────────────────────
    NEXT_PUBLIC_FIREBASE_API_KEY:             z.string().min(1),
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:         z.string().min(1),
    NEXT_PUBLIC_FIREBASE_PROJECT_ID:          z.string().min(1),
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:      z.string().min(1),
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1),
    NEXT_PUBLIC_FIREBASE_APP_ID:              z.string().min(1),
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID:      z.string().optional(),

    // ── Push Notifications (VAPID key FCM) ───────────────────
    NEXT_PUBLIC_FIREBASE_VAPID_KEY: z.string().optional(),

    // ── URL pubblica dell'app ─────────────────────────────────
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  },

  runtimeEnv: {
    NODE_ENV:    process.env.NODE_ENV,
    AUTH_SECRET: process.env.AUTH_SECRET,

    FIREBASE_ADMIN_PROJECT_ID:   process.env.FIREBASE_ADMIN_PROJECT_ID,
    FIREBASE_ADMIN_CLIENT_EMAIL: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    FIREBASE_ADMIN_PRIVATE_KEY:  process.env.FIREBASE_ADMIN_PRIVATE_KEY,
    FIREBASE_STORAGE_BUCKET:     process.env.FIREBASE_STORAGE_BUCKET,

    CRON_SECRET:    process.env.CRON_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,

    UPSTASH_REDIS_REST_URL:   process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,

    NEXT_PUBLIC_FIREBASE_API_KEY:             process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:         process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID:          process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID:              process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID:      process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
    NEXT_PUBLIC_FIREBASE_VAPID_KEY:           process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
    NEXT_PUBLIC_APP_URL:                      process.env.NEXT_PUBLIC_APP_URL,
  },

  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
