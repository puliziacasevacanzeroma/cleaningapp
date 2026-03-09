"use client";

import { useState, useEffect } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { collection, query, orderBy, where, onSnapshot } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { ProprietarioProprietaClient } from "./ProprietarioProprietaClient";

// ✅ Cache module-level: sopravvive ai remount del componente (navigazione tra pagine)
let cachedActive: any[] | null = null;
let cachedPending: any[] | null = null;
let cachedPendingDeletion: any[] | null = null;
let cachedPendingSignature: any[] | null = null;

export function ProprietarioProprietaWrapper() {
  const { user } = useAuth();
  const [activeProperties, setActiveProperties] = useState<any[]>(cachedActive || []);
  const [pendingProperties, setPendingProperties] = useState<any[]>(cachedPending || []);
  const [pendingDeletionProperties, setPendingDeletionProperties] = useState<any[]>(cachedPendingDeletion || []);
  const [pendingSignatureProperties, setPendingSignatureProperties] = useState<any[]>(cachedPendingSignature || []);
  // ✅ Se abbiamo cache, NON mostrare loading
  const [isLoading, setIsLoading] = useState(cachedActive === null);
  const [error, setError] = useState<Error | null>(null);
  
  // 🔥 LISTENER REALTIME - si aggiorna automaticamente quando l'admin approva!
  useEffect(() => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }


    const q = query(
      collection(db, "properties"),
      where("ownerId", "==", user.id),
      orderBy("name", "asc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        
        const active: any[] = [];
        const pending: any[] = [];
        const pendingDeletion: any[] = [];
        const pendingSignature: any[] = [];
        
        snapshot.docs.forEach(doc => {
          const data = doc.data() as Record<string, any>;
          
          
          if (data.status === "INACTIVE" || data.status === "DELETED") {
            return;
          }
          
          const property = {
            id: doc.id,
            ...data,
            cleaningPrice: data.cleaningPrice || 0,
            owner: { name: data.ownerName || "" },
          };
          
          if (data.status === "PENDING_DELETION" || data.deactivationRequested === true) {
            pendingDeletion.push(property);
          } else if (data.status === "PENDING_SIGNATURE") {
            pendingSignature.push(property);
          } else if (data.status === "ACTIVE" || !data.status) {
            active.push(property);
          } else if (data.status === "PENDING") {
            pending.push(property);
          } else {
            console.warn(`⚠️ Proprietà ${doc.id} ha status non riconosciuto: ${data.status}`);
            active.push(property);
          }
        });

        // ✅ Aggiorna cache module-level
        cachedActive = active;
        cachedPending = pending;
        cachedPendingDeletion = pendingDeletion;
        cachedPendingSignature = pendingSignature;

        setActiveProperties(active);
        setPendingProperties(pending);
        setPendingDeletionProperties(pendingDeletion);
        setPendingSignatureProperties(pendingSignature);
        setIsLoading(false);
        
      },
      (err) => {
        console.error("❌ Errore listener proprietà:", err);
        setError(err as Error);
        setIsLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [user?.id]);

  // ✅ Skeleton SOLO al primissimo caricamento in assoluto (nessun dato in cache)
  if (isLoading && cachedActive === null) {
    return (
      <div className="min-h-screen bg-slate-50 pb-4">
        <div className="px-4 py-4" style={{ background: "#0b0b18" }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="h-5 w-36 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.1)" }}></div>
              <div className="h-3 w-44 rounded mt-2 animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }}></div>
            </div>
            <div className="w-[38px] h-[38px] rounded-xl animate-pulse" style={{ background: "rgba(99,102,241,0.15)" }}></div>
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
      pendingSignatureProperties={pendingSignatureProperties}
    />
  );
}
