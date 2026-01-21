"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotificationBell } from "~/components/notifications";
import { ToastProvider, useAdminRealtimeNotifications } from "~/components/ui/ToastNotifications";
import { useQueryClient } from "@tanstack/react-query";

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

export function DashboardLayoutClient({ children, userName, userEmail, userRole = "Admin" }: DashboardLayoutClientProps) {
  const pathname = usePathname();
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({
    calendari: true,
    proprieta: false,
    utenti: true
  });
  
  const queryClient = useQueryClient();

  // Check screen size
  useEffect(() => {
    const checkDesktop = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    
    checkDesktop();
    window.addEventListener("resize", checkDesktop);
    
    return () => window.removeEventListener("resize", checkDesktop);
  }, []);

  // Legge il contatore pending dalla cache di React Query (NESSUNA QUERY EXTRA!)
  useEffect(() => {
    const updatePendingCount = () => {
      // Legge i dati già in cache dal prefetch
      const cachedData = queryClient.getQueryData<any>(["properties"]);
      if (cachedData?.pendingProperties) {
        setPendingCount(cachedData.pendingProperties.length);
        console.log("📊 Pending da cache:", cachedData.pendingProperties.length);
      }
    };
    
    // Aggiorna subito
    updatePendingCount();
    
    // Sottoscrivi ai cambiamenti della cache
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event?.query?.queryKey?.[0] === "properties") {
        updatePendingCount();
      }
    });
    
    return () => unsubscribe();
  }, [queryClient]);

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
  // LOADING
  // ============================================
  if (isDesktop === null) {
    return (
      <div style={{ 
        minHeight: "100vh", 
        backgroundColor: "#f8fafc", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center" 
      }}>
        <div style={{
          width: "40px",
          height: "40px",
          border: "3px solid #e2e8f0",
          borderTopColor: "#0ea5e9",
          borderRadius: "50%",
          animation: "spin 1s linear infinite"
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ============================================
  // DESKTOP LAYOUT
  // ============================================
  const isAdmin = userRole === 'ADMIN';
  
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
            </nav>

            {/* User section */}
            <div className="p-4 border-t border-slate-200/60 flex-shrink-0">
              <Link href="/api/auth/signout" className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${roleBadge.bg} flex items-center justify-center shadow-lg`}>
                  <span className="text-sm font-bold text-white">{getInitials(userName)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-700 truncate">{userName}</p>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gradient-to-r ${roleBadge.bg} ${roleBadge.text}`}>
                    {roleBadge.label}
                  </span>
                </div>
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </Link>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 ml-72 h-screen overflow-y-auto">
            <div className="p-8">
              {children}
            </div>
          </main>
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50/30">
      {/* Mobile Header - Solid background */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm px-4 py-3">
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

      {/* Main Content Mobile */}
      <main className="pb-20 px-4 py-4">
        {children}
      </main>

      {/* Mobile Bottom Nav - Solid background */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-2 py-2 z-50 shadow-lg shadow-slate-200/50">
        <div className="flex justify-around items-center max-w-lg mx-auto">
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
                <Link href="/dashboard/inventario" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50">
                  <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center">
                    <span className="text-xl">📦</span>
                  </div>
                  <span className="font-medium text-slate-700">Inventario</span>
                </Link>

                <Link href="/dashboard/utenti" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50">
                  <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  </div>
                  <span className="font-medium text-slate-700">Gestione Utenti</span>
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

                <Link href="/dashboard/report" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <span className="font-medium text-slate-700">Report</span>
                </Link>

                <Link href="/dashboard/notifiche" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50">
                  <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center relative">
                    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                  </div>
                  <span className="font-medium text-slate-700">Notifiche</span>
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
