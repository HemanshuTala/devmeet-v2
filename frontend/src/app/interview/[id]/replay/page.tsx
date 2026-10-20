'use client';

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, MessageSquare, Brain, User, Calendar, ShieldCheck } from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';
import { PageLoader } from '@/components/feedback/PageLoader';
import { ErrorAlert } from '@/components/feedback/ErrorAlert';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useSession, useSessionTurns } from '@/hooks/queries/useSessions';
import { Button } from '@/components/ui/button';
import SessionBadge from '@/components/SessionBadge';

export default function ReplayPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const sessionId = params?.id;
  const { isLoading: authLoading } = useRequireAuth();
  const { data: session, isLoading: sessionLoading, error: sessionError } = useSession(sessionId);
  const { data: turns = [], isLoading: turnsLoading, error: turnsError } = useSessionTurns(sessionId);

  if (authLoading || sessionLoading || turnsLoading) {
    return <PageLoader label="Loading interview replay..." />;
  }

  const error = sessionError || turnsError;

  return (
    <DashboardShell maxWidth="max-w-4xl">
      <main className="mx-auto flex w-full flex-col gap-6 py-6">
        {/* Header bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Interview Replay
              </h1>
              {session && (
                <div className="flex items-center gap-1.5 ml-2">
                  <SessionBadge variant="type" value={session.interview_type} />
                  <SessionBadge variant="difficulty" value={session.difficulty} />
                </div>
              )}
            </div>
            <p className="text-sm text-slate-500 font-medium">
              Review full transcript turns, candidate prompts, and AI interviewer responses.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="self-start sm:self-auto rounded-xl border-slate-200 hover:bg-slate-50 font-semibold"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Sessions
          </Button>
        </div>

        {error ? (
          <ErrorAlert message={error instanceof Error ? error.message : 'Replay could not be loaded.'} />
        ) : null}

        {/* Turns list */}
        <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
          {turns.length ? (
            <div className="divide-y divide-slate-100 p-4 sm:p-6 space-y-4">
              {turns.map((turn: any, index: number) => {
                const isAssistant = turn.role === 'assistant' || turn.role === 'interviewer';
                return (
                  <article
                    key={turn.id || index}
                    className={`pt-4 first:pt-0 flex gap-3.5 ${
                      isAssistant ? 'bg-blue-50/30 -mx-4 -mt-4 px-4 py-4 rounded-xl' : ''
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm ${
                        isAssistant
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 border border-slate-200 text-slate-700'
                      }`}
                    >
                      {isAssistant ? <Brain className="h-4.5 w-4.5" /> : <User className="h-4.5 w-4.5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                        <span className={`font-bold capitalize ${isAssistant ? 'text-blue-700' : 'text-slate-900'}`}>
                          {isAssistant ? 'AI Interviewer' : 'Candidate'}
                        </span>
                        {turn.created_at ? (
                          <span className="text-[11px] text-slate-400 font-medium">
                            {new Date(turn.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                        {turn.content}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                <MessageSquare className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">No Transcript Recorded</h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                No speech or conversation turns were archived for this session yet.
              </p>
            </div>
          )}
        </section>
      </main>
    </DashboardShell>
  );
}
