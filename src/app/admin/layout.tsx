import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import Link from "next/link";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session || session.user.role !== "admin") {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50/30">
      <div className="flex">
        
        {/* Sidebar */}
        <aside className="w-72 min-h-screen bg-white/80 backdrop-blur-xl border-r border-slate-200/60 fixed">
          {/* Logo */}
          <div className="h-20 flex items-center px-6 border-b border-slate-200/60">
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
          <nav className="p-4 space-y-1">
            {/* Dashboard Active */}
            <Link href="/admin" className="flex items-center gap-3 px-4 py-3 rounded-xl text-white bg-gradient-to-r from-sky-500 to-blue-600 shadow-lg shadow-sky-500/30">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </div>
              <span className="font-medium">Dashboard</span>
            </Link>

            {/* Calendari */}
            <div className="pt-2">
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-slate-50 cursor-pointer transition-colors">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <span className="font-medium">Calendari</span>
                <svg className="w-4 h-4 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              <div className="ml-6 space-y-1 border-l-2 border-slate-200 pl-4">
                <Link href="/admin/calendario/prenotazioni" className="flex items-center px-3 py-2.5 rounded-lg text-sm text-slate-500 hover:bg-slate-50 transition-colors">
                  <span className="w-2 h-2 rounded-full bg-slate-300 mr-3"></span>Prenotazioni
                </Link>
                <Link href="/admin/calendario/pulizie" className="flex items-center px-3 py-2.5 rounded-lg text-sm text-slate-500 hover:bg-slate-50 transition-colors">
                  <span className="w-2 h-2 rounded-full bg-slate-300 mr-3"></span>Pulizie
                </Link>
              </div>
            </div>

            {/* Proprietà */}
            <div className="pt-2">
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-slate-50 cursor-pointer transition-colors">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <span className="font-medium">Proprietà</span>
                <svg className="w-4 h-4 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              <div className="ml-6 space-y-1 border-l-2 border-slate-200 pl-4">
                <Link href="/admin/proprieta" className="flex items-center px-3 py-2.5 rounded-lg text-sm text-slate-500 hover:bg-slate-50 transition-colors">
                  <span className="w-2 h-2 rounded-full bg-slate-300 mr-3"></span>Attive
                </Link>
                <Link href="/admin/proprieta/pending" className="flex items-center px-3 py-2.5 rounded-lg text-sm text-slate-500 hover:bg-slate-50 transition-colors">
                  <span className="w-2 h-2 rounded-full bg-slate-300 mr-3"></span>In attesa
                </Link>
              </div>
            </div>

            {/* Utenze */}
            <div className="pt-2">
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-slate-50 cursor-pointer transition-colors">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <span className="font-medium">Utenze</span>
                <svg className="w-4 h-4 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              <div className="ml-6 space-y-1 border-l-2 border-slate-200 pl-4">
                <Link href="/admin/utenti/proprietari" className="flex items-center px-3 py-2.5 rounded-lg text-sm text-slate-500 hover:bg-slate-50 transition-colors">
                  <span className="w-2 h-2 rounded-full bg-slate-300 mr-3"></span>Proprietari
                </Link>
                <Link href="/admin/utenti/operatori" className="flex items-center px-3 py-2.5 rounded-lg text-sm text-slate-500 hover:bg-slate-50 transition-colors">
                  <span className="w-2 h-2 rounded-full bg-slate-300 mr-3"></span>Operatori
                </Link>
              </div>
            </div>
          </nav>

          {/* User Card */}
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-200/60">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-slate-50 to-slate-100/50 border border-slate-200/60">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center shadow-md">
                <span className="text-sm font-bold text-white">{session.user.name?.charAt(0) || "A"}</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-800">{session.user.name}</p>
                <p className="text-xs text-slate-500">Amministratore</p>
              </div>
              <a href="/api/auth/signout" className="p-2 hover:bg-slate-200/50 rounded-lg transition-colors">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </a>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 ml-72">
          {/* Header */}
          <header className="h-16 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 px-6 flex items-center justify-end sticky top-0 z-30">
            <div className="flex items-center gap-3">
              <button className="relative p-2.5 rounded-xl hover:bg-slate-100 transition-colors">
                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
              </button>
              <div className="h-8 w-px bg-slate-200"></div>
              <div className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-100 cursor-pointer transition-colors">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center shadow-md">
                  <span className="text-sm font-bold text-white">{session.user.name?.charAt(0) || "A"}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{session.user.name}</p>
                  <p className="text-xs text-slate-500">Admin</p>
                </div>
              </div>
            </div>
          </header>

          {/* Page Content */}
          {children}
        </main>
      </div>
    </div>
  );
}
