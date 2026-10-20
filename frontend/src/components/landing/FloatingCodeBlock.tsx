'use client';

import React from 'react';

interface FloatingCodeBlockProps {
  lines: string[];
  className?: string;
  style?: React.CSSProperties;
  index: number;
  registerRef?: (el: HTMLDivElement | null, idx: number) => void;
}

/**
 * Floating code snippet cards that gently react to mouse movements in the Hero section.
 */
export function FloatingCodeBlock({
  lines,
  className = '',
  style,
  index,
  registerRef,
}: FloatingCodeBlockProps) {
  return (
    <div
      ref={(el) => registerRef?.(el, index)}
      style={style}
      className={`absolute z-10 p-4 rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200/80 shadow-xl pointer-events-none transition-transform duration-700 ease-out font-mono text-xs ${className}`}
    >
      <div className="flex items-center gap-1.5 mb-2.5 pb-2 border-b border-slate-100">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-400/80" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/80" />
      </div>
      <div className="space-y-1">
        {lines.map((line, i) => (
          <div
            key={i}
            className={`${
              line.startsWith('//')
                ? 'text-slate-400 italic font-semibold'
                : line.includes('function') || line.includes('const')
                ? 'text-blue-600 font-bold'
                : 'text-slate-700'
            }`}
          >
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}

export default FloatingCodeBlock;
