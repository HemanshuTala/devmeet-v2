'use client';

/**
 * @file loading.tsx (Authentication Flow Loading Skeleton)
 * @description Next.js streaming loading skeleton for authentication routes (/login, /register, /forgot-password).
 * Renders pulse placeholders for the brand logo, header typography, credentials inputs,
 * submission buttons, and social authentication dividers to eliminate layout shifts.
 */

/**
 * AuthLoading Component.
 */
export default function AuthLoading() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="w-full max-w-md mx-auto p-8">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
          {/* Logo brand skeleton */}
          <div className="flex justify-center mb-8">
            <div className="h-8 w-32 bg-slate-200 rounded animate-pulse" />
          </div>

          {/* Heading and subtext skeletons */}
          <div className="h-6 w-40 mx-auto bg-slate-200 rounded animate-pulse mb-2" />
          <div className="h-4 w-56 mx-auto bg-slate-100 rounded animate-pulse mb-8" />

          {/* Form input field skeletons */}
          <div className="space-y-4">
            <div>
              <div className="h-3 w-16 bg-slate-200 rounded animate-pulse mb-2" />
              <div className="h-10 w-full bg-slate-100 border border-slate-200 rounded-lg animate-pulse" />
            </div>
            <div>
              <div className="h-3 w-20 bg-slate-200 rounded animate-pulse mb-2" />
              <div className="h-10 w-full bg-slate-100 border border-slate-200 rounded-lg animate-pulse" />
            </div>
          </div>

          {/* Action button skeleton */}
          <div className="h-10 w-full bg-blue-200 rounded-lg animate-pulse mt-6" />

          {/* Divider rule skeleton */}
          <div className="h-px bg-slate-200 my-6" />

          {/* Social OAuth button skeletons */}
          <div className="space-y-3">
            <div className="h-10 w-full bg-slate-100 border border-slate-200 rounded-lg animate-pulse" />
            <div className="h-10 w-full bg-slate-100 border border-slate-200 rounded-lg animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
