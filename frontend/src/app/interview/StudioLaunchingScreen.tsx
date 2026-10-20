'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Cpu, Bot, CheckCircle2, Shield, Sparkles } from 'lucide-react';

interface StudioLaunchingScreenProps {
  session?: any;
}

const LAUNCH_STEPS = [
  { text: 'Allocating isolated session workspace...', icon: Shield },
  { text: 'Connecting to AI Interviewer engine...', icon: Bot },
  { text: 'Generating initial problem context...', icon: Brain },
  { text: 'Opening secure interview studio...', icon: Sparkles },
];

export default function StudioLaunchingScreen({ session }: StudioLaunchingScreenProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(20);

  useEffect(() => {
    const t1 = setTimeout(() => {
      setCurrentStep(1);
      setProgress(48);
    }, 900);

    const t2 = setTimeout(() => {
      setCurrentStep(2);
      setProgress(76);
    }, 1900);

    const t3 = setTimeout(() => {
      setCurrentStep(3);
      setProgress(95);
    }, 2900);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center relative overflow-hidden px-4">
      {/* Background ambient mesh and dot grid pattern */}
      <div className="absolute inset-0 pointer-events-none -z-10">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] opacity-40 blur-3xl pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(99, 102, 241, 0.2) 0%, rgba(124, 58, 237, 0.1) 60%, transparent 80%)',
          }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md bg-white rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-200/60 p-8 flex flex-col items-center relative overflow-hidden text-center"
      >
        {/* Top ambient highlight */}
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-500" />

        {/* Central Neural Pulse Logo */}
        <div className="relative my-4 flex items-center justify-center">
          {/* Animated concentric pulse waves */}
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute rounded-full border border-indigo-400/30"
              initial={{ width: 64, height: 64, opacity: 0.8 }}
              animate={{
                width: [64, 130],
                height: [64, 130],
                opacity: [0.8, 0],
              }}
              transition={{
                duration: 2.2,
                repeat: Infinity,
                delay: i * 0.7,
                ease: 'easeOut',
              }}
            />
          ))}

          <motion.div
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="w-18 h-18 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30 z-10"
          >
            <Brain className="w-9 h-9" />
          </motion.div>
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-slate-900 tracking-tight mt-2">
          Initializing Interview Studio
        </h2>
        <p className="text-xs text-slate-500 mt-1 max-w-xs">
          Configuring AI dialogue context and launching your real-time interview workspace.
        </p>

        {/* Step progression cards */}
        <div className="w-full mt-6 space-y-2 text-left">
          {LAUNCH_STEPS.map((step, idx) => {
            const isDone = idx < currentStep;
            const isCurrent = idx === currentStep;
            const StepIcon = step.icon;

            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0.5 }}
                animate={{
                  opacity: isCurrent || isDone ? 1 : 0.4,
                  scale: isCurrent ? 1.01 : 1,
                }}
                className={`flex items-center gap-3 p-2.5 rounded-xl text-xs transition-colors border ${
                  isCurrent
                    ? 'bg-indigo-50/70 border-indigo-200 text-indigo-950 font-semibold'
                    : isDone
                    ? 'bg-slate-50 border-slate-200/60 text-slate-700'
                    : 'bg-transparent border-transparent text-slate-400'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                    isDone
                      ? 'bg-emerald-100 text-emerald-600'
                      : isCurrent
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : isCurrent ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                    >
                      <StepIcon className="w-3 h-3" />
                    </motion.div>
                  ) : (
                    <StepIcon className="w-3 h-3" />
                  )}
                </div>

                <span className="truncate flex-1">{step.text}</span>

                {isDone && (
                  <span className="text-[10px] font-bold text-emerald-600 uppercase">
                    Ready
                  </span>
                )}
                {isCurrent && (
                  <span className="flex h-1.5 w-1.5 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-600" />
                  </span>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Progress Bar */}
        <div className="w-full mt-6">
          <div className="flex justify-between items-center text-[11px] font-semibold text-slate-400 mb-1.5">
            <span>Room Preparation</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 rounded-full"
              initial={{ width: '15%' }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.6, ease: 'easeInOut' }}
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
