"use client";

/**
 * 🔍 Debug — Pulizie senza ordini biancheria
 * URL: /dashboard/debug-linen
 * Mostra TUTTE le pulizie future con stato ordine biancheria
 */

import { useState, useEffect } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import {
  collection, query, where, getDocs, orderBy, Timestamp
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export default function DebugLinenPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [propFilter, setPropFilter] = useState("");
  const [fixing, setFixing] = useState(false);

  const runDiagnosis = async () => {
    setLoading(true);
    setData(null);
    try {
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      // Carica tutte le proprietà attive
      const propsSnap = await getDocs(
        query(collection(db, "properties"), where("status", "==", "ACTIVE"))
      );
      const props = propsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

      // Carica tutte le pulizie future
      const cleaningsSnap = await getDocs(
        query(collection(db, "cleanings"),
          where("scheduledDate", ">=", Timestamp.fromDate(now)),
          orderBy("scheduledDate", "asc")
        )
      );
      const cleanings = cleaningsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

      // Carica tutti gli ordini
      const ordersSnap = await getDocs(collection(db, "orders"));
      const orders = ordersSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

      // Mappa ordini per cleaningId e per data
      const ordersByCleaningId = new Map<string, any[]>();
      const ordersByDate = new Map<string, any[]>();
      orders.forEach(o => {
        if (o.cleaningId) {
          if (!ordersByCleaningId.has(o.cleaningId)) ordersByCleaningId.set(o.cleaningId, []);
          ordersByCleaningId.get(o.cleaningId)!.push(o);
        }
        const dateStr = o.scheduledDate?.toDate?.()?.toISOString().split('T')[0];
        if (dateStr) {
          if (!ordersByDate.has(dateStr)) ordersByDate.set(dateStr, []);
          ordersByDate.get(dateStr)!.push(o);
        }
      });

      // Analizza ogni pulizia
      const results: any[] = [];
      for (const c of cleanings) {
        const prop = props.find(p => p.id === c.propertyId);
        if (!prop) continue;

        // Filtra per proprietà se specificato
        if (propFilter && !prop.name.toLowerCase().includes(propFilter.toLowerCase())) continue;

        if (!["SCHEDULED", "ASSIGNED", "IN_PROGRESS"].includes(c.status)) continue;

        const dateStr = c.scheduledDate?.toDate?.()?.toISOString().split('T')[0];
        const ordersByC = ordersByCleaningId.get(c.id) || [];
        const ordersByD = ordersByDate.get(dateStr || '') || [];

        const activeOrders = ordersByC.filter(o => o.status !== 'CANCELLED');
        const cancelledOrders = ordersByC.filter(o => o.status === 'CANCELLED');
        const activeByDate = ordersByD.filter(o => o.status !== 'CANCELLED' && o.propertyId === c.propertyId);
        const cancelledByDate = ordersByD.filter(o => o.status === 'CANCELLED' && o.propertyId === c.propertyId);

        const usesOwnLinen = prop.usesOwnLinen === true;
        const hasActiveOrder = activeOrders.length > 0 || activeByDate.length > 0;
        const hasCancelledOnly = !hasActiveOrder && (cancelledOrders.length > 0 || cancelledByDate.length > 0);
        
        // Controlla serviceConfigs
        const guestsCount = c.guestsCount || prop.maxGuests || 2;
        const hasConfig = prop.serviceConfigs && 
          (prop.serviceConfigs[guestsCount] || prop.serviceConfigs[String(guestsCount)]);

        results.push({
          cleaningId: c.id,
          propertyName: prop.name,
          propertyId: prop.id,
          date: dateStr,
          guestName: c.guestName,
          guestsCount,
          status: c.status,
          usesOwnLinen,
          hasActiveOrder,
          hasCancelledOnly,
          activeOrders: activeOrders.map(o => ({ id: o.id, status: o.status, type: o.type })),
          cancelledOrders: cancelledOrders.map(o => ({ id: o.id, status: o.status })),
          activeByDate: activeByDate.map(o => ({ id: o.id, status: o.status })),
          cancelledByDate: cancelledByDate.map(o => ({ id: o.id, status: o.status })),
          laundryOrderId: c.laundryOrderId || null,
          hasConfig: !!hasConfig,
          problem: !usesOwnLinen && !hasActiveOrder
            ? hasCancelledOnly
              ? "⚠️ Solo ordini CANCELLED — bloccano creazione nuovo ordine"
              : !hasConfig
                ? "❌ Nessun ordine + serviceConfigs mancante per " + guestsCount + " ospiti"
                : "❌ Nessun ordine biancheria"
            : usesOwnLinen
              ? "ℹ️ Usa biancheria propria"
              : "✅ Ordine presente",
        });
      }

      // Statistiche
      const missing = results.filter(r => !r.usesOwnLinen && !r.hasActiveOrder);
      const withCancelled = results.filter(r => r.hasCancelledOnly);
      const noConfig = results.filter(r => !r.usesOwnLinen && !r.hasActiveOrder && !r.hasConfig);

      setData({ results, missing, withCancelled, noConfig, total: results.length });
    } catch (err: any) {
      setData({ error: err.message });
    }
    setLoading(false);
  };

  const fixMissing = async () => {
    if (!confirm("Forza sync iCal per creare gli ordini mancanti?")) return;
    setFixing(true);
    try {
      const secret = prompt("Inserisci CRON_SECRET:");
      if (!secret) return;
      const res = await fetch(`/api/cron/sync-ical?force=true&secret=${secret}`);
      const d = await res.json();
      alert(`Sync completato!\nmissingOrdersFixed: ${d.stats?.missingOrdersFixed}\nlinenOrders: ${d.stats?.linenOrders}\nerrors: ${d.stats?.errors}`);
      runDiagnosis();
    } catch (e) {
      alert("Errore: " + e);
    }
    setFixing(false);
  };

  if (!user || user.role !== "ADMIN") {
    return <div className="p-8 text-red-500">Accesso negato</div>;
  }

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">🔍 Debug Biancheria — Pulizie senza Ordini</h1>
      <p className="text-gray-500 text-sm mb-4">Analizza tutte le pulizie future e il loro stato ordine biancheria</p>

      <div className="flex gap-3 mb-4 flex-wrap">
        <input
          value={propFilter}
          onChange={e => setPropFilter(e.target.value)}
          placeholder="Filtra per proprietà (es: Aubry)"
          className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-48"
        />
        <button onClick={runDiagnosis} disabled={loading}
          className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
          {loading ? "Analisi..." : "▶ Analizza"}
        </button>
        <button onClick={fixMissing} disabled={fixing || loading}
          className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
          {fixing ? "..." : "🔧 Forza Sync iCal"}
        </button>
      </div>

      {data?.error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">{data.error}</div>
      )}

      {data && !data.error && (
        <div className="space-y-4">
          {/* Statistiche */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Totale pulizie future", val: data.total, color: "blue" },
              { label: "❌ Senza ordine biancheria", val: data.missing.length, color: "red" },
              { label: "⚠️ Solo ordini CANCELLED", val: data.withCancelled.length, color: "amber" },
              { label: "❌ ServiceConfigs mancante", val: data.noConfig.length, color: "red" },
            ].map((s, i) => (
              <div key={i} className={`bg-white rounded-xl border p-3 text-center border-${s.color}-200`}>
                <p className="text-2xl font-bold">{s.val}</p>
                <p className="text-xs text-gray-500 mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Tabella pulizie problematiche */}
          {data.missing.length > 0 && (
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="bg-red-50 px-4 py-3 border-b border-red-200">
                <h2 className="font-bold text-red-800">❌ Pulizie senza ordine biancheria ({data.missing.length})</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      {["Data", "Proprietà", "Ospite", "Ospiti", "Stato", "Problema", "Ordini CANCELLED", "ServiceConfig"].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-medium text-gray-600 border-b">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.missing.map((r: any) => (
                      <tr key={r.cleaningId} className="border-b hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium">{r.date}</td>
                        <td className="px-3 py-2">{r.propertyName}</td>
                        <td className="px-3 py-2">{r.guestName || "—"}</td>
                        <td className="px-3 py-2">{r.guestsCount}</td>
                        <td className="px-3 py-2">
                          <span className="px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-800">{r.status}</span>
                        </td>
                        <td className="px-3 py-2 text-xs">{r.problem}</td>
                        <td className="px-3 py-2">
                          {r.cancelledOrders.length + r.cancelledByDate.length > 0
                            ? <span className="text-amber-600 font-medium">{r.cancelledOrders.length + r.cancelledByDate.length} CANCELLED</span>
                            : <span className="text-gray-400">nessuno</span>}
                        </td>
                        <td className="px-3 py-2">
                          {r.hasConfig
                            ? <span className="text-green-600">✅ {r.guestsCount} ospiti</span>
                            : <span className="text-red-600">❌ mancante</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tutte le pulizie */}
          <details className="bg-white rounded-xl border">
            <summary className="px-4 py-3 cursor-pointer font-medium text-gray-700">
              📋 Tutte le pulizie future ({data.results.length})
            </summary>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    {["Data", "Proprietà", "Ospite", "N.Ospiti", "Stato", "Biancheria"].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-gray-600 border-b">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.results.map((r: any) => (
                    <tr key={r.cleaningId} className={`border-b hover:bg-gray-50 ${!r.usesOwnLinen && !r.hasActiveOrder ? 'bg-red-50' : ''}`}>
                      <td className="px-3 py-2 font-medium">{r.date}</td>
                      <td className="px-3 py-2">{r.propertyName}</td>
                      <td className="px-3 py-2">{r.guestName || "—"}</td>
                      <td className="px-3 py-2">{r.guestsCount}</td>
                      <td className="px-3 py-2">{r.status}</td>
                      <td className="px-3 py-2 text-xs">{r.problem}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
