/**
 * ============================================================================
 * DevMeet Frontend - Interview Session Timer & Heartbeat Liveness Hook
 * ============================================================================
 * Coordinates the candidate's active session elapsed time counter and transmits
 * periodic heartbeat pings to the Orchestrator Service.
 *
 * Key Architectural Responsibilities:
 * 1. Monotonic Elapsed Time Counter:
 *    - Updates `elapsedSeconds` state on a 1000ms tick interval.
 * 2. Bi-Directional Session Heartbeats (Every 15 Seconds):
 *    - Pings `POST /api/v1/sessions/:id/heartbeat` to signal active candidate engagement.
 *    - Detects server-side auto-completion when session time expires (`data.auto_completed`).
 *    - Detects server-side auto-cancellation when abandoned (`data.auto_cancelled`).
 * 3. Connection Degradation & Reconnection Recovery:
 *    - Increments `missedHeartbeatsRef` on network timeout or failure.
 *    - At 3 consecutive missed pings (45s): Triggers `connectionWarning` alert in UI.
 *    - At 5 consecutive missed pings (75s): Halts interview and invokes `onAutoCancel`.
 *    - When connection recovers: Automatically clears warning and fires `onConnectionRestored`.
 * ============================================================================
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { sessionApi } from '@/lib/api';

/**
 * Configuration options and callback handlers for session lifecycle transitions.
 */
interface SessionTimerOptions {
  /** Invoked when backend marks session auto-completed due to duration expiry */
  onAutoComplete?: () => void;
  /** Invoked when session is paused or terminated due to sustained network loss */
  onAutoCancel?: (msg: string) => void;
  /** Invoked when heartbeats start failing (3 consecutive misses) */
  onConnectionWarning?: (missedCount: number) => void;
  /** Invoked when heartbeat succeeds following previous connectivity failures */
  onConnectionRestored?: () => void;
}

/**
 * Custom React hook managing elapsed time ticking and server heartbeat synchronization.
 *
 * @param sessionId - Active interview session UUID string.
 */
export function useSessionTimer(sessionId: string | undefined) {
  // Total elapsed session duration in seconds
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  // True when heartbeats are failing, prompting an amber connection warning banner
  const [connectionWarning, setConnectionWarning] = useState(false);

  // Interval timer references
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Counter tracking consecutive failed heartbeat attempts
  const missedHeartbeatsRef = useRef(0);

  /**
   * Halts the local seconds counter.
   */
  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /**
   * Halts periodic heartbeat transmission to the backend.
   */
  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  /**
   * Starts or resumes the local 1-second elapsed timer.
   */
  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
  }, []);

  /**
   * Initiates periodic heartbeat pings every 15 seconds to sync state with orchestrator.
   */
  const startHeartbeat = useCallback(
    (id: string, opts: SessionTimerOptions = {}) => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      missedHeartbeatsRef.current = 0;
      setConnectionWarning(false);

      heartbeatRef.current = setInterval(async () => {
        try {
          // Transmit liveness ping to orchestrator service
          const data = await sessionApi.heartbeat(id);

          // Clear warnings if connection was previously flaky
          if (missedHeartbeatsRef.current > 0) {
            missedHeartbeatsRef.current = 0;
            setConnectionWarning(false);
            opts.onConnectionRestored?.();
          }

          // Handle server-side lifecycle transitions
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
          // Track consecutive heartbeat dropouts
          missedHeartbeatsRef.current++;
          const missed = missedHeartbeatsRef.current;

          // Sustained dropout (5 misses = 75 seconds of disconnection)
          if (missed >= 5) {
            clearInterval(heartbeatRef.current!);
            stopTimer();
            setConnectionWarning(false);
            opts.onAutoCancel?.(
              'Session paused due to sustained connection loss. Please check your network and resume.'
            );
          } else if (missed >= 3) {
            // Transient dropout warning (3 misses = 45 seconds)
            setConnectionWarning(true);
            opts.onConnectionWarning?.(missed);
          }
        }
      }, 15000);
    },
    [stopTimer],
  );

  // Clean up timer intervals when component unmounts
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
