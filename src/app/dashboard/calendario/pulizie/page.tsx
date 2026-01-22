"use client";

import { useState, useEffect } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { CalendarioPulizieClient } from "~/components/dashboard/CalendarioPulizieAdminClient";

interface Property {
  id: string;
  name: string;
  address: string;
}

interface Cleaning {
  id: string;
  propertyId: string;
  scheduledDate: any;
  scheduledTime?: string;
  status: string;
  operator?: { id: string; name: string } | null;
}

interface Operator {
  id: string;
  name: string;
}

export default function CalendarioPuliziePage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [cleanings, setCleanings] = useState<Cleaning[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("🔄 Avvio listeners per calendario pulizie admin...");
    
    // Listener per proprietà
    const unsubProperties = onSnapshot(
      query(collection(db, "properties"), orderBy("name", "asc")),
      (snapshot) => {
        const props = snapshot.docs
          .filter(doc => doc.data().status === "ACTIVE")
          .map(doc => ({
            id: doc.id,
            name: doc.data().name || "",
            address: doc.data().address || "",
          }));
        setProperties(props);
        console.log("✅ Proprietà caricate:", props.length);
      }
    );

    // Listener per pulizie
    const unsubCleanings = onSnapshot(
      query(collection(db, "cleanings"), orderBy("scheduledDate", "asc")),
      (snapshot) => {
        const cleans = snapshot.docs.map(doc => {
          const data = doc.data();
          // Converti Timestamp in Date
          const scheduledDate = data.scheduledDate?.toDate?.() || new Date();
          return {
            id: doc.id,
            propertyId: data.propertyId || "",
            scheduledDate: scheduledDate,
            scheduledTime: data.scheduledTime || "10:00",
            status: data.status || "SCHEDULED",
            operator: data.operatorId ? { id: data.operatorId, name: data.operatorName || "" } : null,
          };
        });
        setCleanings(cleans);
        console.log("✅ Pulizie caricate:", cleans.length);
        setLoading(false);
      }
    );

    // Carica operatori da API
    fetch("/api/dashboard/data")
      .then(res => res.json())
      .then(data => {
        setOperators(data.operators || []);
      })
      .catch(console.error);

    return () => {
      unsubProperties();
      unsubCleanings();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 lg:p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-200 rounded w-64 mb-4"></div>
          <div className="h-96 bg-slate-200 rounded-2xl"></div>
        </div>
      </div>
    );
  }

  return (
    <CalendarioPulizieClient
      properties={properties}
      cleanings={cleanings}
      operators={operators}
    />
  );
}