'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Video, VideoOff, Mic, MicOff, Wifi, WifiOff,
  CheckCircle, XCircle, AlertTriangle, RefreshCw,
  ChevronRight, Info, Shield,
} from 'lucide-react';
import { videoApi } from '@/lib/api';

function getBrowserName() {
  if (typeof navigator === 'undefined') return 'Unknown';
  const ua = navigator.userAgent;
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Edg')) return 'Edge';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Safari')) return 'Safari';
  return 'Browser';
}

function getOSName() {
  if (typeof navigator === 'undefined') return 'Unknown';
  const ua = navigator.userAgent;
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  return 'Unknown';
}

function getPermissionInstructions(area: string) {
  const browser = getBrowserName();
  const os = getOSName();
  const device = area === 'camera' ? 'Camera' : 'Microphone';
  if (os === 'iOS') return `Go to Settings > Privacy > ${device} > enable Safari.`;
  if (os === 'Android') return `Tap the lock icon in your browser's address bar and enable ${device}.`;
  if (browser === 'Firefox') return `Click the shield/lock icon left of the URL bar > remove ${device} block > reload.`;
  if (browser === 'Safari') return `Click Safari menu > Settings for This Website > set ${device} to Allow.`;
  if (browser === 'Edge') return `Click the lock icon in the address bar > enable ${device} > refresh.`;
  return `Click the camera/lock icon in the address bar > set ${device} to Allow > refresh the page.`;
}

type CheckStatus = 'idle' | 'checking' | 'pass' | 'fail' | 'warn';

export default function DeviceCheckScreen({ onProceed, sessionMode }: { onProceed: (audioOnly?: boolean) => void; sessionMode?: string }) {
  const [checks, setChecks] = useState<{ camera: CheckStatus; microphone: CheckStatus; network: CheckStatus }>({
    camera: 'idle',
    microphone: 'idle',
    network: 'idle',
  });
  const [audioLevel, setAudioLevel] = useState(0);
  const [serverResult, setServerResult] = useState<any>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [issues, setIssues] = useState<any[]>([]);
  const [audioOnly, setAudioOnly] = useState(false);

  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      camStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const startAudioMeter = useCallback((stream: MediaStream) => {
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioContextRef.current = ctx;
      analyserRef.current = analyser;
      const tick = () => {
        if (!analyserRef.current) return;
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        const level = Math.min(100, (avg / 128) * 100 * 2);
        setAudioLevel(level);
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {}
  }, []);

  const runChecks = useCallback(async () => {
    setIsRunning(true);
    setServerResult(null);
    setIssues([]);
    setAudioLevel(0);
    setChecks({ camera: 'checking', microphone: 'checking', network: 'checking' });

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (audioContextRef.current) { try { audioContextRef.current.close(); } catch {} }
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    camStreamRef.current?.getTracks().forEach((t) => t.stop());
    setCameraStream(null);

    let cameraAvailable = false;
    let cameraPermission = 'prompt';
    let micAvailable = false;
    let micPermission = 'prompt';

    // Run camera and microphone checks in parallel (they're independent)
    const [camResult, micResult] = await Promise.allSettled([
      navigator.mediaDevices.getUserMedia({ video: true }),
      navigator.mediaDevices.getUserMedia({ audio: true }),
    ]);

    if (camResult.status === 'fulfilled') {
      cameraAvailable = true;
      cameraPermission = 'granted';
      camStreamRef.current = camResult.value;
      setCameraStream(camResult.value);
      if (videoPreviewRef.current) videoPreviewRef.current.srcObject = camResult.value;
      setChecks((c) => ({ ...c, camera: 'pass' }));
    } else {
      const err = camResult.reason;
      cameraPermission = err?.name === 'NotAllowedError' ? 'denied' : 'prompt';
      setChecks((c) => ({ ...c, camera: err?.name === 'NotAllowedError' ? 'fail' : 'warn' }));
    }

    if (micResult.status === 'fulfilled') {
      micAvailable = true;
      micPermission = 'granted';
      micStreamRef.current = micResult.value;
      startAudioMeter(micResult.value);
      setChecks((c) => ({ ...c, microphone: 'pass' }));
    } else {
      const err = micResult.reason;
      micPermission = err?.name === 'NotAllowedError' ? 'denied' : 'prompt';
      setChecks((c) => ({ ...c, microphone: 'fail' }));
    }

    let estimatedBandwidth = 4;
    try {
      const conn = (navigator as any).connection || (navigator as any).mozConnection;
      if (conn?.downlink) estimatedBandwidth = conn.downlink;
    } catch {}

    try {
      const result = await videoApi.preflight({
        camera_available: cameraAvailable,
        microphone_available: micAvailable,
        camera_permission: cameraPermission,
        mic_permission: micPermission,
        estimated_bandwidth: estimatedBandwidth,
        browser: getBrowserName(),
        os: getOSName(),
      });
      setServerResult(result);
      setIssues(result.recommendations || []);
      const nq = result.network_quality;
      setChecks((c) => ({ ...c, network: nq === 'good' ? 'pass' : nq === 'fair' ? 'warn' : 'fail' }));
      setAudioOnly(!result.camera_ok && result.can_proceed_audio_only);
    } catch {
      const localResult = {
        camera_ok: cameraAvailable,
        mic_ok: micAvailable,
        network_quality: 'good',
        all_ok: micAvailable,
        can_proceed_audio_only: micAvailable,
        recommendations: [],
      };
      setServerResult(localResult);
      setChecks((c) => ({ ...c, network: 'warn' }));
      setAudioOnly(!cameraAvailable && micAvailable);
    }

    setIsRunning(false);
  }, [startAudioMeter]);

  useEffect(() => { runChecks(); }, []);

  const allPassed = serverResult?.all_ok && checks.camera !== 'fail' && checks.microphone !== 'fail';
  const canProceed = !isRunning && (serverResult?.can_proceed_audio_only || !!allPassed);

  const checkRows = [
    {
      key: 'camera' as const,
      label: 'Camera',
      icon: checks.camera === 'pass' ? <Video className="w-4 h-4 text-[#4f46e5]" /> : <VideoOff className="w-4 h-4 text-[#999]" />,
      detail: checks.camera === 'fail' ? getPermissionInstructions('camera') : checks.camera === 'warn' ? 'No camera found — you can continue in audio-only mode.' : 'Camera is ready and working.',
    },
    {
      key: 'microphone' as const,
      label: 'Microphone',
      icon: checks.microphone === 'pass' ? <Mic className="w-4 h-4 text-[#4f46e5]" /> : <MicOff className="w-4 h-4 text-[#999]" />,
      detail: checks.microphone === 'fail' ? getPermissionInstructions('microphone') : checks.microphone === 'warn' ? 'No microphone found. A microphone is required.' : 'Microphone is ready. Speak to test.',
    },
    {
      key: 'network' as const,
      label: 'Network',
      icon: checks.network === 'fail' ? <WifiOff className="w-4 h-4 text-[#dc2626]" /> : <Wifi className="w-4 h-4 text-[#4f46e5]" />,
      detail: serverResult?.network_quality === 'poor' ? 'Low bandwidth detected. Consider audio-only mode.' : serverResult?.network_quality === 'fair' ? 'Moderate speed. Close other apps for best results.' : 'Network connection looks good.',
    },
  ];

  // ── Render ──
  return (
    <div className="fixed inset-0 z-50 bg-[#fafafa] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-3xl bg-white border border-[#e5e5e5] rounded-2xl overflow-hidden"
        style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}
      >
        {/* Header */}
        <div className="px-7 pt-7 pb-5 border-b border-[#e5e5e5]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#eef2ff] border border-[#c7d2fe]">
              <Shield className="w-4.5 h-4.5 text-[#4f46e5]" />
            </div>
            <div>
              <h1 className="text-[#111] font-bold text-lg tracking-tight">Device Check</h1>
              <p className="text-[#999] text-sm mt-0.5">
                Verify your setup before the{' '}
                {sessionMode ? <span className="capitalize">{sessionMode.replace('_', ' ')}</span> : 'interview'}{' '}
                begins
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-7 grid grid-cols-1 md:grid-cols-2 gap-7">
          {/* Left: Camera + Mic */}
          <div className="flex flex-col gap-4">
            {/* Camera preview */}
            <div className="relative rounded-xl overflow-hidden bg-[#f5f5f5] border border-[#e5e5e5] aspect-video">
              <video
                ref={videoPreviewRef}
                autoPlay
                muted
                playsInline
                className={`w-full h-full object-cover transition-opacity duration-500 ${checks.camera === 'pass' ? 'opacity-100' : 'opacity-0'}`}
              />
              {checks.camera !== 'pass' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  {checks.camera === 'checking' ? (
                    <div className="w-7 h-7 border-2 border-[#4f46e5] border-t-transparent rounded-full animate-spin" />
                  ) : checks.camera === 'fail' ? (
                    <>
                      <VideoOff className="w-8 h-8 text-[#dc2626] opacity-60" />
                      <p className="text-[#dc2626] text-xs font-medium">Camera access denied</p>
                    </>
                  ) : (
                    <>
                      <VideoOff className="w-8 h-8 text-[#999] opacity-60" />
                      <p className="text-[#999] text-xs font-medium">No camera detected</p>
                      <p className="text-[#999] text-[11px] opacity-70">You can continue in audio-only mode</p>
                    </>
                  )}
                </div>
              )}
              {checks.camera === 'pass' && (
                <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg px-2 py-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#16a34a] animate-pulse" />
                  <span className="text-[#16a34a] text-[10px] font-semibold">Live</span>
                </div>
              )}
            </div>

            {/* Mic level */}
            <div className="bg-[#f5f5f5] border border-[#e5e5e5] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                {checks.microphone === 'pass' ? (
                  <Mic className="w-3.5 h-3.5 text-[#16a34a]" />
                ) : (
                  <MicOff className="w-3.5 h-3.5 text-[#999]" />
                )}
                <span className="text-[#111] text-xs font-semibold">Microphone Level</span>
                <span className={`ml-auto text-[10px] font-bold ${
                  checks.microphone === 'pass' ? 'text-[#16a34a]' : checks.microphone === 'fail' ? 'text-[#dc2626]' : 'text-[#999]'
                }`}>
                  {checks.microphone === 'pass' ? 'Ready' : checks.microphone === 'fail' ? 'Failed' : checks.microphone === 'checking' ? 'Checking…' : 'Pending'}
                </span>
              </div>
              <div className="flex items-end gap-[2px] h-8 px-1">
                {Array.from({ length: 24 }).map((_, i) => {
                  const active = checks.microphone === 'pass';
                  const height = active ? Math.max(10, audioLevel * (0.5 + Math.abs(Math.sin(i * 1.1)) * 0.5)) : 14;
                  return (
                    <div
                      key={i}
                      className="flex-1 rounded-sm transition-all duration-100"
                      style={{
                        height: `${height}%`,
                        backgroundColor: active && audioLevel > 15 ? '#4f46e5' : '#d0d0d0',
                      }}
                    />
                  );
                })}
              </div>
              {checks.microphone === 'pass' && audioLevel < 5 && !isRunning && (
                <p className="text-[#999] text-[11px] mt-2 text-center">Speak into your microphone to test…</p>
              )}
              {checks.microphone === 'fail' && (
                <p className="text-[#dc2626] text-[11px] mt-2">{getPermissionInstructions('microphone')}</p>
              )}
            </div>
          </div>

          {/* Right: Check rows */}
          <div className="flex flex-col gap-3">
            {checkRows.map(({ key, label, icon, detail }) => (
              <div
                key={key}
                className={`flex items-start gap-3 p-4 rounded-xl border transition-all duration-200 ${
                  checks[key] === 'pass' ? 'bg-[#f0fdf4] border-[#bbf7d0]'
                  : checks[key] === 'fail' ? 'bg-[#fef2f2] border-[#fecaca]'
                  : checks[key] === 'warn' ? 'bg-[#fffbeb] border-[#fde68a]'
                  : 'bg-[#f5f5f5] border-[#e5e5e5]'
                }`}
              >
                <div className="p-2 rounded-lg bg-white border border-[#e5e5e5] shrink-0">
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#111] font-semibold text-sm">{label}</span>
                    {checks[key] === 'pass' && <CheckCircle className="w-4 h-4 text-[#16a34a]" />}
                    {checks[key] === 'fail' && <XCircle className="w-4 h-4 text-[#dc2626]" />}
                    {checks[key] === 'warn' && <AlertTriangle className="w-4 h-4 text-[#d97706]" />}
                    {checks[key] === 'checking' && <div className="w-4 h-4 border-2 border-[#4f46e5] border-t-transparent rounded-full animate-spin" />}
                  </div>
                  <p className={`text-[11px] mt-1 leading-relaxed ${
                    checks[key] === 'fail' ? 'text-[#dc2626]' : checks[key] === 'warn' ? 'text-[#d97706]' : 'text-[#999]'
                  }`}>
                    {detail}
                  </p>
                </div>
              </div>
            ))}

            {/* Error issues */}
            <AnimatePresence>
              {issues.filter((i) => i.type === 'error').map((issue, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="flex items-start gap-2 p-3 bg-[#fef2f2] border border-[#fecaca] rounded-xl"
                >
                  <Info className="w-3.5 h-3.5 text-[#dc2626] shrink-0 mt-0.5" />
                  <p className="text-[#dc2626] text-[11px]">{issue.message}</p>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* All passed banner */}
            {allPassed && !isRunning && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 p-3 bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl"
              >
                <CheckCircle className="w-4 h-4 text-[#16a34a] shrink-0" />
                <p className="text-[#16a34a] text-sm font-semibold">All checks passed! You're ready.</p>
              </motion.div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-7 py-4 border-t border-[#e5e5e5] flex items-center justify-between gap-4 flex-wrap">
          <button
            onClick={runChecks}
            disabled={isRunning}
            className="flex items-center gap-2 text-[#555] hover:text-[#111] transition-colors text-sm font-semibold disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
            {isRunning ? 'Checking…' : 'Recheck devices'}
          </button>

          <div className="flex items-center gap-3">
            {audioOnly && canProceed && (
              <button
                onClick={() => {
                  camStreamRef.current?.getTracks().forEach((t) => t.stop());
                  onProceed(true);
                }}
                className="px-4 py-2 rounded-lg border border-[#fde68a] bg-[#fffbeb] text-[#d97706] hover:bg-[#fef3c7] transition-colors text-sm font-semibold"
              >
                Audio-Only Mode
              </button>
            )}
            <button
              id="device-check-proceed-btn"
              onClick={() => {
                if (!cameraStream) camStreamRef.current?.getTracks().forEach((t) => t.stop());
                onProceed(false);
              }}
              disabled={!canProceed}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-all duration-200 ${
                canProceed
                  ? 'bg-[#4f46e5] hover:bg-[#3730a3] text-white shadow-sm'
                  : 'bg-[#f5f5f5] text-[#999] border border-[#e5e5e5] cursor-not-allowed'
              }`}
            >
              {isRunning ? 'Checking…' : canProceed ? (allPassed ? 'Start Interview' : 'Proceed Anyway') : 'Fix Issues to Continue'}
              {canProceed && !isRunning && <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
