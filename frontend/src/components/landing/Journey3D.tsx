'use client';

import React, { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Brain, ShieldCheck, Cpu, Database, Sparkles, Send, Laptop, CheckCircle2 } from 'lucide-react';

interface Stage {
  id: number;
  title: string;
  badge: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  borderColor: string;
  details: string[];
  mockData: React.ReactNode;
}

const STAGES: Stage[] = [
  {
    id: 1,
    title: "1. Pick the Arena",
    badge: "CHOOSE FORMAT",
    description: "Candidates select their specialized track, difficulty levels, and target FAANG/startup templates.",
    icon: Laptop,
    accentColor: "from-blue-500 to-cyan-500",
    borderColor: "border-blue-200/50 hover:border-blue-400",
    details: ["Algorithms (DSA)", "System Architecture", "STAR Situational Coaching"],
    mockData: (
      <div className="bg-slate-900 rounded-xl p-3 text-[10px] font-mono text-slate-300 space-y-1.5 border border-slate-800 shadow-inner">
        <div className="flex items-center gap-1.5 border-b border-slate-800 pb-1">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="font-bold text-slate-400">arena_config.json</span>
        </div>
        <p className="text-blue-400">{"{"}</p>
        <p className="pl-3"><span className="text-sky-400">"track"</span>: <span className="text-amber-400">"system_design"</span>,</p>
        <p className="pl-3"><span className="text-sky-400">"difficulty"</span>: <span className="text-amber-400">"hard"</span>,</p>
        <p className="pl-3"><span className="text-sky-400">"company"</span>: <span className="text-amber-400">"Google"</span></p>
        <p className="text-blue-400">{"}"}</p>
      </div>
    ),
  },
  {
    id: 2,
    title: "2. Proctor Gatekeeper",
    badge: "SECURITY HANDSHAKE",
    description: "System runs checks for active tab visibility, clipboard usage, camera/mic checks, and background voice levels.",
    icon: ShieldCheck,
    accentColor: "from-indigo-500 to-purple-500",
    borderColor: "border-indigo-200/50 hover:border-indigo-400",
    details: ["Tab visibility hooks", "Suspicious object block", "Audio level waveform meter"],
    mockData: (
      <div className="bg-slate-900 rounded-xl p-3 text-[10px] font-mono text-slate-300 space-y-2 border border-slate-800 shadow-inner">
        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
          <span className="text-indigo-400 font-bold">Proctor Hub</span>
          <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[8px] font-bold">MONITORING</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
          <span className="text-[9px] text-slate-400">Camera Permission: Granted</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
          <span className="text-[9px] text-slate-400">Tab Switching Lock: Active</span>
        </div>
      </div>
    ),
  },
  {
    id: 3,
    title: "3. Live AI Challenges",
    badge: "DYNAMICS RUNTIME",
    description: "Engage with our real-time voice and code agent. Solve DSA loops with dynamic hint systems.",
    icon: Cpu,
    accentColor: "from-pink-500 to-rose-500",
    borderColor: "border-pink-200/50 hover:border-pink-400",
    details: ["Real-time audio synthesis", "Docker sandboxed execution", "3-level adaptive hints"],
    mockData: (
      <div className="bg-slate-900 rounded-xl p-3 text-[10px] font-mono text-slate-300 space-y-2 border border-slate-800 shadow-inner">
        <div className="flex items-center gap-2 text-pink-400">
          <Sparkles className="w-3.5 h-3.5" />
          <span className="font-bold">AI Evaluator</span>
        </div>
        <p className="text-slate-400 italic">"Can you optimize the recursive Fibonacci loop to O(N) using dynamic programming?"</p>
        <div className="flex items-center gap-1.5 bg-pink-950/20 border border-pink-900/40 rounded p-1.5 text-[8px]">
          <span className="text-pink-400 font-bold">System:</span>
          <span>256MB memory boundary verified.</span>
        </div>
      </div>
    ),
  },
  {
    id: 4,
    title: "4. Recruiter Pipeline",
    badge: "B2B INTEGRATIONS",
    description: "Sync evaluation scorecards, transcripts, and session videos to Ashby, Greenhouse, and Slack.",
    icon: Database,
    accentColor: "from-emerald-500 to-teal-500",
    borderColor: "border-emerald-200/50 hover:border-emerald-400",
    details: ["Greenhouse Harvest API", "WeasyPrint PDFs", "Custom Developer Webhooks"],
    mockData: (
      <div className="bg-slate-900 rounded-xl p-3 text-[10px] font-mono text-slate-300 space-y-2 border border-slate-800 shadow-inner">
        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
          <span className="text-emerald-400 font-bold">Ashby Integration</span>
          <span className="text-emerald-400 font-bold">100%</span>
        </div>
        <div className="flex items-center gap-1.5 text-[9px]">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>Scorecard synced successfully</span>
        </div>
        <div className="flex items-center gap-1.5 text-[9px]">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>PDF report uploaded to S3</span>
        </div>
      </div>
    ),
  },
];

export default function Journey3D() {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  const handleMouseMove = useCallback((e: React.MouseEvent, index: number) => {
    const card = cardRefs.current[index];
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) / rect.width - 0.5;
    const mouseY = (e.clientY - rect.top) / rect.height - 0.5;

    const rotateX = -mouseY * 18;
    const rotateY = mouseX * 18;

    card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.03, 1.03, 1.03) translateZ(10px)`;
    card.style.transition = 'none';
  }, []);

  const handleMouseLeave = useCallback((index: number) => {
    const card = cardRefs.current[index];
    if (card) {
      card.style.transform = 'rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1) translateZ(0)';
      card.style.transition = 'transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94), box-shadow 0.5s';
    }
    setHoveredIndex(null);
  }, []);

  return (
    <section className="py-20 bg-slate-50 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="text-center mb-16">
          <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 border border-blue-200">
            Interactive Product Story
          </span>
          <h2 className="text-3xl md:text-5xl font-black tracking-tight mt-4 text-slate-900">
            The Product Journey: <span className="text-blue-600">DevMeet In 3D</span>
          </h2>
          <p className="text-slate-600 max-w-xl mx-auto mt-4 text-sm font-semibold leading-relaxed">
            Hover over the stages below. Feel the smooth depth perspective as you navigate our platform's features from setup to automated HR pipeline integrations.
          </p>
        </div>

        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          style={{ perspective: '1200px' }}
        >
          {STAGES.map((stage, idx) => {
            const Icon = stage.icon;

            return (
              <motion.div
                key={stage.id}
                ref={(el) => { cardRefs.current[idx] = el; }}
                onMouseMove={(e) => handleMouseMove(e, idx)}
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => handleMouseLeave(idx)}
                style={{ transformStyle: 'preserve-3d' }}
                className={`bg-white border ${stage.borderColor} rounded-3xl p-6 flex flex-col justify-between shadow-md hover:shadow-2xl transition-all duration-350 cursor-pointer h-[440px]`}
              >
                <div style={{ transform: 'translateZ(20px)', transformStyle: 'preserve-3d' }}>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-widest">
                      {stage.badge}
                    </span>
                    <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${stage.accentColor} flex items-center justify-center text-white shadow-md`}>
                      <Icon className="w-4 h-4" />
                    </div>
                  </div>

                  <div className="mt-4">
                    <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                      {stage.title}
                    </h3>
                    <p className="text-xs text-slate-500 font-semibold leading-relaxed mt-2">
                      {stage.description}
                    </p>
                  </div>

                  <ul className="mt-4 space-y-1.5">
                    {stage.details.map((detail, dIdx) => (
                      <li key={dIdx} className="flex items-center gap-1.5 text-[10px] text-slate-650 font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        {detail}
                      </li>
                    ))}
                  </ul>
                </div>

                <div
                  className="mt-6"
                  style={{ transform: 'translateZ(30px)' }}
                >
                  {stage.mockData}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
