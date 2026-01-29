"use client";

import { useState, useEffect } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { collection, query, orderBy, limit, onSnapshot, where, getDocs } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

interface SyncLog {
  id: string;
  propertyId?: string;
  propertyName?: string;
  type?: string;
  timestamp: any;
  duration: number;
  success: boolean;
  errorMessage?: string;
  stats: {
    totalNew?: number;
    totalUpdated?: number;
    totalDeleted?: number;
    totalCleaningsCreated?: number;
    newBookings?: number;
    updated?: number;
    deleted?: number;
    cleanings?: number;
    synced?: number;
    propertiesSynced?: number;
    errors?: string[];
  };
  sources?: string[];
}

interface PropertySyncStatus {
  id: string;
  name: string;
  lastSync: Date | null;
  feedHashes?: Record<string, string>;
  sources: string[];
}

export default function SyncMonitorPage() {
  const { user, loading, role } = useAuth();
  
  const [recentLogs, setRecentLogs] = useState<SyncLog[]>([]);
  const [properties, setProperties] = useState<PropertySyncStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  // Aggiorna "now" ogni 30 secondi per il timer real-time
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  // Carica log sync in real-time
  useEffect(() => {
    if (!user) return;

    const logsQuery = query(
      collection(db, "syncLogs"),
      orderBy("timestamp", "desc"),
      limit(50)
    );

    const unsubscribe = onSnapshot(logsQuery, (snapshot) => {
      const logs: SyncLog[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as SyncLog));
      setRecentLogs(logs);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Carica proprietà con stato sync
  useEffect(() => {
    if (!user) return;

    const loadProperties = async () => {
      const propsSnap = await getDocs(query(
        collection(db, "properties"),
        where("status", "==", "ACTIVE")
      ));

      const props: PropertySyncStatus[] = propsSnap.docs.map(doc => {
        const data = doc.data();
        const sources: string[] = [];
        if (data.icalAirbnb) sources.push('airbnb');
        if (data.icalBooking) sources.push('booking');
        if (data.icalOktorate) sources.push('oktorate');
        if (data.icalKrossbooking) sources.push('krossbooking');
        if (data.icalInreception) sources.push('inreception');

        return {
          id: doc.id,
          name: data.name || 'Senza nome',
          lastSync: data.lastIcalSync?.toDate() || null,
          feedHashes: data.feedHashes || {},
          sources,
        };
      });

      // Ordina per ultimo sync (più vecchi prima)
      props.sort((a, b) => {
        if (!a.lastSync) return -1;
        if (!b.lastSync) return 1;
        return a.lastSync.getTime() - b.lastSync.getTime();
      });

      setProperties(props);
    };

    loadProperties();
    
    // Ricarica ogni 60 secondi
    const interval = setInterval(loadProperties, 60000);
    return () => clearInterval(interval);
  }, [user, role]);

  // Formatta tempo trascorso
  const formatTimeAgo = (date: Date | null): string => {
    if (!date) return "Mai";
    
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (seconds < 60) return `${seconds}s fa`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m fa`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h fa`;
    return `${Math.floor(seconds / 86400)}g fa`;
  };

  // Colore stato in base al tempo
  const getStatusColor = (date: Date | null): string => {
    if (!date) return "bg-gray-100 text-gray-600";
    
    const minutes = (now.getTime() - date.getTime()) / 1000 / 60;
    
    if (minutes < 35) return "bg-green-100 text-green-700"; // OK, < 35 min
    if (minutes < 65) return "bg-yellow-100 text-yellow-700"; // Warning, < 65 min
    return "bg-red-100 text-red-700"; // Error, > 65 min
  };

  // Sync manuale
  const handleManualSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    
    try {
      const res = await fetch("/api/sync-all-ical", { method: "POST" });
      const data = await res.json();
      
      if (data.success) {
        setSyncResult(`✅ Sync completata! Nuove: ${data.stats?.totalNew || 0}, Aggiornate: ${data.stats?.totalUpdated || 0}`);
      } else {
        setSyncResult(`❌ Errore: ${data.error || 'Sconosciuto'}`);
      }
    } catch (error) {
      setSyncResult(`❌ Errore di connessione`);
    }
    
    setSyncing(false);
  };

  // Ultimo sync globale (CRON o GLOBAL)
  const lastGlobalSync = recentLogs.find(l => l.type === 'CRON' || l.type === 'GLOBAL');
  const lastGlobalTime = lastGlobalSync?.timestamp?.toDate?.() || null;

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">🔄 Monitor Sync iCal</h1>
            <p className="text-slate-500 text-sm mt-1">Controllo sincronizzazioni in tempo reale</p>
          </div>
          
          <button
            onClick={handleManualSync}
            disabled={syncing}
            className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-50 flex items-center gap-2"
          >
            {syncing ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                Sincronizzando...
              </>
            ) : (
              <>🔄 Sync Manuale</>
            )}
          </button>
        </div>

        {syncResult && (
          <div className={`p-3 rounded-lg ${syncResult.startsWith('✅') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {syncResult}
          </div>
        )}

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Ultimo Sync Automatico */}
          <div className="bg-white rounded-xl shadow-sm p-5 border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-500 text-sm font-medium">Ultimo Sync Automatico</span>
              <span className="text-2xl">⏰</span>
            </div>
            <div className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(lastGlobalTime)}`}>
              {formatTimeAgo(lastGlobalTime)}
            </div>
            {lastGlobalTime && (
              <p className="text-xs text-slate-400 mt-2">
                {lastGlobalTime.toLocaleString('it-IT')}
              </p>
            )}
          </div>

          {/* Stato Sistema */}
          <div className="bg-white rounded-xl shadow-sm p-5 border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-500 text-sm font-medium">Stato Sistema</span>
              <span className="text-2xl">{lastGlobalSync?.success !== false ? '✅' : '❌'}</span>
            </div>
            <div className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
              lastGlobalSync?.success !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {lastGlobalSync?.success !== false ? 'Operativo' : 'Errore'}
            </div>
            {lastGlobalSync && (
              <p className="text-xs text-slate-400 mt-2">
                Durata: {((lastGlobalSync.duration || 0) / 1000).toFixed(1)}s
              </p>
            )}
          </div>

          {/* Proprietà Monitorate */}
          <div className="bg-white rounded-xl shadow-sm p-5 border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-500 text-sm font-medium">Proprietà con iCal</span>
              <span className="text-2xl">🏠</span>
            </div>
            <div className="text-2xl font-bold text-slate-800">
              {properties.filter(p => p.sources.length > 0).length}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              {properties.filter(p => p.lastSync && (now.getTime() - p.lastSync.getTime()) < 3600000).length} sincronizzate nell'ultima ora
            </p>
          </div>
        </div>

        {/* Proprietà Status */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h2 className="font-semibold text-slate-800">📋 Stato Proprietà</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left p-3 text-xs font-medium text-slate-500 uppercase">Proprietà</th>
                  <th className="text-left p-3 text-xs font-medium text-slate-500 uppercase">Feed</th>
                  <th className="text-left p-3 text-xs font-medium text-slate-500 uppercase">Ultimo Sync</th>
                  <th className="text-left p-3 text-xs font-medium text-slate-500 uppercase">Stato</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {properties.filter(p => p.sources.length > 0).map(prop => {
                  const statusColor = getStatusColor(prop.lastSync);
                  return (
                    <tr key={prop.id} className="hover:bg-slate-50">
                      <td className="p-3">
                        <span className="font-medium text-slate-700">{prop.name}</span>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1 flex-wrap">
                          {prop.sources.map(s => (
                            <span key={s} className={`text-xs px-2 py-0.5 rounded ${
                              s === 'airbnb' ? 'bg-rose-100 text-rose-700' :
                              s === 'booking' ? 'bg-blue-100 text-blue-700' :
                              s === 'oktorate' ? 'bg-violet-100 text-violet-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {s}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-3 text-sm text-slate-600">
                        {prop.lastSync ? prop.lastSync.toLocaleString('it-IT', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        }) : '-'}
                      </td>
                      <td className="p-3">
                        <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${statusColor}`}>
                          {formatTimeAgo(prop.lastSync)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Log Recenti */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h2 className="font-semibold text-slate-800">📜 Ultime Sincronizzazioni</h2>
          </div>
          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {recentLogs.slice(0, 20).map(log => (
              <div key={log.id} className="p-3 hover:bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                    log.success !== false ? 'bg-green-100' : 'bg-red-100'
                  }`}>
                    {log.success !== false ? '✅' : '❌'}
                  </span>
                  <div>
                    <div className="font-medium text-slate-700 text-sm">
                      {log.type === 'CRON' ? '🕐 Cron Automatico' : 
                       log.type === 'GLOBAL' ? '🌐 Sync Globale' : 
                       `🏠 ${log.propertyName || 'Proprietà'}`}
                    </div>
                    <div className="text-xs text-slate-500">
                      {log.timestamp?.toDate?.()?.toLocaleString('it-IT') || '-'}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-600">
                    {log.stats?.totalNew || log.stats?.newBookings || 0} nuove, {' '}
                    {log.stats?.totalUpdated || log.stats?.updated || 0} agg, {' '}
                    {log.stats?.totalDeleted || log.stats?.deleted || 0} elim
                  </div>
                  <div className="text-xs text-slate-400">
                    {((log.duration || 0) / 1000).toFixed(1)}s
                  </div>
                </div>
              </div>
            ))}
            
            {recentLogs.length === 0 && (
              <div className="p-8 text-center text-slate-400">
                Nessun log di sincronizzazione disponibile
              </div>
            )}
          </div>
        </div>

        {/* Info Cron */}
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
          <div className="flex items-start gap-3">
            <span className="text-2xl">ℹ️</span>
            <div>
              <h3 className="font-semibold text-blue-800">Sincronizzazione Automatica</h3>
              <p className="text-blue-700 text-sm mt-1">
                Il sistema sincronizza automaticamente ogni <strong>30 minuti</strong> tramite cron-job.org.
                Se vedi "Ultimo Sync" superiore a 35 minuti, potrebbe esserci un problema.
              </p>
              <p className="text-blue-600 text-xs mt-2">
                🟢 Verde = OK (&lt;35 min) | 🟡 Giallo = Attenzione (&lt;65 min) | 🔴 Rosso = Problema (&gt;65 min)
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
