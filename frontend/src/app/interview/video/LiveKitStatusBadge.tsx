'use client';

import React from 'react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

interface LiveKitStatusBadgeProps {
  status: 'disconnected' | 'connecting' | 'connected' | 'failed' | string;
  isMockMode?: boolean;
}

/**
 * Compact pill badge indicating LiveKit WebRTC connection state.
 */
export function LiveKitStatusBadge({ status, isMockMode = false }: LiveKitStatusBadgeProps) {
  if (status === 'connected') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        {isMockMode ? 'LiveKit Simulated' : 'LiveKit Connected'}
      </span>
    );
  }

  if (status === 'connecting') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
        <RefreshCw className="w-2.5 h-2.5 animate-spin" />
        Connecting...
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
      <WifiOff className="w-2.5 h-2.5" />
      {status === 'failed' ? 'Connection Failed' : 'Offline'}
    </span>
  );
}

export default LiveKitStatusBadge;
