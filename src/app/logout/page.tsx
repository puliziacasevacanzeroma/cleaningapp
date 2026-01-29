"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "~/lib/firebase/AuthContext";

export default function LogoutPage() {
  const router = useRouter();
  const { logout } = useAuth();
  
  useEffect(() => {
    const performLogout = async () => {
      try {
        await logout();
        router.push("/login");
      } catch (error) {
        console.error("Errore logout:", error);
        // Fallback: redirect manuale
        window.location.href = "/login";
      }
    };

    performLogout();
  }, [logout, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="text-center bg-white p-8 rounded-2xl shadow-lg">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="animate-spin h-8 w-8 text-slate-600" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-slate-800 mb-1">Disconnessione...</h2>
        <p className="text-sm text-slate-500">Attendi un momento</p>
      </div>
    </div>
  );
}
