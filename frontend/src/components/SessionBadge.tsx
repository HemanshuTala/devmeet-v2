import React from 'react';

type BadgeVariant = 'type' | 'difficulty' | 'status';

interface SessionBadgeProps {
  variant: BadgeVariant;
  value: string;
}

const typeClass: Record<string, string> = {
  dsa:           'badge-indigo',
  behavioral:    'badge-cyan',
  system_design: 'badge-green',
};
const typeLabel: Record<string, string> = {
  dsa:           'DSA',
  behavioral:    'Behavioral',
  system_design: 'System Design',
};
const diffClass: Record<string, string> = {
  easy:   'badge-green',
  medium: 'badge-yellow',
  hard:   'badge-red',
};
const statusClass: Record<string, string> = {
  created:     'badge-indigo',
  active:      'badge-yellow',
  in_progress: 'badge-yellow',
  completed:   'badge-green',
  cancelled:   'badge-red',
  expired:     'badge-red',
};

export default function SessionBadge({ variant, value }: SessionBadgeProps) {
  let cls = 'badge-indigo';
  let label = value;

  if (variant === 'type') {
    cls   = typeClass[value] ?? 'badge-indigo';
    label = typeLabel[value] ?? value;
  } else if (variant === 'difficulty') {
    cls   = diffClass[value] ?? 'badge-indigo';
    label = value.charAt(0).toUpperCase() + value.slice(1);
  } else if (variant === 'status') {
    cls   = statusClass[value] ?? 'badge-indigo';
    label = value.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  return <span className={cls}>{label}</span>;
}
