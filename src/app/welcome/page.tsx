"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "~/lib/firebase/AuthContext";
import { WelcomeSplash } from "~/components/WelcomeSplash";

function WelcomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [showSplash, setShowSplash] = useState(true);

  const destination = searchParams.get("to") || "/dashboard";

  // Se non c'è utente e non sta caricando, torna al login
  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  const handleSplashComplete = () => {
    setShowSplash(false);
    // Marca come visto per questa sessione
    sessionStorage.setItem("splash-shown", "true");
    // Redirect alla destinazione
    window.location.href = destination;
  };

  // Se sta caricando l'utente, mostra loading
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-cyan-500 via-sky-600 to-blue-700 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    );
  }

  // Se non c'è utente, non mostrare nulla (redirect in corso)
  if (!user) {
    return null;
  }

  // Mostra splash
  if (showSplash) {
    return (
      <WelcomeSplash
        userName={user.name || "Utente"}
        userId={user.id}
        destination={destination}
        onComplete={handleSplashComplete}
      />
    );
  }

  return null;
}

export default function WelcomePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-cyan-500 via-sky-600 to-blue-700 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    }>
      <WelcomeContent />
    </Suspense>
  );
}
