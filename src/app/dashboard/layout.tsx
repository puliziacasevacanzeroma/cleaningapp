"use client";

import { useAuth } from "~/lib/firebase/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { DashboardLayoutClient } from "~/components/dashboard/DashboardLayoutClient";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    console.log("📊 Dashboard Layout - loading:", loading, "user:", user);
    
    // Aspetta che il loading sia finito
    if (loading) return;
    
    // Se non c'è utente, vai al login
    if (!user) {
      console.log("❌ Nessun utente, redirect a login");
      router.push("/login");
      return;
    }

    // Se non è admin, vai a proprietario
    const role = user.role?.toUpperCase();
    if (role !== "ADMIN") {
      console.log("❌ Non è admin, redirect a proprietario");
      router.push("/proprietario");
      return;
    }
    
    console.log("✅ Utente admin verificato");
  }, [user, loading, router]);

  // Loading state
  if (loading) {
    console.log("⏳ Loading...");
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  // Aspetta l'utente
  if (!user) {
    console.log("⏳ Aspetto utente...");
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  // Non admin
  if (user.role?.toUpperCase() !== "ADMIN") {
    return null;
  }

  return (
    <DashboardLayoutClient
      userName={user.name || "Admin"}
      userEmail={user.email || ""}
      pendingPropertiesCount={0}
    >
      {children}
    </DashboardLayoutClient>
  );
}