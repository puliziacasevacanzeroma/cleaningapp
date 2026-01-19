"use client";

import { useProperties } from "~/lib/queries";
import { ProprietaClient } from "./ProprietaClient";
import { useState, useEffect, useRef } from "react";

// Debug overlay component
function DebugOverlay({ times }: { times: any }) {
  const [show, setShow] = useState(true);
  
  if (!show) return (
    <button 
      onClick={() => setShow(true)}
      className="fixed bottom-20 right-2 z-50 bg-black text-white text-xs px-2 py-1 rounded"
    >
      🐛
    </button>
  );
  
  return (
    <div className="fixed bottom-20 right-2 z-50 bg-black/90 text-white text-xs p-3 rounded-lg max-w-[200px] font-mono">
      <div className="flex justify-between items-center mb-2">
        <span className="font-bold">🐛 DEBUG</span>
        <button onClick={() => setShow(false)} className="text-red-400">✕</button>
      </div>
      <div className="space-y-1">
        <div>📡 API: <span className={times.api > 2000 ? "text-red-400" : "text-green-400"}>{times.api}ms</span></div>
        <div>🎨 Render: <span className={times.render > 500 ? "text-red-400" : "text-green-400"}>{times.render}ms</span></div>
        <div>📊 Props: {times.count}</div>
        <div>🔄 Cache: {times.fromCache ? "✅ HIT" : "❌ MISS"}</div>
        <div>📶 Conn: {times.connection}</div>
        <div className="border-t border-white/20 pt-1 mt-1">
          <div className="font-bold">⏱️ Totale: <span className={times.total > 3000 ? "text-red-400" : "text-green-400"}>{times.total}ms</span></div>
        </div>
      </div>
    </div>
  );
}

// Skeleton component
function ProprietaSkeleton({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 100);
    return () => clearInterval(interval);
  }, [startTime]);
  
  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Timer visibile durante loading */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-blue-600 text-white text-center py-1 text-sm">
        ⏳ Caricamento... {(elapsed / 1000).toFixed(1)}s
      </div>
      
      <div className="bg-white px-4 py-4 border-b border-slate-200 mt-8">
        <div className="flex items-center justify-between mb-4">
          <div className="h-7 w-28 bg-slate-200 rounded-lg animate-pulse"></div>
          <div className="w-10 h-10 bg-slate-200 rounded-xl animate-pulse"></div>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-slate-100 rounded-xl p-3 animate-pulse">
              <div className="h-6 w-8 bg-slate-200 rounded mb-1 mx-auto"></div>
              <div className="h-3 w-12 bg-slate-200 rounded mx-auto"></div>
            </div>
          ))}
        </div>
        <div className="h-10 bg-slate-100 rounded-xl mb-3 animate-pulse"></div>
        <div className="flex gap-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-9 w-24 bg-slate-100 rounded-full animate-pulse"></div>
          ))}
        </div>
      </div>
      <div className="px-4 py-4">
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="bg-white rounded-xl border border-slate-100 overflow-hidden animate-pulse">
              <div className="h-14 bg-slate-200"></div>
              <div className="p-2">
                <div className="h-3 w-full bg-slate-100 rounded mb-1"></div>
                <div className="h-2 w-2/3 bg-slate-100 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ProprietaClientWrapper() {
  const startTime = useRef(Date.now());
  const apiEndTime = useRef(0);
  const [debugTimes, setDebugTimes] = useState({
    api: 0,
    render: 0,
    count: 0,
    total: 0,
    fromCache: false,
    connection: "checking..."
  });
  
  // Check connection type
  useEffect(() => {
    const conn = (navigator as any).connection;
    if (conn) {
      setDebugTimes(prev => ({
        ...prev,
        connection: `${conn.effectiveType || "?"} ${conn.downlink ? `(${conn.downlink}Mb)` : ""}`
      }));
    } else {
      setDebugTimes(prev => ({ ...prev, connection: "N/A" }));
    }
  }, []);
  
  const { data, isLoading, error, isFetching, isStale } = useProperties();
  
  // Track API time
  useEffect(() => {
    if (data && apiEndTime.current === 0) {
      apiEndTime.current = Date.now();
      const apiTime = apiEndTime.current - startTime.current;
      setDebugTimes(prev => ({
        ...prev,
        api: apiTime,
        count: data.activeProperties?.length || 0,
        fromCache: !isFetching && !isStale
      }));
    }
  }, [data, isFetching, isStale]);
  
  // Track render complete
  useEffect(() => {
    if (data && apiEndTime.current > 0) {
      const renderTime = Date.now() - apiEndTime.current;
      const totalTime = Date.now() - startTime.current;
      setDebugTimes(prev => ({
        ...prev,
        render: renderTime,
        total: totalTime
      }));
    }
  }, [data]);

  if (isLoading && !data) {
    return <ProprietaSkeleton startTime={startTime.current} />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-red-500">Errore: {error.message}</p>
        <DebugOverlay times={debugTimes} />
      </div>
    );
  }

  if (!data) return null;

  return (
    <>
      <ProprietaClient
        activeProperties={data.activeProperties}
        pendingProperties={data.pendingProperties}
        suspendedProperties={data.suspendedProperties}
        proprietari={data.proprietari || []}
      />
      <DebugOverlay times={debugTimes} />
    </>
  );
}
