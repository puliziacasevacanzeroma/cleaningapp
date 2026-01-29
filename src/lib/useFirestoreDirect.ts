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
      const [propertiesSnapshot, cleaningsSnapshot, operatorsSnapshot, ordersSnapshot, ridersSnapshot] = await Promise.all([
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
        // Carica TUTTI gli ordini (filtreremo lato client)
        getDocs(collection(db, "orders")),
        // Carica riders
        getDocs(query(
          collection(db, "users"),
          where("role", "==", "RIDER")
        )),
      ]);

      // Mappa proprietà per lookup veloce
      const propertiesMap = new Map();
      propertiesSnapshot.docs.forEach(doc => {
        propertiesMap.set(doc.id, { id: doc.id, ...doc.data() });
      });

      // Mappa riders per lookup veloce
      const ridersMap = new Map();
      ridersSnapshot.docs.forEach(doc => {
        ridersMap.set(doc.id, { id: doc.id, ...doc.data() });
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
            maxGuests: property?.maxGuests || 6,
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

      // Trasforma ordini biancheria
      const orders = ordersSnapshot.docs.map(doc => {
        const data = doc.data();
        const property = propertiesMap.get(data.propertyId);
        const rider = data.riderId ? ridersMap.get(data.riderId) : null;

        return {
          id: doc.id,
          propertyId: data.propertyId || "",
          propertyName: data.propertyName || property?.name || "Proprietà",
          propertyAddress: data.propertyAddress || property?.address || "",
          propertyCity: data.propertyCity || property?.city || "",
          propertyPostalCode: data.propertyPostalCode || property?.postalCode || "",
          propertyFloor: data.propertyFloor || property?.floor || "",
          riderId: data.riderId || null,
          riderName: data.riderName || rider?.name || null,
          status: data.status || "PENDING",
          items: data.items || [],
          scheduledDate: data.scheduledDate?.toDate?.() || null,
          notes: data.notes || "",
          createdAt: data.createdAt?.toDate?.() || new Date(),
        };
      });

      // Conta ordini attivi (non completati)
      const activeOrders = orders.filter(o => 
        o.status !== "DELIVERED" && o.status !== "COMPLETED"
      );

      // Trasforma operatori - 🔥 FIX: filtra quelli senza nome valido
      const operators = operatorsSnapshot.docs
        .map(doc => ({
          id: doc.id,
          name: doc.data().name || "",
        }))
        .filter(op => op.name && op.name.trim() !== '' && op.name !== 'undefined');

      // Trasforma riders - SOLO utenti con role === "RIDER"
      const riders = ridersSnapshot.docs
        .map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.name || "",
            role: data.role || "",
          };
        })
        .filter(r => 
          r.name && 
          r.name.trim() !== '' && 
          r.name !== 'undefined' &&
          r.role === 'RIDER' // Doppio check sul ruolo
        );

      return {
        stats: {
          cleaningsToday: cleaningsSnapshot.docs.length,
          operatorsActive: operators.length,
          propertiesTotal: propertiesSnapshot.docs.length,
          checkinsWeek: 0,
          ordersToday: activeOrders.length, // Conta solo ordini attivi
          ordersPending: orders.filter(o => o.status === "PENDING").length,
        },
        cleanings,
        operators,
        orders,
        riders,
      };
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}
