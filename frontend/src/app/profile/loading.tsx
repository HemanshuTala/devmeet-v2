'use client';

export default function ProfileLoading() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Profile header skeleton */}
      <div className="bg-white border border-slate-200 rounded-2xl p-8 mb-6">
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 rounded-full bg-slate-200 animate-pulse" />
          <div>
            <div className="h-6 w-48 bg-slate-200 rounded animate-pulse" />
            <div className="h-4 w-56 bg-slate-100 rounded mt-2 animate-pulse" />
            <div className="h-3 w-32 bg-slate-100 rounded mt-2 animate-pulse" />
          </div>
          <div className="ml-auto h-9 w-28 bg-slate-200 rounded-lg animate-pulse" />
        </div>
      </div>

      {/* Content sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-2xl p-6">
            <div className="h-5 w-36 bg-slate-200 rounded animate-pulse mb-4" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="flex justify-between">
                  <div className="h-4 w-28 bg-slate-100 rounded animate-pulse" />
                  <div className="h-4 w-40 bg-slate-200 rounded animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
