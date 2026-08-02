import { useState, useRef, useCallback, useEffect } from 'react';
import { sessionApi } from '@/lib/api';

interface SessionTimerOptions {
  onAutoComplete?: () => void;
  onAutoCancel?: (msg: string) => void;
  onConnectionWarning?: (missedCount: number) => void;
  onConnectionRestored?: () => void;
}

export function useSessionTimer(sessionId: string | undefined) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [connectionWarning, setConnectionWarning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const missedHeartbeatsRef = useRef(0);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
  }, []);

  const startHeartbeat = useCallback(
    (id: string, opts: SessionTimerOptions = {}) => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      missedHeartbeatsRef.current = 0;
      setConnectionWarning(false);

      heartbeatRef.current = setInterval(async () => {
        try {
          const data = await sessionApi.heartbeat(id);
          if (missedHeartbeatsRef.current > 0) {
            missedHeartbeatsRef.current = 0;
            setConnectionWarning(false);
            opts.onConnectionRestored?.();
          }
          if (data.auto_completed) {
            clearInterval(heartbeatRef.current!);
            stopTimer();
            opts.onAutoComplete?.();
          }
          if (data.auto_cancelled) {
            clearInterval(heartbeatRef.current!);
            stopTimer();
            opts.onAutoCancel?.('Session ended due to connection timeout. Please start a new interview.');
          }
        } catch {
          missedHeartbeatsRef.current++;
          const missed = missedHeartbeatsRef.current;

          if (missed >= 5) {
            clearInterval(heartbeatRef.current!);
            stopTimer();
            setConnectionWarning(false);
            opts.onAutoCancel?.('Session paused due to sustained connection loss. Please check your network and resume.');
          } else if (missed >= 3) {
            setConnectionWarning(true);
            opts.onConnectionWarning?.(missed);
          }
        }
      }, 15000);
    },
    [stopTimer],
  );

  useEffect(() => () => stopTimer(), [stopTimer]);
  useEffect(() => () => stopHeartbeat(), [stopHeartbeat]);

  return {
    elapsedSeconds,
    setElapsedSeconds,
    connectionWarning,
    startTimer,
    stopTimer,
    startHeartbeat,
    stopHeartbeat,
    timerRef,
  };
}
