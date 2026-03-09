export default function Loading() {
  return (
    <div className="p-4 md:p-6 animate-pulse">
      <div className="h-8 bg-slate-200 rounded-lg w-48 mb-4"></div>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-2xl p-4 h-32">
          <div className="w-10 h-10 bg-slate-200 rounded-xl mb-3"></div>
          <div className="h-6 bg-slate-200 rounded w-16 mb-2"></div>
          <div className="h-4 bg-slate-200 rounded w-24"></div>
        </div>
        <div className="bg-white rounded-2xl p-4 h-32">
          <div className="w-10 h-10 bg-slate-200 rounded-xl mb-3"></div>
          <div className="h-6 bg-slate-200 rounded w-16 mb-2"></div>
          <div className="h-4 bg-slate-200 rounded w-24"></div>
        </div>
        <div className="bg-white rounded-2xl p-4 h-32">
          <div className="w-10 h-10 bg-slate-200 rounded-xl mb-3"></div>
          <div className="h-6 bg-slate-200 rounded w-16 mb-2"></div>
          <div className="h-4 bg-slate-200 rounded w-24"></div>
        </div>
        <div className="bg-white rounded-2xl p-4 h-32">
          <div className="w-10 h-10 bg-slate-200 rounded-xl mb-3"></div>
          <div className="h-6 bg-slate-200 rounded w-16 mb-2"></div>
          <div className="h-4 bg-slate-200 rounded w-24"></div>
        </div>
      </div>
    </div>
  );
}