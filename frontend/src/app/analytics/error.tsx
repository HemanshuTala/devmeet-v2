/**
 * @file error.tsx
 * @description Next.js Segment Error Boundary for the Analytics View.
 *
 * Catches unhandled runtime errors occurring inside the `/analytics` route segment:
 * - Logs errors to console and error-tracking monitoring services.
 * - Prevents the entire application shell or navigation bar from crashing.
 * - Renders a centered error alert card with an instant "Retry" action (`reset()`).
 *
 * @module app/analytics/error
 */

'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/**
 * AnalyticsError Segment Boundary Component.
 *
 * @component
 * @param {Object} props
 * @param {Error & { digest?: string }} props.error - Segment exception instance.
 * @param {() => void} props.reset - Next.js router callback to re-render the segment.
 * @returns {JSX.Element} Recovery card with retry trigger.
 */
export default function AnalyticsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Log segment error for telemetry
  useEffect(() => {
    console.error('Analytics error:', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="text-center max-w-md space-y-4">
        {/* Warning Icon Badge */}
        <div className="w-16 h-16 rounded-full bg-red-50 border border-red-100 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-7 h-7 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Analytics unavailable</h2>
        <p className="text-sm text-slate-500 font-medium">
          Failed to load analytics data. Please try again in a moment.
        </p>
        {/* Retry Button */}
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
          Retry
        </button>
      </div>
    </div>
  );
}
