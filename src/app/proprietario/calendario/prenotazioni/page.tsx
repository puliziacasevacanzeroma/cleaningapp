"use client";

import { useEffect, useState } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { useRouter } from "next/navigation";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { PrenotazioniView } from "~/components/dashboard/PrenotazioniView";

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

  // Listener realtime per proprietà
  useEffect(() => {
    if (!user?.id) return;

    const q = query(
      collection(db, "properties"),
      where("ownerId", "==", user.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const props = snapshot.docs
        .filter(doc => doc.data().status === "ACTIVE")
        .map(doc => ({
          id: doc.id,
          name: doc.data().name || "",
          address: doc.data().address || "",
        }));
      setProperties(props);
    });

    return () => unsubscribe();
  }, [user?.id]);

  // Listener realtime per prenotazioni
  useEffect(() => {
    if (properties.length === 0) {
      setDataLoading(false);
      return;
    }

    const propertyIds = properties.map(p => p.id);

    // Firestore non supporta "in" con più di 10 elementi
    const unsubscribes: (() => void)[] = [];
    const chunks: string[][] = [];
    
    for (let i = 0; i < propertyIds.length; i += 10) {
      chunks.push(propertyIds.slice(i, i + 10));
    }

    chunks.forEach((chunk) => {
      const q = query(
        collection(db, "bookings"),
        where("propertyId", "in", chunk)
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const chunkBookings = snapshot.docs.map(doc => {
          const data = doc.data();
          
          let checkIn: Date;
          let checkOut: Date;
          
          if (data.checkIn?.toDate) {
            checkIn = data.checkIn.toDate();
          } else if (data.checkIn?._seconds) {
            checkIn = new Date(data.checkIn._seconds * 1000);
          } else {
            checkIn = new Date(data.checkIn);
          }
          
          if (data.checkOut?.toDate) {
            checkOut = data.checkOut.toDate();
          } else if (data.checkOut?._seconds) {
            checkOut = new Date(data.checkOut._seconds * 1000);
          } else {
            checkOut = new Date(data.checkOut);
          }

          return {
            id: doc.id,
            propertyId: data.propertyId,
            guestName: data.guestName || "Ospite",
            checkIn: checkIn.toISOString(),
            checkOut: checkOut.toISOString(),
            status: data.status || "CONFIRMED",
            source: data.source || null,
          };
        });

        // Aggiorna bookings per questo chunk
        setBookings(prev => {
          const otherBookings = prev.filter(b => !chunk.includes(b.propertyId));
          const combined = [...otherBookings, ...chunkBookings];
          combined.sort((a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime());
          return combined;
        });

        setDataLoading(false);
      });

      unsubscribes.push(unsubscribe);
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [properties]);

  if (loading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <PrenotazioniView 
      properties={properties}
      bookings={bookings}
      isAdmin={false}
    />
  );
}
