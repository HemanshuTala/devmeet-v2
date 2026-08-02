import { useState, useRef, useCallback, useEffect } from 'react';

type PermissionStatus = 'prompt' | 'checking' | 'granted' | 'denied';

interface MediaDevice {
  deviceId: string;
  label: string;
  kind: string;
}

export function useMediaStream(addLog: (msg: string) => void) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('prompt');
  const [videoActive, setVideoActive] = useState(true);
  const [audioActive, setAudioActive] = useState(true);
  const [useAudioOnly, setUseAudioOnly] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [videoDevices, setVideoDevices] = useState<MediaDevice[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDevice[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState('');
  const [selectedAudioId, setSelectedAudioId] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);

  const getPermissionInstructions = useCallback(() => {
    if (typeof window === 'undefined') return 'Permissions denied.';
    const ua = navigator.userAgent;
    let browser = 'Chrome';
    let os = 'Windows';
    if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
    else if (ua.includes('Edg')) browser = 'Edge';
    if (ua.includes('Mac')) os = 'macOS';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
    else if (ua.includes('Android')) os = 'Android';

    if (os === 'iOS') return 'Go to Settings > Privacy > Camera/Microphone and ensure Safari has access.';
    if (os === 'Android') return 'Tap the site settings lock/settings icon next to the URL bar, and set Camera and Mic to "Allow".';
    if (browser === 'Safari') return 'Click Safari menu > Settings for This Website... > Set Camera and Microphone to "Allow".';
    if (browser === 'Firefox') return 'Click the permissions indicator to the left of the URL bar, remove blocks, and reload.';
    if (browser === 'Edge') return 'Click the lock icon in the address bar, enable Camera/Microphone access, and refresh.';
    return 'Click the camera/lock icon in the browser address bar, set permissions to Allow, and refresh.';
  }, []);

  const requestPermissions = useCallback(async () => {
    setPermissionStatus('checking');
    setErrorMessage(null);
    addLog('Requesting camera & microphone access...');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('MediaDevices API not supported.');
      const localStream = await navigator.mediaDevices.getUserMedia({
        video: !useAudioOnly ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
        audio: true,
      });
      setStream(localStream);
      setPermissionStatus('granted');
      addLog('Camera & microphone access granted.');
    } catch (err: any) {
      setPermissionStatus('denied');
      setErrorMessage(err.message || 'Permission denied.');
      addLog(`Error: ${err.message || 'Permission denied'}`);
    }
  }, [useAudioOnly, addLog]);

  // Auto-request on mount
  useEffect(() => { requestPermissions(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Bind stream to video element
  useEffect(() => {
    if (!stream) return;
    const el = videoRef.current;
    if (el) { el.srcObject = stream; el.play().catch(() => {}); }
  }, [stream, permissionStatus]);

  // Enumerate devices
  useEffect(() => {
    if (permissionStatus !== 'granted') return;
    async function getDevices() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setVideoDevices(devices.filter((d) => d.kind === 'videoinput') as MediaDevice[]);
        setAudioDevices(devices.filter((d) => d.kind === 'audioinput') as MediaDevice[]);
        if (stream) {
          const vTrack = stream.getVideoTracks()[0];
          const aTrack = stream.getAudioTracks()[0];
          if (vTrack?.getSettings().deviceId) setSelectedVideoId(vTrack.getSettings().deviceId!);
          if (aTrack?.getSettings().deviceId) setSelectedAudioId(aTrack.getSettings().deviceId!);
        }
      } catch (err) { console.warn('Failed to enumerate media devices:', err); }
    }
    getDevices();
    navigator.mediaDevices.addEventListener('devicechange', getDevices);
    return () => { navigator.mediaDevices.removeEventListener('devicechange', getDevices); };
  }, [permissionStatus, stream]);

  // Cleanup on unmount
  useEffect(() => () => { stream?.getTracks().forEach((t) => t.stop()); }, [stream]);

  const changeVideoDevice = async (deviceId: string) => {
    setSelectedVideoId(deviceId);
    addLog(`Switching camera to device ${deviceId.slice(0, 8)}...`);
    if (!stream) return;
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: selectedAudioId ? { deviceId: { exact: selectedAudioId } } : true,
      });
      stream.getTracks().forEach((t) => t.stop());
      setStream(newStream);
      setVideoActive(true);
      setAudioActive(true);
      addLog('Camera switched successfully.');
    } catch (err: any) {
      addLog(`Failed to switch camera: ${err.message}`);
      setErrorMessage(`Camera change failed: ${err.message}`);
    }
  };

  const changeAudioDevice = async (deviceId: string) => {
    setSelectedAudioId(deviceId);
    addLog(`Switching microphone to device ${deviceId.slice(0, 8)}...`);
    if (!stream) return;
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: selectedVideoId ? { deviceId: { exact: selectedVideoId } } : { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { deviceId: { exact: deviceId } },
      });
      stream.getTracks().forEach((t) => t.stop());
      setStream(newStream);
      setVideoActive(true);
      setAudioActive(true);
      addLog('Microphone switched successfully.');
    } catch (err: any) {
      addLog(`Failed to switch microphone: ${err.message}`);
      setErrorMessage(`Microphone change failed: ${err.message}`);
    }
  };

  const toggleVideo = () => {
    if (!stream) return;
    const vt = stream.getVideoTracks()[0];
    if (vt) { vt.enabled = !vt.enabled; setVideoActive(vt.enabled); }
  };

  const toggleAudio = () => {
    if (!stream) return;
    const at = stream.getAudioTracks()[0];
    if (at) { at.enabled = !at.enabled; setAudioActive(at.enabled); }
  };

  return {
    stream, videoRef, permissionStatus, videoActive, audioActive, useAudioOnly,
    errorMessage, videoDevices, audioDevices, selectedVideoId, selectedAudioId,
    setUseAudioOnly, requestPermissions, getPermissionInstructions,
    changeVideoDevice, changeAudioDevice, toggleVideo, toggleAudio,
  };
}
