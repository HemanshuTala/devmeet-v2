/**
 * @file RecentSessions.tsx
 * @description Interview History Table and Interactive Drag-and-Drop Kanban Board.
 *
 * Responsibilities:
 * 1. Dual View Modes:
 *    - **List View**: Paginated/filtered tabular view showing recent 5 sessions with status badges, durations, and quick links.
 *    - **Kanban Board View**: Drag-and-drop workflow (`@hello-pangea/dnd`) across 4 lifecycle stages:
 *      - Planned (`created`)
 *      - In Progress (`in_progress` / `paused`)
 *      - Completed (`completed`)
 *      - Cancelled (`cancelled`)
 * 2. Optimistic State Machine:
 *    - Updates local session state immediately upon dragging card between columns.
 *    - Dispatches appropriate REST mutation (`sessionApi.complete`, `cancel`, `resume`, `pause`).
 *    - Reverts back to previous state and displays a Sonner error toast if backend rejects the transition.
 * 3. Company Filtering:
 *    - Gathers target company names and provides one-click chip filtering.
 * 4. Data Export (Pro Feature):
 *    - Generates client-side downloadable CSV report for subscribers.
 *
 * @module app/dashboard/RecentSessions
 */

'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  Loader2,
  History,
  Clock,
  Calendar,
  Plus,
  Building2,
  Download,
  X,
  List,
  Kanban,
  Play,
  Sparkles,
  Target,
} from 'lucide-react';
import { sessionApi } from '@/lib/api';
import SessionBadge from '@/components/SessionBadge';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { toast } from 'sonner';

/**
 * Formats an ISO date string into readable English (e.g., 'Oct 24, 2026').
 *
 * @param {string} dateStr - Raw timestamp.
 * @returns {string} Formatted date.
 */
function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

/**
 * Formats duration in minutes to hours and minutes (e.g. 75 -> '1h 15m').
 *
 * @param {number} [minutes] - Session duration in minutes.
 * @returns {string} Human-readable duration string.
 */
function formatDuration(minutes?: number): string {
  if (!minutes) return '—';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Skeleton placeholder row for the sessions list table.
 */
function SkeletonRow() {
  return (
    <div
      className="flex items-center gap-4 p-4 border-b"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <div className="skeleton-shimmer h-5 rounded w-24" />
      <div className="skeleton-shimmer h-5 rounded w-16" />
      <div className="skeleton-shimmer h-5 rounded w-16" />
      <div className="skeleton-shimmer h-5 rounded flex-1" />
      <div className="skeleton-shimmer h-5 rounded w-12" />
    </div>
  );
}

/**
 * Generates and triggers download of interview sessions in CSV format.
 *
 * @param {any[]} sessions - Sessions array to serialize.
 */
function exportToCSV(sessions: any[]) {
  const headers = [
    'ID',
    'Type',
    'Difficulty',
    'Status',
    'Company',
    'Focus Area',
    'Duration (min)',
    'Created At',
  ];
  const rows = sessions.map((s) => [
    s.id,
    s.interview_type,
    s.difficulty,
    s.status,
    s.target_company ?? '',
    s.focus_area ?? '',
    String(s.duration_minutes ?? ''),
    s.created_at,
  ]);
  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `devmeet_sessions_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Props accepted by RecentSessions.
 */
interface RecentSessionsProps {
  sessionsLoading?: boolean;
  sessionsError?: any;
  recentSessions?: any[];
  allSessions?: any[];
  totalSessions?: number;
  fetchSessions?: () => void;
  isPro?: boolean;
  sessions?: any[];
  isLoading?: boolean;
}

/**
 * RecentSessions Component.
 *
 * @component
 * @param {RecentSessionsProps} props
 * @returns {JSX.Element} Sessions section with List and Kanban tabs.
 */
export default function RecentSessions({
  sessionsLoading,
  sessionsError,
  recentSessions,
  allSessions,
  totalSessions,
  fetchSessions,
  isPro = false,
  sessions,
  isLoading,
}: RecentSessionsProps) {
  // Selected company filter chip
  const [companyFilter, setCompanyFilter] = useState('');
  // Active view mode ('list' | 'kanban')
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  // Local state for optimistic drag-and-drop reordering
  const [localSessions, setLocalSessions] = useState<any[]>([]);
  const [mounted, setMounted] = useState(false);

  // Prevent SSR hydration mismatches in react-beautiful-dnd / hello-pangea
  useEffect(() => {
    setMounted(true);
  }, []);

  // Synchronize local drag state with parent props
  useEffect(() => {
    setLocalSessions(allSessions || sessions || []);
  }, [allSessions, sessions]);

  // Extract unique sorted companies for chip filtering
  const companies = useMemo(() => {
    const set = new Set<string>();
    (allSessions || sessions || []).forEach((s: any) => {
      if (s.target_company) set.add(s.target_company);
    });
    return Array.from(set).sort();
  }, [allSessions, sessions]);

  // List View: Top 5 most recent sessions matching active filter
  const filteredListSessions = useMemo(() => {
    const recent = [...localSessions]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);
    if (!companyFilter) return recent;
    return recent.filter((s) => s.target_company === companyFilter);
  }, [localSessions, companyFilter]);

  // Kanban View: All sessions matching active company filter
  const filteredAllSessions = useMemo(() => {
    if (!companyFilter) return localSessions;
    return localSessions.filter((s) => s.target_company === companyFilter);
  }, [localSessions, companyFilter]);

  /**
   * Handles dropping a session card into a different status column.
   * Performs optimistic local UI update followed by backend REST mutation.
   *
   * @param {DropResult} result - Drop payload containing source and destination droppable IDs.
   */
  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) {
      return;
    }

    const sessionId = draggableId;
    const newStatus = destination.droppableId;
    const targetSession = localSessions.find((s) => s.id === sessionId);
    if (!targetSession) return;
    const oldStatus = targetSession.status;

    // 1. Optimistic UI update
    setLocalSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, status: newStatus } : s))
    );

    // 2. Dispatch backend status transition API call
    try {
      if (newStatus === 'completed') {
        await sessionApi.complete(sessionId);
        toast.success('Session marked as completed!');
      } else if (newStatus === 'cancelled') {
        await sessionApi.cancel(sessionId);
        toast.success('Session moved to cancelled!');
      } else if (newStatus === 'in_progress') {
        await sessionApi.resume(sessionId);
        toast.success('Session resumed!');
      } else if (newStatus === 'created') {
        await sessionApi.pause(sessionId);
        toast.success('Session paused/drafted!');
      }
      fetchSessions?.();
    } catch (err: any) {
      // 3. Rollback on failure
      setLocalSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, status: oldStatus } : s))
      );
      toast.error(`Failed to change session status: ${err?.message || 'Server error'}`);
    }
  };

  /** Column configuration for the Kanban board */
  const kanbanColumns = [
    {
      id: 'created',
      title: 'Planned',
      borderClass: 'border-blue-200',
      bgClass: 'bg-blue-50/15',
      textClass: 'text-blue-700',
    },
    {
      id: 'in_progress',
      title: 'In Progress',
      borderClass: 'border-amber-200',
      bgClass: 'bg-amber-50/15',
      textClass: 'text-amber-700',
    },
    {
      id: 'completed',
      title: 'Completed',
      borderClass: 'border-green-200',
      bgClass: 'bg-green-50/15',
      textClass: 'text-green-700',
    },
    {
      id: 'cancelled',
      title: 'Cancelled',
      borderClass: 'border-red-200',
      bgClass: 'bg-red-50/15',
      textClass: 'text-red-700',
    },
  ];

  return (
    <section className="animate-fade-in-up delay-400">
      {/* Header and Controls */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Interview Sessions</h2>
          <p className="text-slate-500 text-xs mt-0.5 font-semibold">
            {viewMode === 'list'
              ? 'Your last 5 interview sessions'
              : 'Manage your interview lifecycle via drag & drop'}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Company Filter Chips */}
          {companies.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              {companyFilter ? (
                <button
                  onClick={() => setCompanyFilter('')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-bold hover:bg-blue-200 transition-colors"
                >
                  {companyFilter}
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                companies.slice(0, 3).map((c) => (
                  <button
                    key={c}
                    onClick={() => setCompanyFilter(c)}
                    className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold hover:bg-blue-100 hover:text-blue-700 transition-colors border border-slate-200/50"
                  >
                    {c}
                  </button>
                ))
              )}
              {!companyFilter && companies.length > 3 && (
                <span className="text-[10px] text-slate-400 font-bold">
                  +{companies.length - 3} more
                </span>
              )}
            </div>
          )}

          {/* List vs Kanban View Toggle */}
          <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200/55 shadow-inner">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'list' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              List
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'kanban' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              Kanban Board
            </button>
          </div>

          {/* CSV Export Action Button */}
          {isPro ? (
            <button
              onClick={() => exportToCSV(allSessions || sessions || [])}
              disabled={(allSessions || sessions || []).length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-800 text-xs font-bold transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title="Export all sessions as CSV"
              id="export-csv-btn"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          ) : (
            <Link
              href="/billing"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-50 to-yellow-50 hover:from-amber-100 hover:to-yellow-100 border border-amber-200 text-amber-700 text-xs font-bold transition-all shadow-sm"
              title="Upgrade to Pro for CSV export"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
              <span className="px-1.5 py-0.5 bg-amber-200/60 rounded text-[9px] font-extrabold uppercase tracking-wider">
                PRO
              </span>
            </Link>
          )}

          {/* View Full History Link */}
          {(totalSessions ?? (allSessions || sessions || []).length) > 5 && viewMode === 'list' && (
            <Link
              href="/dashboard/history"
              className="btn-ghost flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold hover:bg-slate-100 transition-all border border-slate-200"
            >
              <History className="w-3.5 h-3.5" />
              View All
            </Link>
          )}
        </div>
      </div>

      {/* ── View Mode: List ── */}
      {viewMode === 'list' && (
        <div className="bg-white border border-slate-100 overflow-hidden shadow-sm hover:shadow-md hover:border-slate-200/60 transition-all duration-200 rounded-2xl">
          {sessionsLoading ? (
            <div>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : sessionsError ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <AlertCircle className="w-10 h-10 text-red-500 mb-3" />
              <p className="text-red-600 font-bold mb-1">Failed to load sessions</p>
              <p className="text-slate-500 text-sm mb-4">{sessionsError}</p>
              <button
                onClick={fetchSessions}
                className="btn-ghost text-sm flex items-center gap-1.5 hover:bg-slate-100 cursor-pointer"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                Retry
              </button>
            </div>
          ) : filteredListSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="w-20 h-20 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center mb-6">
                <Clock className="w-8 h-8 text-blue-600" />
              </div>
              {companyFilter ? (
                <>
                  <h3 className="text-slate-900 font-bold text-lg mb-2">
                    No sessions for "{companyFilter}"
                  </h3>
                  <button
                    onClick={() => setCompanyFilter('')}
                    className="btn-ghost text-sm mt-2 cursor-pointer"
                  >
                    Clear filter
                  </button>
                </>
              ) : (
                <>
                  <h3 className="text-slate-900 font-bold text-lg mb-2">No sessions yet</h3>
                  <p className="text-slate-500 text-xs max-w-sm mb-6 font-semibold">
                    Start your first mock interview session to track your progress and improve your skills.
                  </p>
                  <Link
                    href="/dashboard/create-session"
                    className="btn-primary flex items-center gap-2 px-5 py-2"
                  >
                    <Plus className="w-4 h-4" />
                    Start First Interview
                  </Link>
                </>
              )}
            </div>
          ) : (
            <>
              {/* Desktop Table Headers */}
              <div className="hidden md:grid grid-cols-[2.5fr_1fr_1fr_1.2fr_1fr_1.2fr_1fr] gap-4 px-5 py-3.5 border-b border-blue-50 text-slate-500 text-xs font-extrabold uppercase tracking-wider">
                <span>Type</span>
                <span>Difficulty</span>
                <span>Status</span>
                <span>Company</span>
                <span>Duration</span>
                <span>Date</span>
                <span className="text-right">Action</span>
              </div>

              {/* Session Rows */}
              {filteredListSessions.map((session, idx) => (
                <div
                  key={session.id}
                  className={`group px-5 py-4 transition-colors duration-150 hover:bg-slate-50/50 ${
                    idx < filteredListSessions.length - 1 ? 'border-b border-blue-50' : ''
                  }`}
                  style={{ contentVisibility: 'auto', containIntrinsicSize: '0 68px' }}
                >
                  {/* Desktop Layout */}
                  <div className="hidden md:grid grid-cols-[2.5fr_1fr_1fr_1.2fr_1fr_1.2fr_1fr] gap-4 items-center">
                    <div className="flex flex-col items-start gap-1">
                      <SessionBadge variant="type" value={session.interview_type} />
                      {session.focus_area && (
                        <span
                          className="text-slate-400 text-xs truncate max-w-[180px] font-semibold tracking-wide"
                          title={session.focus_area}
                        >
                          {session.focus_area}
                        </span>
                      )}
                    </div>
                    <div>
                      <SessionBadge variant="difficulty" value={session.difficulty} />
                    </div>
                    <div>
                      <SessionBadge variant="status" value={session.status} />
                    </div>
                    <div>
                      <button
                        onClick={() => setCompanyFilter(session.target_company ?? '')}
                        className={`text-left text-slate-700 text-sm truncate font-bold hover:text-blue-600 transition-colors ${
                          session.target_company ? 'cursor-pointer' : 'cursor-default'
                        }`}
                        disabled={!session.target_company}
                      >
                        {session.target_company ?? '—'}
                      </button>
                    </div>
                    <div className="flex items-center gap-1 text-slate-500 text-sm font-semibold">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {formatDuration(session.duration_minutes)}
                    </div>
                    <div className="flex items-center gap-1 text-slate-500 text-sm font-semibold">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {formatDate(session.created_at)}
                    </div>
                    <div className="text-right">
                      {session.status === 'completed' ? (
                        <Link
                          href={`/interview/${session.id}/feedback`}
                          className="inline-flex items-center justify-center px-3.5 py-1.5 rounded-xl border border-blue-200 text-blue-600 bg-white hover:bg-blue-50 text-xs font-bold transition-all shadow-sm shadow-blue-500/5"
                        >
                          View Report
                        </Link>
                      ) : session.status === 'in_progress' || session.status === 'created' || session.status === 'paused' ? (
                        <Link
                          href={`/interview/${session.id}`}
                          className="inline-flex items-center justify-center px-3.5 py-1.5 rounded-xl border border-emerald-200 text-emerald-600 bg-white hover:bg-emerald-50 text-xs font-bold transition-all shadow-sm animate-pulse"
                        >
                          Continue
                        </Link>
                      ) : (
                        <span className="text-slate-400 text-xs font-bold">—</span>
                      )}
                    </div>
                  </div>

                  {/* Mobile Stacked Card Layout */}
                  <div className="md:hidden space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <SessionBadge variant="type" value={session.interview_type} />
                        <SessionBadge variant="difficulty" value={session.difficulty} />
                        <SessionBadge variant="status" value={session.status} />
                      </div>
                      <div>
                        {session.status === 'completed' ? (
                          <Link href={`/interview/${session.id}/feedback`} className="text-blue-600 text-xs font-bold">
                            Report →
                          </Link>
                        ) : session.status === 'in_progress' || session.status === 'created' || session.status === 'paused' ? (
                          <Link href={`/interview/${session.id}`} className="text-green-600 text-xs font-bold">
                            Resume →
                          </Link>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-slate-500 text-xs font-semibold">
                      {session.target_company && (
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          {session.target_company}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {formatDuration(session.duration_minutes)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {formatDate(session.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── View Mode: Kanban Board ── */}
      {viewMode === 'kanban' && (
        <div className="relative">
          {!mounted || sessionsLoading ? (
            <div className="bg-white border border-slate-100 rounded-3xl p-10 flex items-center justify-center min-h-[450px]">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : filteredAllSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 bg-white border border-slate-150 rounded-2xl text-center">
              <Kanban className="w-12 h-12 text-slate-300 mb-4" />
              <h3 className="text-slate-900 font-bold text-lg">No sessions available</h3>
              <p className="text-slate-500 text-xs mt-1 max-w-xs font-semibold">
                No matching sessions found. Start a new session to populate your Kanban board.
              </p>
            </div>
          ) : (
            <DragDropContext onDragEnd={handleDragEnd}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
                {kanbanColumns.map((col) => {
                  const colSessions = filteredAllSessions.filter((s) => {
                    if (col.id === 'in_progress') {
                      return s.status === 'in_progress' || s.status === 'paused';
                    }
                    return s.status === col.id;
                  });

                  return (
                    <div
                      key={col.id}
                      className={`rounded-2xl border ${col.borderClass} ${col.bgClass} p-4 flex flex-col gap-3 min-h-[500px] shadow-sm`}
                    >
                      {/* Column Header */}
                      <div className="flex items-center justify-between border-b border-slate-200/50 pb-2">
                        <span className={`text-xs font-extrabold uppercase tracking-wider ${col.textClass}`}>
                          {col.title}
                        </span>
                        <span className="text-[10px] font-extrabold text-slate-500 bg-slate-200/60 px-2 py-0.5 rounded-full">
                          {colSessions.length}
                        </span>
                      </div>

                      {/* Droppable Card Lane */}
                      <Droppable droppableId={col.id}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={`flex-1 flex flex-col gap-3.5 rounded-xl transition-all duration-200 ${
                              snapshot.isDraggingOver ? 'bg-blue-500/5 ring-2 ring-blue-500/10 ring-offset-2' : ''
                            } min-h-[420px]`}
                          >
                            {colSessions.length === 0 && (
                              <div className="flex-1 border border-dashed border-slate-200/60 rounded-xl flex items-center justify-center py-12 text-center select-none">
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                  Drag here
                                </span>
                              </div>
                            )}

                            {colSessions.map((session, index) => (
                              <Draggable key={session.id} draggableId={session.id} index={index}>
                                {(provided, snapshot) => (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                    style={provided.draggableProps.style as React.CSSProperties}
                                    className={`bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-3 shadow-sm hover:shadow-md transition-all ${
                                      snapshot.isDragging ? 'ring-2 ring-blue-600/50 shadow-xl scale-[1.02] rotate-1' : ''
                                    }`}
                                  >
                                    {/* Badges */}
                                    <div className="flex items-start justify-between gap-1.5">
                                      <SessionBadge variant="type" value={session.interview_type} />
                                      <SessionBadge variant="difficulty" value={session.difficulty} />
                                    </div>

                                    {/* Company and Focus Area */}
                                    <div className="flex flex-col gap-1">
                                      <h4 className="text-slate-800 font-bold text-sm truncate flex items-center gap-1.5">
                                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                        {session.target_company ?? 'General Session'}
                                      </h4>
                                      {session.focus_area && (
                                        <p className="text-slate-500 text-[10px] font-semibold truncate flex items-center gap-1">
                                          <Target className="w-3 h-3 text-slate-400 shrink-0" />
                                          {session.focus_area}
                                        </p>
                                      )}
                                    </div>

                                    {/* Duration and Date Details */}
                                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 bg-slate-50/50 p-1.5 rounded-lg border border-slate-100">
                                      <span className="flex items-center gap-1">
                                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                                        {formatDuration(session.duration_minutes)}
                                      </span>
                                      <span className="flex items-center gap-1">
                                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                        {formatDate(session.created_at)}
                                      </span>
                                    </div>

                                    {/* Action Button */}
                                    <div className="pt-2 border-t border-slate-100 flex items-center justify-end">
                                      {session.status === 'completed' ? (
                                        <Link
                                          href={`/interview/${session.id}/feedback`}
                                          className="flex-1 text-center py-1.5 rounded-lg border border-blue-200 text-blue-600 bg-white hover:bg-blue-50 text-[10px] font-extrabold transition-all shadow-sm flex items-center justify-center gap-1"
                                        >
                                          <Sparkles className="w-3 h-3 text-blue-500" />
                                          View Report
                                        </Link>
                                      ) : session.status === 'in_progress' || session.status === 'created' || session.status === 'paused' ? (
                                        <Link
                                          href={`/interview/${session.id}`}
                                          className="flex-1 text-center py-1.5 rounded-lg border border-emerald-200 text-emerald-600 bg-white hover:bg-emerald-50 text-[10px] font-extrabold transition-all shadow-sm flex items-center justify-center gap-1"
                                        >
                                          <Play className="w-3 h-3 fill-emerald-600/10" />
                                          Continue
                                        </Link>
                                      ) : (
                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                          Archived
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </div>
                  );
                })}
              </div>
            </DragDropContext>
          )}
        </div>
      )}
    </section>
  );
}
