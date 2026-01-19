"use client";

import { useDashboardDirect } from "~/lib/useFirestoreDirect";
import { DashboardContent } from "./DashboardContent";
import { useEffect, useState } from "react";

// Skeleton component
function DashboardSkeleton({ userName }: { userName: string }) {
  return (
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
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="bg-white rounded-2xl border border-slate-100 overflow-hidden animate-pulse">
            <div className="flex">
              <div className="w-2 bg-slate-300"></div>
              <div className="flex-1 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="h-5 w-32 bg-slate-200 rounded mb-2"></div>
                    <div className="h-3 w-24 bg-slate-100 rounded"></div>
                  </div>
                  <div className="h-6 w-20 bg-slate-100 rounded-full"></div>
                </div>
                <div className="flex gap-2 mt-3">
                  <div className="h-8 w-20 bg-slate-100 rounded-lg"></div>
                  <div className="h-8 w-20 bg-slate-100 rounded-lg"></div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface DashboardClientWrapperProps {
  userName: string;
}

export function DashboardClientWrapper({ userName }: DashboardClientWrapperProps) {
  const { data, isLoading, isFetching, isStale } = useDashboardDirect();
  const [showDebug, setShowDebug] = useState(true);

  // Debug log
  useEffect(() => {
    console.log("Dashboard DIRETTO - isLoading:", isLoading, "isFetching:", isFetching, "hasData:", !!data, "isStale:", isStale);
  }, [isLoading, isFetching, data, isStale]);

  // Debug panel visuale
  const DebugPanel = () => {
    if (!showDebug) return null;
    
    return (
      <div style={{
        position: 'fixed',
        top: '10px',
        right: '10px',
        width: '400px',
        maxHeight: '80vh',
        overflow: 'auto',
        backgroundColor: '#1e293b',
        color: '#10b981',
        padding: '15px',
        borderRadius: '10px',
        fontSize: '11px',
        fontFamily: 'monospace',
        zIndex: 9999,
        boxShadow: '0 10px 40px rgba(0,0,0,0.5)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
          <strong style={{ color: '#f59e0b', fontSize: '14px' }}>🔍 DEBUG OPERATORI</strong>
          <button 
            onClick={() => setShowDebug(false)}
            style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '5px', padding: '2px 8px', cursor: 'pointer' }}
          >
            X
          </button>
        </div>
        
        <div style={{ marginBottom: '10px', padding: '8px', backgroundColor: '#334155', borderRadius: '5px' }}>
          <div><strong style={{ color: '#60a5fa' }}>Stato:</strong> {isLoading ? '⏳ Loading...' : '✅ Caricato'}</div>
          <div><strong style={{ color: '#60a5fa' }}>Pulizie:</strong> {data?.cleanings?.length || 0}</div>
        </div>

        {data?.cleanings?.map((c: any, i: number) => (
          <div key={i} style={{ 
            marginBottom: '10px', 
            padding: '10px', 
            backgroundColor: '#334155', 
            borderRadius: '5px',
            borderLeft: '3px solid #f59e0b'
          }}>
            <div style={{ color: '#fbbf24', fontWeight: 'bold', marginBottom: '5px' }}>
              📍 {c.property?.name || 'N/A'}
            </div>
            
            <div style={{ marginBottom: '5px' }}>
              <strong style={{ color: '#60a5fa' }}>operator (singolo):</strong>
              <div style={{ color: c.operator ? '#10b981' : '#ef4444', marginLeft: '10px' }}>
                {c.operator ? `✅ ${c.operator.name} (${c.operator.id?.slice(0,8)}...)` : '❌ null'}
              </div>
            </div>
            
            <div>
              <strong style={{ color: '#60a5fa' }}>operators (array):</strong>
              <div style={{ marginLeft: '10px' }}>
                {c.operators && c.operators.length > 0 ? (
                  c.operators.map((op: any, j: number) => (
                    <div key={j} style={{ color: '#10b981' }}>
                      ✅ {op.operator?.name || op.name || 'undefined'} ({op.id?.slice(0,8)}...)
                    </div>
                  ))
                ) : (
                  <div style={{ color: '#ef4444' }}>❌ Array vuoto o null</div>
                )}
              </div>
              <div style={{ color: '#94a3b8', marginTop: '3px' }}>
                Length: {c.operators?.length || 0} | Type: {Array.isArray(c.operators) ? 'array' : typeof c.operators}
              </div>
            </div>
          </div>
        ))}
        
        <div style={{ marginTop: '10px', padding: '8px', backgroundColor: '#0f172a', borderRadius: '5px', color: '#94a3b8' }}>
          <strong>RAW DATA (prima pulizia):</strong>
          <pre style={{ fontSize: '9px', overflow: 'auto', maxHeight: '150px' }}>
            {JSON.stringify(data?.cleanings?.[0], null, 2)}
          </pre>
        </div>
      </div>
    );
  };

  // Mostra contenuto se abbiamo dati, anche se sta ricaricando in background
  if (data) {
    return (
      <>
        <DebugPanel />
        <DashboardContent
          userName={userName}
          stats={data.stats}
          cleanings={data.cleanings}
          operators={data.operators}
        />
      </>
    );
  }

  // Skeleton solo se non abbiamo dati
  if (isLoading) {
    return (
      <>
        <DebugPanel />
        <DashboardSkeleton userName={userName} />
      </>
    );
  }

  return null;
}
