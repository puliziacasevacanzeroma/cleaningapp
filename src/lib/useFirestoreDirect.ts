"use client";

import { useQuery } from "@tanstack/react-query";
import { collection, getDocs, query, orderBy, where, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

// ============================================================
// HOOK: Proprietà Admin (tutte) - FIRESTORE DIRETTO
// ============================================================
export function usePropertiesDirect() {
  return useQuery({
    queryKey: ["properties-direct"],
    queryFn: async () => {
      const q = query(
        collection(db, "properties"),
        orderBy("name", "asc")
      );

      const snapshot = await getDocs(q);

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
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

// ============================================================
// HOOK: Proprietà Proprietario (per ownerId) - FIRESTORE DIRETTO
// ============================================================
export function useProprietarioPropertiesDirect(ownerId: string | null) {
  return useQuery({
    queryKey: ["proprietario-properties-direct", ownerId],
    queryFn: async () => {
      if (!ownerId) return { activeProperties: [], pendingProperties: [] };

      const q = query(
        collection(db, "properties"),
        where("ownerId", "==", ownerId),
        orderBy("name", "asc")
      );

      const snapshot = await getDocs(q);

      const activeProperties: any[] = [];
      const pendingProperties: any[] = [];

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const property = {
          id: doc.id,
          ...data,
          cleaningPrice: data.cleaningPrice || 0,
          owner: { name: data.ownerName || "" },
        };

        if (data.status === "ACTIVE") {
          activeProperties.push(property);
        } else {
          pendingProperties.push(property);
        }
      });

      return { activeProperties, pendingProperties };
    },
    enabled: !!ownerId,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

// ============================================================
// HOOK: Dashboard Admin - FIRESTORE DIRETTO
// ============================================================
export function useDashboardDirect() {
  return useQuery({
    queryKey: ["dashboard-direct"],
    queryFn: async () => {
      // Prepara date per query pulizie di oggi
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

      // Mappa proprietà per lookup veloce
      const propertiesMap = new Map();
      propertiesSnapshot.docs.forEach(doc => {
        propertiesMap.set(doc.id, { id: doc.id, ...doc.data() });
      });

      // Trasforma pulizie
      const cleanings = cleaningsSnapshot.docs.map(doc => {
        const data = doc.data();
        const property = propertiesMap.get(data.propertyId);

        // Leggi l'array operators dal database
        let operatorsArray: Array<{id: string, name: string}> = [];
        
        if (Array.isArray(data.operators) && data.operators.length > 0) {
          // 🔥 FIX: filtra operatori senza id o senza nome valido
          operatorsArray = data.operators.filter((op: any) => 
            op && op.id && op.name && op.name.trim() !== '' && op.name !== 'undefined'
          );
        } else if (data.operatorId && data.operatorName && data.operatorName.trim() !== '') {
          operatorsArray = [{ id: data.operatorId, name: data.operatorName }];
        }

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
            maxGuests: property?.maxGuests || 10,
          },
          operator: operatorsArray[0] ? {
            id: operatorsArray[0].id,
            name: operatorsArray[0].name,
          } : null,
          operators: operatorsArray.map(op => ({
            id: op.id,
            operator: { id: op.id, name: op.name }
          })),
          booking: {
            guestName: data.guestName || "",
            guestsCount: data.guestsCount || 2,
          },
        };
      });

      // Trasforma operatori - 🔥 FIX: filtra quelli senza nome valido
      const operators = operatorsSnapshot.docs
        .map(doc => ({
          id: doc.id,
          name: doc.data().name || "",
        }))
        .filter(op => op.name && op.name.trim() !== '' && op.name !== 'undefined');

      return {
        stats: {
          cleaningsToday: cleaningsSnapshot.docs.length,
          operatorsActive: operators.length,
          propertiesTotal: propertiesSnapshot.docs.length,
          checkinsWeek: 0,
        },
        cleanings,
        operators,
      };
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}
