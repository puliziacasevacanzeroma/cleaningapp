"use client";

import { createContext, useContext, useEffect, useState, useCallback} from "react";
import { collection, onSnapshot, query, orderBy, where, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { useAuth } from "~/lib/firebase/AuthContext";
import type { ReactNode } from "react";

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
  status?: string;
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
  // Nuovi campi per tipo servizio e prezzo
  contractPrice?: number;
  serviceType?: string;
  serviceTypeName?: string;
  priceModified?: boolean;
  priceChangeReason?: string;
  sgrossoReason?: string;
  sgrossoReasonLabel?: string;
  sgrossoNotes?: string;
  // Campi per tracciamento modifica data
  originalDate?: Date;
  dateModifiedAt?: Date;
  // Campi per pulizie completate
  photos?: string[];
  startedAt?: any;
  completedAt?: any;
  // Campi per valutazione
  ratingScore?: number | null;
  ratingId?: string | null;
  extraServices?: {name: string; price: number}[];
}

interface Booking {
  id: string;
  propertyId: string;
  guestName: string;
  checkIn: Date;
  checkOut: Date;
  status: string;
  source?: string;
  isManual?: boolean;
  guests?: number;
  guestsCount?: number;
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
const globalCache = {
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


    // Data limite: 14 giorni fa
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const startDate = Timestamp.fromDate(twoWeeksAgo);

    // Stato locale per dati raw
    let rawProperties: Property[] = [];
    let rawCleanings: any[] = [];
    let rawBookings: any[] = [];
    let rawOperators: Operator[] = [];
    let loadedCount = 0;
    const totalListeners = 4;

    // 🔥 Funzione di aggiornamento con FILTRO per proprietà ATTIVE
    const updateData = () => {
      // Set di ID delle proprietà ATTIVE per filtro veloce
      const activePropertyIds = new Set(rawProperties.map(p => p.id));

      // 🔥 FILTRA pulizie: solo quelle con propertyId di proprietà ATTIVE
      const filteredCleanings = rawCleanings
        .filter(data => {
          if (!data.propertyId) return false;
          return activePropertyIds.has(data.propertyId);
        })
        .map(data => {
          // Trova la property per ottenere contractPrice
          const property = rawProperties.find(p => p.id === data.propertyId);
          const contractPrice = property?.cleaningPrice || 0;
          
          return {
            id: data.id,
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
            price: data.price || data.manualPrice || contractPrice,
            // Nuovi campi per tipo servizio e prezzo
            contractPrice: contractPrice,
            serviceType: data.serviceType || "STANDARD",
            serviceTypeName: data.serviceTypeName || "Pulizia Standard",
            priceModified: data.priceModified || false,
            priceChangeReason: data.priceChangeReason || null,
            sgrossoReason: data.sgrossoReason || null,
            sgrossoReasonLabel: data.sgrossoReasonLabel || null,
            sgrossoNotes: data.sgrossoNotes || null,
            // Campi per tracciamento modifica data
            originalDate: data.originalDate?.toDate?.() || null,
            dateModifiedAt: data.dateModifiedAt?.toDate?.() || null,
            // Campi per pulizie completate
            photos: data.photos || [],
            startedAt: data.startedAt || null,
            completedAt: data.completedAt || null,
            // Campi per valutazione
            ratingScore: data.ratingScore || null,
            ratingId: data.ratingId || null,
            extraServices: data.extraServices || [],
          };
        });

      // 🔥 FILTRA prenotazioni: solo quelle con propertyId di proprietà ATTIVE
      const now = new Date();
      const startRange = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endRange = new Date(now.getFullYear(), now.getMonth() + 3, 0);
      
      const filteredBookings = rawBookings
        .filter(data => {
          if (!data.propertyId) return false;
          if (!activePropertyIds.has(data.propertyId)) return false;
          
          const checkIn = data.checkIn?.toDate?.() || new Date(data.checkIn);
          const checkOut = data.checkOut?.toDate?.() || new Date(data.checkOut);
          
          return (checkIn >= startRange && checkIn <= endRange) ||
                 (checkOut >= startRange && checkOut <= endRange) ||
                 (checkIn <= startRange && checkOut >= endRange);
        })
        .map(data => ({
          id: data.id,
          propertyId: data.propertyId || "",
          guestName: data.guestName || "Ospite",
          checkIn: data.checkIn?.toDate?.() || new Date(data.checkIn),
          checkOut: data.checkOut?.toDate?.() || new Date(data.checkOut),
          status: data.status || "CONFIRMED",
          source: data.source,
          isManual: data.isManual || false,
          guests: data.guests || data.guestsCount,
          guestsCount: data.guestsCount || data.guests,
        }))
        .sort((a, b) => a.checkIn.getTime() - b.checkIn.getTime());

      // Aggiorna stati
      setProperties(rawProperties);
      setCleanings(filteredCleanings);
      setBookings(filteredBookings);
      setOperators(rawOperators);

      // Aggiorna cache globale
      globalCache.properties = rawProperties;
      globalCache.cleanings = filteredCleanings;
      globalCache.bookings = filteredBookings;
      globalCache.operators = rawOperators;
      globalCache.initialized = true;
      globalCache.lastUpdate = new Date();

      setIsLoading(false);
      setIsRefreshing(false);
      setLastUpdate(new Date());

    };

    // 1. Proprietà ATTIVE (solo queste!)
    const unsubProps = onSnapshot(
      query(collection(db, "properties"), where("status", "==", "ACTIVE")),
      (snap) => {
        rawProperties = snap.docs.map(d => ({
          id: d.id,
          name: (d.data() as Record<string, any>).name || "",
          address: (d.data() as Record<string, any>).address || "",
          imageUrl: (d.data() as Record<string, any>).imageUrl || null,
          ownerId: (d.data() as Record<string, any>).ownerId || "",
          cleaningPrice: (d.data() as Record<string, any>).cleaningPrice || 0,
          maxGuests: (d.data() as Record<string, any>).maxGuests || 0,
          bedrooms: (d.data() as Record<string, any>).bedrooms || 0,
          bathrooms: (d.data() as Record<string, any>).bathrooms || 0,
          bedsConfig: (d.data() as Record<string, any>).bedsConfig || [],
          serviceConfigs: (d.data() as Record<string, any>).serviceConfigs || {},
          color: "rose",
          status: (d.data() as Record<string, any>).status,
        }));
        
        loadedCount++;
        if (loadedCount >= totalListeners) updateData();
        
      }
    );

    // 2. Pulizie RECENTI (verranno filtrate in updateData)
    const unsubClean = onSnapshot(
      query(
        collection(db, "cleanings"), 
        where("scheduledDate", ">=", startDate), 
        orderBy("scheduledDate", "asc")
      ),
      (snap) => {
        rawCleanings = snap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
        
        loadedCount++;
        if (loadedCount >= totalListeners) updateData();
        
      }
    );

    // 3. Prenotazioni (verranno filtrate in updateData)
    const unsubBookings = onSnapshot(
      collection(db, "bookings"),
      (snap) => {
        rawBookings = snap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
        
        loadedCount++;
        if (loadedCount >= totalListeners) updateData();
        
      }
    );

    // 4. Operatori
    const unsubOps = onSnapshot(
      query(collection(db, "users"), where("role", "==", "OPERATORE_PULIZIE")),
      (snap) => {
        rawOperators = snap.docs.map(d => ({
          id: d.id,
          name: (d.data() as Record<string, any>).name || (d.data() as Record<string, any>).email || "Operatore"
        }));
        
        loadedCount++;
        if (loadedCount >= totalListeners) updateData();
        
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
