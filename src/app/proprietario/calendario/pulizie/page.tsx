"use client";

import { useEffect, useState } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, orderBy, where, getDocs } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { PulizieView } from "~/components/proprietario/PulizieView";

export default function CalendarioPuliziePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [properties, setProperties] = useState<any[]>([]);
  const [cleanings, setCleanings] = useState<any[]>([]);
  const [operators, setOperators] = useState<any[]>([]);
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
          imageUrl: doc.data().imageUrl || null,
          cleaningPrice: doc.data().cleaningPrice || 0,
          maxGuests: doc.data().maxGuests || 0,
          bedrooms: doc.data().bedrooms || 0,
          bathrooms: doc.data().bathrooms || 0,
          bedsConfig: doc.data().bedsConfig || [],
          serviceConfigs: doc.data().serviceConfigs || {},
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
            bookingSource: data.bookingSource || "",
            notes: data.notes || "",
          };
        });
        setCleanings(cleans);
        console.log("✅ Pulizie caricate:", cleans.length);
        setDataLoading(false);
      }
    );

    // Carica operatori (solo per admin)
    if (isAdmin) {
      getDocs(query(collection(db, "users"), where("role", "==", "OPERATORE_PULIZIE")))
        .then(snapshot => {
          const ops = snapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name || doc.data().email || "Operatore"
          }));
          setOperators(ops);
          console.log("✅ Operatori caricati:", ops.length);
        });
    }

    return () => {
      unsubProperties();
      unsubCleanings();
    };
  }, [user?.id, user?.role]);

  if (loading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500"></div>
      </div>
    );
  }

  if (!user) return null;

  const isAdmin = user.role?.toUpperCase() === "ADMIN";

  return (
    <PulizieView 
      properties={properties}
      cleanings={cleanings}
      operators={operators}
      ownerId={user.id}
      isAdmin={isAdmin}
    />
  );
}