'use client';

/**
 * ============================================================================
 * DevMeet Frontend - Analytics & Metric Data Queries (React Query)
 * ============================================================================
 * Manages caching, stale time invalidation, and data retrieval for candidate
 * performance metrics, score trends, and category radar distributions.
 *
 * Hooks:
 * 1. `useUserDashboard`: Queries candidate 90-day analytics summaries (streak calendars,
 *    average scores, pass rates, total interview hours).
 * 2. `useUserScoreTrend`: Queries historical score progression points across chronological sessions.
 * ============================================================================
 */

import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Queries aggregated dashboard analytics for the active candidate over a sliding window.
 *
 * @param days - Number of days to look back (default 90).
 * @returns TanStack query result containing metric distributions.
 */
export function useUserDashboard(days = 90) {
  const { user, isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.analytics.dashboard(user?.id ?? '', days),
    queryFn: () => analyticsApi.getUserDashboard(user!.id, days),
    // Execute query only when candidate is authenticated and has a resolved UUID
    enabled: isAuthenticated && !!user?.id,
    staleTime: 60_000, // 1 minute fresh cache
  });
}

/**
 * Queries historical score trend points for rendering line and area charts.
 *
 * @param days - Time window in days (default 30).
 * @returns TanStack query result containing chronological score data points.
 */
export function useUserScoreTrend(days = 30) {
  const { user, isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.analytics.scoreTrend(user?.id ?? '', days),
    queryFn: () => analyticsApi.getUserScoreTrend(user!.id, days),
    enabled: isAuthenticated && !!user?.id,
    staleTime: 60_000,
  });
}
