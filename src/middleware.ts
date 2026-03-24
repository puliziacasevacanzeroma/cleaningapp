import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkRateLimit } from "~/lib/rate-limit";

// ─── Route pubbliche (accessibili senza login) ───
const PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/privacy",
  "/terms",
  "/guida",
];

// ─── Route onboarding ───
const ONBOARDING_ROUTES = [
  "/accept-contract",
  "/complete-billing",
  "/pending-approval",
];

// ─── API pubbliche (no auth) ───
const PUBLIC_API_PATTERNS = [
  /^\/api\/auth\//,
  /^\/api\/cron\//,
  /^\/api\/sync-all-ical$/,
  /^\/api\/properties\/[^/]+\/ical$/,
  /^\/api\/push\//,
  /^\/api\/firebase-sw$/,
];

// ─── API solo admin ───
const ADMIN_ONLY_PATTERNS = [
  /^\/api\/admin\//,
  /^\/api\/properties\/[^/]+\/sync-ical$/,
  /^\/api\/properties\/[^/]+\/reset-ical-hashes$/,
];

// Verifica JWT usando Web Crypto API (Edge Runtime compatible)
async function getUserFromRequest(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return null;

  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [header, payload, signature] = parts as [string, string, string];

    const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
    if (!secret) return null;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signingInput = `${header}.${payload}`;

    // Converti base64url in base64 standard
    const base64 = signature.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
    const binary = atob(padded);
    const signatureBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      signatureBytes[i] = binary.charCodeAt(i);
    }

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes,
      new TextEncoder().encode(signingInput)
    );

    if (!valid) return null;

    // Decodifica payload
    const payloadBase64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const payloadPadded = payloadBase64 + "=".repeat((4 - payloadBase64.length % 4) % 4);
    const decoded = JSON.parse(atob(payloadPadded));

    // Verifica scadenza
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < now) return null;
    if (!decoded.id || !decoded.role) return null;

    return decoded as {
      id: string;
      role: string;
      status?: string;
      contractAccepted?: boolean;
      billingCompleted?: boolean;
    };
  } catch {
    return null;
  }
}

function getHomeForRole(role: string): string {
  switch (role.toUpperCase()) {
    case "ADMIN": return "/dashboard";
    case "PROPRIETARIO":
    case "OWNER":
    case "CLIENTE": return "/proprietario";
    case "OPERATORE_PULIZIE":
    case "OPERATORE": return "/operatore";
    case "RIDER": return "/rider";
    default: return "/dashboard";
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Skip risorse statiche ──
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/icons") ||
    pathname.startsWith("/manifest") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // ── Rate Limiting per API ──
  // Escludi cron jobs dal rate limit (usano autenticazione via secret, non IP)
  // I cron gestiscono la propria autenticazione via CRON_SECRET → passano direttamente
  if (pathname.startsWith("/api/cron/")) {
    return NextResponse.next();
  }
  
  if (pathname.startsWith("/api/")) {
    const rateLimitResult = await checkRateLimit(request);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: "Troppe richieste. Riprova tra poco." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((rateLimitResult.reset - Date.now()) / 1000)),
            "X-RateLimit-Limit": String(rateLimitResult.limit),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    // API pubbliche: passa sempre (dopo rate limit check)
    if (PUBLIC_API_PATTERNS.some(p => p.test(pathname))) {
      return NextResponse.next();
    }

    // API protette: verifica JWT
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    // API solo admin
    if (ADMIN_ONLY_PATTERNS.some(p => p.test(pathname))) {
      if (user.role?.toUpperCase() !== "ADMIN") {
        return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
      }
    }

    return NextResponse.next();
  }

  // ── Pagine pubbliche: SEMPRE accessibili ──
  if (PUBLIC_ROUTES.some(r => pathname === r || pathname.startsWith(r + "/"))) {
    return NextResponse.next();
  }

  // ── Pagine protette: verifica JWT ──
  const user = await getUserFromRequest(request);

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = user.role?.toUpperCase() || "";
  const status = user.status?.toUpperCase() || "ACTIVE";
  const isProprietario = ["PROPRIETARIO", "OWNER", "CLIENTE"].includes(role);

  // ── Onboarding proprietari ──
  // IMPORTANTE: ogni step controlla SOLO se deve redirectare verso lo step corrente,
  // e NON interferisce se si è già sullo step corretto → evita redirect loop
  if (isProprietario) {
    // Step 1: contratto non ancora accettato
    if (!user.contractAccepted) {
      if (!pathname.startsWith("/accept-contract")) {
        return NextResponse.redirect(new URL("/accept-contract", request.url));
      }
      // È già su /accept-contract → lascia passare, nessun redirect
      return NextResponse.next();
    }

    // Step 2: contratto OK ma fatturazione non completata
    if (user.contractAccepted && !user.billingCompleted) {
      if (!pathname.startsWith("/complete-billing")) {
        return NextResponse.redirect(new URL("/complete-billing", request.url));
      }
      // È già su /complete-billing → lascia passare
      return NextResponse.next();
    }

    // Step 3: in attesa di approvazione
    if (status === "PENDING_APPROVAL" || status === "PENDING_BILLING" || status === "PENDING_CONTRACT") {
      if (!pathname.startsWith("/pending-approval")) {
        return NextResponse.redirect(new URL("/pending-approval", request.url));
      }
      // È già su /pending-approval → lascia passare SEMPRE, nessun altro redirect
      return NextResponse.next();
    }
  }

  // ── Se utente attivo finisce su pagina onboarding: mandalo alla home ──
  // Solo per utenti con onboarding COMPLETATO (contractAccepted + billingCompleted + ACTIVE)
  if (ONBOARDING_ROUTES.some(r => pathname.startsWith(r))) {
    const onboardingComplete =
      user.contractAccepted &&
      user.billingCompleted &&
      status === "ACTIVE";

    if (onboardingComplete) {
      return NextResponse.redirect(new URL(getHomeForRole(role), request.url));
    }

    // Onboarding non completato: lascia passare (già gestito sopra per isProprietario)
    // Per altri ruoli in onboarding: lascia passare
    return NextResponse.next();
  }

  // ── Protezione ruoli ──
  if (pathname.startsWith("/dashboard") && role !== "ADMIN") {
    return NextResponse.redirect(new URL(getHomeForRole(role), request.url));
  }
  if (pathname.startsWith("/proprietario") && !isProprietario && role !== "ADMIN") {
    return NextResponse.redirect(new URL(getHomeForRole(role), request.url));
  }
  if (pathname.startsWith("/operatore") && !["OPERATORE_PULIZIE", "OPERATORE", "ADMIN"].includes(role)) {
    return NextResponse.redirect(new URL(getHomeForRole(role), request.url));
  }
  if (pathname.startsWith("/rider") && !["RIDER", "ADMIN"].includes(role)) {
    return NextResponse.redirect(new URL(getHomeForRole(role), request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
