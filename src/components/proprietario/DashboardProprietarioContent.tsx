"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface DashboardStats {
  properties: number;
  bookings: number;
  cleaningsToday: number;
  monthlyEarnings: number;
}

interface UpcomingCleaning {
  id: string;
  date: string;
  time: string;
  property: string;
  address: string;
  status: string;
  operator: string | null;
}

interface DashboardData {
  stats: DashboardStats;
  upcomingCleanings: UpcomingCleaning[];
}

export function DashboardProprietarioContent({ userName = "Utente" }: { userName?: string }) {
  // 🔄 Assume mobile su SSR - nessun flash
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.innerWidth < 768;
  });
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/proprietario/dashboard");
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (error) {
        console.error("Errore caricamento dashboard:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const stats = data?.stats || { properties: 0, bookings: 0, cleaningsToday: 0, monthlyEarnings: 0 };
  const upcomingCleanings = data?.upcomingCleanings || [];

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const months = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];
    return { month: months[date.getMonth()], day: date.getDate().toString() };
  };

  if (isMobile) {
    return (
      <div className="px-4 py-4">
        <div className="bg-gradient-to-br from-sky-500 via-blue-500 to-indigo-600 rounded-2xl p-5 text-white shadow-xl shadow-sky-500/25">
          <p className="text-sky-100 text-sm">Benvenuto</p>
          <h1 className="text-xl font-bold mt-1">{userName}</h1>
          <p className="text-sky-100 text-sm mt-2">Gestisci le tue proprietà e prenotazioni</p>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <Link href="/proprietario/proprieta" className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <p className="text-2xl font-bold text-slate-800">{loading ? "..." : stats.properties}</p>
            <p className="text-sm text-slate-500">Proprietà</p>
          </Link>

          <Link href="/proprietario/calendario/prenotazioni" className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-2xl font-bold text-slate-800">{loading ? "..." : stats.bookings}</p>
            <p className="text-sm text-slate-500">Prenotazioni</p>
          </Link>

          <Link href="/proprietario/calendario/pulizie" className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </div>
            <p className="text-2xl font-bold text-slate-800">{loading ? "..." : stats.cleaningsToday}</p>
            <p className="text-sm text-slate-500">Pulizie oggi</p>
          </Link>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-2xl font-bold text-slate-800">€ {stats.monthlyEarnings}</p>
            <p className="text-sm text-slate-500">Questo mese</p>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-slate-800">Prossime Pulizie</h2>
            <Link href="/proprietario/calendario/pulizie" className="text-sm text-sky-500 font-medium">Vedi tutte</Link>
          </div>

          <div className="space-y-3">
            {loading ? (
              <div className="bg-white rounded-2xl p-4 text-center text-slate-500">Caricamento...</div>
            ) : upcomingCleanings.length === 0 ? (
              <div className="bg-white rounded-2xl p-4 text-center text-slate-500">Nessuna pulizia programmata</div>
            ) : (
              upcomingCleanings.map((c) => {
                const { month, day } = formatDate(c.date);
                return (
                  <div key={c.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                    <div className="flex items-start gap-3">
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${c.status === "SCHEDULED" ? "from-sky-400 to-blue-500" : "from-emerald-400 to-green-500"} flex flex-col items-center justify-center text-white`}>
                        <span className="text-xs font-medium">{month}</span>
                        <span className="text-lg font-bold leading-none">{day}</span>
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-slate-800">{c.property}</h3>
                        <p className="text-sm text-slate-500">{c.address}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className={`px-2 py-1 ${c.operator ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"} text-xs font-medium rounded-lg`}>
                            {c.operator || "Non assegnata"}
                          </span>
                          <span className="text-xs text-slate-400">{c.time}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-slate-500">Bentornato, {userName}!</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <p className="text-3xl font-bold text-slate-800">{loading ? "..." : stats.properties}</p>
          <p className="text-slate-500">Proprietà totali</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="w-12 h-12 rounded-xl bg-sky-50 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-3xl font-bold text-slate-800">{loading ? "..." : stats.bookings}</p>
          <p className="text-slate-500">Prenotazioni attive</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
          <p className="text-3xl font-bold text-slate-800">{loading ? "..." : stats.cleaningsToday}</p>
          <p className="text-slate-500">Pulizie oggi</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-3xl font-bold text-slate-800">€ {stats.monthlyEarnings}</p>
          <p className="text-slate-500">Guadagno mensile</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-800">Prossime Pulizie</h2>
          <Link href="/proprietario/calendario/pulizie" className="text-sm text-sky-500 font-medium">Vedi tutte</Link>
        </div>
        {loading ? (
          <p className="text-slate-500">Caricamento...</p>
        ) : upcomingCleanings.length === 0 ? (
          <p className="text-slate-500">Nessuna pulizia programmata</p>
        ) : (
          <div className="space-y-3">
            {upcomingCleanings.map((c) => {
              const { month, day } = formatDate(c.date);
              return (
                <div key={c.id} className="flex items-center gap-4 p-3 bg-slate-50 rounded-xl">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${c.status === "SCHEDULED" ? "from-sky-400 to-blue-500" : "from-emerald-400 to-green-500"} flex flex-col items-center justify-center text-white`}>
                    <span className="text-xs font-medium">{month}</span>
                    <span className="text-lg font-bold leading-none">{day}</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-800">{c.property}</h3>
                    <p className="text-sm text-slate-500">{c.address}</p>
                  </div>
                  <div className="text-right">
                    <span className={`px-2 py-1 ${c.operator ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"} text-xs font-medium rounded-lg`}>
                      {c.operator || "Non assegnata"}
                    </span>
                    <p className="text-xs text-slate-400 mt-1">{c.time}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}