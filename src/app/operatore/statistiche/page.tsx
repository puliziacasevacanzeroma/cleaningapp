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
interface Cleaning {
  id: string;
  operatorId?: string;
  operatorName?: string;
  status: string;
  propertyName?: string;
  propertyAddress?: string;
  propertyCity?: string;
  type?: string;
  guestsCount?: number;
  price?: number;
  scheduledDate?: Timestamp;
  scheduledTime?: string;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  createdAt?: Timestamp;
  duration?: number; // minuti
}

interface DailyStats {
  date: string;
  dateLabel: string;
  dayName: string;
  cleanings: number;
  hours: number;
  earnings: number;
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

const formatDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return `${mins}m`;
};

const formatEuro = (amount: number): string => {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(amount);
};

// ═══════════════════════════════════════════════════════════════════════════
// STAT CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function StatCard({ 
  icon, 
  label, 
  value, 
  subValue,
  color = "emerald",
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
function MiniBarChart({ data, color = "emerald" }: { data: DailyStats[]; color?: string }) {
  const maxValue = Math.max(...data.map(d => d.cleanings), 1);
  
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
                height: `${Math.max((day.cleanings / maxValue) * 60, 4)}px`,
                opacity: day.cleanings > 0 ? 1 : 0.3
              }}
            />
          </div>
          <span className="text-[10px] text-slate-400 font-medium">{day.dayName}</span>
          <span className="text-xs font-bold text-slate-600">{day.cleanings}</span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function OperatoreStatistichePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [cleanings, setCleanings] = useState<Cleaning[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [period, setPeriod] = useState<Period>("week");

  // Auth check
  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  // Carica pulizie dell'operatore
  useEffect(() => {
    if (!user?.id) return;

    const cleaningsRef = collection(db, "cleanings");
    const q = query(
      cleaningsRef,
      where("operatorId", "==", user.id),
      orderBy("scheduledDate", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cleaningsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Cleaning[];
      setCleanings(cleaningsData);
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

    // Filtra pulizie completate
    const completed = cleanings.filter(c => c.status === "COMPLETED");

    // Oggi
    const todayCleanings = completed.filter(c => {
      const date = c.completedAt?.toDate?.() || c.scheduledDate?.toDate?.();
      return date && date >= today;
    });

    // Questa settimana
    const weekCleanings = completed.filter(c => {
      const date = c.completedAt?.toDate?.() || c.scheduledDate?.toDate?.();
      return date && date >= startOfWeek;
    });

    // Questo mese
    const monthCleanings = completed.filter(c => {
      const date = c.completedAt?.toDate?.() || c.scheduledDate?.toDate?.();
      return date && date >= startOfMonth;
    });

    // Quest'anno
    const yearCleanings = completed.filter(c => {
      const date = c.completedAt?.toDate?.() || c.scheduledDate?.toDate?.();
      return date && date >= startOfYear;
    });

    // Calcola totale ore (stima: media 90 min per pulizia se non c'è duration)
    const calcHours = (list: Cleaning[]) => {
      const totalMinutes = list.reduce((sum, c) => {
        if (c.duration) return sum + c.duration;
        // Stima basata su startedAt e completedAt
        if (c.startedAt && c.completedAt) {
          const start = c.startedAt.toDate?.();
          const end = c.completedAt.toDate?.();
          if (start && end) {
            return sum + Math.round((end.getTime() - start.getTime()) / 60000);
          }
        }
        return sum + 90; // Stima default 1.5 ore
      }, 0);
      return Math.round(totalMinutes / 60 * 10) / 10; // Arrotonda a 1 decimale
    };

    // Calcola guadagni
    const calcEarnings = (list: Cleaning[]) => 
      list.reduce((sum, c) => sum + (c.price || 0), 0);

    // Calcola sgrossi
    const calcSgrossi = (list: Cleaning[]) =>
      list.filter(c => c.type === "SGROSSO").length;

    return {
      today: {
        cleanings: todayCleanings.length,
        hours: calcHours(todayCleanings),
        earnings: calcEarnings(todayCleanings),
        sgrossi: calcSgrossi(todayCleanings),
      },
      week: {
        cleanings: weekCleanings.length,
        hours: calcHours(weekCleanings),
        earnings: calcEarnings(weekCleanings),
        sgrossi: calcSgrossi(weekCleanings),
      },
      month: {
        cleanings: monthCleanings.length,
        hours: calcHours(monthCleanings),
        earnings: calcEarnings(monthCleanings),
        sgrossi: calcSgrossi(monthCleanings),
      },
      year: {
        cleanings: yearCleanings.length,
        hours: calcHours(yearCleanings),
        earnings: calcEarnings(yearCleanings),
        sgrossi: calcSgrossi(yearCleanings),
      },
      total: completed.length,
      totalEarnings: calcEarnings(completed),
    };
  }, [cleanings]);

  // Calcola dati giornalieri per il grafico
  const dailyData = useMemo(() => {
    const now = new Date();
    const days: DailyStats[] = [];
    
    const daysCount = period === "week" ? 7 : period === "month" ? 30 : 12;
    const completed = cleanings.filter(c => c.status === "COMPLETED");

    if (period === "year") {
      // Raggruppa per mese
      for (let i = 11; i >= 0; i--) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
        
        const monthCleanings = completed.filter(c => {
          const date = c.completedAt?.toDate?.() || c.scheduledDate?.toDate?.();
          return date && date >= monthStart && date <= monthEnd;
        });

        const totalMinutes = monthCleanings.reduce((sum, c) => sum + (c.duration || 90), 0);

        days.push({
          date: monthStart.toISOString(),
          dateLabel: monthStart.toLocaleDateString("it-IT", { month: "short" }),
          dayName: monthStart.toLocaleDateString("it-IT", { month: "short" }).substring(0, 3),
          cleanings: monthCleanings.length,
          hours: Math.round(totalMinutes / 60),
          earnings: monthCleanings.reduce((sum, c) => sum + (c.price || 0), 0),
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

        const dayCleanings = completed.filter(c => {
          const cleaningDate = c.completedAt?.toDate?.() || c.scheduledDate?.toDate?.();
          return cleaningDate && cleaningDate >= dayStart && cleaningDate <= dayEnd;
        });

        const totalMinutes = dayCleanings.reduce((sum, c) => sum + (c.duration || 90), 0);

        days.push({
          date: dayStart.toISOString(),
          dateLabel: formatDateShort(dayStart),
          dayName: getDayName(dayStart),
          cleanings: dayCleanings.length,
          hours: Math.round(totalMinutes / 60 * 10) / 10,
          earnings: dayCleanings.reduce((sum, c) => sum + (c.price || 0), 0),
        });
      }
    }

    return days;
  }, [cleanings, period]);

  // Media giornaliera
  const avgPerDay = useMemo(() => {
    const activeDays = dailyData.filter(d => d.cleanings > 0).length;
    const total = dailyData.reduce((sum, d) => sum + d.cleanings, 0);
    return activeDays > 0 ? (total / activeDays).toFixed(1) : "0";
  }, [dailyData]);

  // Durata media
  const avgDuration = useMemo(() => {
    const withDuration = cleanings.filter(c => c.status === "COMPLETED" && (c.duration || (c.startedAt && c.completedAt)));
    if (withDuration.length === 0) return 90;
    
    const totalMinutes = withDuration.reduce((sum, c) => {
      if (c.duration) return sum + c.duration;
      if (c.startedAt && c.completedAt) {
        const start = c.startedAt.toDate?.();
        const end = c.completedAt.toDate?.();
        if (start && end) {
          return sum + Math.round((end.getTime() - start.getTime()) / 60000);
        }
      }
      return sum + 90;
    }, 0);
    
    return Math.round(totalMinutes / withDuration.length);
  }, [cleanings]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  const today = new Date();
  const currentStats = period === "week" ? stats.week : period === "month" ? stats.month : stats.year;

  return (
    <div className="p-4 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">📊 Le Mie Statistiche</h1>
          <p className="text-slate-500 mt-1">
            {today.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
      </div>

      {/* Quick Stats Header */}
      <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl p-5 text-white shadow-lg">
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-4xl font-bold">{stats.today.cleanings}</p>
            <p className="text-sm text-white/80">Oggi</p>
          </div>
          <div className="text-center border-x border-white/20">
            <p className="text-4xl font-bold">{stats.week.cleanings}</p>
            <p className="text-sm text-white/80">Settimana</p>
          </div>
          <div className="text-center">
            <p className="text-4xl font-bold">{stats.month.cleanings}</p>
            <p className="text-sm text-white/80">Mese</p>
          </div>
        </div>
      </div>

      {/* Period Selector */}
      <div className="flex gap-2 bg-white rounded-2xl p-2 shadow-sm border border-slate-200">
        {(["week", "month", "year"] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              period === p
                ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg"
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
          <h3 className="font-semibold text-slate-800">📈 Andamento Pulizie</h3>
          <span className="text-sm text-slate-500">Media: {avgPerDay}/giorno</span>
        </div>
        
        {loadingData ? (
          <div className="h-24 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
          </div>
        ) : (
          <MiniBarChart 
            data={period === "year" ? dailyData : dailyData.slice(-7)} 
            color="emerald" 
          />
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon="🧹"
          label="Pulizie"
          value={currentStats.cleanings}
          subValue={`${stats.total} totali`}
          color="emerald"
        />
        <StatCard
          icon="⏱️"
          label="Ore Lavorate"
          value={currentStats.hours}
          subValue={`~${formatDuration(avgDuration)} media`}
          color="sky"
        />
        <StatCard
          icon="💰"
          label="Guadagni"
          value={formatEuro(currentStats.earnings)}
          subValue={`${formatEuro(stats.totalEarnings)} totali`}
          color="amber"
        />
        <StatCard
          icon="🔥"
          label="Sgrossi"
          value={currentStats.sgrossi}
          subValue="pulizie profonde"
          color="rose"
        />
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">🕐 Ultime Pulizie Completate</h3>
        </div>
        
        {loadingData ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mx-auto"></div>
          </div>
        ) : cleanings.filter(c => c.status === "COMPLETED").length === 0 ? (
          <div className="p-8 text-center">
            <span className="text-4xl">🧹</span>
            <p className="text-slate-500 mt-2">Nessuna pulizia completata ancora</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {cleanings
              .filter(c => c.status === "COMPLETED")
              .slice(0, 5)
              .map((cleaning) => {
                const completedDate = cleaning.completedAt?.toDate?.() || cleaning.scheduledDate?.toDate?.();
                return (
                  <div key={cleaning.id} className="px-4 py-3 flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                      cleaning.type === "SGROSSO" 
                        ? "bg-gradient-to-br from-rose-100 to-red-100" 
                        : "bg-gradient-to-br from-emerald-100 to-teal-100"
                    }`}>
                      {cleaning.type === "SGROSSO" ? "🔥" : "🧹"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 truncate">{cleaning.propertyName || "Proprietà"}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {cleaning.propertyAddress}
                        {cleaning.guestsCount && ` • ${cleaning.guestsCount} ospiti`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-emerald-600">
                        {cleaning.price ? formatEuro(cleaning.price) : "-"}
                      </p>
                      <p className="text-xs text-slate-400">
                        {completedDate?.toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
                      </p>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Achievement Badges */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {stats.total >= 50 && (
          <div className="bg-gradient-to-r from-amber-400 to-orange-500 rounded-2xl p-4 text-white shadow-lg">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center text-2xl">
                🏆
              </div>
              <div>
                <p className="text-lg font-bold">Operatore Esperto!</p>
                <p className="text-white/80 text-sm">Oltre {stats.total} pulizie completate</p>
              </div>
            </div>
          </div>
        )}
        
        {stats.month.cleanings >= 20 && (
          <div className="bg-gradient-to-r from-violet-500 to-purple-600 rounded-2xl p-4 text-white shadow-lg">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center text-2xl">
                ⚡
              </div>
              <div>
                <p className="text-lg font-bold">Mese da Record!</p>
                <p className="text-white/80 text-sm">{stats.month.cleanings} pulizie questo mese</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
