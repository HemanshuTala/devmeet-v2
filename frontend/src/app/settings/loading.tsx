/**
 * @file frontend/src/app/settings/loading.tsx
 * @description Next.js Route Loading Skeleton for Settings Page.
 *
 * This file is automatically rendered by the Next.js App Router as a streaming fallback
 * while user profile preferences, notification configs, and security settings are being loaded.
 * It renders animated pulse skeletons for page headings, category cards, and toggle switches
 * to prevent layout shift (CLS).
 */

'use client';

/**
 * SettingsLoading Component
 *
 * Renders an accessible skeleton placeholder matching the layout of the settings page:
 * - Header skeleton
 * - Three placeholder setting section cards, each with placeholder toggle switches
 *
 * @returns {JSX.Element} The rendered loading skeleton view
 */
export default function SettingsLoading() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Title skeleton */}
        <div className="h-7 w-24 bg-slate-200 rounded animate-pulse mb-6" />

        {/* Section cards skeleton */}
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-2xl p-6 mb-4">
            {/* Section card title */}
            <div className="h-5 w-40 bg-slate-200 rounded animate-pulse mb-4" />

            {/* List of toggle switches skeleton */}
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex items-center justify-between">
                  <div>
                    {/* Toggle label skeleton */}
                    <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" />
                    {/* Toggle description skeleton */}
                    <div className="h-3 w-48 bg-slate-100 rounded mt-1 animate-pulse" />
                  </div>
                  {/* Switch pill skeleton */}
                  <div className="h-6 w-10 bg-slate-200 rounded-full animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
