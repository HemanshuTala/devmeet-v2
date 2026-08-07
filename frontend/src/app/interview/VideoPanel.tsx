'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Video as VideoIcon, VideoOff, Mic, MicOff, WifiOff, Layers,
  AlertCircle, AlertTriangle, ShieldCheck, RefreshCw, Play, Square,
  Volume2, Signal, Zap, Clock3, Settings,
} from 'lucide-react';
import { videoApi, userApi } from '@/lib/api';
import RecordingConsentModal from '@/components/interview/RecordingConsentModal';
import { useMediaStream } from './hooks/useMediaStream';
import { useProctoring } from './hooks/useProctoring';
import { useWebRTC } from './hooks/useWebRTC';
import { useAudioLevel } from './hooks/useAudioLevel';

interface VideoPanelProps {
  sessionId: string;
  userDisplayName?: string;
  userId?: string;
  isActive: boolean;
  aiState: 'speaking' | 'thinking' | 'idle';
  compact?: boolean;
  onProctorViolation?: (type: string, message: string) => void;
}

function AudioLevelMeter({ subscribe, size = 'sm' }: { subscribe: (cb: (level: number) => void) => () => void; size?: 'sm' | 'md' }) {
  const dotsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const dots = size === 'sm' ? [1, 2, 3, 4] : [1, 2, 3, 4, 5];
  const step = size === 'sm' ? 25 : 20;
  const baseH = size === 'sm' ? 2 : 2;
  const stepH = size === 'sm' ? 1 : 1.5;

  useEffect(() => {
    return subscribe((level) => {
      dotsRef.current.forEach((el, i) => {
        if (!el) return;
        const d = dots[i];
        const active = level >= d * step;
        el.className = `${size === 'sm' ? 'w-0.5' : 'w-1'} rounded-full transition-all duration-100 ${
          active ? 'bg-emerald-400 shadow-[0_0_3px_rgba(52,211,153,0.8)]' : size === 'sm' ? 'bg-slate-750' : 'bg-slate-800'
        }`;
      });
    });
  }, [subscribe, size]);

  return (
    <div className={`flex items-end gap-0.5 ${size === 'sm' ? 'h-2.5 w-6 px-0.5' : 'h-3.5 w-12 px-0.5'}`}>
      {dots.map((d, i) => (
        <span
          key={d}
          ref={(el) => { dotsRef.current[i] = el; }}
          className={`${size === 'sm' ? 'w-0.5' : 'w-1'} rounded-full transition-all duration-100 ${size === 'sm' ? 'bg-slate-750' : 'bg-slate-800'}`}
          style={{ height: `${baseH + d * stepH}px` }}
        />
      ))}
    </div>
  );
}

function DeviceSettingsOverlay({
  videoDevices, audioDevices, selectedVideoId, selectedAudioId,
  onChangeVideo, onChangeAudio, onClose, size = 'sm',
}: {
  videoDevices: any[]; audioDevices: any[];
  selectedVideoId: string; selectedAudioId: string;
  onChangeVideo: (id: string) => void; onChangeAudio: (id: string) => void;
  onClose: () => void; size?: 'sm' | 'md';
}) {
  const isSmall = size === 'sm';
  return (
    <div className={`absolute inset-0 ${isSmall ? 'bg-slate-950/95 z-20' : 'bg-slate-905/95 z-20'} flex flex-col justify-center ${isSmall ? 'p-3 gap-1.5' : 'p-6 gap-3.5'} text-white ${isSmall ? 'text-[9px]' : 'text-xs'} leading-tight select-none`}>
      <div className={`flex items-center justify-between border-b ${isSmall ? 'border-white/10 pb-1 mb-1' : 'border-slate-800 pb-2 mb-1'}`}>
        <span className={`font-bold ${isSmall ? 'text-slate-200' : 'text-slate-100'} uppercase tracking-wider ${!isSmall && 'text-xs'}`}>
          Device Settings
        </span>
        <button onClick={onClose} className={`text-slate-400 hover:text-white font-extrabold ${isSmall ? 'text-[10px] bg-slate-900 border border-slate-700 rounded px-1' : 'bg-slate-800 border border-slate-700 rounded-lg px-2 py-0.5 text-xs transition-colors'}`}>
          {isSmall ? 'X' : 'Close'}
        </button>
      </div>
      <div className={`flex flex-col ${isSmall ? 'gap-1' : 'gap-1.5'}`}>
        <span className="text-slate-400 font-semibold">Camera Source</span>
        <select
          value={selectedVideoId}
          onChange={(e) => onChangeVideo(e.target.value)}
          className={`${isSmall ? 'bg-slate-900 border border-white/15 rounded px-1 py-0.5' : 'bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5'} text-white outline-none focus:border-blue-500 w-full`}
        >
          {videoDevices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 5)}`}</option>)}
          {videoDevices.length === 0 && <option value="">No cameras found</option>}
        </select>
      </div>
      <div className={`flex flex-col ${isSmall ? 'gap-1' : 'gap-1.5'}`}>
        <span className="text-slate-400 font-semibold">Microphone Source</span>
        <select
          value={selectedAudioId}
          onChange={(e) => onChangeAudio(e.target.value)}
          className={`${isSmall ? 'bg-slate-900 border border-white/15 rounded px-1 py-0.5' : 'bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5'} text-white outline-none focus:border-blue-500 w-full`}
        >
          {audioDevices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0, 5)}`}</option>)}
          {audioDevices.length === 0 && <option value="">No microphones found</option>}
        </select>
      </div>
    </div>
  );
}

function ProctorOverlays({ activeWarning, blurPerformanceWarning, modelsLoaded, videoActive, onDismissBlurWarning, size = 'sm' }: {
  activeWarning: string | null; blurPerformanceWarning: string | null;
  modelsLoaded: boolean; videoActive: boolean;
  onDismissBlurWarning: () => void; size?: 'sm' | 'md';
}) {
  const isSmall = size === 'sm';
  return (
    <>
      {activeWarning && (
        <div className={`absolute ${isSmall ? 'top-10 left-2 right-2' : 'top-12 left-3 right-3'} z-20 bg-rose-600/90 backdrop-blur-md border border-rose-500 text-white ${isSmall ? 'text-[9px] py-1 px-2 rounded-lg' : 'text-xs py-2 px-3 rounded-xl'} font-bold flex items-center gap-${isSmall ? '1.5' : '2'} shadow-lg animate-pulse`}>
          <AlertTriangle className={`${isSmall ? 'w-3 h-3' : 'w-4 h-4'} shrink-0`} />
          <span className={isSmall ? 'truncate' : ''}>{activeWarning}</span>
        </div>
      )}
      {blurPerformanceWarning && (
        <div className={`absolute ${isSmall ? 'top-10 left-2 right-2' : 'top-12 left-3 right-3'} z-20 bg-amber-600/90 backdrop-blur-md border border-amber-500 text-white ${isSmall ? 'text-[9px] py-1 px-2 rounded-lg' : 'text-xs py-2 px-3 rounded-xl'} font-bold flex items-center justify-between gap-${isSmall ? '1' : '2'} shadow-lg`}>
          <div className={`flex items-center gap-${isSmall ? '1' : '2'} min-w-0`}>
            <AlertTriangle className={`${isSmall ? 'w-3 h-3' : 'w-4 h-4'} shrink-0`} />
            <span className="truncate">{blurPerformanceWarning}</span>
          </div>
          <button onClick={onDismissBlurWarning} className={`text-white hover:text-amber-200 font-bold ${isSmall ? 'ml-1 px-1' : 'ml-2 px-2'}`}>&times;</button>
        </div>
      )}
      {!modelsLoaded && (
        <div className={`absolute inset-0 ${isSmall ? 'bg-slate-950/70' : 'bg-slate-950/80'} backdrop-blur-sm z-30 flex flex-col items-center justify-center gap-${isSmall ? '1 p-2' : '2 p-4'} text-center`}>
          <RefreshCw className={`${isSmall ? 'w-4 h-4 text-indigo-450' : 'w-6 h-6 text-indigo-400'} animate-spin`} />
          <p className={`${isSmall ? 'text-[9px]' : 'text-xs'} text-indigo-200 font-bold`}>Initializing Proctor AI...</p>
          {!isSmall && <p className="text-[10px] text-slate-400 leading-relaxed max-w-[200px]">Loading client-side gaze tracker and object proctor (0% server upload, private &amp; fast)</p>}
        </div>
      )}
      {!videoActive && (
        <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center gap-2 z-30">
          <div className={`${isSmall ? 'w-8 h-8' : 'w-14 h-14'} rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center`}>
            <VideoOff className={`${isSmall ? 'w-3.5 h-3.5' : 'w-6 h-6'} text-slate-500`} />
          </div>
          <p className={`${isSmall ? 'text-[9px]' : 'text-xs'} text-slate-550 font-bold`}>Camera paused</p>
        </div>
      )}
    </>
  );
}

function AIAvatarState({ aiState, size = 'md' }: { aiState: string; size?: 'sm' | 'md' }) {
  const isSmall = size === 'sm';
  const bars = isSmall ? [3, 6, 4, 8, 5] : [4, 8, 5, 10, 6, 9, 4];
  if (aiState === 'speaking') {
    return (
      <div className={`flex items-end gap-${isSmall ? '0.5' : '1'} ${isSmall ? 'h-5 px-0.5' : 'h-9 px-1'}`}>
        {bars.map((h, i) => (
          <span
            key={i}
            className={`${isSmall ? 'w-0.5' : 'w-1'} bg-blue-${isSmall ? '500' : '400'} rounded-full`}
            style={{ height: `${h * (isSmall ? 1.6 : 1)}px`, animation: `soundwave ${0.6 + i * 0.1}s ease-in-out infinite alternate`, animationDelay: `${i * 80}ms`, transformOrigin: 'bottom' }}
          />
        ))}
      </div>
    );
  }
  if (aiState === 'thinking') {
    return (
      <div className={`relative flex items-center justify-center ${isSmall ? 'w-5 h-5' : 'w-10 h-10'}`}>
        <div className={`${isSmall ? 'w-4 h-4' : 'w-8 h-8'} border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin`} />
        {!isSmall && <div className="absolute w-4 h-4 border-2 border-amber-400/20 border-b-amber-400 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.6s' }} />}
      </div>
    );
  }
  return <Volume2 className={`${isSmall ? 'w-4 h-4' : 'w-9 h-9'} text-slate-${isSmall ? '400' : '500'}`} />;
}

export default function VideoPanel({
  sessionId, userDisplayName = 'Candidate', userId = 'default-user',
  isActive, aiState, compact = false, onProctorViolation,
}: VideoPanelProps) {
  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 19)]);
  }, []);
  const [logs, setLogs] = useState<string[]>([]);

  const media = useMediaStream(addLog);
  const proctor = useProctoring(media.videoRef, media.stream, isActive, media.videoActive, onProctorViolation, addLog);
  const rtc = useWebRTC(sessionId, userId, userDisplayName, media.permissionStatus, addLog);
  const { levelRef: audioLevelRef, subscribe: audioSubscribe } = useAudioLevel(media.stream, media.audioActive);

  const [userPlan, setUserPlan] = useState('free');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingConsent, setRecordingConsent] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);

  useEffect(() => {
    userApi.getQuota().then((q) => { if (q?.plan) setUserPlan(q.plan.toLowerCase()); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (rtc.connStatus === 'failed') media.setUseAudioOnly(true);
  }, [rtc.connStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRecordingToggle = () => {
    if (!isActive) return;
    if (isRecording) {
      videoApi.stopRecording(`session_${sessionId}`, userId).catch(() => {});
      setIsRecording(false);
      addLog('Recording stopped. Upload queued to S3.');
    } else {
      setShowConsentModal(true);
    }
  };

  const confirmRecording = () => {
    setIsRecording(true);
    setRecordingConsent(true);
    setShowConsentModal(false);
    addLog('Recording started. Consent acknowledged and stored.');
  };

  const aiAvatarBorder = aiState === 'speaking'
    ? 'border-blue-500 shadow-[0_0_24px_rgba(59,130,246,0.35)]'
    : aiState === 'thinking'
    ? 'border-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.25)] animate-pulse'
    : 'border-slate-600';
  const aiAvatarBg = aiState === 'speaking' ? 'bg-blue-900/20' : aiState === 'thinking' ? 'bg-amber-900/20' : 'bg-slate-900';

  // ── Compact Mode ──
  if (compact) {
    const compactAvatarBorder = aiState === 'speaking'
      ? 'border-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.18)]'
      : aiState === 'thinking'
      ? 'border-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.12)] animate-pulse'
      : 'border-slate-200';
    const compactAvatarBg = aiState === 'speaking' ? 'bg-blue-50' : aiState === 'thinking' ? 'bg-amber-50/40' : 'bg-slate-50';

    return (
      <div className="h-full flex flex-row items-center bg-slate-50 p-3 gap-3 overflow-hidden select-none">
        {/* Candidate video */}
        <div className="h-full aspect-[16/9] relative bg-slate-950 rounded-xl overflow-hidden border border-slate-200 shadow-sm flex flex-col justify-center">
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 bg-slate-950/75 backdrop-blur-sm px-2 py-0.5 rounded-lg text-[9px] font-bold text-white">
            <span className={`w-1.5 h-1.5 rounded-full ${media.permissionStatus === 'granted' && media.videoActive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
            {userDisplayName}
          </div>

          {media.permissionStatus === 'granted' && !media.useAudioOnly ? (
            <div className="relative w-full h-full bg-slate-950">
              <video ref={media.videoRef} autoPlay playsInline muted className={`w-full h-full object-cover transition-all duration-300 ${proctor.backgroundBlur ? 'opacity-0' : ''}`} />
              <canvas ref={proctor.canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-10" />
              <ProctorOverlays
                activeWarning={proctor.activeWarning} blurPerformanceWarning={proctor.blurPerformanceWarning}
                modelsLoaded={proctor.modelsLoaded} videoActive={media.videoActive}
                onDismissBlurWarning={() => proctor.setBlurPerformanceWarning(null)} size="sm"
              />
            </div>
          ) : (
            <div className="flex-1 h-full flex flex-col items-center justify-center gap-1.5 p-3 bg-slate-950">
              {media.permissionStatus === 'checking' ? (
                // Camera init skeleton — shimmer pulse instead of black void
                <div className="w-full h-full flex flex-col items-center justify-center gap-2 relative overflow-hidden">
                  <div
                    style={{
                      position: 'absolute', inset: 0,
                      background: 'linear-gradient(90deg, #1e1e30 0%, #252535 50%, #1e1e30 100%)',
                      backgroundSize: '200% 100%',
                      animation: 'shimmer 2s linear infinite',
                    }}
                  />
                  <div className="relative z-10 flex flex-col items-center gap-1.5">
                    <div className="w-8 h-8 rounded-full bg-slate-800/80 border border-slate-600/40 flex items-center justify-center">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.901L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                      </svg>
                    </div>
                    <p className="text-[9px] text-slate-500 font-semibold animate-pulse">Initialising camera…</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center">
                    <VideoOff className="w-4 h-4 text-slate-500" />
                  </div>
                  {media.permissionStatus === 'denied' && (
                    <button onClick={media.requestPermissions} title={media.getPermissionInstructions()} className="bg-rose-600 hover:bg-rose-700 text-white font-bold py-1 px-2.5 rounded-lg text-[9px] transition-colors">Retry</button>
                  )}
                  {media.permissionStatus === 'prompt' && (
                    <button onClick={media.requestPermissions} className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-1 px-2.5 rounded-lg text-[9px] transition-all flex items-center gap-1 shadow-lg shadow-blue-900/30">
                      <ShieldCheck className="w-3 h-3" /> Enable
                    </button>
                  )}
                </>
              )}
            </div>
          )}


          {media.permissionStatus === 'granted' && media.audioActive && (
            <div className="absolute bottom-2 right-2 z-10 flex items-center gap-0.5 bg-slate-950/65 backdrop-blur-sm px-1.5 py-0.5 rounded text-[8px] text-emerald-450 font-bold" title="Microphone Level">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-0.5" />
              <AudioLevelMeter subscribe={audioSubscribe} size="sm" />
            </div>
          )}

          {showDeviceSettings && (
            <DeviceSettingsOverlay
              videoDevices={media.videoDevices} audioDevices={media.audioDevices}
              selectedVideoId={media.selectedVideoId} selectedAudioId={media.selectedAudioId}
              onChangeVideo={media.changeVideoDevice} onChangeAudio={media.changeAudioDevice}
              onClose={() => setShowDeviceSettings(false)} size="sm"
            />
          )}

          {media.permissionStatus === 'granted' && (
            <div className="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-1 z-10">
              <button onClick={media.toggleVideo} className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${media.videoActive ? 'bg-slate-950/85 hover:bg-slate-800 border-white/25 text-white' : 'bg-rose-600 border-rose-700 text-white'}`}>
                {media.videoActive ? <VideoIcon className="w-3 h-3" /> : <VideoOff className="w-3 h-3" />}
              </button>
              <button onClick={media.toggleAudio} className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${media.audioActive ? 'bg-slate-950/85 hover:bg-slate-800 border-white/25 text-white' : 'bg-rose-600 border-rose-700 text-white'}`}>
                {media.audioActive ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
              </button>
              <button onClick={() => setShowDeviceSettings(!showDeviceSettings)} title="Device Settings" className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${showDeviceSettings ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-950/85 hover:bg-slate-800 border-white/25 text-white'}`}>
                <Settings className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* AI Interviewer compact strip */}
        <div className="flex-1 h-full flex flex-row py-2 px-3 gap-3 items-center bg-white border border-slate-200/80 rounded-xl relative overflow-hidden shadow-sm">
          <div className={`relative w-11 h-11 shrink-0 rounded-full border-2 flex items-center justify-center transition-all duration-500 ${compactAvatarBorder} ${compactAvatarBg}`}>
            <AIAvatarState aiState={aiState} size="sm" />
          </div>
          <div className="flex-1 flex flex-col justify-center min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">AI Interviewer</span>
              {rtc.connStatus === 'connected' && (
                <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-600">
                  <span className={`w-1.5 h-1.5 rounded-full ${rtc.signal.dot === 'bg-emerald-400' ? 'bg-emerald-500' : rtc.signal.dot === 'bg-blue-400' ? 'bg-blue-500' : rtc.signal.dot === 'bg-amber-400' ? 'bg-amber-500' : 'bg-rose-500'} animate-pulse`} />
                  {rtc.signal.label}
                </span>
              )}
            </div>
            <p className={`text-xs font-bold mt-0.5 transition-colors duration-300 ${aiState === 'speaking' ? 'text-blue-600' : aiState === 'thinking' ? 'text-amber-600' : 'text-slate-600'}`}>
              {aiState === 'speaking' ? 'Speaking...' : aiState === 'thinking' ? 'Thinking...' : 'Listening'}
            </p>
          </div>
          {rtc.connStatus !== 'connected' && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-white/95 backdrop-blur-sm px-2 py-0.5 rounded border border-slate-200 text-[9px] font-semibold text-slate-500 shadow-sm">
              {rtc.connStatus === 'connecting' ? (
                <><RefreshCw className="w-2.5 h-2.5 text-amber-500 animate-spin" /><span className="text-amber-600">Connecting</span></>
              ) : (
                <><WifiOff className="w-2.5 h-2.5 text-rose-500" /><span className="text-rose-500">Disconnected</span></>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Full Mode ──
  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden select-none">
      <div className="flex-1 grid grid-rows-2 gap-0 min-h-0 border-b border-slate-800/60">
        {/* Candidate video panel */}
        <div className="relative bg-slate-950 border-b border-slate-800/60 overflow-hidden flex flex-col">
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-slate-950/80 backdrop-blur-sm px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-200 border border-slate-700/40">
            <span className={`w-2 h-2 rounded-full ${media.permissionStatus === 'granted' && media.videoActive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
            {userDisplayName}
          </div>

          {media.permissionStatus === 'granted' && !media.useAudioOnly ? (
            <div className="relative w-full h-full bg-slate-950">
              <video ref={media.videoRef} autoPlay playsInline muted className={`w-full h-full object-cover transition-all duration-300 ${proctor.backgroundBlur ? 'opacity-0' : ''}`} />
              <canvas ref={proctor.canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-10" />
              <ProctorOverlays
                activeWarning={proctor.activeWarning} blurPerformanceWarning={proctor.blurPerformanceWarning}
                modelsLoaded={proctor.modelsLoaded} videoActive={media.videoActive}
                onDismissBlurWarning={() => proctor.setBlurPerformanceWarning(null)} size="md"
              />
            </div>
          ) : (
            <div className="flex-1 h-full flex flex-col items-center justify-center gap-4 p-5 bg-slate-950">
              {media.permissionStatus === 'checking' ? (
                // Camera init skeleton — shimmer instead of black void
                <div className="w-full h-full flex flex-col items-center justify-center gap-3 relative overflow-hidden">
                  <div
                    style={{
                      position: 'absolute', inset: 0,
                      background: 'linear-gradient(90deg, #0d0d1a 0%, #1a1a2e 50%, #0d0d1a 100%)',
                      backgroundSize: '200% 100%',
                      animation: 'shimmer 2s linear infinite',
                    }}
                  />
                  <div className="relative z-10 flex flex-col items-center gap-3">
                    <div className="w-16 h-16 rounded-full bg-slate-800/60 border border-slate-600/30 flex items-center justify-center">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.901L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                      </svg>
                    </div>
                    <div className="flex flex-col items-center gap-1.5">
                      <p className="text-sm text-slate-400 font-semibold animate-pulse">Initialising camera…</p>
                      <p className="text-xs text-slate-600 font-medium">Allow camera access when prompted</p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center">
                    <VideoOff className="w-7 h-7 text-slate-500" />
                  </div>
                  {media.permissionStatus === 'denied' && (
                    <div className="flex flex-col items-center gap-3 text-center max-w-[220px]">
                      <div className="bg-rose-950/40 border border-rose-800/40 rounded-xl p-3 text-left text-[11px] space-y-1.5 text-rose-300">
                        <div className="flex items-center gap-1.5 font-bold text-rose-200">
                          <AlertTriangle className="w-3.5 h-3.5" /> Camera Blocked
                        </div>
                        <p className="text-slate-450 leading-relaxed font-semibold">{media.getPermissionInstructions()}</p>
                      </div>
                      <button onClick={media.requestPermissions} className="w-full bg-rose-900/60 hover:bg-rose-900 text-white font-bold py-2 px-4 rounded-xl text-xs transition-colors">
                        Retry Access
                      </button>
                    </div>
                  )}
                  {media.permissionStatus === 'prompt' && (
                    <div className="flex flex-col items-center gap-3 text-center">
                      <p className="text-xs text-slate-400 font-medium max-w-[180px] leading-relaxed">Allow camera &amp; microphone to enable video interview</p>
                      <button onClick={media.requestPermissions} className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 px-5 rounded-xl text-xs transition-all flex items-center gap-2 shadow-lg shadow-blue-900/30">
                        <ShieldCheck className="w-4 h-4" /> Enable Camera &amp; Mic
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {media.permissionStatus === 'granted' && media.audioActive && (
            <div className="absolute bottom-3 right-3 z-10 flex items-center gap-0.5 bg-slate-900/80 backdrop-blur-sm px-2 py-1 rounded-lg text-xs text-emerald-450 font-bold border border-slate-700/40" title="Microphone Level">
              <Mic className="w-3.5 h-3.5 mr-0.5 text-emerald-400" />
              <AudioLevelMeter subscribe={audioSubscribe} size="md" />
            </div>
          )}

          {showDeviceSettings && (
            <DeviceSettingsOverlay
              videoDevices={media.videoDevices} audioDevices={media.audioDevices}
              selectedVideoId={media.selectedVideoId} selectedAudioId={media.selectedAudioId}
              onChangeVideo={media.changeVideoDevice} onChangeAudio={media.changeAudioDevice}
              onClose={() => setShowDeviceSettings(false)} size="md"
            />
          )}

          {media.permissionStatus === 'granted' && (
            <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-2 z-10">
              <button onClick={media.toggleVideo} title={media.videoActive ? 'Turn off camera' : 'Turn on camera'} className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all shadow-lg ${media.videoActive ? 'bg-slate-800/90 hover:bg-slate-700 border-slate-600 text-slate-200' : 'bg-rose-600/90 hover:bg-rose-500 border-rose-500 text-white'}`}>
                {media.videoActive ? <VideoIcon className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              </button>
              <button onClick={media.toggleAudio} title={media.audioActive ? 'Mute' : 'Unmute'} className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all shadow-lg ${media.audioActive ? 'bg-slate-800/90 hover:bg-slate-700 border-slate-600 text-slate-200' : 'bg-rose-600/90 hover:bg-rose-500 border-rose-500 text-white'}`}>
                {media.audioActive ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              </button>
              <button onClick={() => proctor.setBackgroundBlur((b) => !b)} title="Blur background" className={`px-2.5 py-1.5 rounded-full border-2 text-[10px] font-bold transition-all flex items-center gap-1 ${proctor.backgroundBlur ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800/90 hover:bg-slate-700 border-slate-600 text-slate-300'}`}>
                <Layers className="w-3 h-3" /> Blur
              </button>
              <button onClick={() => setShowDeviceSettings(!showDeviceSettings)} title="Device Settings" className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all shadow-lg ${showDeviceSettings ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800/90 hover:bg-slate-700 border-slate-600 text-slate-350'}`}>
                <Settings className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* AI Interviewer panel */}
        <div className="relative flex flex-col items-center justify-center bg-slate-950 overflow-hidden">
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-slate-950/80 backdrop-blur-sm px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-200 border border-slate-700/40">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            AI Interviewer
          </div>

          <div className={`absolute inset-0 pointer-events-none transition-opacity duration-700 ${aiState === 'speaking' ? 'opacity-100' : 'opacity-0'}`}>
            <div className="absolute inset-0 bg-blue-500/[0.04]" />
          </div>
          <div className={`absolute inset-0 pointer-events-none transition-opacity duration-700 ${aiState === 'thinking' ? 'opacity-100' : 'opacity-0'}`}>
            <div className="absolute inset-0 bg-amber-400/[0.03]" />
          </div>

          <div className={`relative w-28 h-28 rounded-full border-2 flex items-center justify-center transition-all duration-500 ${aiAvatarBorder} ${aiAvatarBg}`}>
            <AIAvatarState aiState={aiState} size="md" />
          </div>

          <div className="mt-4 text-center px-4">
            <p className={`text-sm font-bold transition-colors duration-300 ${aiState === 'speaking' ? 'text-blue-300' : aiState === 'thinking' ? 'text-amber-300' : 'text-slate-400'}`}>
              {aiState === 'speaking' ? 'Speaking...' : aiState === 'thinking' ? 'Thinking...' : 'Listening'}
            </p>
            <p className="text-[11px] text-slate-600 mt-1 max-w-[160px] leading-relaxed">
              {aiState === 'speaking' ? 'Generating your next question' : aiState === 'thinking' ? 'Analyzing your response' : 'Ready for your answer'}
            </p>
          </div>

          {rtc.connStatus === 'connected' && (
            <div className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-slate-900/80 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-slate-700/40">
              <span className={`w-1.5 h-1.5 rounded-full ${rtc.signal.dot} animate-pulse`} />
              <span className={`text-[10px] font-bold ${rtc.signal.color}`}>{rtc.signal.label}</span>
            </div>
          )}
          {rtc.connStatus === 'connecting' && (
            <div className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-slate-900/80 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-slate-700/40">
              <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />
              <span className="text-[10px] font-bold text-amber-400">Connecting...</span>
            </div>
          )}
          {rtc.connStatus === 'failed' && (
            <div className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-slate-900/80 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-rose-800/40">
              <WifiOff className="w-3 h-3 text-rose-400" />
              <span className="text-[10px] font-bold text-rose-400">Disconnected</span>
            </div>
          )}
        </div>
      </div>

      {/* Network stats bar */}
      {rtc.connStatus === 'connected' && (
        <div className="flex-shrink-0 border-t border-slate-800/60 bg-slate-900/50">
          <div className="flex items-center justify-between px-4 py-2.5 gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-[11px]">
                <Clock3 className="w-3 h-3 text-slate-500" />
                <span className="text-slate-500 font-semibold">Latency</span>
                <span className={`font-bold ${rtc.latency > 100 ? 'text-amber-400' : 'text-slate-300'}`}>{rtc.latency}ms</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px]">
                <Signal className="w-3 h-3 text-slate-500" />
                <span className="text-slate-500 font-semibold">Loss</span>
                <span className={`font-bold ${rtc.packetLoss > 1 ? 'text-amber-400' : 'text-slate-300'}`}>{rtc.packetLoss.toFixed(1)}%</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px]">
                <Zap className="w-3 h-3 text-slate-500" />
                <span className="text-slate-500 font-semibold">BW</span>
                <span className={`font-bold ${rtc.bandwidth < 1 ? 'text-rose-400' : 'text-slate-300'}`}>{rtc.bandwidth.toFixed(1)} Mbps</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isRecording && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-rose-400 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> REC
                </span>
              )}
              <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                rtc.signal.dot === 'bg-emerald-400' ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-400'
                : rtc.signal.dot === 'bg-blue-400' ? 'bg-blue-950/40 border-blue-800/50 text-blue-400'
                : rtc.signal.dot === 'bg-amber-400' ? 'bg-amber-950/40 border-amber-800/50 text-amber-400'
                : 'bg-rose-950/40 border-rose-800/50 text-rose-400'
              }`}>
                <span className={`w-1 h-1 rounded-full ${rtc.signal.dot}`} /> {rtc.signal.label}
              </span>
              {userPlan !== 'free' && (
                <button
                  onClick={handleRecordingToggle}
                  className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border transition-colors ${isRecording ? 'bg-rose-950/40 border-rose-800/50 text-rose-400 hover:bg-rose-950/70' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                >
                  {isRecording ? <><Square className="w-2.5 h-2.5 fill-rose-500" /> Stop</> : <><Play className="w-2.5 h-2.5 fill-slate-400" /> Record</>}
                </button>
              )}
            </div>
          </div>
          {rtc.bandwidth < 1 && (
            <div className="mx-4 mb-2.5 bg-amber-950/30 border border-amber-900/40 rounded-lg px-3 py-2 flex items-center gap-2 text-[11px] text-amber-300">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span><strong>Poor connection</strong> &mdash; Turn off camera to save bandwidth.</span>
            </div>
          )}
        </div>
      )}

      <RecordingConsentModal
        isOpen={showConsentModal}
        roomName={`session_${sessionId}`}
        userId={userId}
        userPlan={userPlan}
        onConsent={confirmRecording}
        onDecline={() => setShowConsentModal(false)}
      />
    </div>
  );
}
