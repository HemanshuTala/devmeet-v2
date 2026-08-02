'use client';

export default function AnalyticsLoading() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="h-7 w-32 bg-slate-200 rounded animate-pulse mb-6" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="h-3 w-20 bg-slate-200 rounded animate-pulse" />
            <div className="h-8 w-16 bg-slate-200 rounded mt-2 animate-pulse" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="h-5 w-36 bg-slate-200 rounded animate-pulse mb-4" />
            <div className="h-48 bg-slate-100 rounded-lg animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
