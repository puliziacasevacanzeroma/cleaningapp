"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "~/lib/firebase/AuthContext";

interface SidebarProps {
  user: { name?: string | null; email?: string | null; role?: string };
  notifications?: { pendingProperties?: number; pendingUsers?: number; pendingOrders?: number };
}

export default function Sidebar({ user, notifications = {} }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const [calendariOpen, setCalendariOpen] = useState(pathname.includes("calendario"));
  const [proprietaOpen, setProprietaOpen] = useState(pathname.includes("proprieta"));
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = user.role === "admin";
  const isActive = (href: string) => pathname === href;
  
  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <>
      <button onClick={() => setMobileOpen(!mobileOpen)} className="lg:hidden fixed top-4 left-4 z-50 p-2.5 bg-white rounded-xl shadow-lg border border-slate-200">
        <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
      </button>
      {mobileOpen && <div className="lg:hidden fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40" onClick={() => setMobileOpen(false)} />}
      <aside className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-72 bg-white border-r border-slate-200 flex flex-col transition-transform duration-300 ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className="p-6 border-b border-slate-100">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/30">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent">CleaningApp</h1>
              <p className="text-xs text-slate-400">Gestionale Pulizie</p>
            </div>
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          <Link href="/dashboard" onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${isActive("/dashboard") ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/30" : "text-slate-600 hover:bg-slate-50"}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>
            Dashboard
          </Link>
          <div>
            <button onClick={() => setCalendariOpen(!calendariOpen)} className="w-full flex items-center justify-between px-4 py-3 rounded-xl font-medium text-slate-600 hover:bg-slate-50">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
                Calendari
              </div>
              <svg className={`w-4 h-4 transition-transform ${calendariOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
            </button>
            {calendariOpen && (
              <div className="pl-12 pr-4 py-2 space-y-1">
                <Link href="/dashboard/calendario-prenotazioni" onClick={() => setMobileOpen(false)} className={`block px-4 py-2.5 rounded-lg text-sm font-medium ${isActive("/dashboard/calendario-prenotazioni") ? "bg-sky-500 text-white" : "text-slate-500 hover:bg-slate-100"}`}>Prenotazioni</Link>
                <Link href="/dashboard/calendario-pulizie" onClick={() => setMobileOpen(false)} className={`block px-4 py-2.5 rounded-lg text-sm font-medium ${isActive("/dashboard/calendario-pulizie") ? "bg-sky-500 text-white" : "text-slate-500 hover:bg-slate-100"}`}>Pulizie</Link>
              </div>
            )}
          </div>
          <div>
            <button onClick={() => setProprietaOpen(!proprietaOpen)} className="w-full flex items-center justify-between px-4 py-3 rounded-xl font-medium text-slate-600 hover:bg-slate-50">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" /></svg>
                Proprietà
                {(notifications.pendingProperties ?? 0) > 0 && <span className="px-2 py-0.5 bg-rose-500 text-white text-xs font-bold rounded-full">{notifications.pendingProperties}</span>}
              </div>
              <svg className={`w-4 h-4 transition-transform ${proprietaOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
            </button>
            {proprietaOpen && (
              <div className="pl-12 pr-4 py-2 space-y-1">
                <Link href="/dashboard/proprieta" onClick={() => setMobileOpen(false)} className={`block px-4 py-2.5 rounded-lg text-sm font-medium ${isActive("/dashboard/proprieta") ? "bg-sky-500 text-white" : "text-slate-500 hover:bg-slate-100"}`}>Attive</Link>
                <Link href="/dashboard/proprieta/pending" onClick={() => setMobileOpen(false)} className={`flex items-center justify-between px-4 py-2.5 rounded-lg text-sm font-medium ${isActive("/dashboard/proprieta/pending") ? "bg-sky-500 text-white" : "text-slate-500 hover:bg-slate-100"}`}>
                  In attesa
                  {(notifications.pendingProperties ?? 0) > 0 && <span className="px-2 py-0.5 bg-rose-500 text-white text-xs font-bold rounded-full">{notifications.pendingProperties}</span>}
                </Link>
              </div>
            )}
          </div>
          {isAdmin && (
            <>
              <Link href="/dashboard/proprietari" onClick={() => setMobileOpen(false)} className={`flex items-center justify-between px-4 py-3 rounded-xl font-medium ${isActive("/dashboard/proprietari") ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg" : "text-slate-600 hover:bg-slate-50"}`}>
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
                  Proprietari
                </div>
                {(notifications.pendingUsers ?? 0) > 0 && <span className="px-2 py-0.5 bg-rose-500 text-white text-xs font-bold rounded-full">{notifications.pendingUsers}</span>}
              </Link>
              <Link href="/dashboard/operatori" onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium ${isActive("/dashboard/operatori") ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg" : "text-slate-600 hover:bg-slate-50"}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
                Operatori
              </Link>
              <Link href="/dashboard/biancheria" onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium ${isActive("/dashboard/biancheria") ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg" : "text-slate-600 hover:bg-slate-50"}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v14.25a.75.75 0 01-.75.75h-6a.75.75 0 01-.75-.75V6z" /></svg>
                Biancheria
              </Link>
              <Link href="/dashboard/prodotti" onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium ${isActive("/dashboard/prodotti") ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg" : "text-slate-600 hover:bg-slate-50"}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                Prodotti
              </Link>
              <Link href="/dashboard/ordini" onClick={() => setMobileOpen(false)} className={`flex items-center justify-between px-4 py-3 rounded-xl font-medium ${isActive("/dashboard/ordini") ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg" : "text-slate-600 hover:bg-slate-50"}`}>
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>
                  Ordini
                </div>
                {(notifications.pendingOrders ?? 0) > 0 && <span className="px-2 py-0.5 bg-rose-500 text-white text-xs font-bold rounded-full">{notifications.pendingOrders}</span>}
              </Link>
            </>
          )}
          <Link href="/dashboard/report" onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium ${isActive("/dashboard/report") ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg" : "text-slate-600 hover:bg-slate-50"}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
            Report
          </Link>
          <Link href="/dashboard/impostazioni" onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium ${isActive("/dashboard/impostazioni") ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg" : "text-slate-600 hover:bg-slate-50"}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            Impostazioni
          </Link>
          {isAdmin && (
            <Link href="/dashboard/admin/sync-monitor" onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium ${isActive("/dashboard/admin/sync-monitor") ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg" : "text-slate-600 hover:bg-slate-50"}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
              Sync Monitor
            </Link>
          )}
        </nav>
        <div className="p-4 border-t border-slate-100">
          <div className="p-4 bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md">
                <span className="text-sm font-bold text-white">{user.name?.split(" ").map((n) => n[0]).join("").toUpperCase() || "U"}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 truncate">{user.name || "Utente"}</p>
                <p className="text-xs text-slate-500 truncate">{user.email}</p>
              </div>
            </div>
            <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white rounded-xl text-slate-600 font-medium hover:bg-slate-50 hover:text-rose-600 border border-slate-200 transition-all">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" /></svg>
              Esci
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
