"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "~/lib/firebase/AuthContext";

export default function RiderLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  if (!user) {
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
      {children}
    </>
  );
}
