'use client';

import React from 'react';
import { TrendingUp } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface TrendNode {
  date: string;
  score: number;
}

interface TrendChartProps {
  trendData: TrendNode[];
  trendDays: 30 | 90;
  setTrendDays: (days: 30 | 90) => void;
}

export default function TrendChart({ trendData, trendDays, setTrendDays }: TrendChartProps) {
  return (
    <div className="lg:col-span-2 bg-white border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200/60 transition-all duration-200 rounded-2xl p-6 flex flex-col gap-4 animate-fade-in-up delay-100">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-slate-900 font-bold text-lg flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            Performance Trend
          </h3>
          <p className="text-slate-500 text-xs mt-0.5 font-medium">
            Average mock evaluation scores over time
          </p>
        </div>
        <div className="flex items-center gap-1 bg-slate-50 border border-slate-150 rounded-xl p-0.5 text-xs">
          <button
            onClick={() => setTrendDays(30)}
            className={`px-3 py-1 rounded-lg transition-all duration-200 font-semibold ${
              trendDays === 30
                ? 'bg-white text-slate-800 border border-slate-200/80 shadow-sm'
                : 'text-slate-400 hover:text-slate-850'
            }`}
          >
            30 Days
          </button>
          <button
            onClick={() => setTrendDays(90)}
            className={`px-3 py-1 rounded-lg transition-all duration-200 font-semibold ${
              trendDays === 90
                ? 'bg-white text-slate-800 border border-slate-200/80 shadow-sm'
                : 'text-slate-400 hover:text-slate-850'
            }`}
          >
            90 Days
          </button>
        </div>
      </div>

      <div className="h-64 w-full pt-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="trendColor" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <XAxis 
              dataKey="date" 
              stroke="#94a3b8" 
              fontSize={10} 
              tickLine={false} 
              axisLine={false} 
              dy={10}
            />
            <YAxis 
              stroke="#94a3b8" 
              fontSize={10} 
              tickLine={false} 
              axisLine={false} 
              domain={[0, 100]}
              tickFormatter={(val) => `${val}%`}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-800 text-xs font-semibold">
                      <p className="text-slate-400">{payload[0].payload.date}</p>
                      <p className="text-blue-400 mt-1">Score: {payload[0].value}%</p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Area
              type="monotone"
              dataKey="score"
              stroke="#2563eb"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#trendColor)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
