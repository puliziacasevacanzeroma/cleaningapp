export default function CalendarioPulizieLoading() {
  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="bg-white px-4 py-4 border-b border-slate-200">
        {/* Title skeleton */}
        <div className="flex items-center justify-between mb-4">
          <div className="h-7 w-24 bg-slate-200 rounded-lg animate-pulse"></div>
          <div className="w-10 h-10 bg-slate-200 rounded-xl animate-pulse"></div>
        </div>
        
        {/* Stats skeleton */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-slate-100 rounded-xl p-2 animate-pulse">
              <div className="h-5 w-8 bg-slate-200 rounded mb-1 mx-auto"></div>
              <div className="h-2 w-10 bg-slate-200 rounded mx-auto"></div>
            </div>
          ))}
        </div>
        
        {/* Date selector skeleton */}
        <div className="h-12 bg-slate-100 rounded-xl mb-3 animate-pulse"></div>
      </div>
      
      {/* Cards skeleton */}
      <div className="px-4 py-4 space-y-3">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="bg-white rounded-2xl border border-slate-100 overflow-hidden animate-pulse">
            <div className="flex">
              <div className="w-2 bg-slate-300"></div>
              <div className="flex-1 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="h-5 w-32 bg-slate-200 rounded mb-2"></div>
                    <div className="h-3 w-24 bg-slate-100 rounded"></div>
                  </div>
                  <div className="h-6 w-20 bg-slate-100 rounded-full"></div>
                </div>
                <div className="flex gap-2 mt-3">
                  <div className="h-8 w-20 bg-slate-100 rounded-lg"></div>
                  <div className="h-8 w-20 bg-slate-100 rounded-lg"></div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
