'use client';

import DashboardShell from '@/components/layout/DashboardShell';
import { PageLoader } from '@/components/feedback/PageLoader';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useUserDashboard, useUserScoreTrend } from '@/hooks/queries/useAnalytics';
import StatCard from '@/components/StatCard';
import {
  BarChart2, CheckCircle, Target, TrendingUp, Activity, Clock,
  Flame, Award, AlertCircle, Brain, Code, MessageSquare, Users,
} from 'lucide-react';

// ── helpers ──────────────────────────────────────────────────────────────────

function typeLabel(t: string | null | undefined) {
  if (!t) return '—';
  return t === 'dsa' ? 'DSA' : t === 'behavioral' ? 'Behavioral' : 'System Design';
}

function scoreColor(score: number) {
  if (score >= 75) return '#16a34a';
  if (score >= 50) return '#d97706';
  return '#dc2626';
}

function ScoreBar({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#555' }}>
          <Icon style={{ width: 13, height: 13, color: '#888' }} />
          {label}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: scoreColor(pct) }}>{pct > 0 ? `${pct}%` : '—'}</span>
      </div>
      <div style={{ height: 7, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: scoreColor(pct),
            borderRadius: 99,
            transition: 'width 0.6s ease',
          }}
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
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#111', letterSpacing: '-0.025em', margin: 0 }}>
              Analytics
            </h1>
            <p style={{ fontSize: '0.875rem', color: '#999', marginTop: 4 }}>
              Your performance over the last 90 days
            </p>
          </div>
          {isDemo && (
            <span style={{
              fontSize: 11, fontWeight: 700, color: '#d97706',
              background: '#fffbeb', border: '1px solid #fde68a',
              borderRadius: 99, padding: '4px 12px',
            }}>
              Demo data — start an interview to see real stats
            </span>
          )}
        </div>

        {/* ── Error ── */}
        {dashboardError && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 12, padding: '14px 18px',
            color: '#dc2626', fontSize: '0.875rem', fontWeight: 500,
          }}>
            Failed to load analytics data. Make sure the analytics service is running.
          </div>
        )}

        {/* ── Top stat cards ── */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Sessions"   value={d.total_sessions ?? 0}          icon={Activity}     color="blue"   />
          <StatCard label="Completed"         value={d.completed_sessions ?? 0}       icon={CheckCircle}  color="green"  />
          <StatCard label="Avg Score"         value={d.avg_score > 0 ? `${d.avg_score}%` : '—'} icon={BarChart2} color="purple" />
          <StatCard label="Completion Rate"   value={`${completionRate}%`}            icon={Target}       color="orange" />
        </div>

        {/* ── Streak + best/worst row ── */}
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>

          {/* Streak */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Flame style={{ width: 18, height: 18, color: '#f97316' }} />
              <span style={labelStyle}>Current Streak</span>
            </div>
            <p style={{ fontSize: 36, fontWeight: 900, color: '#f97316', margin: 0, letterSpacing: '-0.04em' }}>
              {d.current_streak_days ?? 0}
            </p>
            <p style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>consecutive days</p>
          </div>

          {/* Best type */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Award style={{ width: 18, height: 18, color: '#16a34a' }} />
              <span style={labelStyle}>Strongest Area</span>
            </div>
            <p style={{ fontSize: 22, fontWeight: 800, color: '#16a34a', margin: 0 }}>
              {typeLabel(d.best_interview_type)}
            </p>
            <p style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>best avg score</p>
          </div>

          {/* Worst type */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <AlertCircle style={{ width: 18, height: 18, color: '#dc2626' }} />
              <span style={labelStyle}>Needs Work</span>
            </div>
            <p style={{ fontSize: 22, fontWeight: 800, color: '#dc2626', margin: 0 }}>
              {typeLabel(d.worst_interview_type)}
            </p>
            <p style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>lowest avg score</p>
          </div>
        </div>

        {/* ── Sub-score breakdown ── */}
        {(d.avg_communication_score > 0 || d.avg_problem_solving_score > 0 ||
          d.avg_code_quality_score > 0 || d.avg_behavioral_score > 0) && (
          <div style={cardStyle}>
            <p style={sectionLabelStyle}>Skill Breakdown</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <ScoreBar label="Communication"     value={d.avg_communication_score ?? 0}   icon={MessageSquare} />
              <ScoreBar label="Problem Solving"   value={d.avg_problem_solving_score ?? 0} icon={Brain} />
              <ScoreBar label="Code Quality"      value={d.avg_code_quality_score ?? 0}    icon={Code} />
              <ScoreBar label="Behavioral"        value={d.avg_behavioral_score ?? 0}      icon={Users} />
            </div>
          </div>
        )}

        {/* ── Interview type breakdown ── */}
        <div style={cardStyle}>
          <p style={sectionLabelStyle}>Interview Type Breakdown</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[
              { label: 'DSA',           value: d.dsa_sessions ?? 0,            color: '#4f46e5', bg: '#eef2ff' },
              { label: 'Behavioral',    value: d.behavioral_sessions ?? 0,     color: '#16a34a', bg: '#f0fdf4' },
              { label: 'System Design', value: d.system_design_sessions ?? 0,  color: '#d97706', bg: '#fffbeb' },
            ].map(({ label, value, color, bg }) => {
              const typeAvg = (d.type_breakdown ?? []).find(
                (t: { type: string }) => typeLabel(t.type) === label
              );
              return (
                <div key={label} style={{
                  flex: 1, minWidth: 110,
                  background: bg, border: `1px solid ${color}20`,
                  borderRadius: 10, padding: '14px 16px', textAlign: 'center',
                }}>
                  <p style={{ fontSize: 28, fontWeight: 800, color, margin: 0, letterSpacing: '-0.03em' }}>
                    {value}
                  </p>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#666', marginTop: 4 }}>{label}</p>
                  {typeAvg && (
                    <p style={{ fontSize: 11, color, marginTop: 4, fontWeight: 700 }}>
                      avg {typeAvg.avg_score}%
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Score trend chart ── */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <p style={sectionLabelStyle}>Score Trend — Last 30 Days</p>
            {trendLoading && <span style={{ fontSize: 11, color: '#bbb' }}>Loading…</span>}
          </div>

          {points.length === 0 ? (
            <div style={{ height: 160, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#bbb' }}>
              <TrendingUp style={{ width: 32, height: 32, color: '#e5e7eb' }} />
              <p style={{ fontSize: '0.875rem', color: '#bbb', margin: 0 }}>
                {isEmpty ? 'Complete your first interview to see score trends.' : 'No score data in the last 30 days.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 160 }}>
              {points.slice(-20).map((point, i) => {
                const score = Number(point.score ?? 0);
                const barH = Math.max(4, Math.min(100, score));
                const barColor = score >= 70 ? '#4f46e5' : score >= 50 ? '#8b5cf6' : '#c4b5fd';
                return (
                  <div key={`${point.date}-${i}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: 9, color: '#bbb', fontWeight: 600 }}>{score}%</span>
                    <div
                      title={`${point.date}: ${score}%`}
                      style={{ width: '100%', height: `${barH}%`, background: barColor, borderRadius: '4px 4px 0 0', transition: 'height 0.3s ease' }}
                    />
                    <span style={{ fontSize: 9, color: '#ccc', maxWidth: '100%', overflow: 'hidden', textAlign: 'center', lineHeight: 1 }}>
                      {point.date
                        ? new Date(point.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                        : i + 1}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Empty state CTA ── */}
        {isEmpty && !dashboardError && (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '24px', textAlign: 'center' }}>
            <Clock style={{ width: 28, height: 28, color: '#94a3b8', margin: '0 auto 8px' }} />
            <p style={{ fontWeight: 700, color: '#111', fontSize: '0.9rem', margin: 0 }}>No interview data yet</p>
            <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: 6 }}>
              Start a mock interview from the dashboard to see your analytics here.
            </p>
          </div>
        )}

      </div>
    </DashboardShell>
  );
}

// ── shared styles ─────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5e5e5',
  borderRadius: 12,
  padding: '20px 24px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#999',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#999',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  marginBottom: 16,
  margin: '0 0 16px 0',
};
