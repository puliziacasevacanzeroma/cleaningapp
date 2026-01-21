"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { ToastProvider, useProprietarioRealtimeNotifications } from "~/components/ui/ToastNotifications";
import { NotificationBell } from "~/components/notifications";

interface ProprietarioLayoutClientProps {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
  userId?: string;
}

// Componente separato per listener proprietario
function ProprietarioRealtimeListener({ userId }: { userId: string }) {
  // Il nuovo listener usa direttamente userId, non serve più cercare le proprietà
  useProprietarioRealtimeNotifications(userId, []);
  return null;
}

export function ProprietarioLayoutClient({ children, userName, userEmail, userId }: ProprietarioLayoutClientProps) {
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const menuItems = [
    { href: "/proprietario", label: "Dashboard", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
    { href: "/proprietario/proprieta", label: "Proprietà", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" },
    { href: "/proprietario/calendario/prenotazioni", label: "Prenotazioni", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
    { href: "/proprietario/calendario/pulizie", label: "Pulizie", icon: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" },
  ];

  const handleLogout = () => {
    const baseUrl = window.location.origin;
    signOut({ callbackUrl: `${baseUrl}/login` });
  };

  if (isMobile) {
    return (
      <ToastProvider>
        {userId && <ProprietarioRealtimeListener userId={userId} />}
        <div className="min-h-screen bg-slate-50 pb-20">
          {/* Header con campanella */}
          <div className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-slate-800">CleaningApp</h1>
              <p className="text-xs text-slate-500">Area Proprietario</p>
            </div>
            <NotificationBell isAdmin={false} />
          </div>
        {children}
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-2 py-2 z-50">
          <div className="flex justify-around items-center">
            {menuItems.map((item) => (
              <Link key={item.href} href={item.href} className={`flex flex-col items-center py-2 px-2 rounded-xl ${pathname === item.href ? "text-sky-600 bg-sky-50" : "text-slate-500"}`}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                </svg>
                <span className="text-xs mt-1">{item.label}</span>
              </Link>
            ))}
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className={`flex flex-col items-center py-2 px-2 rounded-xl ${menuOpen ? "text-sky-600 bg-sky-50" : "text-slate-500"}`}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                <span className="text-xs mt-1">Menu</span>
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute bottom-full right-0 mb-2 w-48 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden z-50">
                    <div className="p-3 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-sky-500 rounded-full flex items-center justify-center text-white font-bold">
                          {userName.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-800 truncate text-sm">{userName}</p>
                          <p className="text-xs text-slate-500 truncate">{userEmail}</p>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      <span className="font-medium">Esci</span>
                    </button>
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

  return (
    <ToastProvider>
      {userId && <ProprietarioRealtimeListener userId={userId} />}
      <div className="min-h-screen bg-slate-50 flex">
      <aside className="w-64 bg-white border-r border-slate-200 p-4 fixed h-full">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-slate-800">CleaningApp</h1>
          <p className="text-sm text-slate-500">Area Proprietario</p>
        </div>
        <nav className="space-y-2">
          {menuItems.map((item) => (
            <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${pathname === item.href ? "bg-sky-50 text-sky-600" : "text-slate-600 hover:bg-slate-50"}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
              </svg>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="absolute bottom-4 left-4 right-4">
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl mb-2">
            <div className="w-10 h-10 bg-sky-500 rounded-full flex items-center justify-center text-white font-bold">
              {userName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-800 truncate">{userName}</p>
              <p className="text-xs text-slate-500 truncate">{userEmail}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="font-medium">Esci</span>
          </button>
        </div>
      </aside>
      <main className="flex-1 ml-64">
        {/* Header con campanella */}
        <div className="sticky top-0 z-30 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-end">
          <NotificationBell isAdmin={false} />
        </div>
        {children}
      </main>
    </div>
    </ToastProvider>
  );
}
