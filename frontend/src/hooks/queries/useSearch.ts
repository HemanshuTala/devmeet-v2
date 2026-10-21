'use client';

/**
 * ============================================================================
 * DevMeet Frontend - Question Bank Search Queries (React Query)
 * ============================================================================
 * Coordinates query caching and data fetching for the Question Bank Explorer:
 * 1. `useQuestionSearch`: Fetches paginated, filtered interview problem cards
 *    (by keyword, interview track, difficulty tier, and company).
 * 2. `useRandomQuestion`: Manual query (`enabled: false`) for sampling a random problem.
 * ============================================================================
 */

import { useQuery } from '@tanstack/react-query';
import { searchApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

/**
 * Parameter interface for question bank search queries.
 */
export interface QuestionSearchParams {
  /** Keyword search substring */
  q?: string;
  /** Interview track ('dsa', 'behavioral', 'system_design') */
  interview_type?: string;
  /** Problem difficulty level ('easy', 'medium', 'hard') */
  difficulty?: string;
  /** Targeted enterprise company */
  company?: string;
  /** Page size limit */
  limit?: number;
  /** Pagination offset */
  offset?: number;
}

/**
 * React Query hook for full-text problem discovery in the question bank.
 *
 * @param params - Filter and search criteria.
 * @param enabled - Whether the query is actively enabled (default true).
 */
export function useQuestionSearch(params: QuestionSearchParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.questions.search(params),
    queryFn: () => searchApi.search(params as unknown as Record<string, unknown>),
    enabled,
    staleTime: 5 * 60_000,
    placeholderData: (previousData) => previousData,
  });
}

/**
 * React Query hook for randomly selecting an interview question.
 * Configured with `enabled: false` so it only fires when explicitly refetched.
 *
 * @param interview_type - Optional track constraint.
 * @param difficulty - Optional difficulty constraint.
 * @param company - Optional company constraint.
 */
export function useRandomQuestion(
  interview_type?: string,
  difficulty?: string,
  company?: string
) {
  return useQuery({
    queryKey: queryKeys.questions.random(interview_type, difficulty, company),
    queryFn: () => searchApi.getRandom(interview_type, difficulty, company),
    enabled: false,
  });
}
