'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionApi, CreateSessionRequest, analyticsApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { useAuth } from '@/contexts/AuthContext';

export function useSessions() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.sessions.all,
    queryFn: () => sessionApi.list(),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
}

export function useSession(sessionId: string | undefined) {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.sessions.detail(sessionId ?? ''),
    queryFn: () => sessionApi.get(sessionId!),
    enabled: isAuthenticated && !!sessionId,
  });
}

export function useSessionTurns(sessionId: string | undefined) {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.sessions.turns(sessionId ?? ''),
    queryFn: () => sessionApi.getTurns(sessionId!),
    enabled: isAuthenticated && !!sessionId,
  });
}

export function useCreateSession() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (data: CreateSessionRequest) => sessionApi.create(data),
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.quota });
      analyticsApi.track('session_created', user?.id, session.id, {
        interview_type: session.interview_type,
        difficulty: session.difficulty,
      }).catch(() => {});
    },
  });
}
