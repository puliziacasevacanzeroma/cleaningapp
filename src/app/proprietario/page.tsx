"use client";

import { useAuth } from "~/lib/firebase/AuthContext";
import { collection, query, where, orderBy, Timestamp, onSnapshot } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

// Icone SVG
const Icons = {
  cleaning: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" /></svg>,
  home: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>,
  euro: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14.25 7.756a4.5 4.5 0 100 8.488M7.5 10.5h5.25m-5.25 3h5.25M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  arrow: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>,
  calendar: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>,
  chart: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>,
  check: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>,
};

// Componente numero animato
const AnimatedNumber = ({ value }: { value: number }) => {
  const [displayValue, setDisplayValue] = useState(0);
  
  useEffect(() => {
    const duration = 1000;
    const steps = 30;
    const increment = value / steps;
    let current = 0;
    
    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setDisplayValue(value);
        clearInterval(timer);
      } else {
        setDisplayValue(Math.floor(current));
      }
    }, duration / steps);
    
    return () => clearInterval(timer);
  }, [value]);
  
  return <span>{displayValue.toLocaleString('it-IT')}</span>;
};

export default function ProprietarioDashboard() {
  const { user } = useAuth();
  const today = new Date();
  
  const [data, setData] = useState<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // State per il saldo del mese corrente
  const [paymentStatus, setPaymentStatus] = useState<{
    loading: boolean;
    saldo: number;
    totaleDovuto: number;
    totalePagato: number;
  }>({ loading: true, saldo: 0, totaleDovuto: 0, totalePagato: 0 });

  const formattedDate = today.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  const currentMonth = today.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  const currentMonthName = today.toLocaleDateString("it-IT", { month: "long" });

  // 🔥 REALTIME: Carica saldo pagamenti del mese corrente
  useEffect(() => {
    if (!user?.id) return;

    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();

    // Listener per proprietà (per calcolare il totale dovuto)
    let propertiesData: any[] = [];
    let cleaningsData: any[] = [];
    let ordersData: any[] = [];
    let paymentsData: any[] = [];
    let loadedSections = 0;

    const calculatePaymentStatus = () => {
      if (loadedSections < 4) return;

      const propertyIds = propertiesData.filter(p => p.status === "ACTIVE").map(p => p.id);
      
      // Calcola totale dovuto (pulizie completed + ordini delivered del mese)
      const monthStart = new Date(currentYear, currentMonth - 1, 1);
      const monthEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59);

      let totaleDovuto = 0;

      // Pulizie completed del mese
      cleaningsData.forEach((c: any) => {
        if (!propertyIds.includes(c.propertyId)) return;
        if (c.status !== "COMPLETED") return;
        const d = c.scheduledDate?.toDate?.();
        if (d && d >= monthStart && d <= monthEnd) {
          const price = c.priceOverride ?? c.price ?? 0;
          totaleDovuto += price;
        }
      });

      // Ordini delivered del mese
      ordersData.forEach((o: any) => {
        if (!propertyIds.includes(o.propertyId)) return;
        if (o.status !== "DELIVERED") return;
        const d = o.deliveredAt?.toDate?.() || o.scheduledDate?.toDate?.() || o.createdAt?.toDate?.();
        if (d && d >= monthStart && d <= monthEnd) {
          let orderTotal = 0;
          if (o.totalPriceOverride !== undefined) {
            orderTotal = o.totalPriceOverride;
          } else if (o.items && Array.isArray(o.items)) {
            o.items.forEach((item: any) => {
              const price = item.priceOverride ?? item.price ?? 0;
              orderTotal += price * (item.quantity || 1);
            });
          }
          totaleDovuto += orderTotal;
        }
      });

      // Pagamenti del mese
      const totalePagato = paymentsData
        .filter(p => p.month === currentMonth && p.year === currentYear)
        .reduce((sum, p) => sum + (p.amount || 0), 0);

      const saldo = totaleDovuto - totalePagato;

      setPaymentStatus({
        loading: false,
        saldo,
        totaleDovuto,
        totalePagato
      });
    };

    // Listener proprietà
    const unsubProps = onSnapshot(
      query(collection(db, "properties"), where("ownerId", "==", user.id)),
      (snapshot) => {
        propertiesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        loadedSections++;
        calculatePaymentStatus();
      }
    );

    // Listener pulizie
    const unsubCleanings = onSnapshot(
      collection(db, "cleanings"),
      (snapshot) => {
        cleaningsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        loadedSections++;
        calculatePaymentStatus();
      }
    );

    // Listener ordini
    const unsubOrders = onSnapshot(
      collection(db, "orders"),
      (snapshot) => {
        ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        loadedSections++;
        calculatePaymentStatus();
      }
    );

    // Listener pagamenti
    const unsubPayments = onSnapshot(
      query(collection(db, "payments"), where("proprietarioId", "==", user.id)),
      (snapshot) => {
        paymentsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        loadedSections++;
        calculatePaymentStatus();
      }
    );

    return () => {
      unsubProps();
      unsubCleanings();
      unsubOrders();
      unsubPayments();
    };
  }, [user?.id]);

  // 🔥 REALTIME: usa onSnapshot per aggiornamenti automatici
  useEffect(() => {
    if (!user?.id) return;

    console.log("🔴 Proprietario Dashboard Realtime: Avvio listeners...");

    let propertiesData: any[] = [];
    let allCleaningsData: any[] = [];
    let loadedCount = 0;

    const updateDashboard = () => {
      const propertyIds = propertiesData.map(p => p.id);
      const myCleanings = allCleaningsData.filter((c: any) => propertyIds.includes(c.propertyId));

      // Date helpers
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Lunedì
      weekStart.setHours(0, 0, 0, 0);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

      // Filtra pulizie
      const cleaningsToday = myCleanings.filter((c: any) => {
        const d = c.scheduledDate?.toDate?.();
        return d && d >= todayStart && d <= todayEnd;
      });

      const cleaningsWeek = myCleanings.filter((c: any) => {
        const d = c.scheduledDate?.toDate?.();
        return d && d >= weekStart && d <= weekEnd;
      });

      const cleaningsMonth = myCleanings.filter((c: any) => {
        const d = c.scheduledDate?.toDate?.();
        return d && d >= monthStart && d <= monthEnd;
      });

      const completedMonth = cleaningsMonth.filter((c: any) => c.status === "COMPLETED");
      const completedToday = cleaningsToday.filter((c: any) => c.status === "COMPLETED");
      const inProgressToday = cleaningsToday.filter((c: any) => c.status === "IN_PROGRESS");
      const scheduledToday = cleaningsToday.filter((c: any) => c.status === "SCHEDULED");

      // Calcola totali
      const totalEarningsMonth = completedMonth.reduce((sum: number, c: any) => sum + (c.price || 0), 0);
      const earningsToday = completedToday.reduce((sum: number, c: any) => sum + (c.price || 0), 0);
      const avgPrice = completedMonth.length > 0 ? Math.round(totalEarningsMonth / completedMonth.length) : 0;

      // Prossime pulizie
      const upcomingCleanings = myCleanings
        .filter((c: any) => {
          const d = c.scheduledDate?.toDate?.();
          return d && d >= todayStart && c.status !== "COMPLETED" && c.status !== "CANCELLED";
        })
        .sort((a: any, b: any) => {
          const da = a.scheduledDate?.toDate?.() || new Date(0);
          const db = b.scheduledDate?.toDate?.() || new Date(0);
          return da.getTime() - db.getTime();
        })
        .slice(0, 4);

      // Dati per grafico settimanale
      const daysOfWeek = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
      const weeklyChartData = daysOfWeek.map((day, index) => {
        const dayDate = new Date(weekStart);
        dayDate.setDate(dayDate.getDate() + index);
        const dayCleanings = myCleanings.filter((c: any) => {
          const d = c.scheduledDate?.toDate?.();
          if (!d) return false;
          return d.toDateString() === dayDate.toDateString();
        });
        return { day, pulizie: dayCleanings.length };
      });

      // Dati per trend mensile (ultime 4 settimane)
      const monthlyTrendData = [];
      for (let i = 3; i >= 0; i--) {
        const weekStartDate = new Date();
        weekStartDate.setDate(weekStartDate.getDate() - (i * 7) - weekStartDate.getDay() + 1);
        const weekEndDate = new Date(weekStartDate);
        weekEndDate.setDate(weekEndDate.getDate() + 6);
        
        const weekCleanings = myCleanings.filter((c: any) => {
          const d = c.scheduledDate?.toDate?.();
          return d && d >= weekStartDate && d <= weekEndDate;
        });
        
        monthlyTrendData.push({
          week: `Sett ${4 - i}`,
          pulizie: weekCleanings.length
        });
      }

      console.log("🔄 Proprietario Dashboard: Aggiornata!", {
        properties: propertiesData.length,
        cleaningsToday: cleaningsToday.length,
        totalEarningsMonth,
      });

      setData({
        stats: {
          properties: propertiesData.filter(p => p.status === "ACTIVE").length,
          pendingProperties: propertiesData.filter(p => p.status === "PENDING").length,
          cleaningsToday: cleaningsToday.length,
          cleaningsWeek: cleaningsWeek.length,
          cleaningsMonth: cleaningsMonth.length,
          completedMonth: completedMonth.length,
          completedToday: completedToday.length,
          inProgressToday: inProgressToday.length,
          scheduledToday: scheduledToday.length,
          totalEarningsMonth,
          earningsToday,
          avgPrice,
        },
        upcomingCleanings,
        weeklyChartData,
        monthlyTrendData,
      });
      setIsLoaded(true);
    };

    // Listener 1: Proprietà del proprietario
    const unsubProperties = onSnapshot(
      query(
        collection(db, "properties"),
        where("ownerId", "==", user.id)
      ),
      (snapshot) => {
        propertiesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        loadedCount++;
        if (loadedCount >= 2) updateDashboard();
      }
    );

    // Listener 2: Tutte le pulizie del mese corrente e prossime
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0);

    const unsubCleanings = onSnapshot(
      query(
        collection(db, "cleanings"),
        where("scheduledDate", ">=", Timestamp.fromDate(monthStart)),
        where("scheduledDate", "<=", Timestamp.fromDate(nextMonth))
      ),
      (snapshot) => {
        allCleaningsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        loadedCount++;
        if (loadedCount >= 2) updateDashboard();
      }
    );

    return () => {
      console.log("🔴 Proprietario Dashboard Realtime: Chiusura listeners");
      unsubProperties();
      unsubCleanings();
    };
  }, [user?.id]);

  // Loading
  if (!isLoaded || !data) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const { stats, upcomingCleanings, weeklyChartData, monthlyTrendData } = data;

  // Formatta data per le pulizie
  const formatCleaningDate = (cleaning: any) => {
    const d = cleaning.scheduledDate?.toDate?.();
    if (!d) return { date: "—", time: "—" };
    
    const isToday = d.toDateString() === today.toDateString();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = d.toDateString() === tomorrow.toDateString();
    
    return {
      date: isToday ? "Oggi" : isTomorrow ? "Domani" : d.toLocaleDateString("it-IT", { day: "numeric", month: "short" }),
      time: cleaning.scheduledTime || "10:00"
    };
  };

  return (
    <div className="min-h-screen bg-gray-100">
      
      {/* ========== BANNER CON IMMAGINE ========== */}
      <div 
        className="w-full bg-cover bg-center"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1631049307264-da0ec9d70304?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80')`,
          minHeight: '280px'
        }}
      >
        <div 
          className="w-full h-full"
          style={{
            background: 'linear-gradient(to bottom, rgba(15,23,42,0.5), rgba(15,23,42,0.7))',
            minHeight: '280px'
          }}
        >
          <div className="max-w-6xl mx-auto px-6 lg:px-8 py-6 h-full flex flex-col justify-between" style={{minHeight: '280px'}}>
            
            {/* Header */}
            <div className={`flex items-center justify-between transition-all duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}>
              <div>
                <p className="text-white/70 text-sm capitalize">{formattedDate}</p>
                <h1 className="text-2xl lg:text-3xl font-bold text-white mt-1">
                  Bentornato, {user?.name?.split(" ")[0] || "Proprietario"}
                </h1>
              </div>
              <div className="hidden md:flex items-center gap-2">
                <Link 
                  href="/proprietario/calendario/pulizie"
                  className="flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all"
                >
                  {Icons.calendar}
                  <span>Calendario</span>
                </Link>
                <Link 
                  href="/proprietario/proprieta/nuova"
                  className="flex items-center gap-2 bg-white hover:bg-gray-100 text-slate-900 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                >
                  Nuova proprietà
                </Link>
              </div>
            </div>

            {/* Stats Cards */}
            <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6 transition-all duration-500 delay-100 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}>
              
              <div className="bg-white/20 backdrop-blur rounded-xl p-4 border border-white/30 hover:bg-white/30 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white/90 text-xs font-medium">Pulizie oggi</span>
                  <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center text-white">
                    {Icons.cleaning}
                  </div>
                </div>
                <p className="text-3xl font-bold text-white"><AnimatedNumber value={stats.cleaningsToday} /></p>
                <p className="text-white/70 text-xs mt-1">{stats.completedToday} completate</p>
              </div>

              <div className="bg-white/20 backdrop-blur rounded-xl p-4 border border-white/30 hover:bg-white/30 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white/90 text-xs font-medium">Proprietà attive</span>
                  <div className="w-8 h-8 rounded-lg bg-cyan-500 flex items-center justify-center text-white">
                    {Icons.home}
                  </div>
                </div>
                <p className="text-3xl font-bold text-white"><AnimatedNumber value={stats.properties} /></p>
                <p className="text-emerald-400 text-xs mt-1 flex items-center gap-1">
                  {stats.pendingProperties > 0 ? `${stats.pendingProperties} in attesa` : <>{Icons.check} Tutte attive</>}
                </p>
              </div>

              <div className="bg-white/20 backdrop-blur rounded-xl p-4 border border-white/30 hover:bg-white/30 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white/90 text-xs font-medium">Pulizie mese</span>
                  <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-white">
                    {Icons.chart}
                  </div>
                </div>
                <p className="text-3xl font-bold text-white"><AnimatedNumber value={stats.cleaningsMonth} /></p>
                <p className="text-white/70 text-xs mt-1">{stats.completedMonth} completate</p>
              </div>

              <div className="bg-white/20 backdrop-blur rounded-xl p-4 border border-white/30 hover:bg-white/30 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white/90 text-xs font-medium">Da incassare</span>
                  <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-white">
                    {Icons.euro}
                  </div>
                </div>
                <p className="text-3xl font-bold text-white">€<AnimatedNumber value={stats.totalEarningsMonth} /></p>
                <p className="text-white/70 text-xs mt-1">totale mese</p>
              </div>
              
            </div>
          </div>
        </div>
      </div>

      {/* ========== BANNER SALDO PAGAMENTI ========== */}
      {!paymentStatus.loading && (
        <div className="max-w-6xl mx-auto px-6 lg:px-8 -mt-4 mb-4 relative z-10">
          <Link href="/proprietario/pagamenti">
            {paymentStatus.saldo > 0 ? (
              // Deve pagare
              <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl p-4 shadow-lg hover:shadow-xl transition-all cursor-pointer">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                      <span className="text-2xl">💳</span>
                    </div>
                    <div>
                      <p className="text-white/80 text-sm font-medium">Saldo da pagare per {currentMonthName}</p>
                      <p className="text-white text-2xl font-bold">
                        €{paymentStatus.saldo.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-xl">
                    <span className="text-white text-sm font-medium">Vedi dettagli</span>
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
                {paymentStatus.totalePagato > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/20 flex items-center gap-4 text-white/80 text-sm">
                    <span>Totale: €{paymentStatus.totaleDovuto.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span>
                    <span>•</span>
                    <span>Già pagato: €{paymentStatus.totalePagato.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
              </div>
            ) : paymentStatus.totaleDovuto > 0 ? (
              // Tutto saldato
              <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl p-4 shadow-lg hover:shadow-xl transition-all cursor-pointer">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                      <span className="text-2xl">✅</span>
                    </div>
                    <div>
                      <p className="text-white/80 text-sm font-medium">Pagamenti {currentMonthName}</p>
                      <p className="text-white text-xl font-bold">Tutto in regola!</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-xl">
                    <span className="text-white text-sm font-medium">Vedi storico</span>
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-white/20 flex items-center gap-2 text-white/90 text-sm">
                  <span>✓ Pagato: €{paymentStatus.totalePagato.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            ) : null}
          </Link>
        </div>
      )}

      {/* ========== CONTENUTO PRINCIPALE ========== */}
      <div className="max-w-6xl mx-auto px-6 lg:px-8 py-6">
        
        {/* Riga 1: Totale Maturato + Grafico */}
        <div className={`grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5 transition-all duration-500 delay-200 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}>
          
          {/* Card Totale Maturato */}
          <div className="bg-slate-900 rounded-2xl p-5 text-white">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center">
                {Icons.euro}
              </div>
              <div>
                <p className="text-slate-300 text-sm font-medium">Totale maturato</p>
                <p className="text-slate-500 text-xs capitalize">{currentMonth}</p>
              </div>
            </div>
            
            <p className="text-3xl font-bold mb-1">€<AnimatedNumber value={stats.totalEarningsMonth} /></p>
            <p className="text-slate-500 text-sm">{stats.completedMonth} pulizie completate</p>
            
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/10">
              <div>
                <p className="text-slate-500 text-xs">Completamento</p>
                <p className="text-base font-semibold">{stats.completedMonth}/{stats.cleaningsMonth}</p>
              </div>
              <div className="text-right">
                <p className="text-slate-500 text-xs">Media</p>
                <p className="text-base font-semibold">€{stats.avgPrice}</p>
              </div>
            </div>
            
            {/* Progress bar */}
            <div className="mt-3">
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-full transition-all duration-1000"
                  style={{ width: stats.cleaningsMonth > 0 ? `${(stats.completedMonth/stats.cleaningsMonth)*100}%` : '0%' }}
                ></div>
              </div>
            </div>
          </div>

          {/* Grafico Settimanale */}
          <div className="lg:col-span-2 bg-white rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Andamento settimanale</h2>
                <p className="text-sm text-gray-500">Pulizie per giorno</p>
              </div>
            </div>
            
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyChartData} barSize={36}>
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} width={25} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1E293B', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                    formatter={(value) => [`${value} pulizie`, '']}
                  />
                  <Bar dataKey="pulizie" radius={[6, 6, 0, 0]}>
                    {weeklyChartData.map((entry: any, index: number) => {
                      const todayIndex = (today.getDay() + 6) % 7;
                      return <Cell key={`cell-${index}`} fill={index === todayIndex ? '#4F46E5' : '#C7D2FE'} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-indigo-600"></div>
                  <span className="text-gray-500">Oggi</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-indigo-200"></div>
                  <span className="text-gray-500">Altri giorni</span>
                </div>
              </div>
              <p className="text-sm text-gray-500">Totale: <span className="font-semibold text-gray-900">{stats.cleaningsWeek}</span></p>
            </div>
          </div>
        </div>

        {/* Riga 2: Prossime Pulizie + Sidebar */}
        <div className={`grid grid-cols-1 lg:grid-cols-3 gap-5 transition-all duration-500 delay-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}>
          
          {/* Prossime Pulizie */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Prossime pulizie</h2>
                <p className="text-sm text-gray-500">Attività programmate</p>
              </div>
              <Link 
                href="/proprietario/calendario/pulizie"
                className="text-sm text-indigo-600 font-medium flex items-center gap-1 hover:text-indigo-700"
              >
                Vedi tutte {Icons.arrow}
              </Link>
            </div>
            
            {upcomingCleanings.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                Nessuna pulizia programmata
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {upcomingCleanings.map((cleaning: any) => {
                  const { date, time } = formatCleaningDate(cleaning);
                  return (
                    <div key={cleaning.id} className="p-4 hover:bg-gray-50 transition-colors cursor-pointer">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center ${
                          date === 'Oggi' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
                        }`}>
                          <span className="text-[10px] font-medium uppercase">{date}</span>
                          <span className="text-sm font-bold">{time}</span>
                        </div>
                        
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{cleaning.propertyName || "Proprietà"}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-sm text-gray-500">
                              {cleaning.type === "CHECKOUT" ? "Check-out" : 
                               cleaning.type === "CHECKIN" ? "Check-in" : 
                               cleaning.type === "DEEP_CLEAN" ? "Straordinaria" : "Manutenzione"}
                            </span>
                            <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                            <span className="text-sm font-semibold text-indigo-600">€{cleaning.price || 0}</span>
                          </div>
                        </div>
                        
                        {cleaning.status === "IN_PROGRESS" ? (
                          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-full border border-emerald-200 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                            In corso
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 bg-gray-50 text-gray-600 text-xs font-medium rounded-full border border-gray-200">
                            Programmata
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            
            {/* Trend mensile */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm">Trend mensile</h3>
                  <p className="text-xs text-gray-500">Pulizie per settimana</p>
                </div>
                {monthlyTrendData.length >= 2 && monthlyTrendData[3]?.pulizie > monthlyTrendData[0]?.pulizie && (
                  <span className="text-xs text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full">
                    +{Math.round(((monthlyTrendData[3].pulizie - monthlyTrendData[0].pulizie) / (monthlyTrendData[0].pulizie || 1)) * 100)}%
                  </span>
                )}
              </div>
              
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyTrendData}>
                    <defs>
                      <linearGradient id="colorPulizie" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#4F46E5" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1E293B', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '11px' }} />
                    <Area type="monotone" dataKey="pulizie" stroke="#4F46E5" strokeWidth={2} fill="url(#colorPulizie)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Riepilogo oggi */}
            <div className="bg-indigo-600 rounded-2xl p-5 text-white">
              <h3 className="font-semibold mb-4">Riepilogo oggi</h3>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-indigo-200">Completate</span>
                  <span className="font-bold text-lg">{stats.completedToday}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-indigo-200">In corso</span>
                  <span className="font-bold text-lg">{stats.inProgressToday}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-indigo-200">In attesa</span>
                  <span className="font-bold text-lg">{stats.scheduledToday}</span>
                </div>
              </div>
              
              <div className="mt-4 pt-4 border-t border-white/20">
                <div className="flex items-center justify-between">
                  <span className="text-indigo-200">Incasso oggi</span>
                  <span className="text-2xl font-bold">€{stats.earningsToday}</span>
                </div>
              </div>
            </div>

            {/* Statistiche */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <h3 className="font-semibold text-gray-900 text-sm mb-3">Statistiche</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 text-sm">Media giornaliera</span>
                  <span className="font-semibold text-gray-900">
                    {(stats.cleaningsMonth / 30).toFixed(1)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 text-sm">Prezzo medio</span>
                  <span className="font-semibold text-gray-900">€{stats.avgPrice}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 text-sm">Completamento</span>
                  <span className="font-semibold text-emerald-600">
                    {stats.cleaningsMonth > 0 ? Math.round((stats.completedMonth / stats.cleaningsMonth) * 100) : 0}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
