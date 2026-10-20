/**
 * @file ReadonlyField.tsx
 * @description Non-Editable Form Display Field Component for DevMeet.
 *
 * Used in profile, settings, and modal inspection views:
 * - Displays static text (e.g. system email, generated tokens, account IDs).
 * - Styled consistently with inputs but with a muted `bg-slate-50` background.
 * - Supports an optional leading icon (e.g., Mail, Key, Shield).
 * - Handles multi-line or preformatted text via `whitespace-pre-wrap`.
 *
 * @module components/ReadonlyField
 */

import React from 'react';

/**
 * Props accepted by ReadonlyField.
 */
interface ReadonlyFieldProps {
  /** The text value to display in the read-only box. */
  value: string;
  /** Optional icon displayed to the left of the value. */
  icon?: React.ReactNode;
}

/**
 * ReadonlyField Component.
 *
 * @component
 * @param {ReadonlyFieldProps} props
 * @returns {JSX.Element} Muted non-editable text container.
 */
export default function ReadonlyField({ value, icon }: ReadonlyFieldProps) {
  return (
    <div className="flex items-start gap-2 min-h-[40px] rounded-xl border border-blue-50 bg-slate-50 px-3 py-2.5">
      {/* Optional leading icon */}
      {icon && <span className="mt-0.5 text-slate-400 flex-shrink-0">{icon}</span>}
      {/* Value content */}
      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap font-medium">{value}</p>
    </div>
  );
}
