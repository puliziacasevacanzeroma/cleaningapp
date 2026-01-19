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
      console.log("🔥 Firestore DIRETTO: proprietà admin...");
      const startTime = Date.now();

      const q = query(
        collection(db, "properties"),
        orderBy("name", "asc")
      );

      const snapshot = await getDocs(q);

      console.log(`✅ Proprietà admin: ${snapshot.docs.length} docs in ${Date.now() - startTime}ms`);

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

      console.log("🔥 Firestore DIRETTO: proprietà proprietario...");
      const startTime = Date.now();

      const q = query(
        collection(db, "properties"),
        where("ownerId", "==", ownerId),
        orderBy("name", "asc")
      );

      const snapshot = await getDocs(q);

      console.log(`✅ Proprietà proprietario: ${snapshot.docs.length} docs in ${Date.now() - startTime}ms`);

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
      console.log("🔥 Firestore DIRETTO: dashboard...");
      const startTime = Date.now();

      // Prepara date per query pulizie di oggi
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Query parallele per velocità
      const [propertiesSnapshot, cleaningsSnapshot, operatorsSnapshot] = await Promise.all([
        // Proprietà attive
        getDocs(query(
          collection(db, "properties"),
          where("status", "==", "ACTIVE")
        )),
        // Pulizie di oggi
        getDocs(query(
          collection(db, "cleanings"),
          where("scheduledDate", ">=", Timestamp.fromDate(today)),
          where("scheduledDate", "<", Timestamp.fromDate(tomorrow))
        )),
        // Operatori
        getDocs(query(
          collection(db, "users"),
          where("role", "==", "OPERATORE_PULIZIE")
        )),
      ]);

      console.log(`✅ Dashboard: ${Date.now() - startTime}ms`);

      // Mappa proprietà per lookup veloce
      const propertiesMap = new Map();
      propertiesSnapshot.docs.forEach(doc => {
        propertiesMap.set(doc.id, { id: doc.id, ...doc.data() });
      });

      // Trasforma pulizie
      const cleanings = cleaningsSnapshot.docs.map(doc => {
        const data = doc.data();
        const property = propertiesMap.get(data.propertyId);

        // 🔍 DEBUG: Log dati RAW dal database
        console.log(`🔍 DEBUG RAW [${data.propertyName}]:`, {
          operatorId: data.operatorId,
          operatorName: data.operatorName,
          operators: data.operators,
          operatorsType: typeof data.operators,
          operatorsIsArray: Array.isArray(data.operators),
        });

        // 🔥 LEGGI l'array operators dal database
        let operatorsArray: Array<{id: string, name: string}> = [];
        
        // Caso 1: operators è un array valido
        if (Array.isArray(data.operators) && data.operators.length > 0) {
          operatorsArray = data.operators.filter((op: any) => op && op.id);
          console.log(`  ✅ Caso 1: Array trovato con ${operatorsArray.length} operatori`);
        }
        // Caso 2: solo operatorId singolo (vecchio formato)
        else if (data.operatorId) {
          operatorsArray = [{ id: data.operatorId, name: data.operatorName || "Operatore" }];
          console.log(`  ⚠️ Caso 2: Migrato da singolo operatorId`);
        }
        else {
          console.log(`  ❌ Caso 3: Nessun operatore trovato`);
        }

        // Costruisci l'array nel formato che il componente si aspetta
        const operatorsFormatted = operatorsArray.map(op => ({
          id: op.id,
          operator: { id: op.id, name: op.name }
        }));

        console.log(`  📤 Output operators:`, operatorsFormatted);

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
          // Singolo operatore per retrocompatibilità
          operator: operatorsArray[0] ? {
            id: operatorsArray[0].id,
            name: operatorsArray[0].name,
          } : null,
          // 🔥 ARRAY COMPLETO NEL FORMATO CORRETTO
          operators: operatorsFormatted,
          booking: {
            guestName: data.guestName || "",
            guestsCount: data.guestsCount || 2,
          },
        };
      });

      // Trasforma operatori
      const operators = operatorsSnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name || "Operatore",
      }));

      return {
        stats: {
          cleaningsToday: cleaningsSnapshot.docs.length,
          operatorsActive: operatorsSnapshot.docs.length,
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
