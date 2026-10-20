'use client';

import React from 'react';
import {
  Users,
  Search,
  ChevronDown,
  Loader2,
  UserCheck,
  Ban,
  CreditCard,
  Eye,
  UserX,
} from 'lucide-react';

export interface AdminUser {
  id: string;
  email: string;
  display_name: string;
  plan: string;
  is_blocked: boolean;
  created_at: string;
  total_sessions: number;
}

interface AdminUserTableProps {
  users: AdminUser[];
  filteredUsers: AdminUser[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  planFilter: string;
  onPlanFilterChange: (p: string) => void;
  loading: boolean;
  expandedUserId: string | null;
  onToggleExpand: (userId: string) => void;
  pendingPlan: Record<string, string>;
  onPendingPlanChange: (userId: string, plan: string) => void;
  actionLoading: string | null;
  onBlockUser: (userId: string, block: boolean) => void;
  onPlanChange: (userId: string) => void;
  onImpersonate: (userId: string) => void;
  onDeleteUser: (userId: string, email: string) => void;
}

function PlanBadge({ plan }: { plan: string }) {
  const styles: Record<string, string> = {
    enterprise: 'bg-slate-100 text-slate-800 border-slate-200',
    pro: 'bg-blue-50 text-blue-700 border-blue-200',
    free: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  const s = styles[plan] ?? styles.free;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${s}`}>
      {plan}
    </span>
  );
}

/**
 * Filterable, searchable table displaying candidates and administrative action buttons (Block, Plan override, Impersonate, GDPR Anonymize).
 */
export function AdminUserTable({
  users,
  filteredUsers,
  searchQuery,
  onSearchChange,
  planFilter,
  onPlanFilterChange,
  loading,
  expandedUserId,
  onToggleExpand,
  pendingPlan,
  onPendingPlanChange,
  actionLoading,
  onBlockUser,
  onPlanChange,
  onImpersonate,
  onDeleteUser,
}: AdminUserTableProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">User Management</h3>
            <p className="text-[11px] text-slate-500">
              Showing {filteredUsers.length} of {users.length} registered candidates
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search name or email…"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-400 w-44 sm:w-56"
            />
          </div>
          <select
            value={planFilter}
            onChange={(e) => onPlanFilterChange(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg bg-slate-50 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="">All Plans</option>
            <option value="free">Free</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="p-8 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="p-10 text-center text-sm text-slate-400 font-medium">
          No candidates match the selected search criteria.
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {filteredUsers.map((u) => (
            <div key={u.id} className="hover:bg-slate-50/50 transition-colors">
              <div className="px-5 py-3.5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      u.is_blocked
                        ? 'bg-rose-100 text-rose-600'
                        : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {u.display_name?.charAt(0)?.toUpperCase() ?? '?'}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                        {u.display_name}
                      </span>
                      <PlanBadge plan={u.plan} />
                      {u.is_blocked && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-600 border border-rose-200">
                          Blocked
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5 font-medium">
                      <span className="truncate">{u.email}</span>
                      <span>·</span>
                      <span>{u.total_sessions} sessions</span>
                      <span>·</span>
                      <span>{new Date(u.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => onToggleExpand(u.id)}
                    aria-label="Toggle user options drawer"
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                  >
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform ${
                        expandedUserId === u.id ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  <button
                    onClick={() => onBlockUser(u.id, !u.is_blocked)}
                    disabled={actionLoading === u.id}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                      u.is_blocked
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                        : 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                    }`}
                  >
                    {actionLoading === u.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : u.is_blocked ? (
                      <>
                        <UserCheck className="w-3.5 h-3.5" /> Unblock
                      </>
                    ) : (
                      <>
                        <Ban className="w-3.5 h-3.5" /> Block
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Expandable actions drawer */}
              {expandedUserId === u.id && (
                <div className="px-5 pb-4 ml-11 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  <span className="text-xs text-slate-500 font-semibold mr-1">Plan Override:</span>
                  <select
                    value={pendingPlan[u.id] ?? u.plan}
                    onChange={(e) => onPendingPlanChange(u.id, e.target.value)}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none"
                  >
                    <option value="free">Free</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                  <button
                    onClick={() => onPlanChange(u.id)}
                    disabled={actionLoading === `plan-${u.id}` || !pendingPlan[u.id]}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold"
                  >
                    {actionLoading === `plan-${u.id}` ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <>
                        <CreditCard className="w-3 h-3" /> Save Plan
                      </>
                    )}
                  </button>
                  {!u.email.endsWith('@devmeet.com') && (
                    <button
                      onClick={() => onImpersonate(u.id)}
                      disabled={actionLoading === `imp-${u.id}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold"
                    >
                      {actionLoading === `imp-${u.id}` ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <>
                          <Eye className="w-3 h-3" /> Impersonate
                        </>
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => onDeleteUser(u.id, u.email)}
                    disabled={actionLoading === `del-${u.id}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-semibold ml-auto"
                  >
                    {actionLoading === `del-${u.id}` ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <>
                        <UserX className="w-3 h-3" /> GDPR Anonymize
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AdminUserTable;
