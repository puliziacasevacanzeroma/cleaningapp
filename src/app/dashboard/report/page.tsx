"use client";

import { useState, useEffect } from "react";

interface ReportData {
  totalProperties: number;
  totalCleanings: number;
  completedCleanings: number;
  totalOperators: number;
}

export default function ReportPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/data")
      .then(res => res.json())
      .then(dashboardData => {
        setData({
          totalProperties: dashboardData.stats?.propertiesTotal || 0,
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
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 bg-slate-200 rounded-2xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const stats = [
    { label: "Proprietà Totali", value: data?.totalProperties || 0, color: "from-sky-400 to-blue-500" },
    { label: "Pulizie Oggi", value: data?.totalCleanings || 0, color: "from-violet-400 to-purple-500" },
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
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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
              <span className="text-slate-600">Pulizie completate oggi</span>
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
}