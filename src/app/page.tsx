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
    
    if (role === "ADMIN") {
      window.location.href = "/dashboard";
    } else if (["PROPRIETARIO", "OWNER", "CLIENTE"].includes(role)) {
      window.location.href = "/proprietario";
    } else if (["OPERATORE_PULIZIE", "OPERATORE", "OPERATOR"].includes(role)) {
      window.location.href = "/operatore";
    } else if (role === "RIDER") {
      window.location.href = "/rider";
    } else {
      window.location.href = "/dashboard";
    }
  }, [user, loading]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
    </div>
  );
}