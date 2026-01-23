"use client";

import { useState, useEffect, useRef } from "react";
import { useDashboardRealtime } from "~/lib/useFirestoreRealtime";
import { DashboardContent } from "./DashboardContent";

// 🔧 DEBUG OVERLAY per il Wrapper
function DebugOverlayWrapper({ logs }: { logs: string[] }) {
  const [show, setShow] = useState(true);
  
  if (!show) {
    return (
      <button 
        onClick={() => setShow(true)}
        className="fixed top-20 right-2 z-[9999] bg-blue-500 text-white text-xs px-2 py-1 rounded-full shadow-lg"
      >
        📊
      </button>
    );
  }
  
  return (
    <div className="fixed top-20 left-2 right-2 z-[9999] bg-black/90 text-cyan-400 text-[10px] font-mono p-2 rounded-lg max-h-40 overflow-y-auto shadow-xl border border-cyan-500">
      <div className="flex justify-between items-center mb-1">
        <span className="text-yellow-400 font-bold">📊 DEBUG WRAPPER</span>
        <button onClick={() => setShow(false)} className="text-red-400 text-xs">✕</button>
      </div>
      {logs.map((log, i) => (
        <div key={i} className="border-b border-cyan-900 py-0.5">
          {log}
        </div>
      ))}
    </div>
  );
}

// Skeleton component
function DashboardSkeleton({ userName, logs }: { userName: string; logs: string[] }) {
  return (
    <>
      <DebugOverlayWrapper logs={logs} />
      <div className="min-h-screen bg-slate-50 pb-24">
        <div className="bg-gradient-to-br from-indigo-500 via-purple-500 to-purple-600 rounded-b-3xl p-4 mb-4">
          <div className="h-6 w-40 bg-white/20 rounded mb-2 animate-pulse"></div>
          <div className="h-4 w-32 bg-white/20 rounded animate-pulse"></div>
          <div className="grid grid-cols-4 gap-2 mt-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white/10 rounded-xl p-2 animate-pulse">
                <div className="h-6 w-8 bg-white/20 rounded mb-1 mx-auto"></div>
                <div className="h-2 w-10 bg-white/20 rounded mx-auto"></div>
              </div>
            ))}
          </div>
        </div>
        <div className="px-4 mb-4">
          <div className="h-12 bg-white rounded-xl border border-slate-100 animate-pulse"></div>
        </div>
        <div className="px-4 space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 overflow-hidden animate-pulse">
              <div className="flex">
                <div className="w-2 bg-slate-300"></div>
                <div className="flex-1 p-4">
                  <div className="h-5 w-32 bg-slate-200 rounded mb-2"></div>
                  <div className="h-3 w-24 bg-slate-100 rounded"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

interface DashboardClientWrapperProps {
  userName: string;
}

export function DashboardClientWrapper({ userName }: DashboardClientWrapperProps) {
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const mountTimeRef = useRef(Date.now());

  // Funzione per aggiungere log
  const addLog = (msg: string) => {
    const elapsed = Date.now() - mountTimeRef.current;
    const logEntry = `[+${elapsed}ms] ${msg}`;
    setDebugLogs(prev => [...prev.slice(-15), logEntry]);
    console.log(`📊 WRAPPER: ${msg}`);
  };

  // Log mount
  useEffect(() => {
    addLog(`🚀 Wrapper MOUNT - userName: ${userName}`);
  }, [userName]);

  // 🔥 REALTIME: usa onSnapshot per aggiornamenti automatici
  const { data, isLoading, error } = useDashboardRealtime();

  // Log stato dati
  useEffect(() => {
    addLog(`📊 State - isLoading: ${isLoading}, hasData: ${!!data}, error: ${error?.message || 'none'}`);
    
    if (data) {
      addLog(`✅ DATA! cleanings: ${data.cleanings?.length || 0}, ops: ${data.operators?.length || 0}`);
    }
  }, [data, isLoading, error]);

  // Log render state (senza setState!)
  const renderState = error ? "ERROR" : data ? "HAS_DATA" : isLoading ? "LOADING" : "EMPTY";
  console.log(`📊 WRAPPER RENDER: ${renderState}`);

  // Se c'è errore
  if (error) {
    return (
      <>
        <DebugOverlayWrapper logs={debugLogs} />
        <div className="p-4 text-red-500">Error: {error.message}</div>
      </>
    );
  }

  // Mostra contenuto se abbiamo dati
  if (data) {
    return (
      <>
        <DebugOverlayWrapper logs={debugLogs} />
        <DashboardContent
          userName={userName}
          stats={data.stats}
          cleanings={data.cleanings}
          operators={data.operators}
          orders={data.orders || []}
          riders={data.riders || []}
        />
      </>
    );
  }

  // Skeleton mentre carica
  if (isLoading) {
    return <DashboardSkeleton userName={userName} logs={debugLogs} />;
  }

  return (
    <>
      <DebugOverlayWrapper logs={debugLogs} />
      <div className="p-4 text-slate-500">No data available</div>
    </>
  );
}
