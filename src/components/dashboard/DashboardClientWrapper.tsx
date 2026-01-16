"use client";

import { useEffect, useState } from "react";
import { DashboardContent } from "./DashboardContent";

// Skeleton component
function DashboardSkeleton({ userName }: { userName: string }) {
  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Hero skeleton */}
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
      
      {/* Date selector skeleton */}
      <div className="px-4 mb-4">
        <div className="h-12 bg-white rounded-xl border border-slate-100 animate-pulse"></div>
      </div>
      
      {/* Cards skeleton */}
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
  const [data, setData] = useState<{
    stats: { cleaningsToday: number; operatorsActive: number; propertiesTotal: number; checkinsWeek: number };
    cleanings: any[];
    operators: { id: string; name: string | null }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/data")
      .then(res => res.json())
      .then(data => {
        setData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Errore fetch:", err);
        setLoading(false);
      });
  }, []);

  if (loading || !data) {
    return <DashboardSkeleton userName={userName} />;
  }

  return (
    <DashboardContent
      userName={userName}
      stats={data.stats}
      cleanings={data.cleanings}
      operators={data.operators}
    />
  );
}
