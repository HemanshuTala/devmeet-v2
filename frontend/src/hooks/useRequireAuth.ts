'use client';

/**
 * ============================================================================
 * DevMeet Frontend - Client-Side Protected Route Guard Hook
 * ============================================================================
 * Guards candidate-only and administrative views against unauthenticated guest visits.
 *
 * Execution Flow:
 * 1. Checks `isLoading` and `isAuthenticated` from `AuthContext`.
 * 2. If initial auth hydration completes and user is unauthenticated, redirects
 *    the browser to `/login` via `router.replace(redirectTo)`.
 * 3. Uses `.replace()` instead of `.push()` to prevent back-button loops.
 * ============================================================================
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Enforces authentication requirement on a page component.
 *
 * @param redirectTo - Path to navigate unauthenticated users to (default: '/login').
 * @returns Object containing current user profile, auth status, and loading state.
 */
export function useRequireAuth(redirectTo = '/login') {
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuth();

  useEffect(() => {
    // Redirect only after session hydration finishes to prevent flashing login redirects
    if (!isLoading && !isAuthenticated) {
      router.replace(redirectTo);
    }
  }, [isLoading, isAuthenticated, router, redirectTo]);

  return { user, isAuthenticated, isLoading };
}
