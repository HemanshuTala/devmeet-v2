/**
 * @file ConsistencyGrid.tsx
 * @description Candidate Practice Activity & Daily Streak Heatmap for DevMeet.
 *
 * Visualizes candidate mock interview consistency across the past 24 weeks (168 days)
 * in an elegant GitHub/LeetCode-style contribution calendar with dynamic month markers,
 * day labels, active streak indicator, and session intensity gradients.
 *
 * @module app/dashboard/ConsistencyGrid
 */

'use client';

import React, { useMemo } from 'react';
import { Calendar, Flame, Trophy, CheckCircle2 } from 'lucide-react';

interface ConsistencyGridProps {
  /** Array of completed session records */
  sessions?: any[];
  /** Consecutive daily streak count */
  streakDays?: number;
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function ConsistencyGrid({ sessions = [], streakDays = 0 }: ConsistencyGridProps) {
  // Compute date activity map and statistics
  const { dateSessionCountMap, activeDaysCount, totalCompleted, weeksData } = useMemo(() => {
    const map = new Map<string, number>();
    let completedCount = 0;

    (sessions || []).forEach((s: any) => {
      if (s.created_at) {
        const dStr = new Date(s.created_at).toDateString();
        map.set(dStr, (map.get(dStr) || 0) + 1);
        if (s.status === 'completed') {
          completedCount++;
        }
      }
    });

    const now = new Date();
    // 24 weeks of data (w=23 down to 0)
    const weeks: Array<{
      weekIndex: number;
      monthLabel?: string;
      days: Array<{
        date: Date;
        dateStr: string;
        count: number;
        dayOfWeek: number;
      }>;
    }> = [];

    let lastMonthSeen = -1;

    for (let w = 23; w >= 0; w--) {
      const days: Array<{ date: Date; dateStr: string; count: number; dayOfWeek: number }> = [];
      let weekFirstMonth: string | undefined = undefined;

      for (let d = 0; d < 7; d++) {
        const targetDate = new Date(now.getTime());
        const daysBack = w * 7 + (6 - d);
        targetDate.setDate(now.getDate() - daysBack);

        const dateStr = targetDate.toDateString();
        const count = map.get(dateStr) || 0;
        const month = targetDate.getMonth();

        // Show month label when month changes at start of week
        if (d === 0 && month !== lastMonthSeen) {
          weekFirstMonth = MONTH_NAMES[month];
          lastMonthSeen = month;
        }

        days.push({
          date: targetDate,
          dateStr,
          count,
          dayOfWeek: targetDate.getDay(),
        });
      }

      weeks.push({
        weekIndex: w,
        monthLabel: weekFirstMonth,
        days,
      });
    }

    return {
      dateSessionCountMap: map,
      activeDaysCount: map.size,
      totalCompleted: completedCount || sessions.length,
      weeksData: weeks,
    };
  }, [sessions]);

  return (
    <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs flex flex-col gap-5">
      {/* Header bar: Title on left, stats chips on right */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600">
              <Calendar className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              Practice Activity & Consistency
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Timeline mapping of daily technical interview sessions over the last 24 weeks
          </p>
        </div>

        {/* Stats badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50/90 border border-amber-200/60 text-amber-800 text-xs font-bold shadow-2xs">
            <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500 animate-pulse" />
            <span>{streakDays} Day Practice Streak!</span>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50/80 border border-indigo-200/60 text-indigo-700 text-xs font-bold shadow-2xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500" />
            <span>{totalCompleted} Completed</span>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold shadow-2xs">
            <Trophy className="w-3.5 h-3.5 text-slate-500" />
            <span>{activeDaysCount} Active Days</span>
          </div>
        </div>
      </div>

      {/* Contribution Calendar Heatmap */}
      <div className="w-full overflow-x-auto scrollbar-none py-1">
        <div className="min-w-[620px] flex flex-col gap-1.5 select-none">
          {/* Month labels row */}
          <div className="flex text-[10px] font-semibold text-slate-400 pl-8 h-4">
            {weeksData.map((week, idx) => (
              <div key={idx} className="w-[22px] shrink-0 text-left">
                {week.monthLabel && <span>{week.monthLabel}</span>}
              </div>
            ))}
          </div>

          {/* Heatmap grid with weekday labels */}
          <div className="flex items-start gap-2">
            {/* Day of week labels (Mon, Wed, Fri) */}
            <div className="flex flex-col gap-1 text-[9px] font-bold text-slate-400 shrink-0 w-6 pt-0.5">
              <span className="h-3 leading-3">Sun</span>
              <span className="h-3 leading-3 opacity-0">Mon</span>
              <span className="h-3 leading-3">Tue</span>
              <span className="h-3 leading-3 opacity-0">Wed</span>
              <span className="h-3 leading-3">Thu</span>
              <span className="h-3 leading-3 opacity-0">Fri</span>
              <span className="h-3 leading-3">Sat</span>
            </div>

            {/* Week columns */}
            <div className="flex gap-1.5">
              {weeksData.map((week, wIdx) => (
                <div key={wIdx} className="flex flex-col gap-1 shrink-0">
                  {week.days.map((day, dIdx) => {
                    const count = day.count;
                    // Color scale: refined indigo brand palette
                    let fill = 'bg-slate-100 hover:bg-slate-200 border border-slate-200/50';
                    if (count >= 3) {
                      fill = 'bg-indigo-700 hover:bg-indigo-800 border border-indigo-800 shadow-2xs shadow-indigo-600/30';
                    } else if (count === 2) {
                      fill = 'bg-indigo-500 hover:bg-indigo-600 border border-indigo-600 shadow-2xs shadow-indigo-500/20';
                    } else if (count === 1) {
                      fill = 'bg-indigo-400 hover:bg-indigo-500 border border-indigo-400';
                    }

                    return (
                      <div
                        key={dIdx}
                        className={`w-3.5 h-3.5 rounded-[3px] transition-transform duration-150 hover:scale-125 cursor-pointer ${fill}`}
                        title={`${day.date.toLocaleDateString(undefined, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}: ${count === 0 ? 'No sessions' : `${count} session${count > 1 ? 's' : ''}`}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Grid Legend Footer */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500 font-medium select-none">
        <span className="text-slate-400">
          Showing daily activity across the last 168 days
        </span>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Less</span>
          <div className="w-3 h-3 rounded-[3px] bg-slate-100 border border-slate-200" title="0 sessions" />
          <div className="w-3 h-3 rounded-[3px] bg-indigo-300 border border-indigo-300" title="1 session" />
          <div className="w-3 h-3 rounded-[3px] bg-indigo-500 border border-indigo-500" title="2 sessions" />
          <div className="w-3 h-3 rounded-[3px] bg-indigo-700 border border-indigo-700" title="3+ sessions" />
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider ml-0.5">More</span>
        </div>
      </div>
    </div>
  );
}
