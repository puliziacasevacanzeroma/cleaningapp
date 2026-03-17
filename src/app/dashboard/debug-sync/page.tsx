"use client";

import { useState } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { collection, getDocs, query, where, orderBy, deleteDoc, doc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export default function DebugSyncPage() {
  const { user, isAdmin } = useAuth();
  const [propFilter, setPropFilter] = useState("gaia");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const analyze = async () => {
    setLoading(true);
    setData(null);
    try {
      // 1. Trova proprietà
      const propsSnap = await getDocs(collection(db, "properties"));
      const props = propsSnap.docs
        .map(d => ({ id: d.id, ...(d.data() as any) }))
        .filter(p => p.name?.toLowerCase().includes(propFilter.toLowerCase()));

      if (!props.length) { setData({ error: `Nessuna proprietà con "${propFilter}"` }); setLoading(false); return; }

      const results = [];
      for (const prop of props) {
        // 2. Pulizie prossimi 30 giorni
        const now = new Date();
        const cleaningsSnap = await getDocs(
          query(collection(db, "cleanings"),
            where("propertyId", "==", prop.id))
        );
        const cleanings = cleaningsSnap.docs.map(d => {
          const data = d.data() as any;
          return {
            id: d.id,
            date: data.scheduledDate?.toDate?.()?.toISOString().split("T")[0] || "?",
            status: data.status,
            bookingSource: data.bookingSource || data.source || "—",
            bookingId: data.bookingId || "—",
            guestName: data.guestName || "—",
            hasExternalSource: !!(data.bookingSource || data.source),
          };
        });

        // 3. SyncExclusions
        const exclusionsSnap = await getDocs(
          query(collection(db, "syncExclusions"),
            where("propertyId", "==", prop.id))
        );
        const exclusions = exclusionsSnap.docs.map(d => {
          const data = d.data() as any;
          return {
            id: d.id,
            originalDate: data.originalDate?.toDate?.()?.toISOString().split("T")[0] || "?",
            newDate: data.newDate?.toDate?.()?.toISOString().split("T")[0] || "—",
            reason: data.reason || "—",
            bookingSource: data.bookingSource || "—",
            bookingId: data.bookingId || "—",
            cleaningId: data.cleaningId || "—",
            createdAt: data.createdAt?.toDate?.()?.toLocaleString("it-IT") || "?",
          };
        });

        // 4. Booking
        const bookingsSnap = await getDocs(
          query(collection(db, "bookings"),
            where("propertyId", "==", prop.id))
        );
        const today = new Date().toISOString().split("T")[0];
        const bookings = bookingsSnap.docs.map(d => {
          const data = d.data() as any;
          return {
            id: d.id,
            guestName: data.guestName || "—",
            checkIn: data.checkIn?.toDate?.()?.toISOString().split("T")[0] || "?",
            checkOut: data.checkOut?.toDate?.()?.toISOString().split("T")[0] || "?",
            source: data.source || "—",
            icalUid: data.icalUid || "—",
          };
        })
        .filter(b => b.checkOut >= today)
        .sort((a, b) => a.checkOut.localeCompare(b.checkOut));

        // 5. Analisi: pulizie senza syncExclusion che verranno ricreate
        const excludedDates = new Set(exclusions.map(e => e.originalDate));
        const rischio: any[] = [];
        
        // Booking con checkout nei prossimi giorni - pulizia esiste?
        for (const b of bookings) {
          const hasCleaning = cleanings.find(c => c.date === b.checkOut);
          const isExcluded = excludedDates.has(b.checkOut);
          if (!hasCleaning && !isExcluded) {
            rischio.push({
              msg: `⚠️ Booking ${b.guestName} (${b.source}) checkout ${b.checkOut} — NESSUNA pulizia e NESSUNA syncExclusion → il cron la CREERÀ`,
              bookingId: b.id,
            });
          } else if (!hasCleaning && isExcluded) {
            rischio.push({
              msg: `✅ Booking ${b.guestName} checkout ${b.checkOut} — nessuna pulizia ma syncExclusion presente → il cron la SKIPPERÀ`,
              bookingId: b.id,
            });
          }
        }

        results.push({ prop, cleanings, exclusions, bookings, rischio, excludedDates: [...excludedDates] });
      }
      setData({ results });
    } catch (e: any) { setData({ error: e.message }); }
    setLoading(false);
  };

  const deleteExclusion = async (id: string) => {
    setDeleting(id);
    await deleteDoc(doc(db, "syncExclusions", id));
    setDeleting(null);
    analyze();
  };

  const deleteCleaning = async (id: string) => {
    setDeleting(id);
    await deleteDoc(doc(db, "cleanings", id));
    setDeleting(null);
    analyze();
  };

  if (!user || !isAdmin) return <div className="p-8 text-red-500">Accesso negato — role: {user?.role}</div>;

  return (
    <div className="p-4 max-w-5xl mx-auto text-sm">
      <h1 className="text-2xl font-bold mb-1">🔬 Debug Sync iCal — Pulizie Ricreate</h1>
      <p className="text-gray-500 text-sm mb-4">Analizza pulizie, syncExclusions e booking per capire perché il cron ricrea le pulizie</p>

      <div className="flex gap-3 mb-6">
        <input value={propFilter} onChange={e => setPropFilter(e.target.value)}
          onKeyDown={e => e.key === "Enter" && analyze()}
          placeholder="Nome proprietà..." className="border rounded-xl px-4 py-2 flex-1" />
        <button onClick={analyze} disabled={loading}
          className="px-5 py-2 bg-indigo-600 text-white rounded-xl font-medium disabled:opacity-50">
          {loading ? "Analisi..." : "🔬 Analizza"}
        </button>
      </div>

      {data?.error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">{data.error}</div>}

      {data?.results?.map((r: any) => (
        <div key={r.prop.id} className="space-y-4 mb-8">
          <h2 className="text-lg font-bold text-slate-800 border-b pb-2">
            {r.prop.name}
            <span className="ml-2 text-xs font-mono text-slate-400">{r.prop.id}</span>
            <span className="ml-2 text-xs text-slate-500">source: {r.prop.icalInreception ? "inreception✅" : ""} {r.prop.icalOktorate ? "oktorate✅" : ""} {r.prop.icalAirbnb ? "airbnb✅" : ""} {r.prop.icalBooking ? "booking✅" : ""}</span>
          </h2>

          {/* RISCHIO */}
          {r.rischio.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1">
              <p className="font-bold text-amber-800 mb-2">🎯 DIAGNOSI CRON:</p>
              {r.rischio.map((risk: any, i: number) => (
                <p key={i} className={`text-xs ${risk.msg.startsWith("⚠️") ? "text-red-700" : "text-green-700"}`}>{risk.msg}</p>
              ))}
            </div>
          )}

          {/* SYNC EXCLUSIONS */}
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="bg-slate-100 px-4 py-2 font-semibold text-slate-700">
              🔒 syncExclusions ({r.exclusions.length}) — Date che il cron SALTA
            </div>
            {r.exclusions.length === 0 ? (
              <p className="p-4 text-red-500 text-xs">⚠️ NESSUNA syncExclusion — il cron non ha protezioni per questa proprietà</p>
            ) : (
              <div className="divide-y">
                {r.exclusions.map((e: any) => (
                  <div key={e.id} className="px-4 py-2 flex items-center justify-between gap-2">
                    <div>
                      <span className="font-mono text-emerald-700 font-bold">{e.originalDate}</span>
                      {e.newDate !== "—" && <span className="text-slate-400 mx-1">→ spostata a</span>}
                      {e.newDate !== "—" && <span className="font-mono text-blue-600">{e.newDate}</span>}
                      <span className="ml-2 text-xs text-slate-500">({e.reason}) source: {e.bookingSource}</span>
                      <p className="text-xs text-slate-400">cleaningId: {e.cleaningId} | creata: {e.createdAt}</p>
                    </div>
                    <button onClick={() => deleteExclusion(e.id)} disabled={deleting === e.id}
                      className="px-2 py-1 bg-red-100 text-red-600 rounded text-xs hover:bg-red-200 disabled:opacity-50">
                      {deleting === e.id ? "..." : "🗑️"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* PULIZIE PROSSIMI GIORNI */}
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="bg-slate-100 px-4 py-2 font-semibold text-slate-700">
              🧹 Pulizie ({r.cleanings.length})
            </div>
            <div className="divide-y max-h-64 overflow-y-auto">
              {r.cleanings.map((c: any) => (
                <div key={c.id} className={`px-4 py-2 flex items-center justify-between gap-2 ${r.excludedDates.includes(c.date) ? "bg-yellow-50" : ""}`}>
                  <div>
                    <span className="font-mono font-bold text-slate-700">{c.date}</span>
                    <span className="ml-2 text-xs text-slate-500">{c.status}</span>
                    <span className="ml-2 text-xs text-blue-600">{c.bookingSource}</span>
                    <span className="ml-2 text-xs text-slate-400">{c.guestName}</span>
                    <span className={`ml-2 text-xs font-mono font-bold ${c.bookingId && c.bookingId !== "—" ? "text-green-600" : "text-red-500"}`}>
                      bId:{c.bookingId && c.bookingId !== "—" ? c.bookingId.slice(0,8) : "❌"}
                    </span>
                    {c.lockedFromSync
                      ? <span className="ml-2 text-xs text-emerald-600 font-bold">🔒 orig:{c.originalScheduledDate || "?"}</span>
                      : <span className="ml-2 text-xs text-orange-500 font-bold">🔓 NON BLOCCATA</span>
                    }
                    {r.excludedDates.includes(c.date) && <span className="ml-2 text-xs text-amber-600 font-bold">⚠️</span>}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {!c.lockedFromSync && c.hasExternalSource && (
                      <button onClick={async () => {
                        const origDate = prompt("Data checkout originale (YYYY-MM-DD):");
                        if (!origDate) return;
                        setDeleting("lock-" + c.id);
                        const res = await fetch("/api/admin/lock-cleaning", {
                          method: "POST", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ cleaningId: c.id, originalDate: origDate }),
                        });
                        const d = await res.json();
                        setDeleting(null);
                        if (d.success) { alert("✅ " + d.message); analyze(); }
                        else alert("❌ " + d.error);
                      }} disabled={!!deleting}
                        className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs hover:bg-emerald-200 disabled:opacity-50">
                        🔒
                      </button>
                    )}
                    <button onClick={() => deleteCleaning(c.id)} disabled={!!deleting}
                      className="px-2 py-1 bg-red-100 text-red-600 rounded text-xs hover:bg-red-200 disabled:opacity-50">
                      {deleting === c.id ? "..." : "🗑️"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* BOOKING */}
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="bg-slate-100 px-4 py-2 font-semibold text-slate-700">
              📅 Booking prossimi ({r.bookings.length})
            </div>
            <div className="divide-y max-h-64 overflow-y-auto">
              {r.bookings.map((b: any) => {
                const hasCleaning = r.cleanings.find((c: any) => c.date === b.checkOut);
                const isExcluded = r.excludedDates.includes(b.checkOut);
                return (
                  <div key={b.id} className={`px-4 py-2 ${!hasCleaning && !isExcluded ? "bg-red-50" : ""}`}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-700">OUT: {b.checkOut}</span>
                      <span className="text-xs text-slate-500">IN: {b.checkIn}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${b.source === "booking" ? "bg-blue-100 text-blue-700" : b.source === "airbnb" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>{b.source}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-600">{b.guestName}</span>
                      {hasCleaning ? <span className="text-xs text-green-600">✅ Pulizia presente</span> : isExcluded ? <span className="text-xs text-amber-600">🔒 Esclusa da sync</span> : <span className="text-xs text-red-600 font-bold">❌ NESSUNA PULIZIA — il cron la creerà!</span>}
                    </div>
                    <p className="text-xs text-slate-300 mt-0.5 font-mono truncate">UID: {b.icalUid}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
