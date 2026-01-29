/**
 * Middleware Next.js - Gestione Flusso Onboarding
 * 
 * Stati utente:
 * - PENDING_CONTRACT: Deve firmare contratto
 * - PENDING_BILLING: Ha firmato, deve compilare fatturazione
 * - PENDING_APPROVAL: Ha completato tutto, attende approvazione Admin
 * - ACTIVE: Approvato, accesso completo
 * 
 * Flusso:
 * 1. Registrazione → status: PENDING_CONTRACT
 * 2. Firma contratto → status: PENDING_BILLING
 * 3. Compila fatturazione → status: PENDING_APPROVAL
 * 4. Admin approva → status: ACTIVE
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Route pubbliche (accessibili senza login)
const PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/privacy",
  "/terms",
];

// Route che saltano tutti i controlli
const SKIP_ROUTES = [
  "/api",
  "/_next",
  "/favicon.ico",
  "/firebase-messaging-sw.js",
  "/manifest.json",
  "/images",
  "/icons",
];

// Route di onboarding
const ONBOARDING_ROUTES = [
  "/accept-contract",
  "/complete-billing",
  "/pending-approval",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip per route statiche e API
  if (SKIP_ROUTES.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Leggi cookie utente
  const userCookie = request.cookies.get("firebase-user")?.value;
  let user: {
    id: string;
    role: string;
    status?: string;
    contractAccepted?: boolean;
    billingCompleted?: boolean;
  } | null = null;

  if (userCookie) {
    try {
      user = JSON.parse(decodeURIComponent(userCookie));
    } catch {
      // Cookie non valido
    }
  }

  // Route pubbliche
  if (PUBLIC_ROUTES.some(route => pathname === route || pathname.startsWith(route + "/"))) {
    // Se loggato, redirect in base allo stato
    if (user) {
      const redirect = getRedirectForStatus(user, request.url);
      if (redirect) {
        return NextResponse.redirect(new URL(redirect, request.url));
      }
    }
    return NextResponse.next();
  }

  // Se non loggato, redirect a login
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = user.role?.toUpperCase() || "";
  const status = user.status?.toUpperCase() || "ACTIVE";
  const isProprietario = ["PROPRIETARIO", "OWNER", "CLIENTE"].includes(role);

  // Gestione stati per proprietari
  if (isProprietario) {
    
    // PENDING_CONTRACT: deve firmare
    if (status === "PENDING_CONTRACT" || user.contractAccepted === false) {
      if (!pathname.startsWith("/accept-contract")) {
        return NextResponse.redirect(new URL("/accept-contract", request.url));
      }
      return NextResponse.next();
    }

    // PENDING_BILLING: deve compilare fatturazione
    if (status === "PENDING_BILLING" || (user.contractAccepted && user.billingCompleted === false)) {
      if (!pathname.startsWith("/complete-billing")) {
        return NextResponse.redirect(new URL("/complete-billing", request.url));
      }
      return NextResponse.next();
    }

    // PENDING_APPROVAL: attende approvazione
    if (status === "PENDING_APPROVAL") {
      if (!pathname.startsWith("/pending-approval")) {
        return NextResponse.redirect(new URL("/pending-approval", request.url));
      }
      return NextResponse.next();
    }
  }

  // Se su route di onboarding ma non ne ha bisogno, redirect a dashboard
  if (ONBOARDING_ROUTES.some(route => pathname.startsWith(route))) {
    const destination = getDestinationForRole(role);
    return NextResponse.redirect(new URL(destination, request.url));
  }

  // Protezione route per ruolo
  if (pathname.startsWith("/dashboard") && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/proprietario", request.url));
  }

  if (pathname.startsWith("/proprietario") && !isProprietario && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/operatore", request.url));
  }

  if (pathname.startsWith("/operatore") && !["OPERATORE_PULIZIE", "OPERATORE", "ADMIN"].includes(role)) {
    return NextResponse.redirect(new URL("/proprietario", request.url));
  }

  if (pathname.startsWith("/rider") && !["RIDER", "ADMIN"].includes(role)) {
    return NextResponse.redirect(new URL("/proprietario", request.url));
  }

  return NextResponse.next();
}

// Helper: redirect in base allo stato
function getRedirectForStatus(user: any, baseUrl: string): string | null {
  const role = user.role?.toUpperCase() || "";
  const status = user.status?.toUpperCase() || "ACTIVE";
  const isProprietario = ["PROPRIETARIO", "OWNER", "CLIENTE"].includes(role);

  if (isProprietario) {
    if (status === "PENDING_CONTRACT" || user.contractAccepted === false) {
      return "/accept-contract";
    }
    if (status === "PENDING_BILLING" || (user.contractAccepted && user.billingCompleted === false)) {
      return "/complete-billing";
    }
    if (status === "PENDING_APPROVAL") {
      return "/pending-approval";
    }
  }

  return getDestinationForRole(role);
}

// Helper: destinazione per ruolo
function getDestinationForRole(role: string): string {
  switch (role) {
    case "ADMIN":
      return "/dashboard";
    case "PROPRIETARIO":
    case "OWNER":
    case "CLIENTE":
      return "/proprietario";
    case "OPERATORE_PULIZIE":
    case "OPERATORE":
      return "/operatore";
    case "RIDER":
      return "/rider";
    default:
      return "/dashboard";
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*|public).*)",
  ],
};
