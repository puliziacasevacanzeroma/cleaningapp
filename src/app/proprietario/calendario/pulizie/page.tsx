"use client";

import { useEffect, useState } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { useRouter } from "next/navigation";
import { getPropertiesByOwner, getCleanings } from "~/lib/firebase/firestore-data";
import { CalendarioPulizieProprietario } from "~/components/proprietario/CalendarioPulizieProprietario";

export default function CalendarioPuliziePage() {
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

  useEffect(() => {
    async function loadData() {
      if (!user?.id) return;
      
      try {
        const props = await getPropertiesByOwner(user.id);
        const activeProps = props.filter(p => p.status === "ACTIVE");
        setProperties(activeProps);

        const propertyIds = activeProps.map(p => p.id);
        const allCleanings = await getCleanings();
        
        // Filtra pulizie per le proprietà dell'owner
        const myCleanings = allCleanings
          .filter(c => propertyIds.includes(c.propertyId))
          .map(c => ({
            id: c.id,
            propertyId: c.propertyId,
            scheduledDate: c.scheduledDate?.toDate?.() || new Date(),
            status: c.status,
            scheduledTime: c.scheduledTime || "10:00",
            operator: c.operatorName ? { id: c.operatorId, name: c.operatorName } : null
          }));

        setCleanings(myCleanings);
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
    <CalendarioPulizieProprietario 
      properties={properties}
      cleanings={cleanings}
    />
  );
}