"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "~/lib/firebase/AuthContext";
import { ProprietarioLayoutClient } from "~/components/proprietario/ProprietarioLayoutClient";

export default function ProprietarioLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  // 🔄 Loading SOLO se non abbiamo utente e stiamo verificando
  if (!user && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const role = user.role?.toUpperCase() || "";
  if (!["PROPRIETARIO", "OWNER", "CLIENTE", "ADMIN"].includes(role)) {
    router.push("/login");
    return null;
  }

  return (
    <ProprietarioLayoutClient
      userName={user.name || "Proprietario"}
      userEmail={user.email || ""}
      userId={user.id}
    >
      {children}
    </ProprietarioLayoutClient>
  );
}
