"use client";

import { useEffect, useState } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { useRouter } from "next/navigation";
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { PulizieClient } from "~/components/proprietario/PulizieClient";

export default function PuliziePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [properties, setProperties] = useState<any[]>([]);
  const [cleanings, setCleanings] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  // Carica proprietà del proprietario
  useEffect(() => {
    if (!user?.id) return;

    const q = query(
      collection(db, "properties"),
      where("ownerId", "==", user.id),
      where("status", "==", "ACTIVE")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const props = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setProperties(props);
      console.log("🏠 Proprietà proprietario:", props.length);
    });

    return () => unsubscribe();
  }, [user?.id]);

  // Carica pulizie per le proprietà del proprietario
  useEffect(() => {
    if (properties.length === 0) {
      setDataLoading(false);
      return;
    }

    const propertyIds = properties.map(p => p.id);
    
    // Firestore non supporta "in" con più di 10 elementi, quindi facciamo query multiple
    const unsubscribes: (() => void)[] = [];
    
    // Raggruppa per 10
    const chunks: string[][] = [];
    for (let i = 0; i < propertyIds.length; i += 10) {
      chunks.push(propertyIds.slice(i, i + 10));
    }

    let allCleanings: any[] = [];

    chunks.forEach((chunk, index) => {
      const q = query(
        collection(db, "cleanings"),
        where("propertyId", "in", chunk)
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const chunkCleanings = snapshot.docs.map(doc => {
          const data = doc.data();
          const property = properties.find(p => p.id === data.propertyId);
          
          let cleaningDate: Date;
          if (data.scheduledDate?.toDate) {
            cleaningDate = data.scheduledDate.toDate();
          } else if (data.scheduledDate?._seconds) {
            cleaningDate = new Date(data.scheduledDate._seconds * 1000);
          } else if (data.date) {
            cleaningDate = new Date(data.date);
          } else {
            cleaningDate = new Date();
          }

          return {
            id: doc.id,
            date: cleaningDate.toISOString(),
            status: data.status || "SCHEDULED",
            property: property ? {
              id: property.id,
              name: property.name,
              address: property.address
            } : null,
            operator: data.operatorName ? { name: data.operatorName } : null,
            booking: data.booking || null,
            guestsCount: data.guestsCount || property?.maxGuests || 2,
            scheduledTime: data.scheduledTime || "10:00",
          };
        });

        // Aggiorna cleanings per questo chunk
        setCleanings(prev => {
          // Rimuovi i vecchi cleanings di questo chunk
          const otherCleanings = prev.filter(c => !chunk.includes(c.property?.id));
          // Aggiungi i nuovi
          const combined = [...otherCleanings, ...chunkCleanings];
          // Ordina per data
          combined.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcomingCleanings = cleanings.filter(c => new Date(c.date) >= today);
  const pastCleanings = cleanings.filter(c => new Date(c.date) < today);

  return (
    <PulizieClient 
      upcomingCleanings={upcomingCleanings}
      pastCleanings={pastCleanings}
    />
  );
}
