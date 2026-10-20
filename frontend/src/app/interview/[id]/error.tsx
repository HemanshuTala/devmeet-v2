'use client';

/**
 * @file error.tsx (Interview Studio Route Error Boundary)
 * @description Next.js route-level error boundary capturing runtime crashes within the interview studio.
 * Logs error telemetry, assures the candidate that interview progress is safely auto-saved
 * on the backend orchestrator, and provides immediate options to retry hydration or return to dashboard.
 */

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw, ArrowLeft } from 'lucide-react';

/**
 * InterviewError Component.
 *
 * @param error - The caught runtime JavaScript exception with optional server digest
 * @param reset - Next.js state reset function attempting to re-render the route segment
 */
export default function InterviewError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Report unexpected client errors for diagnostics
  useEffect(() => {
    console.error('Interview error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="text-center max-w-md space-y-4">
        {/* Error icon circle */}
        <div className="w-16 h-16 rounded-full bg-red-50 border border-red-100 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-7 h-7 text-red-500" />
        </div>

        <h2 className="text-xl font-bold text-slate-900">Interview session error</h2>
        <p className="text-sm text-slate-500 font-medium">
          Something went wrong during your interview session. Your progress has been saved automatically.
        </p>

        {/* Action recovery buttons */}
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            Retry
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-sm font-bold rounded-xl transition-colors border border-slate-200 shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
