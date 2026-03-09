"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PushNotificationInit } from "~/components/PushNotificationInit";
import { useAuth } from "~/lib/firebase/AuthContext";

export default function RiderLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  // 🔄 Se abbiamo l'utente (da cache o Firebase), mostra subito i children - ZERO loading!
  // Loading SOLO se NON abbiamo utente E stiamo ancora verificando
  if (!user) {
    // Se loading è in corso, aspetta (ma questo è istantaneo se c'è cache)
    if (loading) {
      return null; // Non mostrare spinner, sarà istantaneo con cache
    }
    return null;
  }

  const role = user.role?.toUpperCase() || "";
  if (!["RIDER", "ADMIN"].includes(role)) {
    router.push("/login");
    return null;
  }

  // Layout con blocco scroll/refresh come le altre pagine
  return (
    <>
      <style jsx global>{`
        html, body {
          overscroll-behavior: none;
          overflow: hidden;
          height: 100%;
          position: fixed;
          width: 100%;
        }
      `}</style>
      <PushNotificationInit />

      {children}
    </>
  );
}
