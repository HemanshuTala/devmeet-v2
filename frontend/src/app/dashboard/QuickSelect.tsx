/**
 * @file QuickSelect.tsx
 * @description Rapid Interview Session Launcher Cards Component for DevMeet Dashboard.
 *
 * Responsibilities:
 * - Displays 3 primary interview track cards:
 *   1. DSA (Data Structures & Algorithms): LeetCode algorithms, complexity, code execution.
 *   2. Behavioral: STAR methodology, situational leadership, soft skills.
 *   3. System Design: Scalability, database architecture, trade-offs.
 * - One-click difficulty shortcuts: Clicking an individual difficulty pill (Easy, Medium, Hard)
 *   instantly launches `/dashboard/create-session?type={type}&difficulty={difficulty}`.
 * - Interactive hover states: Top border glow, SVG background grid pattern, and floating action arrow.
 * - Secondary links to Question Bank and Custom Session creator.
 *
 * @module app/dashboard/QuickSelect
 */

'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Code2, MessageSquare, Layout, Plus, BookOpen, ArrowRight, Sparkles, Play } from 'lucide-react';
import SessionBadge from '@/components/SessionBadge';

/** Valid interview track types */
type InterviewType = 'dsa' | 'behavioral' | 'system_design';

/** Props accepted by individual track cards */
interface InterviewCardProps {
  type: InterviewType;
  title: string;
  description: string;
  icon: React.ReactNode;
  difficulties: string[];
  gradient: string;
  delay: string;
}

/** Theme descriptors and associated competency skill tags */
const cardThemes = {
  dsa: {
    gradientBorder: 'bg-blue-600',
    bgGradient: 'bg-blue-500/10',
    iconBg: 'bg-blue-600 shadow-blue-500/20',
    arrowActive: 'group-hover:bg-blue-600 group-hover:border-blue-600',
    skills: ['Complexity', 'LeetCode', 'Algorithms'],
  },
  behavioral: {
    gradientBorder: 'bg-indigo-600',
    bgGradient: 'bg-indigo-500/10',
    iconBg: 'bg-indigo-600 shadow-indigo-500/20',
    arrowActive: 'group-hover:bg-indigo-600 group-hover:border-indigo-600',
    skills: ['STAR Method', 'Soft Skills', 'Leadership'],
  },
  system_design: {
    gradientBorder: 'bg-teal-600',
    bgGradient: 'bg-teal-500/10',
    iconBg: 'bg-teal-600 shadow-teal-500/20',
    arrowActive: 'group-hover:bg-teal-600 group-hover:border-teal-600',
    skills: ['Scalability', 'DB Design', 'Architecture'],
  },
};

/**
 * InterviewTypeCard Component.
 *
 * @component
 * @param {InterviewCardProps} props
 * @returns {JSX.Element} Interactive card launching a tailored interview setup.
 */
function InterviewTypeCard({
  type,
  title,
  description,
  icon,
  difficulties,
  gradient,
  delay,
}: InterviewCardProps) {
  const router = useRouter();
  const theme = cardThemes[type];

  return (
    <div
      onClick={() => router.push(`/dashboard/create-session?type=${type}`)}
      className="relative overflow-hidden bg-white border border-slate-100 hover:border-transparent hover:shadow-xl hover:shadow-slate-200/40 p-6 md:p-8 text-left w-full rounded-[28px] transition-all duration-300 hover:-translate-y-1 transform-gpu group cursor-pointer flex flex-col justify-between min-h-[320px] outline-none"
    >
      {/* Dynamic top gradient border glow on hover */}
      <div className={`absolute top-0 left-0 w-full h-[3px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${theme.gradientBorder}`} />

      {/* SVG Tech Grid Pattern */}
      <svg
        className="absolute inset-0 -z-10 h-full w-full stroke-slate-200/20 [mask-image:radial-gradient(100%_100%_at_top_left,white,transparent)] opacity-40 group-hover:opacity-100 transition-opacity duration-300"
        aria-hidden="true"
      >
        <defs>
          <pattern id={`quick-grid-${type}`} width="18" height="18" patternUnits="userSpaceOnUse">
            <path d="M.5 18V.5H18" fill="none" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" strokeWidth="0" fill={`url(#quick-grid-${type})`} />
      </svg>

      {/* Hover inner gradient fill */}
      <div className={`absolute inset-0 opacity-0 group-hover:opacity-[0.05] transition-opacity duration-300 pointer-events-none -z-10 rounded-3xl ${theme.bgGradient}`} />

      <div className="w-full">
        {/* Card Header with Icon and Skill Tags */}
        <div className="flex items-center justify-between mb-5">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shadow-sm transition-all duration-300 ${theme.iconBg} text-white`}
          >
            {icon}
          </div>
          
          <div className="flex flex-wrap gap-1">
            {theme.skills.map((skill) => (
              <span key={skill} className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-slate-50 border border-slate-100 text-slate-400 group-hover:bg-slate-100 group-hover:text-slate-600 transition-colors">
                {skill}
              </span>
            ))}
          </div>
        </div>
        <h3 className="text-slate-900 font-extrabold text-lg mb-1.5 tracking-tight group-hover:text-slate-950 transition-colors">{title}</h3>
        <p className="text-slate-500 text-xs mb-6 leading-relaxed font-medium line-clamp-3">{description}</p>
      </div>

      {/* Footer with Direct Difficulty Launchers */}
      <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-100/80 w-full relative z-10">
        <div className="flex flex-wrap gap-1.5">
          {difficulties.map((d) => (
            <button
              key={d}
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/dashboard/create-session?type=${type}&difficulty=${d}`);
              }}
              className="transition-all duration-150 hover:scale-105 active:scale-95 cursor-pointer block"
            >
              <SessionBadge variant="difficulty" value={d} />
            </button>
          ))}
        </div>
        <div className={`w-8 h-8 rounded-full bg-slate-50 border border-slate-200/60 flex items-center justify-center text-slate-400 transition-all duration-300 shadow-sm group-hover:text-white group-hover:translate-x-0.5 transform-gpu ${theme.arrowActive}`}>
          <ArrowRight className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
}

/**
 * QuickSelect Component.
 *
 * @component
 * @returns {JSX.Element} Grid section of three interview launcher cards.
 */
export default function QuickSelect() {
  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Start New Interview</h2>
          <p className="text-slate-500 text-sm mt-0.5 font-medium">Choose your interview type to begin</p>
        </div>
        {/* Quick Links */}
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/questions"
            prefetch={true}
            className="btn-ghost flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold hover:bg-slate-100 transition-all duration-200"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Question Bank
          </Link>
          <Link
            href="/dashboard/create-session"
            prefetch={true}
            className="btn-ghost flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold hover:bg-slate-100 transition-all duration-200"
          >
            <Plus className="w-3.5 h-3.5" />
            Custom
          </Link>
        </div>
      </div>

      {/* ── Interactive Presentation Demo Showcase ── */}
      <div className="bg-gradient-to-r from-blue-50/80 via-indigo-50/60 to-slate-50/80 border border-blue-200/80 rounded-3xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-slate-900 tracking-tight">Live Interview Demo Mode</h3>
                <span className="text-[10px] font-bold text-blue-700 bg-blue-100 border border-blue-200 px-2.5 py-0.5 rounded-full">
                  1-Click Presentation Ready
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Ready-to-demo sessions with pre-configured questions, test cases, and solution loaders.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* DSA Demo: Two Sum */}
          <Link
            href="/dashboard/create-session?type=dsa&difficulty=easy&focus=Two+Sum&company=Google"
            className="bg-white border border-blue-100 hover:border-blue-400 p-4 rounded-2xl flex flex-col justify-between hover:shadow-md transition-all group cursor-pointer"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                  DSA Live Demo
                </span>
                <span className="text-[10px] font-bold text-slate-400 group-hover:text-blue-600 flex items-center gap-1 transition-colors">
                  Launch <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </div>
              <h4 className="text-sm font-bold text-slate-900 mb-1 group-hover:text-blue-600 transition-colors">Two Sum (LeetCode #1)</h4>
              <p className="text-xs text-slate-500 leading-relaxed font-normal">
                Includes 3 automated test cases, 1-click O(n) Hash Map solution loader, test runner, and complexity evaluation.
              </p>
            </div>
          </Link>

          {/* Behavioral Demo: STAR Outage */}
          <Link
            href="/dashboard/create-session?type=behavioral&difficulty=medium&focus=STAR+Method+Incident+Response&company=Meta"
            className="bg-white border border-indigo-100 hover:border-indigo-400 p-4 rounded-2xl flex flex-col justify-between hover:shadow-md transition-all group cursor-pointer"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                  Behavioral Demo
                </span>
                <span className="text-[10px] font-bold text-slate-400 group-hover:text-indigo-600 flex items-center gap-1 transition-colors">
                  Launch <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </div>
              <h4 className="text-sm font-bold text-slate-900 mb-1 group-hover:text-indigo-600 transition-colors">Production Outage (STAR)</h4>
              <p className="text-xs text-slate-500 leading-relaxed font-normal">
                Situation, Task, Action, Result incident response evaluation with quick-response candidate answers.
              </p>
            </div>
          </Link>

          {/* System Design Demo: URL Shortener */}
          <Link
            href="/dashboard/create-session?type=system_design&difficulty=hard&focus=Scalable+URL+Shortener&company=Uber"
            className="bg-white border border-teal-100 hover:border-teal-400 p-4 rounded-2xl flex flex-col justify-between hover:shadow-md transition-all group cursor-pointer"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-100">
                  System Design Demo
                </span>
                <span className="text-[10px] font-bold text-slate-400 group-hover:text-teal-600 flex items-center gap-1 transition-colors">
                  Launch <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </div>
              <h4 className="text-sm font-bold text-slate-900 mb-1 group-hover:text-teal-600 transition-colors">Distributed URL Shortener</h4>
              <p className="text-xs text-slate-500 leading-relaxed font-normal">
                High-scale architecture: Base62 hashing, Cassandra storage, Redis cache tier, and 50K QPS scaling strategy.
              </p>
            </div>
          </Link>
        </div>
      </div>

      {/* 3-Column Launcher Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <InterviewTypeCard
          type="dsa"
          title="Data Structures & Algorithms"
          description="Practice coding problems, optimize solutions, and master algorithmic thinking with real-time feedback."
          icon={<Code2 className="w-5 h-5 text-white" />}
          difficulties={['easy', 'medium', 'hard']}
          gradient="bg-blue-600"
          delay="delay-100"
        />
        <InterviewTypeCard
          type="behavioral"
          title="Behavioral Interview"
          description="Sharpen your storytelling with STAR method, common HR questions, and leadership scenarios."
          icon={<MessageSquare className="w-5 h-5 text-white" />}
          difficulties={['easy', 'medium', 'hard']}
          gradient="bg-blue-600"
          delay="delay-200"
        />
        <InterviewTypeCard
          type="system_design"
          title="System Design"
          description="Design scalable architectures, discuss trade-offs, and tackle real-world infrastructure challenges."
          icon={<Layout className="w-5 h-5 text-white" />}
          difficulties={['easy', 'medium', 'hard']}
          gradient="bg-blue-600"
          delay="delay-300"
        />
      </div>
    </section>
  );
}
