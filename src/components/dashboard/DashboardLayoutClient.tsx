"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface DashboardLayoutClientProps {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
  userRole?: string;
}

export function DashboardLayoutClient({ children, userName, userEmail, userRole = "Admin" }: DashboardLayoutClientProps) {
  const pathname = usePathname();
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({
    calendari: true,
    proprieta: false,
    utenti: true
  });

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

  return (
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
                <div className="ml-6 space-y-1 border-l-2 border-slate-200 pl-4">
                  <Link href="/dashboard/calendario/prenotazioni" className={`flex items-center px-3 py-2.5 rounded-lg text-sm transition-colors ${isActive("/dashboard/calendario/prenotazioni") ? "bg-sky-50 text-sky-600" : "text-slate-500 hover:bg-slate-50"}`}>
                    <span className={`w-2 h-2 rounded-full mr-3 ${isActive("/dashboard/calendario/prenotazioni") ? "bg-sky-500" : "bg-slate-300"}`}></span>Prenotazioni
                  </Link>
                  <Link href="/dashboard/calendario/pulizie" className={`flex items-center px-3 py-2.5 rounded-lg text-sm transition-colors ${isActive("/dashboard/calendario/pulizie") ? "bg-sky-50 text-sky-600" : "text-slate-500 hover:bg-slate-50"}`}>
                    <span className={`w-2 h-2 rounded-full mr-3 ${isActive("/dashboard/calendario/pulizie") ? "bg-sky-500" : "bg-slate-300"}`}></span>Pulizie
                  </Link>
                </div>
              )}
            </div>

            {/* Proprietà */}
            <div className="pt-2">
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
                <svg className={`w-4 h-4 ml-auto transition-transform ${openMenus.proprieta ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {openMenus.proprieta && (
                <div className="ml-6 space-y-1 border-l-2 border-slate-200 pl-4">
                  <Link href="/dashboard/proprieta" className={`flex items-center px-3 py-2.5 rounded-lg text-sm transition-colors ${isActive("/dashboard/proprieta") && !pathname.includes("pending") ? "bg-sky-50 text-sky-600" : "text-slate-500 hover:bg-slate-50"}`}>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 mr-3"></span>Attive
                  </Link>
                  <Link href="/dashboard/proprieta/pending" className={`flex items-center px-3 py-2.5 rounded-lg text-sm transition-colors ${isActive("/dashboard/proprieta/pending") ? "bg-sky-50 text-sky-600" : "text-slate-500 hover:bg-slate-50"}`}>
                    <span className="w-2 h-2 rounded-full bg-amber-400 mr-3"></span>In attesa
                  </Link>
                </div>
              )}
            </div>

            {/* Utenti */}
            <div className="pt-2">
              <button
                onClick={() => toggleMenu("utenti")}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-slate-50 cursor-pointer transition-colors"
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <span className="font-medium">Utenti</span>
                <svg className={`w-4 h-4 ml-auto transition-transform ${openMenus.utenti ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {openMenus.utenti && (
                <div className="ml-6 space-y-1 border-l-2 border-slate-200 pl-4">
                  <Link href="/dashboard/utenti/operatori" className={`flex items-center px-3 py-2.5 rounded-lg text-sm transition-colors ${isActive("/dashboard/utenti/operatori") ? "bg-sky-50 text-sky-600" : "text-slate-500 hover:bg-slate-50"}`}>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 mr-3"></span>Operatori
                  </Link>
                  <Link href="/dashboard/utenti/proprietari" className={`flex items-center px-3 py-2.5 rounded-lg text-sm transition-colors ${isActive("/dashboard/utenti/proprietari") ? "bg-sky-50 text-sky-600" : "text-slate-500 hover:bg-slate-50"}`}>
                    <span className="w-2 h-2 rounded-full bg-violet-400 mr-3"></span>Proprietari
                  </Link>
                  <Link href="/dashboard/utenti/admin" className={`flex items-center px-3 py-2.5 rounded-lg text-sm transition-colors ${isActive("/dashboard/utenti/admin") ? "bg-sky-50 text-sky-600" : "text-slate-500 hover:bg-slate-50"}`}>
                    <span className="w-2 h-2 rounded-full bg-amber-400 mr-3"></span>Admin
                  </Link>
                  <Link href="/dashboard/utenti/rider" className={`flex items-center px-3 py-2.5 rounded-lg text-sm transition-colors ${isActive("/dashboard/utenti/rider") ? "bg-sky-50 text-sky-600" : "text-slate-500 hover:bg-slate-50"}`}>
                    <span className="w-2 h-2 rounded-full bg-sky-400 mr-3"></span>Rider
                  </Link>
                </div>
              )}
            </div>

            {/* Report */}
            <div className="pt-2">
              <Link
                href="/dashboard/report"
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive("/dashboard/report")
                    ? "text-white bg-gradient-to-r from-sky-500 to-blue-600 shadow-lg shadow-sky-500/30"
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
            </div>

            {/* Impostazioni */}
            <div className="pt-2">
              <Link
                href="/dashboard/impostazioni"
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive("/dashboard/impostazioni")
                    ? "text-white bg-gradient-to-r from-sky-500 to-blue-600 shadow-lg shadow-sky-500/30"
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
            </div>
          </nav>

          {/* Notifiche Button */}
          <div className="px-4 pb-2 flex-shrink-0">
            <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-slate-50 transition-colors relative">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br from-rose-100 to-pink-100">
                <svg className="w-5 h-5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <span className="font-medium">Notifiche</span>
              <span className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center animate-pulse">3</span>
            </button>
          </div>

          {/* User Card con Ruolo */}
          <div className="p-4 border-t border-slate-200/60 flex-shrink-0">
            <div className="p-3 rounded-xl bg-gradient-to-r from-slate-50 to-slate-100/50 border border-slate-200/60">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
                  <span className="text-sm font-bold text-white">{getInitials(userName)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{userName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold bg-gradient-to-r ${roleBadge.bg} ${roleBadge.text}`}>
                      {roleBadge.label}
                    </span>
                  </div>
                </div>
                <a href="/api/auth/signout" className="p-2.5 hover:bg-red-50 rounded-lg transition-colors group" title="Logout">
                  <svg className="w-5 h-5 text-slate-400 group-hover:text-red-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content - SENZA HEADER */}
        <main className="flex-1 ml-72 h-screen overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
