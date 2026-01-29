"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { collection, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

// ==================== TIPI ====================

export interface RealtimeCleaning {
  id: string;
  propertyId: string;
  propertyName?: string;
  propertyAddress?: string;
  operatorId?: string;
  operatorName?: string;
  operators?: { id: string; name: string }[];
  scheduledDate: Date;
  scheduledTime?: string;
  status: string;
  type?: string;
  price?: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RealtimeOrder {
  id: string;
  cleaningId?: string;
  propertyId: string;
  propertyName?: string;
  propertyAddress?: string;
  riderId?: string;
  riderName?: string;
  status: string;
  type?: string;
  scheduledDate?: Date;
  items: { id: string; name: string; quantity: number }[];
  notes?: string;
  deliveredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface RealtimeProperty {
  id: string;
  name: string;
  address: string;
  city?: string;
  ownerId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

// ==================== GENERIC REALTIME HOOK ====================

export function useRealtimeCollection<T>(
  collectionName: string,
  enabled: boolean = true
) {
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const unsubscribe = onSnapshot(
      collection(db, collectionName),
      (snapshot) => {
        const items = snapshot.docs.map((doc) => {
          const docData = doc.data();
          // Converti tutti i Timestamp in Date
          const convertedData: Record<string, unknown> = { id: doc.id };
          
          Object.keys(docData).forEach((key) => {
            const value = docData[key];
            if (value instanceof Timestamp) {
              convertedData[key] = value.toDate();
            } else if (value?.toDate && typeof value.toDate === 'function') {
              convertedData[key] = value.toDate();
            } else {
              convertedData[key] = value;
            }
          });
          
          return convertedData as T;
        });

        setData(items);
        setIsLoading(false);
        setLastUpdate(new Date());
      },
      (err) => {
        console.error(`Errore realtime ${collectionName}:`, err);
        setError(`Errore nel caricamento di ${collectionName}`);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [collectionName, enabled]);

  return { data, isLoading, error, lastUpdate };
}

// ==================== CLEANINGS REALTIME ====================

export function useRealtimeCleanings(filterFn?: (c: RealtimeCleaning) => boolean) {
  const { data, isLoading, error, lastUpdate } = useRealtimeCollection<RealtimeCleaning>("cleanings");

  const filteredData = filterFn ? data.filter(filterFn) : data;

  // Ordina per data
  const sortedData = [...filteredData].sort((a, b) => {
    const dateA = a.scheduledDate?.getTime() || 0;
    const dateB = b.scheduledDate?.getTime() || 0;
    return dateB - dateA;
  });

  return {
    cleanings: sortedData,
    isLoading,
    error,
    lastUpdate,
    // Stats
    totalCount: sortedData.length,
    pendingCount: sortedData.filter(c => c.status === 'PENDING').length,
    inProgressCount: sortedData.filter(c => c.status === 'IN_PROGRESS').length,
    completedCount: sortedData.filter(c => c.status === 'COMPLETED').length,
  };
}

// Hook per pulizie di oggi
export function useRealtimeCleaningsToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return useRealtimeCleanings((c) => {
    const date = c.scheduledDate;
    if (!date) return false;
    return date >= today && date < tomorrow;
  });
}

// Hook per pulizie di un operatore
export function useRealtimeCleaningsByOperator(operatorId: string) {
  return useRealtimeCleanings((c) => c.operatorId === operatorId);
}

// ==================== ORDERS REALTIME ====================

export function useRealtimeOrders(filterFn?: (o: RealtimeOrder) => boolean) {
  const { data, isLoading, error, lastUpdate } = useRealtimeCollection<RealtimeOrder>("orders");

  const filteredData = filterFn ? data.filter(filterFn) : data;

  // Ordina per data
  const sortedData = [...filteredData].sort((a, b) => {
    const dateA = a.createdAt?.getTime() || 0;
    const dateB = b.createdAt?.getTime() || 0;
    return dateB - dateA;
  });

  return {
    orders: sortedData,
    isLoading,
    error,
    lastUpdate,
    // Stats
    totalCount: sortedData.length,
    pendingCount: sortedData.filter(o => o.status === 'PENDING').length,
    assignedCount: sortedData.filter(o => o.status === 'ASSIGNED').length,
    inProgressCount: sortedData.filter(o => o.status === 'IN_PROGRESS').length,
    deliveredCount: sortedData.filter(o => o.status === 'DELIVERED').length,
  };
}

// Hook per ordini di oggi
export function useRealtimeOrdersToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return useRealtimeOrders((o) => {
    const date = o.scheduledDate;
    if (!date) return false;
    return date >= today && date < tomorrow;
  });
}

// Hook per ordini di un rider
export function useRealtimeOrdersByRider(riderId: string) {
  return useRealtimeOrders((o) => o.riderId === riderId);
}

// ==================== PROPERTIES REALTIME ====================

export function useRealtimeProperties(filterFn?: (p: RealtimeProperty) => boolean) {
  const { data, isLoading, error, lastUpdate } = useRealtimeCollection<RealtimeProperty>("properties");

  const filteredData = filterFn ? data.filter(filterFn) : data;

  // Ordina per nome
  const sortedData = [...filteredData].sort((a, b) => 
    (a.name || "").localeCompare(b.name || "")
  );

  return {
    properties: sortedData,
    isLoading,
    error,
    lastUpdate,
    totalCount: sortedData.length,
    activeCount: sortedData.filter(p => p.status === 'ACTIVE').length,
  };
}

// Hook per proprietà di un owner
export function useRealtimePropertiesByOwner(ownerId: string) {
  return useRealtimeProperties((p) => p.ownerId === ownerId);
}

// ==================== USERS REALTIME ====================

export interface RealtimeUser {
  id: string;
  name: string;
  surname?: string;
  email: string;
  phone?: string;
  role: string;
  status: string;
  createdAt: Date;
}

export function useRealtimeUsers(filterFn?: (u: RealtimeUser) => boolean) {
  const { data, isLoading, error, lastUpdate } = useRealtimeCollection<RealtimeUser>("users");

  const filteredData = filterFn ? data.filter(filterFn) : data;

  // Ordina per nome
  const sortedData = [...filteredData].sort((a, b) => 
    (a.name || "").localeCompare(b.name || "")
  );

  return {
    users: sortedData,
    isLoading,
    error,
    lastUpdate,
    totalCount: sortedData.length,
    activeCount: sortedData.filter(u => u.status === 'ACTIVE').length,
    suspendedCount: sortedData.filter(u => u.status === 'SUSPENDED').length,
  };
}

// Hook per utenti per ruolo
export function useRealtimeUsersByRole(role: string) {
  return useRealtimeUsers((u) => u.role === role);
}

// ==================== COMBINED DASHBOARD REALTIME ====================

export function useRealtimeDashboard() {
  const { cleanings, ...cleaningsRest } = useRealtimeCleaningsToday();
  const { orders, ...ordersRest } = useRealtimeOrdersToday();
  const { properties, ...propertiesRest } = useRealtimeProperties();
  const { users, ...usersRest } = useRealtimeUsers();

  const isLoading = cleaningsRest.isLoading || ordersRest.isLoading || 
                    propertiesRest.isLoading || usersRest.isLoading;

  return {
    // Data
    cleaningsToday: cleanings,
    ordersToday: orders,
    properties,
    users,
    
    // Stats
    stats: {
      cleaningsToday: cleanings.length,
      cleaningsPending: cleaningsRest.pendingCount,
      cleaningsInProgress: cleaningsRest.inProgressCount,
      cleaningsCompleted: cleaningsRest.completedCount,
      
      ordersToday: orders.length,
      ordersPending: ordersRest.pendingCount,
      ordersInProgress: ordersRest.inProgressCount,
      ordersDelivered: ordersRest.deliveredCount,
      
      propertiesTotal: propertiesRest.totalCount,
      propertiesActive: propertiesRest.activeCount,
      
      usersTotal: usersRest.totalCount,
      usersActive: usersRest.activeCount,
    },
    
    isLoading,
    lastUpdate: new Date(),
  };
}
