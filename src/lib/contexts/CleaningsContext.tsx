"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { collection, onSnapshot, query, orderBy, where, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { useAuth } from "~/lib/firebase/AuthContext";

// Tipi
interface Property {
  id: string;
  name: string;
  address: string;
  imageUrl?: string | null;
  ownerId: string;
  cleaningPrice: number;
  maxGuests: number;
  bedrooms: number;
  bathrooms: number;
  bedsConfig: any[];
  serviceConfigs: Record<string, any>;
  color?: string;
}

interface Operator {
  id: string;
  name: string;
}

interface Cleaning {
  id: string;
  propertyId: string;
  propertyName: string;
  date: Date;
  scheduledTime: string;
  status: string;
  operator: Operator | null;
  operators: Operator[];
  guestName: string;
  guestsCount: number;
  adulti: number;
  neonati: number;
  bookingSource: string;
  notes: string;
  price: number;
}

interface Booking {
  id: string;
  propertyId: string;
  guestName: string;
  checkIn: Date;
  checkOut: Date;
  status: string;
  source?: string;
}

interface CleaningsContextType {
  properties: Property[];
  cleanings: Cleaning[];
  bookings: Booking[];
  operators: Operator[];
  isLoading: boolean;
  isRefreshing: boolean;
  hasCachedData: boolean;
  lastUpdate: Date | null;
  refresh: () => void;
}

const CleaningsContext = createContext<CleaningsContextType | null>(null);

// Cache globale
let globalCache = {
  properties: [] as Property[],
  cleanings: [] as Cleaning[],
  bookings: [] as Booking[],
  operators: [] as Operator[],
  lastUpdate: null as Date | null,
  initialized: false,
};

export function CleaningsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  
  const [properties, setProperties] = useState<Property[]>(globalCache.properties);
  const [cleanings, setCleanings] = useState<Cleaning[]>(globalCache.cleanings);
  const [bookings, setBookings] = useState<Booking[]>(globalCache.bookings);
  const [operators, setOperators] = useState<Operator[]>(globalCache.operators);
  const [isLoading, setIsLoading] = useState(!globalCache.initialized);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(globalCache.lastUpdate);

  const hasCachedData = globalCache.initialized && globalCache.properties.length > 0;

  useEffect(() => {
    if (!user?.id) return;

    if (hasCachedData) {
      setIsRefreshing(true);
    }

    console.log("🔄 DataContext: Avvio listeners realtime...");

    // Data limite: 14 giorni fa
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const startDate = Timestamp.fromDate(twoWeeksAgo);

    // 1. Proprietà ATTIVE
    const unsubProps = onSnapshot(
      query(collection(db, "properties"), where("status", "==", "ACTIVE")),
      (snap) => {
        const props = snap.docs.map(d => ({
          id: d.id,
          name: d.data().name || "",
          address: d.data().address || "",
          imageUrl: d.data().imageUrl || null,
          ownerId: d.data().ownerId || "",
          cleaningPrice: d.data().cleaningPrice || 0,
          maxGuests: d.data().maxGuests || 0,
          bedrooms: d.data().bedrooms || 0,
          bathrooms: d.data().bathrooms || 0,
          bedsConfig: d.data().bedsConfig || [],
          serviceConfigs: d.data().serviceConfigs || {},
          color: "rose",
        }));
        
        setProperties(props);
        globalCache.properties = props;
        globalCache.initialized = true;
        
        setIsLoading(false);
        setIsRefreshing(false);
        setLastUpdate(new Date());
        globalCache.lastUpdate = new Date();
        
        console.log("✅ DataContext: Proprietà:", props.length);
      }
    );

    // 2. Pulizie RECENTI
    const unsubClean = onSnapshot(
      query(
        collection(db, "cleanings"), 
        where("scheduledDate", ">=", startDate), 
        orderBy("scheduledDate", "asc")
      ),
      (snap) => {
        const cleans = snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            propertyId: data.propertyId || "",
            propertyName: data.propertyName || "",
            date: data.scheduledDate?.toDate?.() || new Date(),
            scheduledTime: data.scheduledTime || "10:00",
            status: data.status || "SCHEDULED",
            operator: data.operatorId ? { id: data.operatorId, name: data.operatorName || "" } : null,
            operators: data.operators || [],
            guestName: data.guestName || "",
            guestsCount: data.guestsCount || 2,
            adulti: data.adulti || 0,
            neonati: data.neonati || 0,
            bookingSource: data.bookingSource || "",
            notes: data.notes || "",
            price: data.price || 0,
          };
        });
        
        setCleanings(cleans);
        globalCache.cleanings = cleans;
        console.log("✅ DataContext: Pulizie:", cleans.length);
      }
    );

    // 3. Prenotazioni (bookings)
    const unsubBookings = onSnapshot(
      collection(db, "bookings"),
      (snap) => {
        const now = new Date();
        const startRange = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endRange = new Date(now.getFullYear(), now.getMonth() + 3, 0);
        
        const books = snap.docs
          .map(d => {
            const data = d.data();
            const checkIn = data.checkIn?.toDate?.() || new Date(data.checkIn);
            const checkOut = data.checkOut?.toDate?.() || new Date(data.checkOut);
            return {
              id: d.id,
              propertyId: data.propertyId || "",
              guestName: data.guestName || "Ospite",
              checkIn,
              checkOut,
              status: data.status || "CONFIRMED",
              source: data.source,
            };
          })
          .filter(b => {
            return (b.checkIn >= startRange && b.checkIn <= endRange) ||
                   (b.checkOut >= startRange && b.checkOut <= endRange) ||
                   (b.checkIn <= startRange && b.checkOut >= endRange);
          })
          .sort((a, b) => a.checkIn.getTime() - b.checkIn.getTime());
        
        setBookings(books);
        globalCache.bookings = books;
        console.log("✅ DataContext: Prenotazioni:", books.length);
      }
    );

    // 4. Operatori
    const unsubOps = onSnapshot(
      query(collection(db, "users"), where("role", "==", "OPERATORE_PULIZIE")),
      (snap) => {
        const ops = snap.docs.map(d => ({
          id: d.id,
          name: d.data().name || d.data().email || "Operatore"
        }));
        
        setOperators(ops);
        globalCache.operators = ops;
        console.log("✅ DataContext: Operatori:", ops.length);
      }
    );

    return () => {
      unsubProps();
      unsubClean();
      unsubBookings();
      unsubOps();
    };
  }, [user?.id]);

  const refresh = useCallback(() => {
    setIsRefreshing(true);
  }, []);

  return (
    <CleaningsContext.Provider value={{
      properties,
      cleanings,
      bookings,
      operators,
      isLoading,
      isRefreshing,
      hasCachedData,
      lastUpdate,
      refresh,
    }}>
      {children}
    </CleaningsContext.Provider>
  );
}

export function useCleanings() {
  const context = useContext(CleaningsContext);
  if (!context) {
    throw new Error("useCleanings deve essere usato dentro CleaningsProvider");
  }
  return context;
}
