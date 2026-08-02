'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Brain } from 'lucide-react';

export default function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.97 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="flex items-start gap-3"
    >
      {/* AI Avatar */}
      <div className="relative flex-shrink-0">
        <motion.div
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
            boxShadow: '0 0 16px rgba(99, 102, 241, 0.35)',
          }}
          animate={{ boxShadow: ['0 0 16px rgba(99,102,241,0.35)', '0 0 28px rgba(99,102,241,0.6)', '0 0 16px rgba(99,102,241,0.35)'] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Brain className="w-4 h-4 text-white" />
        </motion.div>
        {/* Live status dot */}
        <motion.span
          className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#13131f]"
          style={{ background: '#22c55e' }}
          animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        />
      </div>

      {/* Bubble */}
      <div className="flex flex-col gap-1">
        <div
          className="px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm border"
          style={{
            background: 'linear-gradient(135deg, rgba(37,99,235,0.06) 0%, rgba(124,58,237,0.04) 100%)',
            borderColor: 'rgba(99,102,241,0.15)',
          }}
        >
          {/* Animated wave bars */}
          <div className="flex items-center gap-[4px] py-1 h-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <motion.div
                key={i}
                className="rounded-full"
                style={{
                  width: 3,
                  background: i === 2
                    ? 'linear-gradient(to top, #2563eb, #7c3aed)'
                    : '#6366f1',
                }}
                animate={{
                  height: [4, i === 2 ? 18 : i % 2 === 0 ? 14 : 10, 4],
                  opacity: [0.5, 1, 0.5],
                }}
                transition={{
                  duration: 1.0,
                  repeat: Infinity,
                  repeatType: 'mirror',
                  delay: i * 0.12,
                  ease: 'easeInOut',
                }}
              />
            ))}
          </div>
        </div>
        <motion.span
          className="text-[10px] text-slate-400 font-medium pl-1"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.8, repeat: Infinity }}
        >
          AI Interviewer is thinking...
        </motion.span>
      </div>
    </motion.div>
  );
}
