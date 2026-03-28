"use client";

import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, doc, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { getItemName } from "~/lib/itemNames";

// ═══════════════════════════════════════
// SOLO BIANCHERIA — esclude kit cortesia, prodotti pulizia, etc.
// ═══════════════════════════════════════
const LINEN_ITEM_IDS = new Set([
  // Biancheria Letto
  'doubleSheets', 'singleSheets', 'pillowcases', 'copripiumino',
  'item_doubleSheets', 'item_singleSheets', 'item_pillowcases', 'item_copripiumino',
  'lenzuola_matrimoniale', 'lenzuola_singolo', 'federa',
  // Biancheria Bagno
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
  itemOverrides?: Record<string, number>; // itemName -> new qty
}

export default function LavanderiaPage() {
  const [ordersByDay, setOrdersByDay] = useState<Record<string, Order[]>>({});
  const [adjustments, setAdjustments] = useState<Record<string, DayAdjustment>>({});
  const [defaultPercentage, setDefaultPercentage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [daysToShow] = useState(7);

  // Generate date keys for today + next N days
  const getDayKeys = () => {
    const keys: string[] = [];
    for (let i = 0; i < daysToShow; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.getTime() === today.getTime()) return "Oggi";
    if (date.getTime() === tomorrow.getTime()) return "Domani";

    return date.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
  }

  // Listen to orders for today + next 7 days
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

        // Skip delivered/completed orders
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

  // Listen to admin adjustments from Firestore
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

  // Calculate totals for a day with adjustments
  const getDayTotals = (dayKey: string) => {
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

    // Apply admin adjustments
    const adj = adjustments[dayKey];
    
    // Determine effective percentage: day override > default
    const effectivePct = adj?.percentageOverride !== undefined ? adj.percentageOverride : defaultPercentage;

    // Apply item-level overrides first
    if (adj?.itemOverrides) {
      for (const [itemName, overrideQty] of Object.entries(adj.itemOverrides)) {
        totals.set(itemName, overrideQty);
      }
    }

    // Apply percentage adjustment to items NOT individually overridden
    if (effectivePct !== 0) {
      for (const [name, qty] of totals) {
        if (!adj?.itemOverrides || adj.itemOverrides[name] === undefined) {
          totals.set(name, Math.round(qty * (1 + effectivePct / 100)));
        }
      }
    }

    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
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
      {/* Day-by-day cards */}
      <div className="space-y-4">
        {dayKeys.map((dayKey, index) => {
          const totals = getDayTotals(dayKey);
          const totalPieces = totals.reduce((s, [, q]) => s + q, 0);
          const adj = adjustments[dayKey];
          const hasAdjustment = adj && (adj.percentageOverride !== undefined && adj.percentageOverride !== 0 || adj.itemOverrides && Object.keys(adj.itemOverrides).length > 0);
          const orders = ordersByDay[dayKey] || [];

          return (
            <div
              key={dayKey}
              className="bg-white rounded-2xl overflow-hidden"
              style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}
            >
              {/* Day Header */}
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
                    <h3 className="text-sm font-bold text-slate-800 capitalize">
                      {formatDateLabel(dayKey)}
                    </h3>
                    <p className="text-[10px] text-slate-400">{orders.length} ordini</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {hasAdjustment && (
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ background: "linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)", color: "#ea580c" }}
                    >
                      {adj?.percentageOverride && adj.percentageOverride > 0 ? "+" : ""}
                      {adj?.percentageOverride ? `${adj.percentageOverride}%` : "Modificato"}
                    </span>
                  )}
                  <div className="text-right">
                    <p className="text-xl font-black text-indigo-600">{totalPieces}</p>
                    <p className="text-[9px] text-slate-400 font-semibold">PEZZI</p>
                  </div>
                </div>
              </div>

              {/* Items */}
              <div className="px-5 py-3">
                {totals.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">Nessuna biancheria</p>
                ) : (
                  <div className="space-y-1">
                    {totals.map(([name, qty]) => (
                      <div
                        key={name}
                        className="flex items-center justify-between rounded-lg px-3 py-2"
                        style={{ background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)" }}
                      >
                        <span className="text-sm text-slate-600">{name}</span>
                        <span className="text-sm font-bold text-slate-800 min-w-[36px] text-center">
                          {qty}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
