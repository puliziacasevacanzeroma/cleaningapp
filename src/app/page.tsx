"use client";

import { useEffect } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";

export default function HomePage() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const role = user.role?.toUpperCase() || "";

    // Destinazione in base al ruolo
    let destination = "/dashboard";
    if (role === "ADMIN") {
      destination = "/dashboard";
    } else if (["PROPRIETARIO", "OWNER", "CLIENTE"].includes(role)) {
      destination = "/proprietario/calendario/pulizie";
    } else if (["OPERATORE_PULIZIE", "OPERATORE", "OPERATOR"].includes(role)) {
      destination = "/operatore";
    } else if (role === "RIDER") {
      destination = "/rider";
    } else {
      destination = "/dashboard";
    }

    // 🚀 Passa dalla splash animata (la stessa del login) anche alla riapertura
    window.location.href = `/welcome?to=${encodeURIComponent(destination)}`;
  }, [user, loading]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-cyan-500 via-sky-600 to-blue-700">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
    </div>
  );
}