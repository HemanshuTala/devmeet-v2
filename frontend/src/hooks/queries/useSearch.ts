'use client';

import { useQuery } from '@tanstack/react-query';
import { searchApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export interface QuestionSearchParams {
  q?: string;
  interview_type?: string;
  difficulty?: string;
  company?: string;
  limit?: number;
  offset?: number;
}

export function useQuestionSearch(params: QuestionSearchParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.questions.search(params),
    queryFn: () => searchApi.search(params),
    enabled,
    staleTime: 60_000,
  });
}

export function useRandomQuestion(interview_type?: string, difficulty?: string) {
  return useQuery({
    queryKey: queryKeys.questions.random(interview_type, difficulty),
    queryFn: () => searchApi.getRandom(interview_type, difficulty),
    enabled: false,
  });
}
