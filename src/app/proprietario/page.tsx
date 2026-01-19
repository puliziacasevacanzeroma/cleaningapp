"use client";

import { useEffect, useState } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { getPropertiesByOwner, getCleanings, getBookings } from "~/lib/firebase/firestore-data";
import Link from "next/link";

export default function ProprietarioDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ properties: 0, bookings: 0, cleaningsToday: 0 });
  const [upcomingCleanings, setUpcomingCleanings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const today = new Date();

  useEffect(() => {
    async function loadData() {
      if (!user?.id) return;
      
      try {
        const properties = await getPropertiesByOwner(user.id);
        const propertyIds = properties.map(p => p.id);
        
        const [allCleanings, allBookings] = await Promise.all([
          getCleanings(),
          getBookings(),
        ]);

        const myCleanings = allCleanings.filter(c => propertyIds.includes(c.propertyId));
        const myBookings = allBookings.filter(b => propertyIds.includes(b.propertyId));

        const todayStr = today.toISOString().split('T')[0];
        const cleaningsToday = myCleanings.filter(c => {
          const d = c.scheduledDate?.toDate?.();
          return d && d.toISOString().split('T')[0] === todayStr;
        });

        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        const upcoming = myCleanings
          .filter(c => {
            const d = c.scheduledDate?.toDate?.();
            return d && d >= today && d < nextWeek;
          })
          .sort((a, b) => {
            const da = a.scheduledDate?.toDate?.() || new Date(0);
            const db = b.scheduledDate?.toDate?.() || new Date(0);
            return da.getTime() - db.getTime();
          })
          .slice(0, 5);

        setStats({
          properties: properties.length,
          bookings: myBookings.filter(b => {
            const co = b.checkOut?.toDate?.();
            return co && co >= new Date();
          }).length,
          cleaningsToday: cleaningsToday.length
        });
        setUpcomingCleanings(upcoming);
      } catch (error) {
        console.error("Errore caricamento dati:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [user]);

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Ciao, {user?.name?.split(" ")[0] || "Proprietario"}! 👋</h1>
          <p className="text-slate-500 mt-1">{today.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-sky-100 flex items-center justify-center">
                <span className="text-2xl">🏠</span>
              </div>
              <div>
                <p className="text-3xl font-bold text-slate-800">{stats.properties}</p>
                <p className="text-sm text-slate-500">Proprietà</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                <span className="text-2xl">📅</span>
              </div>
              <div>
                <p className="text-3xl font-bold text-slate-800">{stats.bookings}</p>
                <p className="text-sm text-slate-500">Prenotazioni Attive</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                <span className="text-2xl">🧹</span>
              </div>
              <div>
                <p className="text-3xl font-bold text-slate-800">{stats.cleaningsToday}</p>
                <p className="text-sm text-slate-500">Pulizie Oggi</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800">Prossime Pulizie</h2>
              <Link href="/proprietario/calendario/pulizie" className="text-sm text-sky-600 hover:underline">
                Vedi tutte →
              </Link>
            </div>
            {upcomingCleanings.length === 0 ? (
              <p className="text-slate-500 text-center py-8">Nessuna pulizia programmata</p>
            ) : (
              <div className="space-y-3">
                {upcomingCleanings.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                    <div>
                      <p className="font-medium text-slate-800">{c.propertyName || "Proprietà"}</p>
                      <p className="text-sm text-slate-500">
                        {c.scheduledDate?.toDate?.()?.toLocaleDateString("it-IT")} - {c.scheduledTime || "10:00"}
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      c.status === "COMPLETED" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                    }`}>
                      {c.status === "COMPLETED" ? "Completata" : "Programmata"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Azioni Rapide</h2>
            <div className="grid grid-cols-2 gap-3">
              <Link href="/proprietario/proprieta" className="flex flex-col items-center p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                <span className="text-2xl mb-2">🏠</span>
                <span className="text-sm font-medium text-slate-700">Le mie proprietà</span>
              </Link>
              <Link href="/proprietario/proprieta/nuova" className="flex flex-col items-center p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                <span className="text-2xl mb-2">➕</span>
                <span className="text-sm font-medium text-slate-700">Nuova proprietà</span>
              </Link>
              <Link href="/proprietario/calendario/prenotazioni" className="flex flex-col items-center p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                <span className="text-2xl mb-2">📅</span>
                <span className="text-sm font-medium text-slate-700">Prenotazioni</span>
              </Link>
              <Link href="/proprietario/calendario/pulizie" className="flex flex-col items-center p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                <span className="text-2xl mb-2">🧹</span>
                <span className="text-sm font-medium text-slate-700">Pulizie</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}