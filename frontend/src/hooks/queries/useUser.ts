'use client';

/**
 * ============================================================================
 * DevMeet Frontend - Candidate Profile & Entitlement Queries (React Query)
 * ============================================================================
 * Manages caching, fetching, and optimistic updates for candidate settings:
 * 1. `useProfile`: Queries detailed candidate profile, bio, skills, and target companies.
 * 2. `useQuota`: Queries remaining daily/monthly interview quotas.
 * 3. `usePlan`: Queries current active plan tier ('free', 'pro', 'enterprise').
 * 4. `useUpdateProfile`: Mutation hook updating candidate profile, invalidating profile
 *    cache, and synchronizing global `AuthContext` state.
 * ============================================================================
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userApi, UserProfileUpdate } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { useAuth } from '@/contexts/AuthContext';

/**
 * React Query hook retrieving candidate profile settings.
 */
export function useProfile() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.profile,
    queryFn: () => userApi.getProfile(),
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
}

/**
 * React Query hook retrieving remaining interview quota allowances.
 */
export function useQuota() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.quota,
    queryFn: () => userApi.getQuota(),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
}

/**
 * React Query hook retrieving active subscription plan tier and feature limits.
 */
export function usePlan() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.plan,
    queryFn: () => userApi.getPlan(),
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
}

/**
 * Mutation hook for updating profile attributes (display name, bio, target companies, skills).
 * Synchronizes both React Query cache and AuthContext identity state upon success.
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();

  return useMutation({
    mutationFn: (updates: UserProfileUpdate) => userApi.updateProfile(updates),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.profile });
      await refreshUser();
    },
  });
}
