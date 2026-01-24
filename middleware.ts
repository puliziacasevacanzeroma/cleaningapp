/**
 * Next.js Middleware
 * 
 * Gestisce:
 * - Redirect utenti non autenticati
 * - Controllo accettazione contratto
 * - Redirect basato su ruolo
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Route pubbliche che non richiedono autenticazione
const PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/",
];

// Route che non richiedono controllo contratto
const SKIP_CONTRACT_CHECK = [
  "/accept-contract",
  "/api",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/_next",
  "/favicon.ico",
  "/firebase-messaging-sw.js",
];

// Route per ruolo
const ROLE_ROUTES: Record<string, string[]> = {
  ADMIN: ["/dashboard"],
  PROPRIETARIO: ["/proprietario"],
  OPERATORE_PULIZIE: ["/operatore"],
  RIDER: ["/rider"],
};

// Dashboard di default per ruolo
const ROLE_DASHBOARD: Record<string, string> = {
  ADMIN: "/dashboard",
  PROPRIETARIO: "/proprietario",
  OPERATORE_PULIZIE: "/operatore",
  RIDER: "/rider",
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Skip per risorse statiche e API
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".") // file statici
  ) {
    return NextResponse.next();
  }

  // Ottieni info utente dal cookie (se presente)
  const userCookie = request.cookies.get("user-info")?.value;
  let userInfo: {
    uid?: string;
    role?: string;
    status?: string;
    contractAccepted?: boolean;
    contractVersion?: string;
  } | null = null;

  if (userCookie) {
    try {
      userInfo = JSON.parse(userCookie);
    } catch {
      // Cookie non valido, ignora
    }
  }

  // Route pubbliche - permetti accesso
  if (PUBLIC_ROUTES.some(route => pathname === route || pathname.startsWith(route + "/"))) {
    // Se utente loggato su pagina login, redirect a dashboard
    if (userInfo?.uid && (pathname === "/login" || pathname === "/register")) {
      const dashboard = ROLE_DASHBOARD[userInfo.role || ""] || "/dashboard";
      return NextResponse.redirect(new URL(dashboard, request.url));
    }
    return NextResponse.next();
  }

  // Se non autenticato, redirect a login
  if (!userInfo?.uid) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Controllo contratto (skip per alcune route)
  const skipContractCheck = SKIP_CONTRACT_CHECK.some(
    route => pathname === route || pathname.startsWith(route)
  );

  if (!skipContractCheck) {
    // Se utente deve accettare contratto
    if (
      userInfo.status === "pending_contract" ||
      userInfo.status === "PENDING_CONTRACT" ||
      userInfo.contractAccepted === false
    ) {
      // Redirect a pagina accettazione contratto
      if (pathname !== "/accept-contract") {
        return NextResponse.redirect(new URL("/accept-contract", request.url));
      }
    }
  }

  // Controllo accesso basato su ruolo
  const userRole = userInfo.role;
  
  if (userRole) {
    // Verifica se l'utente può accedere a questa route
    const allowedRoutes = ROLE_ROUTES[userRole] || [];
    const isAllowedRoute = allowedRoutes.some(route => pathname.startsWith(route));
    
    // Se sta accedendo a una route di un altro ruolo
    if (!isAllowedRoute && pathname !== "/accept-contract") {
      // Verifica se sta accedendo a route di altri ruoli
      const isOtherRoleRoute = Object.entries(ROLE_ROUTES).some(([role, routes]) => {
        if (role === userRole) return false;
        return routes.some(route => pathname.startsWith(route));
      });

      if (isOtherRoleRoute) {
        // Redirect alla dashboard corretta
        const dashboard = ROLE_DASHBOARD[userRole] || "/dashboard";
        return NextResponse.redirect(new URL(dashboard, request.url));
      }
    }
  }

  return NextResponse.next();
}

// Configura le route su cui applicare il middleware
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*|api).*)",
  ],
};
