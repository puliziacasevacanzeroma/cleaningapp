"use client";

import { useRouter } from "next/navigation";

export function LogoutButton({ className, children }: { className?: string; children?: React.ReactNode }) {
  const router = useRouter();

  const handleLogout = async () => {
    // Cancella i cookie di sessione
    document.cookie = "next-auth.session-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    document.cookie = "__Secure-next-auth.session-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    document.cookie = "next-auth.callback-url=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    document.cookie = "next-auth.csrf-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    
    // Redirect al login
    router.push("/login");
    router.refresh();
  };

  return (
    <button onClick={handleLogout} className={className}>
      {children || "Logout"}
    </button>
  );
}