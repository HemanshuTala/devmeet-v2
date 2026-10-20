'use client';

import React, { useEffect, useRef } from 'react';

interface AudioLevelMeterProps {
  /** Function providing a subscription callback that fires on real-time microphone volume changes */
  subscribe: (cb: (level: number) => void) => () => void;
  /** Size variant: 'sm' for compact header display, 'md' for full video overlay */
  size?: 'sm' | 'md';
}

/**
 * Visualizes real-time microphone volume levels as green animated vertical LED bars.
 * Used in the interview room to confirm candidate audio input is active before and during calls.
 */
export function AudioLevelMeter({ subscribe, size = 'sm' }: AudioLevelMeterProps) {
  const dotsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const dots = size === 'sm' ? [1, 2, 3, 4] : [1, 2, 3, 4, 5];
  const step = size === 'sm' ? 25 : 20;
  const baseH = size === 'sm' ? 2 : 2;
  const stepH = size === 'sm' ? 1 : 1.5;

  useEffect(() => {
    return subscribe((level) => {
      dotsRef.current.forEach((el, i) => {
        if (!el) return;
        const d = dots[i];
        const active = level >= d * step;
        el.className = `${size === 'sm' ? 'w-0.5' : 'w-1'} rounded-full transition-all duration-100 ${
          active
            ? 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.8)]'
            : size === 'sm'
            ? 'bg-slate-700'
            : 'bg-slate-800'
        }`;
      });
    });
  }, [subscribe, size, step, dots]);

  return (
    <div
      aria-label="Microphone volume indicator"
      className={`flex items-end gap-0.5 ${size === 'sm' ? 'h-2.5 w-6 px-0.5' : 'h-3.5 w-12 px-0.5'}`}
    >
      {dots.map((d, i) => (
        <span
          key={d}
          ref={(el) => {
            dotsRef.current[i] = el;
          }}
          className={`${size === 'sm' ? 'w-0.5' : 'w-1'} rounded-full transition-all duration-100 ${
            size === 'sm' ? 'bg-slate-700' : 'bg-slate-800'
          }`}
          style={{ height: `${baseH + d * stepH}px` }}
        />
      ))}
    </div>
  );
}

export default AudioLevelMeter;
