/**
 * @file loading.tsx
 * @description Instant Loading Skeleton for Candidate Interview History.
 */

import DashboardShell from '@/components/layout/DashboardShell';

export default function HistoryLoading() {
  return (
    <DashboardShell maxWidth="max-w-7xl">
      <div className="flex flex-col gap-6 animate-fade-in" aria-busy="true">
        <div className="space-y-2">
          <div className="skeleton-shimmer h-4 w-28 rounded-md" />
          <div className="skeleton-shimmer h-9 w-64 rounded-xl" />
          <div className="skeleton-shimmer h-4 w-96 max-w-full rounded-md" />
        </div>

        {/* Table / List Container Skeleton */}
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6 space-y-4">
          <div className="flex justify-between items-center pb-4 border-b border-slate-100">
            <div className="skeleton-shimmer h-5 w-40 rounded-md" />
            <div className="skeleton-shimmer h-9 w-32 rounded-xl" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between p-4 rounded-xl border border-slate-50 gap-4">
              <div className="flex items-center gap-4 flex-1">
                <div className="skeleton-shimmer h-10 w-10 rounded-xl shrink-0" />
                <div className="space-y-2 flex-1">
                  <div className="skeleton-shimmer h-4 w-48 rounded-md" />
                  <div className="skeleton-shimmer h-3 w-32 rounded-md" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="skeleton-shimmer h-6 w-20 rounded-full" />
                <div className="skeleton-shimmer h-9 w-24 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
