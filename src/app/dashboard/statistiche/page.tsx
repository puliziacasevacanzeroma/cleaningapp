"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, onSnapshot, query, orderBy, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════
interface Cleaning {
  id: string;
  operatorId?: string;
  operatorName?: string;
  status: string;
  propertyId?: string;
  propertyName?: string;
  type?: string;
  price?: number;
  scheduledDate?: Timestamp;
  completedAt?: Timestamp;
  createdAt?: Timestamp;
}

interface Order {
  id: string;
  riderId?: string;
  riderName?: string;
  status: string;
  propertyId?: string;
  propertyName?: string;
  items?: { id: string; name: string; quantity: number }[];
  urgency?: "normal" | "urgent";
  scheduledDate?: Timestamp;
  deliveredAt?: Timestamp;
  createdAt?: Timestamp;
}

interface Property {
  id: string;
  name: string;
  status: string;
  ownerId?: string;
}

interface User {
  id: string;
  name?: string;
  role?: string;
  status?: string;
}

interface DailyStats {
  date: string;
  dayName: string;
  cleanings: number;
  deliveries: number;
  revenue: number;
}

type Period = "week" | "month" | "year";

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
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

const getDayName = (date: Date): string => {
  return date.toLocaleDateString("it-IT", { weekday: "short" });
};

const formatEuro = (amount: number): string => {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(amount);
};

// ═══════════════════════════════════════════════════════════════════════════
// STAT CARD
// ═══════════════════════════════════════════════════════════════════════════
function StatCard({ 
  icon, 
  label, 
  value, 
  subValue,
  color = "sky",
  large = false,
}: { 
  icon: string; 
  label: string; 
  value: number | string;
  subValue?: string;
  color?: "emerald" | "sky" | "amber" | "rose" | "violet" | "slate" | "indigo";
  large?: boolean;
}) {
  const colorClasses: Record<string, string> = {
    emerald: "from-emerald-500 to-teal-500",
    sky: "from-sky-500 to-blue-500",
    amber: "from-amber-500 to-orange-500",
    rose: "from-rose-500 to-red-500",
    violet: "from-violet-500 to-purple-500",
    slate: "from-slate-500 to-slate-600",
    indigo: "from-indigo-500 to-blue-600",
  };

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 p-4 shadow-sm ${large ? 'col-span-2' : ''}`}>
      <div className="flex items-center gap-3 mb-2">
        <div className={`${large ? 'w-12 h-12 text-xl' : 'w-10 h-10 text-lg'} rounded-xl bg-gradient-to-br ${colorClasses[color]} flex items-center justify-center shadow-lg`}>
          {icon}
        </div>
        <span className="text-sm text-slate-500 font-medium">{label}</span>
      </div>
      <div>
        <p className={`${large ? 'text-4xl' : 'text-3xl'} font-bold text-slate-800`}>{value}</p>
        {subValue && <p className="text-xs text-slate-400 mt-0.5">{subValue}</p>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DUAL BAR CHART
// ═══════════════════════════════════════════════════════════════════════════
function DualBarChart({ data }: { data: DailyStats[] }) {
  const maxCleanings = Math.max(...data.map(d => d.cleanings), 1);
  const maxDeliveries = Math.max(...data.map(d => d.deliveries), 1);
  const maxValue = Math.max(maxCleanings, maxDeliveries);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4 text-xs mb-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-gradient-to-r from-emerald-400 to-teal-500"></div>
          <span className="text-slate-600">Pulizie</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-gradient-to-r from-sky-400 to-blue-500"></div>
          <span className="text-slate-600">Consegne</span>
        </div>
      </div>
      <div className="flex items-end justify-between gap-2 h-32">
        {data.map((day, idx) => (
          <div key={idx} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full flex justify-center gap-0.5 items-end h-24">
              <div 
                className="w-1/2 max-w-[16px] rounded-t bg-gradient-to-t from-emerald-400 to-teal-500 transition-all duration-500"
                style={{ 
                  height: `${Math.max((day.cleanings / maxValue) * 100, 4)}%`,
                  opacity: day.cleanings > 0 ? 1 : 0.3
                }}
              />
              <div 
                className="w-1/2 max-w-[16px] rounded-t bg-gradient-to-t from-sky-400 to-blue-500 transition-all duration-500"
                style={{ 
                  height: `${Math.max((day.deliveries / maxValue) * 100, 4)}%`,
                  opacity: day.deliveries > 0 ? 1 : 0.3
                }}
              />
            </div>
            <span className="text-[10px] text-slate-400 font-medium">{day.dayName}</span>
            <div className="text-[10px] text-center">
              <span className="text-emerald-600 font-semibold">{day.cleanings}</span>
              <span className="text-slate-300 mx-0.5">/</span>
              <span className="text-sky-600 font-semibold">{day.deliveries}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TOP PERFORMERS
// ═══════════════════════════════════════════════════════════════════════════
function TopPerformers({ 
  title, 
  data, 
  icon,
  color = "emerald"
}: { 
  title: string; 
  data: { name: string; count: number }[];
  icon: string;
  color?: string;
}) {
  const colorClasses: Record<string, string> = {
    emerald: "from-emerald-100 to-teal-100 text-emerald-700",
    sky: "from-sky-100 to-blue-100 text-sky-700",
    amber: "from-amber-100 to-orange-100 text-amber-700",
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
        <span>{icon}</span> {title}
      </h3>
      {data.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-4">Nessun dato</p>
      ) : (
        <div className="space-y-2">
          {data.slice(0, 5).map((item, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${colorClasses[color]} flex items-center justify-center text-sm font-bold`}>
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">{item.name || "N/A"}</p>
              </div>
              <span className="text-sm font-bold text-slate-600">{item.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function AdminStatistichePage() {
  const [cleanings, setCleanings] = useState<Cleaning[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("week");

  // Load all data with realtime listeners
  useEffect(() => {
    const unsubscribers: (() => void)[] = [];

    // Cleanings
    const cleaningsQuery = query(collection(db, "cleanings"), orderBy("scheduledDate", "desc"));
    unsubscribers.push(
      onSnapshot(cleaningsQuery, (snap) => {
        setCleanings(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Cleaning[]);
      })
    );

    // Orders
    const ordersQuery = query(collection(db, "orders"), orderBy("createdAt", "desc"));
    unsubscribers.push(
      onSnapshot(ordersQuery, (snap) => {
        setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Order[]);
      })
    );

    // Properties
    unsubscribers.push(
      onSnapshot(collection(db, "properties"), (snap) => {
        setProperties(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Property[]);
      })
    );

    // Users
    unsubscribers.push(
      onSnapshot(collection(db, "users"), (snap) => {
        setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })) as User[]);
        setLoading(false);
      })
    );

    return () => unsubscribers.forEach(unsub => unsub());
  }, []);

  // Calculate stats
  const stats = useMemo(() => {
    const now = new Date();
    const today = getStartOfDay(now);
    const startOfWeek = getStartOfWeek(now);
    const startOfMonth = getStartOfMonth(now);
    const startOfYear = getStartOfYear(now);

    const completedCleanings = cleanings.filter(c => c.status === "COMPLETED");
    const deliveredOrders = orders.filter(o => o.status === "DELIVERED");

    const filterByDate = <T extends { completedAt?: Timestamp; deliveredAt?: Timestamp; scheduledDate?: Timestamp; createdAt?: Timestamp }>(
      items: T[], 
      startDate: Date,
      dateField: 'completedAt' | 'deliveredAt' | 'scheduledDate' | 'createdAt' = 'completedAt'
    ) => {
      return items.filter(item => {
        const date = item[dateField]?.toDate?.() || item.createdAt?.toDate?.();
        return date && date >= startDate;
      });
    };

    // Cleanings stats
    const todayCleanings = filterByDate(completedCleanings, today);
    const weekCleanings = filterByDate(completedCleanings, startOfWeek);
    const monthCleanings = filterByDate(completedCleanings, startOfMonth);
    const yearCleanings = filterByDate(completedCleanings, startOfYear);

    // Orders stats  
    const todayOrders = filterByDate(deliveredOrders, today, 'deliveredAt');
    const weekOrders = filterByDate(deliveredOrders, startOfWeek, 'deliveredAt');
    const monthOrders = filterByDate(deliveredOrders, startOfMonth, 'deliveredAt');
    const yearOrders = filterByDate(deliveredOrders, startOfYear, 'deliveredAt');

    // Revenue
    const calcRevenue = (list: Cleaning[]) => list.reduce((sum, c) => sum + (c.price || 0), 0);

    // Active entities
    const activeProperties = properties.filter(p => p.status === "ACTIVE").length;
    const activeOperators = users.filter(u => u.role === "OPERATORE_PULIZIE" && u.status !== "INACTIVE").length;
    const activeRiders = users.filter(u => u.role === "RIDER" && u.status !== "INACTIVE").length;
    const activeOwners = users.filter(u => u.role === "PROPRIETARIO" && u.status !== "INACTIVE").length;

    return {
      today: {
        cleanings: todayCleanings.length,
        orders: todayOrders.length,
        revenue: calcRevenue(todayCleanings),
      },
      week: {
        cleanings: weekCleanings.length,
        orders: weekOrders.length,
        revenue: calcRevenue(weekCleanings),
      },
      month: {
        cleanings: monthCleanings.length,
        orders: monthOrders.length,
        revenue: calcRevenue(monthCleanings),
      },
      year: {
        cleanings: yearCleanings.length,
        orders: yearOrders.length,
        revenue: calcRevenue(yearCleanings),
      },
      totals: {
        cleanings: completedCleanings.length,
        orders: deliveredOrders.length,
        revenue: calcRevenue(completedCleanings),
        properties: activeProperties,
        operators: activeOperators,
        riders: activeRiders,
        owners: activeOwners,
      },
      pending: {
        cleanings: cleanings.filter(c => c.status === "SCHEDULED" || c.status === "ASSIGNED").length,
        orders: orders.filter(o => o.status === "PENDING" || o.status === "PICKING").length,
      }
    };
  }, [cleanings, orders, properties, users]);

  // Daily data for chart
  const dailyData = useMemo(() => {
    const now = new Date();
    const days: DailyStats[] = [];
    const daysCount = period === "week" ? 7 : period === "month" ? 30 : 12;

    const completedCleanings = cleanings.filter(c => c.status === "COMPLETED");
    const deliveredOrders = orders.filter(o => o.status === "DELIVERED");

    if (period === "year") {
      for (let i = 11; i >= 0; i--) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);

        const monthCleanings = completedCleanings.filter(c => {
          const date = c.completedAt?.toDate?.() || c.scheduledDate?.toDate?.();
          return date && date >= monthStart && date <= monthEnd;
        });

        const monthOrders = deliveredOrders.filter(o => {
          const date = o.deliveredAt?.toDate?.() || o.createdAt?.toDate?.();
          return date && date >= monthStart && date <= monthEnd;
        });

        days.push({
          date: monthStart.toISOString(),
          dayName: monthStart.toLocaleDateString("it-IT", { month: "short" }).substring(0, 3),
          cleanings: monthCleanings.length,
          deliveries: monthOrders.length,
          revenue: monthCleanings.reduce((sum, c) => sum + (c.price || 0), 0),
        });
      }
    } else {
      for (let i = daysCount - 1; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dayStart = getStartOfDay(date);
        const dayEnd = new Date(dayStart);
        dayEnd.setHours(23, 59, 59, 999);

        const dayCleanings = completedCleanings.filter(c => {
          const cDate = c.completedAt?.toDate?.() || c.scheduledDate?.toDate?.();
          return cDate && cDate >= dayStart && cDate <= dayEnd;
        });

        const dayOrders = deliveredOrders.filter(o => {
          const oDate = o.deliveredAt?.toDate?.() || o.createdAt?.toDate?.();
          return oDate && oDate >= dayStart && oDate <= dayEnd;
        });

        days.push({
          date: dayStart.toISOString(),
          dayName: getDayName(dayStart),
          cleanings: dayCleanings.length,
          deliveries: dayOrders.length,
          revenue: dayCleanings.reduce((sum, c) => sum + (c.price || 0), 0),
        });
      }
    }

    return days;
  }, [cleanings, orders, period]);

  // Top performers
  const topOperators = useMemo(() => {
    const now = new Date();
    const startDate = period === "week" ? getStartOfWeek(now) : period === "month" ? getStartOfMonth(now) : getStartOfYear(now);
    
    const completed = cleanings.filter(c => {
      if (c.status !== "COMPLETED" || !c.operatorId) return false;
      const date = c.completedAt?.toDate?.() || c.scheduledDate?.toDate?.();
      return date && date >= startDate;
    });

    const counts: Record<string, { name: string; count: number }> = {};
    completed.forEach(c => {
      if (!c.operatorId) return;
      if (!counts[c.operatorId]) {
        counts[c.operatorId] = { name: c.operatorName || "Operatore", count: 0 };
      }
      counts[c.operatorId].count++;
    });

    return Object.values(counts).sort((a, b) => b.count - a.count);
  }, [cleanings, period]);

  const topRiders = useMemo(() => {
    const now = new Date();
    const startDate = period === "week" ? getStartOfWeek(now) : period === "month" ? getStartOfMonth(now) : getStartOfYear(now);
    
    const delivered = orders.filter(o => {
      if (o.status !== "DELIVERED" || !o.riderId) return false;
      const date = o.deliveredAt?.toDate?.() || o.createdAt?.toDate?.();
      return date && date >= startDate;
    });

    const counts: Record<string, { name: string; count: number }> = {};
    delivered.forEach(o => {
      if (!o.riderId) return;
      if (!counts[o.riderId]) {
        counts[o.riderId] = { name: o.riderName || "Rider", count: 0 };
      }
      counts[o.riderId].count++;
    });

    return Object.values(counts).sort((a, b) => b.count - a.count);
  }, [orders, period]);

  const topProperties = useMemo(() => {
    const now = new Date();
    const startDate = period === "week" ? getStartOfWeek(now) : period === "month" ? getStartOfMonth(now) : getStartOfYear(now);
    
    const completed = cleanings.filter(c => {
      if (c.status !== "COMPLETED" || !c.propertyId) return false;
      const date = c.completedAt?.toDate?.() || c.scheduledDate?.toDate?.();
      return date && date >= startDate;
    });

    const counts: Record<string, { name: string; count: number }> = {};
    completed.forEach(c => {
      if (!c.propertyId) return;
      if (!counts[c.propertyId]) {
        counts[c.propertyId] = { name: c.propertyName || "Proprietà", count: 0 };
      }
      counts[c.propertyId].count++;
    });

    return Object.values(counts).sort((a, b) => b.count - a.count);
  }, [cleanings, period]);

  const currentStats = period === "week" ? stats.week : period === "month" ? stats.month : stats.year;
  const today = new Date();

  if (loading) {
    return (
      <div className="p-4 lg:p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-slate-200 rounded w-64"></div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-32 bg-slate-200 rounded-2xl"></div>)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">📊 Statistiche Sistema</h1>
          <p className="text-slate-500 mt-1">
            {today.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>

        {/* Period Selector */}
        <div className="flex gap-2 bg-white rounded-xl p-1 shadow-sm border border-slate-200">
          {(["week", "month", "year"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                period === p
                  ? "bg-gradient-to-r from-indigo-500 to-blue-500 text-white shadow"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {p === "week" ? "Settimana" : p === "month" ? "Mese" : "Anno"}
            </button>
          ))}
        </div>
      </div>

      {/* Quick Stats - Today */}
      <div className="bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-500 rounded-2xl p-5 text-white shadow-lg">
        <h3 className="text-sm font-medium text-white/80 mb-3">📅 OGGI</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-4xl font-bold">{stats.today.cleanings}</p>
            <p className="text-sm text-white/80">Pulizie</p>
          </div>
          <div className="text-center border-x border-white/20">
            <p className="text-4xl font-bold">{stats.today.orders}</p>
            <p className="text-sm text-white/80">Consegne</p>
          </div>
          <div className="text-center">
            <p className="text-4xl font-bold">{formatEuro(stats.today.revenue)}</p>
            <p className="text-sm text-white/80">Fatturato</p>
          </div>
        </div>
      </div>

      {/* Pending Alert */}
      {(stats.pending.cleanings > 0 || stats.pending.orders > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center text-2xl">
            ⏳
          </div>
          <div>
            <p className="font-semibold text-amber-800">Attività in sospeso</p>
            <p className="text-sm text-amber-600">
              {stats.pending.cleanings > 0 && `${stats.pending.cleanings} pulizie da completare`}
              {stats.pending.cleanings > 0 && stats.pending.orders > 0 && " • "}
              {stats.pending.orders > 0 && `${stats.pending.orders} consegne in corso`}
            </p>
          </div>
        </div>
      )}

      {/* Period Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon="🧹"
          label="Pulizie"
          value={currentStats.cleanings}
          subValue={`${stats.totals.cleanings} totali`}
          color="emerald"
        />
        <StatCard
          icon="📦"
          label="Consegne"
          value={currentStats.orders}
          subValue={`${stats.totals.orders} totali`}
          color="sky"
        />
        <StatCard
          icon="💰"
          label="Fatturato"
          value={formatEuro(currentStats.revenue)}
          subValue={`${formatEuro(stats.totals.revenue)} totale`}
          color="amber"
          large
        />
      </div>

      {/* Chart */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <h3 className="font-semibold text-slate-800 mb-4">📈 Andamento Attività</h3>
        <DualBarChart data={period === "year" ? dailyData : dailyData.slice(-7)} />
      </div>

      {/* System Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="🏠" label="Proprietà Attive" value={stats.totals.properties} color="indigo" />
        <StatCard icon="👷" label="Operatori" value={stats.totals.operators} color="emerald" />
        <StatCard icon="🛵" label="Rider" value={stats.totals.riders} color="sky" />
        <StatCard icon="👤" label="Proprietari" value={stats.totals.owners} color="violet" />
      </div>

      {/* Top Performers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TopPerformers 
          title="Top Operatori" 
          data={topOperators} 
          icon="🏆"
          color="emerald"
        />
        <TopPerformers 
          title="Top Rider" 
          data={topRiders} 
          icon="🥇"
          color="sky"
        />
        <TopPerformers 
          title="Proprietà più attive" 
          data={topProperties} 
          icon="🏠"
          color="amber"
        />
      </div>
    </div>
  );
}
