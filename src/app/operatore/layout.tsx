"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "~/lib/firebase/AuthContext";
import { PushNotificationInit } from "~/components/PushNotificationInit";
import { NotificationBell } from "~/components/notifications";
import { ToastProvider, useOperatoreRealtimeNotifications } from "~/components/ui/ToastNotifications";

// Componente interno che usa il listener
function OperatoreLayoutContent({ children, user }: { children: React.ReactNode; user: any }) {
  // Attiva listener toast per operatore
  useOperatoreRealtimeNotifications(user?.id || '');
  
  return <>{children}</>;
}

export default function OperatoreLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsMobile(window.innerWidth < 768);
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      router.push("/login");
    } catch (error) {
      console.error("Errore logout:", error);
      setLoggingOut(false);
    }
  };

  const menuItems = [
    { href: "/operatore", label: "Home", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  ];

  const today = new Date();

  // FIX HYDRATION
  if (!mounted) return null;

  if (!user && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
      </div>
    );
  }

  if (!user) return null;

  const role = user.role?.toUpperCase() || "";
  if (!["OPERATORE_PULIZIE", "OPERATORE", "OPERATOR", "ADMIN"].includes(role)) {
    router.push("/login");
    return null;
  }

  // Nascondi header e bottom nav quando siamo nel wizard pulizia
  const isCleaningWizard = pathname?.includes("/operatore/pulizie/");

  // ==================== MOBILE ====================
  if (isMobile) {
    // Se siamo nel wizard pulizia, renderizza solo il contenuto senza header/footer
    if (isCleaningWizard) {
      return (
        <ToastProvider>
          <OperatoreLayoutContent user={user}>
            <PushNotificationInit />
            {children}
          </OperatoreLayoutContent>
        </ToastProvider>
      );
    }
    
    return (
      <ToastProvider>
        <PushNotificationInit />
        <style jsx global>{`
          html, body {
            overscroll-behavior: none;
            overflow: hidden;
            height: 100%;
            position: fixed;
            width: 100%;
          }
        `}</style>
        <div className="h-screen bg-slate-50 flex flex-col overflow-hidden">
          {/* Header Dark Premium */}
          <div className="flex-shrink-0 bg-gradient-to-br from-slate-900 to-slate-800 text-white px-5 py-5 rounded-b-[28px] shadow-lg relative overflow-hidden">
            {/* Glow effects */}
            <div className="absolute -top-20 -right-10 w-44 h-44 bg-sky-500/10 rounded-full blur-2xl" />
            <div className="absolute -bottom-16 -left-8 w-36 h-36 bg-emerald-500/8 rounded-full blur-2xl" />
            
            <div className="flex items-center justify-between relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-400 to-sky-500 flex items-center justify-center shadow-lg shadow-sky-500/30">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-lg font-bold">Ciao, {user.name?.split(" ")[0] || "Operatore"}!</h1>
                  <p className="text-white/45 text-sm">
                    {today.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <NotificationBell isAdmin={false} />
                
                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="w-10 h-10 rounded-xl bg-white/[0.07] border border-white/[0.1] flex items-center justify-center hover:bg-white/[0.12] active:scale-95 transition-all disabled:opacity-50"
                >
                  {loggingOut ? (
                    <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                  ) : (
                    <svg className="w-5 h-5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div 
            className="flex-1 overflow-y-auto overscroll-none"
            style={{ paddingBottom: 'calc(90px + env(safe-area-inset-bottom, 0px))' }}
          >
            <OperatoreLayoutContent user={user}>
              {children}
            </OperatoreLayoutContent>
          </div>

          <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-lg border-t border-slate-200/80 px-4 z-[100]" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            <div className="flex justify-around items-center py-2">
              {menuItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center py-2 px-4 rounded-xl transition-all ${
                    pathname === item.href 
                      ? "text-sky-500 bg-sky-50" 
                      : "text-slate-500 hover:text-slate-700"
                  }`}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d={item.icon} />
                </svg>
                <span className="text-xs mt-1 font-medium">{item.label}</span>
              </Link>
            ))}

            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className={`flex flex-col items-center py-2 px-4 rounded-xl transition-all ${
                  menuOpen ? "text-sky-500 bg-sky-50" : "text-slate-500"
                }`}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                <span className="text-xs mt-1 font-medium">Menu</span>
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-[105]" onClick={() => setMenuOpen(false)} />
                  <div className="absolute bottom-full right-0 mb-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-[110]">
                    <div className="p-4 bg-gradient-to-r from-slate-800 to-slate-900">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-cyan-400 to-sky-500 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg">
                          {(user.name || user.email || "O").charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-white truncate">{user.name || "Operatore"}</p>
                          <p className="text-xs text-white/50 truncate">{user.email}</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-2">
                      <button
                        onClick={handleLogout}
                        disabled={loggingOut}
                        className="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                      >
                        {loggingOut ? (
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-500"></div>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                        )}
                        <span className="font-medium">Esci dall&apos;account</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </nav>
      </div>
      </ToastProvider>
    );
  }

  // ==================== DESKTOP ====================
  return (
    <ToastProvider>
    <PushNotificationInit />
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="w-72 bg-white border-r border-slate-200 fixed h-full shadow-sm">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center shadow-lg">
              <svg className="w-7 h-7 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">CleaningApp</h1>
              <p className="text-sm text-slate-500">Area Operatore</p>
            </div>
          </div>
        </div>

        <nav className="p-4 space-y-2">
          {menuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all ${
                pathname === item.href
                  ? "bg-gradient-to-r from-slate-800 to-slate-900 text-white shadow-lg"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d={item.icon} />
              </svg>
              <span className="font-medium">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3 p-3 bg-white rounded-xl mb-3 shadow-sm">
            <div className="w-11 h-11 bg-gradient-to-br from-slate-800 to-slate-900 rounded-full flex items-center justify-center text-white font-bold shadow">
              {(user.name || user.email || "O").charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800 truncate">{user.name || "Operatore"}</p>
              <p className="text-xs text-slate-500 truncate">{user.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 text-red-600 hover:bg-red-50 rounded-xl transition-colors border border-red-100"
          >
            {loggingOut ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-500"></div>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            )}
            <span className="font-medium">Esci dall&apos;account</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 ml-72">
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-lg border-b border-slate-200 px-8 py-4 flex items-center justify-between">
          <div></div>
          <NotificationBell isAdmin={false} />
        </header>
        <OperatoreLayoutContent user={user}>
          {children}
        </OperatoreLayoutContent>
      </main>
    </div>
    </ToastProvider>
  );
}
