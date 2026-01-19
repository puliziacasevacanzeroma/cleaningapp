"use client";

import { useQuery } from "@tanstack/react-query";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

// Hook per caricare proprietà DIRETTAMENTE da Firestore (bypassa Railway)
export function usePropertiesDirect() {
  return useQuery({
    queryKey: ["properties-direct"],
    queryFn: async () => {
      console.log("🔥 Firestore DIRETTO: caricamento proprietà...");
      const startTime = Date.now();
      
      // Query diretta a Firestore
      const q = query(
        collection(db, "properties"),
        orderBy("name", "asc")
      );
      
      const snapshot = await getDocs(q);
      
      console.log(`✅ Firestore DIRETTO: ${snapshot.docs.length} docs in ${Date.now() - startTime}ms`);
      
      // Divide per status
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
          owner: { name: data.ownerName || "" },
        };
        
        switch (data.status) {
          case "ACTIVE":
            activeProperties.push(property);
            break;
          case "PENDING":
            pendingProperties.push(property);
            break;
          case "SUSPENDED":
            suspendedProperties.push(property);
            break;
        }
      });

      return {
        activeProperties,
        pendingProperties,
        suspendedProperties,
        proprietari: [],
      };
    },
    staleTime: 30 * 60 * 1000, // 30 minuti cache
    gcTime: 60 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}
