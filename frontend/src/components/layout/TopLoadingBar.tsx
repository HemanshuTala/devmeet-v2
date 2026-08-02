'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

export default function TopLoadingBar() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const prevPathRef = useRef(pathname);
  const barRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (prevPathRef.current === pathname) return;
    prevPathRef.current = pathname;

    setVisible(true);
    const bar = barRef.current;
    if (bar) {
      bar.classList.remove('loading-bar-complete');
      bar.classList.add('loading-bar-active');
    }

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
