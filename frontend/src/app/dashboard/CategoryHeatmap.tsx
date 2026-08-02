'use client';

import React, { useMemo } from 'react';

const INTERVIEW_TYPES = ['dsa', 'behavioral', 'system_design'] as const;
type InterviewType = typeof INTERVIEW_TYPES[number];

const TYPE_LABELS: Record<InterviewType, string> = {
  dsa: 'DSA',
  behavioral: 'Behavioral',
  system_design: 'System Design',
};

const TYPE_COLORS: Record<InterviewType, string> = {
  dsa: '#3b82f6',
  behavioral: '#8b5cf6',
  system_design: '#10b981',
};

const WEEKS = 24;

interface Session {
  interview_type: string;
  created_at: string;
}

interface GridCell {
  dateKey: string;
  dayOfWeek: number;
  week: number;
}

function getCellColor(count: number, type: InterviewType): string {
  if (count === 0) return '#f1f5f9';
  const base = TYPE_COLORS[type] ?? '#3b82f6';
  const opacity = Math.min(0.3 + (count / 3) * 0.7, 1).toFixed(2);
  const r = parseInt(base.slice(1, 3), 16);
  const g = parseInt(base.slice(3, 5), 16);
  const b = parseInt(base.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

export default function CategoryHeatmap({ sessions }: { sessions: Session[] }) {
  const heatmapData = useMemo(() => {
    const data: Record<string, Record<string, number>> = {};
    INTERVIEW_TYPES.forEach((t) => { data[t] = {}; });
    sessions.forEach((s) => {
      const type = s.interview_type;
      if (!data[type]) return;
      const dateKey = new Date(s.created_at).toISOString().slice(0, 10);
      data[type][dateKey] = (data[type][dateKey] ?? 0) + 1;
    });
    return data;
  }, [sessions]);

  const grid = useMemo((): GridCell[] => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cells: GridCell[] = [];
    for (let w = WEEKS - 1; w >= 0; w--) {
      for (let d = 0; d < 7; d++) {
        const date = new Date(today);
        date.setDate(today.getDate() - w * 7 - (6 - d));
        cells.push({
          dateKey: date.toISOString().slice(0, 10),
          dayOfWeek: date.getDay(),
          week: WEEKS - 1 - w,
        });
      }
    }
    return cells;
  }, []);

  const totalByType = useMemo(() => {
    const totals: Record<string, number> = {};
    INTERVIEW_TYPES.forEach((t) => {
      totals[t] = Object.values(heatmapData[t]).reduce((a, b) => a + b, 0);
    });
    return totals;
  }, [heatmapData]);

  return (
    <section className="bg-white border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200/60 transition-all duration-200 rounded-2xl p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Category Heatmap</h2>
          <p className="text-slate-500 text-xs mt-0.5 font-medium">
            Session activity by type — last {WEEKS} weeks
          </p>
        </div>
        <div className="flex items-center gap-3">
          {INTERVIEW_TYPES.map((t) => (
            <div key={t} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: TYPE_COLORS[t] }} />
              <span className="text-xs text-slate-500 font-semibold">{TYPE_LABELS[t]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4 overflow-x-auto">
        {INTERVIEW_TYPES.map((type) => (
          <div key={type} className="flex items-center gap-3">
            <div className="w-20 shrink-0 text-right">
              <span className="text-xs font-bold text-slate-600">{TYPE_LABELS[type]}</span>
              <div className="text-[10px] text-slate-400 font-semibold">{totalByType[type]} total</div>
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="flex gap-0.5">
                {Array.from({ length: WEEKS }).map((_, w) => (
                  <div key={w} className="flex flex-col gap-0.5">
                    {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                      const cell = grid.find((c) => c.week === w && c.dayOfWeek === d);
                      if (!cell) return <div key={d} className="w-3.5 h-3.5" />;
                      const count = heatmapData[type][cell.dateKey] ?? 0;
                      return (
                        <div
                          key={d}
                          className="w-3.5 h-3.5 rounded-sm transition-all duration-200 hover:ring-1 hover:ring-offset-0 hover:ring-blue-400 cursor-default"
                          style={{ backgroundColor: getCellColor(count, type) }}
                          title={`${cell.dateKey}: ${count} session${count !== 1 ? 's' : ''}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}

        <div className="flex items-center gap-3 -mt-2">
          <div className="w-20 shrink-0" />
          <div className="flex gap-0.5">
            {Array.from({ length: WEEKS }).map((_, w) => (
              <div key={w} className="flex flex-col gap-0.5 w-3.5">
                {w % 3 === 0 && (
                  <span className="text-[9px] text-slate-400 font-semibold whitespace-nowrap">
                    W{WEEKS - w}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
