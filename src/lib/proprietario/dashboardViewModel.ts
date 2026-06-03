/**
 * dashboardViewModel — logica PURA di derivazione dati per la dashboard
 * proprietario (/proprietario/page.tsx).
 *
 * Non importa React né Firebase: prende in input SOLO gli output reali degli
 * hook canonici (useOwnerRealtimePayments → OwnerStats/OwnerSummary,
 * useOwnerDebts → MonthDebt[], useOwnerMonthlyTrend → TrendPoint[]) e produce
 * il "view model" che la UI mappa 1:1.
 *
 * Isolare qui tutta la matematica/aggancio permette di testarla senza Firebase.
 * Ogni valore deriva da una fonte canonica → i numeri combaciano con la
 * pagina /proprietario/pagamenti (stessa funzione computeMonthDebt a monte).
 */

import { MONTHS_IT, MONTHS_SHORT_IT } from "~/lib/payments/debtManager";
import type { MonthDebt, DebtStatus } from "~/lib/payments/debtManager";
import type { OwnerStats, OwnerSummary, ServiceType } from "~/hooks/useOwnerRealtimePayments";

// ── Palette categorie (coerente con PROP_COLORS dell'app) ──
export const CAT_COLOR: Record<string, string> = {
  PULIZIA: "#6366f1",
  BIANCHERIA: "#06b6d4",
  SERVIZI_EXTRA: "#ec4899",
  KIT_CORTESIA: "#f59e0b",
};
export const PROP_GRAD = [
  "linear-gradient(135deg,#6366f1,#4f46e5)",
  "linear-gradient(135deg,#8b5cf6,#7c3aed)",
  "linear-gradient(135deg,#ec4899,#db2777)",
  "linear-gradient(135deg,#f59e0b,#d97706)",
  "linear-gradient(135deg,#06b6d4,#0891b2)",
  "linear-gradient(135deg,#10b981,#059669)",
];
const TYPE_LABEL: Record<ServiceType, string> = {
  PULIZIA: "Pulizia",
  BIANCHERIA: "Biancheria",
  KIT_CORTESIA: "Kit Cortesia",
  SERVIZI_EXTRA: "Servizi Extra",
};

export type PayState = "ok" | "normal" | "warning" | "danger";
export type IconKey = "down" | "up" | "home" | "card" | "check" | "alert" | "clock";

export interface TrendPoint { month: number; year: number; total: number; }

export interface DashboardInput {
  now: Date;
  firstName: string;
  activeCount: number;
  pendingCount: number;
  cur: OwnerStats | null;
  prev: OwnerStats | null;
  summary: OwnerSummary | null;
  debts: MonthDebt[];
  totalDebt: number;
  countScaduti: number;
  countWarning: number;
  countDaPagare: number;
  trend: TrendPoint[]; // ascendente, ultimi 12 mesi (incluso il corrente)
}

export interface CatVM { key: ServiceType; name: string; value: number; count: number; color: string; }
export interface TrendVM { label: string; total: number; month: number; year: number; }
export interface RecentVM { type: ServiceType; typeLabel: string; property: string; image?: string; dateLabel: string; price: number; color: string; }
export interface PropertyVM { id: string; name: string; image?: string; cleanings: number; orders: number; total: number; pct: number; rank: number; grad: string; }
export interface PaySliceVM { name: string; eur: number; pct: number; color: string; }
export interface InsightVM { accent: string; bg: string; icon: IconKey; lead: string; rest: string; }
export interface NearestVM { days: number; saldo: number; scadenza: Date; dueLabel: string; }

export interface DashboardVM {
  greeting: string;
  firstName: string;
  monthLabel: string;
  activeCount: number;
  pendingCount: number;
  payments: {
    state: PayState;
    totalDebt: number;
    paidPct: number;
    remaining: number;
    counts: { scaduti: number; warning: number; daPagare: number };
    nearest: NearestVM | null;
  };
  countdown: NearestVM | null;
  spend: { total: number; prevTotal: number; deltaPct: number; deltaDir: 1 | 0 | -1; prevMonthName: string };
  spark: number[];
  kpis: { servicesCount: number; servDelta: number; avgCost: number; avgDelta: number };
  cats: CatVM[];
  catsTotal: number;
  monthBilled: number;
  trend: TrendVM[];
  recent: RecentVM[];
  properties: PropertyVM[]; // popolato solo se > 1 (multi-proprietà)
  paySplit: PaySliceVM[];
  insights: InsightVM[];
}

// ── helpers ──
function capit(s: string): string { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function fmtDateFull(d: Date): string {
  const giorni = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
  return `${giorni[d.getDay()]} ${d.getDate()} ${MONTHS_IT[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtDateShort(d: Date): string { return `${d.getDate()} ${MONTHS_SHORT_IT[d.getMonth()].toLowerCase()}`; }
function r0(n: number): number { return Math.round(n); }

function servicesCountOf(s: OwnerStats | null): number {
  if (!s) return 0;
  return s.cleaningsCount + s.ordersCount + s.kitCortesiaCount + s.serviziExtraCount;
}

export function buildDashboardViewModel(input: DashboardInput): DashboardVM {
  const { now, firstName, activeCount, pendingCount, cur, prev, summary,
    debts, totalDebt, countScaduti, countWarning, countDaPagare, trend } = input;

  const curMonth = now.getMonth() + 1;
  const curYear = now.getFullYear();
  const prevMonthIdx = (curMonth - 2 + 12) % 12; // 0-based index of previous month
  const prevMonthName = MONTHS_IT[prevMonthIdx];

  const h = now.getHours();
  const greeting = h < 12 ? "Buongiorno" : h < 18 ? "Buon pomeriggio" : "Buonasera";
  const monthLabel = `${MONTHS_IT[curMonth - 1]} ${curYear}`;

  // ── PAGAMENTI (canonico: useOwnerDebts) ──
  const state: PayState =
    countScaduti > 0 ? "danger" :
    countWarning > 0 ? "warning" :
    (totalDebt > 0 || countDaPagare > 0) ? "normal" : "ok";

  const servSum = debts.reduce((s, d) => s + d.totaleServizi, 0);
  const paidSum = debts.reduce((s, d) => s + d.totalePagato, 0);
  const paidPct = servSum > 0 ? Math.max(0, Math.min(100, r0((paidSum / servSum) * 100))) : 100;

  let nearest: NearestVM | null = null;
  if (debts.length > 0) {
    const nd = debts.reduce((a, b) => (b.giorniAllaScadenza < a.giorniAllaScadenza ? b : a), debts[0]);
    nearest = { days: nd.giorniAllaScadenza, saldo: nd.saldo, scadenza: nd.scadenza, dueLabel: fmtDateFull(nd.scadenza) };
  }

  // ── SPESA mese (canonico: totaleCalcolato) ──
  const total = cur?.totaleCalcolato ?? 0;
  const prevTotal = prev?.totaleCalcolato ?? 0;
  const deltaPct = prevTotal > 0 ? r0(((total - prevTotal) / prevTotal) * 100) : 0;
  const deltaDir: 1 | 0 | -1 = deltaPct > 0 ? 1 : deltaPct < 0 ? -1 : 0;

  const spark = trend.slice(-6).map((t) => t.total);

  // ── KPI ──
  const servicesCount = servicesCountOf(cur);
  const prevServices = servicesCountOf(prev);
  const servDelta = servicesCount - prevServices;
  const avgCost = servicesCount > 0 ? r0(total / servicesCount) : 0;
  const prevAvg = prevServices > 0 ? r0(prevTotal / prevServices) : 0;
  const avgDelta = avgCost - prevAvg;

  // ── CATEGORIE (donut) — solo > 0 ──
  const catsRaw: CatVM[] = cur ? [
    { key: "PULIZIA" as ServiceType, name: "Pulizie", value: cur.cleaningsTotal, count: cur.cleaningsCount, color: CAT_COLOR.PULIZIA },
    { key: "BIANCHERIA" as ServiceType, name: "Biancheria", value: cur.ordersTotal, count: cur.ordersCount, color: CAT_COLOR.BIANCHERIA },
    { key: "SERVIZI_EXTRA" as ServiceType, name: "Servizi Extra", value: cur.serviziExtraTotal, count: cur.serviziExtraCount, color: CAT_COLOR.SERVIZI_EXTRA },
    { key: "KIT_CORTESIA" as ServiceType, name: "Kit Cortesia", value: cur.kitCortesiaTotal, count: cur.kitCortesiaCount, color: CAT_COLOR.KIT_CORTESIA },
  ] : [];
  const cats = catsRaw.filter((c) => c.value > 0.001);
  const catsTotal = cats.reduce((s, c) => s + c.value, 0);

  // ── TREND (area) ──
  const trendVM: TrendVM[] = trend.map((t) => ({ label: MONTHS_SHORT_IT[t.month - 1], total: t.total, month: t.month, year: t.year }));

  // ── ULTIMI SERVIZI ──
  const recent: RecentVM[] = (cur?.services ?? [])
    .slice()
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 5)
    .map((s) => ({
      type: s.type,
      typeLabel: TYPE_LABEL[s.type] || s.type,
      property: s.propertyName,
      image: s.propertyImage,
      dateLabel: fmtDateShort(s.date),
      price: s.effectivePrice,
      color: CAT_COLOR[s.type] || "#6366f1",
    }));

  // ── SPESA PER PROPRIETÀ (solo multi) ──
  const byProp = (cur?.statsByProperty ?? []).slice().sort((a, b) => b.total - a.total);
  const propSum = byProp.reduce((s, p) => s + p.total, 0) || 1;
  const properties: PropertyVM[] = byProp.length > 1
    ? byProp.map((p, i) => ({
        id: p.propertyId,
        name: p.propertyName || "Proprietà",
        image: p.propertyImage,
        cleanings: p.cleaningsCount,
        orders: p.ordersCount,
        total: p.total,
        pct: r0((p.total / propSum) * 100),
        rank: i + 1,
        grad: PROP_GRAD[i % PROP_GRAD.length],
      }))
    : [];

  // ── METODI DI PAGAMENTO ──
  const paysRaw: PaySliceVM[] = summary ? [
    { name: "Bonifico", eur: summary.totaleBonifico, pct: 0, color: "#6366f1" },
    { name: "Contanti", eur: summary.totaleContanti, pct: 0, color: "#10b981" },
    { name: "Altro", eur: summary.totaleAltro, pct: 0, color: "#f59e0b" },
  ] : [];
  const payTot = paysRaw.reduce((s, p) => s + p.eur, 0);
  const paySplit = paysRaw
    .filter((p) => p.eur > 0.001)
    .map((p) => ({ ...p, pct: payTot > 0 ? r0((p.eur / payTot) * 100) : 0 }));

  // ── INSIGHTS (generati dai numeri reali, max 3) ──
  const insights: InsightVM[] = [];
  // A. spesa vs mese precedente
  if (prevTotal > 0 && total !== prevTotal) {
    const diff = Math.abs(r0(total - prevTotal));
    const down = total < prevTotal;
    insights.push({
      accent: down ? "#10b981" : "#ef4444",
      bg: down ? "#ecfdf5" : "#fef2f2",
      icon: down ? "down" : "up",
      lead: `Hai speso €${diff} in ${down ? "meno" : "più"} `,
      rest: `rispetto a ${prevMonthName.toLowerCase()}.`,
    });
  } else if (servicesCount > 0) {
    insights.push({
      accent: "#6366f1", bg: "#eef2ff", icon: "check",
      lead: `${servicesCount} servizi `, rest: `registrati questo mese.`,
    });
  }
  // B. proprietà più attiva (multi) oppure metodo dominante oppure costo medio
  if (properties.length > 1) {
    const top = properties[0];
    insights.push({
      accent: "#6366f1", bg: "#eef2ff", icon: "home",
      lead: `${top.name} `, rest: `è la più attiva: ${top.pct}% della spesa del mese.`,
    });
  } else if (paySplit.length > 0 && paySplit[0].pct >= 60) {
    const top = paySplit[0];
    insights.push({
      accent: "#06b6d4", bg: "#ecfeff", icon: "card",
      lead: `Il ${top.pct}% dei pagamenti `, rest: `è via ${top.name.toLowerCase()}.`,
    });
  } else if (avgCost > 0) {
    insights.push({
      accent: "#d97706", bg: "#fffbeb", icon: "card",
      lead: `Costo medio €${avgCost} `, rest: `a servizio questo mese.`,
    });
  }
  // C. stato pagamenti
  if (countScaduti > 0) {
    insights.push({
      accent: "#ef4444", bg: "#fef2f2", icon: "alert",
      lead: `${countScaduti} ${countScaduti === 1 ? "mese scaduto" : "mesi scaduti"}: `, rest: `salda al più presto per evitare il blocco.`,
    });
  } else if (nearest) {
    insights.push({
      accent: nearest.days <= 5 ? "#d97706" : "#6366f1",
      bg: nearest.days <= 5 ? "#fffbeb" : "#eef2ff",
      icon: "clock",
      lead: `Prossima scadenza tra ${Math.max(0, nearest.days)} giorni: `, rest: `€${r0(nearest.saldo)} entro il ${fmtDateShort(nearest.scadenza)}.`,
    });
  } else {
    insights.push({
      accent: "#10b981", bg: "#ecfdf5", icon: "check",
      lead: `Tutto saldato. `, rest: `Nessun pagamento in sospeso.`,
    });
  }

  return {
    greeting, firstName, monthLabel, activeCount, pendingCount,
    payments: { state, totalDebt, paidPct, remaining: totalDebt, counts: { scaduti: countScaduti, warning: countWarning, daPagare: countDaPagare }, nearest },
    countdown: nearest,
    spend: { total, prevTotal, deltaPct, deltaDir, prevMonthName: capit(prevMonthName) },
    spark,
    kpis: { servicesCount, servDelta, avgCost, avgDelta },
    cats, catsTotal, monthBilled: total,
    trend: trendVM,
    recent, properties, paySplit, insights,
  };
}
