/**
 * @file loading.tsx
 * @description Next.js Route Segment Skeleton Loading Fallback for `/analytics`.
 *
 * Prevents Cumulative Layout Shift (CLS) by mirroring the visual layout of the analytics dashboard:
 * 1. Page title placeholder.
 * 2. 4-column KPI metric stat cards grid.
 * 3. 5-item breakdown score progress bars container.
 * 4. 2-column chart canvas container skeletons.
 *
 * @module app/analytics/loading
 */

'use client';

/**
 * AnalyticsLoading Skeleton Component.
 *
 * @component
 * @returns {JSX.Element} Shimmer skeleton UI layout.
 */
export default function AnalyticsLoading() {
  return (
    <div
      className="min-h-screen p-6 flex flex-col gap-6"
      style={{ background: 'var(--color-bg)' }}
    >
      {/* Page title placeholder */}
      <div className="skeleton-shimmer h-7 w-36 rounded-lg" />

      {/* 4-Column Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl p-5 border flex flex-col gap-2"
            style={{
              background: 'var(--color-bg-card)',
              borderColor: 'var(--color-border)',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div className="skeleton-shimmer h-3 w-24 rounded-md" />
            <div className="skeleton-shimmer h-8 w-16 rounded-md" />
          </div>
        ))}
      </div>

      {/* Score progress bars section skeleton */}
      <div
        className="rounded-xl p-6 border flex flex-col gap-4"
        style={{
          background: 'var(--color-bg-card)',
          borderColor: 'var(--color-border)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div className="skeleton-shimmer h-5 w-40 rounded-md" />
        <div className="flex flex-col gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <div className="skeleton-shimmer h-4 w-32 rounded-md" />
                <div className="skeleton-shimmer h-4 w-10 rounded-md" />
              </div>
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ background: 'var(--color-bg-subtle)' }}
              >
                <div
                  className="skeleton-shimmer h-full rounded-full"
                  style={{ width: `${40 + i * 12}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chart grid skeletons (2 columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl p-6 border flex flex-col gap-4"
            style={{
              background: 'var(--color-bg-card)',
              borderColor: 'var(--color-border)',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div className="skeleton-shimmer h-5 w-40 rounded-md" />
            <div className="skeleton-shimmer h-48 rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
