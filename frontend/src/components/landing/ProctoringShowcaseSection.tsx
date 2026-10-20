'use client';

import React from 'react';
import { Shield, Eye, Cpu, Lock, CheckCircle2 } from 'lucide-react';

/**
 * Section highlighting DevMeet's client-side Edge AI proctoring architecture.
 * Explains privacy, latency advantages, and anti-cheating capabilities.
 */
export function ProctoringShowcaseSection() {
  return (
    <section id="how-it-works" className="py-20 px-6 bg-slate-100/50 border-y border-slate-200/60">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-xs font-bold text-indigo-600 mb-4">
              <Shield className="w-3.5 h-3.5" />
              <span>Edge AI & Anti-Cheating Technology</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
              Real-Time Proctoring Built Directly in Your Browser
            </h2>
            <p className="text-sm sm:text-base text-slate-600 mt-4 leading-relaxed font-medium">
              DevMeet uses client-side WebAssembly models (Google MediaPipe Face Mesh and TensorFlow.js) to evaluate presence and anti-cheating heuristics with zero camera video uploads to external servers.
            </p>

            <div className="space-y-4 mt-8">
              <div className="flex items-start gap-3.5">
                <div className="p-2 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 shrink-0 mt-0.5">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">100% Private Video</h4>
                  <p className="text-xs text-slate-500 mt-0.5 font-medium">
                    Raw webcam frames never leave your computer. Feature tensors are calculated locally in browser memory.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 shrink-0 mt-0.5">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Zero Server Latency</h4>
                  <p className="text-xs text-slate-500 mt-0.5 font-medium">
                    Instant 60 FPS face mesh tracking without network round-trips or expensive GPU server delays.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="p-2 rounded-xl bg-purple-50 border border-purple-100 text-purple-600 shrink-0 mt-0.5">
                  <Eye className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Tab-Switch & AFK Detection</h4>
                  <p className="text-xs text-slate-500 mt-0.5 font-medium">
                    Intelligent session auto-pauses when switching tabs to ensure mock evaluations mirror strict real-world assessments.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                Proctor Heuristics Engine
              </div>
              <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                MEDIA_PIPE_v0.10
              </span>
            </div>

            <div className="space-y-4 font-mono text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <span className="text-slate-600">FACE COUNT:</span>
                <span className="font-bold text-emerald-600">1 (VERIFIED)</span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <span className="text-slate-600">HEAD POSE YAW:</span>
                <span className="font-bold text-blue-600">-0.04 RAD (CENTER)</span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <span className="text-slate-600">OBJECT PROCTOR:</span>
                <span className="font-bold text-emerald-600">CLEAN DESK</span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <span className="text-slate-600">WINDOW STATE:</span>
                <span className="font-bold text-purple-600">FULLSCREEN LOCKED</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ProctoringShowcaseSection;
