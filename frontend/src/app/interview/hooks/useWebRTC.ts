/**
 * @file useWebRTC.ts (LiveKit WebRTC Video Streaming & Network Telemetry Hook)
 * @description Manages WebRTC signaling, token acquisition from Video Service, LiveKit room connection,
 * simulated network telemetry, periodic telemetry reporting, and signal quality classification.
 * Supports both real LiveKit servers and local mock simulation mode for standalone offline development.
 *
 * Used by: VideoPanel
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { videoApi } from '@/lib/api';

/** Connection lifecycle states */
type ConnStatus = 'disconnected' | 'connecting' | 'connected' | 'failed';

/** Signal quality descriptor with visual colors and status labels */
interface SignalQuality {
  label: string;
  color: string;
  dot: string;
}

/**
 * useWebRTC Hook.
 *
 * @param sessionId - Unique interview session identifier
 * @param userId - Unique candidate user identifier
 * @param userDisplayName - Candidate name displayed on video track
 * @param permissionStatus - Browser media permission status ('granted' triggers connection)
 * @param addLog - Logging callback for diagnostics
 */
export function useWebRTC(
  sessionId: string,
  userId: string,
  userDisplayName: string,
  permissionStatus: string,
  addLog: (msg: string) => void,
) {
  const [connStatus, setConnStatus] = useState<ConnStatus>('disconnected');
  const [connLogs, setConnLogs] = useState<string[]>([]);
  const [retryCount, setRetryCount] = useState(0);
  const [livekitUrl, setLivekitUrl] = useState('');
  const [isMockMode, setIsMockMode] = useState(true);
  const roomRef = useRef<any>(null);

  // Network telemetry metrics
  const [latency, setLatency] = useState(45);
  const [packetLoss, setPacketLoss] = useState(0.1);
  const [bandwidth, setBandwidth] = useState(4.2);

  /**
   * Connects to the LiveKit video room with retry logic (up to 3 attempts).
   * Fetches room token from Video Service, instantiates LiveKit client Room,
   * configures adaptive stream and dynacast, and listens for room events.
   */
  const connectToVideoRoom = useCallback(async () => {
    if (permissionStatus !== 'granted') return;
    setConnStatus('connecting');
    addLog(`Connecting to session room: session_${sessionId.slice(0, 8)}...`);
    const roomName = `session_${sessionId}`;
    let success = false;

    const safeUserId = userId || `candidate_${sessionId.slice(0, 8)}`;
    const safeDisplayName = userDisplayName || 'Candidate';

    for (let attempt = 1; attempt <= 3 && !success; attempt++) {
      try {
        addLog(`Attempt ${attempt}/3...`);
        const res = await videoApi.getToken(roomName, safeUserId, safeDisplayName);
        const url: string = res.livekit_url;
        const token: string = res.token;
        const isMock: boolean = !!res.mock;

        setLivekitUrl(url);
        setIsMockMode(isMock);

        if (!isMock && url && token) {
          // Dynamically import livekit-client to prevent SSR hydration errors
          const { Room, RoomEvent } = await import('livekit-client').catch(() => ({
            Room: null,
            RoomEvent: null,
          }));

          if (Room && RoomEvent) {
            const room = new Room({
              adaptiveStream: true,
              dynacast: true,
            });
            roomRef.current = room;

            room.on(RoomEvent.Disconnected, () => {
              setConnStatus('disconnected');
              addLog('Disconnected from LiveKit room.');
            });

            room.on(RoomEvent.Reconnecting, () => {
              addLog('Reconnecting to LiveKit room...');
            });

            room.on(RoomEvent.Reconnected, () => {
              addLog('Reconnected to LiveKit room.');
            });

            // 6-second connection timeout race
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('LiveKit connection handshake timed out')), 6000)
            );

            await Promise.race([room.connect(url, token), timeoutPromise]);
            addLog(`Connected to LiveKit room: ${roomName}`);
          } else {
            addLog('livekit-client not available — running in simulation mode.');
          }
        } else {
          addLog('Connected (simulation mode — no LiveKit URL or token provided).');
        }

        setConnStatus('connected');
        success = true;
      } catch (err: any) {
        addLog(`Attempt ${attempt} failed: ${err.message}`);
        setRetryCount(attempt);
        await new Promise((r) => setTimeout(r, 600));
      }
    }
    if (!success) {
      setConnStatus('failed');
      addLog('LiveKit remote relay unavailable. Local camera & proctor active.');
    }
  }, [permissionStatus, sessionId, userId, userDisplayName, addLog]);

  // Clean disconnection from LiveKit room on unmount
  useEffect(() => {
    return () => {
      if (roomRef.current) {
        roomRef.current.disconnect().catch(() => {});
        roomRef.current = null;
      }
    };
  }, []);

  // Connect automatically once media permissions are granted
  useEffect(() => {
    if (permissionStatus === 'granted') connectToVideoRoom();
  }, [permissionStatus, connectToVideoRoom]);

  /**
   * Telemetry fluctuation loop:
   * Periodically varies latency, packet loss, and bandwidth for realistic simulation stats.
   */
  useEffect(() => {
    if (connStatus !== 'connected') return;
    const interval = setInterval(() => {
      setLatency((p) => Math.max(15, Math.min(180, p + Math.floor(Math.random() * 9) - 4)));
      setPacketLoss((p) => Math.max(0, Math.min(5, p + Math.random() * 0.2 - 0.1)));
      setBandwidth((p) => Math.max(0.4, Math.min(8.5, p + Math.random() * 0.4 - 0.2)));
    }, 4000);
    return () => clearInterval(interval);
  }, [connStatus]);

  /**
   * Periodic network quality reporting to Video Service:
   * Reports telemetry every 10 seconds for session analytics and monitoring.
   */
  useEffect(() => {
    if (connStatus !== 'connected') return;
    const roomName = `session_${sessionId}`;
    const report = () => {
      videoApi.reportNetworkQuality(roomName, userId, {
        latency, packet_loss: packetLoss, jitter: Math.random() * 5, bandwidth,
      }).catch(() => {});
    };
    report();
    const interval = setInterval(report, 10000);
    return () => clearInterval(interval);
  }, [connStatus, sessionId, userId, latency, packetLoss, bandwidth]);

  /**
   * Classifies network connection quality into human-readable tiers with color coding.
   */
  const getSignalQuality = (): SignalQuality => {
    if (latency < 60 && packetLoss < 0.5 && bandwidth >= 3) return { label: 'Excellent', color: 'text-emerald-400', dot: 'bg-emerald-400' };
    if (latency < 100 && packetLoss < 1.5 && bandwidth >= 1.5) return { label: 'Good', color: 'text-blue-400', dot: 'bg-blue-400' };
    if (latency < 150 && packetLoss < 3 && bandwidth >= 0.8) return { label: 'Fair', color: 'text-amber-400', dot: 'bg-amber-400' };
    return { label: 'Poor', color: 'text-rose-400', dot: 'bg-rose-400' };
  };

  return {
    connStatus, connLogs, retryCount, livekitUrl, isMockMode,
    latency, packetLoss, bandwidth,
    signal: getSignalQuality(),
  };
}
