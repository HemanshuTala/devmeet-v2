/**
 * @file loading.tsx
 * @description Instant Loading Skeleton for Dashboard Question Bank Explorer.
 *
 * Rendered immediately by Next.js App Router upon navigation to /dashboard/questions,
 * eliminating navigation delay and perceived latency ("hanging" UI).
 */

import DashboardShell from '@/components/layout/DashboardShell';

export default function QuestionsLoading() {
  return (
    <DashboardShell maxWidth="max-w-7xl">
      <div className="flex flex-col gap-6 animate-fade-in" aria-busy="true" aria-label="Loading question bank">
        {/* Header Skeleton */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="skeleton-shimmer h-4 w-28 rounded-md" />
            <div className="skeleton-shimmer h-9 w-64 rounded-xl" />
            <div className="skeleton-shimmer h-4 w-96 max-w-full rounded-md" />
          </div>
          <div className="skeleton-shimmer h-10 w-44 rounded-xl shrink-0" />
        </div>

        {/* Filter Bar Skeleton */}
        <div className="bg-white border border-slate-100 shadow-sm p-6 rounded-2xl grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="skeleton-shimmer h-11 rounded-xl md:col-span-2" />
          <div className="skeleton-shimmer h-11 rounded-xl" />
          <div className="skeleton-shimmer h-11 rounded-xl" />
        </div>

        {/* Results Counter Skeleton */}
        <div className="flex justify-between items-center">
          <div className="skeleton-shimmer h-4 w-32 rounded-md" />
        </div>

        {/* Question Cards Skeleton Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-slate-100 bg-white p-5 flex flex-col justify-between gap-4 shadow-sm"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="skeleton-shimmer h-5 rounded-md" style={{ width: `${60 + (i % 3) * 15}%` }} />
                  <div className="flex gap-1.5 shrink-0">
                    <div className="skeleton-shimmer h-5 w-14 rounded-full" />
                    <div className="skeleton-shimmer h-5 w-16 rounded-full" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="skeleton-shimmer h-3.5 w-full rounded-md" />
                  <div className="skeleton-shimmer h-3.5 w-5/6 rounded-md" />
                  <div className="skeleton-shimmer h-3.5 w-2/3 rounded-md" />
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div className="flex gap-1.5 flex-wrap">
                  <div className="skeleton-shimmer h-5 w-16 rounded-md" />
                  <div className="skeleton-shimmer h-5 w-20 rounded-md" />
                </div>
                <div className="skeleton-shimmer h-9 w-full rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
