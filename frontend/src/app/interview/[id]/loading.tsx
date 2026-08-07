'use client';

export default function InterviewLoading() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Top bar skeleton */}
      <div
        className="h-14 flex items-center px-4 gap-4 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.08)', background: '#0f0f1a' }}
      >
        <div className="h-6 w-6 rounded bg-slate-800 animate-pulse" />
        <div className="h-5 w-52 rounded bg-slate-800 animate-pulse" />
        <div className="ml-auto flex gap-2">
          <div className="h-8 w-20 rounded-lg bg-slate-800 animate-pulse" />
          <div className="h-8 w-24 rounded-lg animate-pulse" style={{ background: 'rgba(220,38,38,0.2)' }} />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2">
        {/* Left — code editor skeleton */}
        <div
          className="border-r p-4 flex flex-col gap-3"
          style={{ borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <div className="flex gap-2">
            <div className="h-8 w-20 rounded-lg bg-slate-800 animate-pulse" />
            <div className="h-8 w-20 rounded-lg bg-slate-800/50 animate-pulse" />
          </div>
          <div
            className="flex-1 rounded-xl p-4 flex flex-col gap-2"
            style={{ background: '#1a1a2e', minHeight: 300 }}
          >
            {Array.from({ length: 14 }).map((_, i) => (
              <div
                key={i}
                className="h-4 rounded bg-slate-700/40 animate-pulse"
                style={{
                  width: `${30 + ((i * 17) % 45)}%`,
                  animationDelay: `${i * 40}ms`,
                }}
              />
            ))}
          </div>
        </div>

        {/* Right — chat skeleton */}
        <div className="p-4 flex flex-col gap-4">
          <div className="h-5 w-36 rounded bg-slate-800 animate-pulse" />
          <div className="flex flex-col gap-4 flex-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? '' : 'justify-end'}`}>
                <div
                  className="rounded-2xl p-4 animate-pulse"
                  style={{
                    width: i % 2 === 0 ? '72%' : '62%',
                    background: i % 2 === 0 ? '#1e1e30' : 'rgba(79,70,229,0.15)',
                  }}
                >
                  <div className="flex flex-col gap-2">
                    <div className="h-3 w-full rounded bg-slate-700/50" />
                    <div className="h-3 rounded bg-slate-700/50" style={{ width: '83%' }} />
                    <div className="h-3 rounded bg-slate-700/50" style={{ width: '60%' }} />
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
