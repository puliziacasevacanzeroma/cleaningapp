"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "~/lib/firebase/AuthContext";
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
  // 🔄 Assume mobile su SSR - nessun flash
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.innerWidth < 768;
  });
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
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
    { href: "/operatore/pagamenti", label: "Pagamenti", icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" },
  ];

  // 🔄 Loading SOLO se non abbiamo utente e stiamo verificando
  if (!user && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (!user) return null;

  const role = user.role?.toUpperCase() || "";
  if (!["OPERATORE_PULIZIE", "OPERATORE", "OPERATOR", "ADMIN"].includes(role)) {
    router.push("/login");
    return null;
  }

  const today = new Date();
  
  // Nascondi header e bottom nav quando siamo nel wizard pulizia
  const isCleaningWizard = pathname?.includes("/operatore/pulizie/");

  // ==================== MOBILE ====================
  if (isMobile) {
    // Se siamo nel wizard pulizia, renderizza solo il contenuto senza header/footer
    if (isCleaningWizard) {
      return (
        <ToastProvider>
          <OperatoreLayoutContent user={user}>
            {children}
          </OperatoreLayoutContent>
        </ToastProvider>
      );
    }
    
    return (
      <ToastProvider>
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
          {/* Header stile Rider - Verde/Teal */}
          <div className="flex-shrink-0 bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-4 py-6 rounded-b-3xl shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-2xl">
                  🧹
                </div>
                <div>
                  <h1 className="text-xl font-bold">Ciao, {user.name?.split(" ")[0] || "Operatore"}!</h1>
                  <p className="text-white/80 text-sm">
                    {today.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <NotificationBell isAdmin={false} />
                
                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/30 active:scale-95 transition-all disabled:opacity-50"
                >
                  {loggingOut ? (
                    <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div 
            className="flex-1 overflow-y-auto overscroll-none"
            style={{ paddingBottom: 'calc(70px + env(safe-area-inset-bottom, 0px))' }}
          >
            <OperatoreLayoutContent user={user}>
              {children}
            </OperatoreLayoutContent>
          </div>

          <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 z-[100]" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            <div className="flex justify-around items-center py-2">
              {menuItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center py-2 px-4 rounded-xl transition-all ${
                    pathname === item.href 
                      ? "text-emerald-600 bg-emerald-50" 
                      : "text-slate-500 hover:text-slate-700"
                  }`}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                </svg>
                <span className="text-xs mt-1 font-medium">{item.label}</span>
              </Link>
            ))}

            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className={`flex flex-col items-center py-2 px-4 rounded-xl transition-all ${
                  menuOpen ? "text-emerald-600 bg-emerald-50" : "text-slate-500"
                }`}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                <span className="text-xs mt-1 font-medium">Menu</span>
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-[105]" onClick={() => setMenuOpen(false)} />
                  <div className="absolute bottom-full right-0 mb-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-[110]">
                    <div className="p-4 bg-gradient-to-r from-emerald-500 to-teal-600">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-white font-bold text-lg">
                          {(user.name || user.email || "O").charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-white truncate">{user.name || "Operatore"}</p>
                          <p className="text-xs text-white/80 truncate">{user.email}</p>
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
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                        )}
                        <span className="font-medium">Esci dall'account</span>
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
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="w-72 bg-white border-r border-slate-200 fixed h-full shadow-sm">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <span className="text-white text-2xl">🧹</span>
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
                  ? "bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
              </svg>
              <span className="font-medium">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3 p-3 bg-white rounded-xl mb-3 shadow-sm">
            <div className="w-11 h-11 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center text-white font-bold shadow">
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
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            )}
            <span className="font-medium">Esci dall'account</span>
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
