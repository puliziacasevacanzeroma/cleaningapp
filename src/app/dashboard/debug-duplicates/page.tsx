"use client";

import { useState } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import {
  collection, getDocs, query, where, orderBy,
  deleteDoc, doc, Timestamp
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export default function DebugDuplicatesPage() {
  const { user } = useAuth();
  const [propFilter, setPropFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const analyze = async () => {
    if (!propFilter.trim()) { alert("Inserisci il nome della proprietà"); return; }
    setLoading(true);
    setData(null);

    try {
      // Carica tutte le proprietà
      const propsSnap = await getDocs(collection(db, "properties"));
      const props = propsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      const matchedProps = props.filter(p =>
        p.name?.toLowerCase().includes(propFilter.toLowerCase())
      );

      if (matchedProps.length === 0) {
        setData({ error: `Nessuna proprietà trovata con "${propFilter}"` });
        setLoading(false);
        return;
      }

      const results: any[] = [];

      for (const prop of matchedProps) {
        // Carica tutte le pulizie future
        const cleaningsSnap = await getDocs(
          query(
            collection(db, "cleanings"),
            where("propertyId", "==", prop.id),
            orderBy("scheduledDate", "asc")
          )
        );
        const cleanings = cleaningsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

        // Carica tutti i booking della proprietà
        const bookingsSnap = await getDocs(
          query(collection(db, "bookings"), where("propertyId", "==", prop.id))
        );
        const bookings = bookingsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

        // Raggruppa pulizie per data
        const byDate = new Map<string, any[]>();
        for (const c of cleanings) {
          const date = c.scheduledDate?.toDate?.()?.toISOString().split("T")[0];
          if (!date) continue;
          if (!byDate.has(date)) byDate.set(date, []);
          byDate.get(date)!.push(c);
        }

        // Trova date con duplicati
        const duplicates: any[] = [];
        for (const [date, list] of byDate.entries()) {
          if (list.length > 1) {
            // Per ogni pulizia trova il booking collegato
            const enriched = list.map(c => {
              const booking = bookings.find(b =>
                b.id === c.bookingId ||
                (b.checkOut?.toDate?.()?.toISOString().split("T")[0] === date)
              );
              return {
                ...c,
                dateStr: date,
                booking: booking ? {
                  id: booking.id,
                  source: booking.source,
                  icalUid: booking.icalUid,
                  guestName: booking.guestName,
                  checkIn: booking.checkIn?.toDate?.()?.toLocaleDateString("it-IT"),
                  checkOut: booking.checkOut?.toDate?.()?.toLocaleDateString("it-IT"),
                } : null,
              };
            });
            duplicates.push({ date, cleanings: enriched });
          }
        }

        results.push({
          propId: prop.id,
          propName: prop.name,
          totalCleanings: cleanings.length,
          totalBookings: bookings.length,
          duplicateDates: duplicates,
          // Link iCal configurati
          icalLinks: {
            airbnb: prop.icalAirbnb ? "✅" : "—",
            booking: prop.icalBooking ? "✅" : "—",
            oktorate: prop.icalOktorate ? "✅" : "—",
            inreception: prop.icalInreception ? "✅" : "—",
            krossbooking: prop.icalKrossbooking ? "✅" : "—",
          }
        });
      }

      setData({ results });
    } catch (err: any) {
      setData({ error: err.message });
    }
    setLoading(false);
  };

  const deleteCleaning = async (cleaningId: string, propId: string, date: string) => {
    if (!confirm(`Eliminare la pulizia del ${date}?\n\nID: ${cleaningId}\n\nQuesta azione è irreversibile.`)) return;
    setDeleting(cleaningId);
    try {
      await deleteDoc(doc(db, "cleanings", cleaningId));
      // Aggiorna i dati localmente
      setData((prev: any) => ({
        ...prev,
        results: prev.results.map((r: any) => ({
          ...r,
          duplicateDates: r.propId === propId
            ? r.duplicateDates.map((dd: any) => ({
                ...dd,
                cleanings: dd.cleanings.filter((c: any) => c.id !== cleaningId)
              })).filter((dd: any) => dd.cleanings.length > 1)
            : r.duplicateDates
        }))
      }));
      alert("✅ Pulizia eliminata");
    } catch (e) {
      alert("Errore: " + e);
    }
    setDeleting(null);
  };

  if (!user || user.role !== "ADMIN") return <div className="p-8 text-red-500">Accesso negato</div>;

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">🔍 Debug Pulizie Duplicate</h1>
      <p className="text-gray-500 text-sm mb-4">
        Trova e rimuovi pulizie duplicate nella stessa data per una proprietà
      </p>

      <div className="flex gap-3 mb-6">
        <input
          value={propFilter}
          onChange={e => setPropFilter(e.target.value)}
          onKeyDown={e => e.key === "Enter" && analyze()}
          placeholder="Nome proprietà (es: Gaia, Aubry, Angelico...)"
          className="border rounded-xl px-4 py-2 text-sm flex-1"
        />
        <button onClick={analyze} disabled={loading}
          className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium disabled:opacity-50">
          {loading ? "Analisi..." : "🔍 Analizza"}
        </button>
      </div>

      {data?.error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{data.error}</div>
      )}

      {data?.results && data.results.map((r: any) => (
        <div key={r.propId} className="bg-white rounded-2xl border border-slate-200 shadow-sm mb-6 overflow-hidden">
          {/* Header proprietà */}
          <div className="bg-slate-50 px-5 py-4 border-b">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-800">{r.propName}</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {r.totalCleanings} pulizie · {r.totalBookings} booking
                </p>
              </div>
              <div className="text-xs text-slate-400 text-right">
                <p className="font-medium text-slate-600 mb-1">Feed iCal:</p>
                {Object.entries(r.icalLinks).map(([k, v]: any) => (
                  <span key={k} className={`inline-block mr-2 ${v === "✅" ? "text-emerald-600" : "text-slate-300"}`}>
                    {k}: {v}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Duplicati */}
          {r.duplicateDates.length === 0 ? (
            <div className="px-5 py-6 text-center text-emerald-600 text-sm font-medium">
              ✅ Nessuna pulizia duplicata trovata
            </div>
          ) : (
            <div className="p-4 space-y-4">
              <p className="text-sm font-semibold text-red-600">
                ⚠️ {r.duplicateDates.length} data/e con pulizie duplicate
              </p>
              {r.duplicateDates.map((dd: any) => (
                <div key={dd.date} className="border border-red-200 rounded-xl overflow-hidden">
                  <div className="bg-red-50 px-4 py-2 border-b border-red-200">
                    <span className="text-sm font-bold text-red-800">📅 {dd.date}</span>
                    <span className="ml-2 text-xs text-red-600">({dd.cleanings.length} pulizie duplicate)</span>
                  </div>
                  <div className="divide-y">
                    {dd.cleanings.map((c: any, idx: number) => (
                      <div key={c.id} className="px-4 py-3 flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              idx === 0 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                            }`}>
                              {idx === 0 ? "✅ Tieni" : "⚠️ Duplicato"}
                            </span>
                            <span className="text-xs text-slate-500 font-mono truncate">{c.id}</span>
                          </div>
                          <p className="text-sm font-medium text-slate-800">
                            {c.guestName || "—"} · {c.status}
                          </p>
                          {c.booking ? (
                            <div className="text-xs text-slate-500 mt-0.5 space-y-0.5">
                              <p>Source: <span className="font-medium text-slate-700">{c.booking.source}</span></p>
                              <p>UID: <span className="font-mono text-slate-600 truncate">{c.booking.icalUid || "—"}</span></p>
                              <p>Check-in: {c.booking.checkIn} → Check-out: {c.booking.checkOut}</p>
                            </div>
                          ) : (
                            <p className="text-xs text-slate-400 mt-0.5">Nessun booking collegato</p>
                          )}
                        </div>
                        {idx > 0 && (
                          <button
                            onClick={() => deleteCleaning(c.id, r.propId, dd.date)}
                            disabled={deleting === c.id}
                            className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 whitespace-nowrap flex-shrink-0"
                          >
                            {deleting === c.id ? "..." : "🗑️ Elimina"}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
