"use client";

import { useState } from "react";
import { collection, getDocs, doc, deleteDoc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

interface CleaningDupGroup {
  type: "cleaning_dup";
  propertyId: string;
  propertyName: string;
  date: string;
  keepCleaning: { id: string; bookingId: string; status: string; createdAt: string };
  deleteClearnings: { id: string; bookingId: string; status: string; createdAt: string }[];
  keepOrder: { id: string; cleaningId: string; status: string; itemsCount: number; itemsSummary: string; createdAt: string } | null;
  deleteOrders: { id: string; cleaningId: string; status: string; itemsCount: number; itemsSummary: string; createdAt: string }[];
}

interface OrderDupGroup {
  type: "order_dup";
  propertyId: string;
  propertyName: string;
  date: string;
  cleaningId: string;
  cleaningStatus: string;
  keepOrder: { id: string; status: string; itemsCount: number; totalQty: number; itemsSummary: string; createdAt: string };
  deleteOrders: { id: string; status: string; itemsCount: number; totalQty: number; itemsSummary: string; createdAt: string }[];
}

type DupGroup = CleaningDupGroup | OrderDupGroup;

export default function CleanupDuplicatesPage() {
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState<DupGroup[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [deleted, setDeleted] = useState(false);
  const [dryRun, setDryRun] = useState(true);

  const addLog = (msg: string) => setLog(prev => [...prev, msg]);

  const getItemsSummary = (items: any[]) => (items || []).map((i: any) => `${i.name}×${i.quantity}`).join(", ");
  const getTotalQty = (items: any[]) => (items || []).reduce((s: number, i: any) => s + (i.quantity || 0), 0);

  const analyze = async () => {
    setAnalyzing(true);
    setResults([]);
    setLog([]);
    setDeleted(false);

    try {
      addLog("📦 Caricamento dati...");
      const [ordersSnap, cleaningsSnap, propsSnap] = await Promise.all([
        getDocs(collection(db, "orders")),
        getDocs(collection(db, "cleanings")),
        getDocs(collection(db, "properties")),
      ]);

      const allOrders = ordersSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
      const allCleanings = cleaningsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
      const propsMap = new Map<string, string>();
      propsSnap.docs.forEach(d => propsMap.set(d.id, (d.data() as any).name || d.id));

      addLog(`  → ${allCleanings.length} pulizie, ${allOrders.length} ordini, ${propsMap.size} proprietà`);

      const allResults: DupGroup[] = [];

      // =============================================
      // PASSAGGIO 1: Pulizie duplicate (stessa proprietà + data)
      // =============================================
      addLog("\n🔍 Passaggio 1: Pulizie duplicate...");
      
      const cleaningGroups = new Map<string, any[]>();
      for (const c of allCleanings) {
        if (c.status === "CANCELLED") continue;
        const d = c.scheduledDate?.toDate?.();
        if (!d) continue;
        const key = `${c.propertyId}__${d.toISOString().split('T')[0]}`;
        if (!cleaningGroups.has(key)) cleaningGroups.set(key, []);
        cleaningGroups.get(key)!.push(c);
      }

      const ordersByCleaningId = new Map<string, any[]>();
      for (const o of allOrders) {
        if (o.status === "CANCELLED") continue;
        if (!o.cleaningId) continue;
        if (!ordersByCleaningId.has(o.cleaningId)) ordersByCleaningId.set(o.cleaningId, []);
        ordersByCleaningId.get(o.cleaningId)!.push(o);
      }

      for (const [key, cleanings] of cleaningGroups) {
        if (cleanings.length <= 1) continue;

        const [propertyId, date] = key.split("__");
        const propertyName = propsMap.get(propertyId) || propertyId;

        const statusPriority: Record<string, number> = { COMPLETED: 4, IN_PROGRESS: 3, ASSIGNED: 2, SCHEDULED: 1 };
        cleanings.sort((a: any, b: any) => (statusPriority[b.status] || 0) - (statusPriority[a.status] || 0));

        const keepCleaning = cleanings[0];
        const deleteClearnings = cleanings.slice(1).filter((c: any) => c.status === "SCHEDULED" || c.status === "ASSIGNED");

        if (deleteClearnings.length === 0) continue;

        const allRelatedOrders: any[] = [];
        for (const c of cleanings) {
          const orders = ordersByCleaningId.get(c.id) || [];
          orders.forEach((o: any) => allRelatedOrders.push({ ...o, _fromCleaningId: c.id }));
        }

        let keepOrder = null;
        const deleteOrders: any[] = [];

        if (allRelatedOrders.length > 0) {
          const orderOfKept = allRelatedOrders.find((o: any) => o._fromCleaningId === keepCleaning.id);
          if (orderOfKept) {
            keepOrder = orderOfKept;
            deleteOrders.push(...allRelatedOrders.filter((o: any) => o.id !== orderOfKept.id));
          } else {
            allRelatedOrders.sort((a: any, b: any) => getTotalQty(b.items) - getTotalQty(a.items));
            keepOrder = allRelatedOrders[0];
            deleteOrders.push(...allRelatedOrders.slice(1));
          }
        }

        const safeDeleteOrders = deleteOrders.filter((o: any) => o.status === "PENDING" || o.status === "PICKING");

        allResults.push({
          type: "cleaning_dup",
          propertyId,
          propertyName,
          date,
          keepCleaning: {
            id: keepCleaning.id,
            bookingId: keepCleaning.bookingId || "N/A",
            status: keepCleaning.status,
            createdAt: keepCleaning.createdAt?.toDate?.()?.toISOString() || "N/A",
          },
          deleteClearnings: deleteClearnings.map((c: any) => ({
            id: c.id, bookingId: c.bookingId || "N/A", status: c.status,
            createdAt: c.createdAt?.toDate?.()?.toISOString() || "N/A",
          })),
          keepOrder: keepOrder ? {
            id: keepOrder.id, cleaningId: keepOrder.cleaningId || keepOrder._fromCleaningId,
            status: keepOrder.status, itemsCount: (keepOrder.items || []).length,
            itemsSummary: getItemsSummary(keepOrder.items),
            createdAt: keepOrder.createdAt?.toDate?.()?.toISOString() || "N/A",
          } : null,
          deleteOrders: safeDeleteOrders.map((o: any) => ({
            id: o.id, cleaningId: o.cleaningId || o._fromCleaningId,
            status: o.status, itemsCount: (o.items || []).length,
            itemsSummary: getItemsSummary(o.items),
            createdAt: o.createdAt?.toDate?.()?.toISOString() || "N/A",
          })),
        });
      }

      addLog(`  → ${allResults.length} gruppi con pulizie duplicate`);

      // =============================================
      // PASSAGGIO 2: Ordini duplicati per stessa pulizia (1 pulizia → N ordini)
      // =============================================
      addLog("\n🔍 Passaggio 2: Ordini duplicati per stessa pulizia...");

      // IDs delle pulizie già gestite nel passaggio 1
      const handledCleaningIds = new Set<string>();
      for (const r of allResults) {
        if (r.type === "cleaning_dup") {
          handledCleaningIds.add(r.keepCleaning.id);
          r.deleteClearnings.forEach(c => handledCleaningIds.add(c.id));
        }
      }

      let orderDupCount = 0;
      for (const [cleaningId, orders] of ordersByCleaningId) {
        if (orders.length <= 1) continue;
        if (handledCleaningIds.has(cleaningId)) continue; // Già gestito nel passaggio 1

        // Trova la pulizia
        const cleaning = allCleanings.find(c => c.id === cleaningId);
        if (!cleaning) continue;

        const propertyId = cleaning.propertyId;
        const propertyName = propsMap.get(propertyId) || propertyId;
        const d = cleaning.scheduledDate?.toDate?.();
        const date = d ? d.toISOString().split('T')[0] : "N/A";

        // Mantieni l'ordine con più quantità totali (il più completo)
        const sorted = [...orders].sort((a: any, b: any) => getTotalQty(b.items) - getTotalQty(a.items));
        const keepOrder = sorted[0];
        const deleteOrders = sorted.slice(1).filter((o: any) => o.status === "PENDING" || o.status === "PICKING");

        if (deleteOrders.length === 0) continue;
        orderDupCount++;

        allResults.push({
          type: "order_dup",
          propertyId,
          propertyName,
          date,
          cleaningId,
          cleaningStatus: cleaning.status,
          keepOrder: {
            id: keepOrder.id, status: keepOrder.status,
            itemsCount: (keepOrder.items || []).length,
            totalQty: getTotalQty(keepOrder.items),
            itemsSummary: getItemsSummary(keepOrder.items),
            createdAt: keepOrder.createdAt?.toDate?.()?.toISOString() || "N/A",
          },
          deleteOrders: deleteOrders.map((o: any) => ({
            id: o.id, status: o.status,
            itemsCount: (o.items || []).length,
            totalQty: getTotalQty(o.items),
            itemsSummary: getItemsSummary(o.items),
            createdAt: o.createdAt?.toDate?.()?.toISOString() || "N/A",
          })),
        });
      }

      addLog(`  → ${orderDupCount} pulizie con ordini duplicati`);

      // Sort all results by date
      allResults.sort((a, b) => a.date.localeCompare(b.date));

      const totalDeleteCleanings = allResults.filter(r => r.type === "cleaning_dup").reduce((s, r) => s + (r as CleaningDupGroup).deleteClearnings.length, 0);
      const totalDeleteOrders = allResults.reduce((s, r) => {
        if (r.type === "cleaning_dup") return s + (r as CleaningDupGroup).deleteOrders.length;
        return s + (r as OrderDupGroup).deleteOrders.length;
      }, 0);

      addLog(`\n✅ Analisi completata:`);
      addLog(`  → ${allResults.length} gruppi totali`);
      addLog(`  → ${totalDeleteCleanings} pulizie da eliminare`);
      addLog(`  → ${totalDeleteOrders} ordini da eliminare`);
      addLog(`  → SICUREZZA: Non elimina mai COMPLETED, IN_PROGRESS, DELIVERED`);

      setResults(allResults);
    } catch (err: any) {
      addLog(`❌ Errore: ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const executeCleanup = async () => {
    if (dryRun) {
      addLog("\n🔍 DRY RUN — nessuna modifica effettuata");
      addLog("Disattiva 'Modalità sicura' per eseguire la pulizia reale");
      return;
    }

    const totalDC = results.filter(r => r.type === "cleaning_dup").reduce((s, r) => s + (r as CleaningDupGroup).deleteClearnings.length, 0);
    const totalDO = results.reduce((s, r) => {
      if (r.type === "cleaning_dup") return s + (r as CleaningDupGroup).deleteOrders.length;
      return s + (r as OrderDupGroup).deleteOrders.length;
    }, 0);

    if (!confirm(`Sei sicuro? Verranno eliminati ${totalDC} pulizie e ${totalDO} ordini duplicati.\n\nQuesta azione è IRREVERSIBILE.`)) return;

    setLoading(true);
    let deletedCleanings = 0, deletedOrders = 0, errors = 0;

    for (const group of results) {
      if (group.type === "cleaning_dup") {
        const g = group as CleaningDupGroup;
        for (const o of g.deleteOrders) {
          try { await deleteDoc(doc(db, "orders", o.id)); deletedOrders++; addLog(`🗑️ Ordine ${o.id.slice(0, 8)}... eliminato (${g.propertyName} ${g.date})`); }
          catch (err: any) { errors++; addLog(`❌ Errore ordine ${o.id.slice(0, 8)}: ${err.message}`); }
        }
        for (const c of g.deleteClearnings) {
          try { await deleteDoc(doc(db, "cleanings", c.id)); deletedCleanings++; addLog(`🗑️ Pulizia ${c.id.slice(0, 8)}... eliminata (${g.propertyName} ${g.date})`); }
          catch (err: any) { errors++; addLog(`❌ Errore pulizia ${c.id.slice(0, 8)}: ${err.message}`); }
        }
        // Ricollega ordine mantenuto alla pulizia mantenuta
        if (g.keepOrder) {
          const isOrphan = g.deleteClearnings.some(c => c.id === g.keepOrder!.cleaningId);
          if (isOrphan) {
            try { await updateDoc(doc(db, "orders", g.keepOrder.id), { cleaningId: g.keepCleaning.id, updatedAt: Timestamp.now() }); addLog(`🔗 Ordine ${g.keepOrder.id.slice(0, 8)}... ricollegato`); }
            catch (err: any) { addLog(`⚠️ Errore ricollegamento: ${err.message}`); }
          }
        }
      } else {
        const g = group as OrderDupGroup;
        for (const o of g.deleteOrders) {
          try { await deleteDoc(doc(db, "orders", o.id)); deletedOrders++; addLog(`🗑️ Ordine ${o.id.slice(0, 8)}... eliminato (${g.propertyName} ${g.date})`); }
          catch (err: any) { errors++; addLog(`❌ Errore ordine ${o.id.slice(0, 8)}: ${err.message}`); }
        }
      }
    }

    addLog(`\n✅ CLEANUP COMPLETATO: ${deletedCleanings} pulizie + ${deletedOrders} ordini eliminati` + (errors > 0 ? ` (${errors} errori)` : ""));
    setDeleted(true);
    setLoading(false);
  };

  const totalDeleteCleanings = results.filter(r => r.type === "cleaning_dup").reduce((s, r) => s + (r as CleaningDupGroup).deleteClearnings.length, 0);
  const totalDeleteOrders = results.reduce((s, r) => {
    if (r.type === "cleaning_dup") return s + (r as CleaningDupGroup).deleteOrders.length;
    return s + (r as OrderDupGroup).deleteOrders.length;
  }, 0);

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-800 mb-2">🧹 Pulizia Duplicati</h1>
        <p className="text-slate-500 mb-6">Elimina pulizie e ordini duplicati in sicurezza</p>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-semibold text-amber-800">Regole di sicurezza</p>
              <ul className="text-sm text-amber-700 mt-1 space-y-1">
                <li>• <strong>Passaggio 1:</strong> Trova pulizie duplicate (stessa proprietà + data) → elimina copie extra</li>
                <li>• <strong>Passaggio 2:</strong> Trova ordini duplicati per la stessa pulizia → mantiene il più completo</li>
                <li>• NON elimina mai pulizie <strong>COMPLETED</strong> o <strong>IN_PROGRESS</strong></li>
                <li>• NON elimina mai ordini <strong>DELIVERED</strong> o <strong>IN_TRANSIT</strong></li>
                <li>• Mantiene l'ordine con <strong>più articoli</strong> (il più completo)</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mb-6 flex-wrap">
          <button onClick={analyze} disabled={analyzing} className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-violet-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50">
            {analyzing ? "⏳ Analisi..." : "🔍 Analizza Duplicati"}
          </button>
          {results.length > 0 && !deleted && (
            <>
              <label className="flex items-center gap-2 px-4 py-3 bg-white rounded-xl border border-slate-200 cursor-pointer">
                <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} className="w-4 h-4 rounded border-slate-300" />
                <span className="text-sm font-medium text-slate-700">Modalità sicura (dry run)</span>
              </label>
              <button onClick={executeCleanup} disabled={loading} className={`px-6 py-3 rounded-xl font-semibold shadow-lg transition-all disabled:opacity-50 ${dryRun ? "bg-slate-500 text-white" : "bg-gradient-to-r from-red-500 to-rose-600 text-white hover:shadow-xl"}`}>
                {loading ? "⏳ Eliminazione..." : dryRun ? "🔍 Simula Pulizia" : `🗑️ Elimina ${totalDeleteCleanings} pulizie + ${totalDeleteOrders} ordini`}
              </button>
            </>
          )}
        </div>

        {log.length > 0 && (
          <div className="bg-slate-900 rounded-xl p-4 mb-6 font-mono text-xs text-green-400 max-h-64 overflow-y-auto">
            {log.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}

        {results.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border p-4">
              <p className="text-2xl font-bold text-slate-800">{results.length}</p>
              <p className="text-sm text-slate-500">Gruppi duplicati</p>
            </div>
            <div className="bg-white rounded-xl border border-red-200 p-4">
              <p className="text-2xl font-bold text-red-600">{totalDeleteCleanings}</p>
              <p className="text-sm text-slate-500">Pulizie da eliminare</p>
            </div>
            <div className="bg-white rounded-xl border border-red-200 p-4">
              <p className="text-2xl font-bold text-red-600">{totalDeleteOrders}</p>
              <p className="text-sm text-slate-500">Ordini da eliminare</p>
            </div>
            <div className="bg-white rounded-xl border border-emerald-200 p-4">
              <p className="text-2xl font-bold text-emerald-600">{results.filter(r => r.type === "cleaning_dup").length + "+" + results.filter(r => r.type === "order_dup").length}</p>
              <p className="text-sm text-slate-500">Pulizie dup + Ordini dup</p>
            </div>
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-4">
            {results.map((group, i) => group.type === "cleaning_dup" ? (
              // ===== CARD: Pulizie duplicate =====
              <div key={i} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="bg-red-50 border-b border-red-100 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-red-200 text-red-800 px-2 py-0.5 rounded-full font-bold">PULIZIE DUP</span>
                        <h3 className="font-bold text-slate-800">{group.propertyName}</h3>
                      </div>
                      <p className="text-sm text-slate-500">📅 {group.date}</p>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">-{(group as CleaningDupGroup).deleteClearnings.length} pulizie</span>
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">-{(group as CleaningDupGroup).deleteOrders.length} ordini</span>
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-2">✅ Pulizia mantenuta</p>
                  <div className="bg-emerald-50 rounded-lg p-2 text-sm mb-3 border border-emerald-100">
                    <span className="font-mono text-xs text-slate-400">{(group as CleaningDupGroup).keepCleaning.id.slice(0, 12)}...</span>
                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full font-medium bg-sky-100 text-sky-700">{(group as CleaningDupGroup).keepCleaning.status}</span>
                  </div>
                  <p className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-2">🗑️ Da eliminare ({(group as CleaningDupGroup).deleteClearnings.length} pulizie + {(group as CleaningDupGroup).deleteOrders.length} ordini)</p>
                  <div className="space-y-1">
                    {(group as CleaningDupGroup).deleteClearnings.map((c, j) => (
                      <div key={j} className="bg-red-50 rounded-lg p-2 text-sm border border-red-100">
                        <span className="font-mono text-xs text-slate-400">{c.id.slice(0, 12)}...</span>
                        <span className="ml-2 text-xs text-red-600">Pulizia {c.status}</span>
                      </div>
                    ))}
                    {(group as CleaningDupGroup).deleteOrders.map((o, j) => (
                      <div key={`o${j}`} className="bg-orange-50 rounded-lg p-2 text-sm border border-orange-100">
                        <span className="font-mono text-xs text-slate-400">{o.id.slice(0, 12)}...</span>
                        <span className="ml-2 text-xs text-orange-600">Ordine {o.status} ({o.itemsCount} items)</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              // ===== CARD: Ordini duplicati per stessa pulizia =====
              <div key={i} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="bg-amber-50 border-b border-amber-100 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-bold">ORDINI DUP</span>
                        <h3 className="font-bold text-slate-800">{group.propertyName}</h3>
                      </div>
                      <p className="text-sm text-slate-500">📅 {group.date} — 1 pulizia, {(group as OrderDupGroup).deleteOrders.length + 1} ordini</p>
                    </div>
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium">-{(group as OrderDupGroup).deleteOrders.length} ordini</span>
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-2">✅ Ordine mantenuto (più completo)</p>
                  <div className="bg-emerald-50 rounded-lg p-3 text-sm mb-3 border border-emerald-100">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-slate-400">{(group as OrderDupGroup).keepOrder.id.slice(0, 12)}...</span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-sky-100 text-sky-700">{(group as OrderDupGroup).keepOrder.status}</span>
                      <span className="text-xs text-emerald-600 font-semibold">{(group as OrderDupGroup).keepOrder.totalQty} articoli tot</span>
                    </div>
                    <p className="text-xs text-slate-500 truncate">📦 {(group as OrderDupGroup).keepOrder.itemsSummary}</p>
                  </div>
                  <p className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-2">🗑️ Ordini da eliminare ({(group as OrderDupGroup).deleteOrders.length})</p>
                  <div className="space-y-1">
                    {(group as OrderDupGroup).deleteOrders.map((o, j) => (
                      <div key={j} className="bg-red-50 rounded-lg p-3 text-sm border border-red-100">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs text-slate-400">{o.id.slice(0, 12)}...</span>
                          <span className="text-xs text-red-600">{o.status}</span>
                          <span className="text-xs text-slate-400">{o.totalQty} articoli</span>
                        </div>
                        <p className="text-xs text-slate-400 truncate">📦 {o.itemsSummary}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {results.length === 0 && !analyzing && log.length > 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-8 text-center">
            <p className="text-xl font-bold text-emerald-700">✅ Nessun duplicato trovato!</p>
          </div>
        )}
      </div>
    </div>
  );
}
