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
    
    const isAdmin = user.role?.toUpperCase() === "ADMIN";
    console.log("🔄 Avvio listeners calendario pulizie proprietario...");
    console.log("👤 User ID:", user.id, "Role:", user.role, "isAdmin:", isAdmin);
    
    // Listener per proprietà - admin vede tutte, proprietario solo le sue
    let propsQuery;
    if (isAdmin) {
      propsQuery = query(collection(db, "properties"));
    } else {
      propsQuery = query(collection(db, "properties"), where("ownerId", "==", user.id));
    }
    
    const unsubProperties = onSnapshot(propsQuery, (snapshot) => {
      const props = snapshot.docs
        .filter(doc => doc.data().status === "ACTIVE")
        .map(doc => ({
          id: doc.id,
          name: doc.data().name || "",
          address: doc.data().address || "",
        }));
      setProperties(props);
      console.log("✅ Proprietà proprietario caricate:", props.length);
    });

    // Listener per TUTTE le pulizie (filtreremo dopo per proprietà)
    const unsubCleanings = onSnapshot(
      query(collection(db, "cleanings"), orderBy("scheduledDate", "asc")),
      (snapshot) => {
        const cleans = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            propertyId: data.propertyId || "",
            propertyName: data.propertyName || "",
            date: data.scheduledDate?.toDate?.() || new Date(),
            scheduledTime: data.scheduledTime || "10:00",
            status: data.status || "SCHEDULED",
            operator: data.operatorId ? { id: data.operatorId, name: data.operatorName || "" } : null,
            guestName: data.guestName || "",
            guestsCount: data.guestsCount || 2,
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
  }, [user?.id, user?.role]);

  if (loading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
      </div>
    );
  }

  if (!user) return null;

  // Filtra pulizie per le proprietà visibili
  const propertyIds = properties.map(p => p.id);
  const myCleanings = cleanings.filter(c => propertyIds.includes(c.propertyId));
  
  console.log("📊 Rendering calendario pulizie:", properties.length, "proprietà,", myCleanings.length, "pulizie filtrate su", cleanings.length, "totali");
  console.log("📋 Property IDs:", propertyIds);
  if (cleanings.length > 0) {
    console.log("📋 Esempio pulizia:", cleanings[0]);
  }

  return (
    <CalendarioPulizieProprietario 
      properties={properties}
      cleanings={myCleanings}
      ownerId={user.id}
    />
  );
}