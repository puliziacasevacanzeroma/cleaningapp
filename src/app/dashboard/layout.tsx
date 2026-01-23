"use client";

import { useAuth } from "~/lib/firebase/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
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
  const mountTimeRef = useRef(Date.now());

  // Funzione per aggiungere log - usa ref per evitare dipendenze
  const addLog = (msg: string) => {
    const elapsed = Date.now() - mountTimeRef.current;
    const logEntry = `[+${elapsed}ms] ${msg}`;
    setDebugLogs(prev => [...prev.slice(-15), logEntry]);
    console.log(`🔧 LAYOUT: ${msg}`);
  };

  // Log mount iniziale
  useEffect(() => {
    addLog(`🚀 Layout MOUNT`);
    return () => console.log("🔧 LAYOUT: unmount");
  }, []);

  // Log cambiamenti auth
  useEffect(() => {
    addLog(`📊 Auth: loading=${loading}, user=${user?.name || 'null'}, role=${user?.role || 'null'}`);
  }, [loading, user?.name, user?.role]);

  // LISTENER REALTIME per proprietà pending
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
        addLog(`📬 Pending: ${count}`);
      },
      (error) => {
        addLog(`❌ Listener error: ${error.message}`);
      }
    );

    return () => unsubscribe();
  }, []);

  // Redirect logic
  useEffect(() => {
    if (loading) {
      addLog(`⏳ Waiting auth...`);
      return;
    }

    if (!user) {
      addLog(`❌ No user → redirect login`);
      router.push("/login");
      return;
    }

    const role = user.role?.toUpperCase();
    if (role !== "ADMIN") {
      addLog(`❌ Not admin (${role}) → redirect proprietario`);
      router.push("/proprietario");
      return;
    }

    addLog(`✅ Admin verified!`);
  }, [user, loading, router]);

  // Log render state (senza chiamare setState!)
  const renderState = loading ? "LOADING" : !user ? "NO_USER" : user.role?.toUpperCase() !== "ADMIN" ? "NOT_ADMIN" : "READY";
  console.log(`🔧 LAYOUT RENDER: ${renderState}`);

  // Durante il check auth
  if (loading) {
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
    return (
      <>
        <DebugOverlay logs={debugLogs} />
        <div className="min-h-screen bg-slate-100 flex items-center justify-center">
          <p className="text-xs text-slate-500">Redirecting to proprietario...</p>
        </div>
      </>
    );
  }

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
