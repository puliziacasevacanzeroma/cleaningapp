"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { collection, query, where, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

// ==================== TYPES ====================

interface Cleaning {
  id: string;
  propertyId: string;
  propertyName: string;
  propertyAddress?: string;
  scheduledDate: Timestamp;
  scheduledTime?: string;
  completedAt?: Timestamp;
  startedAt?: Timestamp;
  status: string;
  type?: string;
  notes?: string;
  guestCount?: number;
  checkoutTime?: string;
  checkinTime?: string;
  operatorId?: string;
  operators?: { id: string; name: string }[];
}

interface OperatorPayment {
  id: string;
  operatorId: string;
  operatorName: string;
  month: number;
  year: number;
  amount: number;
  cleaningsCount?: number;
  note?: string;
  method?: string;
  createdAt: Timestamp;
}

// ==================== HELPERS ====================

const MONTHS = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(amount);
}

function formatDate(date: Date | Timestamp | any): string {
  if (!date) return "-";
  try {
    let d: Date;
    if (date instanceof Date) d = date;
    else if (date?.toDate) d = date.toDate();
    else if (date?.seconds) d = new Date(date.seconds * 1000);
    else return "-";
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
  } catch { return "-"; }
}

function formatFullDate(date: Date | Timestamp | any): string {
  if (!date) return "-";
  try {
    let d: Date;
    if (date instanceof Date) d = date;
    else if (date?.toDate) d = date.toDate();
    else if (date?.seconds) d = new Date(date.seconds * 1000);
    else return "-";
    return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  } catch { return "-"; }
}

function formatTime(date: Date | Timestamp | any): string {
  if (!date) return "-";
  try {
    let d: Date;
    if (date instanceof Date) d = date;
    else if (date?.toDate) d = date.toDate();
    else if (date?.seconds) d = new Date(date.seconds * 1000);
    else return "-";
    return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  } catch { return "-"; }
}

function getCleaningTypeLabel(type?: string): string {
  switch (type?.toLowerCase()) {
    case "checkout": return "Checkout";
    case "checkin": return "Check-in";
    case "checkout_checkin": return "Checkout + Check-in";
    case "deep": return "Pulizia profonda";
    case "maintenance": return "Manutenzione";
    default: return "Standard";
  }
}

// ==================== MAIN COMPONENT ====================

export default function PagamentiOperatorePage() {
  const { user } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  // 🔄 Assume mobile su SSR - nessun flash
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.innerWidth < 1024;
  });
  const [selectedCleaning, setSelectedCleaning] = useState<Cleaning | null>(null);
  const [activeTab, setActiveTab] = useState<"pulizie" | "pagamenti">("pulizie");

  // Realtime data
  const [cleanings, setCleanings] = useState<Cleaning[]>([]);
  const [payments, setPayments] = useState<OperatorPayment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ==================== REALTIME LISTENERS ====================

  // Listener Pulizie
  useEffect(() => {
    if (!user?.id) return;

    const unsubscribe = onSnapshot(collection(db, "cleanings"), (snapshot) => {
      const allCleanings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Cleaning[];
      const filtered = allCleanings.filter((c) => {
        const operators = c.operators || [];
        const isInArray = operators.some((op) => op.id === user?.id);
        const isOperatorId = c.operatorId === user?.id;
        return isInArray || isOperatorId;
      });
      setCleanings(filtered);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user?.id]);

  // Listener Pagamenti Operatore
  useEffect(() => {
    if (!user?.id) return;

    const q = query(
      collection(db, "operatorPayments"),
      where("operatorId", "==", user.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as OperatorPayment[];
      setPayments(data);
    });

    return () => unsubscribe();
  }, [user?.id]);

  // ==================== COMPUTED DATA ====================

  const computedStats = useMemo(() => {
    const startOfMonth = new Date(selectedYear, selectedMonth - 1, 1, 0, 0, 0);
    const endOfMonth = new Date(selectedYear, selectedMonth, 0, 23, 59, 59);

    // Pulizie del mese
    const monthCleanings = cleanings.filter(c => {
      const date = c.scheduledDate?.toDate?.();
      if (!date) return false;
      return date >= startOfMonth && date <= endOfMonth;
    });

    // Statistiche
    const completed = monthCleanings.filter(c => c.status === "COMPLETED");
    const inProgress = monthCleanings.filter(c => c.status === "IN_PROGRESS");
    const scheduled = monthCleanings.filter(c => c.status === "ASSIGNED" || c.status === "SCHEDULED");

    // Pagamenti del mese
    const monthPayments = payments.filter(p => p.month === selectedMonth && p.year === selectedYear);
    const totalReceived = monthPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

    // Ordina per data
    const sortedCleanings = [...monthCleanings].sort((a, b) => {
      const dateA = a.scheduledDate?.toDate?.() || new Date(0);
      const dateB = b.scheduledDate?.toDate?.() || new Date(0);
      return dateB.getTime() - dateA.getTime();
    });

    return {
      cleanings: sortedCleanings,
      total: monthCleanings.length,
      completed: completed.length,
      inProgress: inProgress.length,
      scheduled: scheduled.length,
      payments: monthPayments,
      totalReceived,
    };
  }, [cleanings, payments, selectedMonth, selectedYear]);

  // Navigation
  const goToPrevMonth = () => {
    if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear(selectedYear - 1); }
    else { setSelectedMonth(selectedMonth - 1); }
    setSelectedCleaning(null);
  };

  const goToNextMonth = () => {
    if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear(selectedYear + 1); }
    else { setSelectedMonth(selectedMonth + 1); }
    setSelectedCleaning(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto mb-4"></div>
          <p className="text-slate-600">Caricamento dati...</p>
        </div>
      </div>
    );
  }

  // ==================== MOBILE VIEW ====================
  if (isMobile) {
    return (
      <div className="p-4 pb-8">
        {/* Header */}
        <div className="bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 text-white rounded-2xl p-5 mb-5 shadow-xl shadow-emerald-500/20">
          <h1 className="text-xl font-bold mb-1">Riepilogo Attività</h1>
          <p className="text-emerald-100 text-sm">Storico pulizie e pagamenti</p>

          {/* Month Navigator */}
          <div className="flex items-center justify-between bg-white/15 rounded-xl p-2 mt-4">
            <button onClick={goToPrevMonth} className="p-2 hover:bg-white/10 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="font-semibold">{MONTHS[selectedMonth - 1]} {selectedYear}</span>
            <button onClick={goToNextMonth} className="p-2 hover:bg-white/10 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-white rounded-xl p-3 text-center shadow-sm border border-slate-100">
            <p className="text-2xl font-bold text-slate-800">{computedStats.total}</p>
            <p className="text-xs text-slate-500">Totali</p>
          </div>
          <div className="bg-white rounded-xl p-3 text-center shadow-sm border border-emerald-100">
            <p className="text-2xl font-bold text-emerald-600">{computedStats.completed}</p>
            <p className="text-xs text-slate-500">Completate</p>
          </div>
          <div className="bg-white rounded-xl p-3 text-center shadow-sm border border-amber-100">
            <p className="text-2xl font-bold text-amber-600">{computedStats.scheduled}</p>
            <p className="text-xs text-slate-500">Programmate</p>
          </div>
        </div>

        {/* Payment Summary */}
        {computedStats.totalReceived > 0 && (
          <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-4 mb-5 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Pagamenti ricevuti</p>
                <p className="text-2xl font-bold">{formatCurrency(computedStats.totalReceived)}</p>
              </div>
              <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab("pulizie")}
            className={`flex-1 py-2.5 rounded-xl font-medium text-sm transition-all ${
              activeTab === "pulizie"
                ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                : "bg-white text-slate-600 border border-slate-200"
            }`}
          >
            🧹 Pulizie ({computedStats.total})
          </button>
          <button
            onClick={() => setActiveTab("pagamenti")}
            className={`flex-1 py-2.5 rounded-xl font-medium text-sm transition-all ${
              activeTab === "pagamenti"
                ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                : "bg-white text-slate-600 border border-slate-200"
            }`}
          >
            💳 Pagamenti ({computedStats.payments.length})
          </button>
        </div>

        {/* Content */}
        {activeTab === "pulizie" ? (
          <div className="space-y-3">
            {computedStats.cleanings.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center border border-slate-100">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-3xl">📭</span>
                </div>
                <p className="font-semibold text-slate-800">Nessuna pulizia</p>
                <p className="text-sm text-slate-500 mt-1">Non hai pulizie per questo mese</p>
              </div>
            ) : (
              computedStats.cleanings.map((cleaning) => (
                <div
                  key={cleaning.id}
                  onClick={() => setSelectedCleaning(selectedCleaning?.id === cleaning.id ? null : cleaning)}
                  className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm active:scale-[0.99] transition-transform"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-semibold text-slate-800">{cleaning.propertyName}</p>
                      <p className="text-sm text-slate-500 mt-0.5">{formatDate(cleaning.scheduledDate)} • {cleaning.scheduledTime || "10:00"}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      cleaning.status === "COMPLETED" ? "bg-emerald-100 text-emerald-700" :
                      cleaning.status === "IN_PROGRESS" ? "bg-amber-100 text-amber-700" :
                      "bg-slate-100 text-slate-600"
                    }`}>
                      {cleaning.status === "COMPLETED" ? "✓ Fatto" :
                       cleaning.status === "IN_PROGRESS" ? "In corso" : "Assegnata"}
                    </span>
                  </div>

                  {selectedCleaning?.id === cleaning.id && (
                    <div className="mt-4 pt-4 border-t border-slate-100 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Tipo</span>
                        <span className="font-medium">{getCleaningTypeLabel(cleaning.type)}</span>
                      </div>
                      {cleaning.propertyAddress && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Indirizzo</span>
                          <span className="font-medium text-right max-w-[60%]">{cleaning.propertyAddress}</span>
                        </div>
                      )}
                      {cleaning.guestCount && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Ospiti</span>
                          <span className="font-medium">{cleaning.guestCount}</span>
                        </div>
                      )}
                      {cleaning.completedAt && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Completata</span>
                          <span className="font-medium text-emerald-600">{formatTime(cleaning.completedAt)}</span>
                        </div>
                      )}
                      {cleaning.notes && (
                        <div className="bg-slate-50 rounded-lg p-3 mt-2">
                          <p className="text-xs text-slate-500 mb-1">Note</p>
                          <p className="text-slate-700">{cleaning.notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {computedStats.payments.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center border border-slate-100">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-3xl">💳</span>
                </div>
                <p className="font-semibold text-slate-800">Nessun pagamento</p>
                <p className="text-sm text-slate-500 mt-1">Non ci sono pagamenti per questo mese</p>
              </div>
            ) : (
              computedStats.payments.map((payment) => (
                <div key={payment.id} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500">{formatFullDate(payment.createdAt)}</p>
                      {payment.method && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          {payment.method === "BONIFICO" ? "🏦 Bonifico" : payment.method === "CONTANTI" ? "💵 Contanti" : "📝 " + payment.method}
                        </p>
                      )}
                    </div>
                    <span className="text-xl font-bold text-emerald-600">{formatCurrency(payment.amount)}</span>
                  </div>
                  {payment.note && (
                    <p className="text-sm text-slate-500 mt-2 pt-2 border-t border-slate-100">{payment.note}</p>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    );
  }

  // ==================== DESKTOP VIEW ====================
  return (
    <div className="p-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 rounded-2xl p-8 mb-8 shadow-xl shadow-emerald-500/20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Riepilogo Attività</h1>
            <p className="text-emerald-100 mt-1">Storico completo delle tue pulizie e pagamenti</p>
          </div>
          
          <div className="flex items-center gap-4 bg-white/15 rounded-xl px-5 py-3">
            <button onClick={goToPrevMonth} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-xl font-semibold text-white min-w-[180px] text-center">
              {MONTHS[selectedMonth - 1]} {selectedYear}
            </span>
            <button onClick={goToNextMonth} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mt-6">
          <div className="bg-white/15 rounded-xl p-4">
            <p className="text-emerald-100 text-sm">Totale pulizie</p>
            <p className="text-3xl font-bold text-white">{computedStats.total}</p>
          </div>
          <div className="bg-white/15 rounded-xl p-4">
            <p className="text-emerald-100 text-sm">Completate</p>
            <p className="text-3xl font-bold text-white">{computedStats.completed}</p>
          </div>
          <div className="bg-white/15 rounded-xl p-4">
            <p className="text-emerald-100 text-sm">Programmate</p>
            <p className="text-3xl font-bold text-white">{computedStats.scheduled}</p>
          </div>
          <div className="bg-white/15 rounded-xl p-4">
            <p className="text-emerald-100 text-sm">Pagamenti ricevuti</p>
            <p className="text-3xl font-bold text-white">{formatCurrency(computedStats.totalReceived)}</p>
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-3 gap-6">
        {/* Col 1: Cleanings List */}
        <div className="col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100 bg-slate-50">
            <h2 className="text-lg font-bold text-slate-800">🧹 Pulizie del mese</h2>
            <p className="text-sm text-slate-500 mt-1">{computedStats.total} pulizie in {MONTHS[selectedMonth - 1]}</p>
          </div>

          {computedStats.cleanings.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">📭</span>
              </div>
              <p className="text-xl font-semibold text-slate-800">Nessuna pulizia</p>
              <p className="text-slate-500 mt-1">Non hai pulizie assegnate per questo mese</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
              {computedStats.cleanings.map((cleaning) => (
                <div
                  key={cleaning.id}
                  className={`p-5 hover:bg-slate-50 transition-colors cursor-pointer ${
                    selectedCleaning?.id === cleaning.id ? "bg-emerald-50" : ""
                  }`}
                  onClick={() => setSelectedCleaning(selectedCleaning?.id === cleaning.id ? null : cleaning)}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      cleaning.status === "COMPLETED" ? "bg-emerald-100" :
                      cleaning.status === "IN_PROGRESS" ? "bg-amber-100" : "bg-slate-100"
                    }`}>
                      <span className="text-xl">
                        {cleaning.status === "COMPLETED" ? "✓" :
                         cleaning.status === "IN_PROGRESS" ? "🔄" : "📋"}
                      </span>
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-slate-800">{cleaning.propertyName}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          cleaning.status === "COMPLETED" ? "bg-emerald-100 text-emerald-700" :
                          cleaning.status === "IN_PROGRESS" ? "bg-amber-100 text-amber-700" :
                          "bg-slate-100 text-slate-600"
                        }`}>
                          {cleaning.status === "COMPLETED" ? "Completata" :
                           cleaning.status === "IN_PROGRESS" ? "In corso" : "Assegnata"}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          {formatFullDate(cleaning.scheduledDate)}
                        </span>
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {cleaning.scheduledTime || "10:00"}
                        </span>
                        <span className="text-slate-400">•</span>
                        <span>{getCleaningTypeLabel(cleaning.type)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {selectedCleaning?.id === cleaning.id && (
                    <div className="mt-5 pt-5 border-t border-slate-200 grid grid-cols-2 gap-4">
                      {cleaning.propertyAddress && (
                        <div className="col-span-2">
                          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Indirizzo</p>
                          <p className="text-slate-800">{cleaning.propertyAddress}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Tipo pulizia</p>
                        <p className="text-slate-800 font-medium">{getCleaningTypeLabel(cleaning.type)}</p>
                      </div>
                      {cleaning.guestCount && (
                        <div>
                          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Numero ospiti</p>
                          <p className="text-slate-800 font-medium">{cleaning.guestCount}</p>
                        </div>
                      )}
                      {cleaning.checkoutTime && (
                        <div>
                          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Checkout</p>
                          <p className="text-slate-800 font-medium">{cleaning.checkoutTime}</p>
                        </div>
                      )}
                      {cleaning.checkinTime && (
                        <div>
                          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Check-in</p>
                          <p className="text-slate-800 font-medium">{cleaning.checkinTime}</p>
                        </div>
                      )}
                      {cleaning.startedAt && (
                        <div>
                          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Iniziata alle</p>
                          <p className="text-slate-800 font-medium">{formatTime(cleaning.startedAt)}</p>
                        </div>
                      )}
                      {cleaning.completedAt && (
                        <div>
                          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Completata alle</p>
                          <p className="text-emerald-600 font-medium">{formatTime(cleaning.completedAt)}</p>
                        </div>
                      )}
                      {cleaning.notes && (
                        <div className="col-span-2 bg-slate-50 rounded-xl p-4">
                          <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">Note</p>
                          <p className="text-slate-700">{cleaning.notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Col 2: Payments */}
        <div className="space-y-6">
          {/* Payment Summary */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-300">Pagamenti del mese</h3>
              <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <p className="text-4xl font-bold">{formatCurrency(computedStats.totalReceived)}</p>
            <p className="text-slate-400 text-sm mt-2">{computedStats.payments.length} pagamenti ricevuti</p>
          </div>

          {/* Payments List */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-slate-800">💳 Storico pagamenti</h3>
            </div>

            {computedStats.payments.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl">💳</span>
                </div>
                <p className="font-medium text-slate-800">Nessun pagamento</p>
                <p className="text-sm text-slate-500 mt-1">Non ci sono pagamenti per questo mese</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
                {computedStats.payments.map((payment) => (
                  <div key={payment.id} className="p-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-sm text-slate-500">{formatFullDate(payment.createdAt)}</p>
                        {payment.method && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            {payment.method === "BONIFICO" ? "🏦 Bonifico bancario" : 
                             payment.method === "CONTANTI" ? "💵 Contanti" : "📝 " + payment.method}
                          </p>
                        )}
                      </div>
                      <span className="text-xl font-bold text-emerald-600">{formatCurrency(payment.amount)}</span>
                    </div>
                    {payment.note && (
                      <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600">
                        {payment.note}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200">
            <h4 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Informazioni
            </h4>
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5">•</span>
                <span>I pagamenti vengono elaborati dall'amministrazione</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5">•</span>
                <span>Clicca su una pulizia per vedere i dettagli completi</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5">•</span>
                <span>Per domande contatta l'amministratore</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
