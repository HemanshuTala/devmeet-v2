'use client';

import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/** Matches auth-service verify-admin heuristics for UI gating */
export function useIsAdmin(): boolean {
  const { user } = useAuth();

  return useMemo(() => {
    if (!user?.email) return false;
    const email = user.email.toLowerCase();
    const role = (user as { role?: string }).role ?? '';
    return (
      role === 'admin' ||
      role === 'super_admin' ||
      email === 'admin@devmeet.com' ||
      email.endsWith('@devmeet.com') ||
      email.includes('admin')
    );
  }, [user]);
}
