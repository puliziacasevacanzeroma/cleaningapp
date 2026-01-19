"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "~/lib/firebase/AuthContext";
import { collection, getDocs, query, where, orderBy, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import Link from "next/link";
import { useEffect } from "react";

export default function ProprietarioDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const today = new Date();

  // 🔍 DEBUG: Controlla se la cache esiste
  useEffect(() => {
    if (user?.id) {
      const cachedData = queryClient.getQueryData(["proprietario-dashboard", user.id]);
      console.log("🔍 Cache proprietario-dashboard:", cachedData ? "TROVATA ✅" : "NON TROVATA ❌");
      console.log("🔍 Query key:", ["proprietario-dashboard", user.id]);
    }
  }, [user?.id, queryClient]);

  // 🔥 USA REACT QUERY con query key che corrisponde alla splash!
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["proprietario-dashboard", user?.id],
    queryFn: async () => {
      console.log("📡 Fetching dashboard proprietario da Firestore...");
      const startTime = Date.now();
      
      if (!user?.id) return null;

      // Carica proprietà del proprietario
      const propertiesSnapshot = await getDocs(query(
        collection(db, "properties"),
        where("ownerId", "==", user.id),
        orderBy("name", "asc")
      ));

      const properties = propertiesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      const propertyIds = properties.map(p => p.id);

      // Carica pulizie e prenotazioni
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      nextWeek.setHours(23, 59, 59, 999);

      const [cleaningsSnapshot, bookingsSnapshot] = await Promise.all([
        getDocs(query(
          collection(db, "cleanings"),
          where("scheduledDate", ">=", Timestamp.fromDate(todayStart)),
          where("scheduledDate", "<=", Timestamp.fromDate(nextWeek))
        )),
        getDocs(collection(db, "bookings")),
      ]);

      const myCleanings = cleaningsSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((c: any) => propertyIds.includes(c.propertyId));

      const myBookings = bookingsSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((b: any) => propertyIds.includes(b.propertyId));

      const todayStr = today.toISOString().split('T')[0];
      const cleaningsToday = myCleanings.filter((c: any) => {
        const d = c.scheduledDate?.toDate?.();
        return d && d.toISOString().split('T')[0] === todayStr;
      });

      const activeBookings = myBookings.filter((b: any) => {
        const co = b.checkOut?.toDate?.();
        return co && co >= new Date();
      });

      const upcomingCleanings = myCleanings
        .filter((c: any) => {
          const d = c.scheduledDate?.toDate?.();
          return d && d >= today;
        })
        .sort((a: any, b: any) => {
          const da = a.scheduledDate?.toDate?.() || new Date(0);
          const db = b.scheduledDate?.toDate?.() || new Date(0);
          return da.getTime() - db.getTime();
        })
        .slice(0, 5);

      console.log(`✅ Dashboard proprietario caricata in ${Date.now() - startTime}ms`);

      return {
        stats: {
          properties: properties.length,
          bookings: activeBookings.length,
          cleaningsToday: cleaningsToday.length
        },
        upcomingCleanings
      };
    },
    enabled: !!user?.id,
    staleTime: 30 * 60 * 1000, // 30 minuti
    gcTime: 60 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  // 🔍 DEBUG: Log stato
  useEffect(() => {
    console.log("📊 Stato query:", { isLoading, isFetching, hasData: !!data });
  }, [isLoading, isFetching, data]);

  // ⚡ Se abbiamo dati, mostrali subito (anche se sta ricaricando)
  if (data) {
    const { stats, upcomingCleanings } = data;

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
                  {upcomingCleanings.map((c: any) => (
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

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="p-8 flex justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
      </div>
    );
  }

  return null;
}
