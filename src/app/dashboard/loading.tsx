"use client";

export default function DashboardLoading() {
  return (
    <div className="animate-pulse">
      {/* Hero skeleton */}
      <div className="bg-gradient-to-br from-indigo-400 via-purple-400 to-purple-500 rounded-3xl p-4 mb-4 h-48"></div>
      
      {/* Date navigator skeleton */}
      <div className="bg-slate-200 rounded-xl h-12 mb-3"></div>
      
      {/* Cards skeleton */}
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="flex">
              <div className="w-24 h-28 bg-slate-200"></div>
              <div className="flex-1 p-3">
                <div className="h-4 bg-slate-200 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-slate-100 rounded w-1/2 mb-3"></div>
                <div className="flex gap-2">
                  <div className="h-6 w-16 bg-slate-100 rounded-full"></div>
                  <div className="h-6 w-12 bg-slate-100 rounded-full"></div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
