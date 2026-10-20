/**
 * @file frontend/src/app/reset-password/page.tsx
 * @description Password Reset Confirmation Page.
 *
 * This client-side page allows users who have received a password reset link (via email)
 * to set a new password. It extracts the security verification token from URL query parameters
 * (`?token=...`), validates that the newly entered password matches requirements and confirmation,
 * dispatches the update request to the Auth Microservice, and transitions the user back to the login screen.
 *
 * Key Architecture & Next.js Patterns:
 * 1. **Suspense Boundary Requirement**: In Next.js App Router (v13+ / v14+), client components
 *    using `useSearchParams()` must be wrapped in `<Suspense>` to avoid de-opting entire pages into client-side rendering.
 * 2. **Client Validation**: Enforces length constraints (minimum 8 characters) and password equivalence before hitting the API.
 * 3. **Success State & Auto-Redirect**: Displays confirmation feedback and schedules an automated route redirect to `/login`.
 */

'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Brain, ChevronLeft, Loader2, CheckCircle } from 'lucide-react';
import { authApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorAlert } from '@/components/feedback/ErrorAlert';

/**
 * ResetPasswordForm Component
 *
 * Inner form component wrapped in `<Suspense>` that extracts the reset token from query parameters,
 * handles input state for new password and confirmation, and calls `authApi.confirmPasswordReset()`.
 */
function ResetPasswordForm() {
  // Navigation hook for programmatic client-side redirects
  const router = useRouter();

  // Search parameters hook to retrieve URL query parameters (e.g., ?token=xyz123)
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  // Form input states
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  // UI state tracking: asynchronous submission loading, error alerts, and operation success
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  /**
   * Handles form submission, performs input validation, and invokes the Auth API.
   *
   * @param {React.FormEvent} e - Form submission event
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate token presence
    if (!token) {
      setError('Invalid or missing reset token. Request a new reset link.');
      return;
    }

    // Validate minimum password length
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    // Validate password confirmation match
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      // Dispatch password reset confirmation request to Auth service
      await authApi.confirmPasswordReset(token, password);
      setSuccess(true);

      // Automatically redirect to login screen after 2.5 seconds so user can sign in
      setTimeout(() => router.push('/login'), 2500);
    } catch (err: unknown) {
      // Surface error message returned by the server or a fallback message
      setError(err instanceof Error ? err.message : 'Failed to reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-blue-100/80 rounded-2xl shadow-2xl shadow-blue-500/5 p-8 md:p-10">
      {/* DevMeet Brand Header */}
      <div className="flex items-center gap-2.5 mb-6">
        <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
          <Brain className="w-5 h-5 text-white" />
        </div>
        <span className="text-xl font-bold text-slate-900">DevMeet</span>
      </div>

      {/* Conditionally render success card OR reset password input form */}
      {success ? (
        <div className="space-y-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto">
            <CheckCircle className="w-7 h-7 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Password updated</h1>
          <p className="text-slate-600 text-sm">Redirecting you to sign in…</p>
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Set new password</h1>
          <p className="text-slate-500 text-sm mb-6">Choose a strong password for your account.</p>

          {/* Error notification banner if request fails or inputs are invalid */}
          {error && <ErrorAlert message={error} className="mb-4" />}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* New Password input field */}
            <div className="space-y-1.5">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                disabled={loading}
              />
            </div>

            {/* Confirm Password input field */}
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat new password"
                disabled={loading}
              />
            </div>

            {/* Submit button with spinning loader during API call */}
            <Button type="submit" className="w-full h-11 font-semibold" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Updating…
                </>
              ) : (
                'Update password'
              )}
            </Button>
          </form>
        </>
      )}
    </div>
  );
}

/**
 * ResetPasswordPage Root Component
 *
 * Serves as the top-level route component providing outer layout styling,
 * back navigation link to login, and a React Suspense boundary wrapping `ResetPasswordForm`.
 */
export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Navigation link to return back to sign in */}
        <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 font-semibold mb-8">
          <ChevronLeft className="w-4 h-4" />
          Back to sign in
        </Link>

        {/* Suspense boundary required for components reading Next.js search parameters */}
        <Suspense
          fallback={
            <div className="bg-white border border-slate-200 rounded-2xl p-8 flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-[#2563eb]" />
            </div>
          }
        >
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
