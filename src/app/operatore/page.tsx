"use client";

import { useEffect, useState } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { collection, query, where, Timestamp, onSnapshot } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import Link from "next/link";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════
type HomeTab = "oggi" | "completate";

export default function OperatoreDashboard() {
  const { user } = useAuth();
  const [cleanings, setCleanings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [homeTab, setHomeTab] = useState<HomeTab>("oggi");
  const today = new Date();

  // 🔥 REALTIME: usa onSnapshot invece di getDocs
  useEffect(() => {
    if (!user) return;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const q = query(
      collection(db, "cleanings"),
      where("scheduledDate", ">=", Timestamp.fromDate(todayStart)),
      where("scheduledDate", "<", Timestamp.fromDate(todayEnd))
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const allCleanings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Filtra per operatore
      const filtered = allCleanings.filter((c: any) => {
        const operators = c.operators || [];
        const isInArray = operators.some((op: any) => op.id === user?.id);
        const isOperatorId = c.operatorId === user?.id;
        return isInArray || isOperatorId;
      });

      setCleanings(filtered);
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  const completedCleanings = cleanings.filter(c => c.status === "COMPLETED");
  const pendingCleanings = cleanings.filter(c => c.status !== "COMPLETED");
  const inProgressCleanings = cleanings.filter(c => c.status === "IN_PROGRESS");

  // ═══════════════════════════════════════════════════════════════
  // RENDER: HOME
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="bg-slate-50 flex flex-col h-full">
      {/* Content scrollabile */}
      <main className="flex-1 overflow-y-auto overscroll-none pb-32">
        {/* Tab Bar */}
        <div className="px-4 py-3">
          <div className="bg-slate-100 rounded-2xl p-1 flex">
            <button
              onClick={() => setHomeTab("oggi")}
              className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all ${
                homeTab === "oggi" 
                  ? "bg-white text-slate-800 shadow-md" 
                  : "text-slate-500"
              }`}
            >
              🧹 Attive ({pendingCleanings.length})
            </button>
            <button
              onClick={() => setHomeTab("completate")}
              className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all ${
                homeTab === "completate" 
                  ? "bg-white text-slate-800 shadow-md" 
                  : "text-slate-500"
              }`}
            >
              ✅ Completate ({completedCleanings.length})
            </button>
          </div>
        </div>

        {loading ? (
          <div className="px-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
              <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-slate-500">Caricamento pulizie...</p>
            </div>
          </div>
        ) : (
          <>
            {/* TAB COMPLETATE */}
            {homeTab === "completate" && (
              <div className="px-4 space-y-4">
                {completedCleanings.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
                    <span className="text-4xl mb-2 block">📭</span>
                    <p className="text-slate-500">Nessuna pulizia completata oggi</p>
                  </div>
                ) : (
                  completedCleanings.map(cleaning => (
                    <Link 
                      key={cleaning.id} 
                      href={`/operatore/pulizie/${cleaning.id}`}
                      className="block bg-white rounded-2xl border border-emerald-200 p-4 hover:shadow-md transition-all active:scale-[0.98]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-2xl">
                          ✅
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-slate-800">{cleaning.propertyName || "Proprietà"}</h3>
                          <p className="text-sm text-slate-500">{cleaning.propertyAddress}</p>
                          <p className="text-xs text-emerald-600 mt-1">
                            Completata alle {cleaning.completedAt?.toDate?.().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) || "—"}
                          </p>
                        </div>
                        <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">
                          Completata
                        </span>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            )}

            {/* TAB OGGI (ATTIVE) */}
            {homeTab === "oggi" && (
              <div className="px-4 space-y-6">
                
                {/* BANNER: Hai pulizia in corso */}
                {inProgressCleanings.length > 0 && (
                  <Link 
                    href={`/operatore/pulizie/${inProgressCleanings[0].id}`}
                    className="block bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl p-4 text-white shadow-lg hover:shadow-xl transition-all active:scale-[0.98]"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl animate-pulse">🧹</span>
                        <div>
                          <p className="font-bold">{inProgressCleanings.length} pulizia in corso</p>
                          <p className="text-amber-100 text-sm">Tocca per continuare</p>
                        </div>
                      </div>
                      <div className="px-4 py-2 bg-white text-amber-600 font-bold rounded-xl">
                        Vai →
                      </div>
                    </div>
                  </Link>
                )}

                {/* LE TUE PULIZIE */}
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide flex items-center gap-2">
                      🏠 Le tue pulizie
                    </h2>
                    {pendingCleanings.length > 0 && (
                      <span className="text-xs font-bold text-white bg-emerald-500 px-2.5 py-1 rounded-full">
                        {pendingCleanings.length} da fare
                      </span>
                    )}
                  </div>
                  
                  {pendingCleanings.length === 0 ? (
                    <div className="bg-white rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center">
                      <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                        <span className="text-3xl">🎉</span>
                      </div>
                      <p className="font-semibold text-slate-600">Nessuna pulizia da fare</p>
                      <p className="text-sm text-slate-400 mt-1">Buon riposo! 😊</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {pendingCleanings.map(cleaning => (
                        <Link
                          key={cleaning.id}
                          href={`/operatore/pulizie/${cleaning.id}`}
                          className="block bg-white rounded-2xl border-2 border-slate-200 overflow-hidden shadow-sm hover:shadow-lg hover:border-emerald-300 transition-all active:scale-[0.98]"
                        >
                          <div className="p-4">
                            <div className="flex items-start gap-3 mb-3">
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
                                cleaning.status === "IN_PROGRESS" 
                                  ? "bg-gradient-to-br from-amber-100 to-orange-100" 
                                  : "bg-gradient-to-br from-emerald-100 to-teal-100"
                              }`}>
                                {cleaning.status === "IN_PROGRESS" ? "⏳" : "🏠"}
                              </div>
                              <div className="flex-1">
                                <h3 className="font-bold text-slate-800">{cleaning.propertyName || "Proprietà"}</h3>
                                <p className="text-sm text-slate-500">{cleaning.propertyAddress}</p>
                                <div className="flex items-center gap-3 mt-1">
                                  <span className="text-xs text-slate-400 flex items-center gap-1">
                                    🕐 {cleaning.scheduledTime || "10:00"}
                                  </span>
                                  {cleaning.guestsCount && (
                                    <span className="text-xs text-slate-400 flex items-center gap-1">
                                      👥 {cleaning.guestsCount} ospiti
                                    </span>
                                  )}
                                </div>
                              </div>
                              <span className={`px-3 py-1 text-xs font-bold rounded-full ${
                                cleaning.status === "IN_PROGRESS"
                                  ? "bg-amber-100 text-amber-700"
                                  : cleaning.status === "ASSIGNED"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-slate-100 text-slate-700"
                              }`}>
                                {cleaning.status === "IN_PROGRESS" ? "In Corso" :
                                 cleaning.status === "ASSIGNED" ? "Assegnata" : "Da Fare"}
                              </span>
                            </div>
                            
                            {/* Quick Actions */}
                            {cleaning.status !== "COMPLETED" && (
                              <div className="flex gap-2 pt-3 border-t border-slate-100">
                                <div
                                  className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold rounded-xl text-center text-sm shadow-md shadow-emerald-500/20"
                                >
                                  {cleaning.status === "IN_PROGRESS" ? "⏳ Continua" : "🚀 Inizia"}
                                </div>
                                <button 
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const address = cleaning.propertyAddress || '';
                                    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, '_blank');
                                  }}
                                  className="py-3 px-4 bg-slate-100 text-slate-600 rounded-xl text-lg hover:bg-slate-200 transition-all"
                                >
                                  📍
                                </button>
                              </div>
                            )}
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
