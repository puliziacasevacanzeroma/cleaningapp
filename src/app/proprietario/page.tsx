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

// 🔄 CACHE HELPERS
const CACHE_KEY = 'proprietario_dashboard_cache';

function getFromCache(): any {
  if (typeof window === "undefined") return null;
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : null;
  } catch { return null; }
}

function saveToCache(data: any): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {}
}

export default function ProprietarioDashboard() {
  const { user } = useAuth();
  const today = new Date();
  
  // 🔄 INIZIALIZZA DA CACHE - Zero loading!
  const [data, setData] = useState<any>(() => getFromCache());
  
  // State per il saldo del mese corrente
  const [paymentStatus, setPaymentStatus] = useState<{
    loading: boolean;
    saldo: number;
    totaleDovuto: number;
    totalePagato: number;
  }>(() => {
    const cached = getFromCache();
    return cached?.paymentStatus || { loading: true, saldo: 0, totaleDovuto: 0, totalePagato: 0 };
  });

  const formattedDate = today.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  const currentMonth = today.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  const currentMonthName = today.toLocaleDateString("it-IT", { month: "long" });

  // 🔥 REALTIME: Carica saldo pagamenti del mese corrente
  useEffect(() => {
    if (!user?.id) return;

    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();

    let propertiesData: any[] = [];
    let cleaningsData: any[] = [];
    let ordersData: any[] = [];
    let paymentsData: any[] = [];
    let loadedSections = 0;

    const calculatePaymentStatus = () => {
      if (loadedSections < 4) return;

      const propertyIds = propertiesData.filter(p => p.status === "ACTIVE").map(p => p.id);
      const monthStart = new Date(currentYear, currentMonth - 1, 1);
      const monthEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59);

      let totaleDovuto = 0;

      cleaningsData.forEach((c: any) => {
        if (!propertyIds.includes(c.propertyId)) return;
        if (c.status !== "COMPLETED") return;
        const d = c.scheduledDate?.toDate?.();
        if (d && d >= monthStart && d <= monthEnd) {
          totaleDovuto += c.priceOverride ?? c.price ?? 0;
        }
      });

      ordersData.forEach((o: any) => {
        if (!propertyIds.includes(o.propertyId)) return;
        if (o.status !== "DELIVERED") return;
        const d = o.deliveredAt?.toDate?.() || o.scheduledDate?.toDate?.() || o.createdAt?.toDate?.();
        if (d && d >= monthStart && d <= monthEnd) {
          let orderTotal = o.totalPriceOverride ?? 0;
          if (!orderTotal && o.items) {
            o.items.forEach((item: any) => {
              orderTotal += (item.priceOverride ?? item.price ?? 0) * (item.quantity || 1);
            });
          }
          totaleDovuto += orderTotal;
        }
      });

      const totalePagato = paymentsData
        .filter(p => p.month === currentMonth && p.year === currentYear)
        .reduce((sum, p) => sum + (p.amount || 0), 0);

      const newPaymentStatus = { loading: false, saldo: totaleDovuto - totalePagato, totaleDovuto, totalePagato };
      setPaymentStatus(newPaymentStatus);
      
      const currentData = getFromCache() || {};
      saveToCache({ ...currentData, paymentStatus: newPaymentStatus });
    };

    const unsubProps = onSnapshot(query(collection(db, "properties"), where("ownerId", "==", user.id)), (snapshot) => {
      propertiesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      loadedSections++;
      calculatePaymentStatus();
    });

    const unsubCleanings = onSnapshot(collection(db, "cleanings"), (snapshot) => {
      cleaningsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      loadedSections++;
      calculatePaymentStatus();
    });

    const unsubOrders = onSnapshot(collection(db, "orders"), (snapshot) => {
      ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      loadedSections++;
      calculatePaymentStatus();
    });

    const unsubPayments = onSnapshot(query(collection(db, "payments"), where("ownerId", "==", user.id)), (snapshot) => {
      paymentsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      loadedSections++;
      calculatePaymentStatus();
    });

    return () => { unsubProps(); unsubCleanings(); unsubOrders(); unsubPayments(); };
  }, [user?.id]);

  // 🔥 REALTIME: Dashboard principale
  useEffect(() => {
    if (!user?.id) return;

    let propertiesData: any[] = [];
    let allCleaningsData: any[] = [];
    let loadedCount = 0;

    const updateDashboard = () => {
      const propertyIds = propertiesData.map(p => p.id);
      const myCleanings = allCleaningsData.filter((c: any) => propertyIds.includes(c.propertyId));

      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
      
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

      const cleaningsToday = myCleanings.filter((c: any) => { const d = c.scheduledDate?.toDate?.(); return d && d >= todayStart && d <= todayEnd; });
      const cleaningsWeek = myCleanings.filter((c: any) => { const d = c.scheduledDate?.toDate?.(); return d && d >= weekStart && d <= weekEnd; });
      const cleaningsMonth = myCleanings.filter((c: any) => { const d = c.scheduledDate?.toDate?.(); return d && d >= monthStart && d <= monthEnd; });

      const completedMonth = cleaningsMonth.filter((c: any) => c.status === "COMPLETED");
      const completedToday = cleaningsToday.filter((c: any) => c.status === "COMPLETED");
      const inProgressToday = cleaningsToday.filter((c: any) => c.status === "IN_PROGRESS");
      const scheduledToday = cleaningsToday.filter((c: any) => c.status === "SCHEDULED");

      const totalEarningsMonth = completedMonth.reduce((sum: number, c: any) => sum + (c.price || 0), 0);
      const earningsToday = completedToday.reduce((sum: number, c: any) => sum + (c.price || 0), 0);
      const avgPrice = completedMonth.length > 0 ? Math.round(totalEarningsMonth / completedMonth.length) : 0;

      const upcomingCleanings = myCleanings
        .filter((c: any) => { const d = c.scheduledDate?.toDate?.(); return d && d >= todayStart && c.status !== "COMPLETED" && c.status !== "CANCELLED"; })
        .sort((a: any, b: any) => (a.scheduledDate?.toDate?.() || 0) - (b.scheduledDate?.toDate?.() || 0))
        .slice(0, 4);

      const daysOfWeek = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
      const weeklyChartData = daysOfWeek.map((day, index) => {
        const dayDate = new Date(weekStart); dayDate.setDate(dayDate.getDate() + index);
        return { day, pulizie: myCleanings.filter((c: any) => c.scheduledDate?.toDate?.()?.toDateString() === dayDate.toDateString()).length };
      });

      const monthlyTrendData = [];
      for (let i = 3; i >= 0; i--) {
        const ws = new Date(); ws.setDate(ws.getDate() - (i * 7) - ws.getDay() + 1);
        const we = new Date(ws); we.setDate(we.getDate() + 6);
        monthlyTrendData.push({ week: `Sett ${4 - i}`, pulizie: myCleanings.filter((c: any) => { const d = c.scheduledDate?.toDate?.(); return d && d >= ws && d <= we; }).length });
      }

      const newData = {
        stats: {
          properties: propertiesData.filter(p => p.status === "ACTIVE").length,
          pendingProperties: propertiesData.filter(p => p.status === "PENDING").length,
          cleaningsToday: cleaningsToday.length, cleaningsWeek: cleaningsWeek.length, cleaningsMonth: cleaningsMonth.length,
          completedMonth: completedMonth.length, completedToday: completedToday.length,
          inProgressToday: inProgressToday.length, scheduledToday: scheduledToday.length,
          totalEarningsMonth, earningsToday, avgPrice,
        },
        upcomingCleanings, weeklyChartData, monthlyTrendData,
      };
      
      setData(newData);
      const cached = getFromCache() || {};
      saveToCache({ ...cached, ...newData });
    };

    const unsubProperties = onSnapshot(query(collection(db, "properties"), where("ownerId", "==", user.id)), (snapshot) => {
      propertiesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      loadedCount++;
      if (loadedCount >= 2) updateDashboard();
    });

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0);

    const unsubCleanings = onSnapshot(query(collection(db, "cleanings"), where("scheduledDate", ">=", Timestamp.fromDate(monthStart)), where("scheduledDate", "<=", Timestamp.fromDate(nextMonth))), (snapshot) => {
      allCleaningsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      loadedCount++;
      if (loadedCount >= 2) updateDashboard();
    });

    return () => { unsubProperties(); unsubCleanings(); };
  }, [user?.id]);

  const stats = data?.stats || { properties: 0, pendingProperties: 0, cleaningsToday: 0, cleaningsWeek: 0, cleaningsMonth: 0, completedMonth: 0, completedToday: 0, inProgressToday: 0, scheduledToday: 0, totalEarningsMonth: 0, earningsToday: 0, avgPrice: 0 };
  const upcomingCleanings = data?.upcomingCleanings || [];
  const weeklyChartData = data?.weeklyChartData || [];
  const monthlyTrendData = data?.monthlyTrendData || [];

  const formatCleaningDate = (cleaning: any) => {
    const d = cleaning.scheduledDate?.toDate?.();
    if (!d) return { date: '-', time: '-' };
    const isToday = d.toDateString() === today.toDateString();
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    return {
      date: isToday ? 'Oggi' : d.toDateString() === tomorrow.toDateString() ? 'Domani' : d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }),
      time: cleaning.scheduledTime || d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    };
  };

  // 🔄 Se non c'è cache, mostra skeleton veloce
  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 lg:p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => (<div key={i} className="h-24 bg-gray-200 rounded-xl"></div>))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-4 lg:p-6 space-y-5">
        
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Ciao, {user?.name?.split(' ')[0] || 'Utente'}!</h1>
            <p className="text-gray-500 capitalize">{formattedDate}</p>
          </div>
          
          {paymentStatus.saldo > 0 && (
            <Link href="/proprietario/pagamenti" className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3 hover:bg-amber-100 transition-colors">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">{Icons.euro}</div>
              <div>
                <p className="text-sm text-amber-800 font-medium">Saldo da pagare</p>
                <p className="text-lg font-bold text-amber-900">€{paymentStatus.saldo.toLocaleString('it-IT')}</p>
              </div>
              <div className="ml-auto text-amber-600">{Icons.arrow}</div>
            </Link>
          )}
        </div>

        {/* Stats Cards - NUMERI STATICI */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">{Icons.home}</div>
              <span className="text-gray-500 text-sm">Proprietà</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{stats.properties}</p>
            {stats.pendingProperties > 0 && <p className="text-xs text-amber-600 mt-1">+{stats.pendingProperties} in attesa</p>}
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">{Icons.cleaning}</div>
              <span className="text-gray-500 text-sm">Oggi</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{stats.cleaningsToday}</p>
            <p className="text-xs text-gray-500 mt-1">{stats.completedToday} completate</p>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600">{Icons.calendar}</div>
              <span className="text-gray-500 text-sm">{currentMonthName}</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{stats.cleaningsMonth}</p>
            <p className="text-xs text-gray-500 mt-1">{stats.completedMonth} completate</p>
          </div>

          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-4 shadow-sm text-white">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">{Icons.euro}</div>
              <span className="text-white/80 text-sm">Incasso</span>
            </div>
            <p className="text-3xl font-bold">€{stats.totalEarningsMonth.toLocaleString('it-IT')}</p>
            <p className="text-xs text-white/70 mt-1">in {currentMonthName}</p>
          </div>
        </div>

        {/* Grafico Settimanale */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-gray-900">Questa settimana</h2>
              <p className="text-sm text-gray-500">{stats.cleaningsWeek} pulizie programmate</p>
            </div>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyChartData} barSize={32}>
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} />
                <YAxis hide />
                <Tooltip contentStyle={{ backgroundColor: '#1E293B', border: 'none', borderRadius: '8px', color: '#fff' }} cursor={{ fill: 'rgba(99, 102, 241, 0.1)' }} />
                <Bar dataKey="pulizie" radius={[8, 8, 0, 0]}>
                  {weeklyChartData.map((entry: any, index: number) => {
                    const dayIndex = new Date().getDay();
                    const adjustedIndex = dayIndex === 0 ? 6 : dayIndex - 1;
                    return <Cell key={`cell-${index}`} fill={index === adjustedIndex ? '#4F46E5' : '#E5E7EB'} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Prossime Pulizie + Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Prossime pulizie</h2>
                <p className="text-sm text-gray-500">Attività programmate</p>
              </div>
              <Link href="/proprietario/calendario/pulizie" className="text-sm text-indigo-600 font-medium flex items-center gap-1 hover:text-indigo-700">Vedi tutte {Icons.arrow}</Link>
            </div>
            
            {upcomingCleanings.length === 0 ? (
              <div className="p-8 text-center text-gray-500">Nessuna pulizia programmata</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {upcomingCleanings.map((cleaning: any) => {
                  const { date, time } = formatCleaningDate(cleaning);
                  return (
                    <div key={cleaning.id} className="p-4 hover:bg-gray-50 transition-colors cursor-pointer">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center ${date === 'Oggi' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                          <span className="text-[10px] font-medium uppercase">{date}</span>
                          <span className="text-sm font-bold">{time}</span>
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{cleaning.propertyName || "Proprietà"}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-sm text-gray-500">{cleaning.type === "CHECKOUT" ? "Check-out" : cleaning.type === "CHECKIN" ? "Check-in" : cleaning.type === "DEEP_CLEAN" ? "Straordinaria" : "Manutenzione"}</span>
                            <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                            <span className="text-sm font-semibold text-indigo-600">€{cleaning.price || 0}</span>
                          </div>
                        </div>
                        {cleaning.status === "IN_PROGRESS" ? (
                          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-full border border-emerald-200 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>In corso
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 bg-gray-50 text-gray-600 text-xs font-medium rounded-full border border-gray-200">Programmata</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-5">
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm">Trend mensile</h3>
                  <p className="text-xs text-gray-500">Pulizie per settimana</p>
                </div>
                {monthlyTrendData.length >= 4 && monthlyTrendData[3]?.pulizie > monthlyTrendData[0]?.pulizie && (
                  <span className="text-xs text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full">+{Math.round(((monthlyTrendData[3].pulizie - monthlyTrendData[0].pulizie) / (monthlyTrendData[0].pulizie || 1)) * 100)}%</span>
                )}
              </div>
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyTrendData}>
                    <defs><linearGradient id="colorPulizie" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#4F46E5" stopOpacity={0.2}/><stop offset="95%" stopColor="#4F46E5" stopOpacity={0}/></linearGradient></defs>
                    <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1E293B', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '11px' }} />
                    <Area type="monotone" dataKey="pulizie" stroke="#4F46E5" strokeWidth={2} fill="url(#colorPulizie)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-indigo-600 rounded-2xl p-5 text-white">
              <h3 className="font-semibold mb-4">Riepilogo oggi</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between"><span className="text-indigo-200">Completate</span><span className="font-bold text-lg">{stats.completedToday}</span></div>
                <div className="flex items-center justify-between"><span className="text-indigo-200">In corso</span><span className="font-bold text-lg">{stats.inProgressToday}</span></div>
                <div className="flex items-center justify-between"><span className="text-indigo-200">In attesa</span><span className="font-bold text-lg">{stats.scheduledToday}</span></div>
              </div>
              <div className="mt-4 pt-4 border-t border-white/20">
                <div className="flex items-center justify-between"><span className="text-indigo-200">Incasso oggi</span><span className="text-2xl font-bold">€{stats.earningsToday}</span></div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <h3 className="font-semibold text-gray-900 text-sm mb-3">Statistiche</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between"><span className="text-gray-500 text-sm">Media giornaliera</span><span className="font-semibold text-gray-900">{(stats.cleaningsMonth / 30).toFixed(1)}</span></div>
                <div className="flex items-center justify-between"><span className="text-gray-500 text-sm">Prezzo medio</span><span className="font-semibold text-gray-900">€{stats.avgPrice}</span></div>
                <div className="flex items-center justify-between"><span className="text-gray-500 text-sm">Completamento</span><span className="font-semibold text-emerald-600">{stats.cleaningsMonth > 0 ? Math.round((stats.completedMonth / stats.cleaningsMonth) * 100) : 0}%</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
