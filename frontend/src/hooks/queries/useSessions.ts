'use client';

/**
 * ============================================================================
 * DevMeet Frontend - Interview Session Queries & Mutations (React Query)
 * ============================================================================
 * Coordinates session fetching, turn history loading, and session creation:
 * 1. `useSessions`: Lists all historical sessions for the candidate dashboard.
 * 2. `useSession`: Queries deep state for a specific interview session by UUID.
 * 3. `useSessionTurns`: Loads sequential conversation turns exchanged with the AI.
 * 4. `useCreateSession`: Mutation hook initializing new interviews, auto-invalidating
 *    sessions lists and quota counters, and firing analytics events.
 * ============================================================================
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionApi, CreateSessionRequest, analyticsApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Queries all candidate interview sessions.
 */
export function useSessions() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.sessions.all,
    queryFn: () => sessionApi.list(),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
}

/**
 * Queries detailed state for an individual session.
 *
 * @param sessionId - Target interview session UUID string.
 */
export function useSession(sessionId: string | undefined) {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.sessions.detail(sessionId ?? ''),
    queryFn: () => sessionApi.get(sessionId!),
    enabled: isAuthenticated && !!sessionId,
  });
}

/**
 * Queries conversational dialogue turns exchanged in a session.
 *
 * @param sessionId - Session identifier.
 */
export function useSessionTurns(sessionId: string | undefined) {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.sessions.turns(sessionId ?? ''),
    queryFn: () => sessionApi.getTurns(sessionId!),
    enabled: isAuthenticated && !!sessionId,
  });
}

/**
 * Mutation hook for scheduling and creating a new interview session.
 * Automatically invalidates session lists and quota caches upon creation.
 */
export function useCreateSession() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (data: CreateSessionRequest) => sessionApi.create(data),
    onSuccess: (session) => {
      // Refresh session history list and quota counters
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.quota });
      
      // Dispatch background analytics telemetry event
      analyticsApi.track('session_created', user?.id, session.id, {
        interview_type: session.interview_type,
        difficulty: session.difficulty,
      }).catch(() => {});
    },
  });
}
