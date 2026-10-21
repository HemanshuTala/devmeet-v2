/**
 * @file useSessionRecorder.ts
 * @description Hook managing in-browser MediaRecorder interview session capture,
 * real-time duration tracking, consent-gated start/stop, and automated video blob upload
 * to the DevMeet Video Service backend for persistent storage and replay.
 *
 * Used by: VideoPanel
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { videoApi } from '@/lib/api';

interface UseSessionRecorderProps {
  sessionId: string;
  userId: string;
  stream: MediaStream | null;
  userPlan: string;
  addLog: (msg: string) => void;
}

export function useSessionRecorder({
  sessionId,
  userId,
  stream,
  userPlan,
  addLog,
}: UseSessionRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Pick best available MIME type for the browser
  const getSupportedMimeType = (): string => {
    if (typeof MediaRecorder === 'undefined') return 'video/webm';
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4',
    ];
    for (const type of candidates) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return 'video/webm';
  };

  /**
   * Starts video & audio recording of the candidate stream.
   */
  const startRecording = useCallback(async () => {
    if (!stream) {
      addLog('Cannot start recording: No active media stream available.');
      return;
    }

    if (userPlan === 'free') {
      addLog('Recording is restricted to Pro and Enterprise tiers.');
      return;
    }

    const roomName = `session_${sessionId}`;

    try {
      // 1. Notify backend recording start with explicit consent
      await videoApi.startRecording(roomName, userId, true);

      // 2. Instantiate browser MediaRecorder
      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 1500000, // 1.5 Mbps bitrate
      });

      chunksRef.current = [];

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const recordedBlob = new Blob(chunksRef.current, { type: mimeType });
        const sizeMb = (recordedBlob.size / (1024 * 1024)).toFixed(2);
        addLog(`Recording captured (${sizeMb} MB). Uploading to video storage...`);

        setIsUploading(true);
        try {
          const uploadRes = await videoApi.uploadRecording(
            roomName,
            recordedBlob,
            `${roomName}.webm`
          );
          await videoApi.stopRecording(roomName, userId);

          const playUrl = uploadRes.playback_url || videoApi.getRecordingPlayUrl(roomName);
          setRecordingUrl(playUrl);
          addLog('Recording successfully uploaded and stored on server.');
        } catch (uploadErr: any) {
          addLog(`Failed to upload recording: ${uploadErr.message}`);
        } finally {
          setIsUploading(false);
        }
      };

      // Start recording with 1-second timeslices
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingDuration(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

      addLog(`Session recording started (${mimeType}).`);
    } catch (err: any) {
      addLog(`Failed to start recording: ${err.message}`);
    }
  }, [sessionId, userId, stream, userPlan, addLog]);

  /**
   * Stops recording and initiates server upload.
   */
  const stopRecording = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    setIsRecording(false);
    addLog('Recording stopped. Finalizing video package...');
  }, [addLog]);

  // Clean up on unmount or navigation
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  return {
    isRecording,
    isUploading,
    recordingDuration,
    recordingUrl,
    startRecording,
    stopRecording,
  };
}
