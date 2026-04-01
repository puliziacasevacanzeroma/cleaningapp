"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { collection, query, where, onSnapshot, doc, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { getItemName } from "~/lib/itemNames";

// ═══════════════════════════════════════
// SOLO BIANCHERIA
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

interface OrderItem { id: string; name: string; quantity: number; }
interface Order { id: string; items: OrderItem[]; status: string; scheduledDate: Date; }
interface DayAdjustment { percentageOverride?: number; itemOverrides?: Record<string, number>; }
interface LaundryDelivery {
  id: string; dateKey: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  requestedItems: Record<string, number>;
  deliveredItems: Record<string, number>;
  completedByName: string | null;
  inventoryApplied: boolean;
}

const MONTH_NAMES = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

const ALL_LINEN_DISPLAY_NAMES = [
  'Lenzuola Matrimoniali', 'Lenzuola Singole', 'Federe',
  'Copripiumino Matrimoniale', 'Copripiumino Singolo',
  'Telo Doccia', 'Asciugamano Viso', 'Asciugamano Bidet', 'Tappetino Scendibagno',
];

// SVG Icons as components
const I = {
  bolt: <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>,
  check: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>,
  save: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>,
  edit: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>,
  box: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>,
  clipboard: <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>,
  left: <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>,
  right: <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>,
};

export default function LavanderiaPage() {
  const [ordersByDay, setOrdersByDay] = useState<Record<string, Order[]>>({});
  const [adjustments, setAdjustments] = useState<Record<string, DayAdjustment>>({});
  const [defaultPercentage, setDefaultPercentage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [daysToShow] = useState(7);
  const [deliveries, setDeliveries] = useState<Record<string, LaundryDelivery>>({});
  const [editingDelivery, setEditingDelivery] = useState<string | null>(null);
  const [editQuantities, setEditQuantities] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState<string | null>(null);
  const [showAddItem, setShowAddItem] = useState(false);
  const [addItemName, setAddItemName] = useState("");
  const [addItemQty, setAddItemQty] = useState("");
  const [activeTab, setActiveTab] = useState<"consegne" | "riepilogo">("consegne");
  const [laundryPrices, setLaundryPrices] = useState<Record<string, number>>({});
  const [expandedDelivery, setExpandedDelivery] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const getDayKeys = () => {
    const keys: string[] = [];
    for (let i = 0; i < daysToShow; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      keys.push(formatDateKey(d));
    }
    return keys;
  };

  const getDeliveryDayKeys = () => {
    const keys: string[] = [];
    for (let i = 0; i < daysToShow; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      keys.push(formatDateKey(d));
    }
    return keys;
  };

  function formatDateKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function formatDateLabel(key: string): string {
    const [y, m, d] = key.split("-").map(Number);
    const date = new Date(y!, m! - 1, d);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    if (date.getTime() === today.getTime()) return "Oggi";
    if (date.getTime() === tomorrow.getTime()) return "Domani";
    return date.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
  }

  // Listener ordini
  useEffect(() => {
    const startDate = new Date(); startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(); endDate.setDate(endDate.getDate() + daysToShow); endDate.setHours(23, 59, 59, 999);
    const ordersQuery = query(collection(db, "orders"), where("scheduledDate", ">=", Timestamp.fromDate(startDate)), where("scheduledDate", "<=", Timestamp.fromDate(endDate)));
    const unsubscribe = onSnapshot(ordersQuery, (snapshot) => {
      const grouped: Record<string, Order[]> = {};
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data() as Record<string, any>;
        if (data.status === "CANCELLED") return;
        const scheduledDate = data.scheduledDate?.toDate?.() || new Date(data.scheduledDate);
        const key = formatDateKey(scheduledDate);
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push({ id: docSnap.id, items: data.items || [], status: data.status, scheduledDate });
      });
      setOrdersByDay(grouped);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsubscribe();
  }, [daysToShow]);

  // Listener adjustments
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "settings", "laundryAdjustments"), (docSnap) => {
      if (docSnap.exists()) { const data = docSnap.data() as Record<string, any>; setAdjustments(data.days || {}); setDefaultPercentage(data.defaultPercentage || 0); }
    });
    return () => unsubscribe();
  }, []);

  // Listener consegne lavanderia
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "laundryDeliveries"), (snapshot) => {
      const map: Record<string, LaundryDelivery> = {};
      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data() as Record<string, any>;
        map[docSnap.id] = {
          id: docSnap.id, dateKey: data.dateKey || docSnap.id,
          status: data.status || "PENDING",
          requestedItems: data.requestedItems || {}, deliveredItems: data.deliveredItems || {},
          completedByName: data.completedByName || null, inventoryApplied: data.inventoryApplied || false,
        };
      });
      setDeliveries(map);
    });
    return () => unsubscribe();
  }, []);

  // Listener prezzi lavanderia
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "settings", "laundryPrices"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as Record<string, any>;
        setLaundryPrices(data.prices || {});
      }
    });
    return () => unsubscribe();
  }, []);

  // Calcola totali giornalieri
  const getDayTotals = useCallback((dayKey: string) => {
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
    const adj = adjustments[dayKey];
    const effectivePct = adj?.percentageOverride !== undefined ? adj.percentageOverride : defaultPercentage;
    if (adj?.itemOverrides) { for (const [itemName, overrideQty] of Object.entries(adj.itemOverrides)) { totals.set(itemName, overrideQty); } }
    if (effectivePct !== 0) { for (const [name, qty] of totals) { if (!adj?.itemOverrides || adj.itemOverrides[name] === undefined) { totals.set(name, Math.round(qty * (1 + effectivePct / 100))); } } }
    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  }, [ordersByDay, adjustments, defaultPercentage]);

  // Helper per costi
  const calcCost = (items: Record<string, number>) => Object.entries(items).reduce((s, [name, qty]) => s + qty * (laundryPrices[name] || 0), 0);
  const fmtEuro = (n: number) => n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const hasPrices = Object.values(laundryPrices).some(p => p > 0);

  // Riepilogo mensile: somma deliveredItems di tutte le consegne completate del mese
  const monthlyTotals = useMemo(() => {
    const { year, month } = selectedMonth;
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    const totals = new Map<string, number>();
    let completedCount = 0;
    let totalPieces = 0;
    let totalCost = 0;
    const monthDeliveries: (LaundryDelivery & { cost: number; totalPieces: number })[] = [];

    Object.values(deliveries).forEach(d => {
      if (d.status !== "COMPLETED") return;
      if (!d.dateKey.startsWith(prefix)) return;
      completedCount++;
      let dPieces = 0;
      Object.entries(d.deliveredItems).forEach(([name, qty]) => {
        totals.set(name, (totals.get(name) || 0) + qty);
        totalPieces += qty;
        dPieces += qty;
      });
      const dCost = calcCost(d.deliveredItems);
      totalCost += dCost;
      monthDeliveries.push({ ...d, cost: dCost, totalPieces: dPieces });
    });

    // Ordina per dateKey decrescente (più recente prima)
    monthDeliveries.sort((a, b) => b.dateKey.localeCompare(a.dateKey));

    return {
      items: Array.from(totals.entries()).sort((a, b) => b[1] - a[1]),
      completedCount,
      totalPieces,
      totalCost,
      deliveries: monthDeliveries,
    };
  }, [deliveries, selectedMonth, laundryPrices]);

  // Handlers consegne
  const handleStartDelivery = async (dayKey: string) => {
    setSaving(true);
    try {
      const totals = getDayTotals(dayKey);
      const requestedItems: Record<string, number> = {};
      totals.forEach(([name, qty]) => { requestedItems[name] = qty; });
      const res = await fetch("/api/lavanderia/deliveries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", dateKey: dayKey, requestedItems }) });
      if (!res.ok) { let errMsg = `Errore ${res.status}`; try { const err = await res.json(); errMsg = err.error || errMsg; } catch {} alert(errMsg); }
      else { setEditQuantities({ ...requestedItems }); setEditingDelivery(dayKey); }
    } catch (e: any) { alert("Errore: " + (e?.message || "connessione")); }
    setSaving(false);
  };

  const handleResumeEdit = (dayKey: string) => {
    const delivery = deliveries[dayKey];
    if (!delivery) return;
    const items = Object.keys(delivery.deliveredItems).length > 0 ? { ...delivery.deliveredItems } : { ...delivery.requestedItems };
    setEditQuantities(items); setEditingDelivery(dayKey);
  };

  const handleSavePartial = async (dayKey: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/lavanderia/deliveries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", dateKey: dayKey, deliveredItems: editQuantities }) });
      if (!res.ok) { let errMsg = `Errore ${res.status}`; try { const err = await res.json(); errMsg = err.error || errMsg; } catch {} alert(errMsg); }
      else { setEditingDelivery(null); setShowAddItem(false); }
    } catch (e: any) { alert("Errore: " + (e?.message || "connessione")); }
    setSaving(false);
  };

  const handleCompleteDelivery = async (dayKey: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/lavanderia/deliveries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "complete", dateKey: dayKey, deliveredItems: editQuantities }) });
      if (!res.ok) { let errMsg = `Errore ${res.status}`; try { const err = await res.json(); errMsg = err.error || errMsg; } catch {} alert(errMsg); }
      else { setEditingDelivery(null); setShowConfirmModal(null); setShowAddItem(false); }
    } catch (e: any) { alert("Errore: " + (e?.message || "connessione")); }
    setSaving(false);
  };

  const prevMonth = () => setSelectedMonth(prev => prev.month === 0 ? { year: prev.year - 1, month: 11 } : { ...prev, month: prev.month - 1 });
  const nextMonth = () => {
    const now = new Date();
    const next = selectedMonth.month === 11 ? { year: selectedMonth.year + 1, month: 0 } : { ...selectedMonth, month: selectedMonth.month + 1 };
    if (next.year > now.getFullYear() || (next.year === now.getFullYear() && next.month > now.getMonth())) return;
    setSelectedMonth(next);
  };
  const isCurrentMonth = selectedMonth.year === new Date().getFullYear() && selectedMonth.month === new Date().getMonth();

  const dayKeys = getDayKeys();
  const deliveryDayKeys = getDeliveryDayKeys();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-slate-200 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 text-sm">Caricamento...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-5 pb-20">

      {/* ═══ TABS ═══ */}
      <div className="flex gap-2 mb-5 bg-white rounded-2xl p-1.5" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
        <button onClick={() => setActiveTab("consegne")} className={`flex-1 py-2.5 rounded-xl text-[13px] font-bold transition-all flex items-center justify-center gap-1.5 ${activeTab === "consegne" ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/25" : "text-slate-400 hover:text-slate-600"}`}>
          {I.box} Consegne Magazzino
        </button>
        <button onClick={() => setActiveTab("riepilogo")} className={`flex-1 py-2.5 rounded-xl text-[13px] font-bold transition-all flex items-center justify-center gap-1.5 ${activeTab === "riepilogo" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/25" : "text-slate-400 hover:text-slate-600"}`}>
          {I.clipboard} Riepilogo Mensile
        </button>
      </div>

      {/* ═══════════════════════════════════════ */}
      {/* TAB: CONSEGNE MAGAZZINO (default) */}
      {/* ═══════════════════════════════════════ */}
      {activeTab === "consegne" && (
        <div className="space-y-4">
          {deliveryDayKeys.map((dayKey, index) => {
            const totals = getDayTotals(dayKey);
            const totalRequestedPieces = totals.reduce((s, [, q]) => s + q, 0);
            if (totalRequestedPieces === 0) return null;

            const delivery = deliveries[dayKey];
            const status = delivery?.status || "PENDING";
            const isEditing = editingDelivery === dayKey;
            const totalDeliveredPieces = isEditing
              ? Object.values(editQuantities).reduce((s, q) => s + q, 0)
              : Object.values(delivery?.deliveredItems || {}).reduce((s, q) => s + q, 0);

            return (
              <div key={dayKey} className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.05)" }}>
                {/* Header */}
                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-[42px] h-[42px] rounded-xl flex items-center justify-center" style={{
                      background: status === "COMPLETED" ? "linear-gradient(135deg, #059669, #10b981)" : status === "IN_PROGRESS" ? "linear-gradient(135deg, #d97706, #f59e0b)" : index === 0 ? "linear-gradient(135deg, #4338ca, #6366f1)" : "linear-gradient(135deg, #e0e7ff, #eef2ff)",
                    }}>
                      {status === "COMPLETED" ? (
                        <span className="text-white">{I.check}</span>
                      ) : (
                        <span className={`text-sm font-black ${status !== "PENDING" || index === 0 ? "text-white" : "text-indigo-600"}`}>{dayKey.split("-")[2]}</span>
                      )}
                    </div>
                    <div>
                      <h3 className="text-[13px] font-bold text-slate-800 capitalize">{formatDateLabel(dayKey)}</h3>
                      <p className="text-[10px] text-slate-400">
                        {status === "COMPLETED" && delivery?.completedByName ? `Completato da ${delivery.completedByName}` : status === "IN_PROGRESS" ? "In lavorazione..." : "Da processare"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold ${status === "COMPLETED" ? "bg-emerald-100 text-emerald-700" : status === "IN_PROGRESS" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                      {status === "COMPLETED" ? "Completato" : status === "IN_PROGRESS" ? "In lavorazione" : "In attesa"}
                    </span>
                    <div className="text-right">
                      <p className={`text-xl font-black ${status === "COMPLETED" ? "text-emerald-600" : "text-indigo-600"}`}>
                        {status === "COMPLETED" ? totalDeliveredPieces : totalRequestedPieces}
                      </p>
                      <p className="text-[8px] text-slate-400 font-bold tracking-wider">{status === "COMPLETED" ? "CONSEGNATI" : "RICHIESTI"}</p>
                    </div>
                  </div>
                </div>

                <div className="px-5 py-3">
                  {/* PENDING */}
                  {status === "PENDING" && !isEditing && (
                    <>
                      <div className="space-y-1 mb-4">
                        {totals.map(([name, qty]) => (
                          <div key={name} className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: "linear-gradient(135deg, #f8fafc, #f1f5f9)" }}>
                            <span className="text-[13px] text-slate-600">{name}</span>
                            <span className="text-[13px] font-extrabold text-slate-800 min-w-[36px] text-center">{qty}</span>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => handleStartDelivery(dayKey)} disabled={saving} className="w-full py-3.5 rounded-xl font-bold text-white text-[13px] flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: "linear-gradient(135deg, #4338ca, #6366f1)", boxShadow: "0 4px 14px rgba(67,56,202,0.25)" }}>
                        {saving ? "Avvio..." : <>{I.bolt} Prendi in lavorazione</>}
                      </button>
                    </>
                  )}

                  {/* IN_PROGRESS senza editing */}
                  {status === "IN_PROGRESS" && !isEditing && (
                    <>
                      <div className="space-y-1 mb-4">
                        {Object.entries(delivery?.deliveredItems && Object.keys(delivery.deliveredItems).length > 0 ? delivery.deliveredItems : delivery?.requestedItems || {}).sort((a, b) => b[1] - a[1]).map(([name, qty]) => (
                          <div key={name} className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: "linear-gradient(135deg, #fffbeb, #fef3c7)" }}>
                            <span className="text-[13px] text-slate-600">{name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-400">rich. {delivery?.requestedItems?.[name] || 0}</span>
                              <span className="text-[13px] font-extrabold text-amber-700 min-w-[36px] text-center">{qty}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => handleResumeEdit(dayKey)} className="w-full py-3.5 rounded-xl font-bold text-white text-[13px] flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg, #d97706, #f59e0b)", boxShadow: "0 4px 14px rgba(217,119,6,0.25)" }}>
                        {I.edit} Modifica quantità
                      </button>
                    </>
                  )}

                  {/* EDITING */}
                  {(status === "IN_PROGRESS" || status === "PENDING") && isEditing && (
                    <>
                      <p className="text-[11px] text-slate-500 mb-3">Inserisci le quantità effettivamente consegnate:</p>
                      <div className="space-y-2 mb-4">
                        {Object.entries(editQuantities).sort((a, b) => a[0].localeCompare(b[0])).map(([name, qty]) => {
                          const requested = delivery?.requestedItems?.[name] || getDayTotals(dayKey).find(([n]) => n === name)?.[1] || 0;
                          return (
                            <div key={name} className="flex items-center justify-between rounded-xl px-3 py-2.5 border border-slate-200 bg-white">
                              <div className="flex-1 min-w-0 mr-2">
                                <span className="text-[13px] text-slate-700 font-semibold">{name}</span>
                                <span className="text-[10px] text-slate-400 ml-1">(rich. {requested})</span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <button onClick={() => setEditQuantities(prev => ({ ...prev, [name]: Math.max(0, (prev[name] || 0) - 1) }))} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-lg active:bg-slate-200">−</button>
                                <input type="number" value={qty || ""} onChange={(e) => setEditQuantities(prev => ({ ...prev, [name]: e.target.value === "" ? 0 : Math.max(0, parseInt(e.target.value) || 0) }))} onFocus={(e) => { if (qty === 0) e.target.value = ""; }} className="w-16 text-center py-1.5 text-[13px] font-extrabold border border-slate-200 rounded-lg focus:border-indigo-400 outline-none" min={0} />
                                <button onClick={() => setEditQuantities(prev => ({ ...prev, [name]: (prev[name] || 0) + 1 }))} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-lg active:bg-slate-200">+</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Aggiungi articolo extra */}
                      <div className="mb-4 pt-2 border-t border-slate-100">
                        {!showAddItem ? (
                          <button
                            onClick={() => { setShowAddItem(true); setAddItemName(""); setAddItemQty(""); }}
                            className="w-full py-2.5 rounded-xl text-sm font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors flex items-center justify-center gap-1.5"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                            Aggiungi articolo
                          </button>
                        ) : (
                          <div className="space-y-2">
                            <select
                              value={addItemName}
                              onChange={(e) => setAddItemName(e.target.value)}
                              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:border-indigo-400"
                            >
                              <option value="">Seleziona articolo...</option>
                              {ALL_LINEN_DISPLAY_NAMES.filter(n => !(n in editQuantities)).map(n => (
                                <option key={n} value={n}>{n}</option>
                              ))}
                            </select>
                            <div className="flex gap-2">
                              <input
                                type="number"
                                value={addItemQty}
                                onChange={(e) => setAddItemQty(e.target.value)}
                                placeholder="Quantità"
                                min="1"
                                className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-center outline-none focus:border-indigo-400"
                              />
                              <button
                                onClick={() => {
                                  if (addItemName && addItemQty && parseInt(addItemQty) > 0) {
                                    setEditQuantities(prev => ({ ...prev, [addItemName]: parseInt(addItemQty) }));
                                    setShowAddItem(false); setAddItemName(""); setAddItemQty("");
                                  }
                                }}
                                disabled={!addItemName || !addItemQty || parseInt(addItemQty) <= 0}
                                className="px-4 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-all"
                                style={{ background: "linear-gradient(135deg, #4338ca, #6366f1)" }}
                              >
                                Aggiungi
                              </button>
                              <button
                                onClick={() => setShowAddItem(false)}
                                className="px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <button onClick={() => handleSavePartial(dayKey)} disabled={saving} className="flex-1 py-3 rounded-xl font-bold text-slate-600 text-[13px] border-2 border-slate-200 disabled:opacity-50 flex items-center justify-center gap-1.5">
                          {I.save} Salva bozza
                        </button>
                        <button onClick={() => setShowConfirmModal(dayKey)} disabled={saving} className="flex-1 py-3 rounded-xl font-bold text-white text-[13px] disabled:opacity-50 flex items-center justify-center gap-1.5" style={{ background: "linear-gradient(135deg, #059669, #10b981)", boxShadow: "0 4px 14px rgba(5,150,105,0.25)" }}>
                          {I.check} Completa
                        </button>
                      </div>
                    </>
                  )}

                  {/* COMPLETED */}
                  {status === "COMPLETED" && (
                    <div className="space-y-1">
                      {Object.entries(delivery?.deliveredItems || {}).sort((a, b) => b[1] - a[1]).map(([name, qty]) => {
                        const requested = delivery?.requestedItems?.[name] || 0;
                        const diff = qty - requested;
                        return (
                          <div key={name} className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: "linear-gradient(135deg, #ecfdf5, #d1fae5)" }}>
                            <span className="text-[13px] text-slate-600">{name}</span>
                            <div className="flex items-center gap-2">
                              {diff !== 0 && (<span className={`text-[10px] font-bold ${diff > 0 ? "text-emerald-600" : "text-red-500"}`}>{diff > 0 ? `+${diff}` : diff}</span>)}
                              <span className="text-[13px] font-extrabold text-emerald-700 min-w-[36px] text-center">{qty}</span>
                            </div>
                          </div>
                        );
                      })}
                      {delivery?.inventoryApplied && (
                        <div className="mt-3 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center gap-1.5">
                          <span className="text-emerald-600">{I.check}</span>
                          <p className="text-[11px] text-emerald-700 font-semibold">Aggiunto all&apos;inventario</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* TAB: RIEPILOGO MENSILE */}
      {/* ═══════════════════════════════════════ */}
      {activeTab === "riepilogo" && (
        <div>
          {/* Navigazione mese */}
          <div className="bg-white rounded-2xl overflow-hidden mb-4" style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.05)" }}>
            <div className="px-5 py-4 flex items-center justify-between">
              <button onClick={prevMonth} className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors">
                {I.left}
              </button>
              <div className="text-center">
                <h3 className="text-base font-extrabold text-slate-800">{MONTH_NAMES[selectedMonth.month]} {selectedMonth.year}</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">{monthlyTotals.completedCount} consegne completate</p>
              </div>
              <button onClick={nextMonth} disabled={isCurrentMonth} className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                {I.right}
              </button>
            </div>

            {/* Totale grande */}
            <div className="px-5 pb-4">
              <div className="rounded-xl py-4 text-center" style={{ background: "linear-gradient(135deg, #eef2ff, #e0e7ff)" }}>
                <p className="text-3xl font-black text-indigo-600">{monthlyTotals.totalPieces.toLocaleString('it-IT')}</p>
                <p className="text-[10px] text-indigo-400 font-bold tracking-wider mt-1">PEZZI TOTALI CONSEGNATI</p>
              </div>
            </div>

            {/* Dettaglio articoli + totale euro */}
            <div className="px-5 pb-4">
              {monthlyTotals.items.length > 0 && (
                <>
                  <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Dettaglio per articolo</h4>
                  <div className="space-y-1">
                    {monthlyTotals.items.map(([name, qty]) => {
                      const price = laundryPrices[name] || 0;
                      return (
                        <div key={name} className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: "linear-gradient(135deg, #f8fafc, #f1f5f9)" }}>
                          <span className="text-[13px] text-slate-600 font-medium">{name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[15px] font-black text-indigo-600 min-w-[36px] text-right">{qty.toLocaleString('it-IT')}</span>
                            {hasPrices && price > 0 && <span className="text-[10px] text-amber-600 font-semibold min-w-[50px] text-right">&euro; {fmtEuro(qty * price)}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {hasPrices && monthlyTotals.totalCost > 0 && (
                    <div className="mt-2 flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: "linear-gradient(135deg, #fef3c7, #fde68a)" }}>
                      <span className="text-[12px] font-bold text-amber-800">Totale mese</span>
                      <span className="text-[14px] font-black text-amber-800">&euro; {fmtEuro(monthlyTotals.totalCost)}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Card consegne del mese */}
          {monthlyTotals.deliveries.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center" style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.05)" }}>
              <p className="text-sm text-slate-400">Nessuna consegna completata in questo mese</p>
            </div>
          ) : (
            <div className="space-y-3">
              {monthlyTotals.deliveries.map((delivery) => {
                const isExpanded = expandedDelivery === delivery.id;
                const dayParts = delivery.dateKey.split("-");
                const dayDate = new Date(Number(dayParts[0]), Number(dayParts[1]) - 1, Number(dayParts[2]));
                const dayLabel = dayDate.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });

                return (
                  <div key={delivery.id} className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
                    <button onClick={() => setExpandedDelivery(isExpanded ? null : delivery.id)} className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-slate-50/50 transition-colors text-left">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #059669, #10b981)" }}>
                          <span className="text-white">{I.check}</span>
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-800 capitalize">{dayLabel}</h3>
                          <p className="text-[10px] text-slate-400">
                            {delivery.completedByName ? `Da ${delivery.completedByName}` : "Completata"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-700">Completata</span>
                        <div className="text-right">
                          <p className="text-lg font-black text-emerald-600">{delivery.totalPieces}</p>
                          {hasPrices && delivery.cost > 0 && (
                            <p className="text-[10px] text-amber-600 font-bold">&euro; {fmtEuro(delivery.cost)}</p>
                          )}
                        </div>
                        <svg className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-5 pb-4 border-t border-slate-100 pt-3">
                        <div className="space-y-1">
                          {Object.entries(delivery.deliveredItems).sort((a, b) => b[1] - a[1]).map(([name, qty]) => {
                            const requested = delivery.requestedItems[name] || 0;
                            const diff = qty - requested;
                            const price = laundryPrices[name] || 0;
                            return (
                              <div key={name} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "linear-gradient(135deg, #ecfdf5, #d1fae5)" }}>
                                <span className="text-[13px] text-slate-600">{name}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-slate-400">rich. {requested}</span>
                                  {diff !== 0 && <span className={`text-[10px] font-bold ${diff > 0 ? "text-emerald-600" : "text-red-500"}`}>{diff > 0 ? `+${diff}` : diff}</span>}
                                  <span className="text-[13px] font-extrabold text-emerald-700 min-w-[36px] text-center">{qty}</span>
                                  {hasPrices && price > 0 && <span className="text-[10px] text-amber-600 font-semibold min-w-[50px] text-right">&euro; {fmtEuro(qty * price)}</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {hasPrices && delivery.cost > 0 && (
                          <div className="mt-2 flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "linear-gradient(135deg, #fef3c7, #fde68a)" }}>
                            <span className="text-[12px] font-bold text-amber-800">Totale consegna</span>
                            <span className="text-[14px] font-black text-amber-800">&euro; {fmtEuro(delivery.cost)}</span>
                          </div>
                        )}
                        {delivery.inventoryApplied && (
                          <div className="mt-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center gap-1.5">
                            <span className="text-emerald-600">{I.check}</span>
                            <p className="text-[11px] text-emerald-700 font-semibold">Aggiunto all&apos;inventario</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ MODAL CONFERMA ═══ */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !saving && setShowConfirmModal(null)}>
          <div className="bg-white rounded-2xl max-w-sm w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: "linear-gradient(135deg, #d1fae5, #a7f3d0)" }}>
                <svg width="32" height="32" fill="none" stroke="#059669" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
              </div>
              <h3 className="text-lg font-extrabold text-slate-800 mb-2">Conferma completamento</h3>
              <p className="text-sm text-slate-500 mb-1">Consegna per <strong>{formatDateLabel(showConfirmModal)}</strong></p>
              <p className="text-sm text-slate-500 mb-4">Totale: <strong className="text-emerald-600">{Object.values(editQuantities).reduce((s, q) => s + q, 0)} pezzi</strong></p>
              <p className="text-[11px] text-amber-600 font-semibold bg-amber-50 rounded-xl px-3 py-2.5">⚠️ Dopo la conferma non sarà più possibile modificare le quantità.</p>
            </div>
            <div className="flex border-t border-slate-100">
              <button onClick={() => setShowConfirmModal(null)} disabled={saving} className="flex-1 py-3.5 text-[13px] font-semibold text-slate-500 hover:bg-slate-50 transition-colors">Annulla</button>
              <button onClick={() => handleCompleteDelivery(showConfirmModal)} disabled={saving} className="flex-1 py-3.5 text-[13px] font-bold text-emerald-600 hover:bg-emerald-50 border-l border-slate-100 transition-colors flex items-center justify-center gap-1.5">
                {saving ? "Salvataggio..." : <>{I.check} Conferma</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
