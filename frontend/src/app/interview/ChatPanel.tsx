'use client';

import React, { useCallback, useRef, useMemo } from 'react';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { MessageSquare, Send, Lightbulb, X, Brain, Volume2, VolumeX, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { speak, stopSpeaking } from '@/lib/speech';
import { type ChatMessage } from './utils';
import ChatBubble from './ChatBubble';
import TypingIndicator from './TypingIndicator';
import VideoPanel from './VideoPanel';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';

interface ChatPanelProps {
  session: any;
  messages: ChatMessage[];
  input: string;
  isAiTyping: boolean;
  chatError: string | null;
  hints: string[];
  showHints: boolean;
  hintLoading: boolean;
  isMuted: boolean;
  isListening: boolean;
  isTranscribing: boolean;
  userPlan: string;
  showVideoFeed: boolean;
  user: any;
  isDSA: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onToggleMute: () => void;
  onToggleSpeech: () => void;
  onRequestHint: () => void;
  onToggleHints: () => void;
  onHideHints: () => void;
  onToggleVideoFeed: () => void;
  triggerCheatingViolation: (type: 'tab_switch' | 'paste') => void;
  onRetry: () => void;
}

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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    },
    [onSend],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onInputChange(e.target.value);
      const ta = e.target;
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, 96)}px`;
    },
    [onInputChange],
  );

  return (
    <section className="flex flex-col border-r border-slate-200 bg-[#f8fafc]" style={{ width: isDSA ? '55%' : '100%' }}>
      {/* Chat header bar */}
      <div className="px-4 py-2.5 bg-white border-b border-slate-200 flex items-center gap-2 flex-shrink-0">
        <div className="flex items-center gap-2">
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

        <button
          onClick={onToggleMute}
          className={`ml-2 flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-all ${
            !isMuted ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100' : 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100'
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

        {isDSA && (
          <button
            onClick={onToggleVideoFeed}
            className={`ml-2 text-[10px] font-bold px-2 py-1 rounded-md border flex items-center gap-1 transition-all ${
              showVideoFeed ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
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

        {session.focus_area && <span className="ml-auto text-xs text-slate-500 font-semibold">Topic: {session.focus_area}</span>}
      </div>

      {/* Compact video panel for DSA mode */}
      {isDSA && showVideoFeed && (
        <div className="h-[160px] flex-shrink-0 border-b border-slate-200 bg-slate-50 overflow-hidden relative">
          <VideoPanel
            sessionId={session.id}
            userDisplayName={user?.display_name}
            userId={user?.id}
            isActive={session.status === 'in_progress'}
            aiState={isAiTyping ? 'thinking' : messages.length > 0 && messages[messages.length - 1].role === 'interviewer' ? 'speaking' : 'idle'}
            compact
            onProctorViolation={(type: string) => triggerCheatingViolation(type as 'tab_switch' | 'paste')}
          />
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="px-4 py-4 flex flex-col gap-4 min-h-full">
          {messages.length === 0 && !isAiTyping && (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="w-12 h-12 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center mb-3">
                <MessageSquare className="w-6 h-6 text-indigo-500" />
              </div>
              <p className="text-slate-500 text-sm font-semibold">Ready to begin</p>
              <p className="text-slate-400 text-xs mt-1">Your AI interviewer will introduce themselves shortly.</p>
            </div>
          )}
          {/* Virtual window: render only last 100 messages */}
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
          {isAiTyping && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

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

      {/* Hints panel */}
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

      {/* Input area */}
      <div className="px-4 pb-4 pt-2 border-t border-slate-200 bg-white flex-shrink-0">
        <div className="bg-white border border-slate-200 p-2 focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-200 rounded-xl transition-all shadow-sm">
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
              {isDSA &&
                (userPlan === 'free' ? (
                  <Link href="/billing" className="flex items-center gap-1.5 text-xs text-amber-700 px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 font-bold hover:bg-amber-100 transition-colors">
                    <Lightbulb className="w-3 h-3" /> Hints (Pro)
                  </Link>
                ) : (
                  <button
                    onClick={hints.length > 0 ? onToggleHints : onRequestHint}
                    disabled={hintLoading}
                    className="flex items-center gap-1.5 text-xs text-amber-700 px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 font-bold disabled:opacity-50 hover:bg-amber-100 transition-colors"
                  >
                    <Lightbulb className="w-3 h-3" />
                    {hintLoading ? 'Loading…' : hints.length > 0 ? `${hints.length} Hint${hints.length !== 1 ? 's' : ''}` : 'Get Hint'}
                  </button>
                ))}
            </div>
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
