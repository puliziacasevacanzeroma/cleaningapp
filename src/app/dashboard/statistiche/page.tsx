"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, onSnapshot, query, orderBy, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

// Types
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
  startedAt?: Timestamp;
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
  deliveredAt?: Timestamp;
  createdAt?: Timestamp;
}

interface Property {
  id: string;
  name: string;
  status: string;
  city?: string;
}

interface User {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  status?: string;
}

interface DailyStats {
  dayName: string;
  cleanings: number;
  deliveries: number;
  revenue: number;
}

type Period = "week" | "month" | "year";
type MobileTab = "overview" | "pulizie" | "consegne" | "team";

// Helpers
const getStartOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const getStartOfWeek = (d: Date) => { const x = new Date(d); const day = x.getDay(); x.setDate(x.getDate() - day + (day === 0 ? -6 : 1)); x.setHours(0,0,0,0); return x; };
const getStartOfMonth = (d: Date) => { const x = new Date(d); x.setDate(1); x.setHours(0,0,0,0); return x; };
const getStartOfYear = (d: Date) => { const x = new Date(d); x.setMonth(0,1); x.setHours(0,0,0,0); return x; };
const getDayName = (d: Date) => d.toLocaleDateString("it-IT", { weekday: "short" });
const formatEuro = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
const formatNum = (n: number) => new Intl.NumberFormat("it-IT").format(n);

// Components
function MiniCard({ icon, label, value, color = "slate" }: { icon: string; label: string; value: string | number; color?: string }) {
  const colors: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-600", sky: "bg-sky-50 text-sky-600", amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600", violet: "bg-violet-50 text-violet-600", slate: "bg-slate-50 text-slate-600",
  };
  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
      <div className={`w-10 h-10 rounded-xl ${colors[color]} flex items-center justify-center text-lg mb-2`}>{icon}</div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

function BigCard({ icon, label, value, sub, trend, color = "indigo" }: { icon: string; label: string; value: string | number; sub?: string; trend?: number; color?: string }) {
  const grads: Record<string, string> = {
    emerald: "from-emerald-500 to-teal-600", sky: "from-sky-500 to-blue-600", amber: "from-amber-500 to-orange-600",
    rose: "from-rose-500 to-red-600", violet: "from-violet-500 to-purple-600", indigo: "from-indigo-500 to-blue-600",
  };
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${grads[color]} flex items-center justify-center text-2xl shadow-lg`}>{icon}</div>
        {trend !== undefined && (
          <div className={`px-3 py-1 rounded-full text-sm font-semibold ${trend >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
            {trend >= 0 ? "↑" : "↓"} {Math.abs(trend)}%
          </div>
        )}
      </div>
      <p className="text-4xl font-bold text-slate-800 mb-1">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

function BarChart({ data, height = 200 }: { data: DailyStats[]; height?: number }) {
  const max = Math.max(...data.map(d => Math.max(d.cleanings, d.deliveries)), 1);
  return (
    <div style={{ height }} className="flex items-end justify-between gap-1 pb-6">
      {data.map((day, i) => (
        <div key={i} className="flex-1 flex flex-col items-center">
          <div className="flex-1 w-full flex justify-center gap-0.5 items-end">
            <div className="w-2/5 max-w-[18px] rounded-t bg-gradient-to-t from-emerald-500 to-teal-400" style={{ height: `${Math.max((day.cleanings / max) * 100, 3)}%` }} />
            <div className="w-2/5 max-w-[18px] rounded-t bg-gradient-to-t from-sky-500 to-blue-400" style={{ height: `${Math.max((day.deliveries / max) * 100, 3)}%` }} />
          </div>
          <span className="text-[10px] text-slate-400 mt-2">{day.dayName}</span>
        </div>
      ))}
    </div>
  );
}

function TopList({ title, icon, data, color = "emerald" }: { title: string; icon: string; data: { name: string; count: number }[]; color?: string }) {
  const c: Record<string, { bg: string; badge: string }> = {
    emerald: { bg: "bg-emerald-50 text-emerald-700", badge: "bg-emerald-500" },
    sky: { bg: "bg-sky-50 text-sky-700", badge: "bg-sky-500" },
    amber: { bg: "bg-amber-50 text-amber-700", badge: "bg-amber-500" },
  };
  const col = c[color] || c.emerald;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
        <span className="text-xl">{icon}</span>
        <h3 className="font-semibold text-slate-800">{title}</h3>
      </div>
      {data.length === 0 ? (
        <div className="p-8 text-center text-slate-400">📭 Nessun dato</div>
      ) : (
        <div className="divide-y divide-slate-50">
          {data.slice(0, 5).map((item, i) => (
            <div key={i} className="px-5 py-3 flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg ${col.bg} flex items-center justify-center text-sm font-bold`}>{i + 1}</div>
              <p className="flex-1 font-medium text-slate-700 truncate">{item.name || "N/A"}</p>
              <div className={`${col.badge} text-white text-sm font-bold px-3 py-1 rounded-full`}>{item.count}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProgressRing({ value, max, label, color = "emerald" }: { value: number; max: number; label: string; color?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const circ = 2 * Math.PI * 40;
  const offset = circ - (pct / 100) * circ;
  const cols: Record<string, string> = { emerald: "#10b981", sky: "#0ea5e9", amber: "#f59e0b" };
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24">
        <svg className="w-full h-full -rotate-90">
          <circle cx="48" cy="48" r="40" stroke="#e2e8f0" strokeWidth="8" fill="none" />
          <circle cx="48" cy="48" r="40" stroke={cols[color]} strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold text-slate-800">{Math.round(pct)}%</span>
        </div>
      </div>
      <p className="text-sm text-slate-500 mt-2">{label}</p>
    </div>
  );
}

// Main Component
export default function AdminStatistichePage() {
  const [cleanings, setCleanings] = useState<Cleaning[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("week");
  const [mobileTab, setMobileTab] = useState<MobileTab>("overview");
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const unsubs: (() => void)[] = [];
    unsubs.push(onSnapshot(query(collection(db, "cleanings"), orderBy("scheduledDate", "desc")), s => setCleanings(s.docs.map(d => ({ id: d.id, ...d.data() })) as Cleaning[])));
    unsubs.push(onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc")), s => setOrders(s.docs.map(d => ({ id: d.id, ...d.data() })) as Order[])));
    unsubs.push(onSnapshot(collection(db, "properties"), s => setProperties(s.docs.map(d => ({ id: d.id, ...d.data() })) as Property[])));
    unsubs.push(onSnapshot(collection(db, "users"), s => { setUsers(s.docs.map(d => ({ id: d.id, ...d.data() })) as User[]); setLoading(false); }));
    return () => unsubs.forEach(u => u());
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const today = getStartOfDay(now);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const weekStart = getStartOfWeek(now);
    const lastWeekStart = new Date(weekStart); lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const monthStart = getStartOfMonth(now);
    const lastMonthStart = new Date(monthStart); lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
    const yearStart = getStartOfYear(now);

    const done = cleanings.filter(c => c.status === "COMPLETED");
    const deliv = orders.filter(o => o.status === "DELIVERED");

    const filter = (items: any[], start: Date, end?: Date, field = 'completedAt') => items.filter(item => {
      const d = item[field]?.toDate?.() || item.createdAt?.toDate?.();
      return d && d >= start && (!end || d < end);
    });

    const todayC = filter(done, today);
    const todayO = filter(deliv, today, undefined, 'deliveredAt');
    const yesterdayC = filter(done, yesterday, today);
    const weekC = filter(done, weekStart);
    const weekO = filter(deliv, weekStart, undefined, 'deliveredAt');
    const lastWeekC = filter(done, lastWeekStart, weekStart);
    const monthC = filter(done, monthStart);
    const monthO = filter(deliv, monthStart, undefined, 'deliveredAt');
    const lastMonthC = filter(done, lastMonthStart, monthStart);
    const yearC = filter(done, yearStart);
    const yearO = filter(deliv, yearStart, undefined, 'deliveredAt');

    const rev = (l: Cleaning[]) => l.reduce((s, c) => s + (c.price || 0), 0);
    const items = (l: Order[]) => l.reduce((s, o) => s + (o.items?.reduce((x, i) => x + i.quantity, 0) || 0), 0);

    const ops = users.filter(u => u.role === "OPERATORE_PULIZIE" && u.status !== "INACTIVE");
    const rids = users.filter(u => u.role === "RIDER" && u.status !== "INACTIVE");
    const owns = users.filter(u => u.role === "PROPRIETARIO" && u.status !== "INACTIVE");
    const props = properties.filter(p => p.status === "ACTIVE");
    const pendC = cleanings.filter(c => c.status === "SCHEDULED" || c.status === "ASSIGNED");
    const pendO = orders.filter(o => ["PENDING", "PICKING", "IN_TRANSIT"].includes(o.status));
    const sgrossi = done.filter(c => c.type === "SGROSSO");
    const urgPend = orders.filter(o => o.urgency === "urgent" && o.status !== "DELIVERED").length;

    const weekTrend = lastWeekC.length > 0 ? Math.round(((weekC.length - lastWeekC.length) / lastWeekC.length) * 100) : 0;
    const monthTrend = lastMonthC.length > 0 ? Math.round(((monthC.length - lastMonthC.length) / lastMonthC.length) * 100) : 0;

    return {
      today: { cleanings: todayC.length, orders: todayO.length, revenue: rev(todayC), items: items(todayO) },
      yesterday: { cleanings: yesterdayC.length },
      week: { cleanings: weekC.length, orders: weekO.length, revenue: rev(weekC), items: items(weekO), trend: weekTrend },
      month: { cleanings: monthC.length, orders: monthO.length, revenue: rev(monthC), items: items(monthO), trend: monthTrend, sgrossi: filter(sgrossi, monthStart).length },
      year: { cleanings: yearC.length, orders: yearO.length, revenue: rev(yearC), items: items(yearO) },
      totals: { cleanings: done.length, orders: deliv.length, revenue: rev(done), items: items(deliv), props: props.length, ops: ops.length, rids: rids.length, owns: owns.length, sgrossi: sgrossi.length },
      pending: { cleanings: pendC.length, orders: pendO.length },
      urgPend,
      ops, rids, owns, props,
    };
  }, [cleanings, orders, properties, users]);

  const dailyData = useMemo(() => {
    const now = new Date();
    const days: DailyStats[] = [];
    const cnt = period === "week" ? 7 : period === "month" ? 30 : 12;
    const done = cleanings.filter(c => c.status === "COMPLETED");
    const deliv = orders.filter(o => o.status === "DELIVERED");

    for (let i = cnt - 1; i >= 0; i--) {
      let start: Date, end: Date, label: string;
      if (period === "year") {
        start = new Date(now.getFullYear(), now.getMonth() - i, 1);
        end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
        label = start.toLocaleDateString("it-IT", { month: "short" }).substring(0, 3);
      } else {
        const d = new Date(now); d.setDate(d.getDate() - i);
        start = getStartOfDay(d);
        end = new Date(start); end.setHours(23, 59, 59, 999);
        label = getDayName(start);
      }
      const dc = done.filter(c => { const x = c.completedAt?.toDate?.() || c.scheduledDate?.toDate?.(); return x && x >= start && x <= end; });
      const dor = deliv.filter(o => { const x = o.deliveredAt?.toDate?.() || o.createdAt?.toDate?.(); return x && x >= start && x <= end; });
      days.push({ dayName: label, cleanings: dc.length, deliveries: dor.length, revenue: dc.reduce((s, c) => s + (c.price || 0), 0) });
    }
    return days;
  }, [cleanings, orders, period]);

  const topOps = useMemo(() => {
    const start = period === "week" ? getStartOfWeek(new Date()) : period === "month" ? getStartOfMonth(new Date()) : getStartOfYear(new Date());
    const done = cleanings.filter(c => c.status === "COMPLETED" && c.operatorId && (c.completedAt?.toDate?.() || c.scheduledDate?.toDate?.())! >= start);
    const counts: Record<string, { name: string; count: number }> = {};
    done.forEach(c => { if (!counts[c.operatorId!]) counts[c.operatorId!] = { name: c.operatorName || "Operatore", count: 0 }; counts[c.operatorId!].count++; });
    return Object.values(counts).sort((a, b) => b.count - a.count);
  }, [cleanings, period]);

  const topRids = useMemo(() => {
    const start = period === "week" ? getStartOfWeek(new Date()) : period === "month" ? getStartOfMonth(new Date()) : getStartOfYear(new Date());
    const deliv = orders.filter(o => o.status === "DELIVERED" && o.riderId && (o.deliveredAt?.toDate?.() || o.createdAt?.toDate?.())! >= start);
    const counts: Record<string, { name: string; count: number }> = {};
    deliv.forEach(o => { if (!counts[o.riderId!]) counts[o.riderId!] = { name: o.riderName || "Rider", count: 0 }; counts[o.riderId!].count++; });
    return Object.values(counts).sort((a, b) => b.count - a.count);
  }, [orders, period]);

  const topProps = useMemo(() => {
    const start = period === "week" ? getStartOfWeek(new Date()) : period === "month" ? getStartOfMonth(new Date()) : getStartOfYear(new Date());
    const done = cleanings.filter(c => c.status === "COMPLETED" && c.propertyId && (c.completedAt?.toDate?.() || c.scheduledDate?.toDate?.())! >= start);
    const counts: Record<string, { name: string; count: number }> = {};
    done.forEach(c => { if (!counts[c.propertyId!]) counts[c.propertyId!] = { name: c.propertyName || "Proprietà", count: 0 }; counts[c.propertyId!].count++; });
    return Object.values(counts).sort((a, b) => b.count - a.count);
  }, [cleanings, period]);

  const curr = period === "week" ? stats.week : period === "month" ? stats.month : stats.year;
  const today = new Date();

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
    </div>
  );

  // MOBILE
  if (!isDesktop) return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-500 text-white px-4 pt-6 pb-8">
        <h1 className="text-2xl font-bold mb-1">📊 Statistiche</h1>
        <p className="text-white/70 text-sm">{today.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</p>
        <div className="flex gap-2 mt-4">
          {(["week", "month", "year"] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)} className={`px-4 py-2 rounded-full text-sm font-medium ${period === p ? "bg-white text-indigo-600" : "bg-white/20"}`}>
              {p === "week" ? "7gg" : p === "month" ? "30gg" : "Anno"}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3 mt-6">
          <div className="bg-white/20 backdrop-blur rounded-2xl p-3 text-center">
            <p className="text-3xl font-bold">{stats.today.cleanings}</p>
            <p className="text-xs text-white/80">Pulizie oggi</p>
          </div>
          <div className="bg-white/20 backdrop-blur rounded-2xl p-3 text-center">
            <p className="text-3xl font-bold">{stats.today.orders}</p>
            <p className="text-xs text-white/80">Consegne oggi</p>
          </div>
          <div className="bg-white/20 backdrop-blur rounded-2xl p-3 text-center">
            <p className="text-xl font-bold">{formatEuro(stats.today.revenue)}</p>
            <p className="text-xs text-white/80">Fatturato</p>
          </div>
        </div>
      </div>

      <div className="sticky top-0 bg-white border-b px-2 py-2 z-10 -mt-4 rounded-t-3xl shadow-sm">
        <div className="flex gap-1">
          {([{ id: "overview", icon: "📈", label: "Panoramica" }, { id: "pulizie", icon: "🧹", label: "Pulizie" }, { id: "consegne", icon: "📦", label: "Consegne" }, { id: "team", icon: "👥", label: "Team" }] as { id: MobileTab; icon: string; label: string }[]).map(tab => (
            <button key={tab.id} onClick={() => setMobileTab(tab.id)} className={`flex-1 py-2.5 rounded-xl text-xs font-semibold flex flex-col items-center gap-1 ${mobileTab === tab.id ? "bg-indigo-50 text-indigo-600" : "text-slate-500"}`}>
              <span className="text-base">{tab.icon}</span>{tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4">
        {mobileTab === "overview" && (
          <div className="space-y-4">
            {(stats.pending.cleanings > 0 || stats.pending.orders > 0) && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
                <span className="text-2xl">⏳</span>
                <div><p className="font-semibold text-amber-800 text-sm">In sospeso</p><p className="text-xs text-amber-600">{stats.pending.cleanings} pulizie • {stats.pending.orders} consegne</p></div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <MiniCard icon="🧹" label="Pulizie" value={curr.cleanings} color="emerald" />
              <MiniCard icon="📦" label="Consegne" value={curr.orders} color="sky" />
              <MiniCard icon="💰" label="Fatturato" value={formatEuro(curr.revenue)} color="amber" />
              <MiniCard icon="🛍️" label="Articoli" value={formatNum(curr.items)} color="violet" />
            </div>
            <div className="bg-white rounded-2xl p-4 border border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-800 text-sm">Andamento</h3>
                <div className="flex gap-3 text-xs">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span>Pulizie</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-500"></span>Consegne</span>
                </div>
              </div>
              <BarChart data={dailyData.slice(-7)} height={120} />
            </div>
            <div className="bg-white rounded-2xl p-4 border border-slate-100">
              <h3 className="font-semibold text-slate-800 text-sm mb-3">Sistema</h3>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div><p className="text-xl font-bold">{stats.totals.props}</p><p className="text-[10px] text-slate-500">Proprietà</p></div>
                <div><p className="text-xl font-bold">{stats.totals.ops}</p><p className="text-[10px] text-slate-500">Operatori</p></div>
                <div><p className="text-xl font-bold">{stats.totals.rids}</p><p className="text-[10px] text-slate-500">Rider</p></div>
                <div><p className="text-xl font-bold">{stats.totals.owns}</p><p className="text-[10px] text-slate-500">Proprietari</p></div>
              </div>
            </div>
          </div>
        )}
        {mobileTab === "pulizie" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <MiniCard icon="✅" label="Completate" value={curr.cleanings} color="emerald" />
              <MiniCard icon="⏳" label="In attesa" value={stats.pending.cleanings} color="amber" />
              <MiniCard icon="🔥" label="Sgrossi mese" value={stats.month.sgrossi} color="rose" />
              <MiniCard icon="💰" label="Fatturato" value={formatEuro(curr.revenue)} color="violet" />
            </div>
            <TopList title="Top Operatori" icon="🏆" data={topOps} color="emerald" />
            <TopList title="Proprietà attive" icon="🏠" data={topProps} color="amber" />
          </div>
        )}
        {mobileTab === "consegne" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <MiniCard icon="✅" label="Consegnate" value={curr.orders} color="sky" />
              <MiniCard icon="🚚" label="In corso" value={stats.pending.orders} color="amber" />
              <MiniCard icon="🚨" label="Urgenti" value={stats.urgPend} color="rose" />
              <MiniCard icon="🛍️" label="Articoli" value={formatNum(curr.items)} color="violet" />
            </div>
            <TopList title="Top Rider" icon="🥇" data={topRids} color="sky" />
          </div>
        )}
        {mobileTab === "team" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-4 border border-slate-100">
              <h3 className="font-semibold text-slate-800 mb-4">Stato Team</h3>
              <div className="flex justify-around">
                <ProgressRing value={topOps.length} max={stats.totals.ops} label="Operatori attivi" color="emerald" />
                <ProgressRing value={topRids.length} max={stats.totals.rids} label="Rider attivi" color="sky" />
              </div>
            </div>
            <TopList title="Classifica Operatori" icon="🧹" data={topOps} color="emerald" />
            <TopList title="Classifica Rider" icon="🛵" data={topRids} color="sky" />
          </div>
        )}
      </div>
    </div>
  );

  // DESKTOP
  return (
    <div className="p-8 space-y-8 max-w-[1800px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">📊 Statistiche Sistema</h1>
          <p className="text-slate-500 mt-1">{today.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
        <div className="flex gap-2 bg-white rounded-xl p-1 shadow-sm border">
          {(["week", "month", "year"] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)} className={`px-5 py-2.5 rounded-lg text-sm font-semibold ${period === p ? "bg-gradient-to-r from-indigo-500 to-blue-600 text-white shadow-lg" : "text-slate-600 hover:bg-slate-50"}`}>
              {p === "week" ? "Settimana" : p === "month" ? "Mese" : "Anno"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-6">
        <div className="col-span-2 bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-500 rounded-3xl p-6 text-white">
          <p className="text-white/70 text-sm font-medium mb-2">📅 OGGI</p>
          <div className="grid grid-cols-3 gap-4">
            <div><p className="text-5xl font-bold">{stats.today.cleanings}</p><p className="text-white/80 text-sm">Pulizie</p></div>
            <div><p className="text-5xl font-bold">{stats.today.orders}</p><p className="text-white/80 text-sm">Consegne</p></div>
            <div><p className="text-3xl font-bold">{formatEuro(stats.today.revenue)}</p><p className="text-white/80 text-sm">Fatturato</p></div>
          </div>
        </div>
        <BigCard icon="🧹" label="Pulizie completate" value={curr.cleanings} sub={`${stats.totals.cleanings} totali`} trend={curr.trend} color="emerald" />
        <BigCard icon="📦" label="Consegne effettuate" value={curr.orders} sub={`${formatNum(curr.items)} articoli`} color="sky" />
        <BigCard icon="💰" label="Fatturato periodo" value={formatEuro(curr.revenue)} sub={`${formatEuro(stats.totals.revenue)} totale`} color="amber" />
      </div>

      {(stats.pending.cleanings > 0 || stats.pending.orders > 0 || stats.urgPend > 0) && (
        <div className="flex gap-4">
          {stats.pending.cleanings > 0 && <div className="flex-1 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-4"><div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center text-2xl">⏳</div><div><p className="font-semibold text-amber-800">{stats.pending.cleanings} pulizie in attesa</p></div></div>}
          {stats.pending.orders > 0 && <div className="flex-1 bg-sky-50 border border-sky-200 rounded-2xl p-4 flex items-center gap-4"><div className="w-12 h-12 bg-sky-100 rounded-xl flex items-center justify-center text-2xl">🚚</div><div><p className="font-semibold text-sky-800">{stats.pending.orders} consegne in corso</p></div></div>}
          {stats.urgPend > 0 && <div className="flex-1 bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-center gap-4"><div className="w-12 h-12 bg-rose-100 rounded-xl flex items-center justify-center text-2xl">🚨</div><div><p className="font-semibold text-rose-800">{stats.urgPend} urgenti</p></div></div>}
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 bg-white rounded-2xl border p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-slate-800">📈 Andamento Attività</h3>
            <div className="flex gap-4 text-sm">
              <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-emerald-500"></span>Pulizie</span>
              <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-sky-500"></span>Consegne</span>
            </div>
          </div>
          <BarChart data={dailyData} height={220} />
        </div>
        <div className="bg-white rounded-2xl border p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">📊 Riepilogo</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center"><span className="text-slate-500">Pulizie totali</span><span className="font-bold text-slate-800">{formatNum(stats.totals.cleanings)}</span></div>
            <div className="flex justify-between items-center"><span className="text-slate-500">Consegne totali</span><span className="font-bold text-slate-800">{formatNum(stats.totals.orders)}</span></div>
            <div className="flex justify-between items-center"><span className="text-slate-500">Articoli consegnati</span><span className="font-bold text-slate-800">{formatNum(stats.totals.items)}</span></div>
            <div className="flex justify-between items-center"><span className="text-slate-500">Sgrossi totali</span><span className="font-bold text-slate-800">{stats.totals.sgrossi}</span></div>
            <div className="flex justify-between items-center pt-4 border-t"><span className="text-slate-500">Fatturato totale</span><span className="font-bold text-emerald-600 text-lg">{formatEuro(stats.totals.revenue)}</span></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-4">
        {[{ icon: "🏠", val: stats.totals.props, label: "Proprietà" }, { icon: "👷", val: stats.totals.ops, label: "Operatori" }, { icon: "🛵", val: stats.totals.rids, label: "Rider" }, { icon: "👤", val: stats.totals.owns, label: "Proprietari" }, { icon: "🔥", val: stats.totals.sgrossi, label: "Sgrossi" }, { icon: "📦", val: stats.totals.orders, label: "Consegne" }].map((s, i) => (
          <div key={i} className="bg-white rounded-2xl border p-5 shadow-sm text-center">
            <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-2xl mx-auto mb-3">{s.icon}</div>
            <p className="text-3xl font-bold text-slate-800">{s.val}</p>
            <p className="text-sm text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        <TopList title="🏆 Top Operatori" icon="🧹" data={topOps} color="emerald" />
        <TopList title="🥇 Top Rider" icon="🛵" data={topRids} color="sky" />
        <TopList title="🏠 Proprietà attive" icon="📍" data={topProps} color="amber" />
      </div>

      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-3xl p-8 text-white">
        <h3 className="text-lg font-semibold text-white/80 mb-6">📊 TOTALE STORICO</h3>
        <div className="grid grid-cols-5 gap-8 text-center">
          <div><p className="text-5xl font-bold">{formatNum(stats.totals.cleanings)}</p><p className="text-white/60 mt-2">Pulizie</p></div>
          <div><p className="text-5xl font-bold">{formatNum(stats.totals.orders)}</p><p className="text-white/60 mt-2">Consegne</p></div>
          <div><p className="text-5xl font-bold">{formatNum(stats.totals.items)}</p><p className="text-white/60 mt-2">Articoli</p></div>
          <div><p className="text-5xl font-bold">{stats.totals.sgrossi}</p><p className="text-white/60 mt-2">Sgrossi</p></div>
          <div><p className="text-4xl font-bold text-emerald-400">{formatEuro(stats.totals.revenue)}</p><p className="text-white/60 mt-2">Fatturato</p></div>
        </div>
      </div>
    </div>
  );
}
