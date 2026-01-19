"use client";

import { useEffect, useState } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { useRouter } from "next/navigation";
import { getPropertiesByOwner, getBookings } from "~/lib/firebase/firestore-data";
import { CalendarioPrenotazioniProprietario } from "~/components/proprietario/CalendarioPrenotazioniProprietario";

export default function CalendarioPrenotazioniPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [properties, setProperties] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    async function loadData() {
      if (!user?.id) return;
      
      try {
        const props = await getPropertiesByOwner(user.id);
        const activeProps = props.filter(p => p.status === "ACTIVE");
        setProperties(activeProps);

        const propertyIds = activeProps.map(p => p.id);
        const allBookings = await getBookings();
        
        // Filtra prenotazioni per le proprietà dell'owner
        const myBookings = allBookings
          .filter(b => propertyIds.includes(b.propertyId))
          .map(b => ({
            id: b.id,
            propertyId: b.propertyId,
            guestName: b.guestName || "Ospite",
            checkIn: b.checkIn?.toDate?.() || new Date(),
            checkOut: b.checkOut?.toDate?.() || new Date(),
            status: b.status || "CONFIRMED"
          }));

        setBookings(myBookings);
      } catch (error) {
        console.error("Errore caricamento dati:", error);
      } finally {
        setDataLoading(false);
      }
    }
    
    if (user) loadData();
  }, [user]);

  if (loading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <CalendarioPrenotazioniProprietario 
      properties={properties}
      bookings={bookings}
    />
  );
}