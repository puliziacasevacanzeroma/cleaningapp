"use client";

import { useAuth } from "~/lib/firebase/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardLayoutClient } from "~/components/dashboard/DashboardLayoutClient";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

// 🔧 DEBUG OVERLAY - Mostra stato in tempo reale
function DebugOverlay({ logs }: { logs: string[] }) {
  const [show, setShow] = useState(true);
  
  if (!show) {
    return (
      <button 
        onClick={() => setShow(true)}
        className="fixed bottom-20 right-2 z-[9999] bg-red-500 text-white text-xs px-2 py-1 rounded-full shadow-lg"
      >
        🔧
      </button>
    );
  }
  
  return (
    <div className="fixed bottom-20 left-2 right-2 z-[9999] bg-black/90 text-green-400 text-[10px] font-mono p-2 rounded-lg max-h-40 overflow-y-auto shadow-xl border border-green-500">
      <div className="flex justify-between items-center mb-1">
        <span className="text-yellow-400 font-bold">🔧 DEBUG LAYOUT</span>
        <button onClick={() => setShow(false)} className="text-red-400 text-xs">✕</button>
      </div>
      {logs.map((log, i) => (
        <div key={i} className="border-b border-green-900 py-0.5">
          {log}
        </div>
      ))}
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [pendingCount, setPendingCount] = useState(0);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [layoutReady, setLayoutReady] = useState(false);

  // Funzione per aggiungere log
  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
    setDebugLogs(prev => [...prev.slice(-15), `[${time}] ${msg}`]);
    console.log(`🔧 LAYOUT: ${msg}`);
  };

  // Log stato iniziale
  useEffect(() => {
    addLog(`🚀 Layout MOUNT - loading: ${loading}, user: ${user ? 'YES' : 'NO'}`);
  }, []);

  // Log cambiamenti auth
  useEffect(() => {
    addLog(`📊 Auth state - loading: ${loading}, user: ${user?.name || 'null'}, role: ${user?.role || 'null'}`);
    
    if (!loading && user) {
      addLog(`✅ Auth READY - ${user.name} (${user.role})`);
    }
  }, [loading, user]);

  // LISTENER REALTIME per contare proprietà pending
  useEffect(() => {
    addLog(`🔴 Avvio listener pending...`);
    
    const unsubscribe = onSnapshot(
      collection(db, "properties"),
      (snapshot) => {
        const count = snapshot.docs.filter(doc => {
          const data = doc.data();
          return data.status === "PENDING" || data.deactivationRequested === true;
        }).length;
        setPendingCount(count);
        addLog(`📬 Pending count: ${count}`);
      },
      (error) => {
        addLog(`❌ Errore listener: ${error.message}`);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (loading) {
      addLog(`⏳ Waiting for auth...`);
      return;
    }

    if (!user) {
      addLog(`❌ No user, redirect to login`);
      router.push("/login");
      return;
    }

    const role = user.role?.toUpperCase();
    if (role !== "ADMIN") {
      addLog(`❌ Not admin (${role}), redirect to proprietario`);
      router.push("/proprietario");
      return;
    }

    addLog(`✅ User verified, rendering layout...`);
    setLayoutReady(true);
  }, [user, loading, router]);

  // Durante il check auth mostra debug
  if (loading) {
    addLog(`🔄 Rendering: AUTH LOADING state`);
    return (
      <>
        <DebugOverlay logs={debugLogs} />
        <div className="min-h-screen bg-slate-100 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600 mx-auto mb-2"></div>
            <p className="text-xs text-slate-500">Auth loading...</p>
          </div>
        </div>
      </>
    );
  }

  if (!user) {
    addLog(`🔄 Rendering: NO USER state (redirect)`);
    return (
      <>
        <DebugOverlay logs={debugLogs} />
        <div className="min-h-screen bg-slate-100 flex items-center justify-center">
          <p className="text-xs text-slate-500">Redirecting to login...</p>
        </div>
      </>
    );
  }

  if (user.role?.toUpperCase() !== "ADMIN") {
    addLog(`🔄 Rendering: NOT ADMIN state (redirect)`);
    return (
      <>
        <DebugOverlay logs={debugLogs} />
        <div className="min-h-screen bg-slate-100 flex items-center justify-center">
          <p className="text-xs text-slate-500">Redirecting to proprietario...</p>
        </div>
      </>
    );
  }

  addLog(`🎉 Rendering: DASHBOARD LAYOUT`);

  return (
    <>
      <DebugOverlay logs={debugLogs} />
      <DashboardLayoutClient
        userName={user.name || "Admin"}
        userEmail={user.email || ""}
        userRole={user.role?.toUpperCase() || "ADMIN"}
        pendingPropertiesCount={pendingCount}
      >
        {children}
      </DashboardLayoutClient>
    </>
  );
}
