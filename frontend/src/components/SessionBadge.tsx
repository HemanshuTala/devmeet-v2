/**
 * @file SessionBadge.tsx
 * @description Status, Type, and Difficulty Color-Coded Badge Indicator for DevMeet.
 *
 * Maps domain session attributes to standardized visual badges:
 * - `type`: Formats 'dsa', 'behavioral', 'system_design' with blue, cyan, and green color styles.
 * - `difficulty`: Formats 'easy', 'medium', 'hard' with green, yellow, and red color styles.
 * - `status`: Formats 'created', 'active', 'in_progress', 'completed', 'cancelled', 'expired' into title-cased labels.
 *
 * @module components/SessionBadge
 */

import React from 'react';

/** Supported badge categorization domains */
type BadgeVariant = 'type' | 'difficulty' | 'status';

/**
 * Props accepted by the SessionBadge component.
 */
interface SessionBadgeProps {
  /** The domain category of the badge to render ('type' | 'difficulty' | 'status'). */
  variant: BadgeVariant;
  /** Raw attribute string value (e.g. 'system_design', 'medium', 'in_progress'). */
  value: string;
}

/** CSS class lookup for interview types */
const typeClass: Record<string, string> = {
  dsa:           'badge-blue',
  behavioral:    'badge-cyan',
  system_design: 'badge-green',
};

/** User-friendly label formatting for interview types */
const typeLabel: Record<string, string> = {
  dsa:           'DSA',
  behavioral:    'Behavioral',
  system_design: 'System Design',
};

/** CSS class lookup for difficulty levels */
const diffClass: Record<string, string> = {
  easy:   'badge-green',
  medium: 'badge-yellow',
  hard:   'badge-red',
};

/** CSS class lookup for session statuses */
const statusClass: Record<string, string> = {
  created:     'badge-blue',
  active:      'badge-yellow',
  in_progress: 'badge-yellow',
  completed:   'badge-green',
  cancelled:   'badge-red',
  expired:     'badge-red',
};

/**
 * SessionBadge Component.
 *
 * @component
 * @param {SessionBadgeProps} props
 * @returns {JSX.Element} Styled badge pill with formatted display text.
 */
export default function SessionBadge({ variant, value }: SessionBadgeProps) {
  let cls = 'badge-blue';
  let label = value;

  // Resolve styling and human-readable label based on variant
  if (variant === 'type') {
    cls   = typeClass[value] ?? 'badge-blue';
    label = typeLabel[value] ?? value;
  } else if (variant === 'difficulty') {
    cls   = diffClass[value] ?? 'badge-blue';
    label = value.charAt(0).toUpperCase() + value.slice(1);
  } else if (variant === 'status') {
    cls   = statusClass[value] ?? 'badge-blue';
    // Format snake_case to Title Case (e.g. 'in_progress' -> 'In Progress')
    label = value.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  return <span className={cls}>{label}</span>;
}
