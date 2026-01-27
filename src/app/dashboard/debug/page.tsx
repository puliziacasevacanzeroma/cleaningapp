"use client";

import { useState, useEffect } from "react";

interface AnalysisResult {
  summary: {
    totalCleanings: number;
    totalOrders: number;
    cleaningsWithOrders: number;
    orphanOrders: number;
    cleaningsWithoutPrice: number;
    cleaningsWithPrice: number;
    activeProperties: number;
    propertiesWithOwnLinen: number;
  };
  todayStats: {
    cleaningsToday: number;
    cleaningsTodayActive: number;
    ordersToday: number;
    ordersTodayActive: number;
    mismatch: boolean;
    details: string;
  };
  priceIssues: any[];
  orphanOrders: any[];
  linenIssues: any[];
  cleaningsWithoutMatchingOrders: any[];
  duplicates: any[];
}

export default function DebugDashboardPage() {
  const [loading, setLoading] = useState(false);
  const [fixingPrices, setFixingPrices] = useState(false);
  const [fixingOrders, setFixingOrders] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    timestamp: string;
    analysis: AnalysisResult;
  } | null>(null);
  const [fixResult, setFixResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "summary" | "prices" | "orphans" | "linen" | "missing" | "duplicates"
  >("summary");

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    setFixResult(null);
    try {
      const res = await fetch("/api/debug/dashboard-analysis");
      const data = await res.json();
      if (data.success) {
        setResult(data);
      } else {
        setError(data.error || "Errore sconosciuto");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fixCleaningPrices = async () => {
    if (!confirm("Vuoi correggere tutte le pulizie senza prezzo?")) return;
    
    setFixingPrices(true);
    setFixResult(null);
    try {
      const res = await fetch("/api/admin/fix-cleaning-prices", { method: "POST" });
      const data = await res.json();
      setFixResult({ type: "prices", ...data });
      // Ricarica analisi
      runAnalysis();
    } catch (e: any) {
      setFixResult({ type: "prices", success: false, error: e.message });
    } finally {
      setFixingPrices(false);
    }
  };

  const fixMissingOrders = async (dryRun: boolean = false) => {
    if (!dryRun && !confirm("Vuoi creare gli ordini biancheria mancanti?")) return;
    
    setFixingOrders(true);
    setFixResult(null);
    try {
      const res = await fetch(`/api/admin/fix-missing-orders?daysBack=30&dryRun=${dryRun}`);
      const data = await res.json();
      setFixResult({ type: "orders", ...data });
      if (!dryRun) {
        // Ricarica analisi
        runAnalysis();
      }
    } catch (e: any) {
      setFixResult({ type: "orders", success: false, error: e.message });
    } finally {
      setFixingOrders(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr || dateStr === "N/A") return dateStr;
    try {
      return new Date(dateStr).toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                🔍 Debug Dashboard
              </h1>
              <p className="text-slate-500 mt-1">
                Analisi completa di pulizie, ordini e incongruenze
              </p>
            </div>
            <button
              onClick={runAnalysis}
              disabled={loading}
              className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-bold hover:from-indigo-600 hover:to-purple-700 disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Analisi...
                </>
              ) : (
                <>
                  🔄 Esegui Analisi
                </>
              )}
            </button>
          </div>

          {result && (
            <p className="text-xs text-slate-400 mt-4">
              Ultimo aggiornamento: {new Date(result.timestamp).toLocaleString("it-IT")}
            </p>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <p className="text-red-600 font-medium">❌ Errore: {error}</p>
          </div>
        )}

        {/* Fix Result */}
        {fixResult && (
          <div className={`rounded-xl p-4 mb-6 border ${
            fixResult.success ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
          }`}>
            <h3 className={`font-bold mb-2 ${fixResult.success ? "text-emerald-800" : "text-red-800"}`}>
              {fixResult.success ? "✅ Fix completato" : "❌ Errore fix"}
              {fixResult.dryRun && " (DRY RUN)"}
            </h3>
            {fixResult.success ? (
              <div className="text-sm">
                {fixResult.type === "prices" && (
                  <p>Pulizie corrette: {fixResult.summary?.fixed || 0} / {fixResult.summary?.totalToFix || 0}</p>
                )}
                {fixResult.type === "orders" && (
                  <>
                    <p>Ordini {fixResult.dryRun ? "da creare" : "creati"}: {fixResult.summary?.created || 0}</p>
                    <p>Pulizie analizzate: {fixResult.summary?.cleaningsAnalyzed || 0}</p>
                    <p>Ordini mancanti trovati: {fixResult.summary?.missingOrders || 0}</p>
                  </>
                )}
              </div>
            ) : (
              <p className="text-red-600 text-sm">{fixResult.error}</p>
            )}
          </div>
        )}

        {result && (
          <>
            {/* Fix Actions */}
            <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
              <h2 className="font-bold text-lg mb-4">🔧 Azioni di Fix</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={fixCleaningPrices}
                  disabled={fixingPrices || result.analysis.priceIssues.length === 0}
                  className="px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-medium hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {fixingPrices ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Fixing...</>
                  ) : (
                    <>💰 Fix Prezzi ({result.analysis.priceIssues.length})</>
                  )}
                </button>
                
                <button
                  onClick={() => fixMissingOrders(true)}
                  disabled={fixingOrders}
                  className="px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl font-medium hover:from-blue-600 hover:to-indigo-600 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {fixingOrders ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Checking...</>
                  ) : (
                    <>🔍 Simula Fix Ordini</>
                  )}
                </button>
                
                <button
                  onClick={() => fixMissingOrders(false)}
                  disabled={fixingOrders || result.analysis.cleaningsWithoutMatchingOrders.length === 0}
                  className="px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-medium hover:from-emerald-600 hover:to-teal-600 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {fixingOrders ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Creating...</>
                  ) : (
                    <>📦 Crea Ordini Mancanti ({result.analysis.cleaningsWithoutMatchingOrders.length})</>
                  )}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-3">
                ⚠️ Le azioni di fix modificano il database. "Simula Fix Ordini" mostra cosa verrebbe creato senza modificare nulla.
              </p>
            </div>
            {/* Tabs */}
            <div className="bg-white rounded-2xl shadow-lg mb-6 overflow-hidden">
              <div className="flex border-b border-slate-200 overflow-x-auto">
                {[
                  { id: "summary", label: "📊 Riepilogo", count: null },
                  { id: "prices", label: "💰 Prezzi", count: result.analysis.priceIssues.length },
                  { id: "orphans", label: "👻 Ordini Orfani", count: result.analysis.orphanOrders.length },
                  { id: "linen", label: "🏠 Biancheria Propria", count: result.analysis.linenIssues.length },
                  { id: "missing", label: "📦 Ordini Mancanti", count: result.analysis.cleaningsWithoutMatchingOrders.length },
                  { id: "duplicates", label: "🔄 Duplicati", count: result.analysis.duplicates.length },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`px-4 py-3 font-medium whitespace-nowrap flex items-center gap-2 border-b-2 transition-colors ${
                      activeTab === tab.id
                        ? "border-indigo-500 text-indigo-600 bg-indigo-50"
                        : "border-transparent text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {tab.label}
                    {tab.count !== null && tab.count > 0 && (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                        tab.count > 0 ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-500"
                      }`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="p-6">
                {/* Tab: Summary */}
                {activeTab === "summary" && (
                  <div className="space-y-6">
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4">
                        <p className="text-blue-600 text-sm font-medium">Pulizie Totali</p>
                        <p className="text-3xl font-bold text-blue-800">{result.analysis.summary.totalCleanings}</p>
                      </div>
                      <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-4">
                        <p className="text-emerald-600 text-sm font-medium">Ordini Totali</p>
                        <p className="text-3xl font-bold text-emerald-800">{result.analysis.summary.totalOrders}</p>
                      </div>
                      <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4">
                        <p className="text-purple-600 text-sm font-medium">Proprietà Attive</p>
                        <p className="text-3xl font-bold text-purple-800">{result.analysis.summary.activeProperties}</p>
                      </div>
                      <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4">
                        <p className="text-amber-600 text-sm font-medium">Biancheria Propria</p>
                        <p className="text-3xl font-bold text-amber-800">{result.analysis.summary.propertiesWithOwnLinen}</p>
                      </div>
                    </div>

                    {/* Today Stats */}
                    <div className={`rounded-xl p-4 border-2 ${
                      result.analysis.todayStats.mismatch 
                        ? "bg-red-50 border-red-200" 
                        : "bg-emerald-50 border-emerald-200"
                    }`}>
                      <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                        📅 Statistiche OGGI
                        {result.analysis.todayStats.mismatch && (
                          <span className="px-2 py-1 bg-red-500 text-white text-xs rounded-full">
                            ⚠️ MISMATCH
                          </span>
                        )}
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-sm text-slate-500">Pulizie (totali)</p>
                          <p className="text-xl font-bold">{result.analysis.todayStats.cleaningsToday}</p>
                        </div>
                        <div>
                          <p className="text-sm text-slate-500">Pulizie (attive)</p>
                          <p className="text-xl font-bold text-indigo-600">{result.analysis.todayStats.cleaningsTodayActive}</p>
                        </div>
                        <div>
                          <p className="text-sm text-slate-500">Ordini (totali)</p>
                          <p className="text-xl font-bold">{result.analysis.todayStats.ordersToday}</p>
                        </div>
                        <div>
                          <p className="text-sm text-slate-500">Ordini (attivi)</p>
                          <p className="text-xl font-bold text-emerald-600">{result.analysis.todayStats.ordersTodayActive}</p>
                        </div>
                      </div>
                      <p className="mt-3 text-sm">{result.analysis.todayStats.details}</p>
                    </div>

                    {/* Price Stats */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200">
                        <p className="text-emerald-600 text-sm font-medium">Pulizie CON prezzo</p>
                        <p className="text-2xl font-bold text-emerald-800">{result.analysis.summary.cleaningsWithPrice}</p>
                      </div>
                      <div className={`rounded-xl p-4 border ${
                        result.analysis.summary.cleaningsWithoutPrice > 0 
                          ? "bg-red-50 border-red-200" 
                          : "bg-slate-50 border-slate-200"
                      }`}>
                        <p className="text-sm font-medium text-slate-600">Pulizie SENZA prezzo</p>
                        <p className={`text-2xl font-bold ${
                          result.analysis.summary.cleaningsWithoutPrice > 0 ? "text-red-600" : "text-slate-800"
                        }`}>
                          {result.analysis.summary.cleaningsWithoutPrice}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab: Prices */}
                {activeTab === "prices" && (
                  <div>
                    <h3 className="font-bold text-lg mb-4">💰 Problemi Prezzi ({result.analysis.priceIssues.length})</h3>
                    {result.analysis.priceIssues.length === 0 ? (
                      <div className="text-center py-8 text-slate-500">
                        ✅ Nessun problema di prezzo rilevato
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-100">
                            <tr>
                              <th className="px-3 py-2 text-left">Proprietà</th>
                              <th className="px-3 py-2 text-left">Data</th>
                              <th className="px-3 py-2 text-right">Prezzo</th>
                              <th className="px-3 py-2 text-right">Contratto</th>
                              <th className="px-3 py-2 text-left">Tipo</th>
                              <th className="px-3 py-2 text-left">Problema</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.analysis.priceIssues.map((issue, i) => (
                              <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                                <td className="px-3 py-2 font-medium">{issue.propertyName}</td>
                                <td className="px-3 py-2">{formatDate(issue.date)}</td>
                                <td className="px-3 py-2 text-right">
                                  {issue.price !== null ? `€${issue.price.toFixed(2)}` : "-"}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {issue.contractPrice !== null ? `€${issue.contractPrice.toFixed(2)}` : "-"}
                                </td>
                                <td className="px-3 py-2">
                                  <span className="px-2 py-1 bg-slate-100 rounded text-xs">
                                    {issue.serviceType || "N/A"}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-red-600 text-xs">{issue.issue}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab: Orphan Orders */}
                {activeTab === "orphans" && (
                  <div>
                    <h3 className="font-bold text-lg mb-4">👻 Ordini Orfani ({result.analysis.orphanOrders.length})</h3>
                    {result.analysis.orphanOrders.length === 0 ? (
                      <div className="text-center py-8 text-slate-500">
                        ✅ Nessun ordine orfano
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {result.analysis.orphanOrders.map((order, i) => (
                          <div key={i} className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-bold text-amber-800">{order.propertyName}</p>
                                <p className="text-sm text-amber-600">{formatDate(order.date)}</p>
                              </div>
                              <span className="px-2 py-1 bg-amber-200 text-amber-800 rounded text-xs">
                                {order.hasMatchingCleaning ? "Ha pulizia" : "No pulizia"}
                              </span>
                            </div>
                            <p className="text-xs text-amber-700 mt-2">{order.issue}</p>
                            <p className="text-xs text-slate-500 mt-1">ID: {order.orderId}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Tab: Linen Issues */}
                {activeTab === "linen" && (
                  <div>
                    <h3 className="font-bold text-lg mb-4">🏠 Problemi Biancheria Propria ({result.analysis.linenIssues.length})</h3>
                    {result.analysis.linenIssues.length === 0 ? (
                      <div className="text-center py-8 text-slate-500">
                        ✅ Nessun problema con biancheria propria
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {result.analysis.linenIssues.map((issue, i) => (
                          <div key={i} className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-bold text-orange-800">{issue.propertyName}</p>
                                <p className="text-sm text-orange-600">{issue.orderCount} ordini trovati</p>
                              </div>
                              <span className="px-2 py-1 bg-orange-200 text-orange-800 rounded text-xs">
                                🏠 Biancheria propria
                              </span>
                            </div>
                            <p className="text-xs text-orange-700 mt-2">{issue.issue}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Tab: Missing Orders */}
                {activeTab === "missing" && (
                  <div>
                    <h3 className="font-bold text-lg mb-4">📦 Pulizie Senza Ordini ({result.analysis.cleaningsWithoutMatchingOrders.length})</h3>
                    <p className="text-sm text-slate-500 mb-4">
                      Pulizie per proprietà che NON usano biancheria propria ma non hanno ordini collegati
                    </p>
                    {result.analysis.cleaningsWithoutMatchingOrders.length === 0 ? (
                      <div className="text-center py-8 text-slate-500">
                        ✅ Tutte le pulizie hanno ordini corrispondenti
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {result.analysis.cleaningsWithoutMatchingOrders.map((item, i) => (
                          <div key={i} className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-bold text-purple-800">{item.propertyName}</p>
                                <p className="text-sm text-purple-600">{formatDate(item.date)}</p>
                              </div>
                            </div>
                            <p className="text-xs text-purple-700 mt-2">{item.issue}</p>
                            <p className="text-xs text-slate-500 mt-1">ID: {item.cleaningId}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Tab: Duplicates */}
                {activeTab === "duplicates" && (
                  <div>
                    <h3 className="font-bold text-lg mb-4">🔄 Duplicati ({result.analysis.duplicates.length})</h3>
                    {result.analysis.duplicates.length === 0 ? (
                      <div className="text-center py-8 text-slate-500">
                        ✅ Nessun duplicato trovato
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {result.analysis.duplicates.map((dup, i) => (
                          <div key={i} className={`rounded-xl p-4 border ${
                            dup.type === "cleaning" 
                              ? "bg-red-50 border-red-200" 
                              : "bg-amber-50 border-amber-200"
                          }`}>
                            <div className="flex justify-between items-start">
                              <div>
                                <p className={`font-bold ${
                                  dup.type === "cleaning" ? "text-red-800" : "text-amber-800"
                                }`}>
                                  {dup.propertyName}
                                </p>
                                <p className={`text-sm ${
                                  dup.type === "cleaning" ? "text-red-600" : "text-amber-600"
                                }`}>
                                  {formatDate(dup.date)}
                                </p>
                              </div>
                              <span className={`px-2 py-1 rounded text-xs ${
                                dup.type === "cleaning" 
                                  ? "bg-red-200 text-red-800" 
                                  : "bg-amber-200 text-amber-800"
                              }`}>
                                {dup.type === "cleaning" ? "🧹 Pulizia" : "📦 Ordine"}
                              </span>
                            </div>
                            <p className={`text-xs mt-2 ${
                              dup.type === "cleaning" ? "text-red-700" : "text-amber-700"
                            }`}>
                              {dup.issue}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1">
                              {dup.ids.map((id: string, j: number) => (
                                <span key={j} className="px-2 py-0.5 bg-white rounded text-xs text-slate-500 border">
                                  {id.substring(0, 8)}...
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Instructions */}
        {!result && !loading && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="font-bold text-lg mb-3">📋 Come funziona</h2>
            <ul className="space-y-2 text-slate-600">
              <li className="flex items-start gap-2">
                <span className="text-indigo-500">1.</span>
                Clicca su "Esegui Analisi" per scansionare il database
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-500">2.</span>
                L'analisi controlla pulizie, ordini e proprietà
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-500">3.</span>
                Vedrai problemi di prezzi, ordini orfani, duplicati e incongruenze
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-500">4.</span>
                La tab "Riepilogo" mostra le statistiche di oggi per verificare i conteggi
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
