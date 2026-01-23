"use client";

import { useAuth } from "~/lib/firebase/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useCleanings } from "~/lib/contexts/CleaningsContext";
import { PrenotazioniView } from "~/components/dashboard/PrenotazioniView";

export default function CalendarioPrenotazioniPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { properties, bookings, isLoading, hasCachedData } = useCleanings();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  // Mostra subito se abbiamo cache
  if (loading || (isLoading && !hasCachedData)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-500"></div>
      </div>
    );
  }

  if (!user) return null;

  // Serializza le date per i componenti
  const serializedBookings = bookings.map(b => ({
    ...b,
    checkIn: b.checkIn instanceof Date ? b.checkIn.toISOString() : b.checkIn,
    checkOut: b.checkOut instanceof Date ? b.checkOut.toISOString() : b.checkOut,
  }));

  return (
    <PrenotazioniView
      properties={properties}
      bookings={serializedBookings}
      isAdmin={true}
    />
  );
}
