"use client";

import { useAuth } from "~/lib/firebase/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardLayoutClient } from "~/components/dashboard/DashboardLayoutClient";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [pendingCount, setPendingCount] = useState(0);

  // LISTENER REALTIME per contare proprietà pending
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "properties"),
      (snapshot) => {
        const count = snapshot.docs.filter(doc => {
          const data = doc.data();
          return data.status === "PENDING" || data.deactivationRequested === true;
        }).length;
        setPendingCount(count);
        console.log("🔴 Badge pending REALTIME:", count);
      },
      (error) => {
        console.error("Errore listener pending:", error);
      }
    );

    return () => unsubscribe();
  }, []);

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
      pendingPropertiesCount={pendingCount}
    >
      {children}
    </DashboardLayoutClient>
  );
}
