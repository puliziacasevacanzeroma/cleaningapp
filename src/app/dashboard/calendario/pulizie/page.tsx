"use client";

import { useAuth } from "~/lib/firebase/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useCleanings } from "~/lib/contexts/CleaningsContext";
import { PulizieView } from "~/components/proprietario/PulizieView";

export default function CalendarioPulizieAdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { properties, cleanings, operators, isLoading, hasCachedData } = useCleanings();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  // Mostra subito se abbiamo cache, altrimenti loading
  if (loading || (isLoading && !hasCachedData)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-violet-500"></div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <PulizieView 
      properties={properties}
      cleanings={cleanings}
      operators={operators}
      ownerId={user.id}
      isAdmin={true}
    />
  );
}
