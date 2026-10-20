'use client';

/**
 * ============================================================================
 * DevMeet Frontend - Administrator Role Gating Hook
 * ============================================================================
 * Client-side heuristic and role checker determining whether the authenticated
 * user has access to administrative oversight tools, user moderation, and platform metrics.
 *
 * Why this exists:
 * - Controls conditional rendering of the "Admin Portal" navigation item in sidebars.
 * - Guards privileged UI routes (`/admin`) prior to backend RBAC enforcement.
 * - Matches Auth Service (`auth-service/app/auth.py`) admin evaluation heuristics:
 *   checks for explicit `role: 'admin' | 'super_admin'` or `@devmeet.com` administrative email domains.
 * ============================================================================
 */

import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Evaluates whether the currently authenticated candidate holds administrative privileges.
 *
 * @returns boolean - True if the user qualifies as an administrator.
 */
export function useIsAdmin(): boolean {
  const { user } = useAuth();

  return useMemo(() => {
    if (!user?.email) return false;
    const email = user.email.toLowerCase();
    const role = (user as { role?: string }).role ?? '';

    // Verify explicit RBAC role or internal operator email domain
    return (
      role === 'admin' ||
      role === 'super_admin' ||
      email === 'admin@devmeet.com' ||
      email.endsWith('@devmeet.com') ||
      email.includes('admin')
    );
  }, [user]);
}
