"use client";

import { useAuth } from "~/lib/firebase/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardLayoutClient } from "~/components/dashboard/DashboardLayoutClient";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { pulizieStore } from "~/lib/stores/pulizieDataStore";

// Debug rimosso

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  
  // 🔄 Inizializza pendingCount a 0 (per evitare hydration mismatch)
  const [pendingCount, setPendingCount] = useState(0);

  // Carica da cache SOLO lato client
  useEffect(() => {
    try {
      const cached = localStorage.getItem("dashboard_pending_count");
      if (cached) setPendingCount(parseInt(cached));
    } catch {}
  }, []);

  // 🚀 PRE-CARICA dati pulizie subito nel layout
  // Così quando l'utente clicca "Pulizie", i dati sono GIÀ pronti in cache
  useEffect(() => {
    if (user?.id && user.role?.toUpperCase() === "ADMIN") {
      pulizieStore.start(user.id, true);
    }
  }, [user?.id, user?.role]);

  // LISTENER REALTIME per contare proprietà pending
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "properties"),
      (snapshot) => {
        const count = snapshot.docs.filter(doc => {
          const data = doc.data() as Record<string, any>;
          return data.status === "PENDING" || data.deactivationRequested === true;
        }).length;
        setPendingCount(count);
        // Salva in cache
        try { localStorage.setItem("dashboard_pending_count", String(count)); } catch {}
      },
      (error) => {
        console.error("Errore listener pending:", error);
      }
    );

    return () => unsubscribe();
  }, []);

  // Redirect logic
  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.push("/login");
      return;
    }

    const role = user.role?.toUpperCase();
    if (role !== "ADMIN") {
      router.push("/proprietario");
    }
  }, [user, loading, router]);

  // 🔄 Loading SOLO se non abbiamo utente e stiamo verificando
  if (!user && loading) {
    return null;
  }

  if (!user) {
    return null;
  }

  if (user.role?.toUpperCase() !== "ADMIN") {
    return null;
  }

  return (
    <DashboardLayoutClient
      userName={user.name || "Admin"}
      userEmail={user.email || ""}
      userRole={user.role?.toUpperCase() || "ADMIN"}
      pendingPropertiesCount={pendingCount}
    >
      {children}
    </DashboardLayoutClient>
  );
}
