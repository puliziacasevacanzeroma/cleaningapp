"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "~/lib/firebase/AuthContext";
import { collection, query, where, onSnapshot, orderBy, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════
interface Order {
  id: string;
  riderId?: string;
  status: string;
  propertyName?: string;
  propertyAddress?: string;
  propertyCity?: string;
  items?: { id: string; name: string; quantity: number }[];
  urgency?: "normal" | "urgent";
  includePickup?: boolean;
  pickupCompleted?: boolean;
  pickupItems?: { id: string; name: string; quantity: number }[];
  createdAt?: Timestamp;
  deliveredAt?: Timestamp;
  departedAt?: Timestamp;
  startedAt?: Timestamp;
}

interface DailyStats {
  date: string;
  dateLabel: string;
  dayName: string;
  deliveries: number;
  pickups: number;
  items: number;
  urgent: number;
}

type Period = "week" | "month" | "year";

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════
const getStartOfDay = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getStartOfWeek = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getStartOfMonth = (date: Date): Date => {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getStartOfYear = (date: Date): Date => {
  const d = new Date(date);
  d.setMonth(0, 1);
  d.setHours(0, 0, 0, 0);
  return d;
};

const formatDateShort = (date: Date): string => {
  return date.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
};

const getDayName = (date: Date): string => {
  return date.toLocaleDateString("it-IT", { weekday: "short" });
};

// ═══════════════════════════════════════════════════════════════════════════
// STAT CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function StatCard({ 
  icon, 
  label, 
  value, 
  subValue,
  color = "sky",
}: { 
  icon: string; 
  label: string; 
  value: number | string;
  subValue?: string;
  color?: "emerald" | "sky" | "amber" | "rose" | "violet" | "slate";
}) {
  const colorClasses = {
    emerald: "from-emerald-500 to-teal-500",
    sky: "from-sky-500 to-blue-500",
    amber: "from-amber-500 to-orange-500",
    rose: "from-rose-500 to-red-500",
    violet: "from-violet-500 to-purple-500",
    slate: "from-slate-500 to-slate-600",
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colorClasses[color]} flex items-center justify-center text-lg shadow-lg`}>
          {icon}
        </div>
        <span className="text-sm text-slate-500 font-medium">{label}</span>
      </div>
      <div className="ml-13">
        <p className="text-3xl font-bold text-slate-800">{value}</p>
        {subValue && <p className="text-xs text-slate-400 mt-0.5">{subValue}</p>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MINI BAR CHART
// ═══════════════════════════════════════════════════════════════════════════
function MiniBarChart({ data, color = "sky" }: { data: DailyStats[]; color?: string }) {
  const maxValue = Math.max(...data.map(d => d.deliveries), 1);
  
  const colorClasses: Record<string, string> = {
    sky: "from-sky-400 to-blue-500",
    emerald: "from-emerald-400 to-teal-500",
    amber: "from-amber-400 to-orange-500",
  };

  return (
    <div className="flex items-end justify-between gap-1 h-24 px-2">
      {data.map((day, idx) => (
        <div key={idx} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full flex justify-center">
            <div 
              className={`w-full max-w-[32px] rounded-t-lg bg-gradient-to-t ${colorClasses[color]} transition-all duration-500`}
              style={{ 
                height: `${Math.max((day.deliveries / maxValue) * 60, 4)}px`,
                opacity: day.deliveries > 0 ? 1 : 0.3
              }}
            />
          </div>
          <span className="text-[10px] text-slate-400 font-medium">{day.dayName}</span>
          <span className="text-xs font-bold text-slate-600">{day.deliveries}</span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function RiderStatistichePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [period, setPeriod] = useState<Period>("week");

  // Auth check
  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  // Carica ordini del rider
  useEffect(() => {
    if (!user?.id) return;

    const ordersRef = collection(db, "orders");
    const q = query(
      ordersRef,
      where("riderId", "==", user.id),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];
      setOrders(ordersData);
      setLoadingData(false);
    });

    return () => unsubscribe();
  }, [user?.id]);

  // Calcola statistiche
  const stats = useMemo(() => {
    const now = new Date();
    const today = getStartOfDay(now);
    const startOfWeek = getStartOfWeek(now);
    const startOfMonth = getStartOfMonth(now);
    const startOfYear = getStartOfYear(now);

    // Filtra ordini consegnati
    const delivered = orders.filter(o => o.status === "DELIVERED");

    // Oggi
    const todayOrders = delivered.filter(o => {
      const date = o.deliveredAt?.toDate?.() || o.createdAt?.toDate?.();
      return date && date >= today;
    });

    // Questa settimana
    const weekOrders = delivered.filter(o => {
      const date = o.deliveredAt?.toDate?.() || o.createdAt?.toDate?.();
      return date && date >= startOfWeek;
    });

    // Questo mese
    const monthOrders = delivered.filter(o => {
      const date = o.deliveredAt?.toDate?.() || o.createdAt?.toDate?.();
      return date && date >= startOfMonth;
    });

    // Quest'anno
    const yearOrders = delivered.filter(o => {
      const date = o.deliveredAt?.toDate?.() || o.createdAt?.toDate?.();
      return date && date >= startOfYear;
    });

    // Calcola totali articoli
    const calcItems = (ordersList: Order[]) => 
      ordersList.reduce((sum, o) => sum + (o.items?.reduce((s, i) => s + i.quantity, 0) || 0), 0);

    // Calcola urgenti
    const calcUrgent = (ordersList: Order[]) => 
      ordersList.filter(o => o.urgency === "urgent").length;

    // Calcola ritiri
    const calcPickups = (ordersList: Order[]) =>
      ordersList.filter(o => o.includePickup && o.pickupItems && o.pickupItems.length > 0).length;

    return {
      today: {
        deliveries: todayOrders.length,
        items: calcItems(todayOrders),
        urgent: calcUrgent(todayOrders),
        pickups: calcPickups(todayOrders),
      },
      week: {
        deliveries: weekOrders.length,
        items: calcItems(weekOrders),
        urgent: calcUrgent(weekOrders),
        pickups: calcPickups(weekOrders),
      },
      month: {
        deliveries: monthOrders.length,
        items: calcItems(monthOrders),
        urgent: calcUrgent(monthOrders),
        pickups: calcPickups(monthOrders),
      },
      year: {
        deliveries: yearOrders.length,
        items: calcItems(yearOrders),
        urgent: calcUrgent(yearOrders),
        pickups: calcPickups(yearOrders),
      },
      total: delivered.length,
    };
  }, [orders]);

  // Calcola dati giornalieri per il grafico
  const dailyData = useMemo(() => {
    const now = new Date();
    const days: DailyStats[] = [];
    
    const daysCount = period === "week" ? 7 : period === "month" ? 30 : 12;
    const delivered = orders.filter(o => o.status === "DELIVERED");

    if (period === "year") {
      // Raggruppa per mese
      for (let i = 11; i >= 0; i--) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
        
        const monthOrders = delivered.filter(o => {
          const date = o.deliveredAt?.toDate?.() || o.createdAt?.toDate?.();
          return date && date >= monthStart && date <= monthEnd;
        });

        days.push({
          date: monthStart.toISOString(),
          dateLabel: monthStart.toLocaleDateString("it-IT", { month: "short" }),
          dayName: monthStart.toLocaleDateString("it-IT", { month: "short" }).substring(0, 3),
          deliveries: monthOrders.length,
          pickups: monthOrders.filter(o => o.includePickup).length,
          items: monthOrders.reduce((sum, o) => sum + (o.items?.reduce((s, i) => s + i.quantity, 0) || 0), 0),
          urgent: monthOrders.filter(o => o.urgency === "urgent").length,
        });
      }
    } else {
      // Raggruppa per giorno
      for (let i = daysCount - 1; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dayStart = getStartOfDay(date);
        const dayEnd = new Date(dayStart);
        dayEnd.setHours(23, 59, 59, 999);

        const dayOrders = delivered.filter(o => {
          const orderDate = o.deliveredAt?.toDate?.() || o.createdAt?.toDate?.();
          return orderDate && orderDate >= dayStart && orderDate <= dayEnd;
        });

        days.push({
          date: dayStart.toISOString(),
          dateLabel: formatDateShort(dayStart),
          dayName: getDayName(dayStart),
          deliveries: dayOrders.length,
          pickups: dayOrders.filter(o => o.includePickup).length,
          items: dayOrders.reduce((sum, o) => sum + (o.items?.reduce((s, i) => s + i.quantity, 0) || 0), 0),
          urgent: dayOrders.filter(o => o.urgency === "urgent").length,
        });
      }
    }

    return days;
  }, [orders, period]);

  // Media giornaliera
  const avgPerDay = useMemo(() => {
    const activeDays = dailyData.filter(d => d.deliveries > 0).length;
    const total = dailyData.reduce((sum, d) => sum + d.deliveries, 0);
    return activeDays > 0 ? (total / activeDays).toFixed(1) : "0";
  }, [dailyData]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
      </div>
    );
  }

  const today = new Date();

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-sky-500 to-blue-600 text-white px-4 py-6 rounded-b-3xl shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <Link 
            href="/rider" 
            className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center active:scale-95 transition-transform"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-xl font-bold">📊 Le Mie Statistiche</h1>
            <p className="text-white/80 text-sm">
              {today.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white/20 rounded-2xl p-3 text-center">
            <p className="text-3xl font-bold">{stats.today.deliveries}</p>
            <p className="text-xs text-white/80">Oggi</p>
          </div>
          <div className="bg-white/20 rounded-2xl p-3 text-center">
            <p className="text-3xl font-bold">{stats.week.deliveries}</p>
            <p className="text-xs text-white/80">Settimana</p>
          </div>
          <div className="bg-white/20 rounded-2xl p-3 text-center">
            <p className="text-3xl font-bold">{stats.month.deliveries}</p>
            <p className="text-xs text-white/80">Mese</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6 space-y-6 pb-24">
        {/* Period Selector */}
        <div className="flex gap-2 bg-white rounded-2xl p-2 shadow-sm border border-slate-200">
          {(["week", "month", "year"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                period === p
                  ? "bg-gradient-to-r from-sky-500 to-blue-500 text-white shadow-lg"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {p === "week" ? "7 Giorni" : p === "month" ? "30 Giorni" : "Anno"}
            </button>
          ))}
        </div>

        {/* Chart */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-800">📈 Andamento Consegne</h3>
            <span className="text-sm text-slate-500">Media: {avgPerDay}/giorno</span>
          </div>
          
          {loadingData ? (
            <div className="h-24 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
            </div>
          ) : (
            <MiniBarChart 
              data={period === "year" ? dailyData : dailyData.slice(-7)} 
              color="sky" 
            />
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon="📦"
            label="Consegne Totali"
            value={period === "week" ? stats.week.deliveries : period === "month" ? stats.month.deliveries : stats.year.deliveries}
            subValue={`${stats.total} totali`}
            color="sky"
          />
          <StatCard
            icon="🛍️"
            label="Articoli"
            value={period === "week" ? stats.week.items : period === "month" ? stats.month.items : stats.year.items}
            subValue="consegnati"
            color="emerald"
          />
          <StatCard
            icon="🚨"
            label="Urgenti"
            value={period === "week" ? stats.week.urgent : period === "month" ? stats.month.urgent : stats.year.urgent}
            subValue="completate"
            color="rose"
          />
          <StatCard
            icon="📥"
            label="Ritiri"
            value={period === "week" ? stats.week.pickups : period === "month" ? stats.month.pickups : stats.year.pickups}
            subValue="biancheria"
            color="amber"
          />
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800">🕐 Ultime Consegne</h3>
          </div>
          
          {loadingData ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500 mx-auto"></div>
            </div>
          ) : orders.filter(o => o.status === "DELIVERED").length === 0 ? (
            <div className="p-8 text-center">
              <span className="text-4xl">📭</span>
              <p className="text-slate-500 mt-2">Nessuna consegna ancora</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {orders
                .filter(o => o.status === "DELIVERED")
                .slice(0, 5)
                .map((order) => {
                  const deliveredDate = order.deliveredAt?.toDate?.() || order.createdAt?.toDate?.();
                  return (
                    <div key={order.id} className="px-4 py-3 flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                        order.urgency === "urgent" 
                          ? "bg-gradient-to-br from-rose-100 to-red-100" 
                          : "bg-gradient-to-br from-sky-100 to-blue-100"
                      }`}>
                        {order.urgency === "urgent" ? "🚨" : "📦"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 truncate">{order.propertyName || "Proprietà"}</p>
                        <p className="text-xs text-slate-500 truncate">{order.propertyAddress}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-slate-600">
                          {order.items?.reduce((sum, i) => sum + i.quantity, 0) || 0} art.
                        </p>
                        <p className="text-xs text-slate-400">
                          {deliveredDate?.toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
                        </p>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Achievement Badge */}
        {stats.total >= 100 && (
          <div className="bg-gradient-to-r from-amber-400 to-orange-500 rounded-2xl p-4 text-white shadow-lg">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center text-3xl">
                🏆
              </div>
              <div>
                <p className="text-lg font-bold">Super Rider!</p>
                <p className="text-white/80 text-sm">Hai completato oltre {stats.total} consegne!</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
