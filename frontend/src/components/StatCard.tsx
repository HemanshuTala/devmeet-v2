/**
 * @file StatCard.tsx
 * @description KPI Metric Summary Card Component with Trend Badges for DevMeet.
 *
 * Responsibilities:
 * - Displays a high-level statistical metric (e.g. Total Interviews, Average Score, Completion Rate).
 * - Themed icon box using color schemes ('blue' | 'green' | 'purple' | 'orange').
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
    iconBg: '#eff6ff',
    iconColor: '#2563eb',
    iconBorder: '#bfdbfe',
    dot: '#2563eb',
  },
  green: {
    iconBg: '#f0fdf4',
    iconColor: '#16a34a',
    iconBorder: '#bbf7d0',
    dot: '#16a34a',
  },
  purple: {
    iconBg: '#f5f3ff',
    iconColor: '#7c3aed',
    iconBorder: '#ddd6fe',
    dot: '#7c3aed',
  },
  orange: {
    iconBg: '#fff7ed',
    iconColor: '#ea580c',
    iconBorder: '#fed7aa',
    dot: '#ea580c',
  },
};

/**
 * Memoized StatCard Component.
 *
 * @component
 * @param {StatCardProps} props
 * @returns {JSX.Element} Metric card container with icon, typography, and trend pill.
 */
export default React.memo(function StatCard({
  label,
  title,
  value,
  icon: Icon,
  color = 'blue',
  change,
  changePositive,
  trend,
  subtitle,
}: StatCardProps) {
  const c = colorMap[color];
  // Support both label and title prop aliases
  const displayLabel = label ?? title ?? '';
  // Support both explicit change string and numeric trend auto-formatting
  const changeText = change ?? (trend != null ? `${trend > 0 ? '+' : ''}${trend}%` : undefined);
  const isPositive = changePositive ?? (trend != null ? trend >= 0 : undefined);

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e5e5e5',
        borderRadius: 12,
        padding: '20px 20px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        transition: 'box-shadow 0.15s, border-color 0.15s',
      }}
      className="hover:border-[#d0d0d0] hover:shadow-md cursor-default"
    >
      {/* Icon Badge */}
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 10,
          background: c.iconBg,
          border: `1px solid ${c.iconBorder}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon style={{ width: 18, height: 18, color: c.iconColor }} />
      </div>

      {/* Typography & Metrics */}
      <div style={{ minWidth: 0 }}>
        {/* Metric Label */}
        <p
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#999',
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            margin: 0,
            lineHeight: 1,
          }}
        >
          {displayLabel}
        </p>

        {/* Primary Metric Value */}
        <p
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: '#111',
            margin: '6px 0 0',
            lineHeight: 1,
            letterSpacing: '-0.03em',
          }}
        >
          {value}
        </p>

        {/* Optional Change / Trend Pill */}
        {changeText && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              marginTop: 6,
              fontSize: 11,
              fontWeight: 600,
              color: isPositive ? '#16a34a' : '#dc2626',
              background: isPositive ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${isPositive ? '#bbf7d0' : '#fecaca'}`,
              borderRadius: 5,
              padding: '2px 7px',
            }}
          >
            <span>{isPositive ? '↑' : '↓'}</span>
            <span>{changeText}</span>
          </span>
        )}

        {/* Optional Subtitle */}
        {subtitle && (
          <p
            style={{
              fontSize: 12,
              color: '#64748b',
              margin: '6px 0 0',
              lineHeight: 1.3,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
});
