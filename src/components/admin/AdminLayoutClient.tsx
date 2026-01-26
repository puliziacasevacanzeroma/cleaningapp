"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "~/lib/firebase/AuthContext";
import { NotificationBell } from "~/components/notifications";
import { ToastProvider, useAdminRealtimeNotifications } from "~/components/ui/ToastNotifications";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

// Componente che attiva i listener realtime
function RealtimeNotificationListener() {
  useAdminRealtimeNotifications();
  return null;
}

// ============================================
// PROPS
// ============================================
interface AdminLayoutClientProps {
  children: React.ReactNode;
  userName: string;
}

// ============================================
// MAIN COMPONENT
// ============================================
export function AdminLayoutClient({ children, userName }: AdminLayoutClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  const [windowWidth, setWindowWidth] = useState<number>(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [issuesCount, setIssuesCount] = useState(0);

  useEffect(() => {
    const checkDesktop = () => {
      const width = window.innerWidth;
      setWindowWidth(width);
      setIsDesktop(width >= 1024);
      console.log("DEBUG: width =", width, "isDesktop =", width >= 1024);
    };
    
    checkDesktop();
    window.addEventListener("resize", checkDesktop);
    
    return () => window.removeEventListener("resize", checkDesktop);
  }, []);

  // Listener realtime per contare proprietà PENDING o con richiesta disattivazione
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "properties"),
      (snapshot) => {
        const pending = snapshot.docs.filter(doc => {
          const data = doc.data();
          // Conta: nuove proprietà PENDING + richieste disattivazione
          return data.status === "PENDING" || data.deactivationRequested === true;
        }).length;
        setPendingCount(pending);
        console.log("📊 Proprietà pending/richieste disattivazione:", pending);
      },
      (error) => {
        console.error("Errore listener proprietà pending:", error);
      }
    );

    return () => unsubscribe();
  }, []);

  // Listener realtime per contare segnalazioni aperte
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "issues"),
      (snapshot) => {
        const open = snapshot.docs.filter(doc => {
          const data = doc.data();
          return data.status !== "resolved";
        }).length;
        setIssuesCount(open);
      },
      (error) => {
        console.error("Errore listener issues:", error);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  const mainMenuItems = [
    { href: "/admin", label: "Home", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
    { href: "/admin/calendario/pulizie", label: "Pulizie", icon: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" },
    { href: "/dashboard/proprieta", label: "Proprietà", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4", hasBadge: true },
    { href: "/admin/utenti/operatori", label: "Utenti", icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" },
  ];

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  };

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
        justifyContent: "center",
        flexDirection: "column"
      }}>
        <div style={{
          width: "40px",
          height: "40px",
          border: "3px solid #e2e8f0",
          borderTopColor: "#0ea5e9",
          borderRadius: "50%",
          animation: "spin 1s linear infinite"
        }} />
        <p style={{ marginTop: "20px", color: "#64748b" }}>Loading... isDesktop = null</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ============================================
  // DESKTOP LAYOUT
  // ============================================
  if (isDesktop === true) {
    return (
      <ToastProvider>
        <RealtimeNotificationListener />
        <div className="min-h-screen bg-slate-50">
        {/* DESKTOP SIDEBAR */}
        <aside className="w-64 min-h-screen bg-white border-r border-slate-200 fixed">
          <div className="h-16 flex items-center px-4 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-600 flex items-center justify-center shadow-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <div>
                <span className="text-lg font-bold text-slate-800">CleaningApp</span>
                <p className="text-xs text-slate-400">Gestionale Pro</p>
              </div>
            </div>
          </div>

          <nav className="p-3 space-y-1">
            <Link href="/admin" className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${pathname === "/admin" ? "text-white bg-gradient-to-r from-sky-500 to-blue-600 shadow-lg" : "text-slate-600 hover:bg-slate-50"}`}>
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
                {pendingCount > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                    {pendingCount}
                  </span>
                )}
                <svg className={`w-4 h-4 ${pendingCount > 0 ? '' : 'ml-auto'} transition-transform ${expandedMenu === "proprieta" ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedMenu === "proprieta" && (
                <div className="ml-4 mt-1 space-y-1 border-l-2 border-slate-200 pl-3">
                  <Link href="/dashboard/proprieta" className="block px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-50">Attive</Link>
                  <Link href="/dashboard/proprieta/pending" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-50">
                    In attesa
                    {pendingCount > 0 && (
                      <span className="bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                        {pendingCount}
                      </span>
                    )}
                  </Link>
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

            {/* Link Segnalazioni */}
            <Link 
              href="/admin/segnalazioni" 
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                pathname.startsWith('/admin/segnalazioni') 
                  ? "text-white bg-gradient-to-r from-rose-500 to-orange-500 shadow-lg" 
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="font-medium text-sm">Segnalazioni</span>
              {issuesCount > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                  {issuesCount}
                </span>
              )}
            </Link>
          </nav>

          <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-slate-200">
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

        {/* MAIN CONTENT DESKTOP */}
        <main className="ml-64">
          <header className="h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-end sticky top-0 z-30">
            <NotificationBell isAdmin={true} />
          </header>
          <div className="p-4">
            {children}
          </div>
        </main>
      </div>
      </ToastProvider>
    );
  }

  // ============================================
  // MOBILE LAYOUT (isDesktop === false)
  // ============================================
  return (
    <ToastProvider>
      <RealtimeNotificationListener />
      <div className="min-h-screen bg-slate-50">
      
      {/* MOBILE HEADER */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-600 flex items-center justify-center shadow-lg">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">CleaningApp</h1>
              <p className="text-xs text-slate-500">Admin - MOBILE</p>
            </div>
          </div>
          <NotificationBell isAdmin={true} />
        </div>
      </header>

      {/* MAIN CONTENT MOBILE */}
      <main className="pb-20" style={{ paddingTop: "50px" }}>
        <div className="p-4">
          {children}
        </div>
      </main>

      {/* MOBILE BOTTOM NAV */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-1 py-1 z-50">
        <div className="flex justify-around items-center max-w-lg mx-auto">
          {mainMenuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center py-2 px-2 rounded-xl transition-colors min-w-0 ${
                isActive(item.href) ? "text-sky-600 bg-sky-50" : "text-slate-500"
              }`}
            >
              <div className="relative">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                </svg>
                {item.hasBadge && pendingCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
                    {pendingCount > 9 ? "9+" : pendingCount}
                  </span>
                )}
              </div>
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

      {/* MOBILE SLIDE-UP MENU */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setMenuOpen(false)} />
          <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-50 max-h-[70vh] overflow-y-auto">
            <div className="p-4">
              <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto mb-4"></div>

              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center">
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

                <Link href="/dashboard/proprieta/pending" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50">
                  <div className="relative w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {pendingCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full">
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

                <Link href="/admin/utenti/proprietari" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <span className="font-medium text-slate-700">Proprietari</span>
                </Link>

                <Link href="/admin/segnalazioni" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50">
                  <div className="relative w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    {issuesCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full">
                        {issuesCount > 9 ? "9+" : issuesCount}
                      </span>
                    )}
                  </div>
                  <span className="font-medium text-slate-700">Segnalazioni</span>
                  {issuesCount > 0 && (
                    <span className="ml-auto bg-rose-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {issuesCount}
                    </span>
                  )}
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
    </ToastProvider>
  );
}
