/**
 * @file useProctoring.ts (Edge AI Video Proctoring & Computer Vision Hook)
 * @description Advanced client-side computer vision hook implementing automated proctoring
 * directly within the candidate's browser without sending raw video feeds to external servers.
 *
 * Vision Capabilities:
 * 1. Face & Gaze Tracking: Powered by @mediapipe/tasks-vision (FaceLandmarker).
 *    Monitors 478 face mesh landmarks, pupil iris deviation (468/473), and alerts if looking away (>3s)
 *    or disappearing from frame (>4s).
 * 2. Object & Multi-Person Detection: Powered by @tensorflow-models/coco-ssd.
 *    Throttled to run every 1.5s; flags prohibited devices (e.g. smartphones) and multiple people in frame.
 * 3. Graceful Fallback / Resilience: Bounded 4.5-second model load race ensuring slow CDN connections
 *    or low-end GPUs degrade cleanly into standard interview mode rather than blocking the candidate.
 *
 * Used by: VideoPanel
 */

import { useState, useRef, useEffect, useCallback, RefObject } from 'react';

/**
 * Interface representing the state and control handles returned by the proctoring hook.
 */
interface ProctoringResult {
  /** Whether edge ML vision models have finished loading */
  modelsLoaded: boolean;
  /** True if running in graceful fallback mode (low-spec GPU or CDN timeout) */
  isDegraded: boolean;
  /** Active warning message to display on the video overlay */
  activeWarning: string | null;
  /** Non-fatal diagnostic error message encountered during model setup */
  proctorError: string | null;
  /** Whether virtual background blur is enabled */
  backgroundBlur: boolean;
  /** State setter for background blur toggle */
  setBackgroundBlur: (v: boolean | ((prev: boolean) => boolean)) => void;
  /** Performance warning string if background segmentation drops below threshold */
  blurPerformanceWarning: string | null;
  /** State setter for background blur warning */
  setBlurPerformanceWarning: (v: string | null) => void;
  /** Canvas ref used for face mesh overlays and video processing */
  canvasRef: RefObject<HTMLCanvasElement | null>;
}

/**
 * useProctoring Hook.
 *
 * @param videoRef - HTMLVideoElement displaying the candidate's live camera feed
 * @param stream - Active MediaStream containing the camera track
 * @param isActive - True if interview session is in progress
 * @param videoActive - True if camera video track is unmuted
 * @param onProctorViolation - Callback notifying parent interview studio of proctoring warnings
 * @param addLog - Logging callback for device/diagnostic logs
 */
export function useProctoring(
  videoRef: RefObject<HTMLVideoElement | null>,
  stream: MediaStream | null,
  isActive: boolean,
  videoActive: boolean,
  onProctorViolation?: (type: string, message: string) => void,
  addLog?: (msg: string) => void,
): ProctoringResult {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [isDegraded, setIsDegraded] = useState(false);
  const [activeWarning, setActiveWarning] = useState<string | null>(null);
  const [proctorError, setProctorError] = useState<string | null>(null);
  const [backgroundBlur, setBackgroundBlur] = useState(false);
  const [blurPerformanceWarning, setBlurPerformanceWarning] = useState<string | null>(null);

  // Machine learning model refs
  const landmarkerRef = useRef<any>(null);
  const detectorRef = useRef<any>(null);

  // Drawing canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const blurDurationsRef = useRef<number[]>([]);
  const requestRef = useRef<number | null>(null);

  // Timers and violation debouncers
  const lastObjectDetectionTime = useRef(0);
  const lookAwayStart = useRef<number | null>(null);
  const noPersonStart = useRef<number | null>(null);
  const phoneDetectionCount = useRef(0);
  const multiPersonDetectionCount = useRef(0);
  const prevWarningRef = useRef<string | null>(null);

  const log = useCallback((msg: string) => addLog?.(msg), [addLog]);

  /**
   * Resilient Model Initialization Effect:
   * Dynamically imports TensorFlow.js, COCO-SSD, and MediaPipe Vision tasks in parallel.
   * Enforces a 4.5-second timeout race: if CDN downloads stall, the hook cleanly degrades
   * to standard mode so the candidate is never locked out of their interview.
   */
  useEffect(() => {
    let active = true;

    async function loadModels() {
      try {
        log('Initializing Proctoring subsystem...');

        // 4.5-second timeout race: Never allow external CDN downloads to block the candidate
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Proctoring model download timed out (fallback to standard)')), 4500)
        );

        const modelLoadPromise = (async () => {
          // Step 1: Import all JS modules in parallel
          const [vision, tf, cocoSsd] = await Promise.all([
            import('@mediapipe/tasks-vision'),
            import('@tensorflow/tfjs'),
            import('@tensorflow-models/coco-ssd'),
          ]);
          await tf.ready();
          if (!active) return;

          log('Loading edge AI vision models...');

          // Step 2: Download WASM fileset + both ML models in parallel
          const filesetPromise = vision.FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm',
          );
          const cocoPromise = cocoSsd.load({ base: 'lite_mobilenet_v2' });

          const [filesetResolver, detector] = await Promise.all([filesetPromise, cocoPromise]);
          if (!active) return;
          detectorRef.current = detector;

          // Step 3: Instantiate FaceLandmarker (attempt GPU delegate first, fallback to CPU)
          let landmarker;
          try {
            landmarker = await vision.FaceLandmarker.createFromOptions(filesetResolver, {
              baseOptions: {
                modelAssetPath:
                  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                delegate: 'GPU',
              },
              outputFaceBlendshapes: false,
              runningMode: 'VIDEO',
            });
          } catch {
            log('GPU delegate fallback to CPU for face tracker...');
            landmarker = await vision.FaceLandmarker.createFromOptions(filesetResolver, {
              baseOptions: {
                modelAssetPath:
                  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                delegate: 'CPU',
              },
              outputFaceBlendshapes: false,
              runningMode: 'VIDEO',
            });
          }
          if (!active) return;
          landmarkerRef.current = landmarker;
        })();

        await Promise.race([modelLoadPromise, timeoutPromise]);

        if (active) {
          setModelsLoaded(true);
          setIsDegraded(false);
          log('Proctor AI edge models active.');
        }
      } catch (err: any) {
        if (!active) return;
        console.warn('Proctoring advanced ML fallback enabled:', err.message);
        setProctorError(err.message || String(err));
        // Dismiss loading state to unblock camera feed and allow normal interview
        setModelsLoaded(true);
        setIsDegraded(true);
        log(`Proctor running in standard mode (${err.message || 'fallback'})`);
      }
    }

    loadModels();
    return () => {
      active = false;
      landmarkerRef.current?.close();
    };
  }, [log]);

  /**
   * Real-Time Video Frame Analysis Loop:
   * Runs via requestAnimationFrame. Performs:
   * 1. Face presence and gaze angle calculation per frame.
   * 2. Throttled object detection (phones, other people) every 1.5s.
   * 3. Debounces repeated violation alerts before calling onProctorViolation.
   */
  useEffect(() => {
    if (!isActive || !videoActive || !stream || !modelsLoaded || isDegraded) return;

    let isRunning = true;

    async function processFrame() {
      if (!isRunning) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      // Ensure video element has enough decoded frames
      if (!video || !canvas || video.readyState < 2) {
        requestRef.current = requestAnimationFrame(processFrame);
        return;
      }

      const now = performance.now();
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let currentWarning: string | null = null;

      try {
        // ── 1. Face landmarks and gaze estimation ──
        if (landmarkerRef.current) {
          const results = landmarkerRef.current.detectForVideo(video, now);
          if (results && results.faceLandmarks && results.faceLandmarks.length > 0) {
            noPersonStart.current = null;
            const landmarks = results.faceLandmarks[0];

            // Estimate gaze from pupil / iris landmarks (468: left iris center, 473: right iris center)
            if (landmarks.length >= 474) {
              const leftEye = landmarks[468];
              const rightEye = landmarks[473];
              const noseTip = landmarks[1];

              // Horizontal gaze deviation relative to nose bridge center
              const eyeMidX = (leftEye.x + rightEye.x) / 2;
              const deviation = Math.abs(eyeMidX - noseTip.x);

              // Significant sustained look-away (>3000ms)
              if (deviation > 0.08) {
                if (!lookAwayStart.current) lookAwayStart.current = now;
                if (now - lookAwayStart.current > 3000) {
                  currentWarning = 'Please look directly at the screen';
                }
              } else {
                lookAwayStart.current = null;
              }
            }
          } else {
            // No face detected in frame (>4000ms threshold)
            if (!noPersonStart.current) noPersonStart.current = now;
            if (now - noPersonStart.current > 4000) {
              currentWarning = 'Candidate not detected in frame';
            }
          }
        }

        // ── 2. Object detection (phones / secondary participants) - throttled every 1.5s ──
        if (detectorRef.current && now - lastObjectDetectionTime.current > 1500) {
          lastObjectDetectionTime.current = now;
          const predictions = await detectorRef.current.detect(video);

          let cellPhoneFound = false;
          let peopleCount = 0;

          for (const p of predictions) {
            if (p.class === 'cell phone' && p.score > 0.55) {
              cellPhoneFound = true;
            }
            if (p.class === 'person' && p.score > 0.6) {
              peopleCount++;
            }
          }

          // Debounce phone detection: requires 2 consecutive detections
          if (cellPhoneFound) {
            phoneDetectionCount.current++;
            if (phoneDetectionCount.current >= 2) {
              currentWarning = 'Prohibited device detected (phone)';
            }
          } else {
            phoneDetectionCount.current = 0;
          }

          // Debounce multiple people detection: requires 2 consecutive detections
          if (peopleCount > 1) {
            multiPersonDetectionCount.current++;
            if (multiPersonDetectionCount.current >= 2) {
              currentWarning = 'Multiple people detected in frame';
            }
          } else {
            multiPersonDetectionCount.current = 0;
          }
        }

        // ── 3. Dispatch warning notifications ──
        if (currentWarning) {
          setActiveWarning(currentWarning);
          if (currentWarning !== prevWarningRef.current) {
            prevWarningRef.current = currentWarning;
            onProctorViolation?.('proctor_warning', currentWarning);
          }
        } else {
          setActiveWarning(null);
          prevWarningRef.current = null;
        }
      } catch (err) {
        // Suppress individual frame processing errors to prevent video freezing
      }

      requestRef.current = requestAnimationFrame(processFrame);
    }

    requestRef.current = requestAnimationFrame(processFrame);

    return () => {
      isRunning = false;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isActive, videoActive, stream, modelsLoaded, isDegraded, onProctorViolation, videoRef]);

  return {
    modelsLoaded,
    isDegraded,
    activeWarning,
    proctorError,
    backgroundBlur,
    setBackgroundBlur,
    blurPerformanceWarning,
    setBlurPerformanceWarning,
    canvasRef,
  };
}
