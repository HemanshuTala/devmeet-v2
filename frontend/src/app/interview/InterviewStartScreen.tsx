'use client';

/**
 * @file InterviewStartScreen.tsx (Pre-Flight Studio Calibration & Start Screen)
 * @description Pre-interview lobby displayed when entering a newly created session.
 * Displays session parameters (track, difficulty, duration, company focus),
 * runs through a pre-flight system readiness checklist (proctoring, LLM engine, media stream, sandbox),
 * offers strategy tips, supports keyboard launch via Enter key, and gives option to cancel session.
 */

import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronLeft,
  Brain,
  Play,
  Sparkles,
  Shield,
  Zap,
  CheckCircle2,
  XCircle,
  Loader2,
  Building2,
  Target,
  Clock,
  Code2,
  Bot,
  Lightbulb,
  ArrowRight,
  ShieldCheck,
  Cpu,
  Radio,
} from 'lucide-react';
import { DIFFICULTY_BADGE, TYPE_LABEL } from './constants';

/**
 * Props passed to InterviewStartScreen.
 */
interface InterviewStartScreenProps {
  /** Session record containing track, difficulty, and company tags */
  session: any;
  /** True while the session start request and first question generation are running */
  isStarting: boolean;
  /** Error message if room setup failed */
  chatError: string | null;
  /** Callback to launch the interview */
  onStart: () => void;
  /** Callback to return to dashboard */
  onBack: () => void;
  /** Optional callback to cancel and mark session cancelled */
  onCancel?: () => void;
  /** True while session cancellation request is in progress */
  isCancelling?: boolean;
}

/** Pre-flight system verification checks shown on the lobby card */
const READINESS_CHECKS = [
  {
    icon: ShieldCheck,
    title: 'Anti-Cheat & Proctoring',
    subtitle: 'Tab switch & clipboard monitoring active',
    tag: 'Active',
    tagColor: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  },
  {
    icon: Bot,
    title: 'AI Technical Evaluator',
    subtitle: 'Groq Llama 3.3 engine initialized',
    tag: 'Online',
    tagColor: 'text-blue-700 bg-blue-50 border-blue-200',
  },
  {
    icon: Radio,
    title: 'Audio & Live Media Stream',
    subtitle: 'Microphone & camera pipeline verified',
    tag: 'Connected',
    tagColor: 'text-cyan-700 bg-cyan-50 border-cyan-200',
  },
  {
    icon: Cpu,
    title: 'Multi-Language Sandbox',
    subtitle: 'Docker execution runtime calibrated',
    tag: 'Ready',
    tagColor: 'text-amber-700 bg-amber-50 border-amber-200',
  },
];

/**
 * InterviewStartScreen Component.
 */
export default function InterviewStartScreen({
  session,
  isStarting,
  chatError,
  onStart,
  onBack,
  onCancel,
  isCancelling,
}: InterviewStartScreenProps) {
  // Allow starting via Enter key press for accessibility and fast workflow
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !isStarting && !isCancelling) {
        onStart();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onStart, isStarting, isCancelling]);

  const difficultyStr = session?.difficulty || 'medium';
  const difficultyCapitalized = difficultyStr.charAt(0).toUpperCase() + difficultyStr.slice(1);
  const typeTitle = TYPE_LABEL[session?.interview_type] ?? session?.interview_type ?? 'Technical Interview';

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col justify-between relative overflow-hidden py-8 px-4 sm:px-6">
      {/* Background ambient mesh and dot grid pattern */}
      <div className="absolute inset-0 pointer-events-none -z-10">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[360px] opacity-40 blur-3xl pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, rgba(124, 58, 237, 0.08) 50%, transparent 80%)',
          }}
        />
      </div>

      {/* Top bar: Back button & latency status indicator */}
      <header className="max-w-3xl w-full mx-auto flex items-center justify-between mb-4 z-10">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 bg-white hover:text-slate-900 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all group"
        >
          <ChevronLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform text-slate-400 group-hover:text-slate-700" />
          Back to Dashboard
        </button>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/90 border border-slate-200/80 shadow-xs">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-[11px] font-semibold text-slate-700 tracking-tight">System Ready • Low Latency</span>
        </div>
      </header>

      {/* Main card */}
      <main className="max-w-3xl w-full mx-auto my-auto z-10">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="bg-white rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-200/60 overflow-hidden"
        >
          {/* Subtle top accent gradient */}
          <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500" />

          <div className="p-6 sm:p-9">
            {/* Header section with refined icon */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 pb-6 border-b border-slate-100">
              <div className="flex items-start gap-4">
                <div className="relative shrink-0">
                  <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/25">
                    <Brain className="w-7 h-7" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center shadow-xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                      Interview Room Ready
                    </h1>
                    <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200/60">
                      Live Simulation
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">
                    Your environment has been calibrated. Press Start to initiate the first turn.
                  </p>
                </div>
              </div>

              {/* Status pill for session state */}
              <div className="flex sm:flex-col items-center sm:items-end justify-between border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100">
                <span className="text-[11px] font-medium text-slate-400">Session Mode</span>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 bg-blue-50/80 px-2.5 py-1 rounded-lg border border-blue-100">
                  <Sparkles className="w-3 h-3 text-blue-500" />
                  AI Interactive
                </span>
              </div>
            </div>

            {/* Session Specs Grid */}
            <div className="mt-6">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                Session Parameters
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {/* Track */}
                <div className="p-3.5 rounded-2xl bg-slate-50/90 border border-slate-200/70 flex flex-col justify-between">
                  <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                    <Code2 className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider">Track</span>
                  </div>
                  <p className="text-xs sm:text-sm font-bold text-slate-800 line-clamp-1" title={typeTitle}>
                    {typeTitle}
                  </p>
                </div>

                {/* Difficulty */}
                <div className="p-3.5 rounded-2xl bg-slate-50/90 border border-slate-200/70 flex flex-col justify-between">
                  <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                    <Target className="w-3.5 h-3.5 text-amber-500" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider">Difficulty</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                        DIFFICULTY_BADGE[difficultyStr] ?? 'badge-blue'
                      }`}
                    >
                      {difficultyCapitalized}
                    </span>
                  </div>
                </div>

                {/* Duration */}
                <div className="p-3.5 rounded-2xl bg-slate-50/90 border border-slate-200/70 flex flex-col justify-between">
                  <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                    <Clock className="w-3.5 h-3.5 text-cyan-500" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider">Duration</span>
                  </div>
                  <p className="text-xs sm:text-sm font-bold text-slate-800">
                    {session?.duration_minutes ?? 30} minutes
                  </p>
                </div>

                {/* Target Company (if set) */}
                {session?.target_company && (
                  <div className="p-3.5 rounded-2xl bg-slate-50/90 border border-slate-200/70 flex flex-col justify-between">
                    <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                      <Building2 className="w-3.5 h-3.5 text-blue-500" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider">Target Company</span>
                    </div>
                    <p className="text-xs sm:text-sm font-bold text-slate-800">
                      {session.target_company}
                    </p>
                  </div>
                )}

                {/* Focus Area (if set) */}
                {session?.focus_area && (
                  <div className="p-3.5 rounded-2xl bg-slate-50/90 border border-slate-200/70 flex flex-col justify-between col-span-2">
                    <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider">Focus Topic</span>
                    </div>
                    <p className="text-xs sm:text-sm font-bold text-slate-800 truncate" title={session.focus_area}>
                      {session.focus_area}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Diagnostics & Readiness Checklist */}
            <div className="mt-6">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                Pre-Flight System Verification
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {READINESS_CHECKS.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-2xl bg-slate-50/60 border border-slate-200/60 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center shrink-0 shadow-2xs">
                        <item.icon className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate">{item.title}</p>
                        <p className="text-[11px] text-slate-500 truncate">{item.subtitle}</p>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${item.tagColor}`}
                    >
                      {item.tag}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Tips Callout */}
            <div className="mt-6 p-4 rounded-2xl bg-blue-50/50 border border-blue-100 flex items-start gap-3">
              <div className="p-1.5 rounded-lg bg-blue-100/80 text-blue-700 shrink-0">
                <Lightbulb className="w-4 h-4" />
              </div>
              <div className="text-xs leading-relaxed text-slate-800">
                <span className="font-bold text-blue-900">Pro-Tip for Success:</span> State your assumptions early, talk through your algorithm before coding, and test edge cases. The AI evaluates both structural clarity and communication.
              </div>
            </div>

            {/* Error Message */}
            {chatError && (
              <div className="mt-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                <XCircle className="w-4 h-4 shrink-0" />
                <span>{chatError}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <motion.button
                whileHover={{ scale: 1.01, y: -1 }}
                whileTap={{ scale: 0.99 }}
                onClick={onStart}
                disabled={isStarting}
                className="flex-1 py-3.5 px-6 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2.5 transition-all shadow-md shadow-blue-600/20 disabled:opacity-70"
                style={{
                  background: isStarting
                    ? '#64748b'
                    : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                }}
              >
                {isStarting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Initializing Interview Studio…</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    <span>Start Interview</span>
                    <span className="ml-1 text-[11px] font-normal opacity-70 px-1.5 py-0.5 rounded bg-white/20">
                      ↵ Enter
                    </span>
                  </>
                )}
              </motion.button>

              {onCancel && (
                <button
                  onClick={onCancel}
                  disabled={isCancelling || isStarting}
                  className="py-3.5 px-5 rounded-2xl font-bold text-xs text-rose-600 hover:text-rose-700 bg-white hover:bg-rose-50/50 border border-slate-200 hover:border-rose-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isCancelling ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Cancelling…</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Cancel Session</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </main>

      {/* Footer disclaimer */}
      <footer className="text-center text-xs text-slate-400 mt-4 z-10">
        AI simulated interview sessions are recorded and evaluated in real-time according to DevMeet privacy policies.
      </footer>
    </div>
  );
}
