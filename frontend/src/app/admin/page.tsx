'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Shield, Users, Activity, DollarSign, AlertTriangle, Search,
  Loader2, RefreshCw, Lock, Ban, CheckCircle, BarChart2,
  ClipboardList, Download, X, ChevronLeft, UserX, CreditCard,
  Eye, TrendingUp, Zap, Database, Globe, Server, Terminal,
  UserCheck, ChevronDown, Slash,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { adminApi } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminStats {
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

interface AdminUser {
  id: string;
  email: string;
  display_name: string;
  plan: string;
  is_blocked: boolean;
  created_at: string;
  total_sessions: number;
}

interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  ip_address: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

// ─── Small Helpers ────────────────────────────────────────────────────────────

function PlanBadge({ plan }: { plan: string }) {
  const styles: Record<string, string> = {
    enterprise: 'bg-amber-100 text-amber-700 border-amber-200 ring-amber-100',
    pro: 'bg-indigo-100 text-indigo-700 border-indigo-200 ring-indigo-100',
    free: 'bg-slate-100 text-slate-500 border-slate-200 ring-slate-100',
  };
  const s = styles[plan] ?? styles.free;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${s}`}>
      {plan}
    </span>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-emerald-400' : 'bg-rose-400'}`} />
  );
}

function Toast({ type, msg, onClose }: { type: string; msg: string; onClose: () => void }) {
  return (
    <div className={`fixed top-5 right-5 z-[100] flex items-center gap-3 rounded-xl border px-5 py-3 shadow-2xl text-sm font-semibold animate-in slide-in-from-top-2 fade-in duration-200 ${
      type === 'success'
        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
        : 'bg-rose-50 border-rose-200 text-rose-800'
    }`}>
      {type === 'success'
        ? <CheckCircle className="w-4 h-4 shrink-0" />
        : <AlertTriangle className="w-4 h-4 shrink-0" />}
      {msg}
      <button onClick={onClose} className="ml-1 opacity-50 hover:opacity-100 transition-opacity">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function StatCard({
  label, value, sub, icon: Icon, gradient, trend,
}: {
  label: string; value: string | number; sub?: string;
  icon: any; gradient: string; trend?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-5 text-white ${gradient}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider opacity-80">{label}</p>
          <p className="text-3xl font-extrabold mt-1 tabular-nums">{value}</p>
          {sub && <p className="text-xs opacity-70 mt-0.5 font-medium">{sub}</p>}
        </div>
        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5" />
        </div>
      </div>
      {trend && (
        <div className="flex items-center gap-1 mt-3 text-xs font-semibold opacity-80">
          <TrendingUp className="w-3 h-3" /> {trend}
        </div>
      )}
      {/* decorative blob */}
      <div className="absolute -bottom-4 -right-4 w-24 h-24 rounded-full bg-white/10 pointer-events-none" />
    </div>
  );
}

function SectionHeader({ icon: Icon, title, subtitle, action }: {
  icon: any; title: string; subtitle?: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
          <Icon className="w-4.5 h-4.5 text-indigo-600" style={{ width: 18, height: 18 }} />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

function ActionBtn({
  onClick, disabled, variant = 'default', children, title,
}: {
  onClick: () => void; disabled?: boolean; variant?: 'danger' | 'success' | 'default' | 'ghost';
  children: React.ReactNode; title?: string;
}) {
  const styles = {
    danger: 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100',
    default: 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100',
    ghost: 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${styles[variant]}`}
    >
      {children}
    </button>
  );
}


// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { user, isAuthenticated, isLoading: authLoading, refreshUser } = useAuth();
  const router = useRouter();
  const hasAdminAccess = useIsAdmin();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: string; msg: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'users' | 'audit' | 'system'>('users');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<Record<string, string>>({});

  const showToast = useCallback((type: string, msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const fetchAll = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const [s, u, l] = await Promise.all([
        adminApi.getStats(),
        adminApi.listUsers(undefined, 100, 0),
        adminApi.getAuditLogs(undefined, 50, 0),
      ]);
      setStats(s);
      setUsers(Array.isArray(u) ? u : []);
      setAuditLogs(Array.isArray(l) ? l : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load admin data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && hasAdminAccess) fetchAll();
  }, [isAuthenticated, hasAdminAccess, fetchAll]);

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    const matchQ = !q || u.email.toLowerCase().includes(q) || u.display_name.toLowerCase().includes(q);
    const matchPlan = !planFilter || u.plan === planFilter;
    return matchQ && matchPlan;
  });

  const handleBlock = async (userId: string, block: boolean) => {
    setActionLoading(userId);
    try {
      if (block) await adminApi.blockUser(userId);
      else await adminApi.unblockUser(userId);
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, is_blocked: block } : u));
      showToast('success', `User ${block ? 'blocked' : 'unblocked'}.`);
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePlanChange = async (userId: string) => {
    const plan = pendingPlan[userId];
    if (!plan) return;
    setActionLoading(`plan-${userId}`);
    try {
      await adminApi.changePlan(userId, plan);
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, plan } : u));
      setPendingPlan((p) => { const n = { ...p }; delete n[userId]; return n; });
      setExpandedUserId(null);
      showToast('success', `Plan updated to ${plan.toUpperCase()}.`);
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Plan update failed.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (userId: string, email: string) => {
    if (!confirm(`Anonymize ${email}? This cannot be undone.`)) return;
    setActionLoading(`del-${userId}`);
    try {
      await adminApi.deleteUser(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      showToast('success', 'User anonymized (GDPR).');
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Delete failed.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleImpersonate = async (userId: string) => {
    setActionLoading(`imp-${userId}`);
    try {
      const data = await adminApi.impersonateUser(userId);
      if (data?.access_token) {
        localStorage.setItem('access_token', data.access_token);
        await refreshUser?.();
        router.push('/dashboard');
      }
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Impersonation failed.');
    } finally {
      setActionLoading(null);
    }
  };

  const exportCSV = () => {
    const headers = ['ID', 'Action', 'User ID', 'Resource', 'IP', 'Created At'];
    const rows = auditLogs.map((l) => [l.id, l.action, l.user_id ?? '', l.resource_type, l.ip_address ?? '', l.created_at]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `audit_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  // ── Loading / Access Guard ────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Verifying access…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !hasAdminAccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white border border-rose-100 rounded-2xl shadow-xl p-8 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center mb-4">
            <Lock className="w-6 h-6 text-rose-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-1">Access Denied</h2>
          <p className="text-sm text-slate-500 mb-6">Admin role required. Login with <code className="bg-slate-100 px-1 rounded text-slate-700">admin@devmeet.com</code>.</p>
          <Link href="/dashboard" className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-2.5 transition-colors">
            <ChevronLeft className="w-4 h-4" /> Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }


  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f8f9fb] text-slate-900">
      {toast && <Toast type={toast.type} msg={toast.msg} onClose={() => setToast(null)} />}

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 font-semibold transition-colors">
              <ChevronLeft className="w-3.5 h-3.5" /> Dashboard
            </Link>
            <Slash className="w-3 h-3 text-slate-300" />
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center">
                <Shield className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-bold text-sm text-slate-900">Admin Console</span>
              <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                {user?.email}
              </span>
            </div>
          </div>
          <button
            onClick={fetchAll}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-indigo-500' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Stats Grid */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 rounded-2xl bg-slate-200 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Users" value={stats?.total_users ?? 0} sub={`+${stats?.new_users_today ?? 0} today`} icon={Users} gradient="bg-gradient-to-br from-indigo-500 to-indigo-700" trend={`${stats?.pro_users ?? 0} pro · ${stats?.enterprise_users ?? 0} enterprise`} />
            <StatCard label="Sessions Today" value={stats?.sessions_today ?? 0} sub={`${stats?.active_sessions ?? 0} active now`} icon={Activity} gradient="bg-gradient-to-br from-emerald-500 to-emerald-700" trend={`${stats?.completed_sessions ?? 0} completed total`} />
            <StatCard label="Blocked Users" value={stats?.blocked_users ?? 0} sub="flagged accounts" icon={Ban} gradient="bg-gradient-to-br from-rose-500 to-rose-700" />
            <StatCard label="Revenue Est." value={`$${(stats?.revenue_estimate ?? 0).toFixed(0)}`} sub="MRR estimate" icon={DollarSign} gradient="bg-gradient-to-br from-amber-500 to-amber-600" trend={`${stats?.free_users ?? 0} free users`} />
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          {([
            { id: 'users', label: 'Users', icon: Users },
            { id: 'audit', label: 'Audit Logs', icon: ClipboardList },
            { id: 'system', label: 'System', icon: Server },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>


        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
              <SectionHeader icon={Users} title="User Management" subtitle={`${filteredUsers.length} of ${users.length} users`} />
              <div className="flex items-center gap-2 ml-auto">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 w-44"
                  />
                </div>
                <select
                  value={planFilter}
                  onChange={(e) => setPlanFilter(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg bg-slate-50 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
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
                <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-400 font-medium">No users found.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredUsers.map((u) => (
                  <div key={u.id} className="hover:bg-slate-50 transition-colors">
                    <div className="px-5 py-3 flex items-center gap-3">
                      {/* Avatar */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${u.is_blocked ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-700'}`}>
                        {u.display_name?.charAt(0)?.toUpperCase() ?? '?'}
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-900 truncate">{u.display_name}</span>
                          <PlanBadge plan={u.plan} />
                          {u.is_blocked && (
                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-600 border border-rose-200">Blocked</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-slate-400 truncate">{u.email}</span>
                          <span className="text-xs text-slate-300">·</span>
                          <span className="text-xs text-slate-400">{u.total_sessions} sessions</span>
                          <span className="text-xs text-slate-300">·</span>
                          <span className="text-xs text-slate-400">{new Date(u.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      {/* Actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <ActionBtn
                          onClick={() => setExpandedUserId(expandedUserId === u.id ? null : u.id)}
                          variant="ghost"
                          title="Expand actions"
                        >
                          <ChevronDown className={`w-3 h-3 transition-transform ${expandedUserId === u.id ? 'rotate-180' : ''}`} />
                        </ActionBtn>
                        <ActionBtn
                          onClick={() => handleBlock(u.id, !u.is_blocked)}
                          disabled={actionLoading === u.id}
                          variant={u.is_blocked ? 'success' : 'danger'}
                          title={u.is_blocked ? 'Unblock user' : 'Block user'}
                        >
                          {actionLoading === u.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : u.is_blocked ? <><UserCheck className="w-3 h-3" /> Unblock</> : <><Ban className="w-3 h-3" /> Block</>}
                        </ActionBtn>
                      </div>
                    </div>

                    {/* Expanded row */}
                    {expandedUserId === u.id && (
                      <div className="px-5 pb-4 ml-11 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                        <span className="text-xs text-slate-500 font-semibold mr-1">Change plan:</span>
                        <select
                          value={pendingPlan[u.id] ?? u.plan}
                          onChange={(e) => setPendingPlan((p) => ({ ...p, [u.id]: e.target.value }))}
                          className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        >
                          <option value="free">Free</option>
                          <option value="pro">Pro</option>
                          <option value="enterprise">Enterprise</option>
                        </select>
                        <ActionBtn
                          onClick={() => handlePlanChange(u.id)}
                          disabled={actionLoading === `plan-${u.id}` || !pendingPlan[u.id]}
                          variant="default"
                        >
                          {actionLoading === `plan-${u.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <><CreditCard className="w-3 h-3" /> Apply</>}
                        </ActionBtn>
                        {!u.email.endsWith('@devmeet.com') && (
                        <ActionBtn
                          onClick={() => handleImpersonate(u.id)}
                          disabled={actionLoading === `imp-${u.id}`}
                          variant="ghost"
                          title="Login as this user"
                        >
                          {actionLoading === `imp-${u.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Eye className="w-3 h-3" /> Impersonate</>}
                        </ActionBtn>
                        )}
                        <ActionBtn
                          onClick={() => handleDelete(u.id, u.email)}
                          disabled={actionLoading === `del-${u.id}`}
                          variant="danger"
                          title="Anonymize user (GDPR)"
                        >
                          {actionLoading === `del-${u.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <><UserX className="w-3 h-3" /> Delete</>}
                        </ActionBtn>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}


        {/* Audit Logs Tab */}
        {activeTab === 'audit' && (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <SectionHeader icon={ClipboardList} title="Audit Logs" subtitle={`${auditLogs.length} recent entries`} />
              <button
                onClick={exportCSV}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
            </div>
            {loading ? (
              <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 text-indigo-400 animate-spin" /></div>
            ) : auditLogs.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-400">No audit logs yet.</div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
                {auditLogs.map((log) => {
                  const actionColor =
                    log.action.includes('block') || log.action.includes('delete') ? 'text-rose-600 bg-rose-50 border-rose-200'
                    : log.action.includes('login') ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
                    : log.action.includes('plan') ? 'text-amber-600 bg-amber-50 border-amber-200'
                    : 'text-indigo-600 bg-indigo-50 border-indigo-200';
                  return (
                    <div key={log.id} className="px-5 py-3 flex items-start gap-3 hover:bg-slate-50 transition-colors">
                      <span className={`mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${actionColor}`}>
                        {log.action}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-slate-600 font-medium">{log.resource_type}</span>
                          {log.resource_id && <span className="text-[10px] text-slate-400 font-mono truncate max-w-[120px]">{log.resource_id}</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {log.ip_address && <span className="text-[10px] text-slate-400">{log.ip_address}</span>}
                          <span className="text-[10px] text-slate-400">{new Date(log.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* System Tab */}
        {activeTab === 'system' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Service Health */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
              <SectionHeader icon={Server} title="Service Health" subtitle="Docker container status" />
              <div className="space-y-2">
                {[
                  { name: 'Auth Service', port: '8001', ok: true },
                  { name: 'User Service', port: '8002', ok: true },
                  { name: 'Admin Service', port: '8010', ok: true },
                  { name: 'Orchestrator', port: '8003', ok: true },
                  { name: 'AI Interviewer', port: '8004', ok: true },
                  { name: 'Code Execution', port: '8005', ok: true },
                  { name: 'Feedback', port: '8007', ok: true },
                  { name: 'Analytics', port: '8009', ok: true },
                ].map((svc) => (
                  <div key={svc.name} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                    <div className="flex items-center gap-2">
                      <StatusDot ok={svc.ok} />
                      <span className="text-sm font-medium text-slate-700">{svc.name}</span>
                    </div>
                    <span className="text-xs text-slate-400 font-mono">:{svc.port}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Plan Distribution */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
              <SectionHeader icon={BarChart2} title="Plan Distribution" subtitle="User breakdown by plan" />
              {stats && (
                <div className="space-y-3 mt-2">
                  {[
                    { label: 'Free', count: stats.free_users, total: stats.total_users, color: 'bg-slate-300' },
                    { label: 'Pro', count: stats.pro_users, total: stats.total_users, color: 'bg-indigo-500' },
                    { label: 'Enterprise', count: stats.enterprise_users, total: stats.total_users, color: 'bg-amber-500' },
                  ].map((item) => {
                    const pct = stats.total_users > 0 ? Math.round((item.count / stats.total_users) * 100) : 0;
                    return (
                      <div key={item.label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-slate-700">{item.label}</span>
                          <span className="text-sm font-bold text-slate-900">{item.count} <span className="text-xs text-slate-400 font-normal">({pct}%)</span></span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${item.color}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-sm">
                    <span className="text-slate-500 font-medium">Revenue estimate</span>
                    <span className="font-bold text-slate-900">${(stats.revenue_estimate ?? 0).toFixed(0)}<span className="text-xs text-slate-400 font-normal"> /mo</span></span>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Links */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 md:col-span-2">
              <SectionHeader icon={Globe} title="Quick Links" subtitle="External services and monitoring" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'RabbitMQ', url: 'http://localhost:15672', icon: Database, color: 'text-orange-600 bg-orange-50 border-orange-100' },
                  { label: 'Prometheus', url: 'http://localhost:9090', icon: Activity, color: 'text-rose-600 bg-rose-50 border-rose-100' },
                  { label: 'Grafana', url: 'http://localhost:3001', icon: BarChart2, color: 'text-amber-600 bg-amber-50 border-amber-100' },
                  { label: 'API Gateway', url: 'http://localhost:8000/docs', icon: Terminal, color: 'text-indigo-600 bg-indigo-50 border-indigo-100' },
                ].map((link) => (
                  <a
                    key={link.label}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-2 p-3 rounded-xl border font-semibold text-sm hover:opacity-80 transition-opacity ${link.color}`}
                  >
                    <link.icon className="w-4 h-4 shrink-0" />
                    {link.label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
