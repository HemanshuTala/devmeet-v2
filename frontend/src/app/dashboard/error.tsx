/**
 * @file error.tsx
 * @description Next.js Segment Error Boundary for `/dashboard`.
 *
 * Traps runtime rendering errors thrown within the dashboard root segment:
 * - Logs errors for debugging and application telemetry.
 * - Displays a user-friendly error card rather than failing the entire browser viewport.
 * - Provides a "Try Again" recovery action (`reset()`) to re-attempt rendering.
 *
 * @module app/dashboard/error
 */

'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/**
 * DashboardError Component.
 *
 * @component
 * @param {Object} props
 * @param {Error & { digest?: string }} props.error - Segment runtime exception.
 * @param {() => void} props.reset - Next.js router callback to re-evaluate the failed segment.
 * @returns {JSX.Element}
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="text-center max-w-md space-y-4">
        {/* Warning Icon Badge */}
        <div className="w-16 h-16 rounded-full bg-red-50 border border-red-100 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-7 h-7 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Something went wrong</h2>
        <p className="text-sm text-slate-500 font-medium">
          An error occurred while loading the dashboard. This may be a temporary issue.
        </p>
        {/* Reset Trigger */}
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
          Try Again
        </button>
      </div>
    </div>
  );
}
