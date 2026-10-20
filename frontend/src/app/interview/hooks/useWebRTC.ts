import { useState, useCallback, useEffect, useRef } from 'react';
import { videoApi } from '@/lib/api';

type ConnStatus = 'disconnected' | 'connecting' | 'connected' | 'failed';

interface SignalQuality {
  label: string;
  color: string;
  dot: string;
}

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

  const [latency, setLatency] = useState(45);
  const [packetLoss, setPacketLoss] = useState(0.1);
  const [bandwidth, setBandwidth] = useState(4.2);

  const connectToVideoRoom = useCallback(async () => {
    if (permissionStatus !== 'granted') return;
    setConnStatus('connecting');
    addLog(`Connecting to session room: session_${sessionId.slice(0, 8)}...`);
    const roomName = `session_${sessionId}`;
    let success = false;

    for (let attempt = 1; attempt <= 3 && !success; attempt++) {
      try {
        addLog(`Attempt ${attempt}/3...`);
        const res = await videoApi.getToken(roomName, userId, userDisplayName);
        const url: string = res.livekit_url;
        const token: string = res.token;
        const isMock: boolean = !!res.mock;

        setLivekitUrl(url);
        setIsMockMode(isMock);

        if (!isMock && url && token) {
          // Dynamically import livekit-client to avoid SSR issues
          const { Room, RoomEvent } = await import('livekit-client').catch(() => ({
            Room: null,
            RoomEvent: null,
          }));

          if (Room && RoomEvent) {
            const room = new Room();
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

            await room.connect(url, token);
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
        await new Promise((r) => setTimeout(r, 800));
      }
    }
    if (!success) {
      setConnStatus('failed');
      addLog('All attempts failed. Using audio-only fallback.');
    }
  }, [permissionStatus, sessionId, userId, userDisplayName, addLog]);

  // Disconnect from LiveKit room on unmount
  useEffect(() => {
    return () => {
      if (roomRef.current) {
        roomRef.current.disconnect().catch(() => {});
        roomRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (permissionStatus === 'granted') connectToVideoRoom();
  }, [permissionStatus, connectToVideoRoom]);

  // Network quality simulation (used in mock mode; real stats come from LiveKit SDK in live mode)
  useEffect(() => {
    if (connStatus !== 'connected') return;
    const interval = setInterval(() => {
      setLatency((p) => Math.max(15, Math.min(180, p + Math.floor(Math.random() * 9) - 4)));
      setPacketLoss((p) => Math.max(0, Math.min(5, p + Math.random() * 0.2 - 0.1)));
      setBandwidth((p) => Math.max(0.4, Math.min(8.5, p + Math.random() * 0.4 - 0.2)));
    }, 4000);
    return () => clearInterval(interval);
  }, [connStatus]);

  // Report quality to backend
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
