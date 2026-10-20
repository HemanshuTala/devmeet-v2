/**
 * @file StatCard.tsx
 * @description KPI Metric Summary Card Component with Trend Badges for DevMeet.
 *
 * Responsibilities:
 * - Displays a high-level statistical metric (e.g. Total Interviews, Average Score, Completion Rate).
 * - Themed icon box using refined color schemes ('blue' | 'green' | 'purple' | 'orange').
 * - Supports trend indicators with directional arrows (↑ / ↓) and percentage/string badges.
 * - Memoized with `React.memo` to avoid unnecessary re-renders in analytics and dashboard grids.
 *
 * @module components/StatCard
 */

import React from 'react';
import { LucideIcon } from 'lucide-react';

/**
 * Props accepted by the StatCard component.
 */
interface StatCardProps {
  /** Metric category label (e.g., "TOTAL SESSIONS"). */
  label?: string;
  /** Alternative alias for `label`. */
  title?: string;
  /** Primary numeric or formatted metric value (e.g. 42, "87%"). */
  value: string | number;
  /** Lucide icon component to render in the card's badge. */
  icon: LucideIcon;
  /** Color theme palette ('blue' | 'green' | 'purple' | 'orange'). Defaults to 'blue'. */
  color?: 'blue' | 'green' | 'purple' | 'orange';
  /** String representation of change (e.g. "+15% from last week"). */
  change?: string;
  /** Whether the change represents a positive/favorable metric movement (green) or unfavorable (red). */
  changePositive?: boolean;
  /** Numeric delta value used to calculate formatted badge if `change` is omitted (e.g. +12 -> "+12%"). */
  trend?: number;
  /** Optional secondary subtitle or description text below the value. */
  subtitle?: string;
}

/** Color palette definitions for backgrounds, borders, and icon tones */
const colorMap = {
  blue: {
    iconBg: 'bg-blue-50 text-blue-600 border-blue-200/70',
    dot: 'bg-blue-600',
  },
  green: {
    iconBg: 'bg-emerald-50 text-emerald-600 border-emerald-200/70',
    dot: 'bg-emerald-600',
  },
  purple: {
    iconBg: 'bg-purple-50 text-purple-600 border-purple-200/70',
    dot: 'bg-purple-600',
  },
  orange: {
    iconBg: 'bg-amber-50 text-amber-600 border-amber-200/70',
    dot: 'bg-amber-600',
  },
};

/**
 * StatCard Component.
 *
 * Renders an accessible KPI card featuring a rounded icon container, numeric value,
 * uppercase tracking label, and contextual trend indicator.
 *
 * @component
 * @param {StatCardProps} props - Component properties.
 * @returns {JSX.Element} The rendered KPI card.
 */
export const StatCard: React.FC<StatCardProps> = React.memo(function StatCard({
  label,
  title,
  value,
  icon: Icon,
  color = 'blue',
  change,
  changePositive,
  trend,
  subtitle,
}) {
  const displayLabel = label ?? title ?? '';
  const c = colorMap[color] || colorMap.blue;

  // Support both explicit change string and numeric trend auto-formatting
  const changeText = change ?? (trend != null ? `${trend > 0 ? '+' : ''}${trend}%` : undefined);
  const isPositive = changePositive ?? (trend != null ? trend >= 0 : undefined);

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:shadow-md hover:border-slate-300 transition-all duration-200 flex items-start gap-4 group cursor-default">
      {/* Icon Badge */}
      <div
        className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 shadow-xs transition-transform duration-200 group-hover:scale-105 ${c.iconBg}`}
      >
        <Icon className="w-5 h-5" />
      </div>

      {/* Typography & Metrics */}
      <div className="min-w-0 flex-1">
        {/* Metric Label */}
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-1.5">
          {displayLabel}
        </p>

        {/* Primary Metric Value */}
        <p className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
          {value}
        </p>

        {/* Optional Change / Trend Pill */}
        {changeText && (
          <div className="mt-2 flex items-center">
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                isPositive
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200/70'
                  : 'bg-rose-50 text-rose-700 border-rose-200/70'
              }`}
            >
              <span>{isPositive ? '↑' : '↓'}</span>
              <span>{changeText}</span>
            </span>
          </div>
        )}

        {/* Optional Subtitle */}
        {subtitle && (
          <p className="text-xs text-slate-500 mt-1.5 leading-snug">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
});

export default StatCard;
