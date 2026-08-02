export const queryKeys = {
  profile: ['profile'] as const,
  quota: ['quota'] as const,
  plan: ['plan'] as const,
  sessions: {
    all: ['sessions'] as const,
    detail: (sessionId: string) => ['sessions', sessionId] as const,
    turns: (sessionId: string) => ['sessions', sessionId, 'turns'] as const,
  },
  questions: {
    search: (params: Record<string, any>) => ['questions', 'search', params] as const,
    random: (interviewType?: string, difficulty?: string) => ['questions', 'random', { interviewType, difficulty }] as const,
  },
  analytics: {
    dashboard: (userId: string, days: number) => ['analytics', 'dashboard', userId, days] as const,
    scoreTrend: (userId: string, days: number) => ['analytics', 'scoreTrend', userId, days] as const,
  },
} as const;
