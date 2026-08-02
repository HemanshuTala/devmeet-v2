import { useRef, useEffect, useCallback } from 'react';

export function useAudioLevel(stream: MediaStream | null, audioActive: boolean) {
  const levelRef = useRef(0);
  const subscribersRef = useRef<Set<(level: number) => void>>(new Set());

  useEffect(() => {
    if (!stream || !audioActive) { levelRef.current = 0; return; }
    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let frameId = 0;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        audioContext = new AudioCtx();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 64;
        source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let lastUpdate = 0;

        const updateLevel = () => {
          if (!analyser) return;
          const now = performance.now();
          // Throttle to ~5fps (200ms) to avoid re-render thrashing
          if (now - lastUpdate >= 200) {
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const avg = sum / dataArray.length;
            levelRef.current = Math.min(100, Math.round((avg / 70) * 100));
            subscribersRef.current.forEach(cb => cb(levelRef.current));
            lastUpdate = now;
          }
          frameId = requestAnimationFrame(updateLevel);
        };
        updateLevel();
      }
    } catch (err) { console.warn('Microphone analyzer initialization failed:', err); }

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      source?.disconnect();
      if (audioContext?.state !== 'closed') audioContext?.close();
    };
  }, [stream, audioActive]);

  const subscribe = useCallback((cb: (level: number) => void) => {
    subscribersRef.current.add(cb);
    return () => { subscribersRef.current.delete(cb); };
  }, []);

  return { levelRef, subscribe };
}
