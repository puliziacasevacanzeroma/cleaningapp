"use client";

import { useState } from "react";
import { collection, getDocs, doc, deleteDoc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

interface DuplicateGroup {
  propertyId: string;
  propertyName: string;
  date: string;
  // La pulizia da MANTENERE (la prima creata, o quella con più info)
  keepCleaning: { id: string; bookingId: string; status: string; createdAt: string; hasOrder: boolean };
  // Le pulizie da ELIMINARE
  deleteClearnings: { id: string; bookingId: string; status: string; createdAt: string }[];
  // L'ordine da MANTENERE (quello collegato alla pulizia mantenuta, o il primo con più items)
  keepOrder: { id: string; cleaningId: string; status: string; itemsCount: number; createdAt: string } | null;
  // Gli ordini da ELIMINARE
  deleteOrders: { id: string; cleaningId: string; status: string; itemsCount: number; createdAt: string }[];
}

export default function CleanupDuplicatesPage() {
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState<DuplicateGroup[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [deleted, setDeleted] = useState(false);
  const [dryRun, setDryRun] = useState(true);

  const addLog = (msg: string) => setLog(prev => [...prev, msg]);

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

      // Raggruppa pulizie per propertyId + data (solo non-cancellate)
      const cleaningGroups = new Map<string, any[]>();
      for (const c of allCleanings) {
        if (c.status === "CANCELLED") continue;
        const d = c.scheduledDate?.toDate?.();
        if (!d) continue;
        const key = `${c.propertyId}__${d.toISOString().split('T')[0]}`;
        if (!cleaningGroups.has(key)) cleaningGroups.set(key, []);
        cleaningGroups.get(key)!.push(c);
      }

      // Mappa ordini per cleaningId
      const ordersByCleaningId = new Map<string, any[]>();
      for (const o of allOrders) {
        if (o.status === "CANCELLED") continue;
        if (!o.cleaningId) continue;
        if (!ordersByCleaningId.has(o.cleaningId)) ordersByCleaningId.set(o.cleaningId, []);
        ordersByCleaningId.get(o.cleaningId)!.push(o);
      }

      const duplicates: DuplicateGroup[] = [];

      for (const [key, cleanings] of cleaningGroups) {
        if (cleanings.length <= 1) continue;

        const [propertyId, date] = key.split("__");
        const propertyName = propsMap.get(propertyId) || propertyId;

        // Ordina per createdAt: la prima creata è quella da mantenere
        cleanings.sort((a, b) => {
          const aTime = a.createdAt?.toDate?.()?.getTime() || 0;
          const bTime = b.createdAt?.toDate?.()?.getTime() || 0;
          return aTime - bTime;
        });

        // REGOLA: Mantieni la pulizia che ha status più avanzato, oppure la prima
        // Priorità: COMPLETED > IN_PROGRESS > ASSIGNED > SCHEDULED
        const statusPriority: Record<string, number> = {
          COMPLETED: 4, IN_PROGRESS: 3, ASSIGNED: 2, SCHEDULED: 1
        };
        cleanings.sort((a, b) => (statusPriority[b.status] || 0) - (statusPriority[a.status] || 0));

        const keepCleaning = cleanings[0];
        const deleteClearnings = cleanings.slice(1).filter(c => {
          // NON eliminare pulizie COMPLETED o IN_PROGRESS — sono state lavorate
          return c.status === "SCHEDULED" || c.status === "ASSIGNED";
        });

        // Se non c'è nulla da eliminare (tutte COMPLETED/IN_PROGRESS), skip
        if (deleteClearnings.length === 0) continue;

        // Trova ordini collegati
        const allRelatedOrders: any[] = [];
        for (const c of cleanings) {
          const orders = ordersByCleaningId.get(c.id) || [];
          orders.forEach(o => allRelatedOrders.push({ ...o, _fromCleaningId: c.id }));
        }

        // Ordini da mantenere: quello della pulizia mantenuta, o quello con più items
        let keepOrder = null;
        const deleteOrders: any[] = [];

        if (allRelatedOrders.length > 0) {
          // Priorità: ordine della pulizia mantenuta → altrimenti quello con più items
          const orderOfKept = allRelatedOrders.find(o => o._fromCleaningId === keepCleaning.id);
          if (orderOfKept) {
            keepOrder = orderOfKept;
            deleteOrders.push(...allRelatedOrders.filter(o => o.id !== orderOfKept.id));
          } else {
            // Nessun ordine collegato alla pulizia mantenuta — tieni quello con più items
            allRelatedOrders.sort((a, b) => (b.items?.length || 0) - (a.items?.length || 0));
            keepOrder = allRelatedOrders[0];
            deleteOrders.push(...allRelatedOrders.slice(1));
          }
        }

        // Filtra: NON eliminare ordini DELIVERED (sono stati consegnati fisicamente)
        const safeDeleteOrders = deleteOrders.filter(o => {
          return o.status === "PENDING" || o.status === "PICKING";
        });

        duplicates.push({
          propertyId,
          propertyName,
          date,
          keepCleaning: {
            id: keepCleaning.id,
            bookingId: keepCleaning.bookingId || "N/A",
            status: keepCleaning.status,
            createdAt: keepCleaning.createdAt?.toDate?.()?.toISOString() || "N/A",
            hasOrder: !!(ordersByCleaningId.get(keepCleaning.id) || []).length,
          },
          deleteClearnings: deleteClearnings.map(c => ({
            id: c.id,
            bookingId: c.bookingId || "N/A",
            status: c.status,
            createdAt: c.createdAt?.toDate?.()?.toISOString() || "N/A",
          })),
          keepOrder: keepOrder ? {
            id: keepOrder.id,
            cleaningId: keepOrder.cleaningId || keepOrder._fromCleaningId,
            status: keepOrder.status,
            itemsCount: keepOrder.items?.length || 0,
            createdAt: keepOrder.createdAt?.toDate?.()?.toISOString() || "N/A",
          } : null,
          deleteOrders: safeDeleteOrders.map(o => ({
            id: o.id,
            cleaningId: o.cleaningId || o._fromCleaningId,
            status: o.status,
            itemsCount: o.items?.length || 0,
            createdAt: o.createdAt?.toDate?.()?.toISOString() || "N/A",
          })),
        });
      }

      duplicates.sort((a, b) => a.date.localeCompare(b.date));

      const totalDeleteCleanings = duplicates.reduce((s, d) => s + d.deleteClearnings.length, 0);
      const totalDeleteOrders = duplicates.reduce((s, d) => s + d.deleteOrders.length, 0);

      addLog(`\n✅ Analisi completata:`);
      addLog(`  → ${duplicates.length} gruppi di duplicati`);
      addLog(`  → ${totalDeleteCleanings} pulizie da eliminare`);
      addLog(`  → ${totalDeleteOrders} ordini da eliminare`);
      addLog(`  → SICUREZZA: Non elimina mai COMPLETED, IN_PROGRESS, DELIVERED`);

      setResults(duplicates);
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

    if (!confirm(`Sei sicuro? Verranno eliminati ${results.reduce((s, d) => s + d.deleteClearnings.length, 0)} pulizie e ${results.reduce((s, d) => s + d.deleteOrders.length, 0)} ordini duplicati.\n\nQuesta azione è IRREVERSIBILE.`)) return;

    setLoading(true);
    let deletedCleanings = 0;
    let deletedOrders = 0;
    let errors = 0;

    for (const group of results) {
      // 1. Elimina ordini duplicati
      for (const o of group.deleteOrders) {
        try {
          await deleteDoc(doc(db, "orders", o.id));
          deletedOrders++;
          addLog(`🗑️ Ordine ${o.id.slice(0, 8)}... eliminato (${group.propertyName} ${group.date})`);
        } catch (err: any) {
          errors++;
          addLog(`❌ Errore eliminazione ordine ${o.id.slice(0, 8)}: ${err.message}`);
        }
      }

      // 2. Elimina pulizie duplicate
      for (const c of group.deleteClearnings) {
        try {
          await deleteDoc(doc(db, "cleanings", c.id));
          deletedCleanings++;
          addLog(`🗑️ Pulizia ${c.id.slice(0, 8)}... eliminata (${group.propertyName} ${group.date})`);
        } catch (err: any) {
          errors++;
          addLog(`❌ Errore eliminazione pulizia ${c.id.slice(0, 8)}: ${err.message}`);
        }
      }

      // 3. Se l'ordine mantenuto è collegato a una pulizia eliminata, aggiorna il cleaningId
      if (group.keepOrder) {
        const keepOrderCleaningId = group.keepOrder.cleaningId;
        const isCleaningDeleted = group.deleteClearnings.some(c => c.id === keepOrderCleaningId);
        if (isCleaningDeleted) {
          try {
            await updateDoc(doc(db, "orders", group.keepOrder.id), {
              cleaningId: group.keepCleaning.id,
              updatedAt: Timestamp.now(),
            });
            addLog(`🔗 Ordine ${group.keepOrder.id.slice(0, 8)}... ricollegato a pulizia ${group.keepCleaning.id.slice(0, 8)}...`);
          } catch (err: any) {
            addLog(`⚠️ Errore aggiornamento ordine ${group.keepOrder.id.slice(0, 8)}: ${err.message}`);
          }
        }
      }
    }

    addLog(`\n✅ CLEANUP COMPLETATO:`);
    addLog(`  → ${deletedCleanings} pulizie eliminate`);
    addLog(`  → ${deletedOrders} ordini eliminati`);
    if (errors > 0) addLog(`  → ${errors} errori`);

    setDeleted(true);
    setLoading(false);
  };

  const totalDeleteCleanings = results.reduce((s, d) => s + d.deleteClearnings.length, 0);
  const totalDeleteOrders = results.reduce((s, d) => s + d.deleteOrders.length, 0);

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-800 mb-2">🧹 Pulizia Duplicati</h1>
        <p className="text-slate-500 mb-6">Elimina pulizie e ordini duplicati in sicurezza</p>

        {/* Warning */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-semibold text-amber-800">Regole di sicurezza</p>
              <ul className="text-sm text-amber-700 mt-1 space-y-1">
                <li>• NON elimina mai pulizie <strong>COMPLETED</strong> o <strong>IN_PROGRESS</strong></li>
                <li>• NON elimina mai ordini <strong>DELIVERED</strong> o <strong>IN_TRANSIT</strong></li>
                <li>• Mantiene sempre la pulizia con stato più avanzato</li>
                <li>• Mantiene l'ordine collegato alla pulizia mantenuta (o quello con più items)</li>
                <li>• Ricollega automaticamente gli ordini orfani alla pulizia mantenuta</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mb-6">
          <button
            onClick={analyze}
            disabled={analyzing}
            className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-violet-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
          >
            {analyzing ? "⏳ Analisi..." : "🔍 Analizza Duplicati"}
          </button>

          {results.length > 0 && !deleted && (
            <>
              <label className="flex items-center gap-2 px-4 py-3 bg-white rounded-xl border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300"
                />
                <span className="text-sm font-medium text-slate-700">Modalità sicura (dry run)</span>
              </label>

              <button
                onClick={executeCleanup}
                disabled={loading}
                className={`px-6 py-3 rounded-xl font-semibold shadow-lg transition-all disabled:opacity-50 ${
                  dryRun
                    ? "bg-slate-500 text-white"
                    : "bg-gradient-to-r from-red-500 to-rose-600 text-white hover:shadow-xl"
                }`}
              >
                {loading ? "⏳ Eliminazione..." : dryRun ? "🔍 Simula Pulizia" : `🗑️ Elimina ${totalDeleteCleanings} pulizie + ${totalDeleteOrders} ordini`}
              </button>
            </>
          )}
        </div>

        {/* Log */}
        {log.length > 0 && (
          <div className="bg-slate-900 rounded-xl p-4 mb-6 font-mono text-xs text-green-400 max-h-64 overflow-y-auto">
            {log.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}

        {/* Summary */}
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
              <p className="text-2xl font-bold text-emerald-600">{results.length}</p>
              <p className="text-sm text-slate-500">Pulizie mantenute</p>
            </div>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-4">
            {results.map((group, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-200 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-slate-800">{group.propertyName}</h3>
                      <p className="text-sm text-slate-500">📅 {group.date}</p>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">
                        -{group.deleteClearnings.length} pulizie
                      </span>
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">
                        -{group.deleteOrders.length} ordini
                      </span>
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  {/* Pulizia mantenuta */}
                  <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-2">✅ Pulizia mantenuta</p>
                  <div className="bg-emerald-50 rounded-lg p-3 text-sm mb-3 border border-emerald-100">
                    <span className="font-mono text-xs text-slate-400">{group.keepCleaning.id.slice(0, 12)}...</span>
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${
                      group.keepCleaning.status === "COMPLETED" ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"
                    }`}>{group.keepCleaning.status}</span>
                  </div>

                  {/* Pulizie da eliminare */}
                  <p className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-2">🗑️ Pulizie da eliminare ({group.deleteClearnings.length})</p>
                  <div className="space-y-1 mb-3">
                    {group.deleteClearnings.map((c, j) => (
                      <div key={j} className="bg-red-50 rounded-lg p-2 text-sm border border-red-100">
                        <span className="font-mono text-xs text-slate-400">{c.id.slice(0, 12)}...</span>
                        <span className="ml-2 text-xs text-red-600">{c.status}</span>
                      </div>
                    ))}
                  </div>

                  {/* Ordine mantenuto */}
                  {group.keepOrder && (
                    <>
                      <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-2">✅ Ordine mantenuto</p>
                      <div className="bg-emerald-50 rounded-lg p-2 text-sm mb-3 border border-emerald-100">
                        <span className="font-mono text-xs text-slate-400">{group.keepOrder.id.slice(0, 12)}...</span>
                        <span className="ml-2 text-xs text-slate-600">{group.keepOrder.itemsCount} items</span>
                        <span className="ml-2 text-xs text-slate-500">{group.keepOrder.status}</span>
                      </div>
                    </>
                  )}

                  {/* Ordini da eliminare */}
                  {group.deleteOrders.length > 0 && (
                    <>
                      <p className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-2">🗑️ Ordini da eliminare ({group.deleteOrders.length})</p>
                      <div className="space-y-1">
                        {group.deleteOrders.map((o, j) => (
                          <div key={j} className="bg-red-50 rounded-lg p-2 text-sm border border-red-100">
                            <span className="font-mono text-xs text-slate-400">{o.id.slice(0, 12)}...</span>
                            <span className="ml-2 text-xs text-slate-600">{o.itemsCount} items</span>
                            <span className="ml-2 text-xs text-red-600">{o.status}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
