"use client";

import { useAuth } from "~/lib/firebase/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardLayoutClient } from "~/components/dashboard/DashboardLayoutClient";
import { collection, onSnapshot, query, where } from "firebase/firestore";
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

  // 🚀 PRE-CARICA dati pulizie — ma SENZA competere col caricamento della home.
  // Prima partiva immediatamente al mount del layout: i suoi 5 listener (incl.
  // 12 mesi di pulizie + ordini) saturavano la connessione Firestore in parallelo
  // ai dati critici della dashboard, contribuendo ai ~10s di attesa.
  // Ora lo avviamo quando il browser è "idle" (dopo il primo paint e dopo che i
  // dati della home hanno iniziato ad arrivare): la navigazione verso "Pulizie"
  // resta istantanea, ma l'apertura della home non paga più questo costo.
  useEffect(() => {
    if (!(user?.id && user.role?.toUpperCase() === "ADMIN")) return;

    const uid = user.id;
    let cancelled = false;
    const startPreload = () => {
      if (!cancelled) pulizieStore.start(uid, true);
    };

    const w = window as any;
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (typeof w.requestIdleCallback === "function") {
      idleId = w.requestIdleCallback(startPreload, { timeout: 3000 });
    } else {
      timeoutId = setTimeout(startPreload, 1200);
    }

    return () => {
      cancelled = true;
      if (idleId !== undefined && typeof w.cancelIdleCallback === "function") {
        w.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [user?.id, user?.role]);

  // LISTENER REALTIME per contare proprietà pending
  // 🚀 PERF (14/05/2026): filtra server-side status != ACTIVE invece di scaricare tutte
  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(
        collection(db, "properties"),
        where("status", "in", ["PENDING", "DEACTIVATION_REQUESTED", "SUSPENDED"])
      ),
      (snapshot) => {
        // Filtra ulteriormente per status PENDING o deactivationRequested
        const count = snapshot.docs.filter(doc => {
          const data = doc.data() as Record<string, any>;
          return data.status === "PENDING" || data.deactivationRequested === true;
        }).length;
        setPendingCount(count);
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
