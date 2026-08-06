'use client';

import Link from 'next/link';
import DashboardShell from '@/components/layout/DashboardShell';
import { PageLoader } from '@/components/feedback/PageLoader';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useUserDashboard, useUserScoreTrend } from '@/hooks/queries/useAnalytics';
import StatCard from '@/components/StatCard';
import {
  BarChart2, CheckCircle, Target, TrendingUp, Activity, Clock,
  Flame, Award, AlertCircle, Brain, Code, MessageSquare, Users,
  PlusCircle,
} from 'lucide-react';

// ── helpers ──────────────────────────────────────────────────────────────────

function typeLabel(t: string | null | undefined) {
  if (!t) return '—';
  return t === 'dsa' ? 'DSA' : t === 'behavioral' ? 'Behavioral' : 'System Design';
}

function scoreColor(score: number): string {
  if (score >= 75) return '#16a34a';
  if (score >= 50) return '#d97706';
  return '#dc2626';
}

function ScoreBar({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
}) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
          <Icon className="w-3.5 h-3.5" style={{ color: 'var(--color-text-muted)' }} />
          {label}
        </span>
        <span
          className="text-sm font-bold"
          style={{ color: pct > 0 ? scoreColor(pct) : 'var(--color-text-muted)' }}
        >
          {pct > 0 ? `${pct}%` : '—'}
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-bg-subtle)' }}>
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%`, background: scoreColor(pct) }}
        />
      </div>
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { isLoading: authLoading } = useRequireAuth();
  const { data: dashboard, isLoading: dashboardLoading, error: dashboardError } = useUserDashboard(90);
  const { data: trendData, isLoading: trendLoading } = useUserScoreTrend(30);

  if (authLoading || dashboardLoading) {
    return <PageLoader label="Loading analytics…" />;
  }

  const d = dashboard ?? {};
  const isDemo = d.data_source === 'demo';
  const points: Array<{ date: string; score: number }> = trendData?.trend ?? [];

  const completionRate =
    d.total_sessions > 0
      ? Math.round((d.completed_sessions / d.total_sessions) * 100)
      : (d.completion_rate ?? 0);

  const isEmpty = !dashboardError && d.total_sessions === 0;

  return (
    <DashboardShell>
      <div className="flex flex-col gap-6 py-6">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1
              className="text-2xl font-extrabold tracking-tight"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Analytics
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Your performance over the last 90 days
            </p>
          </div>
          {isDemo && (
            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-600">
              Demo data — start an interview to see real stats
            </span>
          )}
        </div>

        {/* ── Error banner ── */}
        {dashboardError && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Failed to load analytics data. Make sure the analytics service is running.
          </div>
        )}

        {/* ── Top stat cards ── */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Sessions"  value={d.total_sessions ?? 0}                          icon={Activity}    color="blue"   />
          <StatCard label="Completed"        value={d.completed_sessions ?? 0}                      icon={CheckCircle} color="green"  />
          <StatCard label="Avg Score"        value={d.avg_score > 0 ? `${d.avg_score}%` : '—'}     icon={BarChart2}   color="purple" />
          <StatCard label="Completion Rate"  value={`${completionRate}%`}                           icon={Target}      color="orange" />
        </div>

        {/* ── Streak + best/worst row ── */}
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>

          {/* Current Streak */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm px-6 py-5">
            <div className="flex items-center gap-2 mb-2.5">
              <Flame className="w-4 h-4 text-orange-500" />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                Current Streak
              </span>
            </div>
            <p className="text-4xl font-black leading-none tracking-tighter text-orange-500">
              {d.current_streak_days ?? 0}
            </p>
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>consecutive days</p>
          </div>

          {/* Strongest Area */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm px-6 py-5">
            <div className="flex items-center gap-2 mb-2.5">
              <Award className="w-4 h-4 text-green-600" />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                Strongest Area
              </span>
            </div>
            <p className="text-2xl font-extrabold text-green-600">{typeLabel(d.best_interview_type)}</p>
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>best avg score</p>
          </div>

          {/* Needs Work */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm px-6 py-5">
            <div className="flex items-center gap-2 mb-2.5">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                Needs Work
              </span>
            </div>
            <p className="text-2xl font-extrabold text-red-500">{typeLabel(d.worst_interview_type)}</p>
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>lowest avg score</p>
          </div>
        </div>

        {/* ── Skill breakdown ── */}
        {(d.avg_communication_score > 0 || d.avg_problem_solving_score > 0 ||
          d.avg_code_quality_score > 0 || d.avg_behavioral_score > 0) && (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm px-6 py-5">
            <p className="mb-4 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
              Skill Breakdown
            </p>
            <div className="flex flex-col gap-4">
              <ScoreBar label="Communication"   value={d.avg_communication_score ?? 0}   icon={MessageSquare} />
              <ScoreBar label="Problem Solving" value={d.avg_problem_solving_score ?? 0} icon={Brain} />
              <ScoreBar label="Code Quality"    value={d.avg_code_quality_score ?? 0}    icon={Code} />
              <ScoreBar label="Behavioral"      value={d.avg_behavioral_score ?? 0}      icon={Users} />
            </div>
          </div>
        )}

        {/* ── Interview type breakdown ── */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm px-6 py-5">
          <p className="mb-4 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
            Interview Type Breakdown
          </p>
          <div className="flex flex-wrap gap-3">
            {[
              { label: 'DSA',           value: d.dsa_sessions ?? 0,           color: '#4f46e5', bg: '#eef2ff', border: '#c7d2fe' },
              { label: 'Behavioral',    value: d.behavioral_sessions ?? 0,    color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
              { label: 'System Design', value: d.system_design_sessions ?? 0, color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
            ].map(({ label, value, color, bg, border }) => {
              const typeAvg = (d.type_breakdown ?? []).find(
                (t: { type: string }) => typeLabel(t.type) === label,
              );
              return (
                <div
                  key={label}
                  className="flex-1 min-w-[110px] rounded-xl text-center px-4 py-3.5"
                  style={{ background: bg, border: `1px solid ${border}` }}
                >
                  <p className="text-3xl font-black leading-none tracking-tighter" style={{ color }}>
                    {value}
                  </p>
                  <p className="mt-1 text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                    {label}
                  </p>
                  {typeAvg && (
                    <p className="mt-1 text-xs font-bold" style={{ color }}>
                      avg {typeAvg.avg_score}%
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Score trend chart ── */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm px-6 py-5">
          {/* Chart header */}
          <div className="flex items-center justify-between mb-1">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                Score Trend
              </p>
              <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--color-text-primary)' }}>
                Last 30 Days
              </p>
            </div>
            {trendLoading && (
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading…</span>
            )}
          </div>

          {points.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 h-40">
              <TrendingUp className="w-8 h-8 text-slate-200" />
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                {isEmpty
                  ? 'Complete your first interview to see score trends.'
                  : 'No score data in the last 30 days.'}
              </p>
            </div>
          ) : (
            <div className="mt-4">
              {/* Y-axis label + chart area */}
              <div className="flex gap-2">
                {/* Y-axis */}
                <div className="flex flex-col justify-between h-40 text-right pb-5">
                  {[100, 75, 50, 25, 0].map((tick) => (
                    <span key={tick} className="text-[9px] leading-none" style={{ color: 'var(--color-text-muted)' }}>
                      {tick}%
                    </span>
                  ))}
                </div>

                {/* Bars */}
                <div className="flex-1 flex flex-col gap-1">
                  {/* Grid lines */}
                  <div className="relative flex items-flex-end h-40" style={{ borderLeft: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
                    {/* Horizontal gridlines at 25 / 50 / 75 */}
                    {[75, 50, 25].map((tick) => (
                      <div
                        key={tick}
                        className="absolute left-0 right-0 border-t border-dashed border-slate-100"
                        style={{ bottom: `${tick}%` }}
                      />
                    ))}

                    {/* Bar columns */}
                    <div className="absolute inset-0 flex items-end gap-1 px-1 pb-0">
                      {points.slice(-20).map((point, i) => {
                        const score = Number(point.score ?? 0);
                        const barH = Math.max(2, Math.min(100, score));
                        // Brand-purple gradient based on score
                        const barColor =
                          score >= 70 ? 'var(--color-brand)' :
                          score >= 50 ? '#7c3aed' :
                          '#a78bfa';
                        return (
                          <div
                            key={`${point.date}-${i}`}
                            className="flex-1 flex flex-col items-center justify-end h-full gap-1"
                          >
                            <span className="text-[8px] font-semibold leading-none" style={{ color: 'var(--color-text-muted)' }}>
                              {score > 0 ? `${score}%` : ''}
                            </span>
                            <div
                              title={`${point.date}: ${score}%`}
                              className="w-full rounded-t transition-[height] duration-300 ease-out"
                              style={{
                                height: `${barH}%`,
                                background: barColor,
                                minHeight: 3,
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* X-axis date labels */}
                  <div className="flex gap-1 px-1 mt-0.5">
                    {points.slice(-20).map((point, i) => (
                      <div key={i} className="flex-1 flex justify-center">
                        <span
                          className="text-[8px] leading-none text-center truncate"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          {point.date
                            ? new Date(point.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                            : i + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 mt-3 justify-end">
                {[
                  { label: '≥ 70% (Good)',    color: 'var(--color-brand)' },
                  { label: '50–69% (Fair)',   color: '#7c3aed' },
                  { label: '< 50% (Needs work)', color: '#a78bfa' },
                ].map(({ label, color }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
                    <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Empty state CTA ── */}
        {isEmpty && !dashboardError && (
          <div
            className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-slate-200 bg-white shadow-sm px-6 py-10 text-center"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: 'var(--color-bg-subtle)' }}>
              <Clock className="w-7 h-7" style={{ color: 'var(--color-text-muted)' }} />
            </div>
            <div>
              <p className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
                No interview data yet
              </p>
              <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                Start a mock interview to see your performance analytics here.
              </p>
            </div>
            <Link
              href="/dashboard/create-session"
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
              style={{ background: 'var(--color-brand)' }}
            >
              <PlusCircle className="w-4 h-4" />
              Start Your First Interview
            </Link>
          </div>
        )}

      </div>
    </DashboardShell>
  );
}
