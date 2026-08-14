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
  easy:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  hard:   'bg-rose-50 text-rose-700 border-rose-200',
};

const TYPE_STYLES: Record<string, string> = {
  dsa:           'bg-indigo-50 text-indigo-700 border-indigo-200',
  behavioral:    'bg-purple-50 text-purple-700 border-purple-200',
  system_design: 'bg-cyan-50 text-cyan-700 border-cyan-200',
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
    <header className="bg-white border-b border-slate-200 px-4 h-12 flex items-center gap-3 shrink-0 z-20 shadow-sm">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-slate-500 hover:text-slate-800 text-xs font-semibold transition-colors shrink-0"
      >
        <ChevronLeft className="w-4 h-4" />
        <span className="hidden sm:inline">Exit</span>
      </button>

      <div className="w-px h-4 bg-slate-200 shrink-0" />

      {/* Session info */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0 ${TYPE_STYLES[session?.interview_type] ?? TYPE_STYLES.dsa}`}>
          {typeLabel}
        </span>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0 ${DIFFICULTY_STYLES[difficulty] ?? DIFFICULTY_STYLES.medium}`}>
          {difficulty}
        </span>
        {session?.target_company && (
          <span className="text-slate-400 text-xs font-medium truncate hidden md:inline">
            @ {session.target_company}
          </span>
        )}
        {sessionPaused && (
          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full animate-pulse">
            PAUSED
          </span>
        )}
      </div>

      {/* Violations */}
      {totalViolations > 0 && (
        <div className="flex items-center gap-1 text-rose-600 text-xs font-bold bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-full shrink-0">
          <AlertTriangle className="w-3 h-3" />
          <span>{totalViolations}/3</span>
        </div>
      )}

      {/* Integrity */}
      {totalViolations === 0 && (
        <div className="hidden sm:flex items-center gap-1 text-emerald-600/80 text-[10px] font-semibold shrink-0">
          <Shield className="w-3 h-3" />
          <span>Integrity OK</span>
        </div>
      )}

      <div className="w-px h-4 bg-slate-200 shrink-0" />

      {/* Pause / Resume */}
      <button
        onClick={sessionPaused ? onResume : onPause}
        className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all shrink-0 ${
          sessionPaused
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
            : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-800 hover:bg-slate-100'
        }`}
      >
        {sessionPaused
          ? <><PlayCircle className="w-3.5 h-3.5" /><span className="hidden sm:inline">Resume</span></>
          : <><Pause className="w-3.5 h-3.5" /><span className="hidden sm:inline">Pause</span></>}
      </button>

      {/* Timer */}
      <div className={`flex items-center gap-1.5 font-mono text-sm font-bold px-3 py-1.5 rounded-lg border shrink-0 tabular-nums ${
        elapsedSeconds > 0 && session?.duration_minutes && elapsedSeconds > session.duration_minutes * 60 * 0.85
          ? 'bg-rose-50 border-rose-200 text-rose-600'
          : 'bg-slate-50 border-slate-200 text-slate-700'
      }`}>
        <Clock className="w-3.5 h-3.5" />
        {formatTime(elapsedSeconds)}
      </div>

      {/* End */}
      <button
        onClick={onEnd}
        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100 hover:text-rose-700 transition-all shrink-0"
      >
        <X className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">End</span>
      </button>
    </header>
  );
}
