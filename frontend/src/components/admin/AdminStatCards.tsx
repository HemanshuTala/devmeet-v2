'use client';

import React from 'react';
import { Users, Activity, Ban, DollarSign } from 'lucide-react';

export interface AdminStats {
  total_users: number;
  new_users_today: number;
  total_sessions: number;
  sessions_today: number;
  completed_sessions: number;
  active_sessions: number;
  revenue_estimate: number;
  pro_users: number;
  enterprise_users: number;
  free_users: number;
  blocked_users: number;
}

interface AdminStatCardsProps {
  stats: AdminStats | null;
  loading: boolean;
}

/**
 * Top KPI statistic cards rendered on the admin dashboard.
 */
export function AdminStatCards({ stats, loading }: AdminStatCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-slate-200/80 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {/* Total Users */}
      <div className="relative overflow-hidden rounded-2xl p-5 text-white bg-gradient-to-br from-blue-600 to-blue-800 shadow-md">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider opacity-80">Total Users</p>
            <p className="text-3xl font-extrabold mt-1 tabular-nums">{stats?.total_users ?? 0}</p>
            <p className="text-xs opacity-75 mt-0.5 font-medium">+{stats?.new_users_today ?? 0} today</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-white" />
          </div>
        </div>
      </div>

      {/* Sessions Today */}
      <div className="relative overflow-hidden rounded-2xl p-5 text-white bg-gradient-to-br from-emerald-600 to-teal-700 shadow-md">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider opacity-80">Sessions Today</p>
            <p className="text-3xl font-extrabold mt-1 tabular-nums">{stats?.sessions_today ?? 0}</p>
            <p className="text-xs opacity-75 mt-0.5 font-medium">{stats?.active_sessions ?? 0} live now</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5 text-white" />
          </div>
        </div>
      </div>

      {/* Blocked Accounts */}
      <div className="relative overflow-hidden rounded-2xl p-5 text-white bg-gradient-to-br from-rose-600 to-rose-700 shadow-md">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider opacity-80">Blocked Users</p>
            <p className="text-3xl font-extrabold mt-1 tabular-nums">{stats?.blocked_users ?? 0}</p>
            <p className="text-xs opacity-75 mt-0.5 font-medium">Flagged accounts</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <Ban className="w-5 h-5 text-white" />
          </div>
        </div>
      </div>

      {/* Estimated MRR */}
      <div className="relative overflow-hidden rounded-2xl p-5 text-white bg-gradient-to-br from-amber-500 to-amber-600 shadow-md">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider opacity-80">Revenue Est.</p>
            <p className="text-3xl font-extrabold mt-1 tabular-nums">
              ${(stats?.revenue_estimate ?? 0).toFixed(0)}
            </p>
            <p className="text-xs opacity-75 mt-0.5 font-medium">{stats?.pro_users ?? 0} pro subscribers</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <DollarSign className="w-5 h-5 text-white" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminStatCards;
