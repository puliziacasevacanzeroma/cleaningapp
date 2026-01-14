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
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({
    calendari: true,
    proprieta: false
  });

  const toggleMenu = (menu: string) => {
    setOpenMenus(prev => ({ ...prev, [menu]: !prev[menu] }));
  };

  const getInitials = (name: string) => {
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + "/");

  return (
    <>
      {/* MOBILE LAYOUT */}
      <div style={{ display: 'block' }} className="lg:hidden min-h-screen bg-slate-50">
        <header className="fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-b border-slate-200/60 z-50">
          <div className="flex items-center justify-between px-4 h-14">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/25">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <span className="font-bold text-slate-800">CleaningApp</span>
            </div>
            <div className="flex items-center gap-2">
              <button className="relative p-2 rounded-xl hover:bg-slate-100">
                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
              </button>
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center">
                <span className="text-xs font-bold text-white">{getInitials(userName)}</span>
              </div>
            </div>
          </div>
        </header>

        <main className="pt-14 pb-20">{children}</main>

        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50">
          <div className="flex items-center justify-around h-16 px-2">
            <Link href="/proprietario" className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl ${pathname === "/proprietario" ? "bg-sky-50" : ""}`}>
              <svg className={`w-6 h-6 ${pathname === "/proprietario" ? "text-sky-500" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span className={`text-xs font-medium ${pathname === "/proprietario" ? "text-sky-600" : "text-slate-400"}`}>Home</span>
            </Link>

            <Link href="/proprietario/calendario/prenotazioni" className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl ${isActive("/proprietario/calendario") ? "bg-sky-50" : ""}`}>
              <svg className={`w-6 h-6 ${isActive("/proprietario/calendario") ? "text-sky-500" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className={`text-xs font-medium ${isActive("/proprietario/calendario") ? "text-sky-600" : "text-slate-400"}`}>Calendario</span>
            </Link>

            <Link href="/proprietario/proprieta" className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl ${isActive("/proprietario/proprieta") ? "bg-sky-50" : ""}`}>
              <svg className={`w-6 h-6 ${isActive("/proprietario/proprieta") ? "text-sky-500" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <span className={`text-xs font-medium ${isActive("/proprietario/proprieta") ? "text-sky-600" : "text-slate-400"}`}>Proprietà</span>
            </Link>

            <Link href="/proprietario/report" className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl ${isActive("/proprietario/report") ? "bg-sky-50" : ""}`}>
              <svg className={`w-6 h-6 ${isActive("/proprietario/report") ? "text-sky-500" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span className={`text-xs font-medium ${isActive("/proprietario/report") ? "text-sky-600" : "text-slate-400"}`}>Report</span>
            </Link>

            <button onClick={() => setMobileMenuOpen(true)} className="flex flex-col items-center gap-1 px-3 py-2">
              <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <span className="text-xs font-medium text-slate-400">Menu</span>
            </button>
          </div>
        </nav>

        {mobileMenuOpen && <div className="fixed inset-0 bg-black/50 z-[60]" onClick={() => setMobileMenuOpen(false)} />}

        <div className={`fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-[70] transform transition-transform duration-300 ${mobileMenuOpen ? "translate-y-0" : "translate-y-full"}`}>
          <div className="p-6 max-h-[80vh] overflow-y-auto">
            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6" onClick={() => setMobileMenuOpen(false)}></div>
            
            <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl mb-6">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center shadow-lg">
                <span className="text-lg font-bold text-white">{getInitials(userName)}</span>
              </div>
              <div>
                <h3 className="font-bold text-slate-800">{userName}</h3>
                <p className="text-sm text-slate-500">{userEmail}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Link href="/proprietario/calendario/prenotazioni" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-4 p-4 rounded-xl hover:bg-slate-50">
                <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center">
                  <svg className="w-5 h-5 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-slate-800">Calendario Prenotazioni</p>
                  <p className="text-sm text-slate-500">Visualizza le prenotazioni</p>
                </div>
              </Link>
              
              <Link href="/proprietario/calendario/pulizie" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-4 p-4 rounded-xl hover:bg-slate-50">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-slate-800">Calendario Pulizie</p>
                  <p className="text-sm text-slate-500">Gestisci le pulizie</p>
                </div>
              </Link>

              <Link href="/proprietario/proprieta/nuova" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-4 p-4 rounded-xl hover:bg-slate-50">
                <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
                  <svg className="w-5 h-5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-slate-800">Aggiungi Proprietà</p>
                  <p className="text-sm text-slate-500">Inserisci una nuova proprietà</p>
                </div>
              </Link>

              <div className="border-t border-slate-100 my-4"></div>

              <a href="/logout" className="flex items-center gap-4 p-4 rounded-xl hover:bg-red-50 text-red-500">
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                  <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </div>
                <p className="font-medium">Logout</p>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* DESKTOP LAYOUT */}
      <div style={{ display: 'none' }} className="hidden lg:block h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-sky-50/30">
        <div className="flex h-full">
          <aside className="w-72 h-screen bg-white/80 backdrop-blur-xl border-r border-slate-200/60 fixed flex flex-col">
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
                  <p className="text-xs text-slate-400 font-medium">Area Proprietario</p>
                </div>
              </div>
            </div>

            <nav className="flex-1 overflow-y-auto p-4 space-y-1">
              <Link href="/proprietario" className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${pathname === "/proprietario" ? "text-white bg-gradient-to-r from-sky-500 to-blue-600 shadow-lg shadow-sky-500/30" : "text-slate-500 hover:bg-slate-50"}`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${pathname === "/proprietario" ? "bg-white/20" : ""}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                </div>
                <span className="font-medium">Dashboard</span>
              </Link>

              <div className="pt-2">
                <button onClick={() => toggleMenu("calendari")} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-slate-50 cursor-pointer">
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
                    <Link href="/proprietario/calendario/prenotazioni" className={`flex items-center px-3 py-2.5 rounded-lg text-sm ${isActive("/proprietario/calendario/prenotazioni") ? "bg-sky-50 text-sky-600" : "text-slate-500 hover:bg-slate-50"}`}>
                      <span className={`w-2 h-2 rounded-full mr-3 ${isActive("/proprietario/calendario/prenotazioni") ? "bg-sky-500" : "bg-slate-300"}`}></span>Prenotazioni
                    </Link>
                    <Link href="/proprietario/calendario/pulizie" className={`flex items-center px-3 py-2.5 rounded-lg text-sm ${isActive("/proprietario/calendario/pulizie") ? "bg-sky-50 text-sky-600" : "text-slate-500 hover:bg-slate-50"}`}>
                      <span className={`w-2 h-2 rounded-full mr-3 ${isActive("/proprietario/calendario/pulizie") ? "bg-sky-500" : "bg-slate-300"}`}></span>Pulizie
                    </Link>
                  </div>
                )}
              </div>

              <div className="pt-2">
                <button onClick={() => toggleMenu("proprieta")} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-slate-50 cursor-pointer">
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
                    <Link href="/proprietario/proprieta" className={`flex items-center px-3 py-2.5 rounded-lg text-sm ${isActive("/proprietario/proprieta") && !pathname.includes("nuova") ? "bg-sky-50 text-sky-600" : "text-slate-500 hover:bg-slate-50"}`}>
                      <span className="w-2 h-2 rounded-full bg-emerald-400 mr-3"></span>Le mie proprietà
                    </Link>
                    <Link href="/proprietario/proprieta/nuova" className={`flex items-center px-3 py-2.5 rounded-lg text-sm ${isActive("/proprietario/proprieta/nuova") ? "bg-sky-50 text-sky-600" : "text-slate-500 hover:bg-slate-50"}`}>
                      <span className="w-2 h-2 rounded-full bg-sky-400 mr-3"></span>Aggiungi nuova
                    </Link>
                  </div>
                )}
              </div>

              <div className="pt-2">
                <Link href="/proprietario/report" className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive("/proprietario/report") ? "text-white bg-gradient-to-r from-sky-500 to-blue-600 shadow-lg shadow-sky-500/30" : "text-slate-500 hover:bg-slate-50"}`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isActive("/proprietario/report") ? "bg-white/20" : ""}`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <span className="font-medium">Report</span>
                </Link>
              </div>
            </nav>

            <div className="p-4 border-t border-slate-200/60 flex-shrink-0">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-slate-50 to-slate-100/50 border border-slate-200/60">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center shadow-md">
                  <span className="text-sm font-bold text-white">{getInitials(userName)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{userName}</p>
                  <p className="text-xs text-slate-500 truncate">{userEmail}</p>
                </div>
                <a href="/logout" className="p-2 hover:bg-slate-200/50 rounded-lg" title="Logout">
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </a>
              </div>
            </div>
          </aside>

          <main className="flex-1 ml-72 h-screen overflow-y-auto overflow-x-hidden">
            <header className="h-16 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 px-6 flex items-center justify-end sticky top-0 z-30">
              <div className="flex items-center gap-3">
                <button className="relative p-2.5 rounded-xl hover:bg-slate-100">
                  <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
                </button>
                <div className="h-8 w-px bg-slate-200"></div>
                <div className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-100 cursor-pointer">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center shadow-md">
                    <span className="text-sm font-bold text-white">{getInitials(userName)}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{userName}</p>
                    <p className="text-xs text-slate-500">Proprietario</p>
                  </div>
                </div>
              </div>
            </header>
            {children}
          </main>
        </div>
      </div>
    </>
  );
}