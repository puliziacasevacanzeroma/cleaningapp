"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { useOwnerRealtimePayments, type ServiceDetail, type ServiceType } from "~/hooks/useOwnerRealtimePayments";
import { generatePDF, generateXLSX } from "~/lib/payments/exportHelpers";

// ==================== ICONS ====================
const Icons = {
  chevronLeft: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  ),
  chevronRight: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  ),
  chevronDown: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  ),
  check: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  x: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  wallet: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  ),
  home: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  bed: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12h16M4 12a2 2 0 01-2-2V6a2 2 0 012-2h16a2 2 0 012 2v4a2 2 0 01-2 2M4 12v6a2 2 0 002 2h12a2 2 0 002-2v-6" />
    </svg>
  ),
  spray: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
    </svg>
  ),
  package: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  gift: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
    </svg>
  ),
  creditCard: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  ),
  banknote: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  calendar: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  alertTriangle: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
};

// ==================== HELPERS ====================
const MONTHS_SHORT = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(amount);
}

function getServiceIcon(type: ServiceType) {
  switch (type) {
    case "PULIZIA": return Icons.spray;
    case "BIANCHERIA": return Icons.bed;
    case "KIT_CORTESIA": return Icons.package;
    case "SERVIZI_EXTRA": return Icons.gift;
    default: return Icons.home;
  }
}

function getServiceLabel(type: ServiceType): string {
  switch (type) {
    case "PULIZIA": return "Pulizia";
    case "BIANCHERIA": return "Biancheria";
    case "KIT_CORTESIA": return "Kit Cortesia";
    case "SERVIZI_EXTRA": return "Extra";
    default: return type;
  }
}

// ==================== MAIN COMPONENT ====================
export default function ProprietarioPagamentiPage() {
  const { user } = useAuth();
  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();
  const defaultMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const defaultYear = currentMonth === 1 ? currentYear - 1 : currentYear;

  const [isDesktop, setIsDesktop] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [selectedYear, setSelectedYear] = useState(defaultYear);

  const { loading, error, stats, summary } = useOwnerRealtimePayments(user?.id, selectedMonth, selectedYear);

  const [expandedProperties, setExpandedProperties] = useState<Set<string>>(new Set());
  const [expandedBiancheria, setExpandedBiancheria] = useState<Set<string>>(new Set());
  const [showRiepilogo, setShowRiepilogo] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingXlsx, setDownloadingXlsx] = useState(false);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const goToPrevMonth = () => {
    if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear(selectedYear - 1); }
    else setSelectedMonth(selectedMonth - 1);
    setExpandedProperties(new Set());
  };

  const goToNextMonth = () => {
    const nextM = selectedMonth === 12 ? 1 : selectedMonth + 1;
    const nextY = selectedMonth === 12 ? selectedYear + 1 : selectedYear;
    if (nextY > currentYear || (nextY === currentYear && nextM > currentMonth)) return;
    if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear(selectedYear + 1); }
    else setSelectedMonth(selectedMonth + 1);
    setExpandedProperties(new Set());
  };

  const toggleProperty = (propId: string) => {
    setExpandedProperties(prev => {
      const n = new Set(prev);
      if (n.has(propId)) n.delete(propId); else n.add(propId);
      return n;
    });
  };

  const toggleBiancheria = (id: string) => {
    setExpandedBiancheria(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  // Raggruppa servizi per data (pulizia + biancheria collegata)
  const normalizeDate = (dateStr: string | Date | undefined): string => {
    if (!dateStr) return '';
    try { return new Date(dateStr).toISOString().split('T')[0]; } catch { return ''; }
  };

  const groupServicesByDate = (services: ServiceDetail[]) => {
    const groups: { [key: string]: { pulizia?: ServiceDetail; biancheriaCollegata?: ServiceDetail; altri: ServiceDetail[]; dateKey: string } } = {};
    const pulizie: ServiceDetail[] = [];
    const biancherie: ServiceDetail[] = [];
    const altri: ServiceDetail[] = [];

    services.forEach(s => {
      if (s.type === 'PULIZIA') pulizie.push(s);
      else if (s.type === 'BIANCHERIA') biancherie.push(s);
      else altri.push(s);
    });

    const biancherieUsate = new Set<string>();

    pulizie.forEach(pulizia => {
      const groupKey = `pulizia-${pulizia.id}`;
      groups[groupKey] = { pulizia, altri: [], dateKey: pulizia.date?.toString() || 'no-date' };

      for (const biancheria of biancherie) {
        if (biancherieUsate.has(biancheria.id)) continue;
        let isCollegata = false;
        if (pulizia.laundryOrderId && pulizia.laundryOrderId === biancheria.id) isCollegata = true;
        else if (biancheria.cleaningId && biancheria.cleaningId === pulizia.id) isCollegata = true;
        else if (biancheria.propertyId === pulizia.propertyId && normalizeDate(biancheria.date) === normalizeDate(pulizia.date)) isCollegata = true;
        else if (biancheria.propertyId === pulizia.propertyId) {
          const diff = Math.abs((new Date(pulizia.date).getTime() - new Date(biancheria.date).getTime()) / (1000 * 60 * 60 * 24));
          if (diff <= 1) isCollegata = true;
        }
        if (isCollegata) { groups[groupKey].biancheriaCollegata = biancheria; biancherieUsate.add(biancheria.id); break; }
      }
    });

    biancherie.forEach(b => {
      if (biancherieUsate.has(b.id)) return;
      groups[`standalone-${b.id}`] = { altri: [b], dateKey: b.date?.toString() || 'no-date' };
    });

    altri.forEach(s => {
      const nd = normalizeDate(s.date);
      let found = false;
      for (const key of Object.keys(groups)) {
        if (normalizeDate(groups[key].dateKey) === nd) { groups[key].altri.push(s); found = true; break; }
      }
      if (!found) groups[`altri-${s.id}`] = { altri: [s], dateKey: s.date?.toString() || 'no-date' };
    });

    return groups;
  };

  const formatServiceDate = (dateStr?: string | Date) => {
    if (!dateStr) return null;
    try {
      const date = new Date(dateStr);
      return { day: date.getDate(), month: MONTHS_SHORT[date.getMonth()], weekday: ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'][date.getDay()] };
    } catch { return null; }
  };

  // ==================== RENDER ====================
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-white pb-20 lg:pb-0">
      {/* Header */}
      <div className="relative overflow-hidden text-white" style={{ background: "#0b0b18" }}>
        {/* BG foto */}
        <div className="absolute inset-0" style={{ backgroundImage: "url('/pagamenti-banner.jpg')", backgroundSize: "cover", backgroundPosition: "center", opacity: 0.35 }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(11,11,24,0.2) 0%, rgba(11,11,24,0.85) 100%)" }} />
        <div className="relative z-10 max-w-7xl mx-auto px-4 lg:px-8 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-slate-400 text-xs">I tuoi</p>
              <h1 className="text-xl font-bold">Pagamenti</h1>
            </div>
            <button onClick={() => setShowRiepilogo(true)} className="flex items-center gap-2 px-3 py-1.5 bg-slate-700/50 rounded-xl hover:bg-slate-600/50 transition-colors">
              {Icons.wallet}
              <span className="text-sm font-medium text-slate-300">Riepilogo</span>
            </button>
          </div>

          {/* Month Selector */}
          <div className="flex items-center justify-center gap-4 mb-4">
            <button onClick={goToPrevMonth} className="w-10 h-10 rounded-xl bg-slate-700/50 flex items-center justify-center hover:bg-slate-600 transition-colors">
              {Icons.chevronLeft}
            </button>
            <div className="text-center min-w-[120px]">
              <span className="text-xl font-bold">{MONTHS_SHORT[selectedMonth - 1]} {selectedYear}</span>
            </div>
            <button 
              onClick={goToNextMonth}
              disabled={selectedMonth === currentMonth && selectedYear === currentYear}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${selectedMonth === currentMonth && selectedYear === currentYear ? "bg-slate-700/20 opacity-30 cursor-not-allowed" : "bg-slate-700/50 hover:bg-slate-600"}`}
            >
              {Icons.chevronRight}
            </button>
          </div>

          {/* Badge mese */}
          <div className="flex justify-center mb-4">
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl ${
              selectedMonth === currentMonth && selectedYear === currentYear
                ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
            }`}>
              {Icons.calendar}
              <span className="text-sm font-medium">
                {selectedMonth === currentMonth && selectedYear === currentYear ? "Mese corrente" : "Mese precedente"}
              </span>
            </div>
          </div>

          {/* Stats */}
          {summary && (
            <>
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-slate-700/50 rounded-xl p-2 sm:p-3 text-center">
                  <p className="text-slate-400 text-[9px] sm:text-[10px] uppercase tracking-wide">Totale</p>
                  <p className="text-white text-sm sm:text-lg font-bold">{formatCurrency(summary.totaleServizi)}</p>
                </div>
                <div className="bg-emerald-500/20 border border-emerald-500/30 rounded-xl p-2 sm:p-3 text-center">
                  <p className="text-emerald-300 text-[9px] sm:text-[10px] uppercase tracking-wide">Pagato</p>
                  <p className="text-emerald-400 text-sm sm:text-lg font-bold">{formatCurrency(summary.totalePagato)}</p>
                </div>
                <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-2 sm:p-3 text-center">
                  <p className="text-red-300 text-[9px] sm:text-[10px] uppercase tracking-wide">Da pagare</p>
                  <p className="text-red-400 text-sm sm:text-lg font-bold">{formatCurrency(summary.totaleDovuto)}</p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="bg-slate-700/50 rounded-xl p-3 mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-slate-400 text-sm">Progresso</span>
                  <span className="text-emerald-400 font-bold">
                    {summary.totaleServizi > 0 ? Math.round((summary.totalePagato / summary.totaleServizi) * 100) : 0}%
                  </span>
                </div>
                <div className="h-2 bg-slate-600 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500"
                    style={{ width: `${summary.totaleServizi > 0 ? (summary.totalePagato / summary.totaleServizi) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* Disclaimer IVA */}
              <div className="flex items-center justify-center gap-1.5 mb-3">
                <svg className="w-3 h-3 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-[10px] text-slate-400">Tutti gli importi sono IVA esclusa</p>
              </div>

              {/* Payment Methods */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-700/30 rounded-xl p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-600/50 flex items-center justify-center text-slate-300">
                    {Icons.banknote}
                  </div>
                  <div>
                    <p className="text-slate-400 text-[10px] uppercase">Contanti</p>
                    <p className="text-white font-bold">{formatCurrency(summary.totaleContanti)}</p>
                  </div>
                </div>
                <div className="bg-slate-700/30 rounded-xl p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-600/50 flex items-center justify-center text-slate-300">
                    {Icons.creditCard}
                  </div>
                  <div>
                    <p className="text-slate-400 text-[10px] uppercase">Bonifico</p>
                    <p className="text-white font-bold">{formatCurrency(summary.totaleBonifico)}</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4 space-y-4">
        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2 text-sm">
            <span className="text-red-500">{Icons.alertTriangle}</span>
            <p className="text-red-700 flex-1">{error}</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-sky-500 border-t-transparent"></div>
          </div>
        )}

        {/* Empty State */}
        {!loading && (!stats || stats.services.length === 0) && (
          <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-sm">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-400">
              {Icons.wallet}
            </div>
            <p className="text-slate-500">Nessun servizio in questo mese</p>
          </div>
        )}

        {/* Proprietà con servizi */}
        {!loading && stats && stats.statsByProperty.map((prop, propIdx) => {
          const isPropExpanded = expandedProperties.has(prop.propertyId);

          return (
            <div key={propIdx} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Header proprietà */}
              <button
                onClick={() => toggleProperty(prop.propertyId)}
                className="w-full px-4 py-3 bg-gradient-to-r from-slate-50 to-white flex flex-col gap-2.5 hover:from-slate-100 hover:to-slate-50 transition-colors"
              >
                {/* Riga 1: foto + nome + freccia */}
                <div className="flex items-center gap-3 w-full">
                  {prop.propertyImage ? (
                    <img src={prop.propertyImage} alt={prop.propertyName} className="w-12 h-12 rounded-xl object-cover shadow-md flex-shrink-0 border-2 border-violet-200" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-lg font-bold shadow-md flex-shrink-0">
                      {prop.propertyName.charAt(0)}
                    </div>
                  )}
                  <div className="text-left min-w-0 flex-1">
                    <p className="font-semibold text-slate-800 truncate">{prop.propertyName}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {(() => {
                        // 🆕 Distinguo servizi (pulizie) da ordini (biancheria + altri)
                        const parts: string[] = [];
                        if (prop.cleaningsCount > 0) parts.push(`${prop.cleaningsCount} ${prop.cleaningsCount === 1 ? "pulizia" : "pulizie"}`);
                        if (prop.ordersCount > 0) parts.push(`${prop.ordersCount} ${prop.ordersCount === 1 ? "ordine" : "ordini"}`);
                        return parts.length > 0 ? parts.join(" · ") : `${prop.servicesCount} pulizie`;
                      })()}
                    </p>
                  </div>
                  <div className={`w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center transition-transform flex-shrink-0 ${isPropExpanded ? "rotate-180" : ""}`}>
                    {Icons.chevronDown}
                  </div>
                </div>
                {/* Riga 2: totale su riga propria (separato dal nome per evitare sovrapposizioni) */}
                <div className="flex items-baseline justify-between w-full border-t border-slate-200 pt-2">
                  <span className="text-xs text-slate-400">Totale mese</span>
                  <p className="font-bold text-slate-800 text-lg">{formatCurrency(prop.total)}</p>
                </div>
              </button>

              {/* Servizi espansi */}
              {isPropExpanded && (
                <div className="px-4 py-3 space-y-3 bg-white border-t border-slate-200">
                  {(() => {
                    const dateGroups = groupServicesByDate(prop.services);
                    const sortedKeys = Object.keys(dateGroups).sort((a, b) => {
                      const dA = dateGroups[a].pulizia?.date || dateGroups[a].altri[0]?.date || '';
                      const dB = dateGroups[b].pulizia?.date || dateGroups[b].altri[0]?.date || '';
                      return new Date(dB).getTime() - new Date(dA).getTime();
                    });

                    return sortedKeys.map((groupKey, dateIdx) => {
                      const group = dateGroups[groupKey];
                      const actualDate = group.pulizia?.date || group.biancheriaCollegata?.date || group.altri[0]?.date;
                      const dateInfo = formatServiceDate(actualDate);
                      const hasContent = group.pulizia || group.biancheriaCollegata || group.altri.length > 0;
                      if (!hasContent) return null;

                      const groupTotal = (group.pulizia?.effectivePrice || 0) + (group.biancheriaCollegata?.effectivePrice || 0) + group.altri.reduce((s, sv) => s + sv.effectivePrice, 0);
                      const hasMultiple = (group.pulizia ? 1 : 0) + (group.biancheriaCollegata ? 1 : 0) + group.altri.length > 1;

                      return (
                        <div key={dateIdx} className="rounded-xl sm:rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-white">
                          <div className="flex items-stretch">
                            {dateInfo && (
                              <div className="w-12 sm:w-16 flex-shrink-0 flex flex-col items-center justify-center py-2 sm:py-3 bg-gradient-to-b from-slate-700 to-slate-800 text-white">
                                <span className="text-[8px] sm:text-[10px] font-medium opacity-70">{dateInfo.weekday}</span>
                                <span className="text-lg sm:text-2xl font-bold">{dateInfo.day}</span>
                                <span className="text-[8px] sm:text-[10px] font-medium opacity-70">{dateInfo.month}</span>
                              </div>
                            )}
                            <div className="flex-1 min-w-0 overflow-hidden">
                              {/* Pulizia */}
                              {group.pulizia && (
                                <div>
                                  <div className="p-2.5 sm:p-3 flex items-center gap-2 sm:gap-3">
                                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center text-white shadow-md flex-shrink-0">
                                      {getServiceIcon(group.pulizia.type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-semibold text-slate-800 text-sm sm:text-base">{getServiceLabel(group.pulizia.type)}</p>
                                      {group.pulizia.description && <p className="text-[11px] sm:text-xs text-slate-500 truncate">{group.pulizia.description}</p>}
                                    </div>
                                    <p className={`font-bold text-base sm:text-lg flex-shrink-0 ${group.pulizia.hasOverride ? "text-amber-600" : "text-sky-600"}`}>
                                      {formatCurrency((group.pulizia as any).holidayFee ? group.pulizia.effectivePrice - (group.pulizia as any).holidayFee : group.pulizia.effectivePrice)}
                                    </p>
                                  </div>
                                  
                                  {/* 🎉 Maggiorazione festività */}
                                  {(group.pulizia as any).holidayFee > 0 && (
                                    <div className="px-2.5 sm:px-3 pb-2 flex items-center gap-2 sm:gap-3 ml-11 sm:ml-13">
                                      <span className="text-sm">🎉</span>
                                      <p className="flex-1 text-sm text-amber-600 font-medium">{(group.pulizia as any).holidayName || "Festività"} (+50%)</p>
                                      <p className="font-bold text-sm text-amber-600 flex-shrink-0">{formatCurrency((group.pulizia as any).holidayFee)}</p>
                                    </div>
                                  )}

                                  {/* Biancheria collegata */}
                                  {group.biancheriaCollegata && (
                                    <div className="mx-2 sm:mx-3 mb-3 ml-4 sm:ml-6">
                                      <button
                                        onClick={() => toggleBiancheria(group.biancheriaCollegata!.id)}
                                        className={`w-full p-2 rounded-xl border-2 border-dashed flex items-center gap-2 transition-all ${
                                          expandedBiancheria.has(group.biancheriaCollegata.id) ? "border-violet-400 bg-violet-50" : "border-slate-300 bg-slate-50 hover:border-violet-400 hover:bg-violet-50"
                                        }`}
                                      >
                                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center text-white shadow flex-shrink-0">
                                          {getServiceIcon("BIANCHERIA")}
                                        </div>
                                        <div className="flex-1 text-left min-w-0">
                                          <p className="font-medium text-slate-700 text-sm">Biancheria{(group.biancheriaCollegata.kitItems?.length || 0) > 0 ? " e Kit" : ""}</p>
                                          <p className="text-[11px] text-slate-500">{(group.biancheriaCollegata.linenItems?.length ?? group.biancheriaCollegata.items?.length ?? 0) + (group.biancheriaCollegata.kitItems?.length || 0)} articoli</p>
                                        </div>
                                        <p className="font-bold text-violet-600 text-sm">{formatCurrency(group.biancheriaCollegata.effectivePrice)}</p>
                                        <div className={`w-6 h-6 rounded-md bg-violet-200 flex items-center justify-center transition-transform text-violet-600 ${expandedBiancheria.has(group.biancheriaCollegata.id) ? "rotate-180" : ""}`}>
                                          {Icons.chevronDown}
                                        </div>
                                      </button>

                                      {expandedBiancheria.has(group.biancheriaCollegata.id) && (
                                        <>
                                          {/* SEZIONE BIANCHERIA */}
                                          {(() => {
                                            const linen = group.biancheriaCollegata!.linenItems
                                              ?? group.biancheriaCollegata!.items?.filter(i => i.itemId !== "_delivery_fee" && i.itemId !== "_bed_making_fee")
                                              ?? [];
                                            if (linen.length === 0) return null;
                                            const linenSub = group.biancheriaCollegata!.linenSubtotal ?? linen.reduce((s, i) => s + i.totalPrice, 0);
                                            return (
                                              <div className="mt-2 bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl p-2 sm:p-3 border border-violet-200">
                                                <p className="text-[10px] uppercase font-bold text-violet-600 mb-2">🛏️ Dettaglio biancheria</p>
                                                <div className="grid gap-1.5">
                                                  {linen.map((item, i) => (
                                                    <div key={i} className="flex items-center justify-between bg-white rounded-lg px-2.5 py-1.5 border border-violet-100 shadow-sm">
                                                      <div className="flex items-center gap-2 min-w-0">
                                                        <span className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-purple-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">{item.quantity}×</span>
                                                        <div className="min-w-0">
                                                          <span className="text-xs text-slate-800 font-medium block truncate">{item.name}</span>
                                                          <span className="text-[9px] text-slate-400">€{item.unitPrice.toFixed(2)}/pz</span>
                                                        </div>
                                                      </div>
                                                      <span className="text-xs font-bold text-violet-700 ml-2 flex-shrink-0">{formatCurrency(item.totalPrice)}</span>
                                                    </div>
                                                  ))}
                                                </div>
                                                <div className="mt-2 pt-2 border-t border-violet-200 flex justify-between items-center">
                                                  <span className="text-[10px] font-medium text-violet-600">Subtotale biancheria</span>
                                                  <span className="text-sm font-bold text-violet-700">{formatCurrency(linenSub)}</span>
                                                </div>
                                              </div>
                                            );
                                          })()}

                                          {/* SEZIONE KIT CORTESIA (solo se presente) */}
                                          {(group.biancheriaCollegata.kitItems?.length || 0) > 0 && (
                                            <div className="mt-2 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-2 sm:p-3 border border-amber-200">
                                              <p className="text-[10px] uppercase font-bold text-amber-600 mb-2">🎁 Kit cortesia</p>
                                              <div className="grid gap-1.5">
                                                {group.biancheriaCollegata.kitItems!.map((item, i) => (
                                                  <div key={i} className="flex items-center justify-between bg-white rounded-lg px-2.5 py-1.5 border border-amber-100 shadow-sm">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                      <span className="w-6 h-6 rounded-md bg-gradient-to-br from-amber-500 to-orange-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">{item.quantity}×</span>
                                                      <div className="min-w-0">
                                                        <span className="text-xs text-slate-800 font-medium block truncate">{item.name}</span>
                                                        <span className="text-[9px] text-slate-400">€{item.unitPrice.toFixed(2)}/pz</span>
                                                      </div>
                                                    </div>
                                                    <span className="text-xs font-bold text-amber-700 ml-2 flex-shrink-0">{formatCurrency(item.totalPrice)}</span>
                                                  </div>
                                                ))}
                                              </div>
                                              <div className="mt-2 pt-2 border-t border-amber-200 flex justify-between items-center">
                                                <span className="text-[10px] font-medium text-amber-600">Subtotale kit</span>
                                                <span className="text-sm font-bold text-amber-700">{formatCurrency(group.biancheriaCollegata.kitSubtotal ?? 0)}</span>
                                              </div>
                                            </div>
                                          )}

                                          {/* TOTALE COMPLESSIVO ORDINE */}
                                          <div className="mt-2 px-3 py-2 bg-slate-100 rounded-xl flex justify-between items-center">
                                            <span className="text-[11px] font-semibold text-slate-700">Totale ordine</span>
                                            <span className="text-sm font-bold text-slate-800">{formatCurrency(group.biancheriaCollegata.effectivePrice)}</span>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Altri servizi */}
                              {group.altri.map((service, sIdx) => {
                                const isBiancheria = service.type === "BIANCHERIA";
                                const hasItems = service.items && service.items.length > 0;
                                const colorClass = service.type === "BIANCHERIA" ? "from-violet-400 to-purple-500" : service.type === "KIT_CORTESIA" ? "from-amber-400 to-orange-500" : "from-emerald-400 to-teal-500";
                                const textColor = service.type === "BIANCHERIA" ? "text-violet-600" : service.type === "KIT_CORTESIA" ? "text-amber-600" : "text-emerald-600";

                                return (
                                  <div key={sIdx} className="border-t border-slate-100">
                                    {isBiancheria && hasItems ? (
                                      <button onClick={() => toggleBiancheria(service.id)} className="w-full p-2.5 sm:p-3 flex items-center gap-2 sm:gap-3 hover:bg-slate-50">
                                        <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br ${colorClass} flex items-center justify-center text-white shadow-md flex-shrink-0`}>{getServiceIcon(service.type)}</div>
                                        <div className="flex-1 min-w-0 text-left">
                                          <p className="font-semibold text-slate-800 text-sm sm:text-base">{getServiceLabel(service.type)}</p>
                                          <p className="text-[10px] sm:text-xs text-slate-500">{service.items?.length || 0} articoli</p>
                                        </div>
                                        <p className={`font-bold text-base sm:text-lg flex-shrink-0 ${textColor}`}>{formatCurrency(service.effectivePrice)}</p>
                                        <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-violet-100 flex items-center justify-center transition-transform text-violet-600 flex-shrink-0 ${expandedBiancheria.has(service.id) ? "rotate-180" : ""}`}>{Icons.chevronDown}</div>
                                      </button>
                                    ) : (
                                      <div className="p-2.5 sm:p-3 flex items-center gap-2 sm:gap-3">
                                        <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br ${colorClass} flex items-center justify-center text-white shadow-md flex-shrink-0`}>{getServiceIcon(service.type)}</div>
                                        <div className="flex-1 min-w-0">
                                          <p className="font-semibold text-slate-800 text-sm sm:text-base">{getServiceLabel(service.type)}</p>
                                          {hasItems && <p className="text-[10px] sm:text-xs text-slate-500">{service.items?.length} articoli</p>}
                                        </div>
                                        <p className={`font-bold text-base sm:text-lg flex-shrink-0 ${textColor}`}>{formatCurrency(service.effectivePrice)}</p>
                                      </div>
                                    )}

                                    {/* Dettaglio biancheria + kit cortesia (sezioni separate) */}
                                    {isBiancheria && expandedBiancheria.has(service.id) && hasItems && (
                                      <div className="mx-2 sm:mx-3 mb-3 space-y-2">
                                        {/* SEZIONE BIANCHERIA */}
                                        {(() => {
                                          const linen = service.linenItems
                                            ?? service.items?.filter(i => i.itemId !== "_delivery_fee" && i.itemId !== "_bed_making_fee")
                                            ?? [];
                                          if (linen.length === 0) return null;
                                          const linenSub = service.linenSubtotal ?? linen.reduce((s, i) => s + i.totalPrice, 0);
                                          return (
                                            <div className="bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl p-2 sm:p-3 border border-violet-200">
                                              <p className="text-[10px] uppercase font-bold text-violet-600 mb-2">🛏️ Dettaglio biancheria</p>
                                              <div className="grid gap-1.5">
                                                {linen.map((item, i) => (
                                                  <div key={i} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-violet-100 shadow-sm">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                      <span className="w-7 h-7 rounded-md bg-gradient-to-br from-violet-500 to-purple-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{item.quantity}×</span>
                                                      <div className="min-w-0">
                                                        <span className="text-sm text-slate-800 font-medium block truncate">{item.name}</span>
                                                        <span className="text-[10px] text-slate-400">€{item.unitPrice.toFixed(2)}/pz</span>
                                                      </div>
                                                    </div>
                                                    <span className="text-sm font-bold text-violet-700 ml-2 flex-shrink-0">{formatCurrency(item.totalPrice)}</span>
                                                  </div>
                                                ))}
                                              </div>
                                              <div className="mt-2 pt-2 border-t border-violet-200 flex justify-between items-center">
                                                <span className="text-xs font-medium text-violet-600">Subtotale biancheria</span>
                                                <span className="font-bold text-violet-700">{formatCurrency(linenSub)}</span>
                                              </div>
                                            </div>
                                          );
                                        })()}

                                        {/* SEZIONE KIT CORTESIA */}
                                        {(service.kitItems?.length || 0) > 0 && (
                                          <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-2 sm:p-3 border border-amber-200">
                                            <p className="text-[10px] uppercase font-bold text-amber-600 mb-2">🎁 Kit cortesia</p>
                                            <div className="grid gap-1.5">
                                              {service.kitItems!.map((item, i) => (
                                                <div key={i} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-amber-100 shadow-sm">
                                                  <div className="flex items-center gap-2 min-w-0">
                                                    <span className="w-7 h-7 rounded-md bg-gradient-to-br from-amber-500 to-orange-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{item.quantity}×</span>
                                                    <div className="min-w-0">
                                                      <span className="text-sm text-slate-800 font-medium block truncate">{item.name}</span>
                                                      <span className="text-[10px] text-slate-400">€{item.unitPrice.toFixed(2)}/pz</span>
                                                    </div>
                                                  </div>
                                                  <span className="text-sm font-bold text-amber-700 ml-2 flex-shrink-0">{formatCurrency(item.totalPrice)}</span>
                                                </div>
                                              ))}
                                            </div>
                                            <div className="mt-2 pt-2 border-t border-amber-200 flex justify-between items-center">
                                              <span className="text-xs font-medium text-amber-600">Subtotale kit</span>
                                              <span className="font-bold text-amber-700">{formatCurrency(service.kitSubtotal ?? 0)}</span>
                                            </div>
                                          </div>
                                        )}

                                        {/* TOTALE COMPLESSIVO ORDINE */}
                                        <div className="px-3 py-2 bg-slate-100 rounded-xl flex justify-between items-center">
                                          <span className="text-xs font-semibold text-slate-700">Totale ordine</span>
                                          <span className="text-sm font-bold text-slate-800">{formatCurrency(service.effectivePrice)}</span>
                                        </div>
                                      </div>
                                    )}

                                    {/* Kit Cortesia dettaglio (caso ordine standalone di solo kit) */}
                                    {service.type === "KIT_CORTESIA" && hasItems && (
                                      <div className="mx-2 sm:mx-3 mb-3 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-2 sm:p-3 border border-amber-200">
                                        <p className="text-[10px] uppercase font-bold text-amber-600 mb-2">🎁 Dettaglio kit</p>
                                        <div className="grid gap-1.5">
                                          {service.items!.map((item, i) => (
                                            <div key={i} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-amber-100 shadow-sm">
                                              <div className="flex items-center gap-2 min-w-0">
                                                <span className="w-7 h-7 rounded-md bg-gradient-to-br from-amber-500 to-orange-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{item.quantity}×</span>
                                                <span className="text-sm text-slate-800 font-medium truncate">{item.name}</span>
                                              </div>
                                              <span className="text-sm font-bold text-amber-700 ml-2 flex-shrink-0">{formatCurrency(item.totalPrice)}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Servizi Extra dettaglio */}
                                    {service.type === "SERVIZI_EXTRA" && hasItems && (
                                      <div className="mx-2 sm:mx-3 mb-3 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-2 sm:p-3 border border-emerald-200">
                                        <p className="text-[10px] uppercase font-bold text-emerald-600 mb-2">✨ Dettaglio extra</p>
                                        <div className="grid gap-1.5">
                                          {service.items!.map((item, i) => (
                                            <div key={i} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-emerald-100 shadow-sm">
                                              <div className="flex items-center gap-2 min-w-0">
                                                <span className="w-7 h-7 rounded-md bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{item.quantity}×</span>
                                                <span className="text-sm text-slate-800 font-medium truncate">{item.name}</span>
                                              </div>
                                              <span className="text-sm font-bold text-emerald-700 ml-2 flex-shrink-0">{formatCurrency(item.totalPrice)}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {hasMultiple && (
                            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                              <span className="text-xs text-slate-500 font-medium">Totale giornata</span>
                              <span className="font-bold text-slate-800">{formatCurrency(groupTotal)}</span>
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
          );
        })}

        {/* Pagamenti effettuati */}
        {!loading && stats && stats.payments.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-gradient-to-r from-emerald-50 to-white border-b border-emerald-100">
              <p className="text-sm font-semibold text-emerald-700 flex items-center gap-2">
                {Icons.check} Pagamenti effettuati
              </p>
            </div>
            <div className="p-4 space-y-2">
              {stats.payments.map((payment) => {
                const isAuto = (payment as any).isCreditTransfer === true;
                return (
                  <div key={payment.id} className={`flex items-center gap-3 p-3 rounded-xl border ${
                    isAuto ? "bg-violet-50 border-violet-200" : "bg-emerald-50 border-emerald-100"
                  }`}>
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      isAuto ? "bg-violet-100 text-violet-600" : "bg-emerald-100 text-emerald-600"
                    }`}>
                      {isAuto ? "🔄" : Icons.check}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className={`font-semibold ${isAuto ? "text-violet-700" : "text-emerald-700"}`}>
                          {formatCurrency(payment.amount)}
                        </p>
                        {isAuto && (
                          <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 bg-violet-200 text-violet-800 rounded">
                            Acconto da credito
                          </span>
                        )}
                      </div>
                      <p className={`text-xs ${isAuto ? "text-violet-600" : "text-emerald-600"} truncate`}>
                        {payment.method}{payment.note && ` • ${payment.note}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Riepilogo totali */}
        {!loading && stats && stats.services.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-slate-100 rounded-xl p-3">
                <p className="text-xs text-slate-500">Totale</p>
                <p className="font-bold text-slate-800">{formatCurrency(stats.totaleEffettivo)}</p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-3">
                <p className="text-xs text-emerald-600">Pagato</p>
                <p className="font-bold text-emerald-700">{formatCurrency(stats.totalePagato)}</p>
              </div>
              <div className={`rounded-xl p-3 ${stats.saldo > 0 ? "bg-red-50" : "bg-emerald-50"}`}>
                <p className={`text-xs ${stats.saldo > 0 ? "text-red-600" : "text-emerald-600"}`}>Saldo</p>
                <p className={`font-bold ${stats.saldo > 0 ? "text-red-700" : "text-emerald-700"}`}>{formatCurrency(stats.saldo)}</p>
              </div>
            </div>

            {/* Stato badge */}
            <div className="mt-3 flex justify-center">
              {stats.stato === "SALDATO" ? (
                <div className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-xl text-sm font-semibold flex items-center gap-2">
                  {Icons.check} Tutto saldato
                </div>
              ) : stats.stato === "PARZIALE" ? (
                <div className="px-4 py-2 bg-amber-100 text-amber-700 rounded-xl text-sm font-semibold flex items-center gap-2">
                  {Icons.wallet} Pagamento parziale
                </div>
              ) : (
                <div className="px-4 py-2 bg-red-100 text-red-700 rounded-xl text-sm font-semibold flex items-center gap-2">
                  {Icons.alertTriangle} Da pagare: {formatCurrency(stats.saldo)}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ═══ MODAL RIEPILOGO ═══ */}
      {showRiepilogo && stats && summary && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]" onClick={() => setShowRiepilogo(false)} />
          <div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
              {/* Header modal */}
              <div className="relative overflow-hidden" style={{ background: "#0b0b18" }}>
                <div className="absolute inset-0" style={{ backgroundImage: "url('/pagamenti-banner.jpg')", backgroundSize: "cover", backgroundPosition: "center", opacity: 0.3 }} />
                <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(11,11,24,0.3) 0%, rgba(11,11,24,0.85) 100%)" }} />
                <div className="relative z-10 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-slate-400 text-[10px] uppercase tracking-wider">Scarica</p>
                      <h2 className="text-lg font-bold text-white">Riepilogo Pagamenti</h2>
                    </div>
                    <button onClick={() => setShowRiepilogo(false)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/80 text-xs font-medium">
                      {MONTHS_SHORT[selectedMonth - 1]} {selectedYear}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/80 text-xs font-medium">
                      {stats.statsByProperty.length} proprietà
                    </span>
                    {stats.cleaningsCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/80 text-xs font-medium">
                        {stats.cleaningsCount} {stats.cleaningsCount === 1 ? "pulizia" : "pulizie"}
                      </span>
                    )}
                    {(() => {
                      const ordiniCount = stats.ordersCount + stats.kitCortesiaCount + stats.serviziExtraCount;
                      return ordiniCount > 0 ? (
                        <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/80 text-xs font-medium">
                          {ordiniCount} {ordiniCount === 1 ? "ordine" : "ordini"}
                        </span>
                      ) : null;
                    })()}
                  </div>
                </div>
              </div>

              {/* Riepilogo veloce */}
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-50 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-slate-500 uppercase font-semibold">Totale</p>
                    <p className="text-sm font-bold text-slate-800">{formatCurrency(summary.totaleServizi)}</p>
                  </div>
                  <div className="bg-emerald-50 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-emerald-600 uppercase font-semibold">Pagato</p>
                    <p className="text-sm font-bold text-emerald-700">{formatCurrency(summary.totalePagato)}</p>
                  </div>
                  <div className="bg-red-50 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-red-500 uppercase font-semibold">Dovuto</p>
                    <p className="text-sm font-bold text-red-700">{formatCurrency(summary.totaleDovuto)}</p>
                  </div>
                </div>

                <p className="text-[10px] text-slate-400 text-center mt-1">Importi IVA esclusa</p>

                {/* Bottoni download */}
                <div className="space-y-2 pt-1">
                  <button
                    onClick={async () => {
                      setDownloadingPdf(true);
                      try {
                        await generatePDF(stats, summary, selectedMonth, selectedYear);
                      } catch (err) { console.error("PDF error:", err); }
                      setDownloadingPdf(false);
                    }}
                    disabled={downloadingPdf}
                    className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl bg-gradient-to-r from-red-500 to-rose-600 text-white font-semibold shadow-lg shadow-red-200 hover:shadow-red-300 transition-all active:scale-[0.98] disabled:opacity-60"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold">Scarica PDF</p>
                        <p className="text-[10px] text-white/70">Riepilogo formattato con intestazione</p>
                      </div>
                    </div>
                    {downloadingPdf ? (
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    )}
                  </button>

                  <button
                    onClick={async () => {
                      setDownloadingXlsx(true);
                      try {
                        await generateXLSX(stats, summary, selectedMonth, selectedYear);
                      } catch (err) { console.error("XLSX error:", err); }
                      setDownloadingXlsx(false);
                    }}
                    disabled={downloadingXlsx}
                    className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold shadow-lg shadow-emerald-200 hover:shadow-emerald-300 transition-all active:scale-[0.98] disabled:opacity-60"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold">Scarica Excel</p>
                        <p className="text-[10px] text-white/70">Foglio con riepilogo e dettagli</p>
                      </div>
                    </div>
                    {downloadingXlsx ? (
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
