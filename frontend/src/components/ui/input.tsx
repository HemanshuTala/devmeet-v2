/**
 * ============================================================================
 * DevMeet Frontend - Text Input Component Primitive
 * ============================================================================
 * Standardized single-line text input field used across candidate forms,
 * search boxes, and setting dialogs.
 *
 * Capabilities:
 * - Forwarded ref support (`React.forwardRef`) for React Hook Form integration.
 * - Semantic error ring styling (`error: true` triggers rose-colored validation borders).
 * - Focus-visible ring highlights matching the DevMeet blue design system.
 * ============================================================================
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** When true, highlights input with error border styling */
  error?: boolean;
}

/**
 * Text input component supporting HTML5 input types.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900',
        'placeholder:text-slate-400 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:border-blue-400',
        'disabled:cursor-not-allowed disabled:opacity-50',
        error ? 'border-rose-300 focus-visible:ring-rose-200' : 'border-slate-200 hover:border-slate-300',
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export { Input };
