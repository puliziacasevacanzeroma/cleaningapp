"use client";

import { useEffect, useState } from "react";
import { ProprietaClient } from "./ProprietaClient";

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
  const [data, setData] = useState<{
    activeProperties: any[];
    pendingProperties: any[];
    suspendedProperties: any[];
    proprietari: any[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/properties/list")
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
    return <ProprietaSkeleton />;
  }

  return (
    <ProprietaClient
      activeProperties={data.activeProperties}
      pendingProperties={data.pendingProperties}
      suspendedProperties={data.suspendedProperties}
      proprietari={data.proprietari || []}
    />
  );
}
