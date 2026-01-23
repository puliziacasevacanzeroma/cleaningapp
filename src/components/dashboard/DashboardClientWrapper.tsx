"use client";

import { useDashboardRealtime } from "~/lib/useFirestoreRealtime";
import { DashboardContent } from "./DashboardContent";
import { useDashboardPreloaded } from "~/lib/contexts/DashboardContext";

// Skeleton component - mostrato solo in casi estremi
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
  // 🚀 USA DATI PRECARICATI dal context (già caricati nel layout!)
  const { preloadedData, isPreloaded } = useDashboardPreloaded();
  
  // 🔥 REALTIME: mantiene comunque i listener per aggiornamenti successivi
  const { data: realtimeData, isLoading } = useDashboardRealtime();
  
  // ✅ PRIORITÀ: Usa i dati precaricati SUBITO se disponibili
  // Poi passa ai dati realtime quando si aggiornano
  const data = realtimeData || preloadedData;

  // Se abbiamo dati (precaricati o realtime), mostrali subito!
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

  // Skeleton solo se NON abbiamo dati precaricati E stiamo caricando
  // Questo non dovrebbe mai succedere con il nuovo sistema!
  if (isLoading && !isPreloaded) {
    return <DashboardSkeleton userName={userName} />;
  }

  return null;
}
