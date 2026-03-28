"use client";

import { useState, useEffect } from "react";
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

export default function AdminLavanderiaPage() {
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

  const getDayKeys = () => {
    const keys: string[] = [];
    for (let i = 0; i < daysToShow; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      keys.push(formatDateKey(d));
    }
    return keys;
  };

  // Listen to orders
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

  // Listen to adjustments
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

  // Get raw totals (no adjustments)
  const getRawTotals = (dayKey: string) => {
    const orders = ordersByDay[dayKey] || [];
    const totals = new Map<string, number>();
    orders.forEach((order) => {
      order.items?.forEach((item) => {
        if (!isLinenItem(item)) return; // Solo biancheria letto/bagno
        const translated = getItemName(item.id || item.name);
        const name = translated !== (item.id || item.name) ? translated : item.name;
        totals.set(name, (totals.get(name) || 0) + item.quantity);
      });
    });
    return totals;
  };

  // Get final totals with adjustments
  const getFinalTotals = (dayKey: string) => {
    const totals = getRawTotals(dayKey);
    const adj = adjustments[dayKey];

    // Apply default percentage first
    const effectivePct = adj?.percentageOverride !== undefined ? adj.percentageOverride : defaultPercentage;

    if (effectivePct !== 0) {
      for (const [name, qty] of totals) {
        if (!adj?.itemOverrides || adj.itemOverrides[name] === undefined) {
          totals.set(name, Math.round(qty * (1 + effectivePct / 100)));
        }
      }
    }

    // Apply item overrides
    if (adj?.itemOverrides) {
      for (const [itemName, overrideQty] of Object.entries(adj.itemOverrides)) {
        totals.set(itemName, overrideQty);
      }
    }

    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  };

  // Save default percentage
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

  // Open editing modal for a day
  const openDayEditor = (dayKey: string) => {
    const adj = adjustments[dayKey];
    setEditingDay(dayKey);
    setEditPercentage(adj?.percentageOverride !== undefined ? adj.percentageOverride : defaultPercentage);

    // Pre-fill item overrides
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

  // Save day adjustment
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

  // Reset day to default
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
          <p className="text-slate-500 text-sm mt-1">Configura le quantità di biancheria che la lavanderia vedrà</p>
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
          ✓ {successMsg}
        </div>
      )}

      {/* Default percentage */}
      <div
        className="bg-white rounded-2xl p-5 mb-6"
        style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}
      >
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-800">Percentuale Default Giornaliera</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Ogni giorno verrà aggiunto automaticamente questa % alla biancheria base.
              Es: +20% = se servono 100 lenzuola, ne verranno mostrate 120.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-slate-50 rounded-xl px-1">
              <button
                onClick={() => setDefaultPercentage(Math.max(-50, defaultPercentage - 5))}
                className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-slate-200 transition-colors text-lg font-bold text-slate-600"
              >
                −
              </button>
              <input
                type="number"
                value={defaultPercentage}
                onChange={(e) => setDefaultPercentage(Number(e.target.value))}
                className="w-16 text-center text-lg font-bold text-indigo-700 bg-transparent outline-none"
              />
              <span className="text-lg font-bold text-indigo-700 mr-1">%</span>
              <button
                onClick={() => setDefaultPercentage(Math.min(100, defaultPercentage + 5))}
                className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-slate-200 transition-colors text-lg font-bold text-slate-600"
              >
                +
              </button>
            </div>
            <button
              onClick={handleSaveDefault}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #4338ca 0%, #6366f1 100%)", boxShadow: "0 4px 12px rgba(67,56,202,0.3)" }}
            >
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
            <div
              key={dayKey}
              className="bg-white rounded-2xl overflow-hidden"
              style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}
            >
              {/* Header */}
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{
                      background: index === 0
                        ? "linear-gradient(135deg, #4338ca 0%, #6366f1 100%)"
                        : "linear-gradient(135deg, #e0e7ff 0%, #eef2ff 100%)",
                    }}
                  >
                    <span className={`text-sm font-black ${index === 0 ? "text-white" : "text-indigo-600"}`}>
                      {dayKey.split("-")[2]}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 capitalize">{formatDateLabel(dayKey)}</h3>
                    <p className="text-[10px] text-slate-400">{orders.length} ordini • Percentuale: {effectivePct >= 0 ? "+" : ""}{effectivePct}%</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {hasCustom && (
                    <button
                      onClick={() => handleResetDay(dayKey)}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                    >
                      Reset
                    </button>
                  )}
                  <button
                    onClick={() => openDayEditor(dayKey)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all hover:shadow-lg"
                    style={{ background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)" }}
                  >
                    ✏️ Modifica
                  </button>
                  <div className="text-right ml-2">
                    <p className="text-xl font-black text-indigo-600">{totalPieces}</p>
                    <p className="text-[9px] text-slate-400 font-semibold">PEZZI</p>
                  </div>
                </div>
              </div>

              {/* Items */}
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
                        <div
                          key={name}
                          className={`flex items-center justify-between rounded-lg px-3 py-2 ${isOverridden ? "bg-amber-50 border border-amber-200" : isModified ? "bg-indigo-50/50" : "bg-slate-50"}`}
                        >
                          <span className="text-sm text-slate-600">{name}</span>
                          <div className="flex items-center gap-2">
                            {isModified && (
                              <span className="text-[10px] text-slate-400 line-through">{rawQty}</span>
                            )}
                            <span className={`text-sm font-bold min-w-[36px] text-center ${isOverridden ? "text-amber-700" : isModified ? "text-indigo-700" : "text-slate-800"}`}>
                              {qty}
                            </span>
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

      {/* Editing Modal */}
      {editingDay && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={() => !saving && setEditingDay(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
              style={{ boxShadow: "0 25px 60px rgba(0,0,0,0.2)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex-shrink-0 px-6 py-4 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">
                      Modifica {formatDateLabel(editingDay)}
                    </h3>
                    <p className="text-sm text-slate-500">Percentuale e quantità per questo giorno</p>
                  </div>
                  <button
                    onClick={() => setEditingDay(null)}
                    className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
                  >
                    <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {/* Percentage */}
                <div className="mb-5">
                  <label className="text-sm font-bold text-slate-700 block mb-2">
                    Percentuale per questo giorno
                  </label>
                  <p className="text-xs text-slate-400 mb-3">
                    Sovrascrive il default ({defaultPercentage}%) solo per questo giorno
                  </p>
                  <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-2 py-1 w-fit">
                    <button
                      onClick={() => setEditPercentage(Math.max(-50, editPercentage - 5))}
                      className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-slate-200 transition-colors text-xl font-bold text-slate-600"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      value={editPercentage}
                      onChange={(e) => setEditPercentage(Number(e.target.value))}
                      className="w-20 text-center text-xl font-bold text-indigo-700 bg-transparent outline-none"
                    />
                    <span className="text-xl font-bold text-indigo-700">%</span>
                    <button
                      onClick={() => setEditPercentage(Math.min(100, editPercentage + 5))}
                      className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-slate-200 transition-colors text-xl font-bold text-slate-600"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Item overrides */}
                <div>
                  <label className="text-sm font-bold text-slate-700 block mb-2">
                    Quantità singoli articoli
                  </label>
                  <p className="text-xs text-slate-400 mb-3">
                    Lascia vuoto per usare il calcolo automatico con percentuale. Inserisci un numero per forzare la quantità.
                  </p>
                  <div className="space-y-2">
                    {Array.from(getRawTotals(editingDay).entries())
                      .sort((a, b) => b[1] - a[1])
                      .map(([name, rawQty]) => {
                        const adjustedQty = Math.round(rawQty * (1 + editPercentage / 100));
                        const overrideVal = editItemOverrides[name] || "";

                        return (
                          <div key={name} className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-2.5">
                            <span className="flex-1 text-sm font-medium text-slate-700">{name}</span>
                            <span className="text-xs text-slate-400 whitespace-nowrap">
                              base: {rawQty} → {adjustedQty}
                            </span>
                            <input
                              type="number"
                              value={overrideVal}
                              onChange={(e) => setEditItemOverrides({ ...editItemOverrides, [name]: e.target.value })}
                              placeholder={String(adjustedQty)}
                              className="w-20 text-center text-sm font-bold bg-white border border-slate-200 rounded-lg py-1.5 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
                            />
                          </div>
                        );
                      })}
                  </div>
                  {getRawTotals(editingDay).size === 0 && (
                    <p className="text-sm text-slate-400 text-center py-6">Nessun ordine per questo giorno</p>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex-shrink-0 px-6 py-4 border-t border-slate-100 flex gap-3">
                <button
                  onClick={() => setEditingDay(null)}
                  disabled={saving}
                  className="flex-1 py-3 font-semibold rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50"
                >
                  Annulla
                </button>
                <button
                  onClick={handleSaveDay}
                  disabled={saving}
                  className="flex-1 py-3 font-bold text-white rounded-xl transition-all disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #4338ca 0%, #6366f1 100%)", boxShadow: "0 4px 12px rgba(67,56,202,0.3)" }}
                >
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
