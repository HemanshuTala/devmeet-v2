'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Shield,
  Users,
  ClipboardList,
  Server,
  RefreshCw,
  Lock,
  ChevronLeft,
  Slash,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { adminApi } from '@/lib/api';
import { toast } from 'sonner';

// Modularized Admin Subcomponents
import AdminStatCards, { AdminStats } from '@/components/admin/AdminStatCards';
import AdminUserTable, { AdminUser } from '@/components/admin/AdminUserTable';
import AdminAuditLogsTable, { AuditLog } from '@/components/admin/AdminAuditLogsTable';
import AdminSystemHealth from '@/components/admin/AdminSystemHealth';

/**
 * System Administration Console.
 * Orchestrates platform analytics, user privilege management, and immutable audit inspection.
 */
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
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'users' | 'audit' | 'system'>('users');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<Record<string, string>>({});

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
    const matchQ =
      !q || u.email.toLowerCase().includes(q) || u.display_name.toLowerCase().includes(q);
    const matchPlan = !planFilter || u.plan === planFilter;
    return matchQ && matchPlan;
  });

  const handleBlock = async (userId: string, block: boolean) => {
    setActionLoading(userId);
    try {
      if (block) await adminApi.blockUser(userId);
      else await adminApi.unblockUser(userId);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, is_blocked: block } : u)));
      toast.success(`User ${block ? 'blocked' : 'unblocked'} successfully.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed.');
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
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, plan } : u)));
      setPendingPlan((p) => {
        const n = { ...p };
        delete n[userId];
        return n;
      });
      setExpandedUserId(null);
      toast.success(`Plan updated to ${plan.toUpperCase()}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Plan update failed.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (userId: string, email: string) => {
    if (!confirm(`Anonymize ${email}? This action permanently clears personal data.`)) return;
    setActionLoading(`del-${userId}`);
    try {
      await adminApi.deleteUser(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      toast.success('User anonymized (GDPR compliant).');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed.');
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
      toast.error(e instanceof Error ? e.message : 'Impersonation failed.');
    } finally {
      setActionLoading(null);
    }
  };

  const exportCSV = () => {
    const headers = ['ID', 'Action', 'User ID', 'Resource', 'IP', 'Created At'];
    const rows = auditLogs.map((l) => [
      l.id,
      l.action,
      l.user_id ?? '',
      l.resource_type,
      l.ip_address ?? '',
      l.created_at,
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `audit_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
          <p className="text-sm text-slate-500 font-semibold">Verifying administrative access…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !hasAdminAccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white border border-rose-200 rounded-2xl shadow-xl p-8 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center mb-4">
            <Lock className="w-6 h-6 text-rose-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-1">Access Restricted</h2>
          <p className="text-xs text-slate-500 mb-6 font-medium">
            Administrative credentials required. Please login with an authorized admin account.
          </p>
          <Link
            href="/dashboard"
            className="w-full flex items-center justify-center gap-1.5 text-sm font-bold btn-primary py-2.5 rounded-xl"
          >
            <ChevronLeft className="w-4 h-4" /> Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200/80 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 font-bold transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Dashboard
            </Link>
            <Slash className="w-3 h-3 text-slate-300" />
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                <Shield className="w-4 h-4" />
              </div>
              <span className="font-extrabold text-sm text-slate-900">Admin Console</span>
              <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                {user?.email}
              </span>
            </div>
          </div>

          <button
            onClick={fetchAll}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
            Refresh Data
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-6">
        {/* Error notification banner */}
        {error && (
          <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Global Statistics Cards */}
        <AdminStatCards stats={stats} loading={loading} />

        {/* Subnavigation Tabs */}
        <div className="flex gap-1 bg-slate-200/60 p-1 rounded-xl w-fit">
          {[
            { id: 'users', label: 'User Directory', icon: Users },
            { id: 'audit', label: 'Audit Trail', icon: ClipboardList },
            { id: 'system', label: 'System Topology', icon: Server },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as any)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Tab 1: User Directory */}
        {activeTab === 'users' && (
          <AdminUserTable
            users={users}
            filteredUsers={filteredUsers}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            planFilter={planFilter}
            onPlanFilterChange={setPlanFilter}
            loading={loading}
            expandedUserId={expandedUserId}
            onToggleExpand={(id) => setExpandedUserId(expandedUserId === id ? null : id)}
            pendingPlan={pendingPlan}
            onPendingPlanChange={(id, plan) => setPendingPlan((p) => ({ ...p, [id]: plan }))}
            actionLoading={actionLoading}
            onBlockUser={handleBlock}
            onPlanChange={handlePlanChange}
            onImpersonate={handleImpersonate}
            onDeleteUser={handleDelete}
          />
        )}

        {/* Tab 2: Audit Trail */}
        {activeTab === 'audit' && (
          <AdminAuditLogsTable logs={auditLogs} loading={loading} onExportCsv={exportCSV} />
        )}

        {/* Tab 3: System Topology */}
        {activeTab === 'system' && <AdminSystemHealth stats={stats} />}
      </main>
    </div>
  );
}
