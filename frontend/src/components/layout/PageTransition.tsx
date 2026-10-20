'use client';

/**
 * ============================================================================
 * DevMeet Frontend - Smooth Page Transition Wrapper Component
 * ============================================================================
 * Provides smooth, declarative route transitions across client-side page
 * navigations using Framer Motion (`motion.div` and `AnimatePresence`).
 *
 * Key Capabilities:
 * 1. Pathname Keying:
 *    - Uses `key={pathname}` from `next/navigation` to detect route changes and
 *      trigger exit/enter animations cleanly.
 * 2. High-Performance Spring Micro-Transitions:
 *    - Subtle 150ms opacity and y-axis translation (`y: 8 -> 0`) avoiding jank.
 * 3. PopLayout Mode:
 *    - `mode="popLayout"` ensures outgoing pages pop out of the normal layout flow
 *      so incoming views animate immediately without vertical jumping.
 * ============================================================================
 */

import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';

interface PageTransitionProps {
  /** Child page view to animate */
  children: React.ReactNode;
}

/**
 * Transition variants for entrance, presence, and exit states.
 */
const variants = {
  hidden: { opacity: 0, y: 8, scale: 0.996 },
  enter:  { opacity: 1, y: 0, scale: 1 },
  exit:   { opacity: 0, y: -4, scale: 0.998 },
};

/**
 * PageTransition component wrapping Next.js page layouts.
 */
export default function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        key={pathname}
        variants={variants}
        initial="hidden"
        animate="enter"
        exit="exit"
        transition={{
          duration: 0.15,
          ease: [0.2, 0, 0, 1],
        }}
        className="w-full flex flex-col gap-6"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
