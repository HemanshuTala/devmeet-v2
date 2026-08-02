'use client';

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="h-7 w-48 bg-slate-200 rounded-md animate-pulse" />
          <div className="h-4 w-64 bg-slate-200 rounded mt-2 animate-pulse" />
        </div>
        <div className="h-10 w-36 bg-slate-200 rounded-lg animate-pulse" />
      </div>

      {/* Stat cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-white border border-slate-200 rounded-xl p-5 flex items-start gap-4"
          >
            <div className="w-10 h-10 rounded-lg bg-slate-200 animate-pulse" />
            <div className="flex-1">
              <div className="h-3 w-20 bg-slate-200 rounded animate-pulse" />
              <div className="h-7 w-16 bg-slate-200 rounded mt-2 animate-pulse" />
            </div>
          </div>
        ))}
      </div>

      {/* Main content skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6">
          <div className="h-5 w-40 bg-slate-200 rounded animate-pulse mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-200 animate-pulse" />
                <div className="flex-1">
                  <div className="h-4 w-3/4 bg-slate-200 rounded animate-pulse" />
                  <div className="h-3 w-1/2 bg-slate-100 rounded mt-1 animate-pulse" />
                </div>
                <div className="h-6 w-16 bg-slate-200 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="h-5 w-32 bg-slate-200 rounded animate-pulse mb-4" />
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
