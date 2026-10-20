'use client';

import React from 'react';
import Link from 'next/link';
import { Code2, Layout, MessageSquare, ChevronRight, Check } from 'lucide-react';

const MODES = [
  {
    icon: <Code2 className="w-6 h-6 text-blue-600" />,
    badge: 'Algorithms & DSA',
    title: 'Data Structures & Algorithms',
    description:
      'Solve algorithmic challenges in a real-time embedded Monaco code editor with live syntax checking, multi-language support (Python, JS, C++, Java), and sandboxed execution test suites.',
    features: ['LeetCode style test cases', 'Memory & execution timing', 'Dynamic hints when stuck'],
  },
  {
    icon: <Layout className="w-6 h-6 text-indigo-600" />,
    badge: 'Architecture & Scale',
    title: 'System Design Interviews',
    description:
      'Architect distributed systems, design database sharding strategies, configure load balancers, and discuss scaling trade-offs with an AI interviewer trained on Tier-1 company rubrics.',
    features: ['Microservices & caching models', 'CAP theorem trade-offs', 'Database partitioning specs'],
  },
  {
    icon: <MessageSquare className="w-6 h-6 text-sky-600" />,
    badge: 'Leadership & STAR',
    title: 'Behavioral & Culture Fit',
    description:
      'Practice leadership principles, conflict resolution, and impact storytelling using the structured STAR framework (Situation, Task, Action, Result) with real-time speech transcription.',
    features: ['Amazon leadership principles', 'Speech cadence & filler word analysis', 'Comprehensive STAR feedback scorecards'],
  },
];

/**
 * Section displaying the three core interview simulation tracks supported by DevMeet.
 */
export function InterviewModesSection() {
  return (
    <section id="features" className="py-24 px-6 max-w-7xl mx-auto">
      <div className="text-center max-w-3xl mx-auto mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-xs font-bold text-blue-600 mb-4">
          <span>Three Dedicated Interview Tracks</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          Everything You Need to Clear Technical Rounds
        </h2>
        <p className="text-base text-slate-600 mt-4 leading-relaxed font-medium">
          Whether you are preparing for coding questions, complex distributed systems, or behavioral rounds, DevMeet adapts to your target company and experience level.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {MODES.map((mode, i) => (
          <div
            key={i}
            className="rounded-2xl border border-slate-200/80 bg-white p-8 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between group hover:-translate-y-1"
          >
            <div>
              <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                {mode.icon}
              </div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
                {mode.badge}
              </span>
              <h3 className="text-xl font-bold text-slate-900 mt-1 mb-3">
                {mode.title}
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed mb-6 font-medium">
                {mode.description}
              </p>
              <ul className="space-y-2.5 mb-8">
                {mode.features.map((f, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <Link
              href="/register"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 pt-4 border-t border-slate-100"
            >
              Practice Track <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

export default InterviewModesSection;
