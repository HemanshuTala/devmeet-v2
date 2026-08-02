'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';

interface PageTransitionProps {
  children: React.ReactNode;
}

const variants = {
  hidden: { opacity: 0, y: 10, scale: 0.995 },
  enter:  { opacity: 1, y: 0,  scale: 1 },
  exit:   { opacity: 0, y: -6, scale: 0.998 },
};

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
          duration: 0.22,
          ease: [0.25, 0.46, 0.45, 0.94],
        }}
        className="w-full flex flex-col gap-6"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
