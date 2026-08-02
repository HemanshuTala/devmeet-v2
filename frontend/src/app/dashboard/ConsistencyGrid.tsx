import React from 'react';
import { Calendar, Flame } from 'lucide-react';
import { Session } from '@/lib/api';

interface ConsistencyGridProps {
  sessions: Session[];
  streakDays: number;
}

export default function ConsistencyGrid({ sessions, streakDays }: ConsistencyGridProps) {
  const renderConsistencyGrid = () => {
    const cols = [];
    const dates = new Set(sessions.map((s) => new Date(s.created_at).toDateString()));
    const now = new Date();

    // Grid spans 24 weeks backwards
    for (let w = 23; w >= 0; w--) {
      const days = [];
      for (let d = 0; d < 7; d++) {
        const targetDate = new Date(now.getTime());
        const daysBack = w * 7 + (6 - d);
        targetDate.setDate(now.getDate() - daysBack);

        const hasSession = dates.has(targetDate.toDateString());
        // Color based on session count for the day
        const daySessionCount = [...sessions].filter(
          (s) => new Date(s.created_at).toDateString() === targetDate.toDateString()
        ).length;
        let fill = 'bg-slate-100 border border-slate-200/20';
        if (daySessionCount >= 3) {
          fill = 'bg-blue-700 shadow-sm shadow-blue-600/20';
        } else if (daySessionCount === 2) {
          fill = 'bg-blue-500 shadow-sm shadow-blue-500/10';
        } else if (hasSession) {
          fill = 'bg-blue-600 shadow-sm shadow-blue-500/10';
        }

        days.push(
          <div
            key={d}
            className={`w-2 h-2 rounded-[2px] transition-colors duration-300 hover:scale-125 cursor-help ${fill}`}
            title={`${targetDate.toLocaleDateString()} - ${
              hasSession ? 'Interview mock session completed' : 'No sessions'
            }`}
          />,
        );
      }
      cols.push(
        <div key={w} className="flex flex-col gap-1 shrink-0">
          {days}
        </div>,
      );
    }
    return cols;
  };

  return (
    <section className="bg-white border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200/60 transition-all duration-200 rounded-2xl p-6 flex flex-col gap-5 animate-fade-in-up delay-300">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-slate-900 font-bold text-lg flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-blue-600" />
            Interview Consistency
          </h3>
          <p className="text-slate-500 text-xs mt-0.5 font-medium">
            Timeline mapping of daily practice mock sessions
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-100 px-3.5 py-1.5 rounded-xl shadow-sm">
          <Flame className="w-4 h-4 text-amber-500 fill-amber-500 animate-pulse" />
          <span>{streakDays} Day Practice Streak!</span>
        </div>
      </div>

      {/* GitHub style grid wrapper */}
      <div className="w-full overflow-x-auto py-2">
        <div className="min-w-[640px] flex gap-1.5 justify-between">
          {renderConsistencyGrid()}
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase tracking-wider font-bold select-none">
        <span>24 Weeks Ago</span>
        <div className="flex items-center gap-2">
          <span>Less</span>
          <div className="w-2.5 h-2.5 rounded bg-slate-200 border border-slate-300/40" />
          <div className="w-2.5 h-2.5 rounded bg-blue-200" />
          <div className="w-2.5 h-2.5 rounded bg-blue-400" />
          <div className="w-2.5 h-2.5 rounded bg-blue-500" />
          <div className="w-2.5 h-2.5 rounded bg-blue-600 shadow-md shadow-blue-500/25" />
          <span>More</span>
        </div>
        <span>Today</span>
      </div>
    </section>
  );
}
