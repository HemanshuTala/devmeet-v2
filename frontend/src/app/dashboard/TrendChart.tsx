/**
 * @file TrendChart.tsx
 * @description Candidate Performance Trajectory Area Chart for DevMeet Dashboard.
 *
 * Built on `recharts`:
 * - Displays score progression over time via smooth monotone spline area chart (`AreaChart`).
 * - Soft linear blue vertical gradient backdrop fill (`linearGradient id="trendColor"`).
 * - Interactive 30-Day vs 90-Day time horizon toggle.
 * - Custom high-contrast dark tooltip rendering candidate score and formatted timestamp.
 * - Y-axis formatted with percentage symbols bounded to `[0, 100]`.
 *
 * @module app/dashboard/TrendChart
 */

'use client';

import React from 'react';
import { TrendingUp } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

/** Data node for score trends */
interface TrendNode {
  date: string;
  score: number;
}

/**
 * Props accepted by TrendChart.
 */
interface TrendChartProps {
  /** Array of trend data points with date and score. */
  trendData?: TrendNode[];
  /** Alias for trendData. */
  data?: TrendNode[];
  /** Active day horizon selection (30 or 90). */
  trendDays?: number;
  /** Callback fired when user toggles 30d or 90d. */
  setTrendDays?: (days: number) => void;
}

/**
 * TrendChart Component.
 *
 * @component
 * @param {TrendChartProps} props
 * @returns {JSX.Element} Area chart card with time window filters.
 */
export default function TrendChart({ trendData, data, trendDays = 30, setTrendDays }: TrendChartProps) {
  const chartData = trendData || data || [];

  return (
    <div className="lg:col-span-2 bg-white border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200/60 transition-all duration-200 rounded-2xl p-6 flex flex-col gap-4 animate-fade-in-up delay-100">
      {/* Header and 30d/90d Toggle */}
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

        {/* 30 / 90 Days Segmented Button */}
        <div className="flex items-center gap-1 bg-slate-50 border border-slate-150 rounded-xl p-0.5 text-xs">
          <button
            onClick={() => setTrendDays?.(30)}
            className={`px-3 py-1 rounded-lg transition-all duration-200 font-semibold cursor-pointer ${
              trendDays === 30
                ? 'bg-white text-slate-800 border border-slate-200/80 shadow-sm'
                : 'text-slate-400 hover:text-slate-800'
            }`}
          >
            30 Days
          </button>
          <button
            onClick={() => setTrendDays?.(90)}
            className={`px-3 py-1 rounded-lg transition-all duration-200 font-semibold cursor-pointer ${
              trendDays === 90
                ? 'bg-white text-slate-800 border border-slate-200/80 shadow-sm'
                : 'text-slate-400 hover:text-slate-800'
            }`}
          >
            90 Days
          </button>
        </div>
      </div>

      {/* Chart Canvas Area */}
      <div className="h-64 w-full pt-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
            {/* Custom Tooltip */}
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
