/**
 * @file useAudioLevel.ts (Real-Time Microphone Volume Level Hook)
 * @description Custom React hook that attaches a Web Audio API analyser node to a live MediaStream
 * and continuously measures microphone volume levels. Uses a pub/sub subscriber model
 * to deliver level updates to consumers without triggering React state re-renders on every frame.
 * Throttled to ~5fps (200ms intervals) to avoid rendering performance degradation.
 *
 * Used by: VideoPanel (to drive animated volume bars on the proctoring feed)
 */

import { useRef, useEffect, useCallback } from 'react';

/**
 * Analyzes real-time audio amplitude from a MediaStream.
 *
 * @param stream - Active MediaStream from the candidate's microphone
 * @param audioActive - Whether audio track is enabled (false = skip processing)
 * @returns Object with `levelRef` (current 0–100 level) and `subscribe` for push notifications
 */
export function useAudioLevel(stream: MediaStream | null, audioActive: boolean) {
  /** Ref holding the latest computed audio level (0–100 range) without triggering re-renders */
  const levelRef = useRef(0);

  /** Set of listener callbacks subscribed to audio level updates */
  const subscribersRef = useRef<Set<(level: number) => void>>(new Set());

  useEffect(() => {
    // Skip analysis if no stream or audio is muted
    if (!stream || !audioActive) { levelRef.current = 0; return; }

    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let frameId = 0;

    try {
      // Safari fallback via webkitAudioContext
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        audioContext = new AudioCtx();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 64; // Small FFT for low-overhead frequency domain data
        source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let lastUpdate = 0;

        /**
         * rAF callback: samples frequency data, computes average amplitude,
         * normalizes to 0–100 scale, and notifies all subscribers.
         * Throttled to every 200ms to avoid CPU overhead from 60fps sampling.
         */
        const updateLevel = () => {
          if (!analyser) return;
          const now = performance.now();
          // Throttle to ~5fps (200ms) to avoid re-render thrashing
          if (now - lastUpdate >= 200) {
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const avg = sum / dataArray.length;
            // Normalize: 70 ≈ typical loud speech amplitude in Uint8Array range (0-255)
            levelRef.current = Math.min(100, Math.round((avg / 70) * 100));
            subscribersRef.current.forEach(cb => cb(levelRef.current));
            lastUpdate = now;
          }
          frameId = requestAnimationFrame(updateLevel);
        };
        updateLevel();
      }
    } catch (err) { console.warn('Microphone analyzer initialization failed:', err); }

    // Cleanup: cancel animation frame and release Web Audio API resources
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      source?.disconnect();
      if (audioContext?.state !== 'closed') audioContext?.close();
    };
  }, [stream, audioActive]);

  /**
   * Subscribe to audio level update notifications.
   *
   * @param cb - Callback receiving the current level (0–100) on each update interval
   * @returns Unsubscribe function to remove the listener
   */
  const subscribe = useCallback((cb: (level: number) => void) => {
    subscribersRef.current.add(cb);
    return () => { subscribersRef.current.delete(cb); };
  }, []);

  return { levelRef, subscribe };
}
