"use client";

import { useState, useEffect } from "react";

interface ReportData {
  totalProperties: number;
  totalBookings: number;
  totalCleanings: number;
  completedCleanings: number;
  totalOperators: number;
}

export default function ReportPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch data from API
    Promise.all([
      fetch("/api/properties/list").then(r => r.json()),
      fetch("/api/dashboard/data").then(r => r.json()),
    ])
      .then(([propertiesData, dashboardData]) => {
        setData({
          totalProperties: propertiesData.activeProperties?.length || 0,
          totalBookings: dashboardData.stats?.checkinsWeek || 0,
          totalCleanings: dashboardData.stats?.cleaningsToday || 0,
          completedCleanings: dashboardData.cleanings?.filter((c: any) => c.status === "COMPLETED").length || 0,
          totalOperators: dashboardData.stats?.operatorsActive || 0,
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-4 lg:p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-200 rounded w-48 mb-6"></div>
          <div className="grid md:grid-cols-3 gap-4 mb-8">
            {[1,2,3].map(i => (
              <div key={i} className="h-32 bg-slate-200 rounded-2xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const stats = [
    { label: "Proprietà Totali", value: data?.totalProperties || 0, color: "from-sky-400 to-blue-500" },
    { label: "Prenotazioni", value: data?.totalBookings || 0, color: "from-emerald-400 to-teal-500" },
    { label: "Pulizie Totali", value: data?.totalCleanings || 0, color: "from-violet-400 to-purple-500" },
    { label: "Pulizie Completate", value: data?.completedCleanings || 0, color: "from-amber-400 to-orange-500" },
    { label: "Operatori Attivi", value: data?.totalOperators || 0, color: "from-rose-400 to-pink-500" },
  ];

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Report</h1>
        <p className="text-slate-500 mt-1">Panoramica delle statistiche</p>
      </div>

      {/* Stats Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center mb-3`}>
              <span className="text-white text-lg font-bold">{stat.value}</span>
            </div>
            <p className="text-sm text-slate-500">{stat.label}</p>
            <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Progress Bars */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-4">Completamento Pulizie</h2>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-600">Pulizie completate</span>
              <span className="font-medium text-slate-800">
                {data?.completedCleanings || 0} / {data?.totalCleanings || 0}
              </span>
            </div>
            <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full"
                style={{ 
                  width: `${data?.totalCleanings ? (data.completedCleanings / data.totalCleanings) * 100 : 0}%` 
                }}
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
},
    _count: true,
  });

  return (
    <div className="p-4 lg:p-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Report & Statistiche</h1>
          <p className="text-slate-500 mt-1">Panoramica delle performance</p>
        </div>
        
        <div className="flex items-center gap-3">
          <select className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 focus:border-sky-500 outline-none">
            <option>Ultimi 30 giorni</option>
            <option>Ultimi 90 giorni</option>
            <option>Quest&apos;anno</option>
            <option>Tutto</option>
          </select>
          <button className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-medium hover:bg-slate-200 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Esporta
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <p className="text-sm text-slate-500">Proprietà</p>
          </div>
          <p className="text-3xl font-bold text-slate-800">{totalProperties}</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm text-slate-500">Prenotazioni</p>
          </div>
          <p className="text-3xl font-bold text-slate-800">{totalBookings}</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </div>
            <p className="text-sm text-slate-500">Pulizie</p>
          </div>
          <p className="text-3xl font-bold text-slate-800">{totalCleanings}</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <p className="text-sm text-slate-500">Operatori</p>
          </div>
          <p className="text-3xl font-bold text-slate-800">{totalOperators}</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm text-slate-500">Completamento</p>
          </div>
          <p className="text-3xl font-bold text-slate-800">
            {totalCleanings > 0 ? Math.round((completedCleanings / totalCleanings) * 100) : 0}%
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Bookings Chart Placeholder */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Prenotazioni per mese</h3>
          <div className="h-64 flex items-center justify-center bg-slate-50 rounded-xl">
            <p className="text-slate-400">Grafico prenotazioni</p>
          </div>
        </div>

        {/* Cleanings by Status */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Stato pulizie</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-600">Completate</span>
                <span className="font-semibold text-emerald-600">{completedCleanings}</span>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full"
                  style={{ width: `${totalCleanings > 0 ? (completedCleanings / totalCleanings) * 100 : 0}%` }}
                ></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-600">In corso</span>
                <span className="font-semibold text-amber-600">0</span>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full w-0"></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-600">Programmate</span>
                <span className="font-semibold text-sky-600">{totalCleanings - completedCleanings}</span>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-sky-400 to-blue-500 rounded-full"
                  style={{ width: `${totalCleanings > 0 ? ((totalCleanings - completedCleanings) / totalCleanings) * 100 : 0}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
