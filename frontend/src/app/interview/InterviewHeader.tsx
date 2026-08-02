'use client';

import { ChevronLeft, Clock, X, AlertTriangle, Pause, PlayCircle, Shield } from 'lucide-react';
import { TYPE_LABEL } from './constants';
import { formatTime } from './utils';

interface InterviewHeaderProps {
  session: any;
  elapsedSeconds: number;
  sessionPaused: boolean;
  tabSwitchCount: number;
  pasteCount: number;
  onBack: () => void;
  onPause: () => void;
  onResume: () => void;
  onEnd: () => void;
}

const DIFFICULTY_STYLES: Record<string, string> = {
  easy:   'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  medium: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  hard:   'bg-rose-500/15 text-rose-400 border-rose-500/30',
};

const TYPE_STYLES: Record<string, string> = {
  dsa:           'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  behavioral:    'bg-purple-500/15 text-purple-300 border-purple-500/30',
  system_design: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
};

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
    <header className="bg-[#1a1a2e] border-b border-white/10 px-4 h-12 flex items-center gap-3 shrink-0 z-20 shadow-lg">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-slate-400 hover:text-white text-xs font-semibold transition-colors shrink-0"
      >
        <ChevronLeft className="w-4 h-4" />
        <span className="hidden sm:inline">Exit</span>
      </button>

      <div className="w-px h-4 bg-white/10 shrink-0" />

      {/* Session info */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0 ${TYPE_STYLES[session?.interview_type] ?? TYPE_STYLES.dsa}`}>
          {typeLabel}
        </span>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0 ${DIFFICULTY_STYLES[difficulty] ?? DIFFICULTY_STYLES.medium}`}>
          {difficulty}
        </span>
        {session?.target_company && (
          <span className="text-slate-500 text-xs font-medium truncate hidden md:inline">
            @ {session.target_company}
          </span>
        )}
        {sessionPaused && (
          <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 border border-amber-500/30 px-2 py-0.5 rounded-full animate-pulse">
            PAUSED
          </span>
        )}
      </div>

      {/* Violations */}
      {totalViolations > 0 && (
        <div className="flex items-center gap-1 text-rose-400 text-xs font-bold bg-rose-500/10 border border-rose-500/25 px-2.5 py-1 rounded-full shrink-0">
          <AlertTriangle className="w-3 h-3" />
          <span>{totalViolations}/3</span>
        </div>
      )}

      {/* Integrity */}
      {totalViolations === 0 && (
        <div className="hidden sm:flex items-center gap-1 text-emerald-400/70 text-[10px] font-semibold shrink-0">
          <Shield className="w-3 h-3" />
          <span>Integrity OK</span>
        </div>
      )}

      <div className="w-px h-4 bg-white/10 shrink-0" />

      {/* Pause / Resume */}
      <button
        onClick={sessionPaused ? onResume : onPause}
        className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all shrink-0 ${
          sessionPaused
            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
            : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/10'
        }`}
      >
        {sessionPaused
          ? <><PlayCircle className="w-3.5 h-3.5" /><span className="hidden sm:inline">Resume</span></>
          : <><Pause className="w-3.5 h-3.5" /><span className="hidden sm:inline">Pause</span></>}
      </button>

      {/* Timer */}
      <div className={`flex items-center gap-1.5 font-mono text-sm font-bold px-3 py-1.5 rounded-lg border shrink-0 tabular-nums ${
        elapsedSeconds > 0 && session?.duration_minutes && elapsedSeconds > session.duration_minutes * 60 * 0.85
          ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
          : 'bg-white/5 border-white/10 text-slate-200'
      }`}>
        <Clock className="w-3.5 h-3.5" />
        {formatTime(elapsedSeconds)}
      </div>

      {/* End */}
      <button
        onClick={onEnd}
        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border bg-rose-500/10 border-rose-500/25 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 transition-all shrink-0"
      >
        <X className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">End</span>
      </button>
    </header>
  );
}
