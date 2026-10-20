/**
 * @file loader.tsx
 * @description Interactive Brand Loading Spinner and Fullscreen Progress Overlay.
 *
 * Provides a modern, animated loading indicator powered by Framer Motion:
 * 1. `FancyBrainLoader`: Concentric ripple waves pulsing around a central neural AI node.
 * 2. `BouncingDots`: Three-dot staggered bouncing wave indicator.
 * 3. Stepwise cycling status messages ("Connecting to services...", "Loading your data...", etc.).
 * 4. Modal/Fullscreen overlay option with background blur and card elevation.
 *
 * @module components/ui/loader
 */

'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Props accepted by the Loader component.
 */
interface LoaderProps {
  /** Size preset scaling the central brain node and bounding box ('sm' | 'md' | 'lg' | 'xl'). Defaults to 'md'. */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Optional custom CSS classes applied to the root container. */
  className?: string;
  /** When true, renders inside a fixed full-viewport overlay with blurred backdrop. */
  fullscreen?: boolean;
  /** Static text to display below the loader. When omitted, cycles through `LOAD_STEPS`. */
  text?: string;
}

/**
 * Sequential loading messages displayed to the user when no custom static text is provided.
 * Cycles every 1600ms to convey active system progress during prolonged async operations.
 */
const LOAD_STEPS = [
  'Connecting to services...',
  'Loading your data...',
  'Preparing your session...',
  'Almost ready...',
];

/**
 * FancyBrainLoader Component.
 *
 * Renders the central AI icon with expanding concentric ripple rings.
 *
 * @param {Object} props
 * @param {'sm' | 'md' | 'lg' | 'xl'} [props.size='md'] - Dimensions preset.
 * @returns {JSX.Element} Animated ripple & pulse icon container.
 */
function FancyBrainLoader({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  // Determine outer container dimensions based on size preset
  const dim =
    size === 'sm' ? 'w-10 h-10'
    : size === 'md' ? 'w-16 h-16'
    : size === 'lg' ? 'w-24 h-24'
    : 'w-32 h-32';

  // Determine inner SVG dimensions
  const iconDim =
    size === 'sm' ? 14
    : size === 'md' ? 20
    : size === 'lg' ? 28
    : 36;

  return (
    <div className={`relative flex items-center justify-center ${dim} mb-2`}>
      {/* Concentric expanding ripple rings with staggered delay (0s, 0.65s, 1.3s) */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute inset-0 rounded-full bg-blue-500/10 border border-blue-500/25"
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

      {/* Central brain/AI node gradient with smooth heartbeat scale pulse */}
      <motion.div
        className="relative z-10 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20"
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
        {/* Custom AI / Neural Network Node vector graphic */}
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

/**
 * BouncingDots Component.
 *
 * Renders three staggered bouncing dots for secondary motion feedback.
 *
 * @returns {JSX.Element}
 */
function BouncingDots() {
  return (
    <div className="flex gap-1.5 items-center justify-center py-2 h-4">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-2.5 h-2.5 rounded-full bg-blue-600 shadow-sm shadow-blue-500/10"
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

/**
 * Primary Loader Component for DevMeet.
 *
 * @component
 * @param {LoaderProps} props - Configuration options.
 * @returns {JSX.Element} Inline or Fullscreen modal loading widget.
 */
export function Loader({ size = 'md', className = '', fullscreen = false, text }: LoaderProps) {
  // Step index for looping status messages when static `text` is not provided
  const [stepIdx, setStepIdx] = useState(0);

  // Set up periodic step change timer (1600ms per step)
  useEffect(() => {
    if (text) return; // Skip cycling if caller supplied explicit status text
    const id = setInterval(() => {
      setStepIdx((p) => (p + 1) % LOAD_STEPS.length);
    }, 1600);
    return () => clearInterval(id);
  }, [text]);

  // Main loader body containing brain graphic, bouncing dots, and text transition
  const content = (
    <div className={`flex flex-col items-center gap-4 ${className}`}>
      <FancyBrainLoader size={size} />

      {/* Hide bouncing dots on miniature 'sm' size to prevent visual clutter */}
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

  // When fullscreen is enabled, render in a fixed viewport-spanning backdrop with elevated white card
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
