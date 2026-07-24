"use client";

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useTransition, Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NotificationBell } from "~/components/notifications";
import { ToastProvider, useAdminRealtimeNotifications } from "~/components/ui/ToastNotifications";
import { PushNotificationInit } from "~/components/PushNotificationInit";
import { useAuth } from "~/lib/firebase/AuthContext";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

// Componente separato che attiva i listener solo per admin
function AdminRealtimeListener() {
  useAdminRealtimeNotifications();
  return null;
}

interface DashboardLayoutClientProps {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
  userRole?: string;
  pendingPropertiesCount?: number;
}

export function DashboardLayoutClient({ 
  children, 
  userName, 
  userEmail, 
  userRole = "Admin", 
  pendingPropertiesCount = 0
}: DashboardLayoutClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const [isPending, startTransition] = useTransition();
  
  // 🔄 INIZIALIZZA SEMPRE A FALSE PER EVITARE HYDRATION MISMATCH
  const [isDesktop, setIsDesktop] = useState<boolean>(false);
  
  // Flag per sapere se siamo già montati — useLayoutEffect per ZERO frame di spinner
  const [mounted, setMounted] = useState(false);
  
  const [menuOpen, setMenuOpen] = useState(false);
  const scrollContainerRef = useRef<HTMLElement>(null);

  // 🚀 NAVBAR ISTANTANEA: evidenzia il pulsante subito al click, prima che la pagina carichi
  const [optimisticPath, setOptimisticPath] = useState<string | null>(null);
  
  useEffect(() => {
    setOptimisticPath(null);
  }, [pathname]);

  const activePath = optimisticPath || pathname;

  const handleNavClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    if (pathname === href) return;

    // 🚀 1. DOM diretto — highlight ISTANTANEO senza aspettare React
    const nav = (e.currentTarget as HTMLElement).closest('nav');
    if (nav) {
      nav.querySelectorAll('a').forEach(el => {
        (el as HTMLElement).style.color = '#64748b';
        (el as HTMLElement).style.background = 'transparent';
      });
      const clicked = e.currentTarget as HTMLElement;
      clicked.style.color = '#0284c7';
      clicked.style.background = 'rgba(2,132,199,0.08)';
    }

    // 🚀 2. React state in background
    setOptimisticPath(href);
    startTransition(() => { router.push(href); });
  }, [pathname, router, startTransition]);

  // 🔧 Reset scroll quando cambia pagina
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [pathname]);

  // 🚀 useLayoutEffect: si esegue PRIMA del paint → nessun frame di spinner
  useLayoutEffect(() => {
    setIsDesktop(window.innerWidth >= 1024);
    setMounted(true);
  }, []);

  // Resize listener separato
  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 🔧 v2: zoom 0.8 su <html> SOLO su desktop — tutta l'area admin (menu incluso)
  // si vede all'80%. Zoom sulla radice = scala uniforme come lo zoom browser
  // (anche pannelli position:fixed, modal, toast), stesso approccio già validato
  // sull'area proprietario. Cleanup al passaggio a mobile/unmount.
  useEffect(() => {
    if (isDesktop) {
      (document.documentElement.style as any).zoom = "0.8";
      return () => { (document.documentElement.style as any).zoom = ""; };
    }
  }, [isDesktop]);

  // 🚀 Prefetch route principali per navigazione istantanea.
  // PERF: prima partiva immediatamente e ad OGNI cambio pathname, scaricando i
  // bundle di 6 pagine pesanti (incl. DashboardContent ~188 KB, PropertyServiceConfig
  // ~375 KB) proprio mentre la home stava caricando i suoi dati → contesa di rete/CPU
  // su mobile ("altre pagine già caricate"). Ora: una sola volta, a browser idle,
  // così la navigazione resta istantanea ma l'avvio della home non ne paga il costo.
  useEffect(() => {
    const routes = [
      "/dashboard",
      "/dashboard/calendario/pulizie",
      "/dashboard/proprieta",
      "/dashboard/calendario/prenotazioni",
      "/dashboard/utenti",
      "/dashboard/assegnazioni",
      "/dashboard/pagamenti", // ⚡ chunk pesante (~260KB src): precaricato a idle
    ];
    const doPrefetch = () => {
      routes.forEach(route => router.prefetch(route));
    };

    const w = window as any;
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (typeof w.requestIdleCallback === "function") {
      idleId = w.requestIdleCallback(doPrefetch, { timeout: 4000 });
    } else {
      timeoutId = setTimeout(doPrefetch, 2000);
    }

    return () => {
      if (idleId !== undefined && typeof w.cancelIdleCallback === "function") {
        w.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [pendingCount, setPendingCount] = useState(pendingPropertiesCount);
  const [pendingUsersCount, setPendingUsersCount] = useState(0);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({
    calendari: true,
    proprieta: false,
    utenti: true
  });

  // Logout handler
  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  // Aggiorna pendingCount quando cambia la prop
  useEffect(() => {
    setPendingCount(pendingPropertiesCount);
  }, [pendingPropertiesCount]);

  // Realtime listener per utenti PENDING_APPROVAL (solo admin)
  useEffect(() => {
    if (userRole !== 'ADMIN') return;
    const q = query(collection(db, "users"), where("status", "==", "PENDING_APPROVAL"));
    const unsub = onSnapshot(q, snap => setPendingUsersCount(snap.size), () => {});
    return () => unsub();
  }, [userRole]);

  // Mount e resize ora gestiti sopra con useLayoutEffect

  const toggleMenu = (menu: string) => {
    setOpenMenus(prev => ({ ...prev, [menu]: !prev[menu] }));
  };

  const getInitials = (name: string) => {
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const isActive = (path: string) => activePath === path || activePath.startsWith(path + "/");

  const getRoleBadge = (role: string) => {
    const roleMap: Record<string, { bg: string; text: string; label: string }> = {
      ADMIN: { bg: "from-violet-500 to-purple-600", text: "text-white", label: "Admin" },
      OWNER: { bg: "from-blue-500 to-indigo-600", text: "text-white", label: "Proprietario" },
      PROPRIETARIO: { bg: "from-blue-500 to-indigo-600", text: "text-white", label: "Proprietario" },
      OPERATOR: { bg: "from-emerald-500 to-teal-600", text: "text-white", label: "Operatore" },
      OPERATORE_PULIZIE: { bg: "from-emerald-500 to-teal-600", text: "text-white", label: "Operatore" },
      RIDER: { bg: "from-amber-500 to-orange-600", text: "text-white", label: "Rider" },
      LAVANDERIA: { bg: "from-purple-500 to-indigo-600", text: "text-white", label: "Lavanderia" },
    };
    return roleMap[role.toUpperCase()] || { bg: "from-slate-500 to-slate-600", text: "text-white", label: role };
  };

  const roleBadge = getRoleBadge(userRole);

  const mainMenuItems = [
    { href: "/dashboard/proprieta", label: "Proprietà", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4", hasBadge: true },
    { href: "/dashboard/calendario/pulizie", label: "Pulizie", icon: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" },
    { href: "/dashboard", label: "Dashboard", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
    { href: "/dashboard/calendario/prenotazioni", label: "Calendario", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
  ];

  // ============================================
  // DESKTOP/MOBILE - Render immediato senza flash
  // ============================================
  const isAdmin = userRole === 'ADMIN';
  
  // 🔥 FIX HYDRATION: Non renderizzare contenuto diverso finché non siamo montati
  // Questo evita il mismatch tra server (che non ha window) e client
  if (!mounted) {
    return (
      <ToastProvider>
        <div className="min-h-screen bg-slate-50">
          <div className="flex items-center justify-center pt-32">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
          </div>
        </div>
      </ToastProvider>
    );
  }
  
  if (isDesktop) {
    return (
      <ToastProvider>
        {isAdmin && <AdminRealtimeListener />}
        <PushNotificationInit />
        <div className="h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-sky-50/30">
        <div className="flex h-full">
          {/* Sidebar */}
          <aside className="w-72 h-screen bg-white/80 backdrop-blur-xl border-r border-slate-200/60 fixed flex flex-col">
            {/* Logo */}
            <div className="h-20 flex items-center px-6 border-b border-slate-200/60 flex-shrink-0">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/30">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full border-2 border-white"></div>
                </div>
                <div>
                  <span className="text-xl font-bold text-slate-800">CleaningApp</span>
                  <p className="text-xs text-slate-400 font-medium">Gestionale Pro</p>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto p-4 space-y-1">
              {/* Dashboard */}
              <Link
                href="/dashboard"
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  pathname === "/dashboard"
                    ? "text-white bg-gradient-to-r from-sky-500 to-blue-600 shadow-lg shadow-sky-500/30"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${pathname === "/dashboard" ? "bg-white/20" : ""}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                </div>
                <span className="font-medium">Dashboard</span>
              </Link>

              {/* Calendari */}
              <div className="pt-2">
                <button
                  onClick={() => toggleMenu("calendari")}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <span className="font-medium">Calendari</span>
                  <svg className={`w-4 h-4 ml-auto transition-transform ${openMenus.calendari ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openMenus.calendari && (
                  <div className="ml-6 mt-1 space-y-1 border-l-2 border-slate-100 pl-4">
                    <Link href="/dashboard/calendario/prenotazioni" className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${isActive("/dashboard/calendario/prenotazioni") ? "text-sky-600 bg-sky-50" : "text-slate-400 hover:text-slate-600"}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
                      Prenotazioni
                    </Link>
                    <Link href="/dashboard/calendario/pulizie" className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${isActive("/dashboard/calendario/pulizie") ? "text-sky-600 bg-sky-50" : "text-slate-400 hover:text-slate-600"}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      Pulizie
                    </Link>
                  </div>
                )}
              </div>

              {/* Proprietà */}
              <div>
                <button
                  onClick={() => toggleMenu("proprieta")}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <span className="font-medium">Proprietà</span>
                  {pendingCount > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                      {pendingCount}
                    </span>
                  )}
                  <svg className={`w-4 h-4 ${pendingCount > 0 ? '' : 'ml-auto'} transition-transform ${openMenus.proprieta ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openMenus.proprieta && (
                  <div className="ml-6 mt-1 space-y-1 border-l-2 border-slate-100 pl-4">
                    <Link href="/dashboard/proprieta" className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${pathname === "/dashboard/proprieta" ? "text-sky-600 bg-sky-50" : "text-slate-400 hover:text-slate-600"}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      Attive
                    </Link>
                    <Link href="/dashboard/proprieta/pending" className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${isActive("/dashboard/proprieta/pending") ? "text-sky-600 bg-sky-50" : "text-slate-400 hover:text-slate-600"}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                      In attesa
                      {pendingCount > 0 && (
                        <span className="bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center ml-auto">
                          {pendingCount}
                        </span>
                      )}
                    </Link>
                  </div>
                )}
              </div>

              {/* 🔄 Assegnazioni */}
              <Link
                href="/dashboard/assegnazioni"
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive("/dashboard/assegnazioni")
                    ? "text-white bg-gradient-to-r from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/30"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isActive("/dashboard/assegnazioni") ? "bg-white/20" : ""}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <span className="font-medium">Assegnazioni</span>
              </Link>

              {/* 📅 Turni */}
              <Link
                href="/dashboard/turni"
                prefetch={false}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive("/dashboard/turni")
                    ? "text-white bg-gradient-to-r from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/30"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isActive("/dashboard/turni") ? "bg-white/20" : ""}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <span className="font-medium">Turni</span>
              </Link>

              {/* ⏱️ Orari Lavoro */}
              <Link
                href="/dashboard/orari-lavoro"
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive("/dashboard/orari-lavoro")
                    ? "text-white bg-gradient-to-r from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/30"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isActive("/dashboard/orari-lavoro") ? "bg-white/20" : ""}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="font-medium">Orari Lavoro</span>
              </Link>

              {/* 💰 Pagamenti */}
              <Link
                href="/dashboard/pagamenti"
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive("/dashboard/pagamenti")
                    ? "text-white bg-gradient-to-r from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/30"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isActive("/dashboard/pagamenti") ? "bg-white/20" : ""}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="font-medium">Pagamenti</span>
              </Link>

              {/* ✅ Approvazioni (Utenti + Proprietà) */}
              <Link
                href="/dashboard/approvazioni"
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive("/dashboard/approvazioni") || isActive("/dashboard/proprieta/pending")
                    ? "text-white bg-gradient-to-r from-amber-500 to-orange-600 shadow-lg shadow-amber-500/30"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isActive("/dashboard/approvazioni") || isActive("/dashboard/proprieta/pending") ? "bg-white/20" : ""}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="font-medium">Approvazioni</span>
                {pendingUsersCount > 0 && (
                  <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center ml-auto">
                    {pendingUsersCount}
                  </span>
                )}
              </Link>

              {/* 📦 Inventario (Biancheria + Prodotti) */}
              <Link
                href="/dashboard/inventario"
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive("/dashboard/inventario") || isActive("/dashboard/inventario-prodotti")
                    ? "text-white bg-gradient-to-r from-sky-500 to-blue-600 shadow-lg shadow-sky-500/30"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isActive("/dashboard/inventario") || isActive("/dashboard/inventario-prodotti") ? "bg-white/20" : ""}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
                <span className="font-medium">Inventario</span>
              </Link>

              {/* 🧴 Spedizioni Prodotti */}
              <Link
                href="/dashboard/spedizioni"
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive("/dashboard/spedizioni")
                    ? "text-white bg-gradient-to-r from-sky-500 to-blue-600 shadow-lg shadow-sky-500/30"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isActive("/dashboard/spedizioni") ? "bg-white/20" : ""}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
                <span className="font-medium">Spedizioni</span>
              </Link>

              {/* 🔔 Centro Messaggi (Notifiche + Segnalazioni) */}
              <Link
                href="/dashboard/notifiche"
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive("/dashboard/notifiche") || isActive("/dashboard/segnalazioni")
                    ? "text-white bg-gradient-to-r from-rose-500 to-red-600 shadow-lg shadow-rose-500/30"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isActive("/dashboard/notifiche") || isActive("/dashboard/segnalazioni") ? "bg-white/20" : ""}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </div>
                <span className="font-medium">Centro Messaggi</span>
              </Link>

              {/* 📊 Report & Statistiche */}
              <Link
                href="/dashboard/report"
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive("/dashboard/report") || isActive("/dashboard/statistiche")
                    ? "text-white bg-gradient-to-r from-violet-500 to-purple-600 shadow-lg shadow-violet-500/30"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isActive("/dashboard/report") || isActive("/dashboard/statistiche") ? "bg-white/20" : ""}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <span className="font-medium">Report & Statistiche</span>
              </Link>

              {/* 🧾 Preventivi */}
              <Link
                href="/dashboard/preventivi"
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive("/dashboard/preventivi")
                    ? "text-white bg-gradient-to-r from-sky-500 to-blue-600 shadow-lg shadow-sky-500/30"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isActive("/dashboard/preventivi") ? "bg-white/20" : ""}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <span className="font-medium">Preventivi</span>
              </Link>

              {/* 🧺 Lavanderia */}
              <Link
                href="/dashboard/lavanderia"
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive("/dashboard/lavanderia")
                    ? "text-white bg-gradient-to-r from-purple-500 to-indigo-600 shadow-lg shadow-purple-500/30"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isActive("/dashboard/lavanderia") ? "bg-white/20" : ""}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <span className="font-medium">Lavanderia</span>
              </Link>

              {/* 👥 Gestione Utenti */}
              <Link
                href="/dashboard/utenti"
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive("/dashboard/utenti")
                    ? "text-white bg-gradient-to-r from-violet-500 to-purple-600 shadow-lg shadow-violet-500/30"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isActive("/dashboard/utenti") ? "bg-white/20" : ""}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <span className="font-medium">Gestione Utenti</span>
              </Link>

              {/* ⚙️ Impostazioni */}
              <Link
                href="/dashboard/impostazioni"
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive("/dashboard/impostazioni") || pathname.includes("/sync-monitor")
                    ? "text-white bg-gradient-to-r from-slate-500 to-slate-600 shadow-lg"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isActive("/dashboard/impostazioni") || pathname.includes("/sync-monitor") ? "bg-white/20" : ""}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <span className="font-medium">Impostazioni</span>
              </Link>

              {/* 🔄 Sync Monitor */}
              <Link
                href="/dashboard/admin/sync-monitor"
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  pathname.includes("/sync-monitor")
                    ? "text-white bg-gradient-to-r from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/30"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${pathname.includes("/sync-monitor") ? "bg-white/20" : ""}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
                <span className="font-medium">Sync Monitor</span>
              </Link>
            </nav>

            {/* User section */}
            <div className="p-4 border-t border-slate-200/60 flex-shrink-0">
              <button onClick={handleLogout} className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${roleBadge.bg} flex items-center justify-center shadow-lg`}>
                  <span className="text-sm font-bold text-white">{getInitials(userName)}</span>
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-semibold text-slate-700 truncate">{userName}</p>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gradient-to-r ${roleBadge.bg} ${roleBadge.text}`}>
                    {roleBadge.label}
                  </span>
                </div>
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </aside>

          {/* Main Content */}
          <div className="flex-1 ml-72 h-screen flex flex-col">
            {/* Header Desktop con NotificationBell */}
            <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 px-6 py-3 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-slate-700">
                  {pathname === "/dashboard" && "Dashboard"}
                  {pathname.includes("/calendario/pulizie") && "Calendario Pulizie"}
                  {pathname.includes("/calendario/prenotazioni") && "Calendario Prenotazioni"}
                  {pathname === "/dashboard/proprieta" && "Proprietà"}
                  {pathname.includes("/proprieta/pending") && "Proprietà in Attesa"}
                  {pathname.includes("/proprieta/") && !pathname.includes("/pending") && pathname !== "/dashboard/proprieta" && "Dettaglio Proprietà"}
                  {pathname === "/dashboard/pagamenti" && "Pagamenti"}
                  {pathname === "/dashboard/inventario" && "Biancheria & Dotazioni"}
                  {pathname === "/dashboard/inventario-prodotti" && "Prodotti Pulizia"}
                  {pathname === "/dashboard/utenti" && "Gestione Utenti"}
                  {pathname === "/dashboard/approvazioni" && "Approvazione Utenti"}
                  {pathname === "/dashboard/notifiche" && "Notifiche"}
                  {pathname === "/dashboard/report" && "Report"}
                  {pathname === "/dashboard/preventivi" && "Preventivi"}
                  {pathname === "/dashboard/impostazioni" && "Impostazioni"}
                  {pathname === "/dashboard/assegnazioni" && "Assegnazioni Pulizie"}
                  {pathname === "/dashboard/turni" && "Turni Operatori"}
                  {pathname === "/dashboard/orari-lavoro" && "Orari di Lavoro"}
                </h2>
              </div>
              <div className="flex items-center gap-4">
                <NotificationBell isAdmin={true} />
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${roleBadge.bg} flex items-center justify-center shadow-sm`}>
                    <span className="text-xs font-bold text-white">{getInitials(userName)}</span>
                  </div>
                  <span className="text-sm font-medium text-slate-600 hidden xl:block">{userName}</span>
                </div>
              </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto">
              {/* Rimuovi padding per pagine full-screen (come proprietario) */}
              <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
              {pathname === "/dashboard/calendario/pulizie" || pathname === "/dashboard/calendario/prenotazioni" || pathname.startsWith("/dashboard/calendario/") || pathname === "/dashboard/proprieta" || pathname.startsWith("/dashboard/proprieta/") || pathname === "/dashboard/pagamenti" || pathname === "/dashboard/utenti" || pathname.startsWith("/dashboard/utenti/") || pathname === "/dashboard/report" || pathname === "/dashboard/statistiche" || pathname === "/dashboard/assegnazioni" || pathname === "/dashboard/impostazioni/coordinate" ? (
                children
              ) : (
                <div className="p-8">
                  {children}
                </div>
              )}
              </Suspense>
            </main>
          </div>
        </div>
      </div>
      </ToastProvider>
    );
  }

  // ============================================
  // MOBILE LAYOUT
  // ============================================
  return (
    <ToastProvider>
      {isAdmin && <AdminRealtimeListener />}
      <PushNotificationInit />
      {/* Layout mobile: container fixed che copre tutto lo schermo */}
      <div className="fixed inset-0 bg-gradient-to-br from-slate-50 via-white to-sky-50/30 flex flex-col" style={{ overscrollBehavior: "none" }}>
      {/* Mobile Header - SEMPRE visibile */}
      <header className="bg-white border-b border-slate-200 shadow-sm px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-600 flex items-center justify-center shadow-lg">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">CleaningApp</h1>
              <p className="text-xs text-slate-500">Gestionale Pro</p>
            </div>
          </div>
          <NotificationBell isAdmin={true} />
        </div>
      </header>

      {/* Main Content Mobile - con padding per navbar */}
      <main 
        ref={scrollContainerRef}
        className={`flex-1 overflow-y-auto overscroll-none ${pathname === "/dashboard/calendario/pulizie" || pathname === "/dashboard/calendario/prenotazioni" || pathname.startsWith("/dashboard/calendario/") || pathname === "/dashboard/proprieta" || pathname.startsWith("/dashboard/proprieta/") || pathname === "/dashboard/pagamenti" || pathname === "/dashboard/notifiche" || pathname === "/dashboard/segnalazioni" || pathname === "/dashboard/approvazioni" || pathname === "/dashboard/inventario" || pathname === "/dashboard/inventario-prodotti" || pathname === "/dashboard/statistiche" || pathname === "/dashboard/report" || pathname === "/dashboard/utenti" || pathname.startsWith("/dashboard/utenti/") || pathname === "/dashboard/assegnazioni" ? "" : "px-4 py-4"}`}
        style={{ WebkitOverflowScrolling: "touch", paddingBottom: 'calc(64px + env(safe-area-inset-bottom, 0px))' }}
      >
        <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
          {children}
        </Suspense>
      </main>

      {/* Mobile Bottom Nav — feedback tattile istantaneo */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-lg border-t border-slate-200/80 px-2 z-50" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex justify-around items-center max-w-lg mx-auto py-1.5">
          {mainMenuItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                onClick={(e) => handleNavClick(e, item.href)}
                className="relative flex flex-col items-center py-2 px-3 rounded-xl select-none"
                style={{
                  color: active ? "#0284c7" : "#64748b",
                  background: active ? "rgba(2,132,199,0.08)" : "transparent",
                  WebkitTapHighlightColor: "transparent",
                  transition: "color 0.1s, background 0.1s",
                }}
                onTouchStart={(e) => {
                  // Feedback tattile istantaneo al touch
                  const el = e.currentTarget;
                  el.style.transform = "scale(0.9)";
                  el.style.opacity = "0.7";
                }}
                onTouchEnd={(e) => {
                  const el = e.currentTarget;
                  el.style.transform = "scale(1)";
                  el.style.opacity = "1";
                }}
                onTouchCancel={(e) => {
                  const el = e.currentTarget;
                  el.style.transform = "scale(1)";
                  el.style.opacity = "1";
                }}
              >
                <div className="relative">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2.5 : 2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                  </svg>
                  {item.hasBadge && pendingCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[8px] text-white flex items-center justify-center font-bold">
                      {pendingCount > 9 ? "9+" : pendingCount}
                    </span>
                  )}
                </div>
                <span className="text-[10px] mt-1" style={{ fontWeight: active ? 700 : 500 }}>{item.label}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setMenuOpen(true)}
            className="relative flex flex-col items-center py-2 px-3 rounded-xl text-slate-500 select-none"
            style={{ WebkitTapHighlightColor: "transparent", transition: "transform 0.1s" }}
            onTouchStart={(e) => { e.currentTarget.style.transform = "scale(0.9)"; e.currentTarget.style.opacity = "0.7"; }}
            onTouchEnd={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.opacity = "1"; }}
            onTouchCancel={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.opacity = "1"; }}
          >
            <div className="relative">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              {pendingUsersCount > 0 && (
                <span className="absolute -top-1 -right-1.5 w-4 h-4 bg-orange-500 rounded-full text-[8px] text-white flex items-center justify-center font-bold">
                  {pendingUsersCount > 9 ? "9+" : pendingUsersCount}
                </span>
              )}
            </div>
            <span className="text-[10px] mt-1 font-medium">Menu</span>
          </button>
        </div>
      </nav>

      {/* Mobile Slide-up Menu */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setMenuOpen(false)} />
          <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-50 max-h-[70vh] overflow-y-auto">
            <div className="p-4">
              <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto mb-4"></div>
              
              {/* User Info */}
              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl mb-4">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${roleBadge.bg} flex items-center justify-center`}>
                  <span className="text-lg font-bold text-white">{getInitials(userName)}</span>
                </div>
                <div>
                  <p className="font-semibold text-slate-800">{userName}</p>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-gradient-to-r ${roleBadge.bg} ${roleBadge.text}`}>
                    {roleBadge.label}
                  </span>
                </div>
              </div>

              {/* Menu Items — Consolidati */}
              <div className="space-y-1">
                {/* 👥 Gestione Utenti */}
                <Link href="/dashboard/utenti" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  </div>
                  <span className="font-medium text-slate-700">Gestione Utenti</span>
                </Link>

                {/* 🔄 Assegnazioni */}
                <Link href="/dashboard/assegnazioni" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <span className="font-medium text-slate-700">Assegnazioni</span>
                </Link>

                {/* 📅 Turni */}
                <Link href="/dashboard/turni" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <span className="font-medium text-slate-700">Turni</span>
                </Link>

                {/* ⏱️ Orari Lavoro */}
                <Link href="/dashboard/orari-lavoro" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <span className="font-medium text-slate-700">Orari Lavoro</span>
                </Link>

                {/* ✅ Approvazioni (Utenti + Proprietà) */}
                <Link href="/dashboard/approvazioni" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors">
                  <div className="relative w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {pendingUsersCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-orange-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
                        {pendingUsersCount > 9 ? "9+" : pendingUsersCount}
                      </span>
                    )}
                  </div>
                  <span className="font-medium text-slate-700">Approvazioni</span>
                  {pendingUsersCount > 0 && (
                    <span className="ml-auto bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {pendingUsersCount}
                    </span>
                  )}
                </Link>

                {/* 💰 Pagamenti */}
                <Link href="/dashboard/pagamenti" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <span className="font-medium text-slate-700">Pagamenti</span>
                </Link>

                {/* 📦 Inventario (Biancheria + Prodotti) */}
                <Link href="/dashboard/inventario" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                  <span className="font-medium text-slate-700">Inventario</span>
                </Link>

                {/* 🧴 Spedizioni Prodotti */}
                <Link href="/dashboard/spedizioni" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                  <span className="font-medium text-slate-700">Spedizioni Prodotti</span>
                </Link>

                {/* 🔔 Centro Messaggi (Notifiche + Segnalazioni) */}
                <Link href="/dashboard/notifiche" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                  </div>
                  <span className="font-medium text-slate-700">Centro Messaggi</span>
                </Link>

                {/* 📊 Report & Statistiche */}
                <Link href="/dashboard/report" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <span className="font-medium text-slate-700">Report & Statistiche</span>
                </Link>

                {/* 🧾 Preventivi */}
                <Link href="/dashboard/preventivi" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <span className="font-medium text-slate-700">Preventivi</span>
                </Link>

                {/* 🧺 Lavanderia */}
                <Link href="/dashboard/lavanderia" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <span className="font-medium text-slate-700">Lavanderia</span>
                </Link>

                {/* ⚙️ Impostazioni */}
                <Link href="/dashboard/impostazioni" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <span className="font-medium text-slate-700">Impostazioni</span>
                </Link>

                {/* 🔄 Sync Monitor */}
                <Link href="/dashboard/admin/sync-monitor" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </div>
                  <span className="font-medium text-slate-700">Sync Monitor</span>
                </Link>
              </div>

              {/* Logout */}
              <Link
                href="/logout"
                className="w-full flex items-center gap-3 p-3 mt-4 rounded-xl text-red-600 hover:bg-red-50"
              >
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </div>
                <span className="font-medium">Esci</span>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
    </ToastProvider>
  );
}
