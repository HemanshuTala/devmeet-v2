'use client';

import React from 'react';
import { AlertTriangle, RefreshCw, VideoOff, ShieldCheck } from 'lucide-react';

interface ProctorOverlaysProps {
  /** Active cheating / face detection warning message */
  activeWarning: string | null;
  /** Performance / blur warning if WebGL acceleration is slow */
  blurPerformanceWarning: string | null;
  /** Status flag indicating if MediaPipe & COCO-SSD models have finished loading */
  modelsLoaded: boolean;
  /** Whether proctoring is operating in standard lightweight fallback mode */
  isDegraded?: boolean;
  /** Proctoring error message if any */
  proctorError?: string | null;
  /** Whether the candidate's camera track is currently active */
  videoActive: boolean;
  /** Callback to dismiss non-critical warning banners */
  onDismissBlurWarning: () => void;
  size?: 'sm' | 'md';
}

/**
 * Renders warning banners, camera-disabled overlays, and non-blocking ML model status.
 * Operates on top of the candidate video canvas.
 */
export function ProctorOverlays({
  activeWarning,
  blurPerformanceWarning,
  modelsLoaded,
  isDegraded = false,
  proctorError,
  videoActive,
  onDismissBlurWarning,
  size = 'sm',
}: ProctorOverlaysProps) {
  const isSmall = size === 'sm';

  return (
    <>
      {/* Real-time active violation / warning banner */}
      {activeWarning && (
        <div
          role="alert"
          className={`absolute ${
            isSmall ? 'top-10 left-2 right-2' : 'top-12 left-3 right-3'
          } z-20 bg-rose-600/90 backdrop-blur-md border border-rose-500 text-white ${
            isSmall ? 'text-[9px] py-1 px-2 rounded-lg' : 'text-xs py-2 px-3 rounded-xl'
          } font-bold flex items-center gap-1.5 shadow-lg animate-pulse`}
        >
          <AlertTriangle className={`${isSmall ? 'w-3 h-3' : 'w-4 h-4'} shrink-0`} />
          <span className={isSmall ? 'truncate' : ''}>{activeWarning}</span>
        </div>
      )}

      {/* Performance Warning banner */}
      {blurPerformanceWarning && (
        <div
          role="alert"
          className={`absolute ${
            isSmall ? 'top-10 left-2 right-2' : 'top-12 left-3 right-3'
          } z-20 bg-amber-600/90 backdrop-blur-md border border-amber-500 text-white ${
            isSmall ? 'text-[9px] py-1 px-2 rounded-lg' : 'text-xs py-2 px-3 rounded-xl'
          } font-bold flex items-center justify-between gap-1 shadow-lg`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertTriangle className={`${isSmall ? 'w-3 h-3' : 'w-4 h-4'} shrink-0`} />
            <span className="truncate">{blurPerformanceWarning}</span>
          </div>
          <button
            onClick={onDismissBlurWarning}
            aria-label="Dismiss warning"
            className="text-white hover:text-amber-200 font-bold ml-1 px-1"
          >
            &times;
          </button>
        </div>
      )}

      {/* Non-blocking initial loading spinner: ONLY show before timeout and if no error occurred */}
      {!modelsLoaded && !isDegraded && !proctorError && (
        <div
          className={`absolute bottom-2 left-2 z-20 bg-slate-900/80 backdrop-blur-md border border-slate-700/80 text-white rounded-lg px-2 py-1 flex items-center gap-1.5 text-[10px] font-medium shadow-md`}
        >
          <RefreshCw className="w-2.5 h-2.5 text-indigo-400 animate-spin" />
          <span>Calibrating AI Proctor...</span>
        </div>
      )}

      {/* Camera disabled state */}
      {!videoActive && (
        <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center gap-2 z-30">
          <div
            className={`${
              isSmall ? 'w-8 h-8' : 'w-14 h-14'
            } rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center`}
          >
            <VideoOff className={`${isSmall ? 'w-3.5 h-3.5' : 'w-6 h-6'} text-slate-500`} />
          </div>
          <p className={`${isSmall ? 'text-[9px]' : 'text-xs'} text-slate-400 font-bold`}>
            Camera paused
          </p>
        </div>
      )}
    </>
  );
}

export default ProctorOverlays;
