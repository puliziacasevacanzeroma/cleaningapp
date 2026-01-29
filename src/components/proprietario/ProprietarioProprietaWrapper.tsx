"use client";

import { useState, useEffect } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { collection, query, orderBy, where, onSnapshot } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
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
  const [activeProperties, setActiveProperties] = useState<any[]>([]);
  const [pendingProperties, setPendingProperties] = useState<any[]>([]);
  const [pendingDeletionProperties, setPendingDeletionProperties] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  // 🔥 LISTENER REALTIME - si aggiorna automaticamente quando l'admin approva!
  useEffect(() => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    console.log("🔥 Avvio listener REALTIME proprietà proprietario:", user.id);

    const q = query(
      collection(db, "properties"),
      where("ownerId", "==", user.id),
      orderBy("name", "asc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        console.log(`📦 Proprietà aggiornate: ${snapshot.docs.length} docs`);
        
        const active: any[] = [];
        const pending: any[] = [];
        const pendingDeletion: any[] = [];
        
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          
          // Escludi proprietà disattivate e cancellate completamente
          if (data.status === "INACTIVE" || data.status === "DELETED") {
            return;
          }
          
          const property = {
            id: doc.id,
            ...data,
            cleaningPrice: data.cleaningPrice || 0,
            owner: { name: data.ownerName || "" },
          };
          
          // Check se è in attesa di cancellazione (status PENDING_DELETION O flag deactivationRequested)
          if (data.status === "PENDING_DELETION" || data.deactivationRequested === true) {
            pendingDeletion.push(property);
          } else if (data.status === "ACTIVE") {
            active.push(property);
          } else if (data.status === "PENDING") {
            pending.push(property);
          }
        });

        setActiveProperties(active);
        setPendingProperties(pending);
        setPendingDeletionProperties(pendingDeletion);
        setIsLoading(false);
        
        console.log("📊 Stato proprietà:", {
          active: active.length,
          pending: pending.length,
          pendingDeletion: pendingDeletion.length
        });
      },
      (err) => {
        console.error("❌ Errore listener proprietà:", err);
        setError(err as Error);
        setIsLoading(false);
      }
    );

    return () => {
      console.log("🛑 Disattivo listener proprietà proprietario");
      unsubscribe();
    };
  }, [user?.id]);

  if (isLoading) {
    return <ProprietaSkeleton />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-red-500">Errore: {error.message}</p>
      </div>
    );
  }

  return (
    <ProprietarioProprietaClient
      activeProperties={activeProperties}
      pendingProperties={pendingProperties}
      pendingDeletionProperties={pendingDeletionProperties}
    />
  );
}
