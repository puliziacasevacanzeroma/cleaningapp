"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NotificationBell } from "~/components/notifications";
import { ToastProvider, useAdminRealtimeNotifications } from "~/components/ui/ToastNotifications";
import { useAuth } from "~/lib/firebase/AuthContext";

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
  
  // 🔄 INIZIALIZZA CON VALORE CORRETTO SUBITO
  // Su client leggiamo window.innerWidth immediatamente
  // Su server assumiamo mobile (più comune per questa app)
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === "undefined") return false; // SSR: assume mobile
    return window.innerWidth >= 1024;
  });
  
  // Flag per sapere se siamo già montati (per evitare flash)
  const [mounted, setMounted] = useState(false);
  
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(pendingPropertiesCount);
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
    console.log("🔴 Badge pending aggiornato:", pendingPropertiesCount);
  }, [pendingPropertiesCount]);

  // Check screen size - esegui subito al mount
  useEffect(() => {
    // Imposta il valore corretto e segna come montato
    setIsDesktop(window.innerWidth >= 1024);
    setMounted(true);
    
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const toggleMenu = (menu: string) => {
    setOpenMenus(prev => ({ ...prev, [menu]: !prev[menu] }));
  };

  const getInitials = (name: string) => {
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + "/");

  const getRoleBadge = (role: string) => {
    const roleMap: Record<string, { bg: string; text: string; label: string }> = {
      ADMIN: { bg: "from-violet-500 to-purple-600", text: "text-white", label: "Admin" },
      OWNER: { bg: "from-blue-500 to-indigo-600", text: "text-white", label: "Proprietario" },
      PROPRIETARIO: { bg: "from-blue-500 to-indigo-600", text: "text-white", label: "Proprietario" },
      OPERATOR: { bg: "from-emerald-500 to-teal-600", text: "text-white", label: "Operatore" },
      OPERATORE_PULIZIE: { bg: "from-emerald-500 to-teal-600", text: "text-white", label: "Operatore" },
      RIDER: { bg: "from-amber-500 to-orange-600", text: "text-white", label: "Rider" },
    };
    return roleMap[role.toUpperCase()] || { bg: "from-slate-500 to-slate-600", text: "text-white", label: role };
  };

  const roleBadge = getRoleBadge(userRole);

  const mainMenuItems = [
    { href: "/dashboard", label: "Home", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
    { href: "/dashboard/calendario/pulizie", label: "Pulizie", icon: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" },
    { href: "/dashboard/proprieta", label: "Proprietà", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4", hasBadge: true },
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
        {isAdmin && <AdminRealtimeListener />}
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
                    <Link href="/dashboard/assegnazioni" className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${isActive("/dashboard/assegnazioni") ? "text-sky-600 bg-sky-50" : "text-slate-400 hover:text-slate-600"}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400"></span>
                      Assegnazioni
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

              {/* 💰 PAGAMENTI - NUOVO */}
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

              {/* Notifiche */}
              <Link
                href="/dashboard/notifiche"
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive("/dashboard/notifiche")
                    ? "text-white bg-gradient-to-r from-sky-500 to-blue-600 shadow-lg"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center relative">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </div>
                <span className="font-medium">Notifiche</span>
              </Link>

              {/* 🚨 Segnalazioni */}
              <Link
                href="/dashboard/segnalazioni"
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive("/dashboard/segnalazioni")
                    ? "text-white bg-gradient-to-r from-rose-500 to-red-600 shadow-lg shadow-rose-500/30"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isActive("/dashboard/segnalazioni") ? "bg-white/20" : ""}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <span className="font-medium">Segnalazioni</span>
              </Link>

              {/* 📊 Report */}
              <Link
                href="/dashboard/report"
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive("/dashboard/report")
                    ? "text-white bg-gradient-to-r from-violet-500 to-purple-600 shadow-lg shadow-violet-500/30"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isActive("/dashboard/report") ? "bg-white/20" : ""}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <span className="font-medium">Report</span>
              </Link>

              {/* 📈 Statistiche */}
              <Link
                href="/dashboard/statistiche"
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive("/dashboard/statistiche")
                    ? "text-white bg-gradient-to-r from-indigo-500 to-blue-600 shadow-lg shadow-indigo-500/30"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isActive("/dashboard/statistiche") ? "bg-white/20" : ""}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <span className="font-medium">Statistiche</span>
              </Link>

              {/* 🛏️ Biancheria & Dotazioni */}
              <Link
                href="/dashboard/inventario"
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  pathname === "/dashboard/inventario"
                    ? "text-white bg-gradient-to-r from-sky-500 to-blue-600 shadow-lg shadow-sky-500/30"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${pathname === "/dashboard/inventario" ? "bg-white/20" : ""}`}>
                  <span className="text-lg">🛏️</span>
                </div>
                <span className="font-medium">Biancheria</span>
              </Link>

              {/* 🧹 Prodotti Pulizia */}
              <Link
                href="/dashboard/inventario-prodotti"
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  pathname === "/dashboard/inventario-prodotti"
                    ? "text-white bg-gradient-to-r from-rose-500 to-pink-600 shadow-lg shadow-rose-500/30"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${pathname === "/dashboard/inventario-prodotti" ? "bg-white/20" : ""}`}>
                  <span className="text-lg">🧹</span>
                </div>
                <span className="font-medium">Prodotti Pulizia</span>
              </Link>

              {/* ⚙️ Impostazioni */}
              <Link
                href="/dashboard/impostazioni"
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive("/dashboard/impostazioni")
                    ? "text-white bg-gradient-to-r from-slate-500 to-slate-600 shadow-lg"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isActive("/dashboard/impostazioni") ? "bg-white/20" : ""}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <span className="font-medium">Impostazioni</span>
              </Link>

              {/* 🔄 Sync Monitor - Solo Admin */}
              {isAdmin && (
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
              )}

              {/* 👥 Approvazioni Utenti - Solo Admin */}
              {isAdmin && (
                <Link
                  href="/dashboard/approvazioni"
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                    isActive("/dashboard/approvazioni")
                      ? "text-white bg-gradient-to-r from-amber-500 to-orange-600 shadow-lg shadow-amber-500/30"
                      : "text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isActive("/dashboard/approvazioni") ? "bg-white/20" : ""}`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                  </div>
                  <span className="font-medium">Approvazioni</span>
                </Link>
              )}
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
                  {pathname === "/dashboard/impostazioni" && "Impostazioni"}
                  {pathname === "/dashboard/assegnazioni" && "Assegnazioni Pulizie"}
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
              {pathname === "/dashboard/calendario/pulizie" || pathname === "/dashboard/calendario/prenotazioni" || pathname.startsWith("/dashboard/calendario/") || pathname === "/dashboard/proprieta" || pathname.startsWith("/dashboard/proprieta/") || pathname === "/dashboard/pagamenti" ? (
                children
              ) : (
                <div className="p-8">
                  {children}
                </div>
              )}
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
      <style jsx global>{`
        html, body {
          overscroll-behavior: none;
          overflow: hidden;
          height: 100%;
          position: fixed;
          width: 100%;
        }
      `}</style>
      <div className="h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50/30 flex flex-col">
      {/* Mobile Header - Solid background */}
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
        className={`flex-1 overflow-y-auto overscroll-none pb-24 ${pathname === "/dashboard/calendario/pulizie" || pathname === "/dashboard/calendario/prenotazioni" || pathname.startsWith("/dashboard/calendario/") || pathname === "/dashboard/proprieta" || pathname.startsWith("/dashboard/proprieta/") || pathname === "/dashboard/pagamenti" ? "" : "px-4 py-4"}`}
        style={{ paddingBottom: 'calc(96px + env(safe-area-inset-bottom, 0px))' }}
      >
        {children}
      </main>

      {/* Mobile Bottom Nav - Solid background con safe area */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-2 z-50 shadow-lg shadow-slate-200/50" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex justify-around items-center max-w-lg mx-auto py-2">
          {mainMenuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center py-2 px-3 rounded-xl transition-colors ${
                isActive(item.href) ? "text-sky-600 bg-sky-50" : "text-slate-500"
              }`}
            >
              <div className="relative">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                </svg>
                {/* Badge per Proprietà in attesa */}
                {item.hasBadge && pendingCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[8px] text-white flex items-center justify-center font-bold animate-pulse">
                    {pendingCount > 9 ? "9+" : pendingCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-1 font-medium">{item.label}</span>
            </Link>
          ))}
          <button
            onClick={() => setMenuOpen(true)}
            className="flex flex-col items-center py-2 px-3 rounded-xl text-slate-500"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
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

              {/* Menu Items */}
              <div className="space-y-2">
                {/* 📦 INVENTARIO BIANCHERIA */}
                <Link href="/dashboard/inventario" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50">
                  <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center">
                    <span className="text-xl">🛏️</span>
                  </div>
                  <span className="font-medium text-slate-700">Biancheria & Dotazioni</span>
                </Link>

                {/* 🧹 INVENTARIO PRODOTTI PULIZIA */}
                <Link href="/dashboard/inventario-prodotti" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
                    <span className="text-xl">🧹</span>
                  </div>
                  <span className="font-medium text-slate-700">Prodotti Pulizia</span>
                </Link>

                <Link href="/dashboard/utenti" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50">
                  <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  </div>
                  <span className="font-medium text-slate-700">Gestione Utenti</span>
                </Link>

                <Link href="/dashboard/assegnazioni" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <span className="font-medium text-slate-700">Assegnazioni</span>
                </Link>

                <Link href="/dashboard/proprieta/pending" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50">
                  <div className="relative w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {pendingCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
                        {pendingCount > 9 ? "9+" : pendingCount}
                      </span>
                    )}
                  </div>
                  <span className="font-medium text-slate-700">Proprietà in Attesa</span>
                  {pendingCount > 0 && (
                    <span className="ml-auto bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {pendingCount}
                    </span>
                  )}
                </Link>

                {/* 💰 PAGAMENTI - NUOVO */}
                <Link href="/dashboard/pagamenti" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <span className="font-medium text-slate-700">Pagamenti</span>
                </Link>

                <Link href="/dashboard/report" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <span className="font-medium text-slate-700">Report</span>
                </Link>

                <Link href="/dashboard/statistiche" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <span className="font-medium text-slate-700">Statistiche</span>
                </Link>

                <Link href="/dashboard/notifiche" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50">
                  <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center relative">
                    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                  </div>
                  <span className="font-medium text-slate-700">Notifiche</span>
                </Link>

                {/* 🚨 Segnalazioni */}
                <Link href="/dashboard/segnalazioni" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <span className="font-medium text-slate-700">Segnalazioni</span>
                </Link>

                <Link href="/dashboard/impostazioni" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <span className="font-medium text-slate-700">Impostazioni</span>
                </Link>

                {/* Sync Monitor - Solo Admin */}
                {isAdmin && (
                  <Link href="/dashboard/admin/sync-monitor" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                      <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </div>
                    <span className="font-medium text-slate-700">Sync Monitor</span>
                  </Link>
                )}
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
