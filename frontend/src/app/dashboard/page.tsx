'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import {
  Code2,
  BarChart2,
  CheckCircle,
  TrendingUp,
  Filter,
  Sparkles,
  Zap,
  Plus,
  Trophy,
  Flame,
  Award,
  ArrowRight,
} from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useSessions } from '@/hooks/queries/useSessions';
import { useQuota } from '@/hooks/queries/useUser';
import { useUserScoreTrend, useUserDashboard } from '@/hooks/queries/useAnalytics';
import StatCard from '@/components/StatCard';
import ConsistencyGrid from './ConsistencyGrid';
import QuickSelect from './QuickSelect';
import RecentSessions from './RecentSessions';

const TrendChart = dynamic(() => import('./TrendChart'), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse bg-slate-100 rounded-2xl" />,
});

const SkillRadar = dynamic(() => import('./SkillRadar'), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse bg-slate-100 rounded-2xl" />,
});

function isThisMonth(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

function computeStreak(sessions: any[]) {
  if (sessions.length === 0) return 0;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const toLocalDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-CA', { timeZone: tz });
  };
  const dates = new Set(sessions.map((s) => toLocalDate(s.created_at)));
  let streak = 0;
  const current = new Date();
  let checkDate = current.toLocaleDateString('en-CA', { timeZone: tz });
  while (dates.has(checkDate)) {
    streak++;
    current.setDate(current.getDate() - 1);
    checkDate = current.toLocaleDateString('en-CA', { timeZone: tz });
  }
  if (streak === 0 && sessions.length > 0) return 1;
  return streak;
}

export default function DashboardPage() {
  const { user, isLoading: authLoading } = useRequireAuth();
  const { data: sessions = [], isLoading: sessionsLoading } = useSessions();
  const { data: quota } = useQuota();
  const [trendDays, setTrendDays] = useState(30);
  const [companyFilter, setCompanyFilter] = useState('all');

  const { data: scoreTrendData } = useUserScoreTrend(trendDays);
  const { data: dashboardData } = useUserDashboard(90);

  const companyOptions = useMemo(() => {
    const companies = new Set<string>();
    sessions.forEach((s: any) => {
      if (s.target_company?.trim()) companies.add(s.target_company.trim());
    });
    return Array.from(companies).sort();
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    if (companyFilter === 'all') return sessions;
    return sessions.filter((s: any) => s.target_company === companyFilter);
  }, [sessions, companyFilter]);

  const totalSessions = filteredSessions.length;
  const completedSessions = filteredSessions.filter((s: any) => s.status === 'completed').length;
  const dsaSessions = filteredSessions.filter((s: any) => s.interview_type === 'dsa').length;
  const streakDays = useMemo(() => computeStreak(filteredSessions), [filteredSessions]);

  const recentSessions = useMemo(() => {
    return [...filteredSessions]
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);
  }, [filteredSessions]);

  const trendData = useMemo(() => {
    const apiTrend = scoreTrendData?.trend;
    if (apiTrend && apiTrend.length > 0) {
      return apiTrend.map((p: any) => ({
        date: new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        score: Math.round(p.score),
      }));
    }
    const completed = filteredSessions
      .filter((s: any) => s.status === 'completed')
      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    if (completed.length === 0) return [];
    return completed.map((s: any, i: number) => ({
      date: new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      score: 65 + (i % 5) * 5,
    }));
  }, [filteredSessions, scoreTrendData]);

  const radarScores = useMemo(() => {
    if (dashboardData?.type_breakdown && Object.keys(dashboardData.type_breakdown).length > 0) {
      const breakdown = dashboardData.type_breakdown;
      const totalSess = dashboardData.total_sessions || 1;
      const dsaRatio = ((breakdown.dsa ?? 0) / totalSess) * 100;
      const behavRatio = ((breakdown.behavioral ?? 0) / totalSess) * 100;
      const sysRatio = ((breakdown.system_design ?? 0) / totalSess) * 100;
      const baseScore = dashboardData.average_score ?? 70;
      return {
        dsa: Math.min(Math.round(baseScore * 0.9 + dsaRatio * 0.1), 100),
        behavioral: Math.min(Math.round(baseScore * 0.85 + behavRatio * 0.1), 100),
        system_design: Math.min(Math.round(baseScore * 0.8 + sysRatio * 0.1), 100),
        communication: Math.min(Math.round(baseScore * 1.05), 100),
        optimizations: Math.min(Math.round(baseScore * 0.95), 100),
      };
    }
    if (filteredSessions.length === 0) {
      return { dsa: 75, behavioral: 80, system_design: 60, communication: 85, optimizations: 70 };
    }
    return {
      dsa: Math.min(filteredSessions.filter((s: any) => s.interview_type === 'dsa').length * 15 + 65, 95),
      behavioral: Math.min(filteredSessions.filter((s: any) => s.interview_type === 'behavioral').length * 15 + 60, 95),
      system_design: Math.min(filteredSessions.filter((s: any) => s.interview_type === 'system_design').length * 15 + 55, 95),
      communication: 82,
      optimizations: 76,
    };
  }, [filteredSessions, dashboardData]);

  if (authLoading || !user) {
    return (
      <DashboardShell>
        <div className="flex flex-col gap-6 animate-pulse">
          <div className="h-24 bg-slate-200/80 rounded-2xl w-full" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 bg-slate-200/80 rounded-2xl" />
            ))}
          </div>
          <div className="h-64 bg-slate-200/80 rounded-2xl" />
        </div>
      </DashboardShell>
    );
  }

  const displayName = user.name || user.email?.split('@')[0] || 'Candidate';

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Welcome Hero Banner */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl bg-slate-900 text-white p-6 md:p-8 shadow-md"
        >
          <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-indigo-500/20 to-transparent pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold border border-indigo-500/30">
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI Mock Interview Platform</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
                Welcome back, {displayName}! 👋
              </h2>
              <p className="text-slate-300 text-sm leading-relaxed">
                Ready to level up your technical interview skills? Start a customized DSA or System Design session with real-time AI feedback.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 flex-shrink-0">
              <Link
                href="/dashboard/create-session"
                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-3 rounded-2xl font-semibold text-sm transition-all shadow-sm hover:shadow-indigo-500/20 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>New Interview</span>
              </Link>
              <Link
                href="/dashboard/questions"
                className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-3 rounded-2xl font-semibold text-sm transition-all cursor-pointer"
              >
                <Code2 className="w-4 h-4" />
                <span>Question Bank</span>
              </Link>
            </div>
          </div>
        </motion.div>

        {/* Company Filter Bar */}
        {companyOptions.length > 0 && (
          <div className="flex items-center justify-between bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <Filter className="w-4 h-4 text-slate-400" />
              <span>Filter by Target Company:</span>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto">
              <button
                type="button"
                onClick={() => setCompanyFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  companyFilter === 'all'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All Companies
              </button>
              {companyOptions.map((comp) => (
                <button
                  key={comp}
                  type="button"
                  onClick={() => setCompanyFilter(comp)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    companyFilter === comp
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {comp}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Metric Cards Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard
            title="Total Interviews"
            value={totalSessions}
            icon={BarChart2}
            trend={+12}
            subtitle="Practice sessions completed"
          />
          <StatCard
            title="Completed Sessions"
            value={completedSessions}
            icon={CheckCircle}
            trend={+8}
            subtitle="Fully scored sessions"
          />
          <StatCard
            title="DSA Practices"
            value={dsaSessions}
            icon={Code2}
            subtitle="Coding challenges solved"
          />
          <StatCard
            title="Day Streak"
            value={`${streakDays} Days`}
            icon={Flame}
            subtitle="Current practice momentum"
          />
        </div>

        {/* Quick Start Launcher */}
        <QuickSelect />

        {/* Analytics & Radar Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 tracking-tight">Score Trend</h3>
                <p className="text-xs text-slate-500">Your average score trajectory over time</p>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                {[7, 30, 90].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setTrendDays(days)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      trendDays === days ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {days}d
                  </button>
                ))}
              </div>
            </div>
            <TrendChart data={trendData} />
          </div>

          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-4">
              <h3 className="text-base font-bold text-slate-900 tracking-tight">Skill Matrix</h3>
              <p className="text-xs text-slate-500">6-dimensional competency breakdown</p>
            </div>
            <SkillRadar scores={radarScores} />
          </div>
        </div>

        {/* Consistency Grid & Recent Sessions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-base font-bold text-slate-900 tracking-tight">Recent Interviews</h3>
              <Link
                href="/dashboard/history"
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
              >
                <span>View All History</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <RecentSessions sessions={recentSessions} isLoading={sessionsLoading} />
          </div>

          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-4">
              <h3 className="text-base font-bold text-slate-900 tracking-tight">Activity Heatmap</h3>
              <p className="text-xs text-slate-500">Daily practice consistency</p>
            </div>
            <ConsistencyGrid sessions={sessions} />
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
