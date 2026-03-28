"use client";

import { useAuth } from "~/lib/firebase/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LavanderiaLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    const role = user.role?.toUpperCase();
    if (role !== "LAVANDERIA" && role !== "ADMIN") {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (!user && loading) return null;
  if (!user) return null;

  const role = user.role?.toUpperCase();
  if (role !== "LAVANDERIA" && role !== "ADMIN") return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-slate-200/60 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)' }}>
              <span className="text-lg">🧺</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">CleaningApp</h1>
              <p className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wide">Lavanderia</p>
            </div>
          </div>
          <button
            onClick={async () => { await logout(); router.push("/login"); }}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors text-sm font-medium text-slate-600"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Esci
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}
