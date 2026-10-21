'use client';

/**
 * @file page.tsx (Interview Room Studio Master Orchestrator)
 * @description Master container component for the live AI mock interview experience.
 * Coordinates the full interview lifecycle from pre-flight hardware calibration to post-interview scorecard generation:
 *
 * 1. Pre-Flight Device Check (`DeviceCheckScreen`):
 *    Verifies camera, microphone, and browser support before granting room access.
 * 2. Start Screen Lobby (`InterviewStartScreen`):
 *    Displays session specs, calibration diagnostics, and initiates room startup.
 * 3. Studio Launching Splash (`StudioLaunchingScreen`):
 *    Smooth animated transition while transitioning backend session to `in_progress`.
 * 4. Active Interview Studio:
 *    - Fullscreen enforcement and blur/tab-switch anti-cheating monitoring (`useCheatingDetection`).
 *    - Bidirectional AI conversational turns with SSE token streaming (`useAIStreaming`).
 *    - Speech recognition (STT) and voice synthesis (TTS) integration (`useSpeechRecognition`, `speak`).
 *    - Dynamic layout switching:
 *      * DSA / Coding mode: Left split = Chat & compact video; Right split = Microsoft Monaco Editor & sandbox runner.
 *      * Behavioral / System Design: Left split = Chat; Right split = Tabs (Full WebRTC Video & AI Avatar / Strategy Tips).
 *    - Code sandbox compilation and test execution via Docker microservice (`executionApi`).
 *    - Automated AFK detection (2-minute idle alert).
 *    - Periodic keepalive heartbeat and declarative session timer (`useSessionTimer`).
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, X, Lightbulb, Video, Brain } from 'lucide-react';
import { toast } from 'sonner';
import { sessionApi, executionApi, userApi, aiApi, analyticsApi, apiClient } from '@/lib/api';
import { speak, stopSpeaking, unlockAudio } from '@/lib/speech';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader } from '@/components/ui/loader';
import DeviceCheckScreen from '@/components/interview/DeviceCheckScreen';

import { LANGUAGE_OPTIONS } from '../constants';
import { turnsToMessages, type ChatMessage } from '../utils';
import InterviewStartScreen from '../InterviewStartScreen';
import StudioLaunchingScreen from '../StudioLaunchingScreen';
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

/**
 * InterviewRoomPage Component.
 * The primary workspace connecting candidate inputs, AI streaming, and proctoring.
 */
export default function InterviewRoomPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.id as string;
  const { user } = useAuth();

  // ── Session metadata state ──
  const [session, setSession] = useState<any>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  // ── Chat & conversational state ──
  const [input, setInput] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);
  const [showHints, setShowHints] = useState(false);
  const [hintLoading, setHintLoading] = useState(false);
  const [sessionPaused, setSessionPaused] = useState(false);
  const isPausedRef = useRef(false);
  const speechBaseTextRef = useRef('');

  // ── In-browser code editor & execution state ──
  const [language, setLanguage] = useState('python');
  const [code, setCode] = useState(LANGUAGE_OPTIONS.python.defaultCode);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmittingCode, setIsSubmittingCode] = useState(false);
  const [userPlan, setUserPlan] = useState('free');
  const [asyncExecution, setAsyncExecution] = useState(true);

  // ── UI modal & workflow flags ──
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState('video');
  const [showVideoFeed, setShowVideoFeed] = useState(true);
  const [isMuted, setIsMuted] = useState(false);

  // ── Pre-flight device check gate ──
  const [deviceCheckDone, setDeviceCheckDone] = useState(false);

  // ── Idle / AFK Detection Timer (triggers warning if user is idle > 2 minutes) ──
  const [showAfkWarning, setShowAfkWarning] = useState(false);
  const afkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Resets the 2-minute inactivity timer whenever user types, speaks, or runs code.
   */
  const resetAfkTimer = useCallback(() => {
    if (afkTimerRef.current) clearTimeout(afkTimerRef.current);
    setShowAfkWarning(false);
    afkTimerRef.current = setTimeout(() => setShowAfkWarning(true), 120000);
  }, []);

  useEffect(() => () => { if (afkTimerRef.current) clearTimeout(afkTimerRef.current); }, []);

  const isDSA = session?.interview_type === 'dsa';

  // ── Custom Hooks ──
  // Timer & heartbeat keepalive
  const timer = useSessionTimer(sessionId);

  // Anti-cheating & proctoring (tab-switch and paste event listener)
  const cheating = useCheatingDetection(sessionId, {
    elapsedSeconds: timer.elapsedSeconds,
    stopTimer: timer.stopTimer,
    stopHeartbeat: timer.stopHeartbeat,
    onAutoTerminate: () => router.push(`/interview/${sessionId}/feedback`),
    onSessionUpdate: setSession,
  });

  // LLM conversational streaming via SSE/WebSocket
  const streaming = useAIStreaming({
    session,
    isMuted,
    onError: (msg) => setChatError(msg ? 'AI interviewer is temporarily unavailable. Please try again.' : null),
  });

  // Browser Web Speech API hook
  const speech = useSpeechRecognition();

  // ── Body class marking: locks scroll and hides global mobile blockers ──
  useEffect(() => {
    document.body.classList.add('interview-active');
    return () => {
      document.body.classList.remove('interview-active');
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  // ── Fullscreen API Management ──
  const enterFullscreen = useCallback(() => {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  }, []);

  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);

  const [isFullscreen, setIsFullscreen] = useState(true);

  // Monitor fullscreen change events to surface the recovery banner if candidate leaves fullscreen
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // ── Audio Context Unlock: Enables TTS auto-play on first user interaction ──
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

  // ── Synchronize timer with session lifecycle state ──
  useEffect(() => {
    if (session?.status === 'in_progress' && !sessionPaused) {
      if (!timer.timerRef.current) timer.startTimer();
    } else {
      timer.stopTimer();
    }
    return () => timer.stopTimer();
  }, [session?.id, session?.status, sessionPaused]);

  // ── Visibility Change Listener: Auto-pause session when candidate leaves tab ──
  useEffect(() => {
    if (!session || (session.status !== 'in_progress' && session.status !== 'paused')) return;
    const handleVisibility = async () => {
      if (document.hidden) {
        // Tab hidden or blurred: record cheating violation and pause session
        speech.stopRecording();
        isPausedRef.current = true;
        setSessionPaused(true);
        timer.stopTimer();
        cheating.triggerCheatingViolation('tab_switch');
        sessionApi.pause(session.id, timer.elapsedSeconds).catch(() => {});
      } else {
        // Tab regained focus: attempt seamless resumption
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

  // ── Session Data Fetching & Hydration on Initial Mount ──
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

        // Redirect already-finished sessions to feedback; cancelled to dashboard
        if (s.status === 'completed') {
          router.replace(`/interview/${sessionId}/feedback`);
          return;
        }
        if (s.status === 'cancelled') {
          router.replace('/dashboard');
          return;
        }

        // Fresh session waiting for user to click Start
        if (s.status === 'created') {
          setPageLoading(false);
          return;
        }

        // Active or paused session: hydrate conversation history and start heartbeat
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

  // ── Workflow Action Handlers ──

  /**
   * Starts the interview session from the lobby start screen.
   * Requests fullscreen, triggers API status change, and kicks off AI question generation with zero artificial latency.
   */
  const handleStart = useCallback(async () => {
    if (!session) return;
    setChatError(null);
    enterFullscreen(); // User gesture required for browser fullscreen

    // Optimistically update session status to in_progress to open studio instantly
    const optimisticallyUpdated = { ...session, status: 'in_progress' };
    setSession(optimisticallyUpdated);
    setIsStarting(false);

    // Start timer and keepalive heartbeat immediately
    timer.startTimer();
    timer.startHeartbeat(session.id, {
      onAutoComplete: () => router.push(`/interview/${session.id}/feedback`),
      onAutoCancel: (msg) => setPageError(msg),
    });

    // Fire question generation immediately in parallel with backend state transition
    streaming.generateQuestion([], optimisticallyUpdated).catch((err: any) => {
      setChatError(err?.message || 'Failed to generate initial question. Click Retry.');
    });

    // Confirm state transition on backend asynchronously
    sessionApi.start(session.id).then((confirmed) => {
      setSession(confirmed);
    }).catch((err: any) => {
      setChatError(err?.message || 'Failed to sync session start with server.');
    });
  }, [session, timer, streaming, router, enterFullscreen]);

  /**
   * Sends candidate's typed or spoken message to the AI interviewer.
   */
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

  /**
   * Cancels a pending or active session and navigates back to dashboard.
   */
  const handleCancel = useCallback(async () => {
    if (!session) return;
    setIsCancelling(true);
    try {
      await sessionApi.cancel(session.id);
      exitFullscreen();
      router.push('/dashboard');
    } catch {
      setChatError('Failed to cancel session.');
      setIsCancelling(false);
    }
  }, [session, router, exitFullscreen]);

  /**
   * Confirms early interview termination, calls completion API, and routes to scorecard report.
   */
  const handleEndConfirm = useCallback(async () => {
    if (!session) return;
    setIsEnding(true);
    try {
      await sessionApi.complete(session.id, timer.elapsedSeconds);
    } catch (err: any) {
      // If already completed (idempotent), treat as success and redirect to feedback
      const alreadyDone =
        session.status === 'completed' ||
        (err?.status === 400 && typeof err?.message === 'string' &&
          err.message.toLowerCase().includes('invalid state'));
      if (!alreadyDone) {
        setChatError(err?.message || 'Failed to end interview.');
        setIsEnding(false);
        setShowEndConfirm(false);
        return;
      }
    }
    // Success or already-completed — navigate to feedback
    analyticsApi.track('session_completed', user?.id, session.id, {
      interview_type: session.interview_type,
      difficulty: session.difficulty,
      duration_seconds: timer.elapsedSeconds,
    }).catch(() => {});
    timer.stopTimer();
    timer.stopHeartbeat();
    exitFullscreen();
    router.push(`/interview/${session.id}/feedback`);
  }, [session, router, timer, user?.id, exitFullscreen]);

  /**
   * Requests progressive AI hints without spoiling the complete solution.
   */
  const handleRequestHint = useCallback(async () => {
    if (!session || hintLoading) return;
    const lastQ = [...streaming.messages].reverse().find((m) => m.role === 'interviewer');
    const questionText = lastQ?.content || 'Data structures and algorithms coding challenge';
    setHintLoading(true);
    setChatError(null);

    // Free tier: provide complimentary practice hint without navigating away or breaking fullscreen
    if (userPlan === 'free') {
      const freeHint = isDSA
        ? 'Practice Hint: Consider using a hash map to achieve O(n) lookup time by storing previously seen values.'
        : 'Practice Hint: Structure your response around trade-offs, constraints, and edge cases.';
      streaming.setHints((prev) => (prev.includes(freeHint) ? prev : [...prev, freeHint]));
      setShowHints(true);
      toast.info('Complimentary practice hint unlocked. Upgrade to Pro for unlimited dynamic AI hints!');
      setHintLoading(false);
      return;
    }

    try {
      const res = await aiApi.getHint({
        question: questionText,
        interview_type: session.interview_type,
        code_so_far: isDSA ? code : undefined,
        session_id: session.id,
      });
      if (res && res.hint) {
        streaming.setHints((prev) => (prev.includes(res.hint) ? prev : [...prev, res.hint]));
        setShowHints(true);
      }
    } catch {
      // High-quality contextual fallback hint so candidate is never blocked
      const fallbackHint = isDSA
        ? 'Consider using a hash map to achieve O(n) lookup time by storing complement values.'
        : 'Structure your explanation with trade-offs, constraints, and edge cases.';
      streaming.setHints((prev) => (prev.includes(fallbackHint) ? prev : [...prev, fallbackHint]));
      setShowHints(true);
    } finally {
      setHintLoading(false);
    }
  }, [session, streaming.messages, code, isDSA, hintLoading, userPlan]);

  /**
   * Dispatches code execution to the Docker sandbox (used by "Run" button).
   */
  const handleRunCode = useCallback(async (customTestCases?: any[]) => {
    setIsRunning(true);
    setExecutionResult(null);
    try {
      const apiLang = language === 'typescript' ? 'javascript' : language;
      if (customTestCases && customTestCases.length > 0) {
        const payload = {
          code,
          language: apiLang,
          test_cases: customTestCases.map((tc, idx) => ({
            input: tc.input,
            expected_output: tc.expected,
            name: tc.name || `Case ${idx + 1}`,
            is_hidden: false,
          })),
          timeout_seconds: 10,
        };
        const testRes = await executionApi.runTests(payload);
        if (testRes.success) {
          setExecutionResult({
            stdout: testRes.results?.map((r: any) => `[${r.name || 'Test'}] ${r.passed ? 'PASSED' : 'FAILED'} (Output: ${r.actual_output})`).join('\n') || '',
            stderr: testRes.error || '',
            executionTime: Math.round(testRes.total_execution_time * 1000),
            success: testRes.all_passed,
            testResults: testRes.results,
          });
          return;
        }
      }

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

  /**
   * Submits candidate's completed code solution to the AI interviewer for review and follow-up.
   */
  const handleSubmitCode = useCallback(async (customTestCases?: any[]) => {
    if (!session || isRunning || isSubmittingCode) return;
    setIsSubmittingCode(true);
    setIsRunning(true);
    setExecutionResult(null);
    setChatError(null);
    try {
      const apiLang = language === 'typescript' ? 'javascript' : language;
      let testSummary = '';
      let testPassedCount = 0;
      let totalTests = 0;
      let executionTimeMs = 0;

      if (customTestCases && customTestCases.length > 0) {
        try {
          const testRes = await executionApi.runTests({
            code,
            language: apiLang,
            test_cases: customTestCases.map((tc, idx) => ({
              input: tc.input,
              expected_output: tc.expected,
              name: tc.name || `Case ${idx + 1}`,
              is_hidden: false,
            })),
            timeout_seconds: 10,
          });
          if (testRes.success) {
            testPassedCount = testRes.passed;
            totalTests = testRes.total;
            executionTimeMs = Math.round(testRes.total_execution_time * 1000);
            testSummary = `${testPassedCount}/${totalTests} Test Cases Passed (${executionTimeMs}ms)`;
            setExecutionResult({
              stdout: testRes.results?.map((r: any) => `[${r.name || 'Test'}] ${r.passed ? 'PASSED' : 'FAILED'} (Output: ${r.actual_output})`).join('\n') || '',
              stderr: testRes.error || '',
              executionTime: executionTimeMs,
              success: testRes.all_passed,
              testResults: testRes.results,
            });
          }
        } catch (e) {
          console.warn('Test suite execution error:', e);
        }
      }

      await sessionApi.submitCode(session.id, language, code);
      const label = LANGUAGE_OPTIONS[language].label;
      const turnContent = `[Submitted Code (${label})]\n\`\`\`${language}\n${code}\n\`\`\`\n\nTest Results: ${testSummary || 'Executed'}`;
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'candidate',
        content: `I have submitted my code solution in ${label}${testSummary ? ` — ${testSummary}` : ''}.\n\n\`\`\`${language}\n${code}\n\`\`\`\n\nCould you review my approach, check my time and space complexity, and give me feedback on any edge cases?`,
        timestamp: new Date(),
      };
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
  }, [session, language, code, isRunning, isSubmittingCode, streaming]);

  /**
   * Switches programming language and swaps in the starter template.
   */
  const handleLanguageChange = useCallback((lang: string) => {
    setLanguage(lang);
    setCode(LANGUAGE_OPTIONS[lang].defaultCode);
    setExecutionResult(null);
  }, []);

  /**
   * Pauses the interview session and stops timers.
   */
  const handlePause = useCallback(async () => {
    if (!session || sessionPaused) return;
    try { await sessionApi.pause(session.id, timer.elapsedSeconds); timer.stopTimer(); setSessionPaused(true); isPausedRef.current = true; }
    catch (err: any) { setChatError(err?.message || 'Failed to pause session'); }
  }, [session, sessionPaused, timer]);

  /**
   * Resumes a paused interview session.
   */
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

  /**
   * Toggles speech synthesis (TTS) playback of AI interviewer questions.
   */
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

  // ── Render Phase 1: Pre-flight device check gate ──
  if (!deviceCheckDone) {
    return <DeviceCheckScreen onProceed={() => setDeviceCheckDone(true)} sessionMode={session?.interview_type} />;
  }

  // ── Render Phase 2: Animated studio launch splash ──
  if (isStarting) {
    return <StudioLaunchingScreen session={session} />;
  }

  // ── Render Phase 3: Initial session data loading ──
  if (pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] relative overflow-hidden px-4">
        <div
          className="absolute inset-0 opacity-40 pointer-events-none -z-10"
          style={{
            backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="relative z-10 rounded-3xl border border-slate-200/80 bg-white px-10 py-8 flex flex-col items-center shadow-xl shadow-slate-200/50"
        >
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-blue-700 flex items-center justify-center shadow-md shadow-blue-500/20">
              <Brain className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="text-slate-900 font-bold text-lg tracking-tight">DevMeet</span>
          </div>
          <Loader size="md" text="Loading session..." />
        </motion.div>
      </div>
    );
  }

  // ── Render Phase 4: Network or API failure ──
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

  // ── Render Phase 5: Created session waiting in lobby ──
  if (session.status === 'created') {
    return <InterviewStartScreen session={session} isStarting={isStarting} chatError={chatError} onStart={handleStart} onBack={() => router.push('/dashboard')} onCancel={handleCancel} isCancelling={isCancelling} />;
  }

  // ── Render Phase 6: Active live mock interview studio ──
  return (
    <div className="h-screen bg-[#f4f6fb] flex flex-col overflow-hidden text-slate-800">
      {/* Top Header bar with time limits, proctoring violations counter, and exit controls */}
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

      {/* Fullscreen Recovery Notification Banner */}
      {!isFullscreen && session?.status === 'in_progress' && (
        <div className="bg-blue-600 text-white px-4 py-2 flex items-center justify-between text-xs font-semibold z-30 shrink-0 shadow-sm animate-fade-in-up">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span>Interview Proctoring: Fullscreen mode is recommended during your interview.</span>
          </div>
          <button
            type="button"
            onClick={enterFullscreen}
            className="bg-white hover:bg-blue-50 text-blue-700 px-3 py-1 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            Re-enter Fullscreen
          </button>
        </div>
      )}

      {/* Main Workspace Split View */}
      <main className="flex flex-1 overflow-hidden">
        {/* Left column: Conversational Chat and Voice Transcription */}
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
          onToggleSpeech={() => {
            if (!speech.isListening) {
              speechBaseTextRef.current = input;
            }
            speech.toggleSpeechRecognition({
              isAiTyping: streaming.isAiTyping,
              onTranscript: (speechText) => {
                const base = speechBaseTextRef.current;
                setInput(base ? `${base} ${speechText}` : speechText);
              },
              onError: (msg) => setChatError(msg),
            });
          }}
          onRequestHint={handleRequestHint}
          onToggleHints={() => setShowHints((p) => !p)}
          onHideHints={() => setShowHints(false)}
          onToggleVideoFeed={() => setShowVideoFeed((p) => !p)}
          triggerCheatingViolation={cheating.triggerCheatingViolation}
          onRetry={() => { setChatError(null); streaming.generateQuestion(streaming.messages); }}
        />

        {/* Right column: Dynamic based on interview domain */}
        {isDSA ? (
          /* DSA Mode: Microsoft Monaco Editor with test runner */
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
            topic={session?.focus_area}
            problemContext={streaming.messages.find((m) => m.role === 'interviewer')?.content || ''}
          />
        ) : (
          /* Behavioral / System Design: Video stream & strategy tips tabs */
          <section className="flex flex-col border-l border-slate-200 bg-white" style={{ width: '45%' }}>
            <Tabs value={rightPanelTab} onValueChange={setRightPanelTab} className="flex flex-col flex-1 overflow-hidden">
              <div className="bg-white border-b border-slate-200 flex-shrink-0">
                <TabsList className="w-full h-11 bg-white border-b border-slate-200 px-4 gap-4 justify-start rounded-none p-0 inline-flex items-center text-slate-400">
                  {['video', 'tips'].map((tab) => (
                    <TabsTrigger
                      key={tab}
                      value={tab}
                      className="relative h-full inline-flex items-center justify-center text-xs font-bold capitalize rounded-none px-1 bg-transparent hover:text-slate-700 data-[state=active]:bg-transparent data-[state=active]:text-blue-600 data-[state=active]:shadow-none transition-colors border-none outline-none focus-visible:ring-0"
                    >
                      <span className="relative z-10 flex items-center gap-1.5 h-full">
                        {tab === 'video' ? (
                          <><Video className={`w-3.5 h-3.5 transition-colors ${rightPanelTab === 'video' ? 'text-blue-600' : 'text-slate-400'}`} /><span>Video Feed</span></>
                        ) : (
                          <><Lightbulb className={`w-3.5 h-3.5 transition-colors ${rightPanelTab === 'tips' ? 'text-blue-600' : 'text-slate-400'}`} /><span>Tips & Guide</span></>
                        )}
                      </span>
                      {rightPanelTab === tab && <motion.div layoutId="right-tab-underline" className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-600" transition={{ type: 'spring', stiffness: 380, damping: 34 }} />}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              <AnimatePresence mode="wait">
                {rightPanelTab === 'video' ? (
                  <motion.div key="video" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.22, ease: 'easeOut' }} className="flex-1 overflow-hidden">
                    <VideoPanel
                      sessionId={session.id}
                      userDisplayName={user?.display_name || user?.email || 'Candidate'}
                      userId={user?.id || session?.user_id || `candidate_${session.id.slice(0, 8)}`}
                      isActive={session.status === 'in_progress'}
                      aiState={streaming.isAiTyping ? 'thinking' : streaming.messages.length > 0 && streaming.messages[streaming.messages.length - 1].role === 'interviewer' ? 'speaking' : 'listening'}
                      onProctorViolation={cheating.triggerCheatingViolation}
                    />
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

      {/* Confirmation Dialogs and Proctoring Violation Modals */}
      {showEndConfirm && (
        <ConfirmModal onConfirm={handleEndConfirm} onCancel={() => setShowEndConfirm(false)} isLoading={isEnding} />
      )}

      {/* AFK Idle Notification */}
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

      {/* Security alert modal */}
      {cheating.showViolationModal && <ViolationModal message={cheating.violationMessage} onDismiss={cheating.dismissViolation} />}
    </div>
  );
}
