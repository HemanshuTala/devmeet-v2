'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  Search,
  Filter,
  ChevronLeft,
  Sparkles,
  Building2,
  Tag,
  Play,
  Loader2,
} from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';
import { PageLoader } from '@/components/feedback/PageLoader';
import { ErrorAlert } from '@/components/feedback/ErrorAlert';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useQuestionSearch } from '@/hooks/queries/useSearch';
import { searchApi, SearchQuestion } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import SessionBadge from '@/components/SessionBadge';
import { toast } from 'sonner';

const TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'dsa', label: 'DSA' },
  { value: 'behavioral', label: 'Behavioral' },
  { value: 'system_design', label: 'System Design' },
];

const DIFFICULTY_OPTIONS = [
  { value: '', label: 'All Difficulties' },
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];

function QuestionCard({
  question,
  onPractice,
  practicing,
}: {
  question: SearchQuestion;
  onPractice: (q: SearchQuestion) => void;
  practicing: boolean;
}) {
  return (
    <Card className="hover:shadow-md hover:-translate-y-0.5 hover:border-slate-200 transition-all duration-200 border-slate-100 shadow-sm rounded-2xl bg-white flex flex-col justify-between overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base font-bold text-slate-900 leading-snug">
            {question.title}
          </CardTitle>
          <div className="flex shrink-0 gap-1.5">
            <SessionBadge variant="type" value={question.interview_type} />
            <SessionBadge variant="difficulty" value={question.difficulty} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-600 line-clamp-3 leading-relaxed">{question.description}</p>

        {(question.tags?.length > 0 || question.company_tags?.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {question.tags?.slice(0, 4).map((tag) => (
              <Badge key={tag} variant="muted" className="text-[10px]">
                <Tag className="w-3 h-3 mr-1" />
                {tag}
              </Badge>
            ))}
            {question.company_tags?.slice(0, 2).map((c) => (
              <Badge key={c} variant="pro" className="text-[10px]">
                <Building2 className="w-3 h-3 mr-1" />
                {c}
              </Badge>
            ))}
          </div>
        )}

        <Button
          size="sm"
          className="w-full gap-2 font-semibold"
          onClick={() => onPractice(question)}
          disabled={practicing}
        >
          {practicing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          Practice This Question
        </Button>
      </CardContent>
    </Card>
  );
}

export default function QuestionsPage() {
  const router = useRouter();
  const { isLoading: authLoading } = useRequireAuth();

  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [practicingId, setPracticingId] = useState<string | null>(null);
  const [randomLoading, setRandomLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  const searchParams = useMemo(
    () => ({
      q: debouncedQuery || undefined,
      interview_type: typeFilter || undefined,
      difficulty: difficultyFilter || undefined,
      company: companyFilter || undefined,
      limit: 24,
      offset: 0,
    }),
    [debouncedQuery, typeFilter, difficultyFilter, companyFilter]
  );

  const { data, isLoading, error, refetch, isFetching } = useQuestionSearch(
    searchParams,
    !authLoading
  );

  const questions = data?.questions ?? [];
  const total = data?.total ?? 0;

  const handlePractice = async (question: SearchQuestion) => {
    setPracticingId(question.id);
    try {
      const params = new URLSearchParams({
        type: question.interview_type,
        difficulty: question.difficulty,
        focus: question.title,
      });
      router.push(`/dashboard/create-session?${params.toString()}`);
    } finally {
      setPracticingId(null);
    }
  };

  const handleRandom = async () => {
    setRandomLoading(true);
    try {
      const q = await searchApi.getRandom(typeFilter || undefined, difficultyFilter || undefined);
      await handlePractice(q);
      toast.success('Random question selected!');
    } catch {
      toast.error('Could not fetch a random question.');
    } finally {
      setRandomLoading(false);
    }
  };

  if (authLoading) return (
    <DashboardShell maxWidth="max-w-7xl">
      <div className="flex flex-col gap-6 animate-fade-in">
        <div className="skeleton-shimmer h-9 w-56 rounded-lg" />
        {/* Filter bar skeleton */}
        <div className="flex gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton-shimmer h-10 rounded-lg" style={{ width: i === 0 ? 200 : 130 }} />
          ))}
        </div>
        {/* Question cards skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border p-5 flex flex-col gap-3"
              style={{ background: 'var(--color-bg-card)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="skeleton-shimmer h-5 rounded-md" style={{ width: `${60 + (i % 3) * 20}%` }} />
                <div className="flex gap-1.5 flex-shrink-0">
                  <div className="skeleton-shimmer h-5 w-14 rounded-full" />
                  <div className="skeleton-shimmer h-5 w-16 rounded-full" />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="skeleton-shimmer h-3 w-full rounded-md" />
                <div className="skeleton-shimmer h-3 rounded-md" style={{ width: '83%' }} />
                <div className="skeleton-shimmer h-3 rounded-md" style={{ width: '67%' }} />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="skeleton-shimmer h-6 rounded-full" style={{ width: 50 + j * 15 }} />
                ))}
              </div>
              <div className="skeleton-shimmer h-9 w-full rounded-xl mt-1" />
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  );

  return (
    <DashboardShell maxWidth="max-w-7xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 font-semibold mb-2"
          >
            <ChevronLeft className="w-4 h-4" /> Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="w-8 h-8 text-blue-600" />
            Question Bank
          </h1>
          <p className="text-slate-600 mt-1 text-sm font-medium">
            Browse curated interview questions and jump straight into practice.
          </p>
        </div>
        <Button variant="outline" onClick={handleRandom} disabled={randomLoading} className="gap-2 shrink-0">
          {randomLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Random Question
        </Button>
      </div>

      <div className="bg-white border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200/60 transition-all duration-200 p-6 rounded-2xl grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="relative md:col-span-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
          <input
            type="text"
            placeholder="Search questions, topics, tags…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input-field w-full pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="input-field w-full cursor-pointer text-sm font-semibold"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value || 'all'} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <select
          value={difficultyFilter}
          onChange={(e) => setDifficultyFilter(e.target.value)}
          className="input-field w-full cursor-pointer text-sm font-semibold"
        >
          {DIFFICULTY_OPTIONS.map((o) => (
            <option key={o.value || 'all'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-500 font-medium">
        <span>
          {isFetching && !isLoading ? 'Updating…' : `${total} question${total === 1 ? '' : 's'} found`}
        </span>
        {(query || typeFilter || difficultyFilter || companyFilter) && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setTypeFilter('');
              setDifficultyFilter('');
              setCompanyFilter('');
            }}
            className="text-blue-600 hover:text-blue-700 font-semibold"
          >
            Clear filters
          </button>
        )}
      </div>

      {error && (
        <div className="space-y-3">
          <ErrorAlert message="Failed to load questions. Check that the search service is running." />
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border p-5 flex flex-col gap-3"
              style={{ background: 'var(--color-bg-card)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="skeleton-shimmer h-5 rounded-md" style={{ width: `${60 + (i % 3) * 20}%` }} />
                <div className="flex gap-1.5 flex-shrink-0">
                  <div className="skeleton-shimmer h-5 w-14 rounded-full" />
                  <div className="skeleton-shimmer h-5 w-16 rounded-full" />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="skeleton-shimmer h-3 w-full rounded-md" />
                <div className="skeleton-shimmer h-3 rounded-md" style={{ width: '83%' }} />
                <div className="skeleton-shimmer h-3 rounded-md" style={{ width: '67%' }} />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="skeleton-shimmer h-6 rounded-full" style={{ width: 50 + j * 15 }} />
                ))}
              </div>
              <div className="skeleton-shimmer h-9 w-full rounded-xl mt-1" />
            </div>
          ))}
        </div>
      ) : questions.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No questions found"
          description="Try adjusting your filters or search terms. The question bank may still be seeding in dev mode."
          actionLabel="Start General Practice"
          onAction={() => router.push('/dashboard/create-session')}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {questions.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              onPractice={handlePractice}
              practicing={practicingId === q.id}
            />
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
