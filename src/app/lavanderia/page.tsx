"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, query, where, onSnapshot, doc, Timestamp } from "firebase/firestore";
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
  const [activeTab, setActiveTab] = useState<"riepilogo" | "consegne">("riepilogo");

  const getDayKeys = () => {
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

  // Prendi in lavorazione
  const handleStartDelivery = async (dayKey: string) => {
    setSaving(true);
    try {
      const totals = getDayTotals(dayKey);
      const requestedItems: Record<string, number> = {};
      totals.forEach(([name, qty]) => { requestedItems[name] = qty; });
      const res = await fetch("/api/lavanderia/deliveries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", dateKey, requestedItems }) });
      if (!res.ok) {
        let errMsg = `Errore ${res.status}`;
        try { const err = await res.json(); errMsg = err.error || errMsg; } catch {}
        alert(errMsg);
      }
      else { setEditQuantities({ ...requestedItems }); setEditingDelivery(dayKey); }
    } catch (e: any) { alert("Errore di connessione: " + (e?.message || "")); }
    setSaving(false);
  };

  // Riprendi modifica
  const handleResumeEdit = (dayKey: string) => {
    const delivery = deliveries[dayKey];
    if (!delivery) return;
    const items = Object.keys(delivery.deliveredItems).length > 0 ? { ...delivery.deliveredItems } : { ...delivery.requestedItems };
    setEditQuantities(items); setEditingDelivery(dayKey);
  };

  // Salva bozza
  const handleSavePartial = async (dayKey: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/lavanderia/deliveries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", dateKey, deliveredItems: editQuantities }) });
      if (!res.ok) {
        let errMsg = `Errore ${res.status}`;
        try { const err = await res.json(); errMsg = err.error || errMsg; } catch {}
        alert(errMsg);
      } else {
        setEditingDelivery(null);
      }
    } catch (e: any) { alert("Errore di connessione: " + (e?.message || "")); }
    setSaving(false);
  };

  // Completa consegna
  const handleCompleteDelivery = async (dayKey: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/lavanderia/deliveries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "complete", dateKey, deliveredItems: editQuantities }) });
      if (!res.ok) {
        let errMsg = `Errore ${res.status}`;
        try { const err = await res.json(); errMsg = err.error || errMsg; } catch {}
        alert(errMsg);
      }
      else { setEditingDelivery(null); setShowConfirmModal(null); }
    } catch (e: any) { alert("Errore di connessione: " + (e?.message || "")); }
    setSaving(false);
  };

  const dayKeys = getDayKeys();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-slate-200 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 text-sm">Caricamento biancheria...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-20">

      {/* Tab switcher */}
      <div className="flex gap-2 mb-5 bg-white rounded-2xl p-1.5" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
        <button onClick={() => setActiveTab("riepilogo")} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === "riepilogo" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/25" : "text-slate-500 hover:text-slate-700"}`}>
          📋 Riepilogo
        </button>
        <button onClick={() => setActiveTab("consegne")} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === "consegne" ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/25" : "text-slate-500 hover:text-slate-700"}`}>
          📦 Consegne Magazzino
        </button>
      </div>

      {/* ═══════════════════════════════════════ */}
      {/* TAB RIEPILOGO (codice originale invariato) */}
      {/* ═══════════════════════════════════════ */}
      {activeTab === "riepilogo" && (
        <div className="space-y-4">
          {dayKeys.map((dayKey, index) => {
            const totals = getDayTotals(dayKey);
            const totalPieces = totals.reduce((s, [, q]) => s + q, 0);
            const adj = adjustments[dayKey];
            const hasAdjustment = adj && (adj.percentageOverride !== undefined && adj.percentageOverride !== 0 || adj.itemOverrides && Object.keys(adj.itemOverrides).length > 0);
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
                      <p className="text-[10px] text-slate-400">{orders.length} ordini</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasAdjustment && (<span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: "linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)", color: "#ea580c" }}>{adj?.percentageOverride && adj.percentageOverride > 0 ? "+" : ""}{adj?.percentageOverride ? `${adj.percentageOverride}%` : "Modificato"}</span>)}
                    <div className="text-right">
                      <p className="text-xl font-black text-indigo-600">{totalPieces}</p>
                      <p className="text-[9px] text-slate-400 font-semibold">PEZZI</p>
                    </div>
                  </div>
                </div>
                <div className="px-5 py-3">
                  {totals.length === 0 ? (<p className="text-sm text-slate-400 text-center py-4">Nessuna biancheria</p>) : (
                    <div className="space-y-1">
                      {totals.map(([name, qty]) => (
                        <div key={name} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)" }}>
                          <span className="text-sm text-slate-600">{name}</span>
                          <span className="text-sm font-bold text-slate-800 min-w-[36px] text-center">{qty}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* TAB CONSEGNE MAGAZZINO (NUOVA) */}
      {/* ═══════════════════════════════════════ */}
      {activeTab === "consegne" && (
        <div className="space-y-4">
          {dayKeys.map((dayKey, index) => {
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
              <div key={dayKey} className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
                {/* Header */}
                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
                      background: status === "COMPLETED" ? "linear-gradient(135deg, #059669 0%, #10b981 100%)" : status === "IN_PROGRESS" ? "linear-gradient(135deg, #d97706 0%, #f59e0b 100%)" : index === 0 ? "linear-gradient(135deg, #4338ca 0%, #6366f1 100%)" : "linear-gradient(135deg, #e0e7ff 0%, #eef2ff 100%)",
                    }}>
                      <span className={`text-sm font-black ${status !== "PENDING" || index === 0 ? "text-white" : "text-indigo-600"}`}>
                        {status === "COMPLETED" ? "✓" : dayKey.split("-")[2]}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-800 capitalize">{formatDateLabel(dayKey)}</h3>
                      <p className="text-[10px] text-slate-400">
                        {status === "COMPLETED" && delivery?.completedByName ? `Completato da ${delivery.completedByName}` : status === "IN_PROGRESS" ? "In lavorazione..." : "Da processare"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${status === "COMPLETED" ? "bg-emerald-100 text-emerald-700" : status === "IN_PROGRESS" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                      {status === "COMPLETED" ? "Completato" : status === "IN_PROGRESS" ? "In lavorazione" : "In attesa"}
                    </span>
                    <div className="text-right">
                      <p className={`text-xl font-black ${status === "COMPLETED" ? "text-emerald-600" : "text-indigo-600"}`}>
                        {status === "COMPLETED" ? totalDeliveredPieces : totalRequestedPieces}
                      </p>
                      <p className="text-[9px] text-slate-400 font-semibold">{status === "COMPLETED" ? "CONSEGNATI" : "RICHIESTI"}</p>
                    </div>
                  </div>
                </div>

                <div className="px-5 py-3">
                  {/* PENDING — riepilogo + pulsante */}
                  {status === "PENDING" && !isEditing && (
                    <>
                      <div className="space-y-1 mb-4">
                        {totals.map(([name, qty]) => (
                          <div key={name} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)" }}>
                            <span className="text-sm text-slate-600">{name}</span>
                            <span className="text-sm font-bold text-slate-800 min-w-[36px] text-center">{qty}</span>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => handleStartDelivery(dayKey)} disabled={saving} className="w-full py-3 rounded-xl font-bold text-white text-sm bg-gradient-to-r from-indigo-500 to-indigo-600 shadow-lg shadow-indigo-500/25 disabled:opacity-50">
                        {saving ? "Avvio..." : "🚀 Prendi in lavorazione"}
                      </button>
                    </>
                  )}

                  {/* IN_PROGRESS — vista senza editing */}
                  {status === "IN_PROGRESS" && !isEditing && (
                    <>
                      <div className="space-y-1 mb-4">
                        {Object.entries(delivery?.deliveredItems && Object.keys(delivery.deliveredItems).length > 0 ? delivery.deliveredItems : delivery?.requestedItems || {}).sort((a, b) => b[1] - a[1]).map(([name, qty]) => (
                          <div key={name} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)" }}>
                            <span className="text-sm text-slate-600">{name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-400">rich. {delivery?.requestedItems?.[name] || 0}</span>
                              <span className="text-sm font-bold text-amber-700 min-w-[36px] text-center">{qty}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => handleResumeEdit(dayKey)} className="w-full py-3 rounded-xl font-bold text-white text-sm bg-gradient-to-r from-amber-500 to-amber-600 shadow-lg shadow-amber-500/25">
                        ✏️ Modifica quantità
                      </button>
                    </>
                  )}

                  {/* EDITING — form input quantità */}
                  {(status === "IN_PROGRESS" || status === "PENDING") && isEditing && (
                    <>
                      <p className="text-xs text-slate-500 mb-3">Inserisci le quantità effettivamente consegnate:</p>
                      <div className="space-y-2 mb-4">
                        {Object.entries(editQuantities).sort((a, b) => a[0].localeCompare(b[0])).map(([name, qty]) => {
                          const requested = delivery?.requestedItems?.[name] || getDayTotals(dayKey).find(([n]) => n === name)?.[1] || 0;
                          return (
                            <div key={name} className="flex items-center justify-between rounded-xl px-3 py-2.5 border border-slate-200 bg-white">
                              <div className="flex-1 min-w-0 mr-2">
                                <span className="text-sm text-slate-700 font-medium">{name}</span>
                                <span className="text-[10px] text-slate-400 ml-1">(rich. {requested})</span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <button onClick={() => setEditQuantities(prev => ({ ...prev, [name]: Math.max(0, (prev[name] || 0) - 1) }))} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-lg active:bg-slate-200">−</button>
                                <input type="number" value={qty} onChange={(e) => setEditQuantities(prev => ({ ...prev, [name]: Math.max(0, parseInt(e.target.value) || 0) }))} className="w-16 text-center py-1.5 text-sm font-bold border border-slate-200 rounded-lg focus:border-indigo-400 outline-none" min={0} />
                                <button onClick={() => setEditQuantities(prev => ({ ...prev, [name]: (prev[name] || 0) + 1 }))} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-lg active:bg-slate-200">+</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleSavePartial(dayKey)} disabled={saving} className="flex-1 py-3 rounded-xl font-bold text-slate-600 text-sm border-2 border-slate-200 disabled:opacity-50">
                          💾 Salva bozza
                        </button>
                        <button onClick={() => setShowConfirmModal(dayKey)} disabled={saving} className="flex-1 py-3 rounded-xl font-bold text-white text-sm bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/25 disabled:opacity-50">
                          ✅ Completa
                        </button>
                      </div>
                    </>
                  )}

                  {/* COMPLETED — riepilogo finale */}
                  {status === "COMPLETED" && (
                    <div className="space-y-1">
                      {Object.entries(delivery?.deliveredItems || {}).sort((a, b) => b[1] - a[1]).map(([name, qty]) => {
                        const requested = delivery?.requestedItems?.[name] || 0;
                        const diff = qty - requested;
                        return (
                          <div key={name} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)" }}>
                            <span className="text-sm text-slate-600">{name}</span>
                            <div className="flex items-center gap-2">
                              {diff !== 0 && (<span className={`text-[10px] font-bold ${diff > 0 ? "text-emerald-600" : "text-red-500"}`}>{diff > 0 ? `+${diff}` : diff}</span>)}
                              <span className="text-sm font-bold text-emerald-700 min-w-[36px] text-center">{qty}</span>
                            </div>
                          </div>
                        );
                      })}
                      {delivery?.inventoryApplied && (
                        <div className="mt-3 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
                          <p className="text-[11px] text-emerald-700 font-semibold">✅ Aggiunto all&apos;inventario</p>
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

      {/* Modal conferma completamento */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !saving && setShowConfirmModal(null)}>
          <div className="bg-white rounded-2xl max-w-sm w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 text-center">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">📦</span>
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Conferma completamento</h3>
              <p className="text-sm text-slate-500 mb-1">Consegna per <strong>{formatDateLabel(showConfirmModal)}</strong></p>
              <p className="text-sm text-slate-500 mb-4">Totale: <strong className="text-emerald-600">{Object.values(editQuantities).reduce((s, q) => s + q, 0)} pezzi</strong></p>
              <p className="text-xs text-amber-600 font-medium bg-amber-50 rounded-lg px-3 py-2">⚠️ Dopo la conferma non sarà più possibile modificare le quantità.</p>
            </div>
            <div className="flex border-t border-slate-100">
              <button onClick={() => setShowConfirmModal(null)} disabled={saving} className="flex-1 py-3.5 text-sm font-semibold text-slate-500 hover:bg-slate-50">Annulla</button>
              <button onClick={() => handleCompleteDelivery(showConfirmModal)} disabled={saving} className="flex-1 py-3.5 text-sm font-bold text-emerald-600 hover:bg-emerald-50 border-l border-slate-100">
                {saving ? "Salvataggio..." : "✅ Conferma"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
