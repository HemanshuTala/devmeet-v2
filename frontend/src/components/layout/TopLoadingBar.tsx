'use client';

/**
 * ============================================================================
 * DevMeet Frontend - Top Viewport Navigation Progress Bar
 * ============================================================================
 * Visual gradient progress indicator fixed to the top edge of the browser viewport.
 *
 * Why this exists:
 * - Next.js App Router client transitions can feel instantaneous or sluggish depending
 *   on server components and data fetching.
 * - This component listens for `pathname` changes and renders an animated linear gradient
 *   bar (blue -> purple -> cyan) with a glowing blur tip, assuring users that navigation
 *   is in progress.
 * ============================================================================
 */

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * TopLoadingBar component mounted in the root layout.
 */
export default function TopLoadingBar() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const prevPathRef = useRef(pathname);
  const barRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Only fire animation when path has truly changed
    if (prevPathRef.current === pathname) return;
    prevPathRef.current = pathname;

    setVisible(true);
    const bar = barRef.current;
    if (bar) {
      bar.classList.remove('loading-bar-complete');
      bar.classList.add('loading-bar-active');
    }

    // Progress bar animation timing
    timeoutRef.current = setTimeout(() => {
      if (bar) {
        bar.classList.remove('loading-bar-active');
        bar.classList.add('loading-bar-complete');
      }
      setTimeout(() => setVisible(false), 350);
    }, 400);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [pathname]);

  if (!visible) return null;

  return (
    <div
      ref={barRef}
      className="fixed top-0 left-0 z-[9999] h-[3px] pointer-events-none loading-bar-active"
      style={{
        background: 'linear-gradient(90deg, #2563eb, #7c3aed, #06b6d4)',
        boxShadow: '0 0 10px rgba(99, 102, 241, 0.7)',
      }}
    >
      {/* Glowing leading blur indicator */}
      <div
        className="absolute right-0 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full opacity-60"
        style={{
          background: 'radial-gradient(circle, rgba(255,255,255,0.9) 0%, transparent 70%)',
          filter: 'blur(2px)',
        }}
      />
    </div>
  );
}
