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

  // Menu items configuration
  const menuItems = [
    { 
      href: "/dashboard", 
      label: "Dashboard", 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
      exact: true,
      color: "sky"
    },
    { 
      href: "/dashboard/calendario/pulizie", 
      label: "Pulizie", 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
      ),
      color: "emerald"
    },
    { 
      href: "/dashboard/calendario/prenotazioni", 
      label: "Prenotazioni", 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      color: "blue"
    },
    { 
      href: "/dashboard/proprieta", 
      label: "Proprietà", 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
      badge: pendingCount,
      color: "amber"
    },
    { 
      href: "/dashboard/assegnazioni", 
      label: "Assegnazioni", 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      color: "violet"
    },
    { 
      href: "/dashboard/pagamenti", 
      label: "Pagamenti", 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: "emerald"
    },
    { 
      href: "/dashboard/utenti", 
      label: "Utenti", 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
      color: "violet"
    },
    { 
      href: "/dashboard/inventario", 
      label: "Biancheria", 
      icon: <span className="text-lg">🛏️</span>,
      color: "sky"
    },
    { 
      href: "/dashboard/inventario-prodotti", 
      label: "Prodotti", 
      icon: <span className="text-lg">🧹</span>,
      color: "rose"
    },
    { 
      href: "/dashboard/report", 
      label: "Report", 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      color: "blue"
    },
    { 
      href: "/dashboard/notifiche", 
      label: "Notifiche", 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      ),
      color: "red"
    },
    { 
      href: "/dashboard/impostazioni", 
      label: "Impostazioni", 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      color: "slate"
    },
  ];

  // Add Sync Monitor for admin
  if (isAdmin) {
    menuItems.push({ 
      href: "/dashboard/admin/sync-monitor", 
      label: "Sync Monitor", 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ),
      color: "emerald"
    });
  }

  const getColorClasses = (color: string, isActiveItem: boolean) => {
    if (isActiveItem) {
      const activeColors: Record<string, string> = {
        sky: "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/25",
        emerald: "bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25",
        blue: "bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/25",
        amber: "bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/25",
        violet: "bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-500/25",
        red: "bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-lg shadow-red-500/25",
        rose: "bg-gradient-to-r from-rose-500 to-pink-600 text-white shadow-lg shadow-rose-500/25",
        slate: "bg-gradient-to-r from-slate-500 to-slate-600 text-white shadow-lg shadow-slate-500/25",
      };
      return activeColors[color] || activeColors.sky;
    }
    return "text-slate-600 hover:bg-slate-50";
  };

  const getIconBgColor = (color: string, isActiveItem: boolean) => {
    if (isActiveItem) return "bg-white/20";
    const bgColors: Record<string, string> = {
      sky: "bg-sky-50",
      emerald: "bg-emerald-50",
      blue: "bg-blue-50",
      amber: "bg-amber-50",
      violet: "bg-violet-50",
      red: "bg-red-50",
      rose: "bg-rose-50",
      slate: "bg-slate-100",
    };
    return bgColors[color] || "bg-slate-100";
  };

  const getIconColor = (color: string, isActiveItem: boolean) => {
    if (isActiveItem) return "text-white";
    const iconColors: Record<string, string> = {
      sky: "text-sky-500",
      emerald: "text-emerald-500",
      blue: "text-blue-500",
      amber: "text-amber-500",
      violet: "text-violet-500",
      red: "text-red-500",
      rose: "text-rose-500",
      slate: "text-slate-500",
    };
    return iconColors[color] || "text-slate-500";
  };

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
    return "Dashboard";
  };

  // ============================================
  // DESKTOP LAYOUT - COLLAPSABLE SIDEBAR
  // ============================================
  if (isDesktop) {
    return (
      <ToastProvider>
        {isAdmin && <AdminRealtimeListener />}
        <div className="h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-sky-50/30">
          <div className="flex h-full">
            
            {/* Sidebar Collapsabile */}
            <aside 
              className="h-screen bg-white/90 backdrop-blur-xl border-r border-slate-200/60 fixed flex flex-col z-30 transition-all duration-300 ease-in-out"
              style={{ width: sidebarExpanded ? '280px' : '72px' }}
              onMouseEnter={() => setSidebarExpanded(true)}
              onMouseLeave={() => setSidebarExpanded(false)}
            >
              {/* Logo */}
              <div className="h-16 flex items-center px-4 border-b border-slate-200/60 flex-shrink-0 overflow-hidden">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/30 flex-shrink-0">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                  </div>
                  <div 
                    className="overflow-hidden transition-all duration-300"
                    style={{ 
                      width: sidebarExpanded ? 'auto' : '0px',
                      opacity: sidebarExpanded ? 1 : 0 
                    }}
                  >
                    <span className="text-lg font-bold text-slate-800 whitespace-nowrap">CleaningApp</span>
                    <p className="text-xs text-slate-400 whitespace-nowrap">Gestionale Pro</p>
                  </div>
                </div>
              </div>

              {/* Navigation */}
              <nav className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-1">
                {menuItems.map((item) => {
                  const itemIsActive = item.exact 
                    ? pathname === item.href 
                    : isActive(item.href);
                  
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 ${getColorClasses(item.color, itemIsActive)}`}
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${getIconBgColor(item.color, itemIsActive)}`}>
                        <span className={getIconColor(item.color, itemIsActive)}>
                          {item.icon}
                        </span>
                      </div>
                      <span 
                        className="font-medium whitespace-nowrap overflow-hidden transition-all duration-300"
                        style={{ 
                          width: sidebarExpanded ? 'auto' : '0px',
                          opacity: sidebarExpanded ? 1 : 0 
                        }}
                      >
                        {item.label}
                      </span>
                      {item.badge && item.badge > 0 && (
                        <>
                          {/* Badge su icona (visibile quando chiuso) */}
                          {!sidebarExpanded && (
                            <span className="absolute top-1 right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
                              {item.badge > 9 ? "9+" : item.badge}
                            </span>
                          )}
                          {/* Badge inline (visibile quando aperto) */}
                          {sidebarExpanded && (
                            <span className="ml-auto bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                    </Link>
                  );
                })}
              </nav>

              {/* User Profile */}
              <div className="p-3 border-t border-slate-200/60 flex-shrink-0">
                <button 
                  onClick={handleLogout} 
                  className="w-full flex items-center gap-3 p-2 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors overflow-hidden"
                >
                  <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${roleBadge.bg} flex items-center justify-center shadow-lg flex-shrink-0`}>
                    <span className="text-sm font-bold text-white">{getInitials(userName)}</span>
                  </div>
                  <div 
                    className="flex-1 min-w-0 text-left overflow-hidden transition-all duration-300"
                    style={{ 
                      width: sidebarExpanded ? 'auto' : '0px',
                      opacity: sidebarExpanded ? 1 : 0 
                    }}
                  >
                    <p className="text-sm font-semibold text-slate-700 truncate">{userName}</p>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gradient-to-r ${roleBadge.bg} ${roleBadge.text}`}>
                      {roleBadge.label}
                    </span>
                  </div>
                  <svg 
                    className="w-4 h-4 text-slate-400 flex-shrink-0 transition-all duration-300"
                    style={{ 
                      opacity: sidebarExpanded ? 1 : 0,
                      width: sidebarExpanded ? '16px' : '0px'
                    }}
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>
            </aside>

            {/* Main Content */}
            <div 
              className="flex-1 h-screen flex flex-col transition-all duration-300"
              style={{ marginLeft: sidebarExpanded ? '280px' : '72px' }}
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
            <div className="fixed inset-y-0 right-0 w-80 bg-white shadow-2xl z-50 flex flex-col animate-slide-in-right">
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

              {/* Menu Items */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {menuItems.map((item) => (
                  <Link 
                    key={item.href}
                    href={item.href} 
                    onClick={() => setMenuOpen(false)} 
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50"
                  >
                    <div className={`w-10 h-10 rounded-xl ${getIconBgColor(item.color, false)} flex items-center justify-center`}>
                      <span className={getIconColor(item.color, false)}>{item.icon}</span>
                    </div>
                    <span className="font-medium text-slate-700">{item.label}</span>
                    {item.badge && item.badge > 0 && (
                      <span className="ml-auto bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                ))}
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
