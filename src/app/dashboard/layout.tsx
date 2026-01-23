"use client";

import { useAuth } from "~/lib/firebase/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardLayoutClient } from "~/components/dashboard/DashboardLayoutClient";
import { collection, onSnapshot, query, where, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

// ============================================
// PRELOADER UNIFICATO - Mostra mentre TUTTO carica
// ============================================
function DashboardPreloader() {
  const [dots, setDots] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(d => (d + 1) % 4);
    }, 400);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50/30 flex items-center justify-center">
      <div className="text-center">
        {/* Logo animato */}
        <div className="relative mb-6">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-600 flex items-center justify-center shadow-xl shadow-sky-500/30 animate-pulse">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
          {/* Cerchio di caricamento attorno al logo */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-24 h-24 border-4 border-sky-200 border-t-sky-500 rounded-full animate-spin"></div>
          </div>
        </div>
        
        <h2 className="text-xl font-bold text-slate-700 mb-2">
          CleaningApp
        </h2>
        <p className="text-slate-500 text-sm">
          Caricamento dashboard{".".repeat(dots)}
        </p>
        
        {/* Barra di progresso stilizzata */}
        <div className="mt-6 w-48 mx-auto h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-cyan-400 via-sky-500 to-blue-600 rounded-full animate-[loading_1.5s_ease-in-out_infinite]"></div>
        </div>
      </div>
      
      <style>{`
        @keyframes loading {
          0% { width: 0%; margin-left: 0%; }
          50% { width: 70%; margin-left: 15%; }
          100% { width: 0%; margin-left: 100%; }
        }
      `}</style>
    </div>
  );
}

// ============================================
// HOOK: Precarica dati dashboard in parallelo
// ============================================
function useDashboardPreload() {
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [isDataReady, setIsDataReady] = useState(false);

  useEffect(() => {
    console.log("🚀 Dashboard Preload: Avvio caricamento parallelo...");
    
    const today = new Date();
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    let propertiesData: any[] = [];
    let cleaningsData: any[] = [];
    let operatorsData: any[] = [];
    let ordersData: any[] = [];
    let ridersData: any[] = [];
    let loadedCount = 0;
    const totalListeners = 5;

    const updateDashboard = () => {
      const propertiesMap = new Map();
      propertiesData.forEach(p => propertiesMap.set(p.id, p));

      const activePropertyIds = new Set(
        propertiesData.filter(p => p.status === "ACTIVE").map(p => p.id)
      );

      // Conta pending
      const pending = propertiesData.filter(p => 
        p.status === "PENDING" || p.deactivationRequested === true
      ).length;
      setPendingCount(pending);

      const ridersMap = new Map();
      ridersData.forEach(r => ridersMap.set(r.id, r));

      // Filtra pulizie per proprietà attive
      const filteredCleanings = cleaningsData.filter(item => {
        if (!item.propertyId) return false;
        return activePropertyIds.has(item.propertyId);
      });

      const cleanings = filteredCleanings.map(item => {
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

      // Filtra ordini per proprietà attive
      const filteredOrders = ordersData.filter(item => {
        if (!item.propertyId) return false;
        return activePropertyIds.has(item.propertyId);
      });

      const orders = filteredOrders.map(item => {
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

      const activeOrders = orders.filter(o => 
        o.status !== "DELIVERED" && o.status !== "COMPLETED"
      );

      const operators = operatorsData.filter(op => 
        op.name && op.name.trim() !== '' && op.name !== 'undefined'
      );

      const riders = ridersData.filter(r => 
        r.name && r.name.trim() !== '' && r.name !== 'undefined' && r.role === 'RIDER'
      );

      const newData = {
        stats: {
          cleaningsToday: cleanings.length,
          operatorsActive: operators.length,
          propertiesTotal: propertiesData.filter(p => p.status === "ACTIVE").length,
          checkinsWeek: 0,
          ordersToday: activeOrders.length,
          ordersPending: orders.filter(o => o.status === "PENDING").length,
        },
        cleanings,
        operators,
        orders,
        riders,
      };

      console.log("✅ Dashboard Preload: Dati pronti!", {
        pulizie: cleanings.length,
        ordini: orders.length,
        pending: pending,
      });

      setDashboardData(newData);
      setIsDataReady(true);
    };

    // Listener 1: Tutte le proprietà (per contare pending e filtrare)
    const unsubProperties = onSnapshot(
      collection(db, "properties"),
      (snapshot) => {
        propertiesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        loadedCount++;
        if (loadedCount >= totalListeners) updateDashboard();
      }
    );

    // Listener 2: Pulizie di oggi
    const unsubCleanings = onSnapshot(
      query(
        collection(db, "cleanings"),
        where("scheduledDate", ">=", Timestamp.fromDate(todayStart)),
        where("scheduledDate", "<=", Timestamp.fromDate(todayEnd))
      ),
      (snapshot) => {
        cleaningsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        loadedCount++;
        if (loadedCount >= totalListeners) updateDashboard();
      }
    );

    // Listener 3: Operatori
    const unsubOperators = onSnapshot(
      query(collection(db, "users"), where("role", "==", "OPERATORE_PULIZIE")),
      (snapshot) => {
        operatorsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        loadedCount++;
        if (loadedCount >= totalListeners) updateDashboard();
      }
    );

    // Listener 4: Ordini
    const unsubOrders = onSnapshot(
      collection(db, "orders"),
      (snapshot) => {
        ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        loadedCount++;
        if (loadedCount >= totalListeners) updateDashboard();
      }
    );

    // Listener 5: Riders
    const unsubRiders = onSnapshot(
      query(collection(db, "users"), where("role", "==", "RIDER")),
      (snapshot) => {
        ridersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        loadedCount++;
        if (loadedCount >= totalListeners) updateDashboard();
      }
    );

    return () => {
      unsubProperties();
      unsubCleanings();
      unsubOperators();
      unsubOrders();
      unsubRiders();
    };
  }, []);

  return { dashboardData, pendingCount, isDataReady };
}

// ============================================
// LAYOUT PRINCIPALE
// ============================================
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { dashboardData, pendingCount, isDataReady } = useDashboardPreload();
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

  // Check desktop/mobile (esegui subito, non blocca il render)
  useEffect(() => {
    setIsDesktop(window.innerWidth >= 1024);
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Redirect se non autenticato o non admin
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push("/login");
      return;
    }

    const role = user.role?.toUpperCase();
    if (role !== "ADMIN") {
      router.push("/proprietario");
    }
  }, [user, authLoading, router]);

  // ============================================
  // MOSTRA PRELOADER UNIFICATO mentre:
  // - Auth sta caricando
  // - O dati non sono pronti
  // - O isDesktop non è determinato
  // ============================================
  const isFullyReady = !authLoading && user && isDataReady && isDesktop !== null;

  if (!isFullyReady) {
    return <DashboardPreloader />;
  }

  // Se non è admin, mostra preloader durante redirect
  if (user.role?.toUpperCase() !== "ADMIN") {
    return <DashboardPreloader />;
  }

  return (
    <DashboardLayoutClient
      userName={user.name || "Admin"}
      userEmail={user.email || ""}
      userRole={user.role?.toUpperCase() || "ADMIN"}
      pendingPropertiesCount={pendingCount}
      preloadedData={dashboardData}
      isDesktopPreloaded={isDesktop}
    >
      {children}
    </DashboardLayoutClient>
  );
}
