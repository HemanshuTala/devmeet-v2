'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface LoaderProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  fullscreen?: boolean;
  text?: string;
}

const LOAD_STEPS = [
  'Connecting to services...',
  'Loading your data...',
  'Preparing your session...',
  'Almost ready...',
];

/* ─── Fancy Ripple/Brain Loader ───────────────────────────────────────────── */
function FancyBrainLoader({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const dim =
    size === 'sm' ? 'w-10 h-10'
    : size === 'md' ? 'w-16 h-16'
    : size === 'lg' ? 'w-24 h-24'
    : 'w-32 h-32';

  const iconDim =
    size === 'sm' ? 14
    : size === 'md' ? 20
    : size === 'lg' ? 28
    : 36;

  return (
    <div className={`relative flex items-center justify-center ${dim} mb-2`}>
      {/* Concentric expanding ripple rings */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute inset-0 rounded-full bg-indigo-500/10 border border-indigo-500/25"
          initial={{ opacity: 0.8, scale: 0.2 }}
          animate={{
            opacity: 0,
            scale: 1.25,
          }}
          transition={{
            duration: 2.0,
            repeat: Infinity,
            delay: i * 0.65,
            ease: 'easeOut',
          }}
        />
      ))}

      {/* Central brain/AI node gradient with pulse scale animation */}
      <motion.div
        className="relative z-10 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20"
        style={{
          width: size === 'sm' ? 24 : size === 'md' ? 38 : size === 'lg' ? 54 : 72,
          height: size === 'sm' ? 24 : size === 'md' ? 38 : size === 'lg' ? 54 : 72,
          borderRadius: size === 'sm' ? 6 : size === 'md' ? 10 : size === 'lg' ? 14 : 18,
        }}
        animate={{
          scale: [1, 1.06, 1],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <svg
          width={iconDim}
          height={iconDim}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
          <path d="M12 6v12" />
          <path d="M8 10h8" />
          <path d="M9.5 14h5" />
          <path d="M10.5 18h3" />
        </svg>
      </motion.div>
    </div>
  );
}

/* ─── Wave Bouncing Dots (fancy progress replacement) ──────────────────────── */
function BouncingDots() {
  return (
    <div className="flex gap-1.5 items-center justify-center py-2 h-4">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 shadow-sm shadow-indigo-500/10"
          animate={{
            y: [0, -6, 0],
          }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            delay: i * 0.15,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

/* ─── Main Loader ────────────────────────────────────────────────────────── */
export function Loader({ size = 'md', className = '', fullscreen = false, text }: LoaderProps) {
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (text) return;
    const id = setInterval(() => {
      setStepIdx((p) => (p + 1) % LOAD_STEPS.length);
    }, 1600);
    return () => clearInterval(id);
  }, [text]);

  const content = (
    <div className={`flex flex-col items-center gap-4 ${className}`}>
      <FancyBrainLoader size={size} />

      {size !== 'sm' && <BouncingDots />}

      <div style={{ minHeight: 20, textAlign: 'center' }}>
        <AnimatePresence mode="wait">
          <motion.p
            key={text ?? stepIdx}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            style={{
              fontSize: size === 'sm' ? 12 : 13,
              color: '#888',
              fontWeight: 450,
              letterSpacing: '0.01em',
            }}
          >
            {text ?? LOAD_STEPS[stepIdx]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );

  if (fullscreen) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9998,
          background: 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          style={{
            background: '#fff',
            border: '1px solid #e5e5e5',
            borderRadius: 16,
            padding: '40px 48px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            boxShadow: '0 20px 40px rgba(0,0,0,0.08)',
            minWidth: 260,
          }}
        >
          {content}
        </motion.div>
      </div>
    );
  }

  return content;
}
