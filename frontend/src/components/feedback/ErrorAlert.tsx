/**
 * @file ErrorAlert.tsx
 * @description Accessible Inline Alert Notification Banner for DevMeet.
 *
 * Used throughout forms and dashboard views to communicate error and warning conditions:
 * - Implements ARIA `role="alert"` for screen reader announcements.
 * - Supports two visual variants:
 *   - `'error'`: Rose-red border and background for hard errors and failures.
 *   - `'warning'`: Amber border and background for cautions and non-fatal warnings.
 * - Optional title headline above detailed descriptive error text.
 *
 * @module components/feedback/ErrorAlert
 */

import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Props accepted by ErrorAlert.
 */
interface ErrorAlertProps {
  /** Optional bold title heading for the alert. */
  title?: string;
  /** Explanatory message text. */
  message: string;
  /** Optional custom CSS classes. */
  className?: string;
  /** Visual theme variant ('error' | 'warning'). Defaults to 'error'. */
  variant?: 'error' | 'warning';
}

/**
 * ErrorAlert Component.
 *
 * @component
 * @param {ErrorAlertProps} props
 * @returns {JSX.Element} Themed alert box with icon and formatted message.
 */
export function ErrorAlert({ title, message, className, variant = 'error' }: ErrorAlertProps) {
  // Determine color theme based on variant
  const styles =
    variant === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-900'
      : 'border-rose-200 bg-rose-50 text-rose-900';

  return (
    <div
      role="alert"
      className={cn('flex items-start gap-3 rounded-xl border p-4 text-sm', styles, className)}
    >
      {/* Warning / Error indicator icon */}
      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden />

      {/* Alert content */}
      <div>
        {title && <p className="font-bold mb-0.5">{title}</p>}
        <p className="leading-relaxed opacity-90">{message}</p>
      </div>
    </div>
  );
}
