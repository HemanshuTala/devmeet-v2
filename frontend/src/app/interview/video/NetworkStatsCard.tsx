'use client';

import React from 'react';
import { Signal, Activity, Clock3, Zap } from 'lucide-react';

interface NetworkStatsCardProps {
  latency: number;
  packetLoss: number;
  bandwidth: number;
  signal: {
    label: string;
    color: string;
    dot: string;
  };
  connStatus: string;
  isMockMode: boolean;
  livekitUrl?: string;
}

/**
 * Diagnostic card showing WebRTC and LiveKit connection telemetry:
 * - Round-trip latency (RTT in ms)
 * - Packet loss percentage
 * - Real-time upstream bandwidth (Mbps)
 * - Connection mode (LiveKit Cloud vs Local Mock Sandbox)
 */
export function NetworkStatsCard({
  latency,
  packetLoss,
  bandwidth,
  signal,
  connStatus,
  isMockMode,
  livekitUrl,
}: NetworkStatsCardProps) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3.5 text-xs text-slate-300">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <span className="font-bold text-white flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
          <Signal className="w-3.5 h-3.5 text-blue-400" />
          Network Diagnostics
        </span>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${signal.dot}`} />
          <span className={`font-bold ${signal.color}`}>{signal.label}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
          <div className="flex items-center gap-1 text-[10px] text-slate-400 font-semibold mb-0.5">
            <Clock3 className="w-3 h-3 text-blue-400" />
            Latency
          </div>
          <span className="text-base font-extrabold text-white">{latency}</span>
          <span className="text-[10px] text-slate-400 ml-0.5">ms</span>
        </div>

        <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
          <div className="flex items-center gap-1 text-[10px] text-slate-400 font-semibold mb-0.5">
            <Activity className="w-3 h-3 text-amber-400" />
            Loss
          </div>
          <span className="text-base font-extrabold text-white">{packetLoss.toFixed(1)}</span>
          <span className="text-[10px] text-slate-400 ml-0.5">%</span>
        </div>

        <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
          <div className="flex items-center gap-1 text-[10px] text-slate-400 font-semibold mb-0.5">
            <Zap className="w-3 h-3 text-emerald-400" />
            Bandwidth
          </div>
          <span className="text-base font-extrabold text-white">{bandwidth.toFixed(1)}</span>
          <span className="text-[10px] text-slate-400 ml-0.5">Mb/s</span>
        </div>
      </div>

      <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1">
        <span>Engine:</span>
        <span className="font-semibold text-slate-200">
          {isMockMode ? 'LiveKit Sandbox (Mock Mode)' : `LiveKit Cloud (${livekitUrl || 'Connected'})`}
        </span>
      </div>
    </div>
  );
}

export default NetworkStatsCard;
