/**
 * @file page.tsx
 * @description Candidate Performance Analytics & Score Progression Dashboard for DevMeet.
 *
 * Responsibilities:
 * 1. Authentication Protection:
 *    - Enforces authenticated session via useRequireAuth.
 * 2. Data Queries:
 *    - Fetches 90-day aggregate dashboard metrics via useUserDashboard.
 *    - Fetches 30-day historical score trend points via useUserScoreTrend.
 * 3. KPI Metric Cards:
 *    - Displays Total Sessions, Completed, Average Score, and Completion Rate.
 * 4. Longitudinal Streaks & Performance Outliers:
 *    - Consecutive daily practice streak (Flame counter).
 *    - Strongest interview category (Award badge).
 *    - Category needing improvement ("Needs Work").
 * 5. Competency Breakdown:
 *    - Visual progress meters for Communication, Problem Solving, Code Quality, and Behavioral.
 * 6. Historical 30-Day Bar Chart:
 *    - Renders normalized score bars with dashed horizontal threshold lines (25%, 50%, 75%).
 *
 * @module app/analytics/page
 */

'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import DashboardShell from '@/components/layout/DashboardShell';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useUserDashboard, useUserScoreTrend } from '@/hooks/queries/useAnalytics';
import { analyticsApi } from '@/lib/api';
import StatCard from '@/components/StatCard';
import {
  BarChart2,
  CheckCircle,
  Target,
  TrendingUp,
  Activity,
  Clock,
  Flame,
  Award,
  AlertCircle,
  Brain,
  Code,
  MessageSquare,
  Users,
  PlusCircle,
  Sparkles,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Check,
} from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Converts internal interview type keys to display titles.
 */
function typeLabel(t: string | null | undefined) {
  if (!t) return '—';
  return t === 'dsa' ? 'DSA & Algorithms' : t === 'behavioral' ? 'Behavioral (STAR)' : 'System Design';
}

/**
 * Returns color hex code according to score thresholds.
 */
function scoreColor(score: number): string {
  if (score >= 75) return '#16a34a';
  if (score >= 50) return '#d97706';
  return '#dc2626';
}

/**
 * ScoreBar Component.
 */
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
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <Icon className="w-3.5 h-3.5 text-blue-600" />
          {label}
        </span>
        <span
          className="text-xs font-black tabular-nums"
          style={{ color: pct > 0 ? scoreColor(pct) : '#94a3b8' }}
        >
          {pct > 0 ? `${pct}%` : '—'}
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden bg-slate-100">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%`, backgroundColor: scoreColor(pct) }}
        />
      </div>
    </div>
  );
}

/**
 * AnalyticsPage Component.
 */
export default function AnalyticsPage() {
  const { isLoading: authLoading } = useRequireAuth();
  const { data: dashboard, isLoading: dashboardLoading, error: dashboardError } = useUserDashboard(90);
  const { data: trendData, isLoading: trendLoading } = useUserScoreTrend(30);

  // Render skeleton layout during authentication or query loading
  if (authLoading || dashboardLoading) {
    return (
      <DashboardShell>
        <div className="flex flex-col gap-6 animate-pulse py-4">
          <div className="h-8 bg-slate-200/80 rounded-xl w-48" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl p-5 bg-white border border-slate-200/80 h-28" />
            ))}
          </div>
          <div className="rounded-3xl p-6 bg-white border border-slate-200/80 h-64" />
        </div>
      </DashboardShell>
    );
  }

  const d = dashboard ?? {};
  const points: Array<{ date: string; score: number }> = trendData?.trend ?? [];

  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  const completionRate =
    d.total_sessions > 0
      ? Math.round((d.completed_sessions / d.total_sessions) * 100)
      : (d.completion_rate ?? 0);

  const isEmpty = !dashboardError && (d.total_sessions === 0 || d.total_sessions === undefined);

  const handleExportCsv = async () => {
    setIsExporting(true);
    setExportSuccess(false);
    try {
      const blob = await analyticsApi.exportSessionsCsv(90);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `DevMeet_Analytics_90d_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch {
      // Client-side fallback compilation
      const rows: string[] = [
        'DEVMEET 90-DAY CANDIDATE PERFORMANCE ANALYTICS',
        `Export Date,${new Date().toISOString()}`,
        '',
        'METRIC,VALUE',
        `Total Interviews,${d.total_sessions ?? 0}`,
        `Completed Sessions,${d.completed_sessions ?? 0}`,
        `Average Score,${d.avg_score ?? 0}%`,
        `Completion Rate,${completionRate}%`,
        `Practice Streak Days,${d.current_streak_days ?? 0}`,
        `Strongest Domain,"${typeLabel(d.best_interview_type)}"`,
        `Needs Improvement,"${typeLabel(d.worst_interview_type)}"`,
        '',
        'COMPETENCY RUBRIC,AVERAGE SCORE',
        `Communication,${d.avg_communication_score ?? 0}%`,
        `Problem Solving,${d.avg_problem_solving_score ?? 0}%`,
        `Code Quality,${d.avg_code_quality_score ?? 0}%`,
        `Behavioral & STAR,${d.avg_behavioral_score ?? 0}%`,
      ];
      if (points.length > 0) {
        rows.push('');
        rows.push('HISTORICAL SCORE TREND');
        rows.push('DATE,SCORE (%)');
        points.forEach((p) => rows.push(`${p.date},${p.score}`));
      }
      const blob = new Blob([rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `DevMeet_Analytics_Summary_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <DashboardShell>
      <div className="flex flex-col gap-8 py-4 pb-12">
        {/* ── Page Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-xs font-bold text-blue-600 mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Performance Insights</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Candidate Analytics
            </h1>
            <p className="mt-1 text-sm text-slate-500 font-medium">
              Comprehensive 90-day trajectory, domain competencies, and score telemetry.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              disabled={isExporting}
              title="Download platform analytics and score history as CSV"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-700 text-xs font-bold transition-all shadow-xs disabled:opacity-60"
            >
              {isExporting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Exporting...</span>
                </>
              ) : exportSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Downloaded!</span>
                </>
              ) : (
                <>
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Download CSV</span>
                </>
              )}
            </button>
            <Link
              href="/dashboard/create-session"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold transition-all shadow-xs shadow-blue-500/20"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>New Interview</span>
            </Link>
          </div>
        </div>

        {/* ── Error Banner ── */}
        {dashboardError && (
          <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-xs font-semibold text-rose-700 shadow-xs">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
            <span>Failed to load analytics data. Ensure the analytics microservice is running.</span>
          </div>
        )}

        {/* ── Top KPI Stat Cards ── */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Interviews" value={d.total_sessions ?? 0} icon={Activity} color="blue" />
          <StatCard label="Completed Sessions" value={d.completed_sessions ?? 0} icon={CheckCircle} color="green" />
          <StatCard label="Average Score" value={d.avg_score > 0 ? `${d.avg_score}%` : '—'} icon={BarChart2} color="purple" />
          <StatCard label="Completion Rate" value={d.total_sessions > 0 ? `${completionRate}%` : '—'} icon={Target} color="orange" />
        </div>

        {/* ── Practice Streak & Key Competencies ── */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          {/* Current Day Streak */}
          <div className="rounded-3xl border border-slate-200/80 bg-white shadow-xs p-6 flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 border border-amber-200/60 flex items-center justify-center shrink-0">
                <Flame className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Practice Streak
              </span>
            </div>
            <div>
              <p className="text-3xl font-black text-slate-900 tracking-tight">
                {d.current_streak_days ?? 0}{' '}
                <span className="text-sm font-semibold text-slate-500">Days</span>
              </p>
              <p className="mt-1 text-xs text-slate-400 font-medium">Consecutive practice activity</p>
            </div>
          </div>

          {/* Highest Performing Track */}
          <div className="rounded-3xl border border-slate-200/80 bg-white shadow-xs p-6 flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200/60 flex items-center justify-center shrink-0">
                <Award className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Strongest Domain
              </span>
            </div>
            <div>
              <p className="text-xl font-extrabold text-emerald-600 tracking-tight truncate">
                {typeLabel(d.best_interview_type)}
              </p>
              <p className="mt-1 text-xs text-slate-400 font-medium">Highest average rubric score</p>
            </div>
          </div>

          {/* Weakest Performing Track */}
          <div className="rounded-3xl border border-slate-200/80 bg-white shadow-xs p-6 flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 border border-rose-200/60 flex items-center justify-center shrink-0">
                <AlertCircle className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Needs Improvement
              </span>
            </div>
            <div>
              <p className="text-xl font-extrabold text-rose-600 tracking-tight truncate">
                {typeLabel(d.worst_interview_type)}
              </p>
              <p className="mt-1 text-xs text-slate-400 font-medium">Recommended focus track</p>
            </div>
          </div>
        </div>

        {/* ── 2-Column: Skill Breakdown & Track Distribution ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Competency Skill Breakdown */}
          <div className="rounded-3xl border border-slate-200/80 bg-white shadow-xs p-6 space-y-5">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                Skill Breakdown
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Evaluation rubrics across technical and behavioral aspects
              </p>
            </div>
            <div className="flex flex-col gap-4">
              <ScoreBar label="Communication" value={d.avg_communication_score ?? 0} icon={MessageSquare} />
              <ScoreBar label="Problem Solving" value={d.avg_problem_solving_score ?? 0} icon={Brain} />
              <ScoreBar label="Code Quality" value={d.avg_code_quality_score ?? 0} icon={Code} />
              <ScoreBar label="Behavioral & STAR" value={d.avg_behavioral_score ?? 0} icon={Users} />
            </div>
          </div>

          {/* Interview Track Distribution */}
          <div className="rounded-3xl border border-slate-200/80 bg-white shadow-xs p-6 space-y-5">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                Interview Volume by Track
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Practice count and performance breakdown
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'DSA', value: d.dsa_sessions ?? 0, color: 'text-blue-600', bg: 'bg-blue-50/60 border-blue-200/60' },
                { label: 'Behavioral', value: d.behavioral_sessions ?? 0, color: 'text-indigo-600', bg: 'bg-indigo-50/60 border-indigo-200/60' },
                { label: 'System Design', value: d.system_design_sessions ?? 0, color: 'text-teal-600', bg: 'bg-teal-50/60 border-teal-200/60' },
              ].map(({ label, value, color, bg }) => (
                <div
                  key={label}
                  className={`rounded-2xl p-4 border text-center flex flex-col justify-center ${bg}`}
                >
                  <p className={`text-2xl sm:text-3xl font-black ${color} tracking-tight`}>
                    {value}
                  </p>
                  <p className="text-xs font-bold text-slate-700 mt-1">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── 30-Day Historical Trend Bar Chart ── */}
        <div className="rounded-3xl border border-slate-200/80 bg-white shadow-xs p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                Score Progression
              </h2>
              <p className="text-xs text-slate-500 font-medium">30-day historical score evaluation timeline</p>
            </div>
            {trendLoading && (
              <span className="text-xs font-semibold text-slate-400">Loading points…</span>
            )}
          </div>

          {points.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 h-48 py-8 text-center">
              <TrendingUp className="w-10 h-10 text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">
                {isEmpty ? 'No interview score data recorded yet.' : 'No score points in the last 30 days.'}
              </p>
              <p className="text-xs text-slate-400 max-w-sm">
                Complete mock interviews to build your historical performance telemetry.
              </p>
            </div>
          ) : (
            <div className="pt-2">
              <div className="flex gap-3">
                {/* Y-axis Ticks (0% to 100%) */}
                <div className="flex flex-col justify-between h-44 text-right pb-5 text-[10px] font-bold text-slate-400 tabular-nums">
                  {[100, 75, 50, 25, 0].map((tick) => (
                    <span key={tick} className="leading-none">
                      {tick}%
                    </span>
                  ))}
                </div>

                {/* Vertical Bar Chart Canvas */}
                <div className="flex-1 flex flex-col gap-2">
                  <div className="relative flex items-end h-44 border-l border-b border-slate-200">
                    {/* Horizontal Dashed Threshold Gridlines */}
                    {[75, 50, 25].map((tick) => (
                      <div
                        key={tick}
                        className="absolute left-0 right-0 border-t border-dashed border-slate-100 pointer-events-none"
                        style={{ bottom: `${tick}%` }}
                      />
                    ))}

                    {/* Bar Columns */}
                    <div className="absolute inset-0 flex items-end gap-1.5 px-2 pb-0">
                      {points.slice(-20).map((point, i) => {
                        const score = Number(point.score ?? 0);
                        const barH = Math.max(4, Math.min(100, score));
                        const barColor =
                          score >= 70 ? 'bg-blue-600' : score >= 50 ? 'bg-blue-400' : 'bg-blue-200';
                        return (
                          <div
                            key={`${point.date}-${i}`}
                            className="flex-1 flex flex-col items-center justify-end h-full gap-1 group relative cursor-pointer"
                          >
                            <span className="text-[9px] font-black text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
                              {score > 0 ? `${score}%` : ''}
                            </span>
                            <div
                              title={`${point.date}: ${score}%`}
                              className={`w-full rounded-t-lg transition-all duration-300 ease-out group-hover:brightness-95 ${barColor}`}
                              style={{ height: `${barH}%` }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* X-axis Date Axis */}
                  <div className="flex gap-1.5 px-2">
                    {points.slice(-20).map((point, i) => (
                      <div key={i} className="flex-1 flex justify-center">
                        <span className="text-[9px] font-semibold text-slate-400 text-center truncate">
                          {point.date
                            ? new Date(point.date).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                              })
                            : i + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Chart Legend */}
              <div className="flex items-center gap-4 mt-4 justify-end border-t border-slate-100 pt-3">
                {[
                  { label: '≥ 70% (Strong)', color: 'bg-blue-600' },
                  { label: '50–69% (Fair)', color: 'bg-blue-400' },
                  { label: '< 50% (Needs Work)', color: 'bg-blue-200' },
                ].map(({ label, color }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <span className={`inline-block w-2.5 h-2.5 rounded-sm ${color}`} />
                    <span className="text-[11px] font-medium text-slate-500">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Empty State Call-to-Action ── */}
        {isEmpty && !dashboardError && (
          <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-slate-200/80 bg-white shadow-xs p-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 border border-blue-200/60 shadow-xs">
              <Clock className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                No interview sessions recorded yet
              </h3>
              <p className="mt-1 text-xs text-slate-500 max-w-sm font-medium">
                Launch an AI mock interview session to generate personalized performance telemetry.
              </p>
            </div>
            <Link
              href="/dashboard/create-session"
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/20 transition-all cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Start Your First Interview</span>
            </Link>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
