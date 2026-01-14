"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface ProprietarioLayoutClientProps {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
}

export function ProprietarioLayoutClient({ children, userName, userEmail }: ProprietarioLayoutClientProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({ calendari: true, proprieta: false });

  const toggleMenu = (menu: string) => setOpenMenus(prev => ({ ...prev, [menu]: !prev[menu] }));
  const getInitials = (name: string) => name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  const isActive = (path: string) => pathname === path || pathname.startsWith(path + "/");

  return (
    <div className="min-h-screen bg-slate-50">
      {/* MOBILE HEADER */}
      <header className="mobile-only fixed top-0 left-0 right-0 bg-white border-b border-slate-200 z-50" style={{display: 'none'}}>
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </div>
            <span className="font-bold text-slate-800">CleaningApp</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center">
            <span className="text-xs font-bold text-white">{getInitials(userName)}</span>
          </div>
        </div>
      </header>

      {/* DESKTOP SIDEBAR */}
      <aside className="desktop-only w-72 h-screen bg-white border-r border-slate-200 fixed flex-col" style={{display: 'none'}}>
        <div className="h-20 flex items-center px-6 border-b border-slate-200">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </div>
            <div>
              <span className="text-xl font-bold text-slate-800">CleaningApp</span>
              <p className="text-xs text-slate-400">Area Proprietario</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          <Link href="/proprietario" className={`flex items-center gap-3 px-4 py-3 rounded-xl ${pathname === "/proprietario" ? "text-white bg-gradient-to-r from-sky-500 to-blue-600" : "text-slate-500 hover:bg-slate-50"}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
            <span className="font-medium">Dashboard</span>
          </Link>
          <div className="pt-2">
            <button onClick={() => toggleMenu("calendari")} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-slate-50">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <span className="font-medium">Calendari</span>
              <svg className={`w-4 h-4 ml-auto transition-transform ${openMenus.calendari ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {openMenus.calendari && (
              <div className="ml-6 space-y-1 border-l-2 border-slate-200 pl-4">
                <Link href="/proprietario/calendario/prenotazioni" className={`flex items-center px-3 py-2 rounded-lg text-sm ${isActive("/proprietario/calendario/prenotazioni") ? "bg-sky-50 text-sky-600" : "text-slate-500"}`}>Prenotazioni</Link>
                <Link href="/proprietario/calendario/pulizie" className={`flex items-center px-3 py-2 rounded-lg text-sm ${isActive("/proprietario/calendario/pulizie") ? "bg-sky-50 text-sky-600" : "text-slate-500"}`}>Pulizie</Link>
              </div>
            )}
          </div>
          <div className="pt-2">
            <button onClick={() => toggleMenu("proprieta")} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-slate-50">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
              <span className="font-medium">Proprietà</span>
              <svg className={`w-4 h-4 ml-auto transition-transform ${openMenus.proprieta ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {openMenus.proprieta && (
              <div className="ml-6 space-y-1 border-l-2 border-slate-200 pl-4">
                <Link href="/proprietario/proprieta" className="flex items-center px-3 py-2 rounded-lg text-sm text-slate-500">Le mie proprietà</Link>
                <Link href="/proprietario/proprieta/nuova" className="flex items-center px-3 py-2 rounded-lg text-sm text-slate-500">Aggiungi nuova</Link>
              </div>
            )}
          </div>
          <Link href="/proprietario/report" className={`flex items-center gap-3 px-4 py-3 rounded-xl ${isActive("/proprietario/report") ? "text-white bg-gradient-to-r from-sky-500 to-blue-600" : "text-slate-500 hover:bg-slate-50"}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            <span className="font-medium">Report</span>
          </Link>
        </nav>
        <div className="p-4 border-t border-slate-200">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center">
              <span className="text-sm font-bold text-white">{getInitials(userName)}</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800">{userName}</p>
              <p className="text-xs text-slate-500">{userEmail}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="pt-14 pb-20 lg:pt-0 lg:pb-0 lg:ml-72">
        {children}
      </main>

      {/* MOBILE BOTTOM NAV */}
      <nav className="mobile-only-flex fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50 items-center justify-around h-16" style={{display: 'none'}}>
        <Link href="/proprietario" className={`flex flex-col items-center gap-1 px-3 py-2 ${pathname === "/proprietario" ? "text-sky-500" : "text-slate-400"}`}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
          <span className="text-xs font-medium">Home</span>
        </Link>
        <Link href="/proprietario/calendario/prenotazioni" className={`flex flex-col items-center gap-1 px-3 py-2 ${isActive("/proprietario/calendario") ? "text-sky-500" : "text-slate-400"}`}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          <span className="text-xs font-medium">Calendario</span>
        </Link>
        <Link href="/proprietario/proprieta" className={`flex flex-col items-center gap-1 px-3 py-2 ${isActive("/proprietario/proprieta") ? "text-sky-500" : "text-slate-400"}`}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
          <span className="text-xs font-medium">Proprietà</span>
        </Link>
        <Link href="/proprietario/report" className={`flex flex-col items-center gap-1 px-3 py-2 ${isActive("/proprietario/report") ? "text-sky-500" : "text-slate-400"}`}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
          <span className="text-xs font-medium">Report</span>
        </Link>
        <button onClick={() => setMobileMenuOpen(true)} className="flex flex-col items-center gap-1 px-3 py-2 text-slate-400">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          <span className="text-xs font-medium">Menu</span>
        </button>
      </nav>

      {/* MOBILE MENU */}
      {mobileMenuOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[60]" onClick={() => setMobileMenuOpen(false)} />
          <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-[70] p-6">
            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6" />
            <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl mb-6">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center">
                <span className="text-lg font-bold text-white">{getInitials(userName)}</span>
              </div>
              <div>
                <h3 className="font-bold text-slate-800">{userName}</h3>
                <p className="text-sm text-slate-500">{userEmail}</p>
              </div>
            </div>
            <a href="/logout" className="flex items-center gap-4 p-4 rounded-xl text-red-500">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              </div>
              <span className="font-medium">Logout