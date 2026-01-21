"use client";

import { useAuth } from "~/lib/firebase/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "~/lib/queries";
import { DashboardLayoutClient } from "~/components/dashboard/DashboardLayoutClient";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

// Funzione per caricare proprietà da Firestore DIRETTO
async function fetchPropertiesFirestore() {
  console.log("🔥 Firestore DIRETTO: prefetch proprietà...");
  const startTime = Date.now();
  
  const q = query(collection(db, "properties"), orderBy("name", "asc"));
  const snapshot = await getDocs(q);
  
  console.log(`✅ Prefetch proprietà: ${snapshot.docs.length} docs in ${Date.now() - startTime}ms`);
  
  const activeProperties: any[] = [];
  const pendingProperties: any[] = [];
  const suspendedProperties: any[] = [];
  
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    const property = {
      id: doc.id,
      ...data,
      cleaningPrice: data.cleaningPrice || 0,
      monthlyTotal: 0,
      cleaningsThisMonth: 0,
      completedThisMonth: 0,
      _count: { bookings: 0, cleanings: 0 },
      owner: { name: data.ownerName || "", email: data.ownerEmail || "" },
    };
    
    switch (data.status) {
      case "ACTIVE": activeProperties.push(property); break;
      case "PENDING": pendingProperties.push(property); break;
      case "SUSPENDED": suspendedProperties.push(property); break;
    }
  });

  return { activeProperties, pendingProperties, suspendedProperties, proprietari: [] };
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  // PRECARICA DATI AL LOGIN - FIRESTORE DIRETTO!
  useEffect(() => {
    if (user && !loading) {
      // Precarica proprietà con FIRESTORE DIRETTO (velocissimo!)
      queryClient.prefetchQuery({
        queryKey: queryKeys.properties,
        queryFn: fetchPropertiesFirestore,
        staleTime: 30 * 60 * 1000, // 30 minuti
      });

      console.log("📦 Prefetch proprietà avviato (Firestore diretto)");
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
