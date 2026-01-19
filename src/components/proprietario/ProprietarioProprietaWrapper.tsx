"use client";

import { useProprietarioPropertiesDirect } from "~/lib/useFirestoreDirect";
import { useAuth } from "~/lib/firebase/AuthContext";
import { ProprietarioProprietaClient } from "./ProprietarioProprietaClient";

function ProprietaSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="bg-white border-b border-slate-100 px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-6 w-40 bg-slate-200 rounded animate-pulse"></div>
            <div className="h-4 w-24 bg-slate-100 rounded mt-2 animate-pulse"></div>
          </div>
          <div className="w-11 h-11 bg-slate-200 rounded-xl animate-pulse"></div>
        </div>
      </div>
      <div className="p-4 space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-200 animate-pulse">
            <div className="h-44 bg-slate-200"></div>
            <div className="p-4">
              <div className="h-4 w-32 bg-slate-200 rounded"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProprietarioProprietaWrapper() {
  const { user } = useAuth();
  
  // 🔥 USA FIRESTORE DIRETTO - bypassa Railway!
  const { data, isLoading, error } = useProprietarioPropertiesDirect(user?.id || null);

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
    <ProprietarioProprietaClient
      activeProperties={data.activeProperties}
      pendingProperties={data.pendingProperties}
    />
  );
}
