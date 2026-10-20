/**
 * @file loading.tsx
 * @description Next.js Route Segment Skeleton Fallback for `/dashboard`.
 *
 * Prevents Cumulative Layout Shift (CLS) by mirroring the layout of the primary dashboard:
 * 1. Top welcome greeting and action button placeholder.
 * 2. 4-column KPI metric summary card placeholders.
 * 3. 2-column chart canvas and quick action list placeholders.
 * 4. 5-row recent sessions table placeholder.
 *
 * @module app/dashboard/loading
 */

'use client';

/**
 * DashboardLoading Component.
 *
 * @component
 * @returns {JSX.Element} Shimmer skeleton layout matching the main dashboard.
 */
export default function DashboardLoading() {
  return (
    <div
      className="min-h-screen p-6 flex flex-col gap-6"
      style={{ background: 'var(--color-bg)' }}
    >
      {/* Header Greeting Skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <div className="skeleton-shimmer h-7 w-52 rounded-lg" />
          <div className="skeleton-shimmer h-4 w-72 rounded-md" />
        </div>
        <div className="skeleton-shimmer h-10 w-36 rounded-lg" />
      </div>

      {/* 4-Column Stat Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl p-5 flex items-start gap-4 border"
            style={{
              background: 'var(--color-bg-card)',
              borderColor: 'var(--color-border)',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div className="skeleton-shimmer w-10 h-10 rounded-lg flex-shrink-0" />
            <div className="flex-1 flex flex-col gap-2">
              <div className="skeleton-shimmer h-3 w-20 rounded-md" />
              <div className="skeleton-shimmer h-7 w-14 rounded-md" />
            </div>
          </div>
        ))}
      </div>

      {/* Main Grid: Chart + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend chart area placeholder */}
        <div
          className="lg:col-span-2 rounded-xl p-6 border flex flex-col gap-4"
          style={{
            background: 'var(--color-bg-card)',
            borderColor: 'var(--color-border)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div className="skeleton-shimmer h-5 w-40 rounded-md" />
          <div className="skeleton-shimmer h-52 w-full rounded-xl" />
        </div>

        {/* Quick action shortcuts placeholder */}
        <div
          className="rounded-xl p-6 border flex flex-col gap-4"
          style={{
            background: 'var(--color-bg-card)',
            borderColor: 'var(--color-border)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div className="skeleton-shimmer h-5 w-32 rounded-md" />
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton-shimmer h-12 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>

      {/* Recent Sessions Table Skeleton */}
      <div
        className="rounded-xl p-6 border flex flex-col gap-4"
        style={{
          background: 'var(--color-bg-card)',
          borderColor: 'var(--color-border)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="skeleton-shimmer h-5 w-44 rounded-md" />
          <div className="skeleton-shimmer h-8 w-24 rounded-lg" />
        </div>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-2">
              <div className="skeleton-shimmer w-9 h-9 rounded-full flex-shrink-0" />
              <div className="flex-1 flex flex-col gap-1.5">
                <div className="skeleton-shimmer h-4 rounded-md" style={{ width: `${55 + (i % 3) * 15}%` }} />
                <div className="skeleton-shimmer h-3 w-32 rounded-md" />
              </div>
              <div className="skeleton-shimmer h-6 w-20 rounded-full" />
              <div className="skeleton-shimmer h-8 w-16 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
