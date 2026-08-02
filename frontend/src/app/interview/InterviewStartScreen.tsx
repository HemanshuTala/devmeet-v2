'use client';

import { motion } from 'framer-motion';
import { ChevronLeft, Brain, Play, Sparkles, Shield, Zap, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { DIFFICULTY_BADGE, TYPE_LABEL } from './constants';

interface InterviewStartScreenProps {
  session: any;
  isStarting: boolean;
  chatError: string | null;
  onStart: () => void;
  onBack: () => void;
  onCancel?: () => void;
  isCancelling?: boolean;
}

const READY_CHECKS = [
  { icon: Shield, label: 'Anti-cheat monitoring active', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { icon: Brain, label: 'AI Interviewer initialized', color: 'text-blue-600', bg: 'bg-blue-50' },
  { icon: Zap, label: 'Audio & video configured', color: 'text-violet-600', bg: 'bg-violet-50' },
  { icon: Sparkles, label: 'Evaluation engine ready', color: 'text-amber-600', bg: 'bg-amber-50' },
];

export default function InterviewStartScreen({ session, isStarting, chatError, onStart, onBack, onCancel, isCancelling }: InterviewStartScreenProps) {
  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden px-4"
      style={{ background: 'linear-gradient(135deg, #f0f4ff 0%, #faf5ff 50%, #f0fdf4 100%)' }}
    >
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-30" style={{ background: 'radial-gradient(circle, #bfdbfe 0%, transparent 70%)' }} />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full opacity-25" style={{ background: 'radial-gradient(circle, #ddd6fe 0%, transparent 70%)' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #a5f3fc 0%, transparent 70%)' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="relative z-10 bg-white/80 backdrop-blur-xl border border-white/60 rounded-3xl shadow-2xl shadow-blue-500/10 max-w-lg w-full overflow-hidden"
      >
        <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, #2563eb, #7c3aed, #06b6d4)' }} />

        <div className="p-8">
          <button onClick={onBack} className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-sm mb-7 transition-colors font-semibold group">
            <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            Back to Dashboard
          </button>

          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, type: 'spring', stiffness: 300 }}
              className="w-20 h-20 rounded-3xl mx-auto mb-5 flex items-center justify-center relative"
              style={{ background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)', boxShadow: '0 0 40px rgba(99, 102, 241, 0.3), 0 8px 24px rgba(37, 99, 235, 0.25)' }}
            >
              <Brain className="w-10 h-10 text-white" />
              <motion.div
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center"
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <span className="text-white text-[8px] font-black">✓</span>
              </motion.div>
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="text-2xl font-black text-slate-900 mb-2">
              Ready to Begin?
            </motion.h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.32 }} className="text-slate-500 text-sm font-medium">
              Your AI interviewer is configured and ready. Good luck! 🚀
            </motion.p>
          </div>

          {/* Session details */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 }} className="bg-slate-50/80 rounded-2xl border border-slate-100 p-4 mb-6">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Type</span>
                <p className="text-slate-800 text-sm font-bold mt-0.5">{TYPE_LABEL[session.interview_type] ?? session.interview_type}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Difficulty</span>
                <p className="mt-0.5">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${DIFFICULTY_BADGE[session.difficulty] ?? 'badge-indigo'}`}>
                    {session.difficulty.charAt(0).toUpperCase() + session.difficulty.slice(1)}
                  </span>
                </p>
              </div>
              {session.target_company && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Company</span>
                  <p className="text-slate-800 text-sm font-bold mt-0.5">{session.target_company}</p>
                </div>
              )}
              {session.focus_area && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Focus</span>
                  <p className="text-slate-800 text-sm font-bold mt-0.5">{session.focus_area}</p>
                </div>
              )}
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Duration</span>
                <p className="text-slate-800 text-sm font-bold mt-0.5">{session.duration_minutes} minutes</p>
              </div>
            </div>
          </motion.div>

          {/* Ready checks */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }} className="flex flex-col gap-2 mb-7">
            {READY_CHECKS.map((c, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + i * 0.08 }} className="flex items-center gap-2.5 text-sm">
                <div className={`w-6 h-6 rounded-lg ${c.bg} flex items-center justify-center flex-shrink-0`}>
                  <c.icon className={`w-3.5 h-3.5 ${c.color}`} />
                </div>
                <span className="text-slate-600 font-medium">{c.label}</span>
                <CheckCircle className="w-4 h-4 text-emerald-500 ml-auto flex-shrink-0" />
              </motion.div>
            ))}
          </motion.div>

          {chatError && <div className="alert-error mb-4 text-sm font-medium">{chatError}</div>}

          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.75 }}
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.98 }}
            onClick={onStart}
            disabled={isStarting}
            className="w-full py-4 rounded-2xl text-sm font-black flex items-center justify-center gap-2.5 disabled:opacity-60 transition-all"
            style={{
              background: isStarting ? '#64748b' : 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
              boxShadow: isStarting ? 'none' : '0 8px 30px rgba(99, 102, 241, 0.35)',
              color: 'white',
            }}
          >
            {isStarting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Preparing Room…
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Start Interview
                <Sparkles className="w-4 h-4 opacity-80" />
              </>
            )}
          </motion.button>

          {onCancel && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.85 }}
              onClick={onCancel}
              disabled={isCancelling || isStarting}
              className="w-full mt-3 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-50 transition-all"
            >
              {isCancelling ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Cancelling…
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4" />
                  Cancel Session
                </>
              )}
            </motion.button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
