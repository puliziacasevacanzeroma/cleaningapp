export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header skeleton */}
      <div className="bg-gradient-to-r from-sky-500 to-blue-600 px-8 py-6">
        <div className="max-w-7xl mx-auto">
          <div className="h-10 w-64 bg-white/20 rounded-lg animate-pulse mb-2"></div>
          <div className="h-5 w-48 bg-white/20 rounded-lg animate-pulse"></div>
        </div>
      </div>

      {/* Content skeleton */}
      <div className="max-w-7xl mx-auto px-8 py-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
            <div className="h-6 w-32 bg-slate-200 rounded animate-pulse"></div>
            <div className="h-20 bg-slate-100 rounded-xl animate-pulse"></div>
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex justify-between">
                  <div className="h-5 w-24 bg-slate-200 rounded animate-pulse"></div>
                  <div className="h-5 w-16 bg-slate-200 rounded animate-pulse"></div>
                </div>
              ))}
            </div>
          </div>

          {/* Card 2 */}
          <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
            <div className="h-6 w-40 bg-slate-200 rounded animate-pulse"></div>
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse"></div>
              ))}
            </div>
          </div>

          {/* Card 3 */}
          <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
            <div className="h-6 w-36 bg-slate-200 rounded animate-pulse"></div>
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
