"use client";

import { useQuery } from "@tanstack/react-query";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { queryKeys } from "~/lib/queries";
import { ProprietaClient } from "./ProprietaClient";

// Stessa funzione del prefetch nel layout!
async function fetchPropertiesFirestore() {
  console.log("🔥 Firestore DIRETTO: carico proprietà...");
  const startTime = Date.now();
  
  const q = query(collection(db, "properties"), orderBy("name", "asc"));
  const snapshot = await getDocs(q);
  
  console.log(`✅ Proprietà caricate: ${snapshot.docs.length} docs in ${Date.now() - startTime}ms`);
  
  const activeProperties: any[] = [];
  const pendingProperties: any[] = [];
  const suspendedProperties: any[] = [];
  
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    const property = {
      id: doc.id,
      ...data,
      cleaningPrice: data.cleaningPrice || 0,
      monthlyTotal: 0,
      cleaningsThisMonth: 0,
      completedThisMonth: 0,
      _count: { bookings: 0, cleanings: 0 },
      owner: { name: data.ownerName || "", email: data.ownerEmail || "" },
    };
    
    switch (data.status) {
      case "ACTIVE": activeProperties.push(property); break;
      case "PENDING": pendingProperties.push(property); break;
      case "SUSPENDED": suspendedProperties.push(property); break;
    }
  });

  return { activeProperties, pendingProperties, suspendedProperties, proprietari: [] };
}

// Skeleton component
function ProprietaSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="bg-white px-4 py-4 border-b border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <div className="h-7 w-28 bg-slate-200 rounded-lg animate-pulse"></div>
          <div className="w-10 h-10 bg-slate-200 rounded-xl animate-pulse"></div>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-slate-100 rounded-xl p-3 animate-pulse">
              <div className="h-6 w-8 bg-slate-200 rounded mb-1 mx-auto"></div>
              <div className="h-3 w-12 bg-slate-200 rounded mx-auto"></div>
            </div>
          ))}
        </div>
        <div className="h-10 bg-slate-100 rounded-xl mb-3 animate-pulse"></div>
        <div className="flex gap-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-9 w-24 bg-slate-100 rounded-full animate-pulse"></div>
          ))}
        </div>
      </div>
      <div className="px-4 py-4">
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="bg-white rounded-xl border border-slate-100 overflow-hidden animate-pulse">
              <div className="h-14 bg-slate-200"></div>
              <div className="p-2">
                <div className="h-3 w-full bg-slate-100 rounded mb-1"></div>
                <div className="h-2 w-2/3 bg-slate-100 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ProprietaClientWrapper() {
  // USA FIRESTORE DIRETTO - stessa cache del prefetch!
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.properties,
    queryFn: fetchPropertiesFirestore,
    staleTime: 30 * 60 * 1000, // 30 minuti - usa cache del prefetch!
    gcTime: 60 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  if (isLoading && !data) {
    return <ProprietaSkeleton />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-red-500">Errore: {error.message}</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <ProprietaClient
      activeProperties={data.activeProperties || []}
      pendingProperties={data.pendingProperties || []}
      suspendedProperties={data.suspendedProperties || []}
      proprietari={data.proprietari || []}
    />
  );
}
