"use client";

import { useEffect, useState } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, orderBy, where } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
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
    if (!user?.id) return;
    
    console.log("🔄 Avvio listeners per calendario pulizie proprietario...");
    
    // Listener per proprietà del proprietario
    const unsubProperties = onSnapshot(
      query(collection(db, "properties"), where("ownerId", "==", user.id)),
      (snapshot) => {
        const props = snapshot.docs
          .filter(doc => doc.data().status === "ACTIVE")
          .map(doc => ({
            id: doc.id,
            name: doc.data().name || "",
            address: doc.data().address || "",
          }));
        setProperties(props);
        console.log("✅ Proprietà proprietario caricate:", props.length);
      }
    );

    // Listener per pulizie
    const unsubCleanings = onSnapshot(
      query(collection(db, "cleanings"), orderBy("scheduledDate", "asc")),
      (snapshot) => {
        const cleans = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            propertyId: data.propertyId || "",
            scheduledDate: data.scheduledDate?.toDate?.() || new Date(),
            scheduledTime: data.scheduledTime || "10:00",
            status: data.status || "SCHEDULED",
            operator: data.operatorId ? { id: data.operatorId, name: data.operatorName || "" } : null,
          };
        });
        setCleanings(cleans);
        console.log("✅ Pulizie caricate:", cleans.length);
        setDataLoading(false);
      }
    );

    return () => {
      unsubProperties();
      unsubCleanings();
    };
  }, [user?.id]);

  if (loading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
      </div>
    );
  }

  if (!user) return null;

  // Filtra pulizie per le proprietà dell'owner
  const propertyIds = properties.map(p => p.id);
  const myCleanings = cleanings.filter(c => propertyIds.includes(c.propertyId));

  return (
    <CalendarioPulizieProprietario 
      properties={properties}
      cleanings={myCleanings}
    />
  );
}