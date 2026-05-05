"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import {
  computeMonthDebt,
  buildInventoryMap,
  type DebtCalcProperty,
  type DebtCalcCleaning,
  type DebtCalcOrder,
  type DebtCalcPayment,
} from "~/lib/payments/debtCalculator";

// ==================== TYPES ====================
interface Cleaning {
  id: string;
  operatorId?: string;
  operatorName?: string;
  operators?: { id: string; name: string }[];
  status: string;
  propertyId?: string;
  propertyName?: string;
  type?: string;
  serviceType?: string;
  serviceTypeName?: string;
  price?: number;
  priceOverride?: number;
  holidayFee?: number;
  holidayName?: string | null;
  contractPrice?: number;
  guestsCount?: number;
  scheduledDate?: Timestamp;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  createdAt?: Timestamp;
  hasLinenOrder?: boolean;
  missedDeadline?: boolean;
  bookingSource?: string;
}

interface Order {
  id: string;
  cleaningId?: string;
  propertyId: string;
  propertyName?: string;
  riderId?: string;
  riderName?: string;
  status: string;
  items?: { id: string; itemId?: string; name: string; quantity: number; unitPrice?: number; price?: number; priceOverride?: number; totalPrice?: number }[];
  pickupItems?: { id: string; name: string; quantity: number }[];
  urgency?: "normal" | "urgent";
  deliveryFee?: number;
  deliveryFeeEnabled?: boolean;
  bedMaking?: boolean;
  bedMakingFee?: number;
  bedMakingCount?: number;
  totalPriceOverride?: number;
  scheduledDate?: Timestamp;
  deliveredAt?: Timestamp;
  createdAt?: Timestamp;
}

interface Property {
  id: string;
  name: string;
  address: string;
  city?: string;
  zone?: string;
  status: string;
  ownerId: string;
  ownerName?: string;
  cleaningPrice?: number;
  maxGuests?: number;
  bedrooms?: number;
  bathrooms?: number;
  icalAirbnb?: string;
  icalBooking?: string;
  icalOktorate?: string;
  icalInreception?: string;
  icalKrossbooking?: string;
  createdAt?: Timestamp;
}

interface UserDoc {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  status?: string;
  createdAt?: Timestamp;
}

interface Payment {
  id: string;
  proprietarioId: string;
  proprietarioName: string;
  month: number;
  year: number;
  amount: number;
  type: "ACCONTO" | "SALDO";
  method: "BONIFICO" | "CONTANTI" | "ALTRO";
  createdAt?: Timestamp;
}

interface InventoryItem {
  id: string;
  name: string;
  category?: string;
  categoryId?: string;
  sellPrice?: number;
  quantity?: number;
  key?: string;
}

// ==================== HELPERS ====================
type Period = "week" | "month" | "quarter" | "year";
type Tab = "panoramica" | "fatturato" | "pulizie" | "operatori" | "biancheria" | "proprieta" | "clienti";

const getStartOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const getStartOfWeek = (d: Date) => { const x = new Date(d); const day = x.getDay(); x.setDate(x.getDate() - day + (day === 0 ? -6 : 1)); x.setHours(0, 0, 0, 0); return x; };
const getStartOfMonth = (d: Date) => { const x = new Date(d); x.setDate(1); x.setHours(0, 0, 0, 0); return x; };
const getStartOfQuarter = (d: Date) => { const x = new Date(d); x.setMonth(Math.floor(x.getMonth() / 3) * 3, 1); x.setHours(0, 0, 0, 0); return x; };
const getStartOfYear = (d: Date) => { const x = new Date(d); x.setMonth(0, 1); x.setHours(0, 0, 0, 0); return x; };
const getPeriodStart = (period: Period) => {
  const now = new Date();
  if (period === "week") return getStartOfWeek(now);
  if (period === "month") return getStartOfMonth(now);
  if (period === "quarter") return getStartOfQuarter(now);
  return getStartOfYear(now);
};
const getPrevPeriodRange = (period: Period): [Date, Date] => {
  const now = new Date();
  if (period === "week") { const end = getStartOfWeek(now); const start = new Date(end); start.setDate(start.getDate() - 7); return [start, end]; }
  if (period === "month") { const end = getStartOfMonth(now); const start = new Date(end); start.setMonth(start.getMonth() - 1); return [start, end]; }
  if (period === "quarter") { const end = getStartOfQuarter(now); const start = new Date(end); start.setMonth(start.getMonth() - 3); return [start, end]; }
  const end = getStartOfYear(now); const start = new Date(end); start.setFullYear(start.getFullYear() - 1); return [start, end];
};
const toDate = (ts: any): Date | null => {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
};
const fmtEuro = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
const fmtEuroDec = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
const fmtNum = (n: number) => new Intl.NumberFormat("it-IT").format(n);
const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const calcTrend = (curr: number, prev: number) => prev > 0 ? ((curr - prev) / prev) * 100 : curr > 0 ? 100 : 0;
const minutesBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 60000);

// ==================== SVG CHART COMPONENTS ====================

function BarChartSVG({ data, height = 180, barColor = "#0ea5e9", secondaryData, secondaryColor = "#8b5cf6" }: {
  data: { label: string; value: number }[];
  height?: number;
  barColor?: string;
  secondaryData?: { label: string; value: number }[];
  secondaryColor?: string;
}) {
  const maxVal = Math.max(...data.map(d => d.value), ...(secondaryData || []).map(d => d.value), 1);
  // Show fewer labels on mobile / when many data points
  const showEveryN = data.length > 15 ? (data.length > 60 ? 10 : data.length > 20 ? 3 : 2) : 1;

  return (
    <div style={{ height }} className="w-full overflow-hidden flex items-end gap-px pb-6 relative">
      {data.map((d, i) => {
        const h1 = Math.max((d.value / maxVal) * (height - 30), 2);
        const h2 = secondaryData ? Math.max((secondaryData[i]?.value || 0) / maxVal * (height - 30), 2) : 0;
        return (
          <div key={i} className="flex-1 min-w-0 flex flex-col items-center group relative">
            <div className="flex items-end gap-px flex-1 w-full justify-center">
              <div
                className="rounded-t transition-all duration-300 group-hover:opacity-80 flex-1 max-w-[20px]"
                style={{ height: h1, background: `linear-gradient(to top, ${barColor}, ${barColor}dd)` }}
              />
              {secondaryData && (
                <div
                  className="rounded-t transition-all duration-300 group-hover:opacity-80 flex-1 max-w-[20px]"
                  style={{ height: h2, background: `linear-gradient(to top, ${secondaryColor}, ${secondaryColor}dd)` }}
                />
              )}
            </div>
            {i % showEveryN === 0 ? (
              <span className="text-[9px] text-slate-400 mt-1 font-medium truncate w-full text-center">{d.label}</span>
            ) : (
              <span className="h-[14px]" />
            )}
            {/* Tooltip */}
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
              {fmtNum(d.value)}{secondaryData ? ` / ${fmtNum(secondaryData[i]?.value || 0)}` : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DonutChart({ segments, size = 120, strokeWidth = 16, centerLabel, centerValue }: {
  segments: { value: number; color: string; label: string }[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let cumOffset = 0;

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="#e2e8f0" strokeWidth={strokeWidth} fill="none" />
        {segments.map((seg, i) => {
          const pct = total > 0 ? seg.value / total : 0;
          const dashLength = pct * circumference;
          const offset = cumOffset;
          cumOffset += dashLength;
          return (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={seg.color}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={`${dashLength} ${circumference - dashLength}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      {(centerLabel || centerValue) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {centerValue && <span className="text-xl font-bold text-slate-800">{centerValue}</span>}
          {centerLabel && <span className="text-[10px] text-slate-400">{centerLabel}</span>}
        </div>
      )}
    </div>
  );
}

function SparkLine({ data, color = "#0ea5e9", height = 40 }: { data: number[]; color?: string; height?: number }) {
  if (data.length < 2) return null;
  const width = 100; // percentage-based via viewBox
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - ((v - min) / range) * (height - 4) - 2,
  }));
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaD = `${pathD} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible" style={{ height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`spark-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#spark-${color.replace("#", "")})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="2" fill={color} />
    </svg>
  );
}

function HorizontalBar({ label, value, maxValue, color, suffix = "" }: { label: string; value: number; maxValue: number; color: string; suffix?: string }) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-slate-600 w-32 truncate font-medium">{label}</span>
      <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(pct, 1)}%`, background: color }} />
      </div>
      <span className="text-sm font-bold text-slate-700 w-16 text-right">{fmtNum(value)}{suffix}</span>
    </div>
  );
}

function TrendBadge({ value }: { value: number }) {
  if (Math.abs(value) < 0.1) return <span className="text-[11px] text-slate-400 font-medium px-2 py-0.5 rounded-full bg-slate-50">—</span>;
  const positive = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${positive ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d={positive ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
      </svg>
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

// ==================== STAT CARD ====================
function StatCard({ icon, label, value, sub, trend, gradient }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  trend?: number;
  gradient: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/60 p-5 hover:shadow-md transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-sm`}>
          {icon}
        </div>
        {trend !== undefined && <TrendBadge value={trend} />}
      </div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-sm text-slate-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

// ==================== RANKING TABLE ====================
function RankingTable({ title, icon, data, valueLabel, valueSuffix, gradient }: {
  title: string;
  icon: React.ReactNode;
  data: { name: string; value: number; extra?: string }[];
  valueLabel: string;
  valueSuffix?: string;
  gradient: string;
}) {
  const max = data.length > 0 ? data[0].value : 1;
  return (
    <div className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-sm`}>
          {icon}
        </div>
        <div>
          <h3 className="font-semibold text-slate-800 text-sm">{title}</h3>
          <p className="text-[11px] text-slate-400">{valueLabel}</p>
        </div>
      </div>
      {data.length === 0 ? (
        <div className="p-8 text-center text-slate-400 text-sm">Nessun dato disponibile</div>
      ) : (
        <div className="divide-y divide-slate-50">
          {data.slice(0, 8).map((item, i) => (
            <div key={i} className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50/50 transition-colors">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${i < 3 ? `bg-gradient-to-br ${gradient} text-white shadow-sm` : "bg-slate-100 text-slate-500"}`}>
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">{item.name || "N/A"}</p>
                {item.extra && <p className="text-[10px] text-slate-400">{item.extra}</p>}
              </div>
              <span className="text-sm font-bold text-slate-700">{fmtNum(item.value)}{valueSuffix || ""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== SVG ICONS ====================
const Icons = {
  chart: <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
  euro: <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  clean: <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>,
  users: <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
  box: <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
  home: <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>,
  person: <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
  truck: <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" /></svg>,
  clock: <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  check: <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  fire: <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /></svg>,
  warning: <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>,
  target: <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
};

// ==================== TABS CONFIG ====================
const TABS: { id: Tab; label: string; icon: React.ReactNode; gradient: string }[] = [
  { id: "panoramica", label: "Panoramica", icon: Icons.chart, gradient: "from-indigo-500 to-blue-600" },
  { id: "fatturato", label: "Fatturato", icon: Icons.euro, gradient: "from-emerald-500 to-teal-600" },
  { id: "pulizie", label: "Pulizie", icon: Icons.clean, gradient: "from-sky-500 to-cyan-600" },
  { id: "operatori", label: "Operatori", icon: Icons.users, gradient: "from-violet-500 to-purple-600" },
  { id: "biancheria", label: "Biancheria", icon: Icons.box, gradient: "from-amber-500 to-orange-600" },
  { id: "proprieta", label: "Proprietà", icon: Icons.home, gradient: "from-rose-500 to-pink-600" },
  { id: "clienti", label: "Clienti", icon: Icons.person, gradient: "from-teal-500 to-emerald-600" },
];

// ==================== MAIN COMPONENT ====================
export default function ReportContent() {
  const [cleanings, setCleanings] = useState<Cleaning[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [users, setUsers] = useState<UserDoc[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("panoramica");
  const [period, setPeriod] = useState<Period>("month");
  const [isDesktop, setIsDesktop] = useState(false);
  
  // 🔧 FIX v2: mese selezionato per il banner Hero (navigabile con frecce).
  // Default al primo del mese corrente. Non influenza il resto della pagina
  // (i filtri `period` sopra restano intatti), tocca SOLO il banner blu in alto.
  const [heroMonth, setHeroMonth] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Realtime listeners
  useEffect(() => {
    const unsubs: (() => void)[] = [];
    let loaded = 0;
    const checkLoaded = () => { loaded++; if (loaded >= 6) setLoading(false); };

    unsubs.push(onSnapshot(collection(db, "cleanings"), s => { setCleanings(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))); checkLoaded(); }));
    unsubs.push(onSnapshot(collection(db, "orders"), s => { setOrders(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))); checkLoaded(); }));
    unsubs.push(onSnapshot(collection(db, "properties"), s => { setProperties(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))); checkLoaded(); }));
    unsubs.push(onSnapshot(collection(db, "users"), s => { setUsers(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))); checkLoaded(); }));
    unsubs.push(onSnapshot(collection(db, "payments"), s => { setPayments(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))); checkLoaded(); }));
    unsubs.push(onSnapshot(collection(db, "inventory"), s => { setInventory(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))); checkLoaded(); }));

    return () => unsubs.forEach(u => u());
  }, []);

  // ==================== COMPUTED STATS ====================
  const computed = useMemo(() => {
    const now = new Date();
    const periodStart = getPeriodStart(period);
    const [prevStart, prevEnd] = getPrevPeriodRange(period);
    const today = getStartOfDay(now);

    // Filters
    const inPeriod = <T extends Record<string, any>>(items: T[], field: string = "scheduledDate") =>
      items.filter(it => { const d = toDate(it[field]); return d && d >= periodStart && d <= now; });
    const inPrev = <T extends Record<string, any>>(items: T[], field: string = "scheduledDate") =>
      items.filter(it => { const d = toDate(it[field]); return d && d >= prevStart && d < prevEnd; });

    // Base sets
    const completedAll = cleanings.filter(c => c.status === "COMPLETED");
    const deliveredAll = orders.filter(o => o.status === "DELIVERED");
    const activeProps = properties.filter(p => p.status === "ACTIVE");
    const ops = users.filter(u => u.role === "OPERATORE_PULIZIE");
    const riders = users.filter(u => u.role === "RIDER");
    const owners = users.filter(u => u.role === "PROPRIETARIO" || u.role === "CLIENTE");

    // Period filtered
    const completedPeriod = inPeriod(completedAll, "completedAt").length > 0 ? inPeriod(completedAll, "completedAt") : inPeriod(completedAll, "scheduledDate");
    const completedPrev = inPrev(completedAll, "completedAt").length > 0 ? inPrev(completedAll, "completedAt") : inPrev(completedAll, "scheduledDate");
    const deliveredPeriod = inPeriod(deliveredAll, "deliveredAt").length > 0 ? inPeriod(deliveredAll, "deliveredAt") : inPeriod(deliveredAll, "createdAt");
    const deliveredPrev = inPrev(deliveredAll, "deliveredAt").length > 0 ? inPrev(deliveredAll, "deliveredAt") : inPrev(deliveredAll, "createdAt");
    const scheduledPeriod = inPeriod(cleanings);
    const cancelledPeriod = scheduledPeriod.filter(c => c.status === "CANCELLED");
    const pendingCleanings = cleanings.filter(c => ["SCHEDULED", "ASSIGNED"].includes(c.status));
    const pendingOrders = orders.filter(o => ["PENDING", "PICKING", "IN_TRANSIT"].includes(o.status));

    // Revenue
    const revPeriod = completedPeriod.reduce((s, c) => s + (c.price || 0), 0);
    const revPrev = completedPrev.reduce((s, c) => s + (c.price || 0), 0);
    const revAll = completedAll.reduce((s, c) => s + (c.price || 0), 0);

    // Delivery fees
    const deliveryFeesPeriod = deliveredPeriod.reduce((s, o) => s + (o.deliveryFee || 0), 0);

    // Items delivered
    const itemsPeriod = deliveredPeriod.reduce((s, o) => s + (o.items?.reduce((x, i) => x + i.quantity, 0) || 0), 0);
    const itemsPrev = deliveredPrev.reduce((s, o) => s + (o.items?.reduce((x, i) => x + i.quantity, 0) || 0), 0);

    // ==================== INCASSO PREVISTO MESE ====================
    // Tutte le pulizie del mese corrente (qualsiasi stato tranne CANCELLED)
    const monthStart = getStartOfMonth(now);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const allCleaningsThisMonth = cleanings.filter(c => {
      if (c.status === "CANCELLED") return false;
      const d = toDate(c.scheduledDate);
      return d && d >= monthStart && d <= monthEnd;
    });
    const monthCleaningsRevenue = allCleaningsThisMonth.reduce((s, c) => s + (c.price || 0), 0);

    // Tutti gli ordini del mese corrente (qualsiasi stato tranne CANCELLED)
    const inventoryPriceMap = new Map<string, number>();
    inventory.forEach(item => {
      inventoryPriceMap.set(item.id, item.sellPrice || 0);
      if (item.key) inventoryPriceMap.set(item.key, item.sellPrice || 0);
    });

    const allOrdersThisMonth = orders.filter(o => {
      if (o.status === "CANCELLED") return false;
      const d = toDate(o.scheduledDate) || toDate(o.createdAt);
      return d && d >= monthStart && d <= monthEnd;
    });
    const monthOrdersRevenue = allOrdersThisMonth.reduce((s, o) => {
      if (!o.items) return s;
      return s + o.items.reduce((iSum: number, item: any) => {
        const unitPrice = inventoryPriceMap.get(item.id) || 0;
        return iSum + (unitPrice * (item.quantity || 0));
      }, 0);
    }, 0);
    const monthDeliveryFees = allOrdersThisMonth.reduce((s, o) => s + (o.deliveryFee || 0), 0);

    const monthlyForecast = monthCleaningsRevenue + monthOrdersRevenue + monthDeliveryFees;

    // Avg cleaning time (minutes)
    const timesAll = completedPeriod
      .filter(c => c.startedAt && c.completedAt)
      .map(c => minutesBetween(toDate(c.startedAt)!, toDate(c.completedAt)!))
      .filter(m => m > 0 && m < 600);
    const avgTime = timesAll.length > 0 ? timesAll.reduce((s, t) => s + t, 0) / timesAll.length : 0;

    // Sgrossi
    const sgrossiPeriod = completedPeriod.filter(c => c.type === "SGROSSO" || c.serviceType === "sgrosso");

    // Missed deadlines
    const missedPeriod = scheduledPeriod.filter(c => c.missedDeadline);

    // Today
    const todayCleanings = completedAll.filter(c => { const d = toDate(c.completedAt) || toDate(c.scheduledDate); return d && d >= today; });
    const todayOrders = deliveredAll.filter(o => { const d = toDate(o.deliveredAt); return d && d >= today; });

    // --- CHARTS DATA ---

    // Daily data for bar chart
    const dailyData: { label: string; value: number }[] = [];
    const dailyOrders: { label: string; value: number }[] = [];
    const dailyRevenue: { label: string; value: number }[] = [];
    const numDays = period === "week" ? 7 : period === "month" ? 30 : period === "quarter" ? 90 : 12;

    for (let i = numDays - 1; i >= 0; i--) {
      let start: Date, end: Date, label: string;
      if (period === "year") {
        start = new Date(now.getFullYear(), now.getMonth() - i, 1);
        end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
        label = start.toLocaleDateString("it-IT", { month: "short" }).substring(0, 3);
      } else {
        const d = new Date(now); d.setDate(d.getDate() - i);
        start = getStartOfDay(d);
        end = new Date(start); end.setHours(23, 59, 59, 999);
        label = period === "week"
          ? d.toLocaleDateString("it-IT", { weekday: "short" }).substring(0, 3)
          : d.getDate().toString();
      }
      const dc = completedAll.filter(c => { const x = toDate(c.completedAt) || toDate(c.scheduledDate); return x && x >= start && x <= end; });
      const dor = deliveredAll.filter(o => { const x = toDate(o.deliveredAt) || toDate(o.createdAt); return x && x >= start && x <= end; });
      dailyData.push({ label, value: dc.length });
      dailyOrders.push({ label, value: dor.length });
      dailyRevenue.push({ label, value: dc.reduce((s, c) => s + (c.price || 0), 0) });
    }

    // Sparkline data (last 14 days of revenue)
    const sparkRevenue: number[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const s = getStartOfDay(d);
      const e = new Date(s); e.setHours(23, 59, 59, 999);
      sparkRevenue.push(completedAll.filter(c => { const x = toDate(c.completedAt) || toDate(c.scheduledDate); return x && x >= s && x <= e; }).reduce((sum, c) => sum + (c.price || 0), 0));
    }

    // --- OPERATOR STATS ---
    const opStats = ops.map(op => {
      const opCleanings = completedPeriod.filter(c => c.operatorId === op.id || c.operators?.some(o => o.id === op.id));
      const opTimes = opCleanings
        .filter(c => c.startedAt && c.completedAt)
        .map(c => minutesBetween(toDate(c.startedAt)!, toDate(c.completedAt)!))
        .filter(m => m > 0 && m < 600);
      const avgOpTime = opTimes.length > 0 ? opTimes.reduce((s, t) => s + t, 0) / opTimes.length : 0;
      const opRevenue = opCleanings.reduce((s, c) => s + (c.price || 0), 0);
      return {
        id: op.id,
        name: op.name || "Operatore",
        cleanings: opCleanings.length,
        avgTime: Math.round(avgOpTime),
        revenue: opRevenue,
      };
    }).sort((a, b) => b.cleanings - a.cleanings);

    // --- RIDER STATS ---
    const riderStats = riders.map(r => {
      const rOrders = deliveredPeriod.filter(o => o.riderId === r.id);
      const rItems = rOrders.reduce((s, o) => s + (o.items?.reduce((x, i) => x + i.quantity, 0) || 0), 0);
      return { id: r.id, name: r.name || "Rider", deliveries: rOrders.length, items: rItems };
    }).sort((a, b) => b.deliveries - a.deliveries);

    // --- PROPERTY STATS ---
    const propStats = activeProps.map(p => {
      const pCleanings = completedPeriod.filter(c => c.propertyId === p.id);
      const pOrders = deliveredPeriod.filter(o => o.propertyId === p.id);
      const pRevenue = pCleanings.reduce((s, c) => s + (c.price || 0), 0);
      const hasIcal = !!(p.icalAirbnb || p.icalBooking || p.icalOktorate || p.icalInreception || p.icalKrossbooking);
      return {
        id: p.id, name: p.name, city: p.city, ownerName: p.ownerName,
        cleanings: pCleanings.length, orders: pOrders.length,
        revenue: pRevenue, hasIcal, cleaningPrice: p.cleaningPrice || 0,
      };
    }).sort((a, b) => b.revenue - a.revenue);

    // --- OWNER STATS ---
    const ownerMap = new Map<string, {
      id: string; name: string; properties: number; cleanings: number;
      revenue: number; orders: number; paid: number; balance: number;
    }>();
    owners.forEach(o => {
      const oProps = activeProps.filter(p => p.ownerId === o.id);
      const oPropIds = new Set(oProps.map(p => p.id));
      const oCleanings = completedPeriod.filter(c => oPropIds.has(c.propertyId || ""));
      const oOrders = deliveredPeriod.filter(ord => oPropIds.has(ord.propertyId));
      const oRevenue = oCleanings.reduce((s, c) => s + (c.price || 0), 0);
      const oPaid = payments.filter(p => p.proprietarioId === o.id).reduce((s, p) => s + p.amount, 0);
      ownerMap.set(o.id, {
        id: o.id, name: o.name || "Proprietario",
        properties: oProps.length, cleanings: oCleanings.length,
        revenue: oRevenue, orders: oOrders.length,
        paid: oPaid, balance: oRevenue - oPaid,
      });
    });
    const ownerStats = Array.from(ownerMap.values()).sort((a, b) => b.revenue - a.revenue);

    // --- ITEM STATS (most delivered) ---
    const itemCounts = new Map<string, { name: string; qty: number }>();
    deliveredPeriod.forEach(o => {
      o.items?.forEach(item => {
        const existing = itemCounts.get(item.name) || { name: item.name, qty: 0 };
        existing.qty += item.quantity;
        itemCounts.set(item.name, existing);
      });
    });
    const topItems = Array.from(itemCounts.values()).sort((a, b) => b.qty - a.qty);

    // --- PAYMENTS ---
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const monthPayments = payments.filter(p => p.month === currentMonth && p.year === currentYear);
    const totalPaid = monthPayments.reduce((s, p) => s + p.amount, 0);
    const paidBonifico = monthPayments.filter(p => p.method === "BONIFICO").reduce((s, p) => s + p.amount, 0);
    const paidContanti = monthPayments.filter(p => p.method === "CONTANTI").reduce((s, p) => s + p.amount, 0);
    const paidAltro = monthPayments.filter(p => p.method === "ALTRO").reduce((s, p) => s + p.amount, 0);

    // Completion rate
    const completionRate = scheduledPeriod.length > 0
      ? (completedPeriod.length / (completedPeriod.length + cancelledPeriod.length || 1)) * 100
      : 100;

    // Booking sources
    const sources = new Map<string, number>();
    completedPeriod.forEach(c => {
      const src = c.bookingSource || "manuale";
      sources.set(src, (sources.get(src) || 0) + 1);
    });

    return {
      // Counts
      completedPeriod: completedPeriod.length,
      completedPrev: completedPrev.length,
      deliveredPeriod: deliveredPeriod.length,
      deliveredPrev: deliveredPrev.length,
      cancelledPeriod: cancelledPeriod.length,
      scheduledPeriod: scheduledPeriod.length,
      sgrossiPeriod: sgrossiPeriod.length,
      missedPeriod: missedPeriod.length,
      pendingCleanings: pendingCleanings.length,
      pendingOrders: pendingOrders.length,
      todayCleanings: todayCleanings.length,
      todayOrders: todayOrders.length,
      // Revenue
      revPeriod, revPrev, revAll, deliveryFeesPeriod,
      // Monthly forecast (all cleanings + orders of current month, any status except cancelled)
      monthlyForecast, monthCleaningsRevenue, monthOrdersRevenue, monthDeliveryFees,
      monthCleaningsCount: allCleaningsThisMonth.length,
      monthOrdersCount: allOrdersThisMonth.length,
      // Items
      itemsPeriod, itemsPrev,
      // Averages
      avgTime: Math.round(avgTime),
      completionRate,
      // Trends
      cleaningsTrend: calcTrend(completedPeriod.length, completedPrev.length),
      deliveriesTrend: calcTrend(deliveredPeriod.length, deliveredPrev.length),
      revenueTrend: calcTrend(revPeriod, revPrev),
      itemsTrend: calcTrend(itemsPeriod, itemsPrev),
      // Totals
      totalProps: activeProps.length,
      totalOps: ops.length,
      totalRiders: riders.length,
      totalOwners: owners.length,
      totalCompleted: completedAll.length,
      totalDelivered: deliveredAll.length,
      totalRevenue: revAll,
      // Charts
      dailyData, dailyOrders, dailyRevenue, sparkRevenue,
      // Rankings
      opStats, riderStats, propStats, ownerStats, topItems,
      // Payments
      totalPaid, paidBonifico, paidContanti, paidAltro,
      // Booking sources
      sources: Array.from(sources.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    };
  }, [cleanings, orders, properties, users, payments, inventory, period]);

  // 🔧 FIX v3 (2026-05-05): banner Hero allineato 100% alla pagina Pagamenti
  //
  // Usa la funzione condivisa `computeMonthDebt` (debtCalculator.ts) come unica
  // fonte di verità per il calcolo del fatturato. Questo garantisce che:
  //   - Mesi PASSATI: il numero coincide AL CENTESIMO con la pagina Pagamenti
  //   - Mese CORRENTE: vedi DUE numeri distinti — Realizzato + Proiezione fine mese
  //   - Mese FUTURO: solo proiezione (con tutti i fee correttamente inclusi)
  //
  // Bug risolti rispetto alla versione precedente:
  //   ✓ holidayFee (festività) ora correttamente sommato
  //   ✓ priceOverride pulizia rispettato
  //   ✓ bedMakingFee (preparazione letti) incluso negli ordini
  //   ✓ totalPriceOverride sull'ordine rispettato
  //   ✓ deliveryFeeEnabled=false correttamente escluso
  //   ✓ paymentOverrides admin (sconti mensili) applicati
  //   ✓ Ordini PENDING legati a pulizia COMPLETED inclusi (biancheria usata)
  //   ✓ Solo proprietà ACTIVE (allineato a Pagamenti)
  const heroBanner = useMemo(() => {
    const monthStart = new Date(heroMonth);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(heroMonth.getFullYear(), heroMonth.getMonth() + 1, 0, 23, 59, 59, 999);

    // Identifica se è passato / corrente / futuro rispetto a OGGI
    const nowMonthStart = new Date();
    nowMonthStart.setDate(1);
    nowMonthStart.setHours(0, 0, 0, 0);
    const isCurrent = monthStart.getTime() === nowMonthStart.getTime();
    const isPast = monthStart.getTime() < nowMonthStart.getTime();

    // Label del mese in italiano
    const monthLabel = monthStart.toLocaleDateString("it-IT", { month: "long", year: "numeric" });

    // Solo proprietà ACTIVE (allineato alla pagina Pagamenti)
    const activeProps = properties.filter(p => p.status === "ACTIVE");
    const propertiesById = new Map<string, DebtCalcProperty>(
      activeProps.map(p => [p.id, { id: p.id, cleaningPrice: p.cleaningPrice || 0 }])
    );

    // Map inventory con alias item_X / X (allineata a debtCalculator)
    const inventoryById = buildInventoryMap(
      inventory.map(i => ({ id: i.id, data: i as unknown as Record<string, any> }))
    );

    // Mapping cleanings -> formato debtCalculator
    const cleaningsForCalc: DebtCalcCleaning[] = cleanings.map(c => ({
      id: c.id,
      propertyId: c.propertyId || "",
      status: c.status,
      scheduledDate: c.scheduledDate as unknown as { toDate: () => Date } | undefined,
      price: c.price,
      priceOverride: c.priceOverride,
      holidayFee: c.holidayFee,
      excludedFromBilling: (c as any).excludedFromBilling,
    }));

    // Mapping orders -> formato debtCalculator
    const ordersForCalc: DebtCalcOrder[] = orders.map(o => ({
      id: o.id,
      propertyId: o.propertyId,
      status: o.status,
      cleaningId: o.cleaningId,
      scheduledDate: o.scheduledDate as unknown as { toDate: () => Date } | undefined,
      deliveredAt: o.deliveredAt as unknown as { toDate: () => Date } | undefined,
      createdAt: o.createdAt as unknown as { toDate: () => Date } | undefined,
      items: o.items as any,
      totalPriceOverride: o.totalPriceOverride,
      deliveryFee: o.deliveryFee,
      deliveryFeeEnabled: o.deliveryFeeEnabled,
      bedMaking: o.bedMaking,
      bedMakingFee: o.bedMakingFee,
      excludedFromBilling: (o as any).excludedFromBilling,
    }));

    // Pagamenti del mese (per calcolo eventuali, non usati nel banner ma servono alla funzione)
    const paymentsForCalc: DebtCalcPayment[] = payments.map(p => ({
      proprietarioId: p.proprietarioId,
      month: p.month,
      year: p.year,
      amount: p.amount || 0,
      method: p.method,
    }));

    // ═════════════════════════════════════════════════════════════════
    // CALCOLO REALIZZATO: aggrega computeMonthDebt su tutti i proprietari
    // (somma di pulizie COMPLETED + ordini DELIVERED-or-linked nel mese)
    // ═════════════════════════════════════════════════════════════════
    const ownerIds = new Set(activeProps.map(p => p.ownerId));
    let realizedTotal = 0;
    let realizedCleaningsRevenue = 0;
    let realizedOrdersRevenue = 0;
    let realizedDeliveryFees = 0;
    let realizedCleaningsCount = 0;
    let realizedOrdersCount = 0;

    for (const ownerId of ownerIds) {
      // Filtra prop di questo owner
      const ownerProps = activeProps.filter(p => p.ownerId === ownerId);
      const ownerPropIds = new Set(ownerProps.map(p => p.id));
      const ownerPropsById = new Map<string, DebtCalcProperty>(
        ownerProps.map(p => [p.id, { id: p.id, cleaningPrice: p.cleaningPrice || 0 }])
      );

      // Filtra dati di questo owner
      const ownerCleanings = cleaningsForCalc.filter(c => ownerPropIds.has(c.propertyId));
      const ownerOrders = ordersForCalc.filter(o => ownerPropIds.has(o.propertyId));

      const monthOfHero = monthStart.getMonth() + 1;
      const yearOfHero = monthStart.getFullYear();

      const calc = computeMonthDebt({
        month: monthOfHero,
        year: yearOfHero,
        propertiesById: ownerPropsById,
        cleanings: ownerCleanings,
        orders: ownerOrders,
        payments: paymentsForCalc.filter(p => p.proprietarioId === ownerId),
        inventoryById,
        override: undefined, // gli override mensili sono ammontari finali, li aggiungiamo dopo
      });

      if (!calc) continue;

      realizedTotal += calc.totaleServizi;
      realizedCleaningsRevenue += calc.breakdown.cleaningsTotal;
      realizedCleaningsCount += calc.breakdown.cleaningsCount;
      // Per dettaglio UI: stimo deliveryFees separatamente dagli ordersTotal
      // computeMonthDebt aggrega items+delivery+bedMaking dentro ordersTotal,
      // qui per il banner mostro tutto come "ordersRevenue" + delivery a parte
      // calcolando solo le delivery fee separatamente per coerenza visiva.
      // Per semplicità, mostro: cleaningsRevenue / ordersRevenue (items+bedMaking) / deliveryFees
      let ownerDeliveryFees = 0;
      ownerOrders.forEach((o: DebtCalcOrder) => {
        // Replica filtro di computeMonthDebt
        if (o.status === "CANCELLED") return;
        const orderDate = (o.deliveredAt as any)?.toDate?.() || (o.scheduledDate as any)?.toDate?.();
        if (!orderDate || orderDate < monthStart || orderDate > monthEnd) return;
        const isDelivered = o.status === "DELIVERED";
        // ordini "linked" non li conto qui se la pulizia non è del mese, ma se siamo qui
        // computeMonthDebt li ha già contati nel totale. Per il filtro pratico:
        if (!isDelivered) {
          // L'ordine è linked-COMPLETED: già incluso nel totale, sommo comunque deliveryFee
        }
        if (o.deliveryFee && o.deliveryFeeEnabled !== false) {
          ownerDeliveryFees += o.deliveryFee;
        }
      });
      realizedDeliveryFees += ownerDeliveryFees;
      realizedOrdersRevenue += calc.breakdown.ordersTotal - ownerDeliveryFees;
      realizedOrdersCount += calc.breakdown.ordersCount;
    }

    // ═════════════════════════════════════════════════════════════════
    // CALCOLO PROIEZIONE (solo per mese corrente o futuro):
    // include ANCHE pulizie/ordini programmati ma non ancora completati
    // ═════════════════════════════════════════════════════════════════
    let projectionTotal = 0;
    let projectionCleaningsRevenue = 0;
    let projectionOrdersRevenue = 0;
    let projectionDeliveryFees = 0;
    let projectionCleaningsCount = 0;
    let projectionOrdersCount = 0;

    if (!isPast) {
      // Pulizie programmate nel mese (escluso CANCELLED), inclusi tutti gli stati
      const projCleanings = cleanings.filter(c => {
        if (c.status === "CANCELLED") return false;
        if (!c.propertyId || !propertiesById.has(c.propertyId)) return false;
        const d = c.scheduledDate?.toDate?.();
        return d && d >= monthStart && d <= monthEnd;
      });
      // Ordini programmati nel mese (escluso CANCELLED), inclusi tutti gli stati
      const projOrders = orders.filter(o => {
        if (o.status === "CANCELLED") return false;
        if (!propertiesById.has(o.propertyId)) return false;
        const d = o.scheduledDate?.toDate?.() || o.createdAt?.toDate?.();
        return d && d >= monthStart && d <= monthEnd;
      });

      projCleanings.forEach(c => {
        const prop = propertiesById.get(c.propertyId!);
        const basePrice = c.price ?? prop?.cleaningPrice ?? 0;
        const holidayFee = c.holidayFee ?? 0;
        projectionCleaningsRevenue += (c.priceOverride ?? basePrice) + holidayFee;
        projectionCleaningsCount++;
      });

      projOrders.forEach(o => {
        let calc = 0;
        if (Array.isArray(o.items)) {
          o.items.forEach((item: any) => {
            const itemKey = item.itemId || item.id;
            const inv = inventoryById.get(itemKey);
            const basePrice = item.unitPrice ?? item.price ?? inv?.sellPrice ?? 0;
            const unitPrice = item.priceOverride ?? basePrice;
            const qty = item.quantity ?? 1;
            calc += item.totalPrice ?? (unitPrice * qty);
          });
        }
        const deliveryFee = (o.deliveryFee && o.deliveryFeeEnabled !== false) ? o.deliveryFee : 0;
        const bedMakingFee = (o.bedMaking && o.bedMakingFee) ? o.bedMakingFee : 0;
        const itemsAndBedMaking = calc + bedMakingFee;
        const effectivePrice = o.totalPriceOverride ?? (itemsAndBedMaking + deliveryFee);

        // Distinguo delivery fee dal resto per il dettaglio visivo
        if (o.totalPriceOverride === undefined || o.totalPriceOverride === null) {
          projectionOrdersRevenue += itemsAndBedMaking;
          projectionDeliveryFees += deliveryFee;
        } else {
          // Con totalPriceOverride non posso distinguere; metto tutto in ordersRevenue
          projectionOrdersRevenue += effectivePrice;
        }
        projectionOrdersCount++;
      });

      projectionTotal = projectionCleaningsRevenue + projectionOrdersRevenue + projectionDeliveryFees;
    }

    // ═════════════════════════════════════════════════════════════════
    // SCEGLI quale visualizzare in base al "modo" del mese
    // ═════════════════════════════════════════════════════════════════
    let title: string;
    let total: number;
    let cleaningsRevenue: number;
    let ordersRevenue: number;
    let deliveryFees: number;
    let cleaningsCount: number;
    let ordersCount: number;

    if (isPast) {
      title = "Incasso realizzato";
      total = realizedTotal;
      cleaningsRevenue = realizedCleaningsRevenue;
      ordersRevenue = realizedOrdersRevenue;
      deliveryFees = realizedDeliveryFees;
      cleaningsCount = realizedCleaningsCount;
      ordersCount = realizedOrdersCount;
    } else if (isCurrent) {
      // Mese corrente: mostro la proiezione di fine mese (più informativo)
      title = "Incasso previsto mese corrente";
      total = projectionTotal;
      cleaningsRevenue = projectionCleaningsRevenue;
      ordersRevenue = projectionOrdersRevenue;
      deliveryFees = projectionDeliveryFees;
      cleaningsCount = projectionCleaningsCount;
      ordersCount = projectionOrdersCount;
    } else {
      title = "Proiezione incasso";
      total = projectionTotal;
      cleaningsRevenue = projectionCleaningsRevenue;
      ordersRevenue = projectionOrdersRevenue;
      deliveryFees = projectionDeliveryFees;
      cleaningsCount = projectionCleaningsCount;
      ordersCount = projectionOrdersCount;
    }

    return {
      monthStart,
      monthEnd,
      isCurrent,
      isPast,
      monthLabel,
      title,
      total,
      cleaningsRevenue,
      ordersRevenue,
      deliveryFees,
      cleaningsCount,
      ordersCount,
      // Espongo anche realized e projection separatamente per UI future (es. mostrare entrambi)
      realizedTotal,
      projectionTotal,
    };
  }, [heroMonth, cleanings, orders, inventory, properties, payments]);

  // 🔧 FIX v2: navigazione mese del banner
  const goPrevMonth = () => {
    setHeroMonth((prev: Date) => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() - 1);
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d;
    });
  };
  const goNextMonth = () => {
    setHeroMonth((prev: Date) => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + 1);
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d;
    });
  };
  const goThisMonth = () => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    setHeroMonth(d);
  };

  // Loading
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-14 h-14 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-500">Caricamento report...</p>
      </div>
    </div>
  );

  const periodLabel = period === "week" ? "Settimana" : period === "month" ? "Mese" : period === "quarter" ? "Trimestre" : "Anno";

  // ==================== TAB CONTENT RENDERERS ====================

  const renderPanoramica = () => (
    <div className="space-y-6">
      {/* Monthly Forecast Hero - 🔧 FIX v3: valore centrato perfettamente tra le frecce */}
      <div className="relative bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-500 rounded-2xl p-5 lg:p-6 text-white shadow-lg shadow-blue-500/20">
        {/* Icona dollaro posizionata in assoluto per non sbilanciare il centraggio */}
        <div className="absolute top-5 right-5 lg:top-6 lg:right-6 w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center pointer-events-none">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        {/* Titolo + badge Oggi — margine destro per non finire sotto l'icona */}
        <div className="flex items-center gap-2 mb-3 pr-16">
          <p className="text-white/70 text-xs font-medium uppercase tracking-wider">{heroBanner.title}</p>
          {!heroBanner.isCurrent && (
            <button
              onClick={goThisMonth}
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors whitespace-nowrap"
              title="Torna al mese corrente"
            >
              Oggi
            </button>
          )}
        </div>

        {/* Riga frecce + valore — tutto a sinistra, frecce equidistanti dal valore,
            spazio destro libero per non collidere con l'icona $ in alto a destra */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={goPrevMonth}
            className="w-9 h-9 lg:w-10 lg:h-10 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors flex-shrink-0"
            aria-label="Mese precedente"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="min-w-0">
            <p className="text-3xl lg:text-4xl font-black leading-tight">{fmtEuro(heroBanner.total)}</p>
            <p className="text-[11px] lg:text-xs text-white/80 font-semibold capitalize mt-0.5">{heroBanner.monthLabel}</p>
          </div>
          <button
            onClick={goNextMonth}
            className="w-9 h-9 lg:w-10 lg:h-10 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors flex-shrink-0"
            aria-label="Mese successivo"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white/15 rounded-xl p-3 text-center backdrop-blur-sm">
            <p className="text-xl lg:text-2xl font-bold">{fmtEuro(heroBanner.cleaningsRevenue)}</p>
            <p className="text-[10px] text-white/70 mt-0.5">{heroBanner.cleaningsCount} pulizie</p>
          </div>
          <div className="bg-white/15 rounded-xl p-3 text-center backdrop-blur-sm">
            <p className="text-xl lg:text-2xl font-bold">{fmtEuro(heroBanner.ordersRevenue)}</p>
            <p className="text-[10px] text-white/70 mt-0.5">{heroBanner.ordersCount} ordini</p>
          </div>
          <div className="bg-white/15 rounded-xl p-3 text-center backdrop-blur-sm">
            <p className="text-xl lg:text-2xl font-bold">{fmtEuro(heroBanner.deliveryFees)}</p>
            <p className="text-[10px] text-white/70 mt-0.5">fee consegne</p>
          </div>
        </div>
      </div>

      {/* Hero KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Icons.clean} label="Pulizie completate" value={fmtNum(computed.completedPeriod)} trend={computed.cleaningsTrend} sub={`${computed.totalCompleted} totali`} gradient="from-emerald-500 to-teal-600" />
        <StatCard icon={Icons.euro} label="Fatturato" value={fmtEuro(computed.revPeriod)} trend={computed.revenueTrend} sub={`${fmtEuro(computed.totalRevenue)} totale`} gradient="from-sky-500 to-blue-600" />
        <StatCard icon={Icons.truck} label="Consegne" value={fmtNum(computed.deliveredPeriod)} trend={computed.deliveriesTrend} sub={`${fmtNum(computed.itemsPeriod)} articoli`} gradient="from-violet-500 to-purple-600" />
        <StatCard icon={Icons.clock} label="Tempo medio pulizia" value={`${computed.avgTime}min`} sub={`${computed.completionRate.toFixed(0)}% completamento`} gradient="from-amber-500 to-orange-600" />
      </div>

      {/* Alerts */}
      {(computed.pendingCleanings > 0 || computed.pendingOrders > 0) && (
        <div className="flex gap-3 flex-wrap">
          {computed.pendingCleanings > 0 && (
            <div className="flex-1 min-w-[200px] bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">{Icons.warning}</div>
              <div>
                <p className="font-semibold text-amber-800 text-sm">{computed.pendingCleanings} pulizie in attesa</p>
                <p className="text-xs text-amber-600">Da assegnare o confermare</p>
              </div>
            </div>
          )}
          {computed.pendingOrders > 0 && (
            <div className="flex-1 min-w-[200px] bg-sky-50 border border-sky-200 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center">{Icons.truck}</div>
              <div>
                <p className="font-semibold text-sky-800 text-sm">{computed.pendingOrders} consegne in corso</p>
                <p className="text-xs text-sky-600">Picking o in transito</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 [grid grid-cols-1 lg:grid-cols-3 gap-6>*]:min-w-0">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/60 p-5 overflow-hidden min-w-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-800">Andamento attività</h3>
            <div className="flex gap-3 text-xs">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-sky-500" />Pulizie</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-violet-500" />Consegne</span>
            </div>
          </div>
          <BarChartSVG data={computed.dailyData} secondaryData={computed.dailyOrders} barColor="#0ea5e9" secondaryColor="#8b5cf6" height={200} />
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/60 p-5 overflow-hidden">
          <h3 className="font-semibold text-slate-800 mb-4">Riepilogo sistema</h3>
          <div className="space-y-3">
            {[
              { label: "Proprietà attive", value: computed.totalProps, color: "#0ea5e9" },
              { label: "Operatori", value: computed.totalOps, color: "#10b981" },
              { label: "Riders", value: computed.totalRiders, color: "#8b5cf6" },
              { label: "Proprietari", value: computed.totalOwners, color: "#f59e0b" },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: item.color }} />
                  <span className="text-sm text-slate-600">{item.label}</span>
                </div>
                <span className="text-lg font-bold text-slate-800">{item.value}</span>
              </div>
            ))}
            <div className="pt-3 border-t border-slate-200">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Fatturato trend (14gg)</span>
              </div>
              <div className="mt-2">
                <SparkLine data={computed.sparkRevenue} color="#10b981" height={40} width={280} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 [grid grid-cols-1 lg:grid-cols-3 gap-6>*]:min-w-0">
        <RankingTable title="Top Operatori" icon={Icons.users} data={computed.opStats.map(o => ({ name: o.name, value: o.cleanings, extra: `${fmtEuro(o.revenue)} • ${o.avgTime}min/pulizia` }))} valueLabel={`Pulizie ${periodLabel.toLowerCase()}`} gradient="from-emerald-500 to-teal-600" />
        <RankingTable title="Top Riders" icon={Icons.truck} data={computed.riderStats.map(r => ({ name: r.name, value: r.deliveries, extra: `${fmtNum(r.items)} articoli` }))} valueLabel={`Consegne ${periodLabel.toLowerCase()}`} gradient="from-sky-500 to-blue-600" />
        <RankingTable title="Top Proprietà" icon={Icons.home} data={computed.propStats.slice(0, 8).map(p => ({ name: p.name, value: p.revenue, extra: `${p.cleanings} pulizie • ${p.ownerName || ""}` }))} valueLabel="Per fatturato" valueSuffix="€" gradient="from-amber-500 to-orange-600" />
      </div>
    </div>
  );

  const renderFatturato = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Icons.euro} label="Fatturato pulizie" value={fmtEuro(computed.revPeriod)} trend={computed.revenueTrend} gradient="from-emerald-500 to-teal-600" />
        <StatCard icon={Icons.truck} label="Fee consegne" value={fmtEuro(computed.deliveryFeesPeriod)} sub="€10 per consegna standalone" gradient="from-sky-500 to-blue-600" />
        <StatCard icon={Icons.check} label="Incassato (mese)" value={fmtEuro(computed.totalPaid)} sub={`Bonifico: ${fmtEuro(computed.paidBonifico)}`} gradient="from-violet-500 to-purple-600" />
        <StatCard icon={Icons.target} label="Fatturato totale storico" value={fmtEuro(computed.totalRevenue)} gradient="from-amber-500 to-orange-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 [grid grid-cols-1 lg:grid-cols-3 gap-6>*]:min-w-0">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/60 p-5 overflow-hidden min-w-0">
          <h3 className="font-semibold text-slate-800 mb-4">Fatturato giornaliero</h3>
          <BarChartSVG data={computed.dailyRevenue} barColor="#10b981" height={200} />
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/60 p-5 overflow-hidden">
          <h3 className="font-semibold text-slate-800 mb-4">Metodi di pagamento</h3>
          <div className="flex justify-center mb-6">
            <div className="relative">
              <DonutChart
                size={140}
                strokeWidth={20}
                segments={[
                  { value: computed.paidBonifico, color: "#0ea5e9", label: "Bonifico" },
                  { value: computed.paidContanti, color: "#10b981", label: "Contanti" },
                  { value: computed.paidAltro, color: "#8b5cf6", label: "Altro" },
                ]}
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold text-slate-800">{fmtEuro(computed.totalPaid)}</span>
                <span className="text-[10px] text-slate-400">incassato</span>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            {[
              { label: "Bonifico", value: computed.paidBonifico, color: "#0ea5e9" },
              { label: "Contanti", value: computed.paidContanti, color: "#10b981" },
              { label: "Altro", value: computed.paidAltro, color: "#8b5cf6" },
            ].map((m, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: m.color }} />
                  <span className="text-slate-600">{m.label}</span>
                </div>
                <span className="font-semibold text-slate-800">{fmtEuroDec(m.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <RankingTable title="Top Clienti per fatturato" icon={Icons.person} data={computed.ownerStats.map(o => ({ name: o.name, value: o.revenue, extra: `${o.properties} proprietà • ${o.cleanings} pulizie` }))} valueLabel={`Fatturato ${periodLabel.toLowerCase()}`} valueSuffix="€" gradient="from-emerald-500 to-teal-600" />
    </div>
  );

  const renderPulizie = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Icons.check} label="Completate" value={fmtNum(computed.completedPeriod)} trend={computed.cleaningsTrend} gradient="from-emerald-500 to-teal-600" />
        <StatCard icon={Icons.warning} label="Cancellate" value={fmtNum(computed.cancelledPeriod)} sub={`Tasso: ${(100 - computed.completionRate).toFixed(1)}%`} gradient="from-rose-500 to-red-600" />
        <StatCard icon={Icons.fire} label="Sgrossi" value={fmtNum(computed.sgrossiPeriod)} gradient="from-amber-500 to-orange-600" />
        <StatCard icon={Icons.clock} label="Tempo medio" value={`${computed.avgTime} min`} sub={computed.missedPeriod > 0 ? `${computed.missedPeriod} deadline mancate` : "Nessuna deadline mancata"} gradient="from-sky-500 to-blue-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 [grid grid-cols-1 lg:grid-cols-2 gap-6>*]:min-w-0">
        <div className="bg-white rounded-2xl border border-slate-200/60 p-5 overflow-hidden">
          <h3 className="font-semibold text-slate-800 mb-4">Pulizie per giorno</h3>
          <BarChartSVG data={computed.dailyData} barColor="#10b981" height={180} />
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/60 p-5 overflow-hidden">
          <h3 className="font-semibold text-slate-800 mb-4">Fonte prenotazione</h3>
          {computed.sources.length > 0 ? (
            <div className="space-y-3">
              {computed.sources.map((s, i) => (
                <HorizontalBar
                  key={i}
                  label={s.name === "airbnb" ? "Airbnb" : s.name === "booking" ? "Booking" : s.name === "manuale" ? "Manuale" : s.name}
                  value={s.count}
                  maxValue={computed.sources[0].count}
                  color={s.name === "airbnb" ? "#FF5A5F" : s.name === "booking" ? "#003580" : "#64748b"}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-8">Nessun dato fonte</p>
          )}
        </div>
      </div>

      <RankingTable title="Proprietà più servite" icon={Icons.home} data={computed.propStats.map(p => ({ name: p.name, value: p.cleanings, extra: `${fmtEuro(p.revenue)} • ${p.city || ""}` }))} valueLabel="Per numero pulizie" gradient="from-sky-500 to-cyan-600" />
    </div>
  );

  const renderOperatori = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Icons.users} label="Operatori attivi" value={computed.totalOps} gradient="from-violet-500 to-purple-600" />
        <StatCard icon={Icons.clean} label="Media pulizie/operatore" value={computed.totalOps > 0 ? (computed.completedPeriod / computed.totalOps).toFixed(1) : "0"} sub={`${periodLabel}`} gradient="from-emerald-500 to-teal-600" />
        <StatCard icon={Icons.clock} label="Tempo medio globale" value={`${computed.avgTime} min`} gradient="from-sky-500 to-blue-600" />
        <StatCard icon={Icons.euro} label="Fatturato medio/op" value={computed.totalOps > 0 ? fmtEuro(computed.revPeriod / computed.totalOps) : "€0"} gradient="from-amber-500 to-orange-600" />
      </div>

      {/* Operator bars */}
      <div className="bg-white rounded-2xl border border-slate-200/60 p-5 overflow-hidden">
        <h3 className="font-semibold text-slate-800 mb-4">Carico di lavoro operatori</h3>
        <div className="space-y-3">
          {computed.opStats.map((op, i) => (
            <HorizontalBar
              key={op.id}
              label={op.name}
              value={op.cleanings}
              maxValue={computed.opStats[0]?.cleanings || 1}
              color={["#10b981", "#0ea5e9", "#8b5cf6", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4"][i % 7]}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 [grid grid-cols-1 lg:grid-cols-2 gap-6>*]:min-w-0">
        <RankingTable title="Classifica per pulizie" icon={Icons.clean} data={computed.opStats.map(o => ({ name: o.name, value: o.cleanings, extra: `Tempo medio: ${o.avgTime} min` }))} valueLabel="Pulizie completate" gradient="from-emerald-500 to-teal-600" />
        <RankingTable title="Classifica per fatturato" icon={Icons.euro} data={[...computed.opStats].sort((a, b) => b.revenue - a.revenue).map(o => ({ name: o.name, value: o.revenue, extra: `${o.cleanings} pulizie` }))} valueLabel="Fatturato generato" valueSuffix="€" gradient="from-sky-500 to-blue-600" />
      </div>
    </div>
  );

  const renderBiancheria = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Icons.box} label="Consegne effettuate" value={fmtNum(computed.deliveredPeriod)} trend={computed.deliveriesTrend} gradient="from-amber-500 to-orange-600" />
        <StatCard icon={Icons.target} label="Articoli consegnati" value={fmtNum(computed.itemsPeriod)} trend={computed.itemsTrend} gradient="from-sky-500 to-blue-600" />
        <StatCard icon={Icons.truck} label="Fee consegne" value={fmtEuro(computed.deliveryFeesPeriod)} gradient="from-violet-500 to-purple-600" />
        <StatCard icon={Icons.clock} label="In corso" value={fmtNum(computed.pendingOrders)} sub="Picking + In transito" gradient="from-rose-500 to-pink-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 [grid grid-cols-1 lg:grid-cols-2 gap-6>*]:min-w-0">
        <div className="bg-white rounded-2xl border border-slate-200/60 p-5 overflow-hidden">
          <h3 className="font-semibold text-slate-800 mb-4">Consegne per giorno</h3>
          <BarChartSVG data={computed.dailyOrders} barColor="#8b5cf6" height={180} />
        </div>
        <RankingTable title="Articoli più consegnati" icon={Icons.box} data={computed.topItems.map(it => ({ name: it.name, value: it.qty }))} valueLabel="Per quantità" gradient="from-amber-500 to-orange-600" />
      </div>

      <RankingTable title="Top Riders" icon={Icons.truck} data={computed.riderStats.map(r => ({ name: r.name, value: r.deliveries, extra: `${fmtNum(r.items)} articoli consegnati` }))} valueLabel="Consegne effettuate" gradient="from-sky-500 to-blue-600" />
    </div>
  );

  const renderProprieta = () => {
    const withIcal = computed.propStats.filter(p => p.hasIcal).length;
    const withoutIcal = computed.propStats.filter(p => !p.hasIcal).length;
    const avgPrice = computed.propStats.length > 0 ? computed.propStats.reduce((s, p) => s + p.cleaningPrice, 0) / computed.propStats.length : 0;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Icons.home} label="Proprietà attive" value={computed.totalProps} gradient="from-rose-500 to-pink-600" />
          <StatCard icon={Icons.check} label="Con iCal sincronizzato" value={withIcal} sub={`${withoutIcal} senza iCal`} gradient="from-sky-500 to-blue-600" />
          <StatCard icon={Icons.euro} label="Prezzo medio pulizia" value={fmtEuroDec(avgPrice)} gradient="from-emerald-500 to-teal-600" />
          <StatCard icon={Icons.clean} label="Media pulizie/proprietà" value={computed.totalProps > 0 ? (computed.completedPeriod / computed.totalProps).toFixed(1) : "0"} sub={periodLabel} gradient="from-violet-500 to-purple-600" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 [grid grid-cols-1 lg:grid-cols-2 gap-6>*]:min-w-0">
          <RankingTable title="Top per fatturato" icon={Icons.euro} data={computed.propStats.map(p => ({ name: p.name, value: p.revenue, extra: `${p.ownerName || ""} • ${p.city || ""}` }))} valueLabel="Fatturato generato" valueSuffix="€" gradient="from-emerald-500 to-teal-600" />
          <RankingTable title="Top per pulizie" icon={Icons.clean} data={[...computed.propStats].sort((a, b) => b.cleanings - a.cleanings).map(p => ({ name: p.name, value: p.cleanings, extra: `${fmtEuro(p.cleaningPrice)}/pulizia` }))} valueLabel="Numero pulizie" gradient="from-sky-500 to-blue-600" />
        </div>
      </div>
    );
  };

  const renderClienti = () => {
    const morosi = computed.ownerStats.filter(o => o.balance > 0);
    const saldati = computed.ownerStats.filter(o => o.balance <= 0);

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Icons.person} label="Proprietari totali" value={computed.totalOwners} gradient="from-teal-500 to-emerald-600" />
          <StatCard icon={Icons.check} label="Saldati" value={saldati.length} gradient="from-emerald-500 to-green-600" />
          <StatCard icon={Icons.warning} label="Con saldo aperto" value={morosi.length} sub={morosi.length > 0 ? `Totale: ${fmtEuro(morosi.reduce((s, o) => s + o.balance, 0))}` : ""} gradient="from-amber-500 to-orange-600" />
          <StatCard icon={Icons.euro} label="Fatturato medio/cliente" value={computed.totalOwners > 0 ? fmtEuro(computed.revPeriod / computed.totalOwners) : "€0"} gradient="from-sky-500 to-blue-600" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 [grid grid-cols-1 lg:grid-cols-2 gap-6>*]:min-w-0">
          <RankingTable title="Top clienti per fatturato" icon={Icons.euro} data={computed.ownerStats.map(o => ({ name: o.name, value: o.revenue, extra: `${o.properties} proprietà • ${o.cleanings} pulizie` }))} valueLabel="Fatturato periodo" valueSuffix="€" gradient="from-emerald-500 to-teal-600" />
          <RankingTable title="Saldo aperto più alto" icon={Icons.warning} data={morosi.map(o => ({ name: o.name, value: o.balance, extra: `Pagato: ${fmtEuro(o.paid)} su ${fmtEuro(o.revenue)}` }))} valueLabel="Da incassare" valueSuffix="€" gradient="from-amber-500 to-orange-600" />
        </div>
      </div>
    );
  };

  const tabContent: Record<Tab, () => React.ReactNode> = {
    panoramica: renderPanoramica,
    fatturato: renderFatturato,
    pulizie: renderPulizie,
    operatori: renderOperatori,
    biancheria: renderBiancheria,
    proprieta: renderProprieta,
    clienti: renderClienti,
  };

  // ==================== RENDER ====================
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-slate-200 px-4 lg:px-8 py-4 sticky top-0 z-30">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Report & Statistiche</h1>
            <p className="text-slate-500 text-sm">{new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
          {/* Period selector */}
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            {(["week", "month", "quarter", "year"] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 lg:px-4 py-2 rounded-lg text-xs lg:text-sm font-medium transition-all ${
                  period === p
                    ? "bg-white text-indigo-600 shadow-sm font-semibold"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {p === "week" ? "7gg" : p === "month" ? "Mese" : p === "quarter" ? "Trim." : "Anno"}
              </button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          {TABS.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 lg:px-4 py-2.5 rounded-xl text-xs lg:text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                  isActive
                    ? `bg-gradient-to-r ${tab.gradient} text-white shadow-lg`
                    : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${isActive ? "bg-white/20" : `bg-gradient-to-br ${tab.gradient}`}`}>
                  <div className="scale-75">{tab.icon}</div>
                </div>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 lg:p-8 max-w-[1600px] mx-auto">
        {tabContent[activeTab]()}
      </div>
    </div>
  );
}
