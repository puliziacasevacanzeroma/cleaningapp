"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useDashboardRealtime } from "~/lib/useFirestoreRealtime";
import { DashboardContent } from "./DashboardContent";
import { useState } from "react";

// 🔄 Helper per leggere cache localStorage
function getCachedDashboard(): any {
  if (typeof window === "undefined") return null;
  try {
    const cached = localStorage.getItem("dashboard_cache");
    return cached ? JSON.parse(cached) : null;
  } catch { return null; }
}

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
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-2xl border border-slate-100 overflow-hidden animate-pulse">
            <div className="flex">
              <div className="w-2 bg-slate-300"></div>
              <div className="flex-1 p-4">
                <div className="h-5 w-32 bg-slate-200 rounded mb-2"></div>
                <div className="h-3 w-24 bg-slate-100 rounded"></div>
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
  const queryClient = useQueryClient();
  
  // 🔄 INIZIALIZZA DA CACHE localStorage - mostrato SUBITO!
  const [cachedData] = useState(() => getCachedDashboard());

  // 🚀 PRIMA: Controlla se ci sono dati precaricati nella cache React Query (da WelcomeSplash)
  const reactQueryCache = queryClient.getQueryData<any>(["dashboard"]);

  // 🔥 REALTIME: usa onSnapshot per aggiornamenti automatici
  const { data: realtimeData, isLoading, error } = useDashboardRealtime();

  // 🎯 USA CACHE PRIMA, POI REALTIME
  // Priorità: realtimeData > reactQueryCache > localStorage cache
  const data = realtimeData || reactQueryCache || cachedData;

  // Se c'è errore
  if (error) {
    return <div className="p-4 text-red-500">Errore: {error.message}</div>;
  }

  // ✅ Mostra contenuto se abbiamo dati (da qualsiasi fonte!)
  if (data) {
    return (
      <DashboardContent
        userName={userName}
        stats={data.stats}
        cleanings={data.cleanings}
        operators={data.operators}
        orders={data.orders || []}
        riders={data.riders || []}
      />
    );
  }

  // Skeleton solo se non abbiamo NESSUN dato
  if (isLoading) {
    return <DashboardSkeleton userName={userName} />;
  }

  return null;
}
