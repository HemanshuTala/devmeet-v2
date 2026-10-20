'use client';

import React from 'react';
import {
  Brain,
  Search,
  Bell,
  Mic,
  MicOff,
  Video,
  MessageSquare,
  MoreHorizontal,
  PhoneOff,
  Users,
  CheckCircle,
  Clock,
  Sparkles,
} from 'lucide-react';

/**
 * Interactive preview mockup of the DevMeet interview room and meeting HUD.
 * Renders on the landing page to give candidates an authentic view of the software experience.
 */
export function InterviewStudioMockup() {
  return (
    <div className="w-full max-w-5xl bg-slate-100/60 rounded-3xl p-2 sm:p-4 shadow-2xl border border-blue-100/40 backdrop-blur-sm z-10 overflow-hidden">
      {/* Inner client window */}
      <div className="bg-[#f8fafd] rounded-2xl border border-white shadow-inner overflow-hidden flex flex-col">
        {/* Header bar */}
        <div className="bg-white border-b border-slate-200/60 px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <span className="font-extrabold text-sm tracking-tight text-slate-800">
              DevMeet Studio
            </span>
          </div>

          {/* Navigation Items */}
          <div className="hidden sm:flex items-center gap-4 bg-slate-100/80 rounded-lg p-1 text-[11px] font-bold text-slate-600">
            <span className="bg-white text-slate-900 px-3 py-1 rounded-md shadow-sm">Overview</span>
            <span className="px-3 py-1 hover:text-slate-900">Live Code</span>
            <span className="px-3 py-1 hover:text-slate-900">STAR Metrics</span>
          </div>

          {/* Status area */}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              LiveKit Room Active
            </span>
          </div>
        </div>

        {/* Subheader banner */}
        <div className="bg-slate-50/50 border-b border-slate-200/40 px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Senior Full-Stack Engineer Mock Session
            </h3>
            <p className="text-[11px] text-slate-500 font-medium">
              Real-time speech recognition, Python execution sandbox, and automated STAR feedback.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-xs flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              28:45 Remaining
            </span>
          </div>
        </div>

        {/* Studio Content Grid */}
        <div className="p-4 grid grid-cols-1 lg:grid-cols-10 gap-4">
          {/* Video Feed Simulation (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <div className="relative aspect-[16/9] w-full rounded-xl bg-slate-950 overflow-hidden shadow-md group border border-slate-800">
              <div className="absolute inset-0 bg-gradient-to-b from-slate-900 to-slate-950 flex flex-col items-center justify-center p-6">
                <div className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-full border-2 border-blue-500/30 bg-slate-800/80 flex items-center justify-center shadow-2xl">
                  <Users className="w-10 h-10 text-slate-400" />
                  <div className="absolute inset-0 rounded-full border-t border-blue-400 animate-pulse" />
                </div>

                {/* HUD stats overlay */}
                <div className="absolute bottom-14 left-4 font-mono text-[9px] text-slate-300 flex flex-col gap-1 bg-slate-950/80 backdrop-blur-sm p-2 rounded-lg border border-white/10">
                  <div>GAZE STATE: <span className="text-emerald-400 font-bold">ALIGNED (0.98)</span></div>
                  <div>WEBRTC RTT: <span className="text-blue-400 font-bold">38 MS</span></div>
                  <div>LIVEKIT SFU: <span className="text-emerald-400 font-bold">CONNECTED</span></div>
                </div>
              </div>

              {/* Candidate Info Overlay */}
              <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 flex items-center gap-2 text-[10px] text-white font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Alex Morgan (Candidate)
              </div>

              {/* Mini AI Interviewer Overlay Feed */}
              <div className="absolute top-3 right-3 w-28 sm:w-36 aspect-[4/3] rounded-lg bg-slate-900 border border-white/20 shadow-lg overflow-hidden z-20 flex flex-col items-center justify-center">
                <Brain className="w-6 h-6 text-blue-400 mb-1" />
                <span className="text-[9px] font-bold text-white">AI Interviewer</span>
              </div>

              {/* Bottom camera control bar */}
              <div className="absolute bottom-3 inset-x-0 flex items-center justify-center gap-2">
                <div className="bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-white/10 text-white"><Mic className="w-3.5 h-3.5" /></span>
                  <span className="p-1.5 rounded-lg bg-white/10 text-white"><Video className="w-3.5 h-3.5" /></span>
                  <span className="p-1.5 rounded-lg bg-white/10 text-white"><MessageSquare className="w-3.5 h-3.5" /></span>
                  <span className="p-1.5 rounded-lg bg-red-600 text-white"><PhoneOff className="w-3.5 h-3.5" /></span>
                </div>
              </div>
            </div>

            {/* Quick Live Transcript Box */}
            <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800 mb-2">
                <Sparkles className="w-4 h-4 text-blue-600" />
                Live Conversation Stream
              </div>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                <strong className="text-blue-600">AI:</strong> &ldquo;Let&apos;s look at the time complexity of your caching implementation. How does LRU cache eviction perform under high-concurrency write workloads?&rdquo;
              </p>
            </div>
          </div>

          {/* Right Column: Code Editor & Score HUD (3 cols) */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            {/* Live Scoring Card */}
            <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs space-y-3">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Predicted Assessment
              </h4>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-[11px] font-semibold text-slate-600 mb-1">
                    <span>Problem Solving</span>
                    <span className="text-emerald-600 font-bold">92%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: '92%' }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] font-semibold text-slate-600 mb-1">
                    <span>Code Efficiency</span>
                    <span className="text-blue-600 font-bold">88%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full" style={{ width: '88%' }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] font-semibold text-slate-600 mb-1">
                    <span>System Design</span>
                    <span className="text-blue-600 font-bold">90%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full" style={{ width: '90%' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Checklist */}
            <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs space-y-2.5">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Evaluation Criteria
              </h4>
              <ul className="text-xs space-y-2 text-slate-600 font-medium">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  Identified O(1) cache lookup
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  Doubly linked list eviction
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  Mutex lock for concurrency
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default InterviewStudioMockup;
