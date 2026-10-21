'use client';

/**
 * @file ChatPanel.tsx (Interview Conversational Workspace)
 * @description Core conversational interface for the live interview session.
 * Handles bidirectional communication with the AI interviewer, auto-scrolling message streams,
 * speech recognition input (STT), text-to-speech toggling (TTS), hint generation & display,
 * anti-cheating clipboard paste prevention, and compact video proctoring in coding mode.
 */

import React, { useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { MessageSquare, Send, Lightbulb, X, Brain, Volume2, VolumeX, Mic, MicOff, Video, VideoOff, Sparkles } from 'lucide-react';
import { speak, stopSpeaking } from '@/lib/speech';
import { type ChatMessage } from './utils';
import ChatBubble from './ChatBubble';
import TypingIndicator from './TypingIndicator';
import VideoPanel from './VideoPanel';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';

/**
 * Interface defining all props passed down from the parent Interview Studio page.
 */
interface ChatPanelProps {
  /** The active session model object */
  session: any;
  /** Full list of conversational dialogue turns */
  messages: ChatMessage[];
  /** Controlled candidate text input value */
  input: string;
  /** Whether the AI model is actively generating or thinking */
  isAiTyping: boolean;
  /** Error message string if WebSocket or API failure occurred */
  chatError: string | null;
  /** Progressive hints generated for the active problem */
  hints: string[];
  /** Whether hints drawer is currently visible */
  showHints: boolean;
  /** True while requesting an algorithmic hint from the AI interviewer */
  hintLoading: boolean;
  /** Whether speech synthesis playback is muted */
  isMuted: boolean;
  /** Whether microphone speech recognition is currently recording */
  isListening: boolean;
  /** Whether audio transcription is in-flight */
  isTranscribing: boolean;
  /** Current candidate subscription plan */
  userPlan: string;
  /** Flag toggling compact video proctoring feed in DSA mode */
  showVideoFeed: boolean;
  /** Authenticated user profile */
  user: any;
  /** True if current interview category is DSA / coding */
  isDSA: boolean;
  /** Input change callback */
  onInputChange: (value: string) => void;
  /** Message submission callback */
  onSend: () => void;
  /** Mute/unmute speech synthesis toggle callback */
  onToggleMute: () => void;
  /** Voice transcription toggle callback */
  onToggleSpeech: () => void;
  /** AI hint request callback */
  onRequestHint: () => void;
  /** Hint panel visibility toggle */
  onToggleHints: () => void;
  /** Hint panel hide callback */
  onHideHints: () => void;
  /** Video panel feed toggle in split-screen mode */
  onToggleVideoFeed: () => void;
  /** Anti-cheating violation handler (paste, tab switch) */
  triggerCheatingViolation: (type: 'tab_switch' | 'paste') => void;
  /** Retry handler if initial question generation failed */
  onRetry: () => void;
}

/**
 * ChatPanel Component.
 * Orchestrates text message exchange, voice input/output controls, and proctoring feed.
 */
export default function ChatPanel({
  session,
  messages,
  input,
  isAiTyping,
  chatError,
  hints,
  showHints,
  hintLoading,
  isMuted,
  isListening,
  isTranscribing,
  userPlan,
  showVideoFeed,
  user,
  isDSA,
  onInputChange,
  onSend,
  onToggleMute,
  onToggleSpeech,
  onRequestHint,
  onToggleHints,
  onHideHints,
  onToggleVideoFeed,
  triggerCheatingViolation,
  onRetry,
}: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /**
   * Keyboard handler: Submits message on Enter (Shift+Enter inserts a newline).
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    },
    [onSend],
  );

  /**
   * Auto-resizing textarea change handler: Expands up to max 96px height.
   */
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onInputChange(e.target.value);
      const ta = e.target;
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, 96)}px`;
    },
    [onInputChange],
  );

  // Contextual quick demo answer suggestions for live presentations
  const demoAnswers = useMemo(() => {
    const t = session?.interview_type;
    if (t === 'dsa') {
      return [
        {
          label: 'O(n) Hash Map Approach',
          text: 'I can solve Two Sum in O(n) time using a hash map. For each element num at index i, we calculate complement = target - num. If the complement is already in our map, we return [seen[complement], i]. Otherwise, we store seen[num] = i. This achieves O(n) linear time with O(n) auxiliary space.',
        },
        {
          label: 'Complexity & Edge Cases',
          text: 'Time complexity is O(n) for a single linear pass with O(1) hash map operations. Space complexity is O(n) to store previous elements. Key edge cases include: negative integers, duplicate values, and ensuring the same index is not used twice.',
        },
      ];
    }
    if (t === 'behavioral') {
      return [
        {
          label: 'STAR: Production Outage',
          text: 'Situation: During a Black Friday flash sale, our payment gateway began failing with a 35% error spike due to partner timeouts. Task: As senior engineer on call, I had to recover checkout reliability within 15 minutes to prevent customer abandonment. Action: I initiated incident response, enabled dynamic circuit-breaker routing to our secondary gateway, and deployed an async worker queue with idempotency keys. Result: Payment success restored to 99.8% within 9 minutes with zero duplicate billings, saving over $85,000 in transactions.',
        },
        {
          label: 'STAR: Cross-Team Conflict',
          text: 'Situation: Two teams disagreed on whether to migrate our core API to GraphQL or REST with gRPC. Task: As tech lead, I needed to align both teams on a unified design without delaying our quarterly roadmap. Action: I ran a data-driven benchmark evaluating mobile payload sizes, caching viability, and developer ergonomics, then hosted an alignment workshop. Result: We adopted REST with gRPC for internal microservices and GraphQL for customer clients, cutting mobile payload by 42% and shipping on time.',
        },
      ];
    }
    return [
      {
        label: 'URL Shortener Architecture',
        text: '1. Requirements: 100M writes/month (~40 writes/sec), 10B reads/month (~4,000 reads/sec, 100:1 read-heavy ratio). Sub-10ms redirect latency, 99.99% availability. 2. API Design: POST /api/v1/shorten {url} returns {short_url}; GET /{short_code} returns HTTP 302 Redirect with Location header. 3. Data & Storage: 64-bit Snowflake ID encoded with Base62 (7 characters for 3.5T URLs). Distributed NoSQL key-value store (DynamoDB/Cassandra) with Redis caching top 20% hot links with LRU eviction.',
      },
      {
        label: '50K QPS Scaling Strategy',
        text: 'To handle 50K QPS: 1. Deploy stateless API gateways behind ALB. 2. Distributed Redis cluster with read replicas and consistent hashing for in-memory redirection. 3. Database sharding partitioned by short_code hash prefix. 4. Cloudflare CDN edge caching for popular viral short URLs to absorb 80% of read traffic before reaching origin.',
      },
    ];
  }, [session?.interview_type]);

  return (
    <section className="flex flex-col border-r border-slate-200 bg-[#f8fafc]" style={{ width: isDSA ? '55%' : '100%' }}>
      {/* Chat header bar: Mode indicators, Voice synthesis toggle, Video toggle */}
      <div className="px-4 py-2.5 bg-white border-b border-slate-200 flex items-center gap-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          {/* Animated AI Brain pulsing when AI is generating responses */}
          <motion.div
            className="w-6 h-6 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #2563eb, #7c3aed)' }}
            animate={isAiTyping ? { boxShadow: ['0 0 8px rgba(99,102,241,0.4)', '0 0 18px rgba(99,102,241,0.7)', '0 0 8px rgba(99,102,241,0.4)'] } : {}}
            transition={{ duration: 1.2, repeat: Infinity }}
          >
            <Brain className="w-3.5 h-3.5 text-white" />
          </motion.div>
          <span className="text-slate-700 text-xs font-bold">Interview Conversation</span>
        </div>

        {/* Text-to-speech audio toggle */}
        <button
          onClick={onToggleMute}
          className={`ml-2 flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-all ${
            !isMuted ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100' : 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100'
          }`}
          title={isMuted ? 'Unmute AI voice' : 'Mute AI voice'}
        >
          {isMuted ? (
            <>
              <VolumeX className="w-3 h-3" />
              Muted
            </>
          ) : (
            <>
              <Volume2 className="w-3 h-3" />
              <span>Voice</span>
              <div className="flex items-center gap-[2px] ml-0.5">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-[2px] bg-blue-500 rounded-full"
                    animate={{ height: [3, i === 1 ? 8 : 5, 3] }}
                    transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
                  />
                ))}
              </div>
            </>
          )}
        </button>

        {/* Compact video proctoring feed toggle button for DSA mode */}
        {isDSA && (
          <button
            onClick={onToggleVideoFeed}
            className={`ml-2 text-[10px] font-bold px-2 py-1 rounded-md border flex items-center gap-1 transition-all ${
              showVideoFeed ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
            }`}
          >
            {showVideoFeed ? (
              <>
                <VideoOff className="w-3 h-3" />
                Hide Video
              </>
            ) : (
              <>
                <Video className="w-3 h-3" />
                Show Video
              </>
            )}
          </button>
        )}

        {/* Focus area pill */}
        {session.focus_area && <span className="ml-auto text-xs text-slate-500 font-semibold">Topic: {session.focus_area}</span>}
      </div>

      {/* Embedded compact video proctoring feed (webcam + face detection) */}
      {isDSA && showVideoFeed && (
        <div className="h-[160px] flex-shrink-0 border-b border-slate-200 bg-slate-50 overflow-hidden relative">
          <VideoPanel
            sessionId={session.id}
            userDisplayName={user?.display_name || user?.email || 'Candidate'}
            userId={user?.id || session?.user_id || `candidate_${session.id.slice(0, 8)}`}
            isActive={session.status === 'in_progress'}
            aiState={isAiTyping ? 'thinking' : messages.length > 0 && messages[messages.length - 1].role === 'interviewer' ? 'speaking' : 'idle'}
            compact
            onProctorViolation={(type: string) => triggerCheatingViolation(type as 'tab_switch' | 'paste')}
          />
        </div>
      )}

      {/* Conversational Messages Scroll Area */}
      <ScrollArea className="flex-1">
        <div className="px-4 py-4 flex flex-col gap-4 min-h-full">
          {messages.length === 0 && !isAiTyping && (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="w-12 h-12 rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center mb-3">
                <Brain className="w-6 h-6 text-indigo-600" />
              </div>
              <p className="text-slate-700 text-sm font-bold">Interview Studio Active</p>
              <p className="text-slate-400 text-xs mt-1 max-w-xs">
                {chatError ? chatError : 'Your AI interviewer will introduce themselves shortly.'}
              </p>
              {chatError && (
                <button
                  onClick={onRetry}
                  className="mt-3.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Generate Question
                </button>
              )}
            </div>
          )}

          {/* Virtualization window: render only the last 100 turns to prevent DOM bloat */}
          {messages.length > 100 && (
            <div className="text-center py-2">
              <span className="text-slate-400 text-[10px] font-semibold">
                {messages.length - 100} earlier messages not shown
              </span>
            </div>
          )}

          {messages.slice(-100).map((msg) => (
            <div
              key={msg.id}
              style={{ contentVisibility: 'auto', containIntrinsicSize: '0 80px' }}
            >
              <ChatBubble message={msg} />
            </div>
          ))}

          {/* Animated typing dots when AI is computing a response */}
          {isAiTyping && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Inline WebSocket / AI streaming error alert */}
      {chatError && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs py-2 px-3 rounded-xl font-medium">
            <span className="flex-1">{chatError}</span>
            <button
              onClick={onRetry}
              className="shrink-0 text-xs font-bold px-2.5 py-1 rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Progressive Algorithmic Hints Drawer */}
      {isDSA && showHints && hints.length > 0 && (
        <div className="mx-4 mb-2 bg-amber-50 border border-amber-200 p-3 rounded-xl animate-fade-in-up">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="w-4 h-4 text-amber-500" />
            <span className="text-amber-700 text-xs font-bold">Hints</span>
            <button onClick={onHideHints} className="ml-auto text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <ul className="flex flex-col gap-1.5">
            {hints.map((h, i) => (
              <li key={i} className="text-amber-800 text-xs flex items-start gap-1.5 leading-relaxed">
                <span className="text-amber-500 mt-0.5 font-bold">•</span>
                {h}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Input Composer & Toolbar */}
      <div className="px-4 pb-4 pt-2 border-t border-slate-200 bg-white flex-shrink-0">
        {/* Quick Demo Response Chips for Live Presentations */}
        {demoAnswers.length > 0 && (
          <div className="pb-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <span className="text-[10px] text-indigo-700 font-bold uppercase tracking-wider shrink-0 flex items-center gap-1 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
              <Sparkles className="w-2.5 h-2.5 text-indigo-600" /> Demo Answers:
            </span>
            {demoAnswers.map((demo, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onInputChange(demo.text)}
                className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 border border-slate-200 text-slate-600 font-medium whitespace-nowrap transition-all cursor-pointer"
                title="Click to insert demo answer into input field"
              >
                {demo.label}
              </button>
            ))}
          </div>
        )}

        <div className="bg-white border border-slate-200 p-2 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-200 rounded-xl transition-all shadow-sm">
          {/*
           * Textarea with proctoring anti-cheat handler onPaste:
           * Prevents pasting solution code directly from external tools and triggers violation alert.
           */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={(e) => { e.preventDefault(); triggerCheatingViolation('paste'); }}
            placeholder="Type your answer… (Enter to send, Shift+Enter for newline)"
            rows={2}
            disabled={isAiTyping}
            className="w-full bg-transparent text-slate-800 text-sm placeholder-slate-400 resize-none outline-none scrollbar-thin leading-relaxed disabled:opacity-50"
            style={{ maxHeight: '96px' }}
          />
          <div className="flex items-center justify-between mt-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-semibold">{input.length} chars</span>

              {/* Speech-to-text recording toggle */}
              <button
                type="button"
                onClick={onToggleSpeech}
                disabled={isAiTyping || isTranscribing}
                className={`flex items-center gap-1 text-[10px] md:text-xs px-2 py-0.5 md:py-1 rounded-lg border font-bold transition-all disabled:opacity-50 ${
                  isListening
                    ? 'bg-rose-50 border-rose-200 text-rose-600 animate-pulse'
                    : isTranscribing
                    ? 'bg-amber-50 border-amber-200 text-amber-700'
                    : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                }`}
                title={isListening ? 'Stop listening' : isTranscribing ? 'Transcribing…' : 'Voice input'}
              >
                {isListening ? (
                  <><MicOff className="w-3 h-3" /> Stop</>
                ) : isTranscribing ? (
                  <><div className="w-3 h-3 border border-amber-400 border-t-transparent rounded-full animate-spin mr-1" />Transcribing…</>
                ) : (
                  <><Mic className="w-3 h-3" /> Speak</>
                )}
              </button>

              {/* Hint request / toggle button */}
              {isDSA && (
                <button
                  type="button"
                  onClick={hints.length > 0 ? onToggleHints : onRequestHint}
                  disabled={hintLoading}
                  className="flex items-center gap-1.5 text-xs text-amber-800 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 font-semibold disabled:opacity-50 hover:bg-amber-100 transition-colors cursor-pointer shadow-xs"
                  title={hints.length > 0 ? "Toggle interview hints" : "Request a hint from the AI interviewer"}
                >
                  <Lightbulb className="w-3.5 h-3.5 text-amber-600" />
                  <span>
                    {hintLoading
                      ? 'Fetching Hint…'
                      : hints.length > 0
                      ? `${hints.length} Hint${hints.length !== 1 ? 's' : ''}`
                      : 'Get Hint'}
                  </span>
                </button>
              )}
            </div>

            {/* Send submission button */}
            <Button size="sm" variant="gradient" onClick={onSend} disabled={!input.trim() || isAiTyping} className="h-8 text-xs font-bold">
              <Send className="w-3.5 h-3.5 mr-1" />
              Send
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
