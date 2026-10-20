/**
 * @file loading.tsx
 * @description Instant Loading Skeleton for Candidate Global Leaderboard.
 */

import DashboardShell from '@/components/layout/DashboardShell';

export default function LeaderboardLoading() {
  return (
    <DashboardShell maxWidth="max-w-7xl">
      <div className="flex flex-col gap-6 animate-fade-in" aria-busy="true">
        <div className="space-y-2">
          <div className="skeleton-shimmer h-4 w-28 rounded-md" />
          <div className="skeleton-shimmer h-9 w-64 rounded-xl" />
          <div className="skeleton-shimmer h-4 w-96 max-w-full rounded-md" />
        </div>

        {/* Podium Top 3 Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white border border-slate-100 rounded-2xl p-6 flex flex-col items-center gap-3 shadow-sm">
              <div className="skeleton-shimmer h-16 w-16 rounded-full" />
              <div className="skeleton-shimmer h-5 w-32 rounded-md" />
              <div className="skeleton-shimmer h-4 w-20 rounded-md" />
              <div className="skeleton-shimmer h-8 w-24 rounded-full mt-2" />
            </div>
          ))}
        </div>

        {/* Leaderboard Table Skeleton */}
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6 space-y-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-xl border border-slate-50">
              <div className="flex items-center gap-4">
                <div className="skeleton-shimmer h-6 w-6 rounded-md" />
                <div className="skeleton-shimmer h-10 w-10 rounded-full" />
                <div className="skeleton-shimmer h-4 w-40 rounded-md" />
              </div>
              <div className="skeleton-shimmer h-6 w-20 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
