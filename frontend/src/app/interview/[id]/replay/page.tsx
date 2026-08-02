'use client';

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';
import { PageLoader } from '@/components/feedback/PageLoader';
import { ErrorAlert } from '@/components/feedback/ErrorAlert';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useSession, useSessionTurns } from '@/hooks/queries/useSessions';
import { Button } from '@/components/ui/button';

export default function ReplayPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const sessionId = params?.id;
  const { isLoading: authLoading } = useRequireAuth();
  const { data: session, isLoading: sessionLoading, error: sessionError } = useSession(sessionId);
  const { data: turns = [], isLoading: turnsLoading, error: turnsError } = useSessionTurns(sessionId);

  if (authLoading || sessionLoading || turnsLoading) {
    return <PageLoader label="Loading replay" />;
  }

  const error = sessionError || turnsError;

  return (
    <DashboardShell>
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">Interview Replay</h1>
            <p className="mt-1 text-sm text-slate-500">
              {session?.interview_type || 'Interview'} · {session?.difficulty || 'practice'}
            </p>
          </div>
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>

        {error ? <ErrorAlert message={error instanceof Error ? error.message : 'Replay could not be loaded.'} /> : null}

        <section className="rounded-lg border border-slate-200 bg-white">
          {turns.length ? (
            <div className="divide-y divide-slate-100">
              {turns.map((turn: any) => (
                <article key={turn.id} className="flex gap-3 p-4">
                  <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-medium capitalize text-slate-900">{turn.role}</span>
                      {turn.created_at ? <span>{new Date(turn.created_at).toLocaleString()}</span> : null}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{turn.content}</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="flex min-h-48 items-center justify-center px-4 text-sm text-slate-500">
              No transcript turns were saved for this session.
            </div>
          )}
        </section>
      </main>
    </DashboardShell>
  );
}
