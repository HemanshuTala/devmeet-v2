'use client';

/**
 * @file page.tsx (Dashboard Interview History Page)
 * @description Comprehensive interview history and audit log for the current authenticated candidate.
 * Displays all past mock interviews with multi-attribute filtering (interview type, difficulty,
 * lifecycle status, date range, and free-text search for company or focus area).
 *
 * Provides instant actions to view detailed post-session feedback, launch session replay,
 * or resume active/created sessions directly in the interview studio.
 */

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  History, ChevronLeft, Search, Filter, Clock, Calendar, AlertCircle,
  ExternalLink, PlayCircle, Award, CheckCircle2, RotateCcw, Building2, Sparkles, Plus,
  FileSpreadsheet,
} from 'lucide-react';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useSessions } from '@/hooks/queries/useSessions';
import DashboardShell from '@/components/layout/DashboardShell';
import SessionBadge from '@/components/SessionBadge';
import { DatePicker } from '@/components/ui/date-picker';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

/**
 * Formats an ISO datetime string into human-friendly representation (e.g. "Oct 24, 2026, 04:30 PM").
 *
 * @param dateStr - Raw ISO date string from the API
 * @returns Formatted date string, or em-dash if parsing fails
 */
function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

/**
 * Formats a duration in minutes into a concise hour/minute format (e.g. "45m", "1h 15m").
 *
 * @param minutes - Total session duration in minutes
 * @returns Concise human-readable duration string
 */
function formatDuration(minutes: number) {
  if (!minutes) return '—';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Skeleton loading view displayed while authentication and session history data are fetching.
 */
function HistorySkeleton() {
  return (
    <div className="space-y-8">
      {/* Header bar skeleton */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-32 rounded-xl" />
      </div>

      {/* Top metrics summary cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>

      {/* Filter toolbar and list skeleton */}
      <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Main Interview History Page Component.
 * Fetches user sessions via React Query, handles client-side filtering, and renders metrics and session cards.
 */
export default function HistoryPage() {
  const router = useRouter();

  // Authentication barrier: redirect unauthenticated users to /login
  const { isLoading: authLoading } = useRequireAuth();

  // Fetch full session history from backend orchestrator
  const { data: sessions = [], isLoading: loading, error, refetch } = useSessions();

  // Filter state
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [difficultyFilter, setDifficultyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  /**
   * Memoized client-side filter computation.
   * Evaluates text search (company/focus area), categorical filters, and optional date range boundaries.
   */
  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      // 1. Text match across company name or focus area
      const matchesQuery =
        !query ||
        session.target_company?.toLowerCase().includes(query.toLowerCase()) ||
        session.focus_area?.toLowerCase().includes(query.toLowerCase());

      // 2. Exact categorical matches or 'all' wildcard
      const matchesType = typeFilter === 'all' || session.interview_type === typeFilter;
      const matchesDifficulty = difficultyFilter === 'all' || session.difficulty === difficultyFilter;
      const matchesStatus = statusFilter === 'all' || session.status === statusFilter;

      // 3. Date range match: normalize time boundaries for exact calendar day comparison
      const sessionDate = new Date(session.created_at);
      const fromStart = dateFrom ? new Date(dateFrom.getFullYear(), dateFrom.getMonth(), dateFrom.getDate(), 0, 0, 0, 0) : null;
      const toEnd = dateTo ? new Date(dateTo.getFullYear(), dateTo.getMonth(), dateTo.getDate(), 23, 59, 59, 999) : null;

      const matchesFrom = !fromStart || sessionDate >= fromStart;
      const matchesTo = !toEnd || sessionDate <= toEnd;

      return matchesQuery && matchesType && matchesDifficulty && matchesStatus && matchesFrom && matchesTo;
    });
  }, [sessions, query, typeFilter, difficultyFilter, statusFilter, dateFrom, dateTo]);

  // Aggregate summary metrics across all user sessions
  const totalSessions = sessions.length;
  const completedSessions = sessions.filter((s) => s.status === 'completed').length;
  const inProgressSessions = sessions.filter((s) => s.status === 'in_progress' || s.status === 'created').length;

  if (authLoading) {
    return (
      <DashboardShell maxWidth="max-w-6xl">
        <HistorySkeleton />
      </DashboardShell>
    );
  }

  // Determine if any filter condition is currently divergent from default
  const hasActiveFilters = Boolean(query || typeFilter !== 'all' || difficultyFilter !== 'all' || statusFilter !== 'all' || dateFrom || dateTo);

  // Quick CSV Export Handler
  const handleExportCsv = () => {
    if (filteredSessions.length === 0) return;
    const escapeCsv = (val: any) => {
      const s = String(val ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const lines = [
      'Session ID,Interview Type,Difficulty,Target Company,Focus Area,Status,Duration (Min),Score (%),Created At',
      ...filteredSessions.map((s) =>
        [
          escapeCsv(s.id),
          escapeCsv(s.interview_type),
          escapeCsv(s.difficulty),
          escapeCsv(s.target_company || ''),
          escapeCsv(s.focus_area || ''),
          escapeCsv(s.status),
          escapeCsv(s.duration_minutes || s.actual_duration_minutes || 0),
          escapeCsv(s.score ?? ''),
          escapeCsv(s.created_at),
        ].join(',')
      ),
    ];
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `DevMeet_History_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardShell maxWidth="max-w-6xl">
      {loading ? (
        <HistorySkeleton />
      ) : (
        <div className="space-y-8 pb-10">
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-700 transition-colors mb-1 group"
              >
                <ChevronLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
                Back to Dashboard
              </Link>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
                <History className="w-7 h-7 text-blue-600" />
                Interview History
              </h1>
              <p className="text-xs text-slate-500 font-medium">Review your past mock sessions, AI feedback, and code submissions</p>
            </div>

            <div className="flex items-center gap-2.5">
              <Button
                variant="outline"
                onClick={handleExportCsv}
                disabled={filteredSessions.length === 0}
                className="border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs flex items-center gap-2"
                title="Download filtered interview session history as CSV"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Export CSV</span>
              </Button>
              <Button
                onClick={() => router.push('/dashboard/create-session')}
                className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl shadow-md shadow-blue-500/20 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                New Session
              </Button>
            </div>
          </div>

          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Sessions</p>
                <p className="text-2xl font-black text-slate-900 mt-1">{totalSessions}</p>
              </div>
              <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                <History className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Completed</p>
                <p className="text-2xl font-black text-emerald-600 mt-1">{completedSessions}</p>
              </div>
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active / Created</p>
                <p className="text-2xl font-black text-amber-600 mt-1">{inProgressSessions}</p>
              </div>
              <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
                <PlayCircle className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Filter and Search Bar */}
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-black text-slate-800 uppercase tracking-wider">
                <Filter className="w-4 h-4 text-blue-600" />
                Filter &amp; Search Sessions
              </div>
              {hasActiveFilters && (
                <button
                  onClick={() => {
                    setQuery('');
                    setTypeFilter('all');
                    setDifficultyFilter('all');
                    setStatusFilter('all');
                    setDateFrom(undefined);
                    setDateTo(undefined);
                  }}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset Filters
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Search text input */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 z-10" />
                <input
                  type="text"
                  placeholder="Search company or focus area..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200/80 rounded-xl pl-10 pr-4 py-2 text-xs font-medium text-slate-800 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 transition-all"
                />
              </div>

              {/* Interview type filter dropdown */}
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="bg-slate-50 border-slate-200/80 text-xs font-semibold rounded-xl h-9">
                  <SelectValue placeholder="Interview Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="dsa">DSA &amp; Coding</SelectItem>
                  <SelectItem value="behavioral">Behavioral (STAR)</SelectItem>
                  <SelectItem value="system_design">System Design</SelectItem>
                </SelectContent>
              </Select>

              {/* Difficulty filter dropdown */}
              <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
                <SelectTrigger className="bg-slate-50 border-slate-200/80 text-xs font-semibold rounded-xl h-9">
                  <SelectValue placeholder="Difficulty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Difficulties</SelectItem>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>

              {/* Status filter dropdown */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="bg-slate-50 border-slate-200/80 text-xs font-semibold rounded-xl h-9">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="created">Created</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>

              {/* Date pickers (from/to) */}
              <DatePicker value={dateFrom} onChange={setDateFrom} placeholder="From date" />
              <DatePicker value={dateTo} onChange={setDateTo} placeholder="To date" />
            </div>
          </div>

          {/* Sessions List Container */}
          <div className="bg-white border border-slate-200/80 rounded-3xl overflow-hidden shadow-sm">
            {error ? (
              /* Network or API Error state */
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <AlertCircle className="w-10 h-10 text-rose-500 mb-3" />
                <h3 className="text-slate-900 font-bold text-sm mb-1">Failed to load history</h3>
                <p className="text-slate-400 text-xs max-w-sm mb-4">{error?.message ?? 'Failed to load sessions'}</p>
                <Button size="sm" onClick={() => refetch()} className="bg-blue-600 text-white text-xs font-bold">
                  Retry
                </Button>
              </div>
            ) : filteredSessions.length === 0 ? (
              /* Empty state (either no sessions overall, or zero matches under current filters) */
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400">
                  <History className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-slate-900 font-black text-base">No Sessions Found</h3>
                  <p className="text-slate-400 text-xs mt-1 max-w-sm font-medium">
                    {hasActiveFilters
                      ? 'No practice sessions match your selected filters. Try loosening your search criteria.'
                      : 'You haven’t completed any interview sessions yet. Start your first session to track progress!'}
                  </p>
                </div>
                {hasActiveFilters ? (
                  <button
                    onClick={() => {
                      setQuery('');
                      setTypeFilter('all');
                      setDifficultyFilter('all');
                      setStatusFilter('all');
                      setDateFrom(undefined);
                      setDateTo(undefined);
                    }}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 border border-blue-100 px-4 py-2 rounded-xl transition-colors"
                  >
                    Clear All Filters
                  </button>
                ) : (
                  <Button
                    onClick={() => router.push('/dashboard/create-session')}
                    className="bg-blue-600 text-white text-xs font-extrabold px-5 py-2.5 rounded-xl shadow-md shadow-blue-500/20"
                  >
                    Start First Interview
                  </Button>
                )}
              </div>
            ) : (
              /* Populated Sessions Grid */
              <div className="divide-y divide-slate-100">
                {/* Desktop Table Header */}
                <div className="hidden md:grid grid-cols-[1.2fr_1fr_1fr_1.5fr_1fr_1.3fr_1.2fr] gap-4 px-6 py-3.5 bg-slate-50/70 border-b border-slate-100 text-slate-400 text-[11px] font-black uppercase tracking-wider">
                  <span>Type</span>
                  <span>Difficulty</span>
                  <span>Status</span>
                  <span>Company / Topic</span>
                  <span>Duration</span>
                  <span>Date</span>
                  <span className="text-right">Action</span>
                </div>

                {filteredSessions.map((session) => (
                  <div
                    key={session.id}
                    className="px-6 py-4 hover:bg-slate-50/60 transition-colors flex flex-col md:grid md:grid-cols-[1.2fr_1fr_1fr_1.5fr_1fr_1.3fr_1.2fr] gap-4 items-center"
                  >
                    {/* Interview Mode Badge */}
                    <div className="flex items-center gap-2">
                      <SessionBadge variant="type" value={session.interview_type} />
                    </div>

                    {/* Difficulty Badge */}
                    <div>
                      <SessionBadge variant="difficulty" value={session.difficulty} />
                    </div>

                    {/* Status Badge */}
                    <div>
                      <SessionBadge variant="status" value={session.status} />
                    </div>

                    {/* Target Company / Focus Area */}
                    <div className="min-w-0 w-full md:w-auto">
                      <p className="text-slate-900 text-xs font-bold truncate">
                        {session.target_company || 'General Practice'}
                      </p>
                      {session.focus_area && (
                        <p className="text-slate-400 text-[10px] uppercase font-bold mt-0.5 truncate">
                          {session.focus_area}
                        </p>
                      )}
                    </div>

                    {/* Duration */}
                    <div className="flex items-center gap-1.5 text-slate-600 text-xs font-semibold">
                      <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{formatDuration(session.duration_minutes)}</span>
                    </div>

                    {/* Session creation timestamp */}
                    <div className="flex items-center gap-1.5 text-slate-500 text-xs font-medium">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{formatDate(session.created_at)}</span>
                    </div>

                    {/* Contextual Action Links */}
                    <div className="text-right w-full md:w-auto flex md:justify-end gap-3 items-center pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                      {session.status === 'completed' ? (
                        <div className="flex items-center gap-3">
                          <Link
                            href={`/interview/${session.id}/feedback`}
                            className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors"
                          >
                            Feedback <ExternalLink className="w-3 h-3" />
                          </Link>
                          <Link
                            href={`/interview/${session.id}/replay`}
                            className="text-xs font-semibold text-slate-400 hover:text-slate-700 transition-colors"
                          >
                            Replay
                          </Link>
                        </div>
                      ) : session.status === 'in_progress' || session.status === 'created' ? (
                        <Link
                          href={`/interview/${session.id}`}
                          className="text-xs font-bold text-emerald-600 hover:text-emerald-800 flex items-center gap-1 transition-colors bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg"
                        >
                          Resume <ExternalLink className="w-3 h-3" />
                        </Link>
                      ) : (
                        <span className="text-slate-300 text-xs font-semibold">—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
