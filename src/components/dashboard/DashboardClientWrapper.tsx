"use client";

import { useQuery } from "@tanstack/react-query";
import { collection, getDocs, query, where, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { DashboardContent } from "./DashboardContent";
import { useEffect } from "react";

// Skeleton component
function DashboardSkeleton({ userName }: { userName: string }) {
  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="bg-gradient-to-br from-indigo-500 via-purple-500 to-purple-600 rounded-b-3xl p-4 mb-4">
        <div className="h-6 w-40 bg-white/20 rounded mb-2 animate-pulse"></div>
        <div className="h-4 w-32 bg-white/20 rounded animate-pulse"></div>
        <div className="grid grid-cols-4 gap-2 mt-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white/10 rounded-xl p-2 animate-pulse">
              <div className="h-6 w-8 bg-white/20 rounded mb-1 mx-auto"></div>
              <div className="h-2 w-10 bg-white/20 rounded mx-auto"></div>
            </div>
          ))}
        </div>
      </div>
      <div className="px-4 mb-4">
        <div className="h-12 bg-white rounded-xl border border-slate-100 animate-pulse"></div>
      </div>
      <div className="px-4 space-y-3">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="bg-white rounded-2xl border border-slate-100 overflow-hidden animate-pulse">
            <div className="flex">
              <div className="w-2 bg-slate-300"></div>
              <div className="flex-1 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="h-5 w-32 bg-slate-200 rounded mb-2"></div>
                    <div className="h-3 w-24 bg-slate-100 rounded"></div>
                  </div>
                  <div className="h-6 w-20 bg-slate-100 rounded-full"></div>
                </div>
                <div className="flex gap-2 mt-3">
                  <div className="h-8 w-20 bg-slate-100 rounded-lg"></div>
                  <div className="h-8 w-20 bg-slate-100 rounded-lg"></div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface DashboardClientWrapperProps {
  userName: string;
}

export function DashboardClientWrapper({ userName }: DashboardClientWrapperProps) {
  // 🔥 USA FIRESTORE DIRETTO - bypassa Railway!
  // Query key: ["dashboard"] - corrisponde a quella usata nella splash!
  const { data, isLoading, isFetching, isStale } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      console.log("🔥 Firestore DIRETTO: dashboard...");
      const startTime = Date.now();
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      // Query parallele per velocità
      const [propertiesSnapshot, cleaningsSnapshot, operatorsSnapshot] = await Promise.all([
        getDocs(query(
          collection(db, "properties"),
          where("status", "==", "ACTIVE")
        )),
        getDocs(query(
          collection(db, "cleanings"),
          where("scheduledDate", ">=", Timestamp.fromDate(today)),
          where("scheduledDate", "<", Timestamp.fromDate(tomorrow))
        )),
        getDocs(query(
          collection(db, "users"),
          where("role", "==", "OPERATORE_PULIZIE")
        )),
      ]);
      
      console.log(`✅ Dashboard: ${Date.now() - startTime}ms`);
      
      // Mappa proprietà per lookup veloce
      const propertiesMap = new Map();
      propertiesSnapshot.docs.forEach(doc => {
        propertiesMap.set(doc.id, { id: doc.id, ...doc.data() });
      });
      
      // Trasforma pulizie
      const cleanings = cleaningsSnapshot.docs.map(doc => {
        const data = doc.data();
        const property = propertiesMap.get(data.propertyId);
        
        return {
          id: doc.id,
          date: data.scheduledDate?.toDate?.() || new Date(),
          scheduledTime: data.scheduledTime || "10:00",
          status: data.status || "pending",
          guestsCount: data.guestsCount || 2,
          property: {
            id: data.propertyId || "",
            name: data.propertyName || property?.name || "Proprietà",
            address: property?.address || "",
            imageUrl: null,
          },
          operator: data.operatorId ? {
            id: data.operatorId,
            name: data.operatorName || "Operatore",
          } : null,
          operators: [],
          booking: {
            guestName: data.guestName || "",
            guestsCount: data.guestsCount || 2,
          },
        };
      });
      
      // Trasforma operatori
      const operators = operatorsSnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name || "Operatore",
      }));

      return {
        stats: {
          cleaningsToday: cleaningsSnapshot.docs.length,
          operatorsActive: operatorsSnapshot.docs.length,
          propertiesTotal: propertiesSnapshot.docs.length,
          checkinsWeek: 0,
        },
        cleanings,
        operators,
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minuti per dashboard (dati più dinamici)
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  // Debug log
  useEffect(() => {
    console.log("Dashboard DIRETTO - isLoading:", isLoading, "isFetching:", isFetching, "hasData:", !!data, "isStale:", isStale);
  }, [isLoading, isFetching, data, isStale]);

  // Mostra contenuto se abbiamo dati, anche se sta ricaricando in background
  if (data) {
    return (
      <DashboardContent
        userName={userName}
        stats={data.stats}
        cleanings={data.cleanings}
        operators={data.operators}
      />
    );
  }

  // Skeleton solo se non abbiamo dati
  if (isLoading) {
    return <DashboardSkeleton userName={userName} />;
  }

  return null;
}
