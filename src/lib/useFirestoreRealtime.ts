"use client";

import { useState, useEffect } from "react";
import { collection, query, orderBy, where, Timestamp, onSnapshot } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

// ============================================================
// STORAGE HELPERS
// ============================================================
const CACHE_KEYS = {
  DASHBOARD: 'dashboard_cache',
  DASHBOARD_TIMESTAMP: 'dashboard_cache_time',
};

function getFromCache<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const cached = localStorage.getItem(key);
    return cached ? JSON.parse(cached) : fallback;
  } catch { return fallback; }
}

function saveToCache(key: string, data: any): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem(CACHE_KEYS.DASHBOARD_TIMESTAMP, Date.now().toString());
  } catch {}
}

// ============================================================
// HOOK: Dashboard Admin - REALTIME con onSnapshot + CACHE
// FILTRO: Mostra solo pulizie/ordini di proprietà ATTIVE
// ============================================================
export function useDashboardRealtime() {
  // 🔄 INIZIALIZZA DA CACHE - Zero loading se abbiamo dati!
  const [data, setData] = useState<any>(() => getFromCache(CACHE_KEYS.DASHBOARD, null));
  const [isLoading, setIsLoading] = useState(() => {
    // Loading solo se non abbiamo cache
    return getFromCache(CACHE_KEYS.DASHBOARD, null) === null;
  });
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    console.log("🔴 Dashboard Realtime: Avvio listeners...");

    // Prepara date per query pulizie di oggi
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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

      // 🔥 SET degli ID delle proprietà ATTIVE per filtro
      const activePropertyIds = new Set(propertiesData.map(p => p.id));

      // Mappa riders per lookup veloce
      const ridersMap = new Map();
      ridersData.forEach(r => ridersMap.set(r.id, r));

      // 🔥 FILTRA pulizie: SOLO quelle con propertyId di proprietà ATTIVE
      const filteredCleanings = cleaningsData.filter(item => {
        if (!item.propertyId) return false;
        return activePropertyIds.has(item.propertyId);
      });

      // Trasforma pulizie filtrate
      const cleanings = filteredCleanings.map(item => {
        const property = propertiesMap.get(item.propertyId);
        const contractPrice = property?.cleaningPrice || 0;
        
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
          notes: item.notes || "",
          // Prezzi
          price: item.price || item.manualPrice || contractPrice,
          contractPrice: contractPrice,
          priceModified: item.priceModified || false,
          priceChangeReason: item.priceChangeReason || null,
          // Tipo servizio
          serviceType: item.serviceType || "STANDARD",
          serviceTypeName: item.serviceTypeName || "Pulizia Standard",
          sgrossoReason: item.sgrossoReason || null,
          sgrossoReasonLabel: item.sgrossoReasonLabel || null,
          sgrossoNotes: item.sgrossoNotes || null,
          // Tracciamento modifica data
          originalDate: item.originalDate?.toDate?.() || null,
          dateModifiedAt: item.dateModifiedAt?.toDate?.() || null,
          // Campi per pulizie completate
          photos: item.photos || [],
          startedAt: item.startedAt || null,
          completedAt: item.completedAt || null,
          // Campi per valutazione
          ratingScore: item.ratingScore || null,
          ratingId: item.ratingId || null,
          extraServices: item.extraServices || [],
          property: {
            id: item.propertyId || "",
            name: item.propertyName || property?.name || "Proprietà",
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
            guestName: item.guestName || "",
            guestsCount: item.guestsCount || 2,
          },
        };
      });

      // 🔥 FILTRA ordini: SOLO quelli con propertyId di proprietà ATTIVE e data OGGI
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const filteredOrders = ordersData.filter(item => {
        if (!item.propertyId) return false;
        if (!activePropertyIds.has(item.propertyId)) return false;
        
        // Filtra per data oggi
        const scheduledDate = item.scheduledDate?.toDate?.();
        if (!scheduledDate) return false;
        return scheduledDate >= today && scheduledDate < tomorrow;
      });

      // Mappa pulizie per lookup veloce (per collegare ordini a pulizie)
      const cleaningsMap = new Map();
      filteredCleanings.forEach(c => cleaningsMap.set(c.id, c));

      // Trasforma ordini filtrati
      const orders = filteredOrders.map(item => {
        const property = propertiesMap.get(item.propertyId);
        const rider = item.riderId ? ridersMap.get(item.riderId) : null;
        
        // Trova pulizia collegata se esiste
        const linkedCleaning = item.cleaningId ? cleaningsMap.get(item.cleaningId) : null;

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
          urgency: item.urgency || "normal",
          items: item.items || [],
          scheduledDate: item.scheduledDate?.toDate?.() || null,
          scheduledTime: item.scheduledTime || linkedCleaning?.scheduledTime || null,
          cleaningId: item.cleaningId || null,
          // Dati pulizia collegata
          cleaning: linkedCleaning ? {
            scheduledTime: linkedCleaning.scheduledTime || null,
            status: linkedCleaning.status || null,
          } : null,
          // Ritiro biancheria
          includePickup: item.includePickup !== false, // Default true
          pickupItems: item.pickupItems || [],
          pickupCompleted: item.pickupCompleted || false,
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
          cleaningsToday: cleanings.length, // Ora conta solo quelle filtrate
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
        pulizieTotali: cleaningsData.length,
        pulizieFiltrate: cleanings.length,
        ordiniTotali: ordersData.length,
        ordiniFiltrati: orders.length,
        proprietàAttive: activePropertyIds.size,
      });

      // 🔄 Salva in cache per persistenza
      saveToCache(CACHE_KEYS.DASHBOARD, newData);
      
      setData(newData);
      setIsLoading(false);
    };

    // Listener 1: Proprietà ATTIVE (solo queste!)
    const unsubProperties = onSnapshot(
      query(collection(db, "properties"), where("status", "==", "ACTIVE")),
      (snapshot) => {
        propertiesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        loadedCount++;
        if (loadedCount >= totalListeners) updateDashboard();
        else if (loadedCount === totalListeners) updateDashboard();
        if (loadedCount > totalListeners) updateDashboard();
      },
      (err) => {
        console.error("Errore properties:", err);
        setError(err);
      }
    );

    // Listener 2: Pulizie di oggi
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    
    const unsubCleanings = onSnapshot(
      query(
        collection(db, "cleanings"),
        where("scheduledDate", ">=", Timestamp.fromDate(todayStart)),
        where("scheduledDate", "<=", Timestamp.fromDate(todayEnd))
      ),
      (snapshot) => {
        cleaningsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log("📋 Pulizie oggi caricate (pre-filtro):", cleaningsData.length);
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
// FILTRO: Mostra solo ordini di proprietà ATTIVE
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

      // 🔥 SET degli ID delle proprietà ATTIVE
      const activePropertyIds = new Set(propertiesData.map(p => p.id));

      // 🔥 FILTRA ordini solo per proprietà ATTIVE
      const filteredOrders = ordersData.filter(item => {
        if (!item.propertyId) return false;
        return activePropertyIds.has(item.propertyId);
      });

      const orders = filteredOrders.map(item => {
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

      console.log("🔄 Rider Orders: Aggiornati!", {
        totali: ordersData.length,
        filtrati: orders.length
      });
      setData(orders);
      setIsLoading(false);
    };

    // 🔥 Carica SOLO proprietà ATTIVE
    const unsubProperties = onSnapshot(
      query(collection(db, "properties"), where("status", "==", "ACTIVE")),
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
// FILTRO: Mostra solo pulizie di proprietà ATTIVE
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
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    let propertiesData: any[] = [];
    let cleaningsData: any[] = [];
    let loadedCount = 0;

    const updateCleanings = () => {
      // 🔥 SET degli ID delle proprietà ATTIVE
      const activePropertyIds = new Set(propertiesData.map(p => p.id));

      // Filtra per operatore E per proprietà ATTIVA
      const myCleanings = cleaningsData.filter((c: any) => {
        // Prima verifica che la proprietà sia attiva
        if (!c.propertyId || !activePropertyIds.has(c.propertyId)) {
          return false;
        }
        
        // Poi verifica che sia assegnata a questo operatore
        if (Array.isArray(c.operators)) {
          return c.operators.some((op: any) => op.id === operatorId);
        }
        return c.operatorId === operatorId;
      });

      console.log("🔄 Operator Cleanings: Aggiornate!", {
        totali: cleaningsData.length,
        filtrate: myCleanings.length
      });
      setData(myCleanings);
      setIsLoading(false);
    };

    // 🔥 Carica SOLO proprietà ATTIVE
    const unsubProperties = onSnapshot(
      query(collection(db, "properties"), where("status", "==", "ACTIVE")),
      (snapshot) => {
        propertiesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        loadedCount++;
        if (loadedCount >= 2) updateCleanings();
      }
    );

    const unsubCleanings = onSnapshot(
      query(
        collection(db, "cleanings"),
        where("scheduledDate", ">=", Timestamp.fromDate(todayStart)),
        where("scheduledDate", "<=", Timestamp.fromDate(todayEnd))
      ),
      (snapshot) => {
        cleaningsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        loadedCount++;
        if (loadedCount >= 2) updateCleanings();
      }
    );

    return () => {
      unsubProperties();
      unsubCleanings();
    };
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
