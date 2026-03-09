export default function Loading() {
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="animate-pulse">
        {/* Header skeleton */}
        <div className="mb-6">
          <div className="h-8 bg-slate-200 rounded-lg w-40 mb-2"></div>
          <div className="h-4 bg-slate-100 rounded w-60"></div>
        </div>

        {/* Tabs skeleton */}
        <div className="flex gap-2 mb-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-10 bg-slate-200 rounded-xl w-24"></div>
          ))}
        </div>

        {/* Notifications skeleton */}
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-2xl p-5 border border-slate-100">
              <div className="flex gap-4">
                <div className="w-14 h-14 bg-slate-200 rounded-2xl"></div>
                <div className="flex-1">
                  <div className="h-5 bg-slate-200 rounded w-3/4 mb-2"></div>
                  <div className="h-4 bg-slate-100 rounded w-full mb-1"></div>
                  <div className="h-4 bg-slate-100 rounded w-2/3"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
