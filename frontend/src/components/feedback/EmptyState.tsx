/**
 * @file EmptyState.tsx
 * @description Standard Empty State Placeholder Component for DevMeet.
 *
 * Rendered across lists, tables, and views when no data records are found
 * (e.g., zero interview sessions, empty search query results, empty questions repository):
 * - Displays a centered themed icon badge.
 * - Bold title header and descriptive helper text.
 * - Optional primary call-to-action button (e.g., "Start your first interview").
 *
 * @module components/feedback/EmptyState
 */

import { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Props accepted by the EmptyState component.
 */
interface EmptyStateProps {
  /** Lucide icon component representing the empty category. */
  icon: LucideIcon;
  /** Primary headline summarizing the empty condition. */
  title: string;
  /** Explanatory description guiding the user on next actions. */
  description: string;
  /** Optional button text for primary action (e.g. "Create Session"). */
  actionLabel?: string;
  /** Callback fired when user clicks the action button. */
  onAction?: () => void;
}

/**
 * EmptyState Component.
 *
 * @component
 * @param {EmptyStateProps} props
 * @returns {JSX.Element} Centered empty state illustration and action callout.
 */
export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      {/* Centered Icon Container */}
      <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-blue-600" />
      </div>

      {/* Headline & Description */}
      <h3 className="text-lg font-bold text-slate-900 mb-1">{title}</h3>
      <p className="text-slate-500 text-sm max-w-sm leading-relaxed">{description}</p>

      {/* Optional Call-To-Action Button */}
      {actionLabel && onAction && (
        <Button onClick={onAction} className="mt-6">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
