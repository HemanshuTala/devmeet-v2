/**
 * ============================================================================
 * DevMeet Frontend - TanStack React Query Cache Key Factory
 * ============================================================================
 * Centralizes cache key definitions across the platform for deterministic query
 * caching, automatic background revalidation, and targeted cache invalidations.
 *
 * Why this is necessary:
 * - Prevents string typo bugs across sibling components and mutation hooks.
 * - Supports granular invalidation (e.g. invalidating `queryKeys.sessions.detail(id)`
 *   without purging the global `queryKeys.sessions.all` collection).
 * - Read-only `as const` tuple types preserve literal type safety in TypeScript.
 * ============================================================================
 */

export const queryKeys = {
  /** Candidate personal profile and settings */
  profile: ['profile'] as const,
  /** Usage quota counters (interviews left today / this month) */
  quota: ['quota'] as const,
  /** Active subscription plan tier and billing details */
  plan: ['plan'] as const,
  /** Global platform candidate leaderboard rankings */
  leaderboard: ['leaderboard'] as const,

  /** Interview session queries */
  sessions: {
    /** All historical sessions list for dashboard */
    all: ['sessions'] as const,
    /** Specific session record by UUID */
    detail: (sessionId: string) => ['sessions', sessionId] as const,
    /** Sequential conversation dialogue turns for a session */
    turns: (sessionId: string) => ['sessions', sessionId, 'turns'] as const,
  },

  /** Question bank queries */
  questions: {
    /** Filtered search query results */
    search: (params: Record<string, any>) => ['questions', 'search', params] as const,
    /** Random problem selection for interview initialization */
    random: (interviewType?: string, difficulty?: string) =>
      ['questions', 'random', { interviewType, difficulty }] as const,
  },

  /** Performance analytics queries */
  analytics: {
    /** Comprehensive metrics dashboard over a sliding day window */
    dashboard: (userId: string, days: number) => ['analytics', 'dashboard', userId, days] as const,
    /** Historical score trend chart points */
    scoreTrend: (userId: string, days: number) => ['analytics', 'scoreTrend', userId, days] as const,
  },
} as const;
