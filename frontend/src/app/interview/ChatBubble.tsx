'use client';

import React from 'react';
import { Brain } from 'lucide-react';
import { type ChatMessage } from './utils';

interface ChatBubbleProps {
  message: ChatMessage;
}

export default React.memo(function ChatBubble({ message }: ChatBubbleProps) {
  const isInterviewer = message.role === 'interviewer';

  return (
    <div className={`flex gap-3 ${isInterviewer ? '' : 'flex-row-reverse'}`}>
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${
          isInterviewer
            ? 'bg-gradient-to-br from-blue-500 to-violet-600'
            : 'bg-gradient-to-br from-emerald-500 to-teal-600'
        }`}
      >
        {isInterviewer ? (
          <Brain className="w-4 h-4 text-white" />
        ) : (
          <span className="text-white text-xs font-black">You</span>
        )}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isInterviewer
            ? 'bg-[#252535] border border-white/10 text-slate-200'
            : 'bg-indigo-600 text-white'
        }`}
      >
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
        {message.timestamp && (
          <div className={`text-[10px] mt-1.5 font-semibold ${isInterviewer ? 'text-slate-500' : 'text-indigo-200'}`}>
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>
    </div>
  );
});
