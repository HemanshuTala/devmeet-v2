'use client';

/**
 * @file VideoPanel.tsx (Interview Video Streaming & Proctoring Visualizer Panel)
 * @description Core audio/video interface for live mock interviews.
 * Supports dual display modes:
 * - Full mode (split view with candidate camera and AI Interviewer avatar)
 * - Compact ribbon mode (used in DSA coding view to save editor real estate)
 *
 * Integrates:
 * 1. WebRTC & LiveKit signaling (`useWebRTC`)
 * 2. Camera/microphone acquisition and track control (`useMediaStream`)
 * 3. Client-side computer vision edge proctoring (`useProctoring`)
 * 4. Real-time audio amplitude visualization (`useAudioLevel`)
 * 5. Device switching overlay (cameras & microphones)
 * 6. Cloud recording with consent tracking and S3 upload queuing (`RecordingConsentModal`)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Video as VideoIcon,
  VideoOff,
  Mic,
  MicOff,
  WifiOff,
  Layers,
  AlertCircle,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  Play,
  Square,
  Clock3,
  Signal,
  Zap,
  Settings,
} from 'lucide-react';
import { videoApi, userApi } from '@/lib/api';
import RecordingConsentModal from '@/components/interview/RecordingConsentModal';

// Modularized subcomponents
import AudioLevelMeter from './video/AudioLevelMeter';
import DeviceSettingsOverlay from './video/DeviceSettingsOverlay';
import ProctorOverlays from './video/ProctorOverlays';
import AIAvatarState from './video/AIAvatarState';
import LiveKitStatusBadge from './video/LiveKitStatusBadge';

// Custom real-time hooks
import { useMediaStream } from './hooks/useMediaStream';
import { useProctoring } from './hooks/useProctoring';
import { useWebRTC } from './hooks/useWebRTC';
import { useAudioLevel } from './hooks/useAudioLevel';
import { useSessionRecorder } from './hooks/useSessionRecorder';

/**
 * Props for VideoPanel component.
 */
interface VideoPanelProps {
  /** Interview session identifier */
  sessionId: string;
  /** Candidate display name */
  userDisplayName?: string;
  /** Candidate unique ID */
  userId?: string;
  /** Whether the interview session is active */
  isActive: boolean;
  /** Real-time AI agent status ('speaking' | 'thinking' | 'idle') */
  aiState: 'speaking' | 'thinking' | 'idle' | string;
  /** Whether to render in compact ribbon mode (for coding layouts) */
  compact?: boolean;
  /** Callback triggered when computer vision flags a proctoring violation */
  onProctorViolation?: (type: any, message?: any) => void;
}

/**
 * VideoPanel Component.
 */
export default function VideoPanel({
  sessionId,
  userDisplayName = 'Candidate',
  userId = 'default-user',
  isActive,
  aiState,
  compact = false,
  onProctorViolation,
}: VideoPanelProps) {
  // Diagnostic log buffer (keeps last 20 events)
  const [logs, setLogs] = useState<string[]>([]);
  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 19)]);
  }, []);

  const effectiveUserId = userId || (sessionId ? `candidate_${sessionId.slice(0, 8)}` : 'candidate');
  const effectiveDisplayName = userDisplayName || 'Candidate';

  // Sub-system hook integrations
  const media = useMediaStream(addLog);
  const proctor = useProctoring(media.videoRef, media.stream, isActive, media.videoActive, onProctorViolation, addLog);
  const rtc = useWebRTC(
    sessionId,
    effectiveUserId,
    effectiveDisplayName,
    media.permissionStatus,
    addLog,
    media.stream,
    media.videoActive,
    media.audioActive
  );
  const { subscribe: audioSubscribe } = useAudioLevel(media.stream, media.audioActive);

  // User subscription plan & session recording states
  const [userPlan, setUserPlan] = useState('free');
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);

  // Active in-browser MediaRecorder + cloud storage upload hook
  const recorder = useSessionRecorder({
    sessionId,
    userId: effectiveUserId,
    stream: media.stream,
    userPlan,
    addLog,
  });

  // Fetch candidate's quota to determine recording eligibility (Pro / Enterprise feature)
  useEffect(() => {
    userApi
      .getQuota()
      .then((q) => {
        if (q?.plan) setUserPlan(q.plan.toLowerCase());
      })
      .catch(() => {});
  }, []);

  // Gracefully handle WebRTC disconnection without killing candidate camera feed
  useEffect(() => {
    if (rtc.connStatus === 'failed') {
      addLog('WebRTC relay degraded — keeping local camera preview and proctor active.');
    }
  }, [rtc.connStatus, addLog]);

  /**
   * Toggles recording state or launches the legal consent modal.
   */
  const handleRecordingToggle = () => {
    if (!isActive) return;
    if (recorder.isRecording) {
      recorder.stopRecording();
    } else {
      setShowConsentModal(true);
    }
  };

  /**
   * Confirms recording consent and starts browser + cloud capture.
   */
  const confirmRecording = () => {
    setShowConsentModal(false);
    recorder.startRecording();
  };

  // Avatar border color based on AI speech state
  const aiAvatarBorder =
    aiState === 'speaking'
      ? 'border-blue-500 shadow-[0_0_24px_rgba(59,130,246,0.35)]'
      : aiState === 'thinking'
      ? 'border-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.25)] animate-pulse'
      : 'border-slate-700';

  const aiAvatarBg =
    aiState === 'speaking'
      ? 'bg-blue-950/30'
      : aiState === 'thinking'
      ? 'bg-amber-950/30'
      : 'bg-slate-900';

  // ───────────────────────────────────────────────────────────────────────────
  // COMPACT MODE: Top bar / horizontal ribbon view
  // ───────────────────────────────────────────────────────────────────────────
  if (compact) {
    return (
      <div className="h-full flex flex-row items-center bg-slate-50 p-3 gap-3 overflow-hidden select-none">
        {/* Candidate Video Thumbnail */}
        <div className="h-full aspect-[16/9] relative bg-slate-950 rounded-xl overflow-hidden border border-slate-200 shadow-sm flex flex-col justify-center">
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 bg-slate-950/80 backdrop-blur-sm px-2 py-0.5 rounded-lg text-[9px] font-bold text-white">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                media.permissionStatus === 'granted' && media.videoActive
                  ? 'bg-emerald-400 animate-pulse'
                  : 'bg-rose-400'
              }`}
            />
            {userDisplayName}
          </div>

          {media.permissionStatus === 'granted' && !media.useAudioOnly ? (
            <div className="relative w-full h-full bg-slate-950">
              <video
                ref={media.videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover transition-all duration-300 ${
                  proctor.backgroundBlur ? 'opacity-0' : ''
                }`}
              />
              <canvas
                ref={proctor.canvasRef as any}
                className="absolute inset-0 w-full h-full pointer-events-none z-10"
              />
              <ProctorOverlays
                activeWarning={proctor.activeWarning}
                gazeDirection={proctor.gazeDirection}
                blurPerformanceWarning={proctor.blurPerformanceWarning}
                modelsLoaded={proctor.modelsLoaded}
                isDegraded={proctor.isDegraded}
                proctorError={proctor.proctorError}
                videoActive={media.videoActive}
                onDismissBlurWarning={() => proctor.setBlurPerformanceWarning(null)}
                size="sm"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-2 text-center text-slate-400">
              <VideoOff className="w-4 h-4 mb-1" />
              <span className="text-[9px]">Camera off</span>
            </div>
          )}

          {media.permissionStatus === 'granted' && media.audioActive && (
            <div className="absolute bottom-1 right-1 z-10 flex items-center bg-slate-950/80 px-1 py-0.5 rounded">
              <AudioLevelMeter subscribe={audioSubscribe} size="sm" />
            </div>
          )}
        </div>

        {/* AI Interviewer Avatar Thumbnail */}
        <div className="h-full flex-1 flex items-center justify-between bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-full border flex items-center justify-center transition-all ${
                aiState === 'speaking'
                  ? 'border-blue-500 bg-blue-50'
                  : aiState === 'thinking'
                  ? 'border-amber-400 bg-amber-50'
                  : 'border-slate-200 bg-slate-50'
              }`}
            >
              <AIAvatarState aiState={aiState} size="sm" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <span>AI Interviewer</span>
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase ${
                    aiState === 'speaking'
                      ? 'bg-blue-100 text-blue-700'
                      : aiState === 'thinking'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {aiState}
                </span>
              </div>
              <p className="text-[10px] text-slate-500">
                {aiState === 'speaking'
                  ? 'Generating next question...'
                  : aiState === 'thinking'
                  ? 'Analyzing response...'
                  : 'Listening to your answer'}
              </p>
            </div>
          </div>

          <LiveKitStatusBadge status={rtc.connStatus} isMockMode={rtc.isMockMode} />
        </div>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // FULL MODE: Side-by-side or stacked panel inside interview room
  // ───────────────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden select-none">
      <div className="flex-1 grid grid-rows-2 gap-0 min-h-0 border-b border-slate-800/60">
        {/* Candidate video panel */}
        <div className="relative bg-slate-950 border-b border-slate-800/60 overflow-hidden flex flex-col">
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-slate-950/80 backdrop-blur-sm px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-200 border border-slate-700/40">
            <span
              className={`w-2 h-2 rounded-full ${
                media.permissionStatus === 'granted' && media.videoActive
                  ? 'bg-emerald-400 animate-pulse'
                  : 'bg-rose-400'
              }`}
            />
            {userDisplayName}
          </div>

          {media.permissionStatus === 'granted' && !media.useAudioOnly ? (
            <div className="relative w-full h-full bg-slate-950">
              <video
                ref={media.videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover transition-all duration-300 ${
                  proctor.backgroundBlur ? 'opacity-0' : ''
                }`}
              />
              <canvas
                ref={proctor.canvasRef as any}
                className="absolute inset-0 w-full h-full pointer-events-none z-10"
              />
              <ProctorOverlays
                activeWarning={proctor.activeWarning}
                gazeDirection={proctor.gazeDirection}
                blurPerformanceWarning={proctor.blurPerformanceWarning}
                modelsLoaded={proctor.modelsLoaded}
                isDegraded={proctor.isDegraded}
                proctorError={proctor.proctorError}
                videoActive={media.videoActive}
                onDismissBlurWarning={() => proctor.setBlurPerformanceWarning(null)}
                size="md"
              />
            </div>
          ) : (
            <div className="flex-1 h-full flex flex-col items-center justify-center gap-4 p-5 bg-slate-950">
              {media.permissionStatus === 'checking' ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center">
                    <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
                  </div>
                  <p className="text-xs text-slate-400 font-semibold animate-pulse">
                    Initializing camera...
                  </p>
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
                          <AlertTriangle className="w-3.5 h-3.5" /> Camera Access Blocked
                        </div>
                        <p className="text-slate-400 leading-relaxed font-semibold">
                          {media.getPermissionInstructions()}
                        </p>
                      </div>
                      <button
                        onClick={media.requestPermissions}
                        className="w-full bg-rose-700 hover:bg-rose-600 text-white font-bold py-2 px-4 rounded-xl text-xs transition-colors"
                      >
                        Retry Permissions
                      </button>
                    </div>
                  )}
                  {media.permissionStatus === 'prompt' && (
                    <div className="flex flex-col items-center gap-3 text-center">
                      <p className="text-xs text-slate-400 font-medium max-w-[180px] leading-relaxed">
                        Allow camera & microphone access to enable video interview
                      </p>
                      <button
                        onClick={media.requestPermissions}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-xl text-xs transition-all flex items-center gap-2 shadow-lg shadow-blue-500/20"
                      >
                        <ShieldCheck className="w-4 h-4" /> Enable Camera & Mic
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Microphone volume level indicator */}
          {media.permissionStatus === 'granted' && media.audioActive && (
            <div
              className="absolute bottom-3 right-3 z-10 flex items-center gap-0.5 bg-slate-900/80 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-bold border border-slate-700/40"
              title="Microphone Level"
            >
              <Mic className="w-3.5 h-3.5 mr-0.5 text-emerald-400" />
              <AudioLevelMeter subscribe={audioSubscribe} size="md" />
            </div>
          )}

          {/* Device settings modal overlay */}
          {showDeviceSettings && (
            <DeviceSettingsOverlay
              videoDevices={media.videoDevices}
              audioDevices={media.audioDevices}
              selectedVideoId={media.selectedVideoId}
              selectedAudioId={media.selectedAudioId}
              onChangeVideo={media.changeVideoDevice}
              onChangeAudio={media.changeAudioDevice}
              onClose={() => setShowDeviceSettings(false)}
              size="md"
            />
          )}

          {/* Quick toggle controls floating over the candidate camera preview */}
          {media.permissionStatus === 'granted' && (
            <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-2 z-10">
              <button
                onClick={media.toggleVideo}
                title={media.videoActive ? 'Turn off camera' : 'Turn on camera'}
                className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all shadow-lg ${
                  media.videoActive
                    ? 'bg-slate-800/90 hover:bg-slate-700 border-slate-600 text-slate-200'
                    : 'bg-rose-600 hover:bg-rose-700 border-rose-500 text-white'
                }`}
              >
                {media.videoActive ? <VideoIcon className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              </button>
              <button
                onClick={media.toggleAudio}
                title={media.audioActive ? 'Mute microphone' : 'Unmute microphone'}
                className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all shadow-lg ${
                  media.audioActive
                    ? 'bg-slate-800/90 hover:bg-slate-700 border-slate-600 text-slate-200'
                    : 'bg-rose-600 hover:bg-rose-700 border-rose-500 text-white'
                }`}
              >
                {media.audioActive ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              </button>
              <button
                onClick={() => proctor.setBackgroundBlur((b) => !b)}
                title="Toggle background blur"
                className={`px-2.5 py-1.5 rounded-full border-2 text-[10px] font-bold transition-all flex items-center gap-1 ${
                  proctor.backgroundBlur
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-slate-800/90 hover:bg-slate-700 border-slate-600 text-slate-300'
                }`}
              >
                <Layers className="w-3 h-3" /> Blur
              </button>
              <button
                onClick={() => setShowDeviceSettings(!showDeviceSettings)}
                title="Device Settings"
                className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all shadow-lg ${
                  showDeviceSettings
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-slate-800/90 hover:bg-slate-700 border-slate-600 text-slate-300'
                }`}
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* AI Interviewer Avatar Panel */}
        <div className="relative flex flex-col items-center justify-center bg-slate-950 overflow-hidden">
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-slate-950/80 backdrop-blur-sm px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-200 border border-slate-700/40">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            AI Interviewer
          </div>

          <div
            className={`relative w-28 h-28 rounded-full border-2 flex items-center justify-center transition-all duration-500 ${aiAvatarBorder} ${aiAvatarBg}`}
          >
            <AIAvatarState aiState={aiState} size="md" />
          </div>

          <div className="mt-4 text-center px-4">
            <p
              className={`text-sm font-bold transition-colors duration-300 ${
                aiState === 'speaking'
                  ? 'text-blue-300'
                  : aiState === 'thinking'
                  ? 'text-amber-300'
                  : 'text-slate-400'
              }`}
            >
              {aiState === 'speaking'
                ? 'Speaking...'
                : aiState === 'thinking'
                ? 'Evaluating response...'
                : 'Listening'}
            </p>
            <p className="text-[11px] text-slate-500 mt-1 max-w-[180px] leading-relaxed">
              {aiState === 'speaking'
                ? 'Delivering context and questions'
                : aiState === 'thinking'
                ? 'Analyzing problem solving approach'
                : 'Speak clearly into your microphone'}
            </p>
          </div>

          <div className="absolute bottom-3 right-3">
            <LiveKitStatusBadge status={rtc.connStatus} isMockMode={rtc.isMockMode} />
          </div>
        </div>
      </div>

      {/* Network stats bar and cloud recording controls */}
      {rtc.connStatus === 'connected' && (
        <div className="flex-shrink-0 border-t border-slate-800/60 bg-slate-900/50">
          <div className="flex items-center justify-between px-4 py-2.5 gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-[11px]">
                <Clock3 className="w-3 h-3 text-slate-400" />
                <span className="text-slate-400 font-semibold">Latency</span>
                <span className={`font-bold ${rtc.latency > 100 ? 'text-amber-400' : 'text-slate-300'}`}>
                  {rtc.latency}ms
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px]">
                <Signal className="w-3 h-3 text-slate-400" />
                <span className="text-slate-400 font-semibold">Loss</span>
                <span className={`font-bold ${rtc.packetLoss > 1 ? 'text-amber-400' : 'text-slate-300'}`}>
                  {rtc.packetLoss.toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px]">
                <Zap className="w-3 h-3 text-slate-400" />
                <span className="text-slate-400 font-semibold">BW</span>
                <span className={`font-bold ${rtc.bandwidth < 1 ? 'text-rose-400' : 'text-slate-300'}`}>
                  {rtc.bandwidth.toFixed(1)} Mbps
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {recorder.isUploading && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-blue-400 animate-pulse">
                  <RefreshCw className="w-2.5 h-2.5 animate-spin" /> Saving...
                </span>
              )}
              {recorder.isRecording && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-rose-400 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> REC{' '}
                  {Math.floor(recorder.recordingDuration / 60)
                    .toString()
                    .padStart(2, '0')}
                  :{(recorder.recordingDuration % 60).toString().padStart(2, '0')}
                </span>
              )}
              {userPlan !== 'free' && (
                <button
                  onClick={handleRecordingToggle}
                  disabled={recorder.isUploading}
                  className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border transition-colors ${
                    recorder.isRecording
                      ? 'bg-rose-950/40 border-rose-800/50 text-rose-400 hover:bg-rose-950/70'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {recorder.isRecording ? (
                    <>
                      <Square className="w-2.5 h-2.5 fill-rose-500" /> Stop
                    </>
                  ) : (
                    <>
                      <Play className="w-2.5 h-2.5 fill-slate-300" /> Record
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
          {rtc.bandwidth < 1 && (
            <div className="mx-4 mb-2.5 bg-amber-950/30 border border-amber-900/40 rounded-lg px-3 py-2 flex items-center gap-2 text-[11px] text-amber-300">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>
                <strong>Poor connection detected</strong> &mdash; Video quality will automatically adjust to preserve audio.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Recording Consent Modal */}
      <RecordingConsentModal
        isOpen={showConsentModal}
        roomName={`session_${sessionId}`}
        userId={userId}
        userPlan={userPlan as any}
        onConsent={confirmRecording}
        onDecline={() => setShowConsentModal(false)}
      />
    </div>
  );
}
