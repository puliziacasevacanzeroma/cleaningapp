export default function Loading() {
  return (
    <div className="p-4 lg:p-8">
      {/* Header skeleton */}
      <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl p-6 lg:p-8 mb-6 lg:mb-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-56 bg-white/20 rounded-lg animate-pulse mb-2"></div>
            <div className="h-4 w-72 bg-white/20 rounded-lg animate-pulse"></div>
          </div>
          <div className="h-12 w-52 bg-white/20 rounded-xl animate-pulse hidden lg:block"></div>
        </div>
        
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white/15 rounded-xl p-4">
              <div className="h-4 w-20 bg-white/20 rounded animate-pulse mb-2"></div>
              <div className="h-8 w-16 bg-white/20 rounded animate-pulse"></div>
            </div>
          ))}
        </div>
      </div>

      {/* Content skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100 bg-slate-50">
            <div className="h-6 w-40 bg-slate-200 rounded animate-pulse"></div>
            <div className="h-4 w-32 bg-slate-200 rounded animate-pulse mt-2"></div>
          </div>
          <div className="p-4 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl">
                <div className="w-12 h-12 bg-slate-200 rounded-xl animate-pulse"></div>
                <div className="flex-1">
                  <div className="h-5 w-40 bg-slate-200 rounded animate-pulse mb-2"></div>
                  <div className="h-4 w-64 bg-slate-200 rounded animate-pulse"></div>
                </div>
                <div className="h-6 w-20 bg-slate-200 rounded-full animate-pulse"></div>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="bg-slate-800 rounded-2xl p-6">
            <div className="h-5 w-32 bg-slate-700 rounded animate-pulse mb-4"></div>
            <div className="h-10 w-28 bg-slate-700 rounded animate-pulse mb-2"></div>
            <div className="h-4 w-24 bg-slate-700 rounded animate-pulse"></div>
          </div>
          
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
            <div className="h-6 w-36 bg-slate-200 rounded animate-pulse mb-4"></div>
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
