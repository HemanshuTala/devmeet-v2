/**
 * @file loading.tsx
 * @description Instant Loading Skeleton for Interview Session Creation Wizard.
 */

import DashboardShell from '@/components/layout/DashboardShell';

export default function CreateSessionLoading() {
  return (
    <DashboardShell maxWidth="max-w-4xl">
      <div className="flex flex-col gap-6 animate-fade-in" aria-busy="true">
        <div className="space-y-2">
          <div className="skeleton-shimmer h-4 w-28 rounded-md" />
          <div className="skeleton-shimmer h-8 w-64 rounded-xl" />
          <div className="skeleton-shimmer h-4 w-96 max-w-full rounded-md" />
        </div>

        {/* Wizard Step Progress Skeleton */}
        <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="skeleton-shimmer h-8 w-8 rounded-full" />
              <div className="skeleton-shimmer h-4 w-20 rounded-md hidden md:block" />
            </div>
          ))}
        </div>

        {/* Track Selection Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white border border-slate-100 rounded-2xl p-6 space-y-4 shadow-sm">
              <div className="skeleton-shimmer h-10 w-10 rounded-xl" />
              <div className="skeleton-shimmer h-6 w-32 rounded-md" />
              <div className="skeleton-shimmer h-3.5 w-full rounded-md" />
              <div className="skeleton-shimmer h-3.5 w-4/5 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
