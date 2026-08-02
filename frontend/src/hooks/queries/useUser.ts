'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userApi, UserProfileUpdate } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { useAuth } from '@/contexts/AuthContext';

export function useProfile() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.profile,
    queryFn: () => userApi.getProfile(),
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
}

export function useQuota() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.quota,
    queryFn: () => userApi.getQuota(),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
}

export function usePlan() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.plan,
    queryFn: () => userApi.getPlan(),
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
}

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
