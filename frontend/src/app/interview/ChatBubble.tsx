'use client';

/**
 * @file ChatBubble.tsx (Interview Chat Message Bubble)
 * @description Renders individual dialogue messages between the AI interviewer and the candidate.
 * Formats avatars, speech bubbles with contrasting styles (white/bordered for AI, blue filled for candidate),
 * preserves whitespace and code snippets, and renders timestamp badges.
 * Memoized to prevent re-renders when parent lists scroll or stream new incoming messages.
 */

import React from 'react';
import { Brain } from 'lucide-react';
import { type ChatMessage } from './utils';

/**
 * Props passed to the ChatBubble component.
 */
interface ChatBubbleProps {
  /** The message payload containing text content, sender role, and timestamp */
  message: ChatMessage;
}

/**
 * Memoized ChatBubble component rendering an individual conversational message.
 */
export default React.memo(function ChatBubble({ message }: ChatBubbleProps) {
  const isInterviewer = message.role === 'interviewer';

  return (
    <div className={`flex gap-3 ${isInterviewer ? '' : 'flex-row-reverse'}`}>
      {/* Sender Avatar badge: AI Brain icon vs Candidate "You" monogram */}
      <div
        className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${
          isInterviewer
            ? 'bg-gradient-to-br from-blue-600 to-blue-700'
            : 'bg-gradient-to-br from-emerald-500 to-teal-600'
        }`}
      >
        {isInterviewer ? (
          <Brain className="w-4 h-4 text-white" />
        ) : (
          <span className="text-white text-xs font-black">You</span>
        )}
      </div>

      {/* Message Bubble container */}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isInterviewer
            ? 'bg-white border border-slate-200 text-slate-800 shadow-sm'
            : 'bg-blue-600 text-white'
        }`}
      >
        {/* Preserves line breaks and code formatting */}
        <div className="whitespace-pre-wrap break-words">{message.content}</div>

        {/* Timestamp */}
        {message.timestamp && (
          <div className={`text-[10px] mt-1.5 font-semibold ${isInterviewer ? 'text-slate-400' : 'text-blue-100'}`}>
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>
    </div>
  );
});
