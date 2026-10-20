'use client';

/**
 * @file InterviewHeader.tsx (Interview Studio Top Navigation & Control Bar)
 * @description Persistent top header bar in the live mock interview studio.
 * Displays interview metadata (category, difficulty, target company), pause/resume controls,
 * real-time elapsed timer with urgency warning indicators as the session nears completion,
 * proctoring integrity badges (displaying accumulated tab-switch and paste violation flags),
 * and an immediate "End Session" action trigger.
 */

import { ChevronLeft, Clock, X, AlertTriangle, Pause, PlayCircle, Shield } from 'lucide-react';
import { TYPE_LABEL } from './constants';
import { formatTime } from './utils';

/**
 * Props passed to InterviewHeader component.
 */
interface InterviewHeaderProps {
  /** Active interview session object */
  session: any;
  /** Cumulative elapsed runtime in seconds */
  elapsedSeconds: number;
  /** Whether session timer and AI loop are temporarily paused */
  sessionPaused: boolean;
  /** Count of detected tab switches / blur events */
  tabSwitchCount: number;
  /** Count of detected clipboard pastes */
  pasteCount: number;
  /** Callback to exit back to dashboard */
  onBack: () => void;
  /** Callback to pause session */
  onPause: () => void;
  /** Callback to resume session */
  onResume: () => void;
  /** Callback to open end interview modal */
  onEnd: () => void;
}

/** Color badge map per difficulty level */
const DIFFICULTY_STYLES: Record<string, string> = {
  easy:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  hard:   'bg-rose-50 text-rose-700 border-rose-200',
};

/** Color badge map per interview domain */
const TYPE_STYLES: Record<string, string> = {
  dsa:           'bg-blue-50 text-blue-700 border-blue-200',
  behavioral:    'bg-amber-50 text-amber-700 border-amber-200',
  system_design: 'bg-cyan-50 text-cyan-700 border-cyan-200',
};

/**
 * InterviewHeader Component.
 */
export default function InterviewHeader({
  session,
  elapsedSeconds,
  sessionPaused,
  tabSwitchCount,
  pasteCount,
  onBack,
  onPause,
  onResume,
  onEnd,
}: InterviewHeaderProps) {
  const totalViolations = tabSwitchCount + pasteCount;
  const typeLabel = TYPE_LABEL[session?.interview_type] ?? session?.interview_type ?? 'Interview';
  const difficulty = session?.difficulty ?? 'medium';

  return (
    <header className="bg-white/95 backdrop-blur-md border-b border-slate-200/90 px-4 h-14 flex items-center justify-between gap-3 shrink-0 z-20 shadow-xs">
      {/* Left: Brand logo & exit button */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-900 px-2 py-1.5 rounded-xl hover:bg-slate-100 text-xs font-bold transition-all cursor-pointer"
          title="Exit to dashboard"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Exit</span>
        </button>

        <div className="w-px h-5 bg-slate-200 shrink-0" />

        {/* Brand logo tag */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs">
            <span className="text-[11px] font-black">D</span>
          </div>
          <span className="hidden md:inline font-bold text-xs text-slate-800">
            Dev<span className="text-blue-600">Meet</span> Studio
          </span>
        </div>
      </div>

      {/* Center: Session type, difficulty, target company, paused status, and proctoring badges */}
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full border shrink-0 ${TYPE_STYLES[session?.interview_type] ?? TYPE_STYLES.dsa}`}>
          {typeLabel}
        </span>
        <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full border shrink-0 ${DIFFICULTY_STYLES[difficulty] ?? DIFFICULTY_STYLES.medium}`}>
          {difficulty}
        </span>
        {session?.target_company && (
          <span className="text-slate-500 text-xs font-semibold truncate hidden lg:inline bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full">
            @{session.target_company}
          </span>
        )}
        {sessionPaused && (
          <span className="text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full animate-pulse">
            PAUSED
          </span>
        )}

        {/* Anti-cheat proctoring indicator */}
        {totalViolations > 0 ? (
          <div className="flex items-center gap-1 text-rose-600 text-xs font-bold bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-full shrink-0">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{totalViolations}/3 Flags</span>
          </div>
        ) : (
          <div className="hidden sm:flex items-center gap-1.5 text-emerald-700 text-xs font-bold bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-full shrink-0">
            <Shield className="w-3.5 h-3.5 text-emerald-600" />
            <span>Proctor Active</span>
          </div>
        )}
      </div>

      {/* Right: Controls & Timer */}
      <div className="flex items-center gap-2.5">
        {/* Pause / Resume button */}
        <button
          onClick={sessionPaused ? onResume : onPause}
          className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
            sessionPaused
              ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
              : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
          }`}
          title={sessionPaused ? 'Resume interview' : 'Pause interview'}
        >
          {sessionPaused
            ? <><PlayCircle className="w-3.5 h-3.5 text-emerald-600" /><span className="hidden sm:inline">Resume</span></>
            : <><Pause className="w-3.5 h-3.5" /><span className="hidden sm:inline">Pause</span></>}
        </button>

        {/*
         * Elapsed Timer:
         * Formats seconds into MM:SS. Pulses red when candidate reaches 85%+ of allocated time limit.
         */}
        <div className={`flex items-center gap-1.5 font-mono text-xs font-bold px-3 py-1.5 rounded-xl border shrink-0 tabular-nums shadow-xs ${
          elapsedSeconds > 0 && session?.duration_minutes && elapsedSeconds > session.duration_minutes * 60 * 0.85
            ? 'bg-rose-50 border-rose-200 text-rose-600 animate-pulse'
            : 'bg-slate-50 border-slate-200 text-slate-800'
        }`}>
          <Clock className="w-3.5 h-3.5 text-slate-500" />
          <span>{formatTime(elapsedSeconds)}</span>
        </div>

        {/* End Interview Action */}
        <button
          onClick={onEnd}
          className="flex items-center gap-1.5 text-xs font-extrabold px-3.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 hover:border-rose-600 transition-all shadow-xs cursor-pointer"
          title="End session and view feedback scorecard"
        >
          <X className="w-3.5 h-3.5" />
          <span>End Session</span>
        </button>
      </div>
    </header>
  );
}
