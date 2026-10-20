'use client';

import React from 'react';
import { Volume2, Brain } from 'lucide-react';

interface AIAvatarStateProps {
  /** Real-time AI state: 'speaking' | 'thinking' | 'idle' */
  aiState: string;
  size?: 'sm' | 'md';
}

/**
 * Animated avatar state indicator visualizing the AI interviewer's current status:
 * - 'speaking': Dynamic audio frequency equalizer bars
 * - 'thinking': Dual rotating spinner rings
 * - 'idle': Subtle speaker volume icon
 */
export function AIAvatarState({ aiState, size = 'md' }: AIAvatarStateProps) {
  const isSmall = size === 'sm';
  const bars = isSmall ? [3, 6, 4, 8, 5] : [4, 8, 5, 10, 6, 9, 4];

  if (aiState === 'speaking') {
    return (
      <div
        aria-label="AI Interviewer is speaking"
        className={`flex items-end gap-${isSmall ? '0.5' : '1'} ${isSmall ? 'h-5 px-0.5' : 'h-9 px-1'}`}
      >
        {bars.map((h, i) => (
          <span
            key={i}
            className={`${isSmall ? 'w-0.5' : 'w-1'} bg-blue-500 rounded-full`}
            style={{
              height: `${h * (isSmall ? 1.6 : 1)}px`,
              animation: `soundwave ${0.6 + i * 0.1}s ease-in-out infinite alternate`,
              animationDelay: `${i * 80}ms`,
              transformOrigin: 'bottom',
            }}
          />
        ))}
      </div>
    );
  }

  if (aiState === 'thinking') {
    return (
      <div
        aria-label="AI Interviewer is evaluating"
        className={`relative flex items-center justify-center ${isSmall ? 'w-5 h-5' : 'w-10 h-10'}`}
      >
        <div
          className={`${
            isSmall ? 'w-4 h-4' : 'w-8 h-8'
          } border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin`}
        />
        {!isSmall && (
          <div
            className="absolute w-4 h-4 border-2 border-amber-400/20 border-b-amber-400 rounded-full animate-spin"
            style={{ animationDirection: 'reverse', animationDuration: '0.6s' }}
          />
        )}
      </div>
    );
  }

  return (
    <Volume2
      aria-label="AI Interviewer is idle"
      className={`${isSmall ? 'w-4 h-4 text-slate-400' : 'w-8 h-8 text-slate-500'}`}
    />
  );
}

export default AIAvatarState;
