"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

interface AdminLayoutClientProps {
  children: React.ReactNode;
  userName: string;
}

export function AdminLayoutClient({ children, userName }: AdminLayoutClientProps) {
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(true); // Default mobile per evitare flash
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    const checkMobile = () => setIsMobile(window.innerWidth < 1280);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleLogout = () => {
    signOut({ callbackUrl: "/login" });
  };

  const mainMenuItems = [
    { href: "/admin", label: "Home", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
    { href: "/admin/calendario/pulizie", label: "Pulizie", icon: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" },
    { href: "/admin/proprieta", label: "Proprietà", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" },
    { href: "/admin/utenti/operatori", label: "Utenti", icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" },
  ];

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  };

  // Loading state
  if (!mounted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
      </div>
    );
  }

  // Mobile Layout
  if (isMobile) {
    return (
      <div className="min-h-screen bg-slate-50 pb-20">
        {/* Mobile Header */}
        <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-4 py-3 safe-area-top">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/30">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-800">CleaningApp</h1>
                <p className="text-xs text-slate-500">Admin</p>
              </div>
            </div>
            <button className="relative p-2 rounded-xl hover:bg-slate-100">
              <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="px-4 py-4">
          {children}
        </main>

        {/* Bottom Navigation */}
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-1 py-1 z-50 safe-area-bottom">
          <div className="flex justify-around items-center max-w-lg mx-auto">
            {mainMenuItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center py-2 px-2 rounded-xl transition-colors min-w-0 ${
                  isActive(item.href) ? "text-sky-600 bg-sky-50" : "text-slate-500"
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                </svg>
                <span className="text-[10px] mt-0.5 font-medium truncate">{item.label}</span>
              </Link>
            ))}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className={`flex flex-col items-center py-2 px-2 rounded-xl transition-colors ${
                menuOpen ? "text-sky-600 bg-sky-50" : "text-slate-500"
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <span className="text-[10px] mt-0.5 font-medium">Altro</span>
            </button>
          </div>
        </nav>

        {/* Slide-up Menu */}
        {menuOpen && (
          <>
            <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setMenuOpen(false)} />
            <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-50 max-h-[70vh] overflow-y-auto safe-area-bottom">
              <div className="p-4">
                <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto mb-4"></div>
                
                <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-slate-50 to-slate-100 rounded-2xl mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center shadow-md">
                    <span className="text-lg font-bold text-white">{userName.charAt(0)}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">{userName}</p>
                    <p className="text-sm text-slate-500">Amministratore</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Link href="/admin/calendario/prenotazioni" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50">
                    <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center">
                      <svg className="w-5 h-5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <span className="font-medium text-slate-700">Calendario Prenotazioni</span>
                  </Link>
                  
                  <Link href="/admin/proprieta/pending" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                      <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <span className="font-medium text-slate-700">Proprietà in Attesa</span>
                  </Link>

                  <Link href="/admin/utenti/proprietari" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                      <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                    <span className="font-medium text-slate-700">Proprietari</span>
                  </Link>
                </div>

                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 p-3 mt-4 rounded-xl text-red-600 hover:bg-red-50"
                >
                  <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </div>
                  <span className="font-medium">Esci</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // Desktop Layout
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50/30">
      <div className="flex">
        <aside className="w-64 min-h-screen bg-white/80 backdrop-blur-xl border-r border-slate-200/60 fixed">
          <div className="h-16 flex items-center px-4 border-b border-slate-200/60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/30">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <div>
                <span className="text-lg font-bold text-slate-800">CleaningApp</span>
                <p className="text-xs text-slate-400">Admin</p>
              </div>
            </div>
          </div>

          <nav className="p-3 space-y-1">
            <Link href="/admin" className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${pathname === "/admin" ? "text-white bg-gradient-to-r from-sky-500 to-blue-600 shadow-lg shadow-sky-500/30" : "text-slate-600 hover:bg-slate-50"}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span className="font-medium text-sm">Dashboard</span>
            </Link>

            <div className="pt-2">
              <button onClick={() => setExpandedMenu(expandedMenu === "calendari" ? null : "calendari")} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 hover:bg-slate-50">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="font-medium text-sm">Calendari</span>
                <svg className={`w-4 h-4 ml-auto transition-transform ${expandedMenu === "calendari" ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedMenu === "calendari" && (
                <div className="ml-4 mt-1 space-y-1 border-l-2 border-slate-200 pl-3">
                  <Link href="/admin/calendario/prenotazioni" className="block px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-50">Prenotazioni</Link>
                  <Link href="/admin/calendario/pulizie" className="block px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-50">Pulizie</Link>
                </div>
              )}
            </div>

            <div className="pt-1">
              <button onClick={() => setExpandedMenu(expandedMenu === "proprieta" ? null : "proprieta")} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 hover:bg-slate-50">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <span className="font-medium text-sm">Proprietà</span>
                <svg className={`w-4 h-4 ml-auto transition-transform ${expandedMenu === "proprieta" ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedMenu === "proprieta" && (
                <div className="ml-4 mt-1 space-y-1 border-l-2 border-slate-200 pl-3">
                  <Link href="/admin/proprieta" className="block px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-50">Attive</Link>
                  <Link href="/admin/proprieta/pending" className="block px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-50">In attesa</Link>
                </div>
              )}
            </div>

            <div className="pt-1">
              <button onClick={() => setExpandedMenu(expandedMenu === "utenti" ? null : "utenti")} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 hover:bg-slate-50">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span className="font-medium text-sm">Utenti</span>
                <svg className={`w-4 h-4 ml-auto transition-transform ${expandedMenu === "utenti" ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedMenu === "utenti" && (
                <div className="ml-4 mt-1 space-y-1 border-l-2 border-slate-200 pl-3">
                  <Link href="/admin/utenti/proprietari" className="block px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-50">Proprietari</Link>
                  <Link href="/admin/utenti/operatori" className="block px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-50">Operatori</Link>
                </div>
              )}
            </div>
          </nav>

          <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-slate-200/60">
            <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-50">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center">
                <span className="text-sm font-bold text-white">{userName.charAt(0)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{userName}</p>
                <p className="text-xs text-slate-500">Admin</p>
              </div>
              <button onClick={handleLogout} className="p-2 hover:bg-slate-200 rounded-lg">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </aside>

        <main className="flex-1 ml-64">
          <header className="h-14 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 px-4 flex items-center justify-end sticky top-0 z-30">
            <div className="flex items-center gap-2">
              <button className="relative p-2 rounded-lg hover:bg-slate-100">
                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
              </button>
            </div>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}