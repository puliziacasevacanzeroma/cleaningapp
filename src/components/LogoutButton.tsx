"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "~/lib/firebase/AuthContext";

export function LogoutButton({ className, children }: { className?: string; children?: React.ReactNode }) {
  const router = useRouter();
  const { logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    // Clear Firebase cookie
    document.cookie = "firebase-user=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    router.push("/login");
    router.refresh();
  };

  return (
    <button onClick={handleLogout} className={className}>
      {children || "Logout"}
    </button>
  );
}