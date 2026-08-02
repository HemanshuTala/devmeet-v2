'use client';

import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { useAuth } from '@/contexts/AuthContext';

export function useUserDashboard(days = 90) {
  const { user, isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.analytics.dashboard(user?.id ?? '', days),
    queryFn: () => analyticsApi.getUserDashboard(user!.id, days),
    enabled: isAuthenticated && !!user?.id,
    staleTime: 60_000,
  });
}

export function useUserScoreTrend(days = 30) {
  const { user, isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.analytics.scoreTrend(user?.id ?? '', days),
    queryFn: () => analyticsApi.getUserScoreTrend(user!.id, days),
    enabled: isAuthenticated && !!user?.id,
    staleTime: 60_000,
  });
}
