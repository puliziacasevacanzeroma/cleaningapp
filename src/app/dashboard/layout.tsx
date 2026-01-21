"use client";

import { useAuth } from "~/lib/firebase/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "~/lib/queries";
import { DashboardLayoutClient } from "~/components/dashboard/DashboardLayoutClient";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  // PRECARICA DATI AL LOGIN
  useEffect(() => {
    if (user && !loading) {
      // Precarica inventario
      queryClient.prefetchQuery({
        queryKey: queryKeys.inventory,
        queryFn: async () => {
          const res = await fetch("/api/inventory/list");
          return res.json();
        },
        staleTime: 5 * 60 * 1000,
      });

      // Precarica proprietà
      queryClient.prefetchQuery({
        queryKey: queryKeys.properties,
        queryFn: async () => {
          const res = await fetch("/api/properties/list");
          return res.json();
        },
        staleTime: 5 * 60 * 1000,
      });

      console.log("📦 Dati precaricati in cache (inventario + proprietà)");
    }
  }, [user, loading, queryClient]);

  useEffect(() => {
    console.log("📊 Dashboard Layout - loading:", loading, "user:", user);

    if (loading) return;

    if (!user) {
      console.log("❌ Nessun utente, redirect a login");
      router.push("/login");
      return;
    }

    const role = user.role?.toUpperCase();
    if (role !== "ADMIN") {
      console.log("❌ Non è admin, redirect a proprietario");
      router.push("/proprietario");
      return;
    }

    console.log("✅ Utente admin verificato");
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  if (user.role?.toUpperCase() !== "ADMIN") {
    return null;
  }

  return (
    <DashboardLayoutClient
      userName={user.name || "Admin"}
      userEmail={user.email || ""}
      userRole={user.role?.toUpperCase() || "ADMIN"}
      pendingPropertiesCount={0}
    >
      {children}
    </DashboardLayoutClient>
  );
}
