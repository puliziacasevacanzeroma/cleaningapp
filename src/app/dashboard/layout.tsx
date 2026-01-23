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
      },
      (error) => {
        console.error("Errore listener pending:", error);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.push("/login");
      return;
    }

    const role = user.role?.toUpperCase();
    if (role !== "ADMIN") {
      router.push("/proprietario");
      return;
    }
  }, [user, loading, router]);

  // Solo durante il check auth iniziale mostra spinner minimo
  if (loading) {
    return null; // Niente spinner - WelcomeSplash già mostrato
  }

  if (!user) {
    return null; // Redirect in corso
  }

  if (user.role?.toUpperCase() !== "ADMIN") {
    return null; // Redirect in corso
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
