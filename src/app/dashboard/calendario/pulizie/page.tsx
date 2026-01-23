"use client";

import { useEffect, useState } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, orderBy, where } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { PulizieView } from "~/components/proprietario/PulizieView";

export default function CalendarioPulizieAdminPage() {
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
    
    console.log("🔄 Avvio listeners calendario pulizie ADMIN...");
    
    // Listener per TUTTE le proprietà attive (admin vede tutto)
    const propsQuery = query(collection(db, "properties"));
    
    const unsubProperties = onSnapshot(propsQuery, (snapshot) => {
      const props = snapshot.docs
        .filter(doc => doc.data().status === "ACTIVE")
        .map(doc => ({
          id: doc.id,
          name: doc.data().name || "",
          address: doc.data().address || "",
          imageUrl: doc.data().imageUrl || null,
          ownerId: doc.data().ownerId || "",
          cleaningPrice: doc.data().cleaningPrice || 0,
          maxGuests: doc.data().maxGuests || 0,
          bedrooms: doc.data().bedrooms || 0,
          bathrooms: doc.data().bathrooms || 0,
          bedsConfig: doc.data().bedsConfig || [],
          serviceConfigs: doc.data().serviceConfigs || {},
        }));
      setProperties(props);
      console.log("✅ Proprietà ADMIN caricate:", props.length);
    });

    // Listener per TUTTE le pulizie
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
            adulti: data.adulti || 0,
            neonati: data.neonati || 0,
            bookingSource: data.bookingSource || "",
            notes: data.notes || "",
            price: data.price || 0,
          };
        });
        setCleanings(cleans);
        console.log("✅ Pulizie ADMIN caricate:", cleans.length);
        setDataLoading(false);
      }
    );

    // Listener per operatori (realtime)
    const unsubOperators = onSnapshot(
      query(collection(db, "users"), where("role", "==", "OPERATORE_PULIZIE")),
      (snapshot) => {
        const ops = snapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || doc.data().email || "Operatore"
        }));
        setOperators(ops);
        console.log("✅ Operatori caricati:", ops.length);
      }
    );

    return () => {
      unsubProperties();
      unsubCleanings();
      unsubOperators();
    };
  }, [user?.id]);

  if (loading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500"></div>
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
