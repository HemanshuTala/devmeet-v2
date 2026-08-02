'use client';

export default function InterviewLoading() {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Top bar skeleton */}
      <div className="h-14 border-b border-slate-700 flex items-center px-4 gap-4">
        <div className="h-6 w-6 bg-slate-700 rounded animate-pulse" />
        <div className="h-5 w-48 bg-slate-700 rounded animate-pulse" />
        <div className="ml-auto flex gap-2">
          <div className="h-8 w-20 bg-slate-700 rounded animate-pulse" />
          <div className="h-8 w-24 bg-red-900/30 rounded animate-pulse" />
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-0">
        {/* Left panel - Code editor skeleton */}
        <div className="border-r border-slate-700 p-4 flex flex-col">
          <div className="flex gap-2 mb-3">
            <div className="h-8 w-20 bg-slate-700 rounded animate-pulse" />
            <div className="h-8 w-20 bg-slate-800 rounded animate-pulse" />
          </div>
          <div className="flex-1 bg-slate-800 rounded-lg p-4 space-y-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="h-4 bg-slate-700/50 rounded animate-pulse"
                style={{ width: `${Math.random() * 40 + 30}%`, animationDelay: `${i * 50}ms` }}
              />
            ))}
          </div>
        </div>

        {/* Right panel - Chat/AI skeleton */}
        <div className="p-4 flex flex-col">
          <div className="h-5 w-32 bg-slate-700 rounded animate-pulse mb-4" />
          <div className="flex-1 space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? '' : 'justify-end'}`}>
                <div
                  className={`rounded-xl p-4 ${i % 2 === 0 ? 'bg-slate-800 w-3/4' : 'bg-indigo-900/30 w-2/3'}`}
                >
                  <div className="space-y-2">
                    <div className="h-3 w-full bg-slate-700/50 rounded animate-pulse" />
                    <div className="h-3 w-5/6 bg-slate-700/50 rounded animate-pulse" />
                    <div className="h-3 w-2/3 bg-slate-700/50 rounded animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
