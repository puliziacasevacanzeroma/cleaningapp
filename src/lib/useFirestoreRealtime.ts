"use client";

import { useState, useEffect } from "react";
import { collection, query, orderBy, where, Timestamp, onSnapshot } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

// ============================================================
// HOOK: Dashboard Admin - REALTIME con onSnapshot
// ============================================================
export function useDashboardRealtime() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    console.log("🔴 Dashboard Realtime: Avvio listeners...");

    // Prepara date per query pulizie di oggi
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Stato locale per raccogliere tutti i dati
    let propertiesData: any[] = [];
    let cleaningsData: any[] = [];
    let operatorsData: any[] = [];
    let ordersData: any[] = [];
    let ridersData: any[] = [];
    
    // Flag per sapere quando tutti i listener hanno caricato
    let loadedCount = 0;
    const totalListeners = 5;

    const updateDashboard = () => {
      // Mappa proprietà per lookup veloce
      const propertiesMap = new Map();
      propertiesData.forEach(p => propertiesMap.set(p.id, p));

      // Mappa riders per lookup veloce
      const ridersMap = new Map();
      ridersData.forEach(r => ridersMap.set(r.id, r));

      // Trasforma pulizie
      const cleanings = cleaningsData.map(item => {
        const property = propertiesMap.get(item.propertyId);
        
        let operatorsArray: Array<{id: string, name: string}> = [];
        if (Array.isArray(item.operators) && item.operators.length > 0) {
          operatorsArray = item.operators.filter((op: any) => 
            op && op.id && op.name && op.name.trim() !== '' && op.name !== 'undefined'
          );
        } else if (item.operatorId && item.operatorName && item.operatorName.trim() !== '') {
          operatorsArray = [{ id: item.operatorId, name: item.operatorName }];
        }

        return {
          id: item.id,
          date: item.scheduledDate?.toDate?.() || new Date(),
          scheduledTime: item.scheduledTime || "10:00",
          status: item.status || "pending",
          guestsCount: item.guestsCount || 2,
          property: {
            id: item.propertyId || "",
            name: item.propertyName || property?.name || "Proprietà",
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
            guestName: item.guestName || "",
            guestsCount: item.guestsCount || 2,
          },
        };
      });

      // Trasforma ordini
      const orders = ordersData.map(item => {
        const property = propertiesMap.get(item.propertyId);
        const rider = item.riderId ? ridersMap.get(item.riderId) : null;

        return {
          id: item.id,
          propertyId: item.propertyId || "",
          propertyName: item.propertyName || property?.name || "Proprietà",
          propertyAddress: item.propertyAddress || property?.address || "",
          propertyCity: item.propertyCity || property?.city || "",
          propertyPostalCode: item.propertyPostalCode || property?.postalCode || "",
          propertyFloor: item.propertyFloor || property?.floor || "",
          riderId: item.riderId || null,
          riderName: item.riderName || rider?.name || null,
          status: item.status || "PENDING",
          items: item.items || [],
          scheduledDate: item.scheduledDate?.toDate?.() || null,
          notes: item.notes || "",
          createdAt: item.createdAt?.toDate?.() || new Date(),
        };
      });

      // Conta ordini attivi
      const activeOrders = orders.filter(o => 
        o.status !== "DELIVERED" && o.status !== "COMPLETED"
      );

      // Filtra operatori validi
      const operators = operatorsData.filter(op => 
        op.name && op.name.trim() !== '' && op.name !== 'undefined'
      );

      // Filtra riders validi
      const riders = ridersData.filter(r => 
        r.name && r.name.trim() !== '' && r.name !== 'undefined' && r.role === 'RIDER'
      );

      const newData = {
        stats: {
          cleaningsToday: cleaningsData.length,
          operatorsActive: operators.length,
          propertiesTotal: propertiesData.length,
          checkinsWeek: 0,
          ordersToday: activeOrders.length,
          ordersPending: orders.filter(o => o.status === "PENDING").length,
        },
        cleanings,
        operators,
        orders,
        riders,
      };

      console.log("🔄 Dashboard Realtime: Dati aggiornati!", {
        pulizie: cleanings.length,
        ordini: orders.length,
      });

      setData(newData);
      setIsLoading(false);
    };

    // Listener 1: Proprietà attive
    const unsubProperties = onSnapshot(
      query(collection(db, "properties"), where("status", "==", "ACTIVE")),
      (snapshot) => {
        propertiesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        loadedCount++;
        if (loadedCount >= totalListeners) updateDashboard();
        else if (loadedCount === totalListeners) updateDashboard();
        if (loadedCount > totalListeners) updateDashboard(); // Update on changes
      },
      (err) => {
        console.error("Errore properties:", err);
        setError(err);
      }
    );

    // Listener 2: Pulizie di oggi
    const unsubCleanings = onSnapshot(
      query(
        collection(db, "cleanings"),
        where("scheduledDate", ">=", Timestamp.fromDate(today)),
        where("scheduledDate", "<", Timestamp.fromDate(tomorrow))
      ),
      (snapshot) => {
        cleaningsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        loadedCount++;
        if (loadedCount >= totalListeners) updateDashboard();
      },
      (err) => {
        console.error("Errore cleanings:", err);
        setError(err);
      }
    );

    // Listener 3: Operatori
    const unsubOperators = onSnapshot(
      query(collection(db, "users"), where("role", "==", "OPERATORE_PULIZIE")),
      (snapshot) => {
        operatorsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        loadedCount++;
        if (loadedCount >= totalListeners) updateDashboard();
      },
      (err) => {
        console.error("Errore operators:", err);
        setError(err);
      }
    );

    // Listener 4: Ordini
    const unsubOrders = onSnapshot(
      collection(db, "orders"),
      (snapshot) => {
        ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        loadedCount++;
        if (loadedCount >= totalListeners) updateDashboard();
      },
      (err) => {
        console.error("Errore orders:", err);
        setError(err);
      }
    );

    // Listener 5: Riders
    const unsubRiders = onSnapshot(
      query(collection(db, "users"), where("role", "==", "RIDER")),
      (snapshot) => {
        ridersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        loadedCount++;
        if (loadedCount >= totalListeners) updateDashboard();
      },
      (err) => {
        console.error("Errore riders:", err);
        setError(err);
      }
    );

    // Cleanup
    return () => {
      console.log("🔴 Dashboard Realtime: Chiusura listeners");
      unsubProperties();
      unsubCleanings();
      unsubOperators();
      unsubOrders();
      unsubRiders();
    };
  }, []);

  return { data, isLoading, error };
}

// ============================================================
// HOOK: Ordini Rider - REALTIME
// ============================================================
export function useRiderOrdersRealtime() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    console.log("🔴 Rider Orders Realtime: Avvio listener...");

    let propertiesData: any[] = [];
    let ordersData: any[] = [];
    let loadedCount = 0;

    const updateOrders = () => {
      const propertiesMap = new Map();
      propertiesData.forEach(p => propertiesMap.set(p.id, p));

      const orders = ordersData.map(item => {
        const property = propertiesMap.get(item.propertyId);
        return {
          id: item.id,
          propertyId: item.propertyId || "",
          propertyName: item.propertyName || property?.name || "Proprietà",
          propertyAddress: item.propertyAddress || property?.address || "",
          propertyCity: item.propertyCity || property?.city || "",
          propertyFloor: item.propertyFloor || property?.floor || "",
          status: item.status || "PENDING",
          items: item.items || [],
          notes: item.notes || "",
          createdAt: item.createdAt?.toDate?.() || new Date(),
        };
      });

      console.log("🔄 Rider Orders: Aggiornati!", orders.length);
      setData(orders);
      setIsLoading(false);
    };

    const unsubProperties = onSnapshot(
      collection(db, "properties"),
      (snapshot) => {
        propertiesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        loadedCount++;
        if (loadedCount >= 2) updateOrders();
      }
    );

    const unsubOrders = onSnapshot(
      collection(db, "orders"),
      (snapshot) => {
        ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        loadedCount++;
        if (loadedCount >= 2) updateOrders();
      }
    );

    return () => {
      unsubProperties();
      unsubOrders();
    };
  }, []);

  return { data, isLoading };
}

// ============================================================
// HOOK: Pulizie Operatore - REALTIME
// ============================================================
export function useOperatorCleaningsRealtime(operatorId: string | null) {
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!operatorId) {
      setIsLoading(false);
      return;
    }

    console.log("🔴 Operator Cleanings Realtime: Avvio listener per", operatorId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const unsubCleanings = onSnapshot(
      query(
        collection(db, "cleanings"),
        where("scheduledDate", ">=", Timestamp.fromDate(today)),
        where("scheduledDate", "<", Timestamp.fromDate(tomorrow))
      ),
      (snapshot) => {
        const allCleanings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Filtra per operatore
        const myCleanings = allCleanings.filter((c: any) => {
          if (Array.isArray(c.operators)) {
            return c.operators.some((op: any) => op.id === operatorId);
          }
          return c.operatorId === operatorId;
        });

        console.log("🔄 Operator Cleanings: Aggiornate!", myCleanings.length);
        setData(myCleanings);
        setIsLoading(false);
      }
    );

    return () => unsubCleanings();
  }, [operatorId]);

  return { data, isLoading };
}

// ============================================================
// HOOK: Proprietà Admin - REALTIME
// ============================================================
export function usePropertiesRealtime() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    console.log("🔴 Properties Realtime: Avvio listener...");

    const unsub = onSnapshot(
      query(collection(db, "properties"), orderBy("name", "asc")),
      (snapshot) => {
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

        console.log("🔄 Properties: Aggiornate!", {
          active: activeProperties.length,
          pending: pendingProperties.length,
        });

        setData({
          activeProperties,
          pendingProperties,
          suspendedProperties,
          proprietari: [],
        });
        setIsLoading(false);
      }
    );

    return () => unsub();
  }, []);

  return { data, isLoading };
}
