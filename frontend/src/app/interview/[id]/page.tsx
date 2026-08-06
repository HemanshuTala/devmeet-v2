'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, X, Lightbulb, Video, Brain } from 'lucide-react';
import { sessionApi, executionApi, userApi, aiApi, analyticsApi, apiClient } from '@/lib/api';
import { speak, stopSpeaking, unlockAudio } from '@/lib/speech';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader } from '@/components/ui/loader';
import DeviceCheckScreen from '@/components/interview/DeviceCheckScreen';

import { LANGUAGE_OPTIONS } from '../constants';
import { turnsToMessages, type ChatMessage } from '../utils';
import InterviewStartScreen from '../InterviewStartScreen';
import InterviewHeader from '../InterviewHeader';
import ChatPanel from '../ChatPanel';
import CodeEditorPanel from '../CodeEditorPanel';
import ViolationModal from '../ViolationModal';
import VideoPanel from '../VideoPanel';
import InterviewTipsPanel from '../InterviewTipsPanel';
import ConfirmModal from '../ConfirmModal';

import { useSessionTimer } from '@/hooks/interview/useSessionTimer';
import { useCheatingDetection } from '@/hooks/interview/useCheatingDetection';
import { useAIStreaming } from '@/hooks/interview/useAIStreaming';
import { useSpeechRecognition } from '@/hooks/interview/useSpeechRecognition';

export default function InterviewRoomPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.id as string;
  const { user } = useAuth();

  // ── Session state ──
  const [session, setSession] = useState<any>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  // ── Chat / input state ──
  const [input, setInput] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);
  const [showHints, setShowHints] = useState(false);
  const [hintLoading, setHintLoading] = useState(false);
  const [sessionPaused, setSessionPaused] = useState(false);
  const isPausedRef = useRef(false);

  // ── Code editor state ──
  const [language, setLanguage] = useState('python');
  const [code, setCode] = useState(LANGUAGE_OPTIONS.python.defaultCode);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmittingCode, setIsSubmittingCode] = useState(false);
  const [userPlan, setUserPlan] = useState('free');
  const [asyncExecution, setAsyncExecution] = useState(true);

  // ── UI state ──
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState('video');
  const [showVideoFeed, setShowVideoFeed] = useState(true);
  const [isMuted, setIsMuted] = useState(false);

  // ── Device check gate ──
  const [deviceCheckDone, setDeviceCheckDone] = useState(false);

  // ── AFK detection ──
  const [showAfkWarning, setShowAfkWarning] = useState(false);
  const afkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetAfkTimer = useCallback(() => {
    if (afkTimerRef.current) clearTimeout(afkTimerRef.current);
    setShowAfkWarning(false);
    afkTimerRef.current = setTimeout(() => setShowAfkWarning(true), 120000);
  }, []);
  useEffect(() => () => { if (afkTimerRef.current) clearTimeout(afkTimerRef.current); }, []);

  const isDSA = session?.interview_type === 'dsa';

  // ── Custom hooks ──
  const timer = useSessionTimer(sessionId);

  const cheating = useCheatingDetection(sessionId, {
    elapsedSeconds: timer.elapsedSeconds,
    stopTimer: timer.stopTimer,
    stopHeartbeat: timer.stopHeartbeat,
    onAutoTerminate: () => router.push(`/interview/${sessionId}/feedback`),
    onSessionUpdate: setSession,
  });

  const streaming = useAIStreaming({
    session,
    isMuted,
    onError: (msg) => setChatError(msg ? 'AI interviewer is temporarily unavailable. Please try again.' : null),
  });

  const speech = useSpeechRecognition();

  // ── Mark body as interview-active (hides mobile blocker, enables fullscreen) ──
  useEffect(() => {
    document.body.classList.add('interview-active');
    return () => {
      document.body.classList.remove('interview-active');
      // Exit fullscreen when leaving the interview route
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  // ── Fullscreen: enter when interview starts, allow exit only after it ends ──
  const enterFullscreen = useCallback(() => {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  }, []);

  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);

  // Prevent user from escaping fullscreen while interview is in progress
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && session?.status === 'in_progress') {
        // Re-enter fullscreen if they accidentally exit during interview
        setTimeout(() => enterFullscreen(), 300);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [session?.status, enterFullscreen]);

  // ── Audio unlock on first gesture ──
  useEffect(() => {
    userApi.getQuota().then((q) => setUserPlan(q.plan)).catch(() => {});
    let unlocked = false;
    const handleGesture = () => {
      if (!unlocked) { unlocked = true; unlockAudio(); document.removeEventListener('click', handleGesture); document.removeEventListener('keydown', handleGesture); }
    };
    document.addEventListener('click', handleGesture);
    document.addEventListener('keydown', handleGesture);
    return () => {
      stopSpeaking();
      document.removeEventListener('click', handleGesture);
      document.removeEventListener('keydown', handleGesture);
      speech.stopRecording();
    };
  }, []);

  // ── Declarative timer sync ──
  useEffect(() => {
    if (session?.status === 'in_progress' && !sessionPaused) {
      if (!timer.timerRef.current) timer.startTimer();
    } else {
      timer.stopTimer();
    }
    return () => timer.stopTimer();
  }, [session?.id, session?.status, sessionPaused]);

  // ── Page visibility: pause on hide, resume on show ──
  useEffect(() => {
    if (!session || (session.status !== 'in_progress' && session.status !== 'paused')) return;
    const handleVisibility = async () => {
      if (document.hidden) {
        speech.stopRecording();
        isPausedRef.current = true;
        setSessionPaused(true);
        timer.stopTimer();
        cheating.triggerCheatingViolation('tab_switch');
        sessionApi.pause(session.id, timer.elapsedSeconds).catch(() => {});
      } else {
        if (!isPausedRef.current) return;
        isPausedRef.current = false;
        try {
          const updated = await sessionApi.resume(session.id);
          setSession(updated);
          if (updated.elapsed_seconds > 0) timer.setElapsedSeconds(updated.elapsed_seconds);
          timer.startTimer();
          setSessionPaused(false);
        } catch {
          setChatError('Failed to auto-resume session.');
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [session, timer.elapsedSeconds]);

  // ── Load session ──
  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      try {
        setPageLoading(true);
        setPageError(null);
        const s = await sessionApi.get(sessionId);
        setSession(s);
        cheating.setTabSwitchCount(s.tab_switch_count || 0);
        cheating.setPasteCount(s.paste_count || 0);
        if (s.status === 'completed' || s.status === 'cancelled') { router.replace('/dashboard'); return; }
        if (s.status === 'created') { setPageLoading(false); return; }
        if (s.status === 'in_progress' || s.status === 'paused') {
          timer.setElapsedSeconds(s.elapsed_seconds || 0);
          try {
            const turns = await sessionApi.getTurns(sessionId);
            if (turns.length > 0) streaming.setMessages(turnsToMessages(turns));
            else streaming.generateQuestion([], s);
          } catch {}
          if (s.status === 'paused') { setSessionPaused(true); isPausedRef.current = true; }
          else timer.startTimer();
          timer.startHeartbeat(sessionId, {
            onAutoComplete: () => router.push(`/interview/${sessionId}/feedback`),
            onAutoCancel: (msg) => setPageError(msg),
          });
        }
      } catch (err: any) {
        setPageError(err?.message || 'Failed to load session.');
      } finally {
        setPageLoading(false);
      }
    })();
    return () => {
      timer.stopTimer();
      timer.stopHeartbeat();
    };
  }, [sessionId]);

  // ── Handlers ──
  const handleStart = useCallback(async () => {
    if (!session) return;
    setIsStarting(true);
    setChatError(null);
    try {
      // Fire session start and first AI question generation in parallel
      const startPromise = sessionApi.start(session.id);
      const questionPromise = streaming.generateQuestion([], session);

      const updated = await startPromise;
      setSession(updated);
      timer.startTimer();
      enterFullscreen(); // Enter fullscreen when interview begins
      timer.startHeartbeat(session.id, {
        onAutoComplete: () => router.push(`/interview/${session.id}/feedback`),
        onAutoCancel: (msg) => setPageError(msg),
      });
      await questionPromise;
    } catch (err: any) {
      setChatError(err?.message || 'Failed to start interview.');
    } finally {
      setIsStarting(false);
    }
  }, [session, timer, streaming, router, enterFullscreen]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || streaming.isAiTyping || !session) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'candidate', content: trimmed, timestamp: new Date() };
    setInput('');
    speech.stopRecording();
    const updated = [...streaming.messages, userMsg];
    streaming.setMessages(updated);
    resetAfkTimer();
    sessionApi.saveTurn(session.id, 'candidate', trimmed).catch(() => {});
    await streaming.generateQuestion(updated);
  }, [input, streaming, session, speech, resetAfkTimer]);

  const handleCancel = useCallback(async () => {
    if (!session) return;
    setIsCancelling(true);
    try {
      await sessionApi.cancel(session.id);
      exitFullscreen(); // Release fullscreen on cancel
      router.push('/dashboard');
    } catch {
      setChatError('Failed to cancel session.');
      setIsCancelling(false);
    }
  }, [session, router, exitFullscreen]);

  const handleEndConfirm = useCallback(async () => {
    if (!session) return;
    setIsEnding(true);
    try {
      await sessionApi.complete(session.id, timer.elapsedSeconds);
      analyticsApi.track('session_completed', user?.id, session.id, { interview_type: session.interview_type, difficulty: session.difficulty, duration_seconds: timer.elapsedSeconds }).catch(() => {});
      timer.stopTimer();
      timer.stopHeartbeat();
      exitFullscreen(); // Release fullscreen when interview ends
      router.push(`/interview/${session.id}/feedback`);
    } catch (err: any) {
      setChatError(err?.message || 'Failed to end interview.');
      setIsEnding(false);
      setShowEndConfirm(false);
    }
  }, [session, router, timer, user?.id, exitFullscreen]);

  const handleRequestHint = useCallback(async () => {
    if (!session || hintLoading) return;
    if (userPlan === 'free') { setChatError('Hints are available on Pro and Enterprise plans.'); return; }
    const lastQ = [...streaming.messages].reverse().find((m) => m.role === 'interviewer');
    if (!lastQ?.content) return;
    setHintLoading(true);
    setChatError(null);
    try {
      const res = await aiApi.getHint({ question: lastQ.content, interview_type: session.interview_type, code_so_far: isDSA ? code : undefined, session_id: session.id });
      if (res.hint) { streaming.setHints((prev) => prev.includes(res.hint) ? prev : [...prev, res.hint]); setShowHints(true); }
    } catch (err: any) {
      setChatError(err?.message || 'Could not fetch hint.');
    } finally {
      setHintLoading(false);
    }
  }, [session, streaming.messages, code, isDSA, hintLoading, userPlan]);

  const handleRunCode = useCallback(async () => {
    setIsRunning(true);
    setExecutionResult(null);
    try {
      const apiLang = language === 'typescript' ? 'javascript' : language;
      const payload = { code, language: apiLang, timeout_seconds: 10, session_id: session?.id };
      let res;
      if (asyncExecution) {
        try { res = await executionApi.executeAsync(payload); }
        catch { res = await executionApi.execute(payload); }
      } else {
        res = await executionApi.execute(payload);
      }
      setExecutionResult({ stdout: res.output, stderr: res.error || '', executionTime: res.execution_time, success: res.success });
    } catch (err: any) {
      setExecutionResult({ stdout: '', stderr: err?.message || 'Execution failed.', executionTime: 0, success: false });
    } finally {
      setIsRunning(false);
    }
  }, [code, language, asyncExecution, session?.id]);

  const handleSubmitCode = useCallback(async () => {
    if (!session || isRunning || isSubmittingCode) return;
    setIsSubmittingCode(true);
    setIsRunning(true);
    setExecutionResult(null);
    setChatError(null);
    try {
      const apiLang = language === 'typescript' ? 'javascript' : language;
      const payload = { code, language: apiLang, timeout_seconds: 10, session_id: session.id };
      let res;
      if (asyncExecution) {
        try { res = await executionApi.executeAsync(payload); }
        catch { res = await executionApi.execute(payload); }
      } else {
        try { res = await executionApi.execute(payload); }
        catch (err: any) { res = { success: false, output: '', error: err?.message || 'Execution failed', execution_time: 0 }; }
      }
      setExecutionResult({ stdout: res.output, stderr: res.error || '', executionTime: res.execution_time || 0, success: res.success });
      setIsRunning(false);
      await sessionApi.submitCode(session.id, language, code);
      const label = LANGUAGE_OPTIONS[language].label;
      const turnContent = `[Submitted Code (${label})]\n\`\`\`${language}\n${code}\n\`\`\`\n\nExecution Status: ${res.success ? 'Success' : 'Failed'}\nOutput:\n${res.output || '(no output)'}\nError:\n${res.error || '(none)'}`;
      const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'candidate', content: `I have submitted my code solution in ${label}.\n\n\`\`\`${language}\n${code}\n\`\`\`\n\nRun Result: ${res.success ? 'Passed' : 'Failed'}`, timestamp: new Date() };
      const updated = [...streaming.messages, userMsg];
      streaming.setMessages(updated);
      sessionApi.saveTurn(session.id, 'candidate', turnContent).catch(() => {});
      await streaming.generateQuestion(updated);
    } catch (err: any) {
      setChatError(err?.message || 'Failed to submit code.');
    } finally {
      setIsSubmittingCode(false);
      setIsRunning(false);
    }
  }, [session, language, code, asyncExecution, isRunning, isSubmittingCode, streaming]);

  const handleLanguageChange = useCallback((lang: string) => {
    setLanguage(lang);
    setCode(LANGUAGE_OPTIONS[lang].defaultCode);
    setExecutionResult(null);
  }, []);

  const handlePause = useCallback(async () => {
    if (!session || sessionPaused) return;
    try { await sessionApi.pause(session.id, timer.elapsedSeconds); timer.stopTimer(); setSessionPaused(true); isPausedRef.current = true; }
    catch (err: any) { setChatError(err?.message || 'Failed to pause session'); }
  }, [session, sessionPaused, timer]);

  const handleResume = useCallback(async () => {
    if (!session || !sessionPaused) return;
    try {
      const updated = await sessionApi.resume(session.id);
      setSession(updated);
      if (updated.elapsed_seconds > 0) timer.setElapsedSeconds(updated.elapsed_seconds);
      timer.startTimer();
      setSessionPaused(false);
      isPausedRef.current = false;
    } catch { setChatError('Failed to resume session. The 30-minute pause window may have expired.'); }
  }, [session, sessionPaused, timer]);

  const handleToggleMute = useCallback(() => {
    if (isMuted) {
      setIsMuted(false);
      const last = streaming.messages[streaming.messages.length - 1];
      if (last?.role === 'interviewer') speak(last.content);
    } else {
      setIsMuted(true);
      stopSpeaking();
    }
  }, [isMuted, streaming.messages]);

  // ── Render: device check gate ──
  if (!deviceCheckDone) {
    return <DeviceCheckScreen onProceed={() => setDeviceCheckDone(true)} sessionMode={session?.interview_type} />;
  }

  // ── Render: loading ──
  if (pageLoading || isStarting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafafa]">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="relative z-10 rounded-2xl border border-[#e5e5e5] bg-white px-12 py-10 flex flex-col items-center"
          style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}
        >
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-7 h-7 rounded-lg bg-[#4f46e5] flex items-center justify-center">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <span className="text-[#111] font-bold text-lg tracking-tight">DevMeet</span>
          </div>
          <Loader size="md" text={isStarting ? 'Setting up your interview room...' : 'Loading session...'} />
        </motion.div>
      </div>
    );
  }

  // ── Render: error ──
  if (pageError || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="bg-white p-8 rounded-2xl border border-rose-250 max-w-md w-full text-center shadow-lg">
          <h2 className="text-slate-900 font-bold text-lg mb-2">Session Error</h2>
          <p className="text-slate-500 text-sm mb-6 leading-relaxed">{pageError ?? 'Session not found.'}</p>
          <button onClick={() => router.push('/dashboard')} className="btn-primary px-6 py-2.5 rounded-xl text-sm font-semibold">Back to Dashboard</button>
        </div>
      </div>
    );
  }

  // ── Render: not started ──
  if (session.status === 'created') {
    return <InterviewStartScreen session={session} isStarting={isStarting} chatError={chatError} onStart={handleStart} onBack={() => router.push('/dashboard')} onCancel={handleCancel} isCancelling={isCancelling} />;
  }

  // ── Render: in progress ──
  return (
    <div className="h-screen bg-[#141422] flex flex-col overflow-hidden text-slate-100">
      <InterviewHeader
        session={session}
        elapsedSeconds={timer.elapsedSeconds}
        sessionPaused={sessionPaused}
        tabSwitchCount={cheating.tabSwitchCount}
        pasteCount={cheating.pasteCount}
        onBack={() => router.push('/dashboard')}
        onPause={handlePause}
        onResume={handleResume}
        onEnd={() => setShowEndConfirm(true)}
      />

      <main className="flex flex-1 overflow-hidden">
        <ChatPanel
          session={session}
          messages={streaming.messages}
          input={input}
          isAiTyping={streaming.isAiTyping}
          chatError={chatError}
          hints={streaming.hints}
          showHints={showHints}
          hintLoading={hintLoading}
          isMuted={isMuted}
          isListening={speech.isListening}
          isTranscribing={speech.isTranscribing}
          userPlan={userPlan}
          showVideoFeed={showVideoFeed}
          user={user}
          isDSA={isDSA}
          onInputChange={setInput}
          onSend={handleSend}
          onToggleMute={handleToggleMute}
          onToggleSpeech={() => speech.toggleSpeechRecognition({
            isAiTyping: streaming.isAiTyping,
            onTranscript: (text) => setInput((prev) => (prev && !prev.endsWith(' ') ? prev + ' ' : prev) + text),
            onError: (msg) => setChatError(msg),
          })}
          onRequestHint={handleRequestHint}
          onToggleHints={() => setShowHints((p) => !p)}
          onHideHints={() => setShowHints(false)}
          onToggleVideoFeed={() => setShowVideoFeed((p) => !p)}
          triggerCheatingViolation={cheating.triggerCheatingViolation}
        />

        {isDSA ? (
          <CodeEditorPanel
            code={code}
            language={language}
            isRunning={isRunning}
            isSubmittingCode={isSubmittingCode}
            executionResult={executionResult}
            onCodeChange={setCode}
            onLanguageChange={handleLanguageChange}
            onRunCode={handleRunCode}
            onSubmitCode={handleSubmitCode}
            onClearResult={() => setExecutionResult(null)}
            triggerCheatingViolation={cheating.triggerCheatingViolation}
          />
        ) : (
          <section className="flex flex-col border-l border-white/10 bg-[#1e1e2e]" style={{ width: '45%' }}>
            <Tabs value={rightPanelTab} onValueChange={setRightPanelTab} className="flex flex-col flex-1 overflow-hidden">
              <div className="bg-[#1a1a2e] flex-shrink-0">
                <TabsList className="w-full h-11 bg-[#1a1a2e] border-b border-white/10 px-4 gap-4 justify-start rounded-none p-0 inline-flex items-center text-slate-500">
                  {['video', 'tips'].map((tab) => (
                    <TabsTrigger
                      key={tab}
                      value={tab}
                      className="relative h-full inline-flex items-center justify-center text-xs font-bold capitalize rounded-none px-1 bg-transparent hover:text-slate-200 data-[state=active]:bg-transparent data-[state=active]:text-indigo-400 data-[state=active]:shadow-none transition-colors border-none outline-none focus-visible:ring-0"
                    >
                      <span className="relative z-10 flex items-center gap-1.5 h-full">
                        {tab === 'video' ? (
                          <><Video className={`w-3.5 h-3.5 transition-colors ${rightPanelTab === 'video' ? 'text-indigo-400' : 'text-slate-500'}`} /><span>Video Feed</span></>
                        ) : (
                          <><Lightbulb className={`w-3.5 h-3.5 transition-colors ${rightPanelTab === 'tips' ? 'text-indigo-400' : 'text-slate-500'}`} /><span>Tips &amp; Guide</span></>
                        )}
                      </span>
                      {rightPanelTab === tab && <motion.div layoutId="right-tab-underline" className="absolute bottom-0 left-0 right-0 h-[2px] bg-indigo-500" transition={{ type: 'spring', stiffness: 380, damping: 34 }} />}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              <AnimatePresence mode="wait">
                {rightPanelTab === 'video' ? (
                  <motion.div key="video" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.22, ease: 'easeOut' }} className="flex-1 overflow-hidden">
                    <VideoPanel sessionId={session.id} userDisplayName={user?.display_name} userId={user?.id} isActive={session.status === 'in_progress'} aiState={streaming.isAiTyping ? 'thinking' : streaming.messages.length > 0 && streaming.messages[streaming.messages.length - 1].role === 'interviewer' ? 'speaking' : 'listening'} onProctorViolation={cheating.triggerCheatingViolation} />
                  </motion.div>
                ) : (
                  <motion.div key="tips" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.22, ease: 'easeOut' }} className="flex-1 overflow-hidden">
                    <InterviewTipsPanel type={session.interview_type} />
                  </motion.div>
                )}
              </AnimatePresence>
            </Tabs>
          </section>
        )}
      </main>

      {/* Modals */}
      {showEndConfirm && (
        <ConfirmModal onConfirm={handleEndConfirm} onCancel={() => setShowEndConfirm(false)} isLoading={isEnding} />
      )}

      {showAfkWarning && session?.status === 'in_progress' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-amber-50 border border-amber-200 rounded-2xl px-6 py-4 flex items-center gap-4 shadow-xl shadow-amber-500/10 max-w-md w-full mx-4">
          <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0"><Clock className="w-5 h-5 text-amber-600" /></div>
          <div className="flex-1">
            <p className="text-amber-800 font-bold text-sm">Still there?</p>
            <p className="text-amber-700 text-xs mt-0.5">No activity detected for 2 minutes. Send a message to continue.</p>
          </div>
          <button onClick={() => { setShowAfkWarning(false); resetAfkTimer(); }} className="text-amber-500 hover:text-amber-700 transition-colors"><X className="w-4 h-4" /></button>
        </motion.div>
      )}

      {cheating.showViolationModal && <ViolationModal message={cheating.violationMessage} onDismiss={cheating.dismissViolation} />}
    </div>
  );
}
