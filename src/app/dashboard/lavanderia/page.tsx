"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, query, where, onSnapshot, doc, setDoc, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { getItemName } from "~/lib/itemNames";

// ═══════════════════════════════════════
// SOLO BIANCHERIA — esclude kit cortesia, prodotti pulizia, etc.
// ═══════════════════════════════════════
const LINEN_ITEM_IDS = new Set([
  'doubleSheets', 'singleSheets', 'pillowcases', 'copripiumino',
  'item_doubleSheets', 'item_singleSheets', 'item_pillowcases', 'item_copripiumino',
  'lenzuola_matrimoniale', 'lenzuola_singolo', 'federa',
  'towelsLarge', 'towelsSmall', 'towelsFace', 'bathMats',
  'item_towelsLarge', 'item_towelsSmall', 'item_towelsFace', 'item_bathMats',
  'asciugamano_grande', 'asciugamano_piccolo', 'asciugamano_viso',
  'asciugamano_ospite', 'telo_doccia', 'tappetino_bagno',
]);

const LINEN_NAMES = new Set([
  'Lenzuola Matrimoniali', 'Lenzuola Singole', 'Federe', 'Copripiumino',
  'Telo Doccia', 'Asciugamano Bidet', 'Asciugamano Viso', 'Tappetino Scendibagno',
]);

function isLinenItem(item: { id: string; name: string }): boolean {
  return LINEN_ITEM_IDS.has(item.id) || LINEN_ITEM_IDS.has(item.name) || LINEN_NAMES.has(item.name) || LINEN_NAMES.has(getItemName(item.id || item.name));
}

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
}

interface Order {
  id: string;
  items: OrderItem[];
  status: string;
  scheduledDate: Date;
}

interface DayAdjustment {
  percentageOverride?: number;
  itemOverrides?: Record<string, number>;
}

interface LaundryDelivery {
  id: string;
  dateKey: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  requestedItems: Record<string, number>;
  deliveredItems: Record<string, number>;
  completedByName: string | null;
  startedByName: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  inventoryApplied: boolean;
}

const MONTH_NAMES = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

export default function AdminLavanderiaPage() {
  // ═══ TAB STATE ═══
  const [activeTab, setActiveTab] = useState<"gestione" | "storico">("gestione");

  // ═══ GESTIONE TAB STATE ═══
  const [ordersByDay, setOrdersByDay] = useState<Record<string, Order[]>>({});
  const [adjustments, setAdjustments] = useState<Record<string, DayAdjustment>>({});
  const [defaultPercentage, setDefaultPercentage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [editPercentage, setEditPercentage] = useState(0);
  const [editItemOverrides, setEditItemOverrides] = useState<Record<string, string>>({});
  const [successMsg, setSuccessMsg] = useState("");
  const daysToShow = 7;

  // ═══ STORICO TAB STATE ═══
  const [deliveries, setDeliveries] = useState<LaundryDelivery[]>([]);
  const [loadingStorico, setLoadingStorico] = useState(false);
  const [storicoLoaded, setStoricoLoaded] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [expandedDelivery, setExpandedDelivery] = useState<string | null>(null);

  function formatDateKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function formatDateLabel(key: string): string {
    const [y, m, d] = key.split("-").map(Number);
    const date = new Date(y!, m! - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (date.getTime() === today.getTime()) return "Oggi";
    if (date.getTime() === tomorrow.getTime()) return "Domani";
    return date.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
  }

  function formatFullDate(key: string): string {
    const [y, m, d] = key.split("-").map(Number);
    const date = new Date(y!, m! - 1, d);
    return date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  }

  const getDayKeys = () => {
    const keys: string[] = [];
    for (let i = 0; i < daysToShow; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      keys.push(formatDateKey(d));
    }
    return keys;
  };

  // ═══════════════════════════════════════
  // LISTENERS GESTIONE
  // ═══════════════════════════════════════

  useEffect(() => {
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + daysToShow);
    endDate.setHours(23, 59, 59, 999);

    const ordersQuery = query(
      collection(db, "orders"),
      where("scheduledDate", ">=", Timestamp.fromDate(startDate)),
      where("scheduledDate", "<=", Timestamp.fromDate(endDate))
    );

    const unsubscribe = onSnapshot(ordersQuery, (snapshot) => {
      const grouped: Record<string, Order[]> = {};
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data() as Record<string, any>;
        if (data.status === "DELIVERED" || data.status === "COMPLETED" || data.status === "CANCELLED") return;
        const scheduledDate = data.scheduledDate?.toDate?.() || new Date(data.scheduledDate);
        const key = formatDateKey(scheduledDate);
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push({
          id: docSnap.id,
          items: data.items || [],
          status: data.status,
          scheduledDate,
        });
      });
      setOrdersByDay(grouped);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [daysToShow]);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "settings", "laundryAdjustments"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as Record<string, any>;
        setAdjustments(data.days || {});
        setDefaultPercentage(data.defaultPercentage || 0);
      }
    });
    return () => unsubscribe();
  }, []);

  // ═══════════════════════════════════════
  // LISTENER STORICO CONSEGNE LAVANDERIA (lazy load)
  // ═══════════════════════════════════════
  useEffect(() => {
    if (activeTab !== "storico" || storicoLoaded) return;
    setLoadingStorico(true);

    const unsubscribe = onSnapshot(
      collection(db, "laundryDeliveries"),
      (snapshot) => {
        const list: LaundryDelivery[] = [];
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data() as Record<string, any>;
          list.push({
            id: docSnap.id,
            dateKey: data.dateKey || docSnap.id,
            status: data.status || "PENDING",
            requestedItems: data.requestedItems || {},
            deliveredItems: data.deliveredItems || {},
            completedByName: data.completedByName || null,
            startedByName: data.startedByName || null,
            startedAt: data.startedAt?.toDate?.() || null,
            completedAt: data.completedAt?.toDate?.() || null,
            inventoryApplied: data.inventoryApplied || false,
          });
        });
        // Ordina per dateKey desc
        list.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
        setDeliveries(list);
        setLoadingStorico(false);
        setStoricoLoaded(true);
      }
    );

    return () => unsubscribe();
  }, [activeTab, storicoLoaded]);

  // ═══════════════════════════════════════
  // LOGICA GESTIONE
  // ═══════════════════════════════════════

  const getRawTotals = (dayKey: string) => {
    const orders = ordersByDay[dayKey] || [];
    const totals = new Map<string, number>();
    orders.forEach((order) => {
      order.items?.forEach((item) => {
        if (!isLinenItem(item)) return;
        const translated = getItemName(item.id || item.name);
        const name = translated !== (item.id || item.name) ? translated : item.name;
        totals.set(name, (totals.get(name) || 0) + item.quantity);
      });
    });
    return totals;
  };

  const getFinalTotals = (dayKey: string) => {
    const totals = getRawTotals(dayKey);
    const adj = adjustments[dayKey];
    const effectivePct = adj?.percentageOverride !== undefined ? adj.percentageOverride : defaultPercentage;

    if (effectivePct !== 0) {
      for (const [name, qty] of totals) {
        if (!adj?.itemOverrides || adj.itemOverrides[name] === undefined) {
          totals.set(name, Math.round(qty * (1 + effectivePct / 100)));
        }
      }
    }

    if (adj?.itemOverrides) {
      for (const [itemName, overrideQty] of Object.entries(adj.itemOverrides)) {
        totals.set(itemName, overrideQty);
      }
    }

    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  };

  const handleSaveDefault = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "laundryAdjustments"), {
        defaultPercentage,
        days: adjustments,
        updatedAt: Timestamp.now(),
      }, { merge: true });
      showSuccess("Percentuale default salvata");
    } catch (e) {
      console.error("Errore salvataggio:", e);
      alert("Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const openDayEditor = (dayKey: string) => {
    const adj = adjustments[dayKey];
    setEditingDay(dayKey);
    setEditPercentage(adj?.percentageOverride !== undefined ? adj.percentageOverride : defaultPercentage);
    const raw = getRawTotals(dayKey);
    const overrides: Record<string, string> = {};
    for (const [name] of raw) {
      if (adj?.itemOverrides && adj.itemOverrides[name] !== undefined) {
        overrides[name] = String(adj.itemOverrides[name]);
      } else {
        overrides[name] = "";
      }
    }
    setEditItemOverrides(overrides);
  };

  const handleSaveDay = async () => {
    if (!editingDay) return;
    setSaving(true);
    try {
      const itemOverrides: Record<string, number> = {};
      for (const [name, val] of Object.entries(editItemOverrides)) {
        if (val !== "" && !isNaN(Number(val))) {
          itemOverrides[name] = Number(val);
        }
      }

      const newAdj: DayAdjustment = {};
      if (editPercentage !== defaultPercentage) {
        newAdj.percentageOverride = editPercentage;
      }
      if (Object.keys(itemOverrides).length > 0) {
        newAdj.itemOverrides = itemOverrides;
      }

      const newDays = { ...adjustments };
      if (Object.keys(newAdj).length > 0) {
        newDays[editingDay] = newAdj;
      } else {
        delete newDays[editingDay];
      }

      await setDoc(doc(db, "settings", "laundryAdjustments"), {
        defaultPercentage,
        days: newDays,
        updatedAt: Timestamp.now(),
      });

      showSuccess(`Modifiche per ${formatDateLabel(editingDay)} salvate`);
      setEditingDay(null);
    } catch (e) {
      console.error("Errore salvataggio:", e);
      alert("Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const handleResetDay = async (dayKey: string) => {
    setSaving(true);
    try {
      const newDays = { ...adjustments };
      delete newDays[dayKey];
      await setDoc(doc(db, "settings", "laundryAdjustments"), {
        defaultPercentage,
        days: newDays,
        updatedAt: Timestamp.now(),
      });
      showSuccess(`${formatDateLabel(dayKey)} ripristinato al default`);
    } catch (e) {
      console.error("Errore:", e);
    } finally {
      setSaving(false);
    }
  };

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 3000);
  };

  // ═══════════════════════════════════════
  // LOGICA STORICO CONSEGNE
  // ═══════════════════════════════════════

  const filteredDeliveries = useMemo(() => {
    const { year, month } = selectedMonth;
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    return deliveries.filter((d) => d.dateKey.startsWith(prefix));
  }, [deliveries, selectedMonth]);

  const monthlyStats = useMemo(() => {
    const totalsRequested = new Map<string, number>();
    const totalsDelivered = new Map<string, number>();
    let totalRequestedPieces = 0;
    let totalDeliveredPieces = 0;
    let completedCount = 0;
    let inProgressCount = 0;
    let pendingCount = 0;

    filteredDeliveries.forEach((d) => {
      if (d.status === "COMPLETED") completedCount++;
      else if (d.status === "IN_PROGRESS") inProgressCount++;
      else pendingCount++;

      Object.entries(d.requestedItems).forEach(([name, qty]) => {
        totalsRequested.set(name, (totalsRequested.get(name) || 0) + qty);
        totalRequestedPieces += qty;
      });

      if (d.status === "COMPLETED") {
        Object.entries(d.deliveredItems).forEach(([name, qty]) => {
          totalsDelivered.set(name, (totalsDelivered.get(name) || 0) + qty);
          totalDeliveredPieces += qty;
        });
      }
    });

    return {
      itemsRequested: Array.from(totalsRequested.entries()).sort((a, b) => b[1] - a[1]),
      itemsDelivered: Array.from(totalsDelivered.entries()).sort((a, b) => b[1] - a[1]),
      totalRequestedPieces,
      totalDeliveredPieces,
      totalDeliveries: filteredDeliveries.length,
      completedCount,
      inProgressCount,
      pendingCount,
    };
  }, [filteredDeliveries]);

  const prevMonth = () => setSelectedMonth((prev) => prev.month === 0 ? { year: prev.year - 1, month: 11 } : { ...prev, month: prev.month - 1 });
  const nextMonth = () => {
    const now = new Date();
    const next = selectedMonth.month === 11 ? { year: selectedMonth.year + 1, month: 0 } : { ...selectedMonth, month: selectedMonth.month + 1 };
    if (next.year > now.getFullYear() || (next.year === now.getFullYear() && next.month > now.getMonth())) return;
    setSelectedMonth(next);
  };
  const isCurrentMonth = selectedMonth.year === new Date().getFullYear() && selectedMonth.month === new Date().getMonth();

  const dayKeys = getDayKeys();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-10 h-10 border-3 border-slate-200 border-t-indigo-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Gestione Lavanderia</h1>
          <p className="text-slate-500 text-sm mt-1">Configura le quantit&agrave; e consulta lo storico consegne</p>
        </div>
        <a
          href="/dashboard/utenti/lavanderia"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:shadow-lg"
          style={{ background: "linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)", boxShadow: "0 4px 12px rgba(124,58,237,0.3)" }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          Gestisci Utenti Lavanderia
        </a>
      </div>

      {/* Success toast */}
      {successMsg && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-500 text-white px-5 py-3 rounded-xl shadow-lg font-semibold text-sm animate-pulse">
          &#10003; {successMsg}
        </div>
      )}

      {/* ═══ TABS ═══ */}
      <div className="flex gap-2 mb-6 bg-white rounded-2xl p-1.5" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
        <button
          onClick={() => setActiveTab("gestione")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === "gestione" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/25" : "text-slate-400 hover:text-slate-600"}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          Gestione
        </button>
        <button
          onClick={() => setActiveTab("storico")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === "storico" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/25" : "text-slate-400 hover:text-slate-600"}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Storico Consegne
        </button>
      </div>

      {/* ═══════════════════════════════════════ */}
      {/* TAB: GESTIONE LAVANDERIA              */}
      {/* ═══════════════════════════════════════ */}
      {activeTab === "gestione" && (
        <>
          {/* Default percentage */}
          <div className="bg-white rounded-2xl p-5 mb-6" style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-800">Percentuale Default Giornaliera</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Ogni giorno verr&agrave; aggiunto automaticamente questa % alla biancheria base.
                  Es: +20% = se servono 100 lenzuola, ne verranno mostrate 120.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 bg-slate-50 rounded-xl px-1">
                  <button onClick={() => setDefaultPercentage(Math.max(-50, defaultPercentage - 5))} className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-slate-200 transition-colors text-lg font-bold text-slate-600">&minus;</button>
                  <input type="number" value={defaultPercentage} onChange={(e) => setDefaultPercentage(Number(e.target.value))} className="w-16 text-center text-lg font-bold text-indigo-700 bg-transparent outline-none" />
                  <span className="text-lg font-bold text-indigo-700 mr-1">%</span>
                  <button onClick={() => setDefaultPercentage(Math.min(100, defaultPercentage + 5))} className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-slate-200 transition-colors text-lg font-bold text-slate-600">+</button>
                </div>
                <button onClick={handleSaveDefault} disabled={saving} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50" style={{ background: "linear-gradient(135deg, #4338ca 0%, #6366f1 100%)", boxShadow: "0 4px 12px rgba(67,56,202,0.3)" }}>
                  {saving ? "..." : "Salva"}
                </button>
              </div>
            </div>
          </div>

          {/* Day cards */}
          <div className="space-y-4">
            {dayKeys.map((dayKey, index) => {
              const rawTotals = getRawTotals(dayKey);
              const finalTotals = getFinalTotals(dayKey);
              const totalPieces = finalTotals.reduce((s, [, q]) => s + q, 0);
              const adj = adjustments[dayKey];
              const hasCustom = !!adj;
              const effectivePct = adj?.percentageOverride !== undefined ? adj.percentageOverride : defaultPercentage;
              const orders = ordersByDay[dayKey] || [];

              return (
                <div key={dayKey} className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
                  <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: index === 0 ? "linear-gradient(135deg, #4338ca 0%, #6366f1 100%)" : "linear-gradient(135deg, #e0e7ff 0%, #eef2ff 100%)" }}>
                        <span className={`text-sm font-black ${index === 0 ? "text-white" : "text-indigo-600"}`}>{dayKey.split("-")[2]}</span>
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-800 capitalize">{formatDateLabel(dayKey)}</h3>
                        <p className="text-[10px] text-slate-400">{orders.length} ordini &bull; Percentuale: {effectivePct >= 0 ? "+" : ""}{effectivePct}%</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {hasCustom && (
                        <button onClick={() => handleResetDay(dayKey)} className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-red-50 text-red-600 hover:bg-red-100 transition-colors">Reset</button>
                      )}
                      <button onClick={() => openDayEditor(dayKey)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all hover:shadow-lg" style={{ background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)" }}>
                        &#9998;&#65039; Modifica
                      </button>
                      <div className="text-right ml-2">
                        <p className="text-xl font-black text-indigo-600">{totalPieces}</p>
                        <p className="text-[9px] text-slate-400 font-semibold">PEZZI</p>
                      </div>
                    </div>
                  </div>

                  <div className="px-5 py-3">
                    {finalTotals.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-4">Nessuna biancheria</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                        {finalTotals.map(([name, qty]) => {
                          const rawQty = rawTotals.get(name) || 0;
                          const isOverridden = adj?.itemOverrides && adj.itemOverrides[name] !== undefined;
                          const isModified = qty !== rawQty;
                          return (
                            <div key={name} className={`flex items-center justify-between rounded-lg px-3 py-2 ${isOverridden ? "bg-amber-50 border border-amber-200" : isModified ? "bg-indigo-50/50" : "bg-slate-50"}`}>
                              <span className="text-sm text-slate-600">{name}</span>
                              <div className="flex items-center gap-2">
                                {isModified && <span className="text-[10px] text-slate-400 line-through">{rawQty}</span>}
                                <span className={`text-sm font-bold min-w-[36px] text-center ${isOverridden ? "text-amber-700" : isModified ? "text-indigo-700" : "text-slate-800"}`}>{qty}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* TAB: STORICO CONSEGNE LAVANDERIA      */}
      {/* ═══════════════════════════════════════ */}
      {activeTab === "storico" && (
        <div>
          {loadingStorico ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="w-10 h-10 border-3 border-slate-200 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-slate-400 text-sm">Caricamento storico...</p>
              </div>
            </div>
          ) : (
            <>
              {/* Navigazione mese */}
              <div className="bg-white rounded-2xl overflow-hidden mb-4" style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.05)" }}>
                <div className="px-5 py-4 flex items-center justify-between">
                  <button onClick={prevMonth} className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors">
                    <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
                  </button>
                  <div className="text-center">
                    <h3 className="text-base font-extrabold text-slate-800">{MONTH_NAMES[selectedMonth.month]} {selectedMonth.year}</h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">{monthlyStats.totalDeliveries} consegne lavanderia</p>
                  </div>
                  <button onClick={nextMonth} disabled={isCurrentMonth} className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                    <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                  </button>
                </div>

                {/* Stats cards */}
                <div className="px-5 pb-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="rounded-xl py-3 text-center" style={{ background: "linear-gradient(135deg, #eef2ff, #e0e7ff)" }}>
                    <p className="text-2xl font-black text-indigo-600">{monthlyStats.totalDeliveries}</p>
                    <p className="text-[9px] text-indigo-400 font-bold tracking-wider mt-0.5">CONSEGNE</p>
                  </div>
                  <div className="rounded-xl py-3 text-center" style={{ background: "linear-gradient(135deg, #ecfdf5, #d1fae5)" }}>
                    <p className="text-2xl font-black text-emerald-600">{monthlyStats.totalDeliveredPieces.toLocaleString("it-IT")}</p>
                    <p className="text-[9px] text-emerald-400 font-bold tracking-wider mt-0.5">PEZZI CONSEGNATI</p>
                  </div>
                  <div className="rounded-xl py-3 text-center" style={{ background: "linear-gradient(135deg, #ecfdf5, #a7f3d0)" }}>
                    <p className="text-2xl font-black text-emerald-700">{monthlyStats.completedCount}</p>
                    <p className="text-[9px] text-emerald-500 font-bold tracking-wider mt-0.5">COMPLETATE</p>
                  </div>
                  <div className="rounded-xl py-3 text-center" style={{ background: "linear-gradient(135deg, #fef3c7, #fde68a)" }}>
                    <p className="text-2xl font-black text-amber-700">{monthlyStats.inProgressCount + monthlyStats.pendingCount}</p>
                    <p className="text-[9px] text-amber-500 font-bold tracking-wider mt-0.5">IN CORSO</p>
                  </div>
                </div>
              </div>

              {/* Riepilogo articoli consegnati nel mese */}
              {monthlyStats.itemsDelivered.length > 0 && (
                <div className="bg-white rounded-2xl overflow-hidden mb-4" style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.05)" }}>
                  <div className="px-5 py-3.5 border-b border-slate-100">
                    <h4 className="text-[13px] font-bold text-slate-800">Totale articoli consegnati nel mese</h4>
                  </div>
                  <div className="px-5 py-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                      {monthlyStats.itemsDelivered.map(([name, qty]) => (
                        <div key={name} className="flex items-center justify-between rounded-lg px-3 py-2.5" style={{ background: "linear-gradient(135deg, #f8fafc, #f1f5f9)" }}>
                          <span className="text-[13px] text-slate-600 font-medium">{name}</span>
                          <span className="text-[15px] font-black text-indigo-600 min-w-[48px] text-right">{qty.toLocaleString("it-IT")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Lista consegne */}
              {filteredDeliveries.length === 0 ? (
                <div className="bg-white rounded-2xl py-12 text-center" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
                  <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  <p className="text-slate-400 text-sm">Nessuna consegna lavanderia in questo mese</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredDeliveries.map((delivery) => {
                    const isExpanded = expandedDelivery === delivery.id;
                    const items = delivery.status === "COMPLETED" ? delivery.deliveredItems : delivery.requestedItems;
                    const totalPieces = Object.values(items).reduce((s, q) => s + q, 0);
                    const statusColor = delivery.status === "COMPLETED"
                      ? { bg: "bg-emerald-100", text: "text-emerald-700", label: "Completata", iconBg: "linear-gradient(135deg, #059669, #10b981)" }
                      : delivery.status === "IN_PROGRESS"
                        ? { bg: "bg-amber-100", text: "text-amber-700", label: "In lavorazione", iconBg: "linear-gradient(135deg, #d97706, #f59e0b)" }
                        : { bg: "bg-slate-100", text: "text-slate-500", label: "In attesa", iconBg: "linear-gradient(135deg, #e0e7ff, #eef2ff)" };

                    const dayNum = delivery.dateKey.split("-")[2];

                    return (
                      <div key={delivery.id} className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
                        <button
                          onClick={() => setExpandedDelivery(isExpanded ? null : delivery.id)}
                          className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-slate-50/50 transition-colors text-left"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: statusColor.iconBg }}>
                              {delivery.status === "COMPLETED" ? (
                                <svg width="16" height="16" fill="none" stroke="white" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>
                              ) : (
                                <span className={`text-sm font-black ${delivery.status === "IN_PROGRESS" ? "text-white" : "text-indigo-600"}`}>{dayNum}</span>
                              )}
                            </div>
                            <div>
                              <h3 className="text-sm font-bold text-slate-800 capitalize">{formatFullDate(delivery.dateKey)}</h3>
                              <p className="text-[10px] text-slate-400">
                                {delivery.status === "COMPLETED" && delivery.completedByName
                                  ? `Completata da ${delivery.completedByName}`
                                  : delivery.status === "IN_PROGRESS" && delivery.startedByName
                                    ? `Presa da ${delivery.startedByName}`
                                    : "Da processare"}
                                {delivery.completedAt && delivery.status === "COMPLETED" && (
                                  <> &bull; {delivery.completedAt.toLocaleDateString("it-IT", { hour: "2-digit", minute: "2-digit" })}</>
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${statusColor.bg} ${statusColor.text}`}>
                              {statusColor.label}
                            </span>
                            <div className="text-right">
                              <p className={`text-lg font-black ${delivery.status === "COMPLETED" ? "text-emerald-600" : "text-indigo-600"}`}>{totalPieces}</p>
                              <p className="text-[8px] text-slate-400 font-semibold">{delivery.status === "COMPLETED" ? "CONSEGNATI" : "RICHIESTI"}</p>
                            </div>
                            <svg className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="px-5 pb-4 border-t border-slate-100 pt-3">
                            {/* Se completata mostra confronto richiesti vs consegnati */}
                            {delivery.status === "COMPLETED" ? (
                              <div className="space-y-1">
                                {Object.entries(delivery.deliveredItems).sort((a, b) => b[1] - a[1]).map(([name, qty]) => {
                                  const requested = delivery.requestedItems[name] || 0;
                                  const diff = qty - requested;
                                  return (
                                    <div key={name} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "linear-gradient(135deg, #ecfdf5, #d1fae5)" }}>
                                      <span className="text-[13px] text-slate-600">{name}</span>
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-slate-400">rich. {requested}</span>
                                        {diff !== 0 && (
                                          <span className={`text-[10px] font-bold ${diff > 0 ? "text-emerald-600" : "text-red-500"}`}>{diff > 0 ? `+${diff}` : diff}</span>
                                        )}
                                        <span className="text-[13px] font-extrabold text-emerald-700 min-w-[36px] text-center">{qty}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                                {delivery.inventoryApplied && (
                                  <div className="mt-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center gap-1.5">
                                    <svg width="14" height="14" fill="none" stroke="#059669" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>
                                    <p className="text-[11px] text-emerald-700 font-semibold">Aggiunto all&apos;inventario</p>
                                  </div>
                                )}
                              </div>
                            ) : (
                              /* In attesa / In lavorazione: mostra solo richiesti */
                              <div className="space-y-1">
                                {Object.entries(delivery.requestedItems).sort((a, b) => b[1] - a[1]).map(([name, qty]) => (
                                  <div key={name} className="flex items-center justify-between rounded-lg px-3 py-2 bg-slate-50">
                                    <span className="text-[13px] text-slate-600">{name}</span>
                                    <span className="text-[13px] font-extrabold text-slate-800 min-w-[36px] text-center">{qty}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══ Editing Modal ═══ */}
      {editingDay && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={() => !saving && setEditingDay(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden" style={{ boxShadow: "0 25px 60px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
              <div className="flex-shrink-0 px-6 py-4 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">Modifica {formatDateLabel(editingDay)}</h3>
                    <p className="text-sm text-slate-500">Percentuale e quantit&agrave; per questo giorno</p>
                  </div>
                  <button onClick={() => setEditingDay(null)} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                    <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="mb-5">
                  <label className="text-sm font-bold text-slate-700 block mb-2">Percentuale per questo giorno</label>
                  <p className="text-xs text-slate-400 mb-3">Sovrascrive il default ({defaultPercentage}%) solo per questo giorno</p>
                  <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-2 py-1 w-fit">
                    <button onClick={() => setEditPercentage(Math.max(-50, editPercentage - 5))} className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-slate-200 transition-colors text-xl font-bold text-slate-600">&minus;</button>
                    <input type="number" value={editPercentage} onChange={(e) => setEditPercentage(Number(e.target.value))} className="w-20 text-center text-xl font-bold text-indigo-700 bg-transparent outline-none" />
                    <span className="text-xl font-bold text-indigo-700">%</span>
                    <button onClick={() => setEditPercentage(Math.min(100, editPercentage + 5))} className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-slate-200 transition-colors text-xl font-bold text-slate-600">+</button>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-bold text-slate-700 block mb-2">Quantit&agrave; singoli articoli</label>
                  <p className="text-xs text-slate-400 mb-3">Lascia vuoto per usare il calcolo automatico con percentuale. Inserisci un numero per forzare la quantit&agrave;.</p>
                  <div className="space-y-2">
                    {Array.from(getRawTotals(editingDay).entries()).sort((a, b) => b[1] - a[1]).map(([name, rawQty]) => {
                      const adjustedQty = Math.round(rawQty * (1 + editPercentage / 100));
                      const overrideVal = editItemOverrides[name] || "";
                      return (
                        <div key={name} className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-2.5">
                          <span className="flex-1 text-sm font-medium text-slate-700">{name}</span>
                          <span className="text-xs text-slate-400 whitespace-nowrap">base: {rawQty} &rarr; {adjustedQty}</span>
                          <input type="number" value={overrideVal} onChange={(e) => setEditItemOverrides({ ...editItemOverrides, [name]: e.target.value })} placeholder={String(adjustedQty)} className="w-20 text-center text-sm font-bold bg-white border border-slate-200 rounded-lg py-1.5 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200" />
                        </div>
                      );
                    })}
                  </div>
                  {getRawTotals(editingDay).size === 0 && <p className="text-sm text-slate-400 text-center py-6">Nessun ordine per questo giorno</p>}
                </div>
              </div>

              <div className="flex-shrink-0 px-6 py-4 border-t border-slate-100 flex gap-3">
                <button onClick={() => setEditingDay(null)} disabled={saving} className="flex-1 py-3 font-semibold rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50">Annulla</button>
                <button onClick={handleSaveDay} disabled={saving} className="flex-1 py-3 font-bold text-white rounded-xl transition-all disabled:opacity-50" style={{ background: "linear-gradient(135deg, #4338ca 0%, #6366f1 100%)", boxShadow: "0 4px 12px rgba(67,56,202,0.3)" }}>
                  {saving ? "Salvataggio..." : "Salva Modifiche"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
