'use client';

/**
 * @file loading.tsx (Candidate Profile Route Streaming Loading Skeleton)
 * @description Next.js streaming loading skeleton for the /profile page.
 * Renders pulse placeholders for the user avatar, name/email, tabs bar,
 * personal details grid, and skills tag pills.
 */

/**
 * ProfileLoading Component.
 */
export default function ProfileLoading() {
  return (
    <div
      className="min-h-screen p-6 flex flex-col gap-6"
      style={{ background: 'var(--color-bg)' }}
    >
      {/* Profile summary header banner skeleton */}
      <div
        className="rounded-2xl p-8 border flex flex-col sm:flex-row items-start sm:items-center gap-6"
        style={{
          background: 'var(--color-bg-card)',
          borderColor: 'var(--color-border)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div className="skeleton-shimmer w-20 h-20 rounded-full flex-shrink-0" />
        <div className="flex flex-col gap-2 flex-1">
          <div className="skeleton-shimmer h-6 w-48 rounded-md" />
          <div className="skeleton-shimmer h-4 w-60 rounded-md" />
          <div className="skeleton-shimmer h-3 w-36 rounded-md" />
        </div>
        <div className="skeleton-shimmer h-9 w-28 rounded-lg flex-shrink-0" />
      </div>

      {/* Tabs navigation bar skeleton */}
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`skeleton-shimmer h-9 rounded-lg ${i === 0 ? 'w-24' : 'w-28'}`} />
        ))}
      </div>

      {/* Content cards grid skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, j) => (
          <div
            key={j}
            className="rounded-2xl p-6 border flex flex-col gap-4"
            style={{
              background: 'var(--color-bg-card)',
              borderColor: 'var(--color-border)',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div className="skeleton-shimmer h-5 w-36 rounded-md" />
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, k) => (
                <div key={k} className="flex items-center justify-between py-1">
                  <div className="skeleton-shimmer h-4 w-28 rounded-md" />
                  <div className="skeleton-shimmer h-4 w-44 rounded-md" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Skills & target companies tags section skeleton */}
      <div
        className="rounded-2xl p-6 border flex flex-col gap-4"
        style={{
          background: 'var(--color-bg-card)',
          borderColor: 'var(--color-border)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div className="skeleton-shimmer h-5 w-32 rounded-md" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton-shimmer h-7 rounded-full" style={{ width: `${50 + i * 15}px` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
