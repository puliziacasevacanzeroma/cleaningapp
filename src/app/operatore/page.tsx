"use client";

import { useEffect, useState } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { collection, query, where, Timestamp, onSnapshot, doc, getDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import Link from "next/link";

type HomeTab = "oggi" | "completate";

export default function OperatoreDashboard() {
  const { user } = useAuth();
  const [cleanings, setCleanings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [homeTab, setHomeTab] = useState<HomeTab>("oggi");
  const [propertyImages, setPropertyImages] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);
    const q = query(collection(db, "cleanings"), where("scheduledDate", ">=", Timestamp.fromDate(todayStart)), where("scheduledDate", "<", Timestamp.fromDate(todayEnd)));

    const unsub = onSnapshot(q, (snapshot) => {
      const all = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      const filtered = all.filter((c: any) => {
        const ops = c.operators || [];
        return ops.some((op: any) => op.id === user?.id) || c.operatorId === user?.id;
      });
      setCleanings(filtered);
      setLoading(false);

      // Carica immagini proprietà
      const propIds = [...new Set(filtered.map((c: any) => c.propertyId).filter(Boolean))];
      propIds.forEach(async (pid: string) => {
        try {
          const snap = await getDoc(doc(db, "properties", pid));
          if (snap.exists() && snap.data().imageUrl) {
            setPropertyImages(prev => ({ ...prev, [pid]: snap.data()!.imageUrl }));
          }
        } catch {}
      });
    });
    return () => unsub();
  }, [user]);

  const completedCleanings = cleanings.filter(c => c.status === "COMPLETED");
  const pendingCleanings = cleanings.filter(c => c.status !== "COMPLETED");
  const inProgressCleanings = cleanings.filter(c => c.status === "IN_PROGRESS");

  return (
    <div className="bg-slate-50 pb-8">
      <main>
        {/* Stats */}
        <div className="flex gap-2 px-4 py-3">
          {[
            { n: pendingCleanings.length, l: "Da fare", c: "sky", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
            { n: inProgressCleanings.length, l: "In corso", c: "amber", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
            { n: completedCleanings.length, l: "Completate", c: "emerald", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
          ].map(s => (
            <div key={s.l} className="flex-1 bg-white rounded-[14px] p-3 text-center shadow-sm border border-slate-100">
              <div className={`w-8 h-8 rounded-[10px] bg-${s.c}-50 flex items-center justify-center mx-auto mb-1.5`}>
                <svg className={`w-4 h-4 text-${s.c}-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={s.icon} /></svg>
              </div>
              <p className={`text-xl font-extrabold text-${s.c}-500`}>{s.n}</p>
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mt-0.5">{s.l}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="px-4 pb-3">
          <div className="bg-slate-100 rounded-[14px] p-1 flex">
            {[
              { id: "oggi" as HomeTab, label: `Attive (${pendingCleanings.length})`, icon: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" },
              { id: "completate" as HomeTab, label: `Completate (${completedCleanings.length})`, icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
            ].map(t => (
              <button key={t.id} onClick={() => setHomeTab(t.id)} className={`flex-1 py-2.5 rounded-[11px] font-semibold text-sm transition-all flex items-center justify-center gap-1.5 ${homeTab === t.id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={t.icon} /></svg>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="px-4"><div className="bg-white rounded-[20px] border border-slate-200 p-8 text-center"><div className="w-12 h-12 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" /><p className="text-slate-500">Caricamento pulizie...</p></div></div>
        ) : (
          <>
            {/* Completate */}
            {homeTab === "completate" && (
              <div className="px-4 space-y-3">
                {completedCleanings.length === 0 ? (
                  <div className="bg-white rounded-[20px] border border-slate-200 p-8 text-center">
                    <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3"><svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg></div>
                    <p className="text-slate-500 font-medium">Nessuna pulizia completata oggi</p>
                  </div>
                ) : completedCleanings.map(cl => (
                  <Link key={cl.id} href={`/operatore/pulizie/${cl.id}`} className="block bg-white rounded-[20px] border border-emerald-200 overflow-hidden hover:shadow-md transition-all active:scale-[0.98]">
                    <div className="h-[3px] bg-gradient-to-r from-emerald-400 to-teal-400" />
                    <div className="p-4 flex items-center gap-3">
                      <div className="w-12 h-12 rounded-[14px] bg-emerald-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {propertyImages[(cl as any).propertyId] ? <img src={propertyImages[(cl as any).propertyId]} alt="" className="w-full h-full object-cover" /> : <svg className="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-slate-800 text-[15px]">{cl.propertyName || "Proprietà"}</h3>
                        <p className="text-sm text-slate-500 truncate">{cl.propertyAddress}</p>
                        <p className="text-xs text-emerald-600 mt-1 font-medium">Completata alle {cl.completedAt?.toDate?.().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) || "—"}</p>
                      </div>
                      <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 text-[11px] font-bold rounded-lg flex-shrink-0">Completata</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* Attive */}
            {homeTab === "oggi" && (
              <div className="px-4 space-y-4">
                {inProgressCleanings.length > 0 && (
                  <Link href={`/operatore/pulizie/${inProgressCleanings[0]!.id}`} className="block bg-gradient-to-r from-amber-500 to-orange-500 rounded-[16px] p-4 text-white shadow-lg shadow-amber-500/25 active:scale-[0.98] transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><svg className="w-5 h-5 text-white animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
                        <div><p className="font-bold text-[15px]">{inProgressCleanings.length} pulizia in corso</p><p className="text-amber-100 text-sm">Tocca per continuare</p></div>
                      </div>
                      <div className="px-4 py-2 bg-white text-amber-600 font-bold rounded-xl text-sm">Vai →</div>
                    </div>
                  </Link>
                )}

                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                    Le tue pulizie
                  </h2>
                  {pendingCleanings.length > 0 && <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">{pendingCleanings.length} da fare</span>}
                </div>
                
                {pendingCleanings.length === 0 ? (
                  <div className="bg-white rounded-[20px] border-2 border-dashed border-slate-200 p-8 text-center">
                    <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3"><svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
                    <p className="font-semibold text-slate-600">Nessuna pulizia da fare</p>
                    <p className="text-sm text-slate-400 mt-1">Buon riposo!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingCleanings.map(cl => (
                      <Link key={cl.id} href={`/operatore/pulizie/${cl.id}`} className="block bg-white rounded-[20px] border border-slate-200 overflow-hidden shadow-sm hover:shadow-lg hover:border-slate-300 transition-all active:scale-[0.98]">
                        <div className={`h-[3px] ${cl.status === "IN_PROGRESS" ? "bg-gradient-to-r from-amber-400 to-orange-400" : "bg-gradient-to-r from-sky-400 to-blue-400"}`} />
                        <div className="p-4">
                          <div className="flex items-start gap-3 mb-3">
                            <div className={`w-12 h-12 rounded-[14px] flex items-center justify-center overflow-hidden flex-shrink-0 ${cl.status === "IN_PROGRESS" ? "bg-gradient-to-br from-amber-50 to-orange-50" : "bg-gradient-to-br from-sky-50 to-blue-50"}`}>
                              {propertyImages[(cl as any).propertyId] ? (
                                <img src={propertyImages[(cl as any).propertyId]} alt="" className="w-full h-full object-cover" />
                              ) : cl.status === "IN_PROGRESS" ? (
                                <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              ) : (
                                <svg className="w-5 h-5 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-bold text-slate-800 text-[15px]">{cl.propertyName || "Proprietà"}</h3>
                              <p className="text-sm text-slate-500 truncate">{cl.propertyAddress}</p>
                              <div className="flex items-center gap-3 mt-1.5">
                                <span className="text-xs text-slate-400 flex items-center gap-1"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>{cl.scheduledTime || "10:00"}</span>
                                {cl.guestsCount && <span className="text-xs text-slate-400 flex items-center gap-1"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>{cl.guestsCount} ospiti</span>}
                              </div>
                            </div>
                            <span className={`px-2.5 py-1 text-[11px] font-bold rounded-lg flex-shrink-0 ${cl.status === "IN_PROGRESS" ? "bg-amber-100 text-amber-700" : cl.status === "ASSIGNED" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                              {cl.status === "IN_PROGRESS" ? "In Corso" : cl.status === "ASSIGNED" ? "Assegnata" : "Da Fare"}
                            </span>
                          </div>
                          {cl.status !== "COMPLETED" && (
                            <div className="flex gap-2 pt-3 border-t border-slate-100">
                              <div className={`flex-1 py-3 font-bold rounded-xl text-center text-sm flex items-center justify-center gap-2 ${cl.status === "IN_PROGRESS" ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/20" : "bg-gradient-to-r from-slate-800 to-slate-900 text-white shadow-md shadow-slate-800/20"}`}>
                                {cl.status === "IN_PROGRESS" ? (<><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>Continua</>) : (<><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>Inizia pulizia</>)}
                              </div>
                              <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cl.propertyAddress || '')}`, '_blank'); }} className="py-3 px-3.5 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all active:scale-95">
                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="rgba(234,67,53,0.12)" stroke="rgba(234,67,53,0.8)" strokeWidth="1.5" /><circle cx="12" cy="9" r="2.5" fill="none" stroke="rgba(234,67,53,0.8)" strokeWidth="1.5" /></svg>
                              </button>
                            </div>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
