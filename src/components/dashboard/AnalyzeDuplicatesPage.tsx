"use client";

import { useState } from "react";
import { collection, getDocs, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

interface DuplicateGroup {
  propertyId: string;
  propertyName: string;
  date: string;
  orders: {
    id: string;
    cleaningId: string;
    status: string;
    items: { id: string; name: string; quantity: number }[];
    itemsSummary: string;
    createdAt: string;
  }[];
  cleanings: {
    id: string;
    status: string;
    bookingId: string;
    bookingSource: string;
    guestName: string;
    createdAt: string;
  }[];
  issue: string;
}

export default function AnalyzeDuplicatesPage() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DuplicateGroup[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) => setLog(prev => [...prev, msg]);

  const analyze = async () => {
    setLoading(true);
    setResults([]);
    setSummary(null);
    setLog([]);

    try {
      addLog("📦 Caricamento ordini...");
      const ordersSnap = await getDocs(collection(db, "orders"));
      const allOrders = ordersSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
      addLog(`  → ${allOrders.length} ordini totali`);

      addLog("🧹 Caricamento pulizie...");
      const cleaningsSnap = await getDocs(collection(db, "cleanings"));
      const allCleanings = cleaningsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
      addLog(`  → ${allCleanings.length} pulizie totali`);

      addLog("🏠 Caricamento proprietà...");
      const propsSnap = await getDocs(collection(db, "properties"));
      const propsMap = new Map<string, string>();
      propsSnap.docs.forEach(d => propsMap.set(d.id, (d.data() as any).name || d.id));

      // Filtra ordini non cancellati
      const activeOrders = allOrders.filter(o => o.status !== "CANCELLED");
      addLog(`  → ${activeOrders.length} ordini attivi (non cancellati)`);

      // Raggruppa ordini per propertyId + data
      const groupKey = (o: any) => {
        const d = o.scheduledDate?.toDate?.();
        if (!d) return null;
        return `${o.propertyId}__${d.toISOString().split('T')[0]}`;
      };

      const groups = new Map<string, any[]>();
      for (const o of activeOrders) {
        const key = groupKey(o);
        if (!key) continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(o);
      }

      // Trova duplicati (più di 1 ordine per stessa proprietà+data)
      const duplicates: DuplicateGroup[] = [];
      let totalDuplicateOrders = 0;

      for (const [key, orders] of groups) {
        if (orders.length <= 1) continue;

        totalDuplicateOrders += orders.length;
        const [propertyId, date] = key.split("__");
        const propertyName = propsMap.get(propertyId) || propertyId;

        // Trova le pulizie collegate
        const cleaningIds = new Set(orders.map(o => o.cleaningId).filter(Boolean));
        const relatedCleanings = allCleanings.filter(c => 
          cleaningIds.has(c.id) || 
          (c.propertyId === propertyId && c.scheduledDate?.toDate?.()?.toISOString().split('T')[0] === date)
        );

        // Analizza il tipo di duplicato
        let issue = "";
        const uniqueCleaningIds = new Set(orders.map(o => o.cleaningId).filter(Boolean));
        const uniqueItemSets = new Set(orders.map(o => 
          (o.items || []).map((i: any) => `${i.id}:${i.quantity}`).sort().join("|")
        ));

        if (uniqueCleaningIds.size > 1) {
          issue = "🔴 Ordini collegati a PULIZIE DIVERSE sulla stessa data";
        } else if (uniqueCleaningIds.size === 1 && orders.length > 1) {
          issue = "🟡 Più ordini per la STESSA PULIZIA";
        } else {
          issue = "🟠 Ordini senza cleaningId chiaro";
        }

        if (uniqueItemSets.size > 1) {
          issue += " + ⚠️ ITEMS DIVERSI tra gli ordini";
        } else {
          issue += " + items identici";
        }

        duplicates.push({
          propertyId,
          propertyName,
          date,
          orders: orders.map(o => ({
            id: o.id,
            cleaningId: o.cleaningId || "N/A",
            status: o.status,
            items: o.items || [],
            itemsSummary: (o.items || []).map((i: any) => `${i.name}×${i.quantity}`).join(", "),
            createdAt: o.createdAt?.toDate?.()?.toISOString() || "N/A",
          })),
          cleanings: relatedCleanings.map(c => ({
            id: c.id,
            status: c.status,
            bookingId: c.bookingId || "N/A",
            bookingSource: c.bookingSource || "N/A",
            guestName: c.guestName || "N/A",
            createdAt: c.createdAt?.toDate?.()?.toISOString() || "N/A",
          })),
          issue,
        });
      }

      // Ordina per data
      duplicates.sort((a, b) => a.date.localeCompare(b.date));

      // Analisi cause
      let causeDifferentCleanings = 0;
      let causeSameCleaning = 0;
      let causeNoCleaningId = 0;
      let causeDifferentItems = 0;

      for (const d of duplicates) {
        const uniqueCIds = new Set(d.orders.map(o => o.cleaningId).filter(c => c !== "N/A"));
        if (uniqueCIds.size > 1) causeDifferentCleanings++;
        else if (uniqueCIds.size === 1) causeSameCleaning++;
        else causeNoCleaningId++;

        const uniqueItems = new Set(d.orders.map(o => o.itemsSummary));
        if (uniqueItems.size > 1) causeDifferentItems++;
      }

      setSummary({
        totalOrders: allOrders.length,
        activeOrders: activeOrders.length,
        duplicateGroups: duplicates.length,
        totalDuplicateOrders,
        causeDifferentCleanings,
        causeSameCleaning,
        causeNoCleaningId,
        causeDifferentItems,
      });
      setResults(duplicates);

      addLog(`\n✅ Analisi completata:`);
      addLog(`  → ${duplicates.length} gruppi di duplicati trovati`);
      addLog(`  → ${totalDuplicateOrders} ordini coinvolti`);
      addLog(`  → ${causeDifferentCleanings} con pulizie diverse`);
      addLog(`  → ${causeDifferentItems} con items diversi`);

    } catch (err: any) {
      addLog(`❌ Errore: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-800 mb-2">🔍 Analisi Ordini Duplicati</h1>
        <p className="text-slate-500 mb-6">Trova ordini biancheria duplicati sulla stessa proprietà + data</p>

        <button
          onClick={analyze}
          disabled={loading}
          className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-violet-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 mb-6"
        >
          {loading ? "⏳ Analisi in corso..." : "🔍 Avvia Analisi"}
        </button>

        {/* Log */}
        {log.length > 0 && (
          <div className="bg-slate-900 rounded-xl p-4 mb-6 font-mono text-xs text-green-400 max-h-48 overflow-y-auto">
            {log.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}

        {/* Summary */}
        {summary && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border p-4">
              <p className="text-2xl font-bold text-slate-800">{summary.duplicateGroups}</p>
              <p className="text-sm text-slate-500">Gruppi duplicati</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-2xl font-bold text-red-600">{summary.totalDuplicateOrders}</p>
              <p className="text-sm text-slate-500">Ordini coinvolti</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-2xl font-bold text-amber-600">{summary.causeDifferentCleanings}</p>
              <p className="text-sm text-slate-500">Pulizie diverse</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-2xl font-bold text-violet-600">{summary.causeDifferentItems}</p>
              <p className="text-sm text-slate-500">Items diversi</p>
            </div>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-4">
            {results.map((group, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="bg-red-50 border-b border-red-100 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-slate-800">{group.propertyName}</h3>
                      <p className="text-sm text-slate-500">📅 {group.date} — {group.orders.length} ordini</p>
                    </div>
                    <span className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded-full font-medium">{group.issue}</span>
                  </div>
                </div>
                <div className="p-4">
                  {/* Ordini */}
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Ordini</p>
                  <div className="space-y-2 mb-4">
                    {group.orders.map((o, j) => (
                      <div key={j} className="bg-slate-50 rounded-lg p-3 text-sm">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs text-slate-400">{o.id.slice(0, 8)}...</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            o.status === "DELIVERED" ? "bg-emerald-100 text-emerald-700" :
                            o.status === "PENDING" ? "bg-amber-100 text-amber-700" :
                            "bg-slate-100 text-slate-600"
                          }`}>{o.status}</span>
                          <span className="text-xs text-slate-400">cleaningId: {o.cleaningId.slice(0, 8)}...</span>
                        </div>
                        <p className="text-xs text-slate-600">📦 {o.itemsSummary || "Nessun item"}</p>
                        <p className="text-[10px] text-slate-400 mt-1">Creato: {o.createdAt}</p>
                      </div>
                    ))}
                  </div>

                  {/* Pulizie collegate */}
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Pulizie collegate</p>
                  <div className="space-y-2">
                    {group.cleanings.map((c, j) => (
                      <div key={j} className="bg-blue-50 rounded-lg p-3 text-sm">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs text-slate-400">{c.id.slice(0, 8)}...</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            c.status === "COMPLETED" ? "bg-emerald-100 text-emerald-700" :
                            c.status === "SCHEDULED" ? "bg-sky-100 text-sky-700" :
                            "bg-slate-100 text-slate-600"
                          }`}>{c.status}</span>
                          <span className="text-xs text-slate-500">👤 {c.guestName}</span>
                        </div>
                        <p className="text-xs text-slate-400">Fonte: {c.bookingSource} — bookingId: {c.bookingId.slice(0, 8)}...</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {results.length === 0 && summary && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-8 text-center">
            <p className="text-xl font-bold text-emerald-700">✅ Nessun duplicato trovato!</p>
            <p className="text-sm text-emerald-600 mt-1">Tutti gli ordini sono unici per proprietà + data</p>
          </div>
        )}
      </div>
    </div>
  );
}
