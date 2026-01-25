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
  const [isDesktop, setIsDesktop] = useState<boolean>(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(pendingPropertiesCount);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({
    calendari: true,
    proprieta: false,
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

  // Check screen size
  useEffect(() => {
    setIsDesktop(window.innerWidth >= 1024);
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
  const isAdmin = userRole === 'ADMIN';

  const getPageTitle = () => {
    if (pathname === "/dashboard") return "Dashboard";
    if (pathname.includes("/calendario/pulizie")) return "Calendario Pulizie";
    if (pathname.includes("/calendario/prenotazioni")) return "Calendario Prenotazioni";
    if (pathname === "/dashboard/proprieta") return "Proprietà";
    if (pathname.includes("/proprieta/pending")) return "Proprietà in Attesa";
    if (pathname.includes("/proprieta/") && !pathname.includes("/pending")) return "Dettaglio Proprietà";
    if (pathname === "/dashboard/pagamenti") return "Pagamenti";
    if (pathname === "/dashboard/inventario") return "Biancheria & Dotazioni";
    if (pathname === "/dashboard/inventario-prodotti") return "Prodotti Pulizia";
    if (pathname === "/dashboard/utenti") return "Gestione Utenti";
    if (pathname === "/dashboard/assegnazioni") return "Assegnazioni Pulizie";
    if (pathname === "/dashboard/notifiche") return "Notifiche";
    if (pathname === "/dashboard/report") return "Report";
    if (pathname === "/dashboard/impostazioni") return "Impostazioni";
    if (pathname.includes("/sync-monitor")) return "Sync Monitor";
    if (pathname === "/dashboard/approvazioni") return "Approvazioni Utenti";
    return "Dashboard";
  };

  // Tooltip component per sidebar chiusa
  const Tooltip = ({ children, label }: { children: React.ReactNode; label: string }) => (
    <div className="relative group/tooltip">
      {children}
      {!sidebarExpanded && (
        <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-slate-800 text-white text-sm font-medium rounded-lg whitespace-nowrap opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-200 z-50 shadow-lg">
          {label}
          <div className="absolute right-full top-1/2 -translate-y-1/2 border-[6px] border-transparent border-r-slate-800" />
        </div>
      )}
    </div>
  );

  // ============================================
  // DESKTOP LAYOUT - SIDEBAR COLLAPSABILE
  // ============================================
  if (isDesktop) {
    return (
      <ToastProvider>
        {isAdmin && <AdminRealtimeListener />}
        
        {/* CSS per animazioni fluide */}
        <style jsx global>{`
          .sidebar-transition {
            transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          }
          .content-transition {
            transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          }
          .fade-in {
            animation: fadeIn 0.2s ease-out forwards;
          }
          .fade-out {
            animation: fadeOut 0.15s ease-out forwards;
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateX(-8px); }
            to { opacity: 1; transform: translateX(0); }
          }
          @keyframes fadeOut {
            from { opacity: 1; transform: translateX(0); }
            to { opacity: 0; transform: translateX(-8px); }
          }
          .submenu-enter {
            animation: submenuEnter 0.25s ease-out forwards;
          }
          @keyframes submenuEnter {
            from { opacity: 0; height: 0; }
            to { opacity: 1; height: auto; }
          }
        `}</style>

        <div className="h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-sky-50/30">
          <div className="flex h-full">
            
            {/* Sidebar Collapsabile */}
            <aside 
              className="sidebar-transition h-screen bg-white/95 backdrop-blur-xl border-r border-slate-200/60 fixed flex flex-col z-30 overflow-hidden"
              style={{ width: sidebarExpanded ? '272px' : '72px' }}
              onMouseEnter={() => setSidebarExpanded(true)}
              onMouseLeave={() => setSidebarExpanded(false)}
            >
              {/* Logo */}
              <div className="h-16 flex items-center px-4 border-b border-slate-200/60 flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/30 flex-shrink-0">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                  </div>
                  {sidebarExpanded && (
                    <div className="fade-in overflow-hidden">
                      <span className="text-lg font-bold text-slate-800 whitespace-nowrap">CleaningApp</span>
                      <p className="text-xs text-slate-400 whitespace-nowrap">Gestionale Pro</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Navigation */}
              <nav className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-1">
                
                {/* Dashboard */}
                <Tooltip label="Dashboard">
                  <Link
                    href="/dashboard"
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                      pathname === "/dashboard"
                        ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/25"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${pathname === "/dashboard" ? "bg-white/20" : "bg-sky-50"}`}>
                      <svg className={`w-5 h-5 ${pathname === "/dashboard" ? "text-white" : "text-sky-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                      </svg>
                    </div>
                    {sidebarExpanded && <span className="font-medium fade-in whitespace-nowrap">Dashboard</span>}
                  </Link>
                </Tooltip>

                {/* Calendari - Sottomenu */}
                <div className="pt-1">
                  <Tooltip label="Calendari">
                    <button
                      onClick={() => sidebarExpanded && toggleMenu("calendari")}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 transition-all duration-200"
                    >
                      <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      {sidebarExpanded && (
                        <>
                          <span className="font-medium fade-in whitespace-nowrap">Calendari</span>
                          <svg className={`w-4 h-4 ml-auto transition-transform duration-200 ${openMenus.calendari ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </>
                      )}
                    </button>
                  </Tooltip>
                  
                  {/* Sottomenu Calendari */}
                  {sidebarExpanded && openMenus.calendari && (
                    <div className="ml-6 mt-1 space-y-0.5 border-l-2 border-slate-100 pl-4 submenu-enter">
                      <Link 
                        href="/dashboard/calendario/prenotazioni" 
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                          isActive("/dashboard/calendario/prenotazioni") ? "text-sky-600 bg-sky-50 font-medium" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                        Prenotazioni
                      </Link>
                      <Link 
                        href="/dashboard/calendario/pulizie" 
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                          isActive("/dashboard/calendario/pulizie") ? "text-emerald-600 bg-emerald-50 font-medium" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Pulizie
                      </Link>
                      <Link 
                        href="/dashboard/assegnazioni" 
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                          isActive("/dashboard/assegnazioni") ? "text-violet-600 bg-violet-50 font-medium" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                        Assegnazioni
                      </Link>
                    </div>
                  )}
                </div>

                {/* Proprietà - Sottomenu */}
                <div>
                  <Tooltip label={`Proprietà${pendingCount > 0 ? ` (${pendingCount})` : ''}`}>
                    <button
                      onClick={() => sidebarExpanded && toggleMenu("proprieta")}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 transition-all duration-200"
                    >
                      <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0 relative">
                        <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        {/* Badge su icona quando sidebar chiusa */}
                        {!sidebarExpanded && pendingCount > 0 && (
                          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold shadow-sm">
                            {pendingCount > 9 ? "9+" : pendingCount}
                          </span>
                        )}
                      </div>
                      {sidebarExpanded && (
                        <>
                          <span className="font-medium fade-in whitespace-nowrap">Proprietà</span>
                          {pendingCount > 0 && (
                            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                              {pendingCount}
                            </span>
                          )}
                          <svg className={`w-4 h-4 ${pendingCount > 0 ? '' : 'ml-auto'} transition-transform duration-200 ${openMenus.proprieta ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </>
                      )}
                    </button>
                  </Tooltip>
                  
                  {/* Sottomenu Proprietà */}
                  {sidebarExpanded && openMenus.proprieta && (
                    <div className="ml-6 mt-1 space-y-0.5 border-l-2 border-slate-100 pl-4 submenu-enter">
                      <Link 
                        href="/dashboard/proprieta" 
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                          pathname === "/dashboard/proprieta" ? "text-emerald-600 bg-emerald-50 font-medium" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Attive
                      </Link>
                      <Link 
                        href="/dashboard/proprieta/pending" 
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                          isActive("/dashboard/proprieta/pending") ? "text-amber-600 bg-amber-50 font-medium" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        In attesa
                        {pendingCount > 0 && (
                          <span className="ml-auto bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                            {pendingCount}
                          </span>
                        )}
                      </Link>
                    </div>
                  )}
                </div>

                {/* Pagamenti */}
                <Tooltip label="Pagamenti">
                  <Link
                    href="/dashboard/pagamenti"
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                      isActive("/dashboard/pagamenti")
                        ? "bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${isActive("/dashboard/pagamenti") ? "bg-white/20" : "bg-emerald-50"}`}>
                      <svg className={`w-5 h-5 ${isActive("/dashboard/pagamenti") ? "text-white" : "text-emerald-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    {sidebarExpanded && <span className="font-medium fade-in whitespace-nowrap">Pagamenti</span>}
                  </Link>
                </Tooltip>

                {/* Notifiche */}
                <Tooltip label="Notifiche">
                  <Link
                    href="/dashboard/notifiche"
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                      isActive("/dashboard/notifiche")
                        ? "bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-lg shadow-red-500/25"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${isActive("/dashboard/notifiche") ? "bg-white/20" : "bg-red-50"}`}>
                      <svg className={`w-5 h-5 ${isActive("/dashboard/notifiche") ? "text-white" : "text-red-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                    </div>
                    {sidebarExpanded && <span className="font-medium fade-in whitespace-nowrap">Notifiche</span>}
                  </Link>
                </Tooltip>

                {/* Report */}
                <Tooltip label="Report">
                  <Link
                    href="/dashboard/report"
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                      isActive("/dashboard/report")
                        ? "bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-500/25"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${isActive("/dashboard/report") ? "bg-white/20" : "bg-violet-50"}`}>
                      <svg className={`w-5 h-5 ${isActive("/dashboard/report") ? "text-white" : "text-violet-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    {sidebarExpanded && <span className="font-medium fade-in whitespace-nowrap">Report</span>}
                  </Link>
                </Tooltip>

                {/* Biancheria */}
                <Tooltip label="Biancheria">
                  <Link
                    href="/dashboard/inventario"
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                      pathname === "/dashboard/inventario"
                        ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/25"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${pathname === "/dashboard/inventario" ? "bg-white/20" : "bg-sky-50"}`}>
                      <span className="text-lg">🛏️</span>
                    </div>
                    {sidebarExpanded && <span className="font-medium fade-in whitespace-nowrap">Biancheria</span>}
                  </Link>
                </Tooltip>

                {/* Prodotti Pulizia */}
                <Tooltip label="Prodotti Pulizia">
                  <Link
                    href="/dashboard/inventario-prodotti"
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                      pathname === "/dashboard/inventario-prodotti"
                        ? "bg-gradient-to-r from-rose-500 to-pink-600 text-white shadow-lg shadow-rose-500/25"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${pathname === "/dashboard/inventario-prodotti" ? "bg-white/20" : "bg-rose-50"}`}>
                      <span className="text-lg">🧹</span>
                    </div>
                    {sidebarExpanded && <span className="font-medium fade-in whitespace-nowrap">Prodotti Pulizia</span>}
                  </Link>
                </Tooltip>

                {/* Impostazioni */}
                <Tooltip label="Impostazioni">
                  <Link
                    href="/dashboard/impostazioni"
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                      isActive("/dashboard/impostazioni")
                        ? "bg-gradient-to-r from-slate-500 to-slate-600 text-white shadow-lg shadow-slate-500/25"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${isActive("/dashboard/impostazioni") ? "bg-white/20" : "bg-slate-100"}`}>
                      <svg className={`w-5 h-5 ${isActive("/dashboard/impostazioni") ? "text-white" : "text-slate-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    {sidebarExpanded && <span className="font-medium fade-in whitespace-nowrap">Impostazioni</span>}
                  </Link>
                </Tooltip>

                {/* Sync Monitor - Solo Admin */}
                {isAdmin && (
                  <Tooltip label="Sync Monitor">
                    <Link
                      href="/dashboard/admin/sync-monitor"
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                        pathname.includes("/sync-monitor")
                          ? "bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${pathname.includes("/sync-monitor") ? "bg-white/20" : "bg-emerald-50"}`}>
                        <svg className={`w-5 h-5 ${pathname.includes("/sync-monitor") ? "text-white" : "text-emerald-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </div>
                      {sidebarExpanded && <span className="font-medium fade-in whitespace-nowrap">Sync Monitor</span>}
                    </Link>
                  </Tooltip>
                )}

                {/* Approvazioni - Solo Admin */}
                {isAdmin && (
                  <Tooltip label="Approvazioni">
                    <Link
                      href="/dashboard/approvazioni"
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                        isActive("/dashboard/approvazioni")
                          ? "bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/25"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${isActive("/dashboard/approvazioni") ? "bg-white/20" : "bg-amber-50"}`}>
                        <svg className={`w-5 h-5 ${isActive("/dashboard/approvazioni") ? "text-white" : "text-amber-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                        </svg>
                      </div>
                      {sidebarExpanded && <span className="font-medium fade-in whitespace-nowrap">Approvazioni</span>}
                    </Link>
                  </Tooltip>
                )}
              </nav>

              {/* User Profile */}
              <div className="p-3 border-t border-slate-200/60 flex-shrink-0">
                <Tooltip label={`${userName} - Esci`}>
                  <button 
                    onClick={handleLogout} 
                    className="w-full flex items-center gap-3 p-2 rounded-xl bg-slate-50 hover:bg-slate-100 transition-all duration-200"
                  >
                    <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${roleBadge.bg} flex items-center justify-center shadow-md flex-shrink-0`}>
                      <span className="text-sm font-bold text-white">{getInitials(userName)}</span>
                    </div>
                    {sidebarExpanded && (
                      <div className="flex-1 min-w-0 text-left fade-in">
                        <p className="text-sm font-semibold text-slate-700 truncate">{userName}</p>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gradient-to-r ${roleBadge.bg} ${roleBadge.text}`}>
                          {roleBadge.label}
                        </span>
                      </div>
                    )}
                    {sidebarExpanded && (
                      <svg className="w-4 h-4 text-slate-400 flex-shrink-0 fade-in" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                    )}
                  </button>
                </Tooltip>
              </div>
            </aside>

            {/* Main Content */}
            <div 
              className="content-transition flex-1 h-screen flex flex-col"
              style={{ marginLeft: sidebarExpanded ? '272px' : '72px' }}
            >
              {/* Header Minimale */}
              <header className="h-14 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 px-6 flex items-center justify-between flex-shrink-0">
                <h2 className="text-lg font-semibold text-slate-700">
                  {getPageTitle()}
                </h2>
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
                {pathname === "/dashboard/calendario/pulizie" || 
                 pathname === "/dashboard/calendario/prenotazioni" || 
                 pathname.startsWith("/dashboard/calendario/") || 
                 pathname === "/dashboard/proprieta" || 
                 pathname.startsWith("/dashboard/proprieta/") || 
                 pathname === "/dashboard/pagamenti" ? (
                  children
                ) : (
                  <div className="p-6">
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
  // MOBILE LAYOUT (invariato)
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
      <div className="h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50/30 flex flex-col overflow-hidden">
        {/* Mobile Header */}
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

        {/* Mobile Content */}
        <main className="flex-1 overflow-y-auto overscroll-contain">
          {children}
        </main>

        {/* Bottom Navigation Mobile */}
        <nav className="bg-white border-t border-slate-200 px-2 py-2 flex-shrink-0">
          <div className="flex justify-around items-center">
            {[
              { href: "/dashboard", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6", label: "Home" },
              { href: "/dashboard/calendario/pulizie", icon: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z", label: "Pulizie" },
              { href: "/dashboard/proprieta", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4", label: "Proprietà", badge: pendingCount },
              { href: "/dashboard/calendario/prenotazioni", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z", label: "Calendario" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all ${
                  (item.href === "/dashboard" ? pathname === "/dashboard" : isActive(item.href))
                    ? "text-sky-600 bg-sky-50"
                    : "text-slate-500"
                }`}
              >
                <div className="relative">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                  </svg>
                  {item.badge && item.badge > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
                      {item.badge > 9 ? "9+" : item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            ))}
            <button
              onClick={() => setMenuOpen(true)}
              className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-slate-500"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <span className="text-[10px] font-medium">Menu</span>
            </button>
          </div>
        </nav>

        {/* Mobile Menu Overlay */}
        {menuOpen && (
          <>
            <div 
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
              onClick={() => setMenuOpen(false)}
            />
            <div className="fixed inset-y-0 right-0 w-80 bg-white shadow-2xl z-50 flex flex-col">
              {/* Menu Header */}
              <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${roleBadge.bg} flex items-center justify-center shadow-lg`}>
                    <span className="text-lg font-bold text-white">{getInitials(userName)}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">{userName}</p>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-gradient-to-r ${roleBadge.bg} ${roleBadge.text}`}>
                      {roleBadge.label}
                    </span>
                  </div>
                </div>
                <button 
                  onClick={() => setMenuOpen(false)}
                  className="p-2 rounded-lg hover:bg-slate-100"
                >
                  <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Menu Items Mobile */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                <Link href="/dashboard/inventario" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50">
                  <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center">
                    <span className="text-xl">🛏️</span>
                  </div>
                  <span className="font-medium text-slate-700">Biancheria & Dotazioni</span>
                </Link>

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

                <Link href="/dashboard/notifiche" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50">
                  <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
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
              <div className="p-4 border-t border-slate-200">
                <Link
                  href="/logout"
                  className="w-full flex items-center gap-3 p-3 rounded-xl text-red-600 hover:bg-red-50"
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
