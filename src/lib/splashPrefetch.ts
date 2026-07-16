/**
 * splashPrefetch — prefetch dati post-login, estratto dallo splash.
 * Riempie le cache react-query lette dalla dashboard admin
 * (["dashboard"], ["properties"]) e — per i proprietari — le chiavi dedicate.
 * Bookings filtrate server-side (checkOut >= oggi). Ogni query ha timeout:
 * in caso di errore o stallo la funzione risolve comunque, mai bloccante.
 */

import type { QueryClient } from "@tanstack/react-query";
import { collection, getDocs, query, orderBy, where, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

const QUERY_TIMEOUT_MS = 6000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout:${label}`)), ms)
    ),
  ]);
}

export async function splashPrefetch(
  queryClient: QueryClient,
  userId: string | undefined,
  destination: string,
  onText?: (text: string) => void
): Promise<void> {
  const isProprietario = destination.includes("proprietario");

  try {
    onText?.("Caricamento proprietà...");

    const propertiesSnapshot = await withTimeout(
      getDocs(query(collection(db, "properties"), orderBy("name", "asc"))),
      QUERY_TIMEOUT_MS, "properties"
    );

    const allProperties = propertiesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...(doc.data() as Record<string, any>),
      cleaningPrice: (doc.data() as Record<string, any>).cleaningPrice || 0,
      owner: { name: (doc.data() as Record<string, any>).ownerName || "" },
    }));

    const activeProperties = allProperties.filter((p: any) => p.status === "ACTIVE");
    const pendingProperties = allProperties.filter((p: any) => p.status === "PENDING");
    const suspendedProperties = allProperties.filter((p: any) => p.status === "SUSPENDED");

    queryClient.setQueryData(["properties"], {
      activeProperties, pendingProperties, suspendedProperties, proprietari: [],
    });

    if (isProprietario && userId) {
      onText?.("Caricamento tue proprietà...");

      const ownerProperties = allProperties.filter((p: any) => p.ownerId === userId);
      const propertyIds = ownerProperties.map((p: any) => p.id);

      queryClient.setQueryData(["proprietario-properties"], {
        activeProperties: ownerProperties.filter((p: any) => p.status === "ACTIVE"),
        pendingProperties: ownerProperties.filter((p: any) => p.status !== "ACTIVE"),
      });

      onText?.("Caricamento dashboard...");

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const [cleaningsSnapshot, bookingsSnapshot] = await withTimeout(
        Promise.all([
          getDocs(query(collection(db, "cleanings"),
            where("scheduledDate", ">=", Timestamp.fromDate(todayStart)),
            where("scheduledDate", "<=", Timestamp.fromDate(nextWeek))
          )),
          // 🚀 PERF: filtro server-side su checkOut (prima scaricava TUTTA la collezione)
          getDocs(query(collection(db, "bookings"),
            where("checkOut", ">=", Timestamp.fromDate(todayStart))
          )),
        ]),
        QUERY_TIMEOUT_MS, "proprietario-dashboard"
      );

      const myCleanings = cleaningsSnapshot.docs
        .map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) }))
        .filter((c: any) => propertyIds.includes(c.propertyId));

      const myBookings = bookingsSnapshot.docs
        .map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) }))
        .filter((b: any) => propertyIds.includes(b.propertyId));

      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      const cleaningsToday = myCleanings.filter((c: any) => {
        const d = c.scheduledDate?.toDate?.();
        return d && d.toISOString().split('T')[0] === todayStr;
      });

      const activeBookings = myBookings.filter((b: any) => {
        const co = b.checkOut?.toDate?.();
        return co && co >= new Date();
      });

      const upcomingCleanings = myCleanings
        .filter((c: any) => c.scheduledDate?.toDate?.() >= today)
        .sort((a: any, b: any) => {
          const da = a.scheduledDate?.toDate?.() || new Date(0);
          const dbb = b.scheduledDate?.toDate?.() || new Date(0);
          return da.getTime() - dbb.getTime();
        })
        .slice(0, 5);

      queryClient.setQueryData(["proprietario-dashboard", userId], {
        stats: {
          properties: ownerProperties.length,
          bookings: activeBookings.length,
          cleaningsToday: cleaningsToday.length
        },
        upcomingCleanings
      });

    } else {
      onText?.("Caricamento dashboard...");

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const [cleaningsSnapshot, operatorsSnapshot] = await withTimeout(
        Promise.all([
          getDocs(query(collection(db, "cleanings"),
            where("scheduledDate", ">=", Timestamp.fromDate(today)),
            where("scheduledDate", "<", Timestamp.fromDate(tomorrow))
          )),
          getDocs(query(collection(db, "users"), where("role", "==", "OPERATORE_PULIZIE"))),
        ]),
        QUERY_TIMEOUT_MS, "admin-dashboard"
      );

      const propertiesMap = new Map();
      propertiesSnapshot.docs.forEach(doc => propertiesMap.set(doc.id, { id: doc.id, ...(doc.data() as Record<string, any>) }));

      const cleanings = cleaningsSnapshot.docs.map(doc => {
        const data = doc.data() as Record<string, any>;
        const property = propertiesMap.get(data.propertyId);

        let operatorsArray: Array<{ id: string, name: string }> = data.operators || [];
        if (operatorsArray.length === 0 && data.operatorId) {
          operatorsArray = [{ id: data.operatorId, name: data.operatorName || "Operatore" }];
        }
        operatorsArray = operatorsArray.filter(op => op && op.id);

        return {
          id: doc.id,
          date: data.scheduledDate?.toDate?.() || new Date(),
          scheduledTime: data.scheduledTime || "10:00",
          status: data.status || "pending",
          guestsCount: data.guestsCount || 2,
          property: { id: data.propertyId || "", name: data.propertyName || property?.name || "Proprietà", address: property?.address || "", imageUrl: null, maxGuests: property?.maxGuests || 6 },
          operator: operatorsArray[0] ? { id: operatorsArray[0].id, name: operatorsArray[0].name } : null,
          operators: operatorsArray.map(op => ({ id: op.id, operator: { id: op.id, name: op.name } })),
          booking: { guestName: data.guestName || "", guestsCount: data.guestsCount || 2 },
        };
      });

      queryClient.setQueryData(["dashboard"], {
        stats: { cleaningsToday: cleaningsSnapshot.docs.length, operatorsActive: operatorsSnapshot.docs.length, propertiesTotal: activeProperties.length, checkinsWeek: 0 },
        cleanings,
        operators: operatorsSnapshot.docs.map(doc => ({ id: doc.id, name: (doc.data() as Record<string, any>).name || "Operatore" })),
      });
    }

    onText?.("Tutto pronto!");
  } catch (error) {
    console.error("❌ SPLASH PREFETCH: interrotto, proseguo:", error);
    // mai bloccante: risolve comunque
  }
}
